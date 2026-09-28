"use strict";

/* Crea una persona del equipo.
 *   NEXO_PASSWORD='una-clave-larga' npm run usuario:crear -- "Nombre Apellido" correo@dominio.com administrador
 * Roles: observador | colaborador | director | administrador
 */

const db = require("../src/db");
const { crearUsuario } = require("../src/servicios/usuarios");

async function main() {
  const [nombre, email, rol = "observador"] = process.argv.slice(2);
  const password = process.env.NEXO_PASSWORD;
  if (!nombre || !email || !password) {
    console.error('Uso: NEXO_PASSWORD="..." npm run usuario:crear -- "Nombre Apellido" correo@dominio.com [rol]');
    process.exitCode = 1;
    return;
  }
  const usuario = await crearUsuario({ nombre, email, password, rol });
  console.log(`Listo: ${usuario.nombre} <${usuario.email}> con rol ${usuario.rol}.`);
}

main()
  .catch((error) => {
    console.error("No se pudo crear la persona:", error.message);
    process.exitCode = 1;
  })
  .finally(() => db.cerrar());
