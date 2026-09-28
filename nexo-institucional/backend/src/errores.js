"use strict";

const ESTADO_HTTP = {
  datos_invalidos: 400,
  sin_sesion: 401,
  credenciales: 401,
  prohibido: 403,
  origen_invalido: 403,
  no_encontrado: 404,
  slug_duplicado: 409,
  estado_invalido: 409,
  regla_negocio: 409,
  demasiados_intentos: 429,
};

class ErrorApp extends Error {
  constructor(mensaje, codigo = "error", estado = 400) {
    super(mensaje);
    this.name = "ErrorApp";
    this.codigo = codigo;
    this.estado = estado;
  }
}

/** crear("prohibido", "Tu rol no permite esta acción.") */
function crear(codigo, mensaje) {
  return new ErrorApp(mensaje, codigo, ESTADO_HTTP[codigo] || 400);
}

module.exports = { ErrorApp, crear };
