"use strict";

const path = require("node:path");

// Lee el archivo .env de la raíz del proyecto si existe (Node 20.12+ / 21.7+).
try {
  process.loadEnvFile(path.join(__dirname, "..", "..", ".env"));
} catch (e) {
  /* sin .env: se usan las variables del entorno y los valores por defecto */
}

const env = process.env;

module.exports = {
  produccion: env.NODE_ENV === "production",
  puerto: Number(env.PORT || 3000),
  bd: {
    host: env.DB_HOST || "127.0.0.1",
    port: Number(env.DB_PORT || 3306),
    user: env.DB_USER || "root",
    password: env.DB_PASSWORD || "",
    database: env.DB_NAME || "nexo_institucional",
  },
  sesionHoras: Number(env.SESION_HORAS || 8),
  costoBcrypt: Number(env.BCRYPT_COSTO || 12),
  carpetaAdjuntos: path.resolve(env.CARPETA_ADJUNTOS || path.join(__dirname, "..", "..", "almacen")),
  carpetaFrontend: path.join(__dirname, "..", "..", "frontend"),
  maxAdjuntoBytes: 10 * 1024 * 1024,
  maxAdjuntos: 8,
  intentosLogin: { maximo: 5, ventanaMs: 15 * 60 * 1000 },
};
