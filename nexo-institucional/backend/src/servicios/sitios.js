"use strict";

const { consultar } = require("../db");

const formatear = (fila) => ({ id: String(fila.id), nombre: fila.nombre, slug: fila.slug });

/** Lista los sitios (páginas institucionales). No es información sensible: la usa el panel y la vista pública. */
async function listar() {
  const filas = await consultar("select * from sitios order by nombre");
  return filas.map(formatear);
}

/** Existe y devuelve su id numérico, o null. Lo usan los servicios que validan a qué sitio pertenece un contenido. */
async function buscarPorId(conexion, id) {
  const n = Number(id);
  if (!Number.isInteger(n) || n <= 0) return null;
  const [fila] = await consultar("select * from sitios where id = ?", [n], conexion);
  return fila ? formatear(fila) : null;
}

module.exports = { listar, buscarPorId };
