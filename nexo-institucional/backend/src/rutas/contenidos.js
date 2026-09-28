"use strict";

const { Router } = require("express");
const { requerirSesion } = require("../auth");
const { crear } = require("../errores");
const contenidos = require("../servicios/contenidos");
const usuarios = require("../servicios/usuarios");
const sitios = require("../servicios/sitios");
const adjuntos = require("../servicios/adjuntos");

const router = Router();
router.use(requerirSesion);

/* ---------- Sitios (las páginas institucionales) ---------- */

router.get("/sitios", async (req, res) => {
  res.json(await sitios.listar());
});

/* ---------- Equipo y roles ---------- */

router.get("/usuarios", async (req, res) => {
  res.json(await usuarios.listar());
});

router.patch("/usuarios/:id/rol", async (req, res) => {
  const rol = req.body && typeof req.body.rol === "string" ? req.body.rol : "";
  res.json(await usuarios.cambiarRol(req.usuario, req.params.id, rol));
});

router.post("/usuarios", async (req, res) => {
  const creado = await usuarios.altaUsuario(req.usuario, req.body || {});
  res.status(201).json(creado);
});

/* ---------- Contenidos ---------- */

/** El formulario viaja como multipart (campo "datos" en JSON + archivos) o como JSON puro. */
function leerEntrada(req) {
  if (!req.is("multipart/form-data")) return req.body || {};
  try {
    return JSON.parse(req.body.datos || "{}");
  } catch (e) {
    throw crear("datos_invalidos", "Los datos del formulario no son válidos.");
  }
}

/** Ejecuta la operación con los archivos subidos y los borra si algo falla. */
async function conArchivos(req, operacion) {
  const subidos = req.files || [];
  try {
    const validos = await adjuntos.validarArchivos(subidos);
    return await operacion(validos);
  } catch (error) {
    await adjuntos.descartar(subidos);
    throw error;
  }
}

router.get("/contenidos", async (req, res) => {
  res.json(await contenidos.listar());
});

router.post("/contenidos", adjuntos.subida, async (req, res) => {
  const entrada = leerEntrada(req);
  const creado = await conArchivos(req, (validos) => contenidos.crearContenido(req.usuario, entrada, validos));
  res.status(201).json(creado);
});

router.post("/contenidos/:id/versiones", adjuntos.subida, async (req, res) => {
  const entrada = leerEntrada(req);
  const actualizado = await conArchivos(req, (validos) =>
    contenidos.enviarNuevaVersion(req.usuario, req.params.id, entrada, validos, entrada.conservar));
  res.status(201).json(actualizado);
});

router.post("/contenidos/:id/decision", async (req, res) => {
  res.json(await contenidos.decidir(req.usuario, req.params.id, req.body || {}));
});

router.post("/contenidos/:id/publicar", async (req, res) => {
  res.json(await contenidos.publicar(req.usuario, req.params.id));
});

router.post("/contenidos/:id/archivar", async (req, res) => {
  res.json(await contenidos.archivar(req.usuario, req.params.id, (req.body || {}).motivo));
});

router.post("/contenidos/:id/restaurar", async (req, res) => {
  res.json(await contenidos.restaurar(req.usuario, req.params.id));
});

/* ---------- Ver o descargar adjuntos (requiere sesión) ---------- */

router.get("/adjuntos/:id", async (req, res) => {
  const archivo = await adjuntos.buscarParaDescarga(req.params.id, { soloPublicados: false });
  adjuntos.enviarArchivo(res, archivo, { forzarDescarga: req.query.descarga === "1" });
});

module.exports = router;
