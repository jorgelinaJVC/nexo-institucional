"use strict";

const { Router } = require("express");
const { crear } = require("../errores");
const { listarPublicaciones, obtenerPublicacion } = require("../repositorio");
const { buscarParaDescarga, enviarArchivo } = require("../servicios/adjuntos");
const sitios = require("../servicios/sitios");

const router = Router();

// Sin sesión: cada página institucional la usa para saber su propio nombre/slug si lo necesita.
router.get("/sitios", async (req, res) => {
  res.json(await sitios.listar());
});

// La vista pública nunca expone autores, historial ni contenido sin publicar.
// Siempre acotada a un sitio: cada página institucional solo ve lo suyo.
router.get("/:sitio/publicaciones", async (req, res) => {
  const tipo = typeof req.query.tipo === "string" ? req.query.tipo : undefined;
  res.json(await listarPublicaciones({ sitioSlug: req.params.sitio, tipo }));
});

router.get("/:sitio/publicaciones/:slug", async (req, res) => {
  const publicacion = await obtenerPublicacion(req.params.sitio, req.params.slug);
  if (!publicacion) throw crear("no_encontrado", "La publicación no existe o ya no está disponible.");
  res.json(publicacion);
});

// Solo se descargan adjuntos de la versión publicada, y del sitio al que pertenecen.
router.get("/:sitio/adjuntos/:id", async (req, res) => {
  const archivo = await buscarParaDescarga(req.params.id, { soloPublicados: true, sitioSlug: req.params.sitio });
  enviarArchivo(res, archivo, { forzarDescarga: req.query.descarga === "1" });
});

module.exports = router;
