"use strict";

const { crear } = require("./errores");

const ROLES = ["observador", "colaborador", "director", "administrador"];

const PERMISOS = {
  observador: [],
  colaborador: ["crear"],
  director: ["crear", "revisar", "publicar", "archivar"],
  administrador: ["crear", "revisar", "publicar", "archivar", "roles"],
};

const puede = (usuario, permiso) => Boolean(usuario) && PERMISOS[usuario.rol].includes(permiso);

/** Revisar exige el permiso y no revisar lo propio (salvo el administrador). */
const puedeRevisar = (usuario, contenido) =>
  puede(usuario, "revisar") && (contenido.autorId !== usuario.id || usuario.rol === "administrador");

/** Enviar una nueva versión: el autor del contenido o un administrador. */
const puedeReenviar = (usuario, contenido) =>
  puede(usuario, "crear") && (contenido.autorId === usuario.id || usuario.rol === "administrador");

function exigir(usuario, permiso) {
  if (!puede(usuario, permiso)) throw crear("prohibido", "Tu rol no permite realizar esta acción.");
}

module.exports = { ROLES, PERMISOS, puede, puedeRevisar, puedeReenviar, exigir };
