"use strict";

const crypto = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");
const multer = require("multer");
const config = require("../config");
const { consultar } = require("../db");
const { crear } = require("../errores");

/** extensión permitida -> tipos MIME aceptados y firma (primeros bytes) del formato real */
const FORMATOS = {
  jpg: { mimes: ["image/jpeg"], firma: [0xff, 0xd8, 0xff] },
  jpeg: { mimes: ["image/jpeg"], firma: [0xff, 0xd8, 0xff] },
  png: { mimes: ["image/png"], firma: [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a] },
  pdf: { mimes: ["application/pdf"], firma: [0x25, 0x50, 0x44, 0x46] },
  docx: {
    mimes: ["application/vnd.openxmlformats-officedocument.wordprocessingml.document", "application/octet-stream"],
    firma: [0x50, 0x4b, 0x03, 0x04],
  },
  doc: { mimes: ["application/msword", "application/octet-stream"], firma: [0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1] },
  txt: { mimes: ["text/plain"], firma: null }, // texto: no debe contener bytes nulos
};

const extension = (nombre) => path.extname(nombre).slice(1).toLowerCase();

/** multer entrega el nombre en latin1; lo pasamos a utf8 y quitamos rutas y caracteres de control. */
function limpiarNombre(original) {
  const utf8 = Buffer.from(original, "latin1").toString("utf8");
  return path.basename(utf8.replace(/\\/g, "/")).replace(/[\u0000-\u001f\u007f]/g, "").slice(0, 200) || "archivo";
}

/* ---------- Subida (multer) ---------- */

const almacenamiento = multer.diskStorage({
  destination(req, file, cb) {
    fs.mkdirSync(config.carpetaAdjuntos, { recursive: true });
    cb(null, config.carpetaAdjuntos);
  },
  // el nombre en disco lo genera el servidor: nada que venga del cliente
  filename: (req, file, cb) => cb(null, crypto.randomUUID()),
});

const subida = multer({
  storage: almacenamiento,
  limits: {
    fileSize: config.maxAdjuntoBytes,
    files: config.maxAdjuntos,
    fields: 10,
    fieldSize: 300 * 1024,
  },
  fileFilter(req, file, cb) {
    const ext = extension(limpiarNombre(file.originalname));
    if (!FORMATOS[ext]) {
      return cb(crear("datos_invalidos", `${limpiarNombre(file.originalname)}: formato no permitido.`));
    }
    return cb(null, true);
  },
}).array("adjuntos", config.maxAdjuntos);

/* ---------- Validación posterior a la subida ---------- */

async function leerCabecera(ruta) {
  const manejador = await fs.promises.open(ruta, "r");
  try {
    const buffer = Buffer.alloc(1024);
    const { bytesRead } = await manejador.read(buffer, 0, 1024, 0);
    return buffer.subarray(0, bytesRead);
  } finally {
    await manejador.close();
  }
}

/** Verifica extensión, tipo MIME y firma real del archivo. Devuelve los datos a guardar. */
async function validarArchivos(archivos) {
  const validos = [];
  for (const archivo of archivos) {
    const nombre = limpiarNombre(archivo.originalname);
    const formato = FORMATOS[extension(nombre)];
    if (!formato || !formato.mimes.includes(archivo.mimetype)) {
      throw crear("datos_invalidos", `${nombre}: formato no permitido.`);
    }
    const cabecera = await leerCabecera(archivo.path);
    const firmaOk = formato.firma
      ? formato.firma.every((byte, i) => cabecera[i] === byte)
      : !cabecera.includes(0);
    if (!firmaOk) throw crear("datos_invalidos", `${nombre}: el contenido no coincide con el formato del archivo.`);
    validos.push({
      nombreOriginal: nombre,
      nombreAlmacenado: archivo.filename,
      mime: archivo.mimetype,
      tamano: archivo.size,
    });
  }
  return validos;
}

/** Borra archivos subidos cuando la operación falla (no quedan huérfanos en disco). */
async function descartar(archivos = []) {
  await Promise.all(archivos.map((a) => fs.promises.unlink(a.path).catch(() => {})));
}

/* ---------- Descarga ---------- */

async function buscarParaDescarga(id, { soloPublicados, sitioSlug } = {}) {
  const n = Number(id);
  if (!Number.isInteger(n) || n <= 0) throw crear("no_encontrado", "El archivo no existe.");

  const filas = soloPublicados
    ? await consultar(
        `select a.* from adjuntos a
           join contenidos c on c.id = a.contenido_id
           join sitios s on s.id = c.sitio_id
           join versiones v on v.contenido_id = c.id and v.numero = c.version_publicada
           join version_adjuntos va on va.version_id = v.id and va.adjunto_id = a.id
          where a.id = ? and c.version_publicada is not null ${sitioSlug ? "and s.slug = ?" : ""}`,
        sitioSlug ? [n, sitioSlug] : [n])
    : await consultar("select * from adjuntos where id = ?", [n]);

  if (!filas.length) throw crear("no_encontrado", "El archivo no existe.");
  return {
    ruta: path.join(config.carpetaAdjuntos, path.basename(filas[0].nombre_almacenado)),
    nombre: filas[0].nombre_original,
    mime: filas[0].tipo_mime,
  };
}

/**
 * Envía el archivo a la respuesta. Por defecto lo hace "en línea" (sin Content-Disposition: attachment),
 * así el navegador puede mostrarlo — una foto como imagen, un PDF en su visor — en vez de bajarlo en
 * silencio a la carpeta de descargas. Con forzarDescarga: true fuerza el diálogo de guardar, con el
 * nombre original del archivo.
 */
function enviarArchivo(res, archivo, { forzarDescarga = false } = {}) {
  if (forzarDescarga) {
    res.download(archivo.ruta, archivo.nombre);
  } else {
    res.type(archivo.mime);
    res.sendFile(archivo.ruta);
  }
}

module.exports = { subida, validarArchivos, descartar, buscarParaDescarga, enviarArchivo, limpiarNombre };
