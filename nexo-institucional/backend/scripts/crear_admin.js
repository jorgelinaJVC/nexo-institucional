const { ejecutar } = require("../src/db");
const { hashPassword } = require("../src/auth");

async function run() {
  const passwordPlana = "1234567890";
  const hash = await hashPassword(passwordPlana);
  
  await ejecutar(
    "insert into usuarios (nombre, email, password_hash, rol, activo, creado_en) values (?, ?, ?, 'administrador', 1, utc_timestamp())",
    ["Admin de Pruebas", "admin@prueba.com", hash]
  );
  
  console.log("¡Usuario administrador creado con éxito!");
  console.log("Correo: admin@prueba.com");
  console.log("Contraseña: 1234567890");
  process.exit(0);
}

run().catch(console.error);