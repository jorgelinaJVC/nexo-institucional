"use strict";

/* Crea la base de datos y aplica backend/sql/*.sql en orden.
 *   npm run bd:iniciar                 crea lo que falte (no borra datos)
 *   npm run bd:iniciar -- --reiniciar  BORRA la base y la crea de cero
 */

const fs = require("node:fs");
const path = require("node:path");
const mysql = require("mysql2/promise");
const config = require("../src/config");

const CARPETA_SQL = path.join(__dirname, "..", "sql");
const ARCHIVOS = ["01_esquema.sql", "02_triggers.sql", "03_vistas.sql"];

/** Separa un archivo .sql en sentencias usando la marca "-- @@" y descarta los bloques vacíos. */
function sentencias(sql) {
  return sql
    .split(/^-- @@[ \t]*$/m)
    .map((bloque) => bloque.trim())
    .filter((bloque) => bloque.split("\n").some((linea) => linea.trim() && !linea.trim().startsWith("--")));
}

async function iniciarBd({ reiniciar = false } = {}) {
  const { database, ...sinBaseDeDatos } = config.bd;
  const conexion = await mysql.createConnection(sinBaseDeDatos);
  try {
    const nombre = mysql.escapeId(database);
    if (reiniciar) await conexion.query(`drop database if exists ${nombre}`);
    await conexion.query(`create database if not exists ${nombre} character set utf8mb4 collate utf8mb4_unicode_ci`);
    await conexion.query(`use ${nombre}`);

    for (const archivo of ARCHIVOS) {
      const contenido = fs.readFileSync(path.join(CARPETA_SQL, archivo), "utf8");
      for (const sentencia of sentencias(contenido)) await conexion.query(sentencia);
    }
  } finally {
    await conexion.end();
  }
}

module.exports = { iniciarBd, sentencias };

if (require.main === module) {
  const reiniciar = process.argv.includes("--reiniciar");
  iniciarBd({ reiniciar })
    .then(() => console.log(`Base de datos "${config.bd.database}" lista${reiniciar ? " (reiniciada)" : ""}.`))
    .catch((error) => {
      console.error("No se pudo preparar la base de datos:", error.message);
      process.exit(1);
    });
}
