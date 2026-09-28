"use strict";

const mysql = require("mysql2/promise");
const config = require("./config");

let pool = null;

function obtenerPool() {
  if (!pool) {
    pool = mysql.createPool({
      ...config.bd,
      charset: "utf8mb4",
      timezone: "Z", // las fechas viajan en UTC
      waitForConnections: true,
      connectionLimit: 10,
    });
  }
  return pool;
}

/** Ejecuta un select y devuelve las filas. Los parámetros siempre van separados del SQL. */
async function consultar(sql, params = [], conexion = null) {
  const [filas] = await (conexion || obtenerPool()).query(sql, params);
  return filas;
}

/** Ejecuta insert/update/delete y devuelve { insertId, affectedRows }. */
async function ejecutar(sql, params = [], conexion = null) {
  const [resultado] = await (conexion || obtenerPool()).query(sql, params);
  return resultado;
}

/** Corre fn dentro de una transacción; si algo falla se revierte todo. */
async function transaccion(fn) {
  const conexion = await obtenerPool().getConnection();
  try {
    await conexion.beginTransaction();
    const resultado = await fn(conexion);
    await conexion.commit();
    return resultado;
  } catch (error) {
    await conexion.rollback();
    throw error;
  } finally {
    conexion.release();
  }
}

async function cerrar() {
  if (pool) {
    await pool.end();
    pool = null;
  }
}

module.exports = { consultar, ejecutar, transaccion, cerrar };
