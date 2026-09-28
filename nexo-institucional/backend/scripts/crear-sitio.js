"use strict";

/* Crea una página institucional (un "sitio").
 *   npm run sitio:crear -- "Nombre real del sitio" identificador-web
 * El identificador es el que usan las páginas públicas para pedir su propio contenido:
 * GET /api/publico/<identificador>/publicaciones
 */

const db = require("../src/db");
const { consultar, ejecutar } = require("../src/db");

async function crearSitio(nombre, slug) {
  const nombreLimpio = String(nombre || "").trim();
  const slugLimpio = String(slug || "").trim().toLowerCase();
  if (!nombreLimpio || nombreLimpio.length > 120) throw new Error("Indicá el nombre del sitio (hasta 120 caracteres).");
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slugLimpio)) {
    throw new Error("El identificador solo admite minúsculas, números y guiones (ej. escuela-tecnica).");
  }
  const [existente] = await consultar("select id from sitios where slug = ?", [slugLimpio]);
  if (existente) throw new Error(`Ya existe un sitio con el identificador "${slugLimpio}".`);

  const r = await ejecutar("insert into sitios (nombre, slug, creado_en) values (?, ?, utc_timestamp())", [nombreLimpio, slugLimpio]);
  return { id: r.insertId, nombre: nombreLimpio, slug: slugLimpio };
}

module.exports = { crearSitio };

if (require.main === module) {
  const [nombre, slug] = process.argv.slice(2);
  if (!nombre || !slug) {
    console.error('Uso: npm run sitio:crear -- "Nombre real del sitio" identificador-web');
    process.exitCode = 1;
  } else {
    crearSitio(nombre, slug)
      .then((sitio) => console.log(`Listo: "${sitio.nombre}" (${sitio.slug}). Las páginas públicas ya pueden pedir /api/publico/${sitio.slug}/publicaciones`))
      .catch((error) => { console.error("No se pudo crear el sitio:", error.message); process.exitCode = 1; })
      .finally(() => db.cerrar());
  }
}
