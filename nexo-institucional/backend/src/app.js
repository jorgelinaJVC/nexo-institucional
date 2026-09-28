"use strict";

const path = require("path");
const express = require("express");
const helmet = require("helmet");
const multer = require("multer");
const config = require("./config");
const auth = require("./auth");
const db = require("./db");
const { ErrorApp } = require("./errores");

const rutasAuth = require("./rutas/auth");
const rutasPublico = require("./rutas/publico");
const rutasContenidos = require("./rutas/contenidos");

const MENSAJES_MULTER = {
  LIMIT_FILE_SIZE: "Un archivo supera el máximo de 10 MB.",
  LIMIT_FILE_COUNT: "Se permiten hasta 8 adjuntos por versión.",
  LIMIT_UNEXPECTED_FILE: "Los archivos deben enviarse en el campo «adjuntos».",
};

function manejarErrores(error, req, res, next) {
  if (res.headersSent) return next(error);

  if (error instanceof ErrorApp) {
    return res.status(error.estado).json({ error: { codigo: error.codigo, mensaje: error.message } });
  }
  if (error instanceof multer.MulterError) {
    const mensaje = MENSAJES_MULTER[error.code] || "No se pudieron procesar los archivos.";
    return res.status(400).json({ error: { codigo: "datos_invalidos", mensaje } });
  }
  if (error.type === "entity.parse.failed" || error.type === "entity.too.large") {
    return res.status(400).json({ error: { codigo: "datos_invalidos", mensaje: "El pedido no tiene un formato válido." } });
  }

  console.error(error);
  return res.status(500).json({ error: { codigo: "error_interno", mensaje: "Ocurrió un error inesperado. Probá de nuevo." } });
}

function crearApp() {
  const app = express();
  app.disable("x-powered-by");

  // Cabeceras de seguridad. Se permiten las fuentes de Google que usa el diseño.
  const directivas = helmet.contentSecurityPolicy.getDefaultDirectives();
  delete directivas["upgrade-insecure-requests"]; // el sitio también corre en http://localhost
  app.use(helmet({
    contentSecurityPolicy: { directives: directivas },
    strictTransportSecurity: config.produccion,
  }));

  // API
  app.use("/api", auth.verificarOrigen, express.json({ limit: "400kb" }), auth.cargarUsuario);
  app.get("/api/salud", (req, res) => res.json({ ok: true }));
  app.use("/api/auth", rutasAuth);
  app.use("/api/publico", rutasPublico);
  app.use("/api", rutasContenidos);

  // Endpoint para servir y descargar los archivos adjuntos en el panel
  app.get('/api/adjuntos/:id', async (req, res) => {
    try {
      const [adjunto] = await db.consultar('select * from adjuntos where id = ?', [req.params.id]);
      if (!adjunto) {
        return res.status(404).json({ error: 'Archivo no encontrado' });
      }
      
      const rutaArchivo = path.join(__dirname, '../uploads', adjunto.nombre_almacenado);
      
      const esImagen = adjunto.tipo_mime && adjunto.tipo_mime.startsWith('image/');
      const disposicion = esImagen ? 'inline' : 'attachment';
      
      res.setHeader('Content-Type', adjunto.tipo_mime || 'application/octet-stream');
      res.setHeader('Content-Disposition', `${disposicion}; filename="${adjunto.nombre_original || 'archivo'}"`);
      
      res.sendFile(rutaArchivo);
    } catch (err) {
      console.error(err);
      res.status(500).json({ error: 'Error al obtener el archivo' });
    }
  });

  // El frontend usa este archivo para saber que debe hablar con el servidor y no con la demo.
  app.get("/js/config.js", (req, res) => {
    res.set("Cache-Control", "no-store");
    res.type("application/javascript").send(
      'window.Nexo = window.Nexo || {};\nwindow.Nexo.config = { modo: "servidor", urlApi: "/api" };\n'
    );
  });

  app.use(express.static(config.carpetaFrontend, { dotfiles: "ignore" }));
  app.use(manejarErrores);
  return app;
}

module.exports = { crearApp };