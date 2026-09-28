"use strict";

const crypto = require("node:crypto");
const bcrypt = require("bcryptjs");
const config = require("./config");
const { consultar, ejecutar } = require("./db");
const { crear } = require("./errores");

const COOKIE = "nexo_sesion";
const iso = (fecha) => (fecha ? new Date(fecha).toISOString() : null);
const hashToken = (token) => crypto.createHash("sha256").update(token).digest("hex");

/* ---------- Contraseñas ---------- */

function validarPassword(password) {
  if (typeof password !== "string" || password.length < 10) {
    throw crear("datos_invalidos", "La contraseña debe tener al menos 10 caracteres.");
  }
  if (Buffer.byteLength(password) > 72) {
    throw crear("datos_invalidos", "La contraseña no puede superar los 72 bytes.");
  }
}

const hashPassword = (password) => bcrypt.hash(password, config.costoBcrypt);

// Hash de relleno: así el tiempo de respuesta no delata si el correo existe.
let hashRelleno = null;
async function obtenerRelleno() {
  hashRelleno ??= await bcrypt.hash(crypto.randomBytes(8).toString("hex"), config.costoBcrypt);
  return hashRelleno;
}

/* ---------- Límite de intentos de inicio de sesión ---------- */

const fallos = new Map(); // clave -> { cantidad, desde }

function verificarLimite(clave) {
  const registro = fallos.get(clave);
  if (!registro) return;
  if (Date.now() - registro.desde > config.intentosLogin.ventanaMs) {
    fallos.delete(clave);
    return;
  }
  if (registro.cantidad >= config.intentosLogin.maximo) {
    throw crear("demasiados_intentos", "Demasiados intentos fallidos. Probá de nuevo en unos minutos.");
  }
}

function registrarFallo(clave) {
  const registro = fallos.get(clave) || { cantidad: 0, desde: Date.now() };
  registro.cantidad += 1;
  fallos.set(clave, registro);
}

const reiniciarLimites = () => fallos.clear();

/* ---------- Sesiones ---------- */

function usuarioPublico(fila) {
  return {
    id: String(fila.id),
    nombre: fila.nombre,
    email: fila.email,
    rol: fila.rol,
    ultimoAcceso: iso(fila.ultimo_acceso),
  };
}

async function iniciarSesion(email, password, ip) {
  const correo = String(email || "").trim().toLowerCase();
  const clave = `${ip}|${correo}`;
  verificarLimite(clave);

  const [usuario] = await consultar("select * from usuarios where email = ? and activo = 1", [correo]);
  const coincide = password.length <= 200
    && await bcrypt.compare(password, usuario ? usuario.password_hash : await obtenerRelleno());

  if (!usuario || !coincide) {
    registrarFallo(clave);
    throw crear("credenciales", "Correo o contraseña incorrectos.");
  }
  fallos.delete(clave);

  await ejecutar("delete from sesiones where expira_en < utc_timestamp()");
  await ejecutar("update usuarios set ultimo_acceso = utc_timestamp() where id = ?", [usuario.id]);

  const token = crypto.randomBytes(32).toString("base64url");
  await ejecutar(
    "insert into sesiones (usuario_id, token_hash, expira_en, creado_en) values (?, ?, date_add(utc_timestamp(), interval ? hour), utc_timestamp())",
    [usuario.id, hashToken(token), config.sesionHoras]
  );

  const [actualizado] = await consultar("select * from usuarios where id = ?", [usuario.id]);
  return { usuario: usuarioPublico(actualizado), token };
}

async function usuarioDesdeToken(token) {
  if (!token) return null;
  const [fila] = await consultar(
    `select u.* from sesiones s
       join usuarios u on u.id = s.usuario_id
      where s.token_hash = ? and s.expira_en > utc_timestamp() and u.activo = 1`,
    [hashToken(token)]
  );
  return fila ? usuarioPublico(fila) : null;
}

async function cerrarSesion(token) {
  if (token) await ejecutar("delete from sesiones where token_hash = ?", [hashToken(token)]);
}

/** Cambia la contraseña de la propia cuenta: exige verificar la actual. */
async function cambiarPassword(usuarioId, actual, nueva) {
  const actualTexto = typeof actual === "string" ? actual : "";
  if (!actualTexto) throw crear("datos_invalidos", "Ingresá tu contraseña actual.");

  const [usuario] = await consultar("select * from usuarios where id = ? and activo = 1", [usuarioId]);
  if (!usuario) throw crear("sin_sesion", "Tu sesión expiró. Volvé a ingresar.");

  const coincide = actualTexto.length <= 200 && await bcrypt.compare(actualTexto, usuario.password_hash);
  if (!coincide) throw crear("credenciales", "La contraseña actual no es correcta.");

  validarPassword(nueva);
  if (nueva === actualTexto) throw crear("datos_invalidos", "La contraseña nueva tiene que ser distinta de la actual.");

  await ejecutar("update usuarios set password_hash = ? where id = ?", [await hashPassword(nueva), usuarioId]);
}

/* ---------- Cookies y middleware ---------- */

function leerCookie(req, nombre) {
  const cabecera = req.headers.cookie;
  if (!cabecera) return null;
  for (const par of cabecera.split(";")) {
    const [clave, ...resto] = par.trim().split("=");
    if (clave === nombre) return decodeURIComponent(resto.join("="));
  }
  return null;
}

function cookieSesion(token) {
  const atributos = [`${COOKIE}=${token}`, "Path=/", "HttpOnly", "SameSite=Lax", `Max-Age=${config.sesionHoras * 3600}`];
  if (config.produccion) atributos.push("Secure");
  return atributos.join("; ");
}

const cookieVencida = () => `${COOKIE}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0`;

/** Carga req.usuario (o null) a partir de la cookie de sesión. */
async function cargarUsuario(req, res, next) {
  const token = leerCookie(req, COOKIE);
  req.token = token;
  req.usuario = await usuarioDesdeToken(token);
  next();
}

function requerirSesion(req, res, next) {
  if (!req.usuario) throw crear("sin_sesion", "Tu sesión expiró. Volvé a ingresar.");
  next();
}

/** Defensa extra contra CSRF: en pedidos que modifican datos, el Origin debe ser este mismo sitio. */
function verificarOrigen(req, res, next) {
  if (["GET", "HEAD", "OPTIONS"].includes(req.method)) return next();
  const origen = req.get("origin");
  if (origen) {
    let host = null;
    try { host = new URL(origen).host; } catch (e) { /* origen ilegible */ }
    if (host !== req.get("host")) throw crear("origen_invalido", "Origen no permitido.");
  }
  return next();
}

module.exports = {
  validarPassword, hashPassword, iniciarSesion, cerrarSesion, cambiarPassword, usuarioPublico,
  cookieSesion, cookieVencida, cargarUsuario, requerirSesion, verificarOrigen, reiniciarLimites,
};
