"use strict";

const config = require("./config");
const db = require("./db");
const { crearApp } = require("./app");

const servidor = crearApp().listen(config.puerto, () => {
  console.log(`Nexo institucional escuchando en http://localhost:${config.puerto}`);
});

async function apagar() {
  servidor.close(async () => {
    await db.cerrar();
    process.exit(0);
  });
}

process.on("SIGINT", apagar);
process.on("SIGTERM", apagar);
