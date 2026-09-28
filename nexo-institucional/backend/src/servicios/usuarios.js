"use strict";

const { consultar, ejecutar, transaccion } = require("../db");
const { crear } = require("../errores");
const { ROLES, exigir } = require("../permisos");
const { hashPassword, usuarioPublico, validarPassword } = require("../auth");

async function listar() {
  const filas = await consultar("select * from usuarios where activo = 1 order by id");
  return filas.map(usuarioPublico);
}

async function cambiarRol(actor, usuarioId, rol) {
  exigir(actor, "roles");
  if (!ROLES.includes(rol)) throw crear("datos_invalidos", "El rol indicado no existe.");
  const id = Number(usuarioId);
  if (!Number.isInteger(id) || id <= 0) throw crear("no_encontrado", "La persona no existe.");

  return transaccion(async (conexion) => {
    const [objetivo] = await consultar("select * from usuarios where id = ? and activo = 1 for update", [id], conexion);
    if (!objetivo) throw crear("no_encontrado", "La persona no existe.");

    if (objetivo.rol === "administrador" && rol !== "administrador") {
      const admins = await consultar(
        "select id from usuarios where rol = 'administrador' and activo = 1 for update", [], conexion
      );
      if (admins.length <= 1) throw crear("regla_negocio", "Tiene que quedar al menos un administrador.");
    }

    await ejecutar("update usuarios set rol = ? where id = ?", [rol, id], conexion);
    const [actualizado] = await consultar("select * from usuarios where id = ?", [id], conexion);
    return usuarioPublico(actualizado);
  });
}

/** Alta de una persona desde el panel: solo el administrador. */
async function altaUsuario(actor, datos) {
  exigir(actor, "roles");
  return crearUsuario(datos);
}

/** Alta de una persona (la usan altaUsuario y los scripts de la carpeta backend/scripts). */
async function crearUsuario({ nombre, email, password, rol = "observador" }) {
  const nombreLimpio = String(nombre || "").trim();
  const correo = String(email || "").trim().toLowerCase();
  if (!nombreLimpio || nombreLimpio.length > 120) throw crear("datos_invalidos", "Indicá el nombre (hasta 120 caracteres).");
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(correo) || correo.length > 160) throw crear("datos_invalidos", "El correo no es válido.");
  if (!ROLES.includes(rol)) throw crear("datos_invalidos", "El rol indicado no existe.");
  validarPassword(password);

  const hash = await hashPassword(password);
  try {
    const r = await ejecutar(
      "insert into usuarios (nombre, email, password_hash, rol, creado_en) values (?, ?, ?, ?, utc_timestamp())",
      [nombreLimpio, correo, hash, rol]
    );
    const [fila] = await consultar("select * from usuarios where id = ?", [r.insertId]);
    return usuarioPublico(fila);
  } catch (error) {
    if (error.code === "ER_DUP_ENTRY") throw crear("datos_invalidos", "Ya existe una persona con ese correo.");
    throw error;
  }
}

module.exports = { listar, cambiarRol, crearUsuario, altaUsuario };
