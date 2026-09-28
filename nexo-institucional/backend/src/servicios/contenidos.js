"use strict";

const config = require("../config");
const { consultar, ejecutar, transaccion } = require("../db");
const { crear } = require("../errores");
const { exigir, puedeRevisar, puedeReenviar } = require("../permisos");
const { cargarContenidos } = require("../repositorio");
const sitios = require("./sitios");

const TIPOS = ["noticia", "proyecto", "galeria"];

/* ---------- Validación ---------- */

const LIMITES = { seccion: 60, slug: 80, titulo: 120, resumen: 280, cuerpo: 50000, comentario: 600 };

/**
 * conSlug: exige el identificador web (solo al crear).
 * conSitioYTipo: exige y valida sitioId/tipo (solo al crear: en una nueva versión son inmutables).
 * tipoGaleria: relaja la exigencia de "cuerpo" (una galería vive de sus fotos, no de un texto largo).
 */
function validarDatos(entrada, { conSlug, conSitioYTipo = false, tipoGaleria = false }) {
  const datos = entrada && typeof entrada === "object" ? entrada : {};
  const t = (x) => (typeof x === "string" ? x.trim() : "");

  let sitioId, tipo;
  if (conSitioYTipo) {
    sitioId = Number(datos.sitioId);
    if (!Number.isInteger(sitioId) || sitioId <= 0) throw crear("datos_invalidos", "Elegí a qué sitio pertenece el contenido.");
    tipo = t(datos.tipo);
    if (!TIPOS.includes(tipo)) throw crear("datos_invalidos", "Elegí un tipo de contenido válido.");
    tipoGaleria = tipo === "galeria"; // una galería solo tiene sentido definirla acá, al crear
  }

  const limpio = {
    seccion: t(datos.seccion),
    slug: t(datos.slug).toLowerCase(),
    titulo: t(datos.titulo),
    resumen: t(datos.resumen),
    cuerpo: t(datos.cuerpo),
  };

  const faltanObligatorios = !limpio.seccion || !limpio.titulo || !limpio.resumen || (!tipoGaleria && !limpio.cuerpo);
  if (faltanObligatorios) {
    throw crear("datos_invalidos", tipoGaleria
      ? "Completá sección, título y resumen."
      : "Completá sección, título, resumen y contenido.");
  }
  for (const campo of ["seccion", "titulo", "resumen", "cuerpo"]) {
    if (limpio[campo].length > LIMITES[campo]) {
      throw crear("datos_invalidos", `El campo ${campo} supera los ${LIMITES[campo]} caracteres.`);
    }
  }
  if (conSlug) {
    if (limpio.slug.length > LIMITES.slug || !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(limpio.slug)) {
      throw crear("datos_invalidos", "El identificador web solo admite minúsculas, números y guiones.");
    }
  }
  if (conSitioYTipo) {
    limpio.sitioId = sitioId;
    limpio.tipo = tipo;
  }
  return limpio;
}

const comentarioLimpio = (x) => (typeof x === "string" ? x.trim().slice(0, LIMITES.comentario) : "");

/* ---------- Helpers de base de datos ---------- */

async function bloquear(conexion, id) {
  const n = Number(id);
  if (!Number.isInteger(n) || n <= 0) throw crear("no_encontrado", "El contenido no existe.");
  const [contenido] = await consultar("select * from contenidos where id = ? for update", [n], conexion);
  if (!contenido) throw crear("no_encontrado", "El contenido no existe.");
  return contenido;
}

async function ultimaVersion(conexion, contenidoId) {
  const [version] = await consultar(
    "select * from versiones where contenido_id = ? order by numero desc limit 1", [contenidoId], conexion
  );
  return version;
}

const registrarEvento = (conexion, contenidoId, version, tipo, usuarioId, comentario) =>
  ejecutar(
    "insert into eventos (contenido_id, version_numero, tipo, usuario_id, comentario, creado_en) values (?, ?, ?, ?, ?, utc_timestamp())",
    [contenidoId, version, tipo, usuarioId, comentario || ""], conexion
  );

const insertarVersion = (conexion, contenidoId, numero, actor, d) =>
  ejecutar(
    `insert into versiones (contenido_id, numero, autor_id, titulo, resumen, cuerpo, estado, creada_en)
     values (?, ?, ?, ?, ?, ?, 'en_revision', utc_timestamp())`,
    [contenidoId, numero, actor.id, d.titulo, d.resumen, d.cuerpo], conexion
  );

async function validarConservados(conexion, contenidoId, ids) {
  const limpios = [...new Set((Array.isArray(ids) ? ids : []).map(Number))];
  if (limpios.some((n) => !Number.isInteger(n) || n <= 0)) {
    throw crear("datos_invalidos", "La lista de adjuntos a conservar no es válida.");
  }
  if (!limpios.length) return [];
  const filas = await consultar(
    "select id from adjuntos where contenido_id = ? and id in (?)", [contenidoId, limpios], conexion
  );
  if (filas.length !== limpios.length) {
    throw crear("datos_invalidos", "Alguno de los adjuntos que querés conservar no existe.");
  }
  return limpios;
}

async function vincularArchivos(conexion, contenidoId, versionId, actor, archivos, conservados) {
  for (const adjuntoId of conservados) {
    await ejecutar("insert into version_adjuntos (version_id, adjunto_id) values (?, ?)", [versionId, adjuntoId], conexion);
  }
  for (const a of archivos) {
    const r = await ejecutar(
      `insert into adjuntos (contenido_id, nombre_original, nombre_almacenado, tipo_mime, tamano, subido_por, creado_en)
       values (?, ?, ?, ?, ?, ?, utc_timestamp())`,
      [contenidoId, a.nombreOriginal, a.nombreAlmacenado, a.mime, a.tamano, actor.id], conexion
    );
    await ejecutar("insert into version_adjuntos (version_id, adjunto_id) values (?, ?)", [versionId, r.insertId], conexion);
  }
}

const propietario = (contenido) => ({ autorId: String(contenido.autor_id) });
const devolver = async (conexion, id) => (await cargarContenidos(conexion, { id }))[0];

/* ---------- Operaciones ---------- */

function listar() {
  return cargarContenidos(null);
}

async function crearContenido(actor, entrada, archivos = []) {
  exigir(actor, "crear");
  const d = validarDatos(entrada, { conSlug: true, conSitioYTipo: true });
  if (archivos.length > config.maxAdjuntos) {
    throw crear("datos_invalidos", `Se permiten hasta ${config.maxAdjuntos} adjuntos por versión.`);
  }
  if (d.tipo === "galeria" && archivos.length < 1) {
    throw crear("datos_invalidos", "Una galería necesita al menos una foto.");
  }
  if (!(await sitios.buscarPorId(null, d.sitioId))) {
    throw crear("datos_invalidos", "El sitio indicado no existe.");
  }

  return transaccion(async (conexion) => {
    let contenidoId;
    try {
      const r = await ejecutar(
        `insert into contenidos (sitio_id, tipo, seccion, slug, autor_id, estado, creado_en, actualizado_en)
         values (?, ?, ?, ?, ?, 'en_revision', utc_timestamp(), utc_timestamp())`,
        [d.sitioId, d.tipo, d.seccion, d.slug, actor.id], conexion
      );
      contenidoId = r.insertId;
    } catch (error) {
      if (error.code === "ER_DUP_ENTRY") throw crear("slug_duplicado", "Ya existe un contenido con ese identificador web en este sitio.");
      if (error.code === "ER_NO_REFERENCED_ROW_2") throw crear("datos_invalidos", "El sitio indicado no existe.");
      throw error;
    }
    const version = await insertarVersion(conexion, contenidoId, 1, actor, d);
    await vincularArchivos(conexion, contenidoId, version.insertId, actor, archivos, []);
    await registrarEvento(conexion, contenidoId, 1, "envio", actor.id, "");
    return devolver(conexion, contenidoId);
  });
}

async function enviarNuevaVersion(actor, id, entrada, archivos = [], conservar = []) {
  exigir(actor, "crear");

  return transaccion(async (conexion) => {
    const contenido = await bloquear(conexion, id);
    if (!puedeReenviar(actor, propietario(contenido))) {
      throw crear("prohibido", "Solo el autor o un administrador pueden enviar una nueva versión.");
    }
    if (!["devuelto", "publicado"].includes(contenido.estado)) {
      throw crear("estado_invalido", "Solo se puede enviar una nueva versión de un contenido devuelto o publicado.");
    }
    const d = validarDatos(entrada, { conSlug: false, tipoGaleria: contenido.tipo === "galeria" });
    const conservados = await validarConservados(conexion, contenido.id, conservar);
    if (conservados.length + archivos.length > config.maxAdjuntos) {
      throw crear("datos_invalidos", `Se permiten hasta ${config.maxAdjuntos} adjuntos por versión.`);
    }
    if (contenido.tipo === "galeria" && conservados.length + archivos.length < 1) {
      throw crear("datos_invalidos", "Una galería necesita al menos una foto.");
    }

    const previa = await ultimaVersion(conexion, contenido.id);
    if (previa.estado === "devuelta") {
      await ejecutar("update versiones set estado = 'conservada' where id = ?", [previa.id], conexion);
    }
    const numero = previa.numero + 1;
    const version = await insertarVersion(conexion, contenido.id, numero, actor, d);
    await vincularArchivos(conexion, contenido.id, version.insertId, actor, archivos, conservados);
    await ejecutar(
      "update contenidos set seccion = ?, estado = 'en_revision', actualizado_en = utc_timestamp() where id = ?",
      [d.seccion, contenido.id], conexion
    );
    await registrarEvento(conexion, contenido.id, numero, "envio", actor.id, "");
    return devolver(conexion, contenido.id);
  });
}

async function decidir(actor, id, { decision, comentario } = {}) {
  exigir(actor, "revisar");
  const texto = comentarioLimpio(comentario);
  if (!["aprobar", "devolver"].includes(decision)) {
    throw crear("datos_invalidos", "La decisión indicada no es válida.");
  }
  if (decision === "devolver" && !texto) {
    throw crear("datos_invalidos", "Para devolver un contenido hay que explicar qué debe ajustarse.");
  }

  return transaccion(async (conexion) => {
    const contenido = await bloquear(conexion, id);
    if (contenido.estado !== "en_revision") {
      throw crear("estado_invalido", "Este contenido ya no está pendiente de revisión.");
    }
    if (!puedeRevisar(actor, propietario(contenido))) {
      throw crear("prohibido", "No podés revisar un contenido que cargaste vos.");
    }

    const version = await ultimaVersion(conexion, contenido.id);
    const aprobar = decision === "aprobar";
    await ejecutar(
      `update versiones
          set estado = ?, decision_tipo = ?, decision_usuario_id = ?, decision_comentario = ?, decision_en = utc_timestamp()
        where id = ?`,
      [aprobar ? "aprobada" : "devuelta", aprobar ? "aprobacion" : "devolucion", actor.id, texto, version.id], conexion
    );
    await ejecutar(
      "update contenidos set estado = ?, actualizado_en = utc_timestamp() where id = ?",
      [aprobar ? "aprobado" : "devuelto", contenido.id], conexion
    );
    await registrarEvento(conexion, contenido.id, version.numero, aprobar ? "aprobacion" : "devolucion", actor.id, texto);
    return devolver(conexion, contenido.id);
  });
}

async function publicar(actor, id) {
  exigir(actor, "publicar");
  return transaccion(async (conexion) => {
    const contenido = await bloquear(conexion, id);
    if (contenido.estado !== "aprobado") {
      throw crear("estado_invalido", "Solo se puede publicar un contenido aprobado.");
    }
    const version = await ultimaVersion(conexion, contenido.id);
    await ejecutar(
      "update versiones set estado = 'reemplazada' where contenido_id = ? and estado = 'publicada'",
      [contenido.id], conexion
    );
    await ejecutar("update versiones set estado = 'publicada' where id = ?", [version.id], conexion);
    await ejecutar(
      `update contenidos
          set estado = 'publicado', version_publicada = ?, publicado_en = utc_timestamp(), actualizado_en = utc_timestamp()
        where id = ?`,
      [version.numero, contenido.id], conexion
    );
    await registrarEvento(conexion, contenido.id, version.numero, "publicacion", actor.id, "");
    return devolver(conexion, contenido.id);
  });
}

async function archivar(actor, id, motivo) {
  exigir(actor, "archivar");
  return transaccion(async (conexion) => {
    const contenido = await bloquear(conexion, id);
    if (contenido.estado === "archivado") throw crear("estado_invalido", "El contenido ya está archivado.");

    const version = await ultimaVersion(conexion, contenido.id);
    await ejecutar(
      "update versiones set estado = 'archivada' where contenido_id = ? and estado = 'publicada'",
      [contenido.id], conexion
    );
    await ejecutar(
      `update contenidos
          set estado = 'archivado', version_publicada = null, publicado_en = null, actualizado_en = utc_timestamp()
        where id = ?`,
      [contenido.id], conexion
    );
    await registrarEvento(conexion, contenido.id, version.numero, "archivo", actor.id, comentarioLimpio(motivo));
    return devolver(conexion, contenido.id);
  });
}

async function restaurar(actor, id) {
  exigir(actor, "archivar");
  return transaccion(async (conexion) => {
    const contenido = await bloquear(conexion, id);
    if (contenido.estado !== "archivado") throw crear("estado_invalido", "El contenido no está archivado.");

    const version = await ultimaVersion(conexion, contenido.id);
    const mapa = { en_revision: "en_revision", devuelta: "devuelto", aprobada: "aprobado" };
    let estado = mapa[version.estado];
    if (!estado) {
      // la última versión estaba publicada: vuelve como aprobada y hay que publicarla de nuevo
      await ejecutar("update versiones set estado = 'aprobada' where id = ?", [version.id], conexion);
      estado = "aprobado";
    }
    await ejecutar(
      "update contenidos set estado = ?, actualizado_en = utc_timestamp() where id = ?", [estado, contenido.id], conexion
    );
    await registrarEvento(conexion, contenido.id, version.numero, "restauracion", actor.id, "");
    return devolver(conexion, contenido.id);
  });
}

// Ejemplo de ruta en Express
router.get('/aprobados', async (req, res) => {
    try {
        const [filas] = await conexion.query("SELECT * FROM contenidos WHERE estado = 'aprobado' ORDER BY creado_en DESC");
        res.json(filas);
    } catch (error) {
        res.status(500).json({ error: 'Error al obtener contenidos aprobados' });
    }
});

async function listarPublicosPorSitioYSeccion(sitioId, seccion) {
  const sId = Number(sitioId);
  const sec = typeof seccion === "string" ? seccion.trim() : "";
  
  if (!Number.isInteger(sId) || sId <= 0 || !sec) {
    throw crear("datos_invalidos", "Parámetros de sitio o sección inválidos.");
  }

  // Usamos la función consultar del sistema para buscar los contenidos aprobados
  const filas = await consultar(
    `SELECT c.*, v.titulo, v.resumen, v.cuerpo, v.creada_en as version_creada_en 
     FROM contenidos c 
     JOIN versiones v ON c.id = v.contenido_id AND v.numero = c.version_publicada
     WHERE c.sitio_id = ? AND c.seccion = ? AND c.estado = 'publicado' 
     ORDER BY c.publicado_en DESC`,
    [sId, sec]
  );
  
  return filas;
}

module.exports = { 
  listar, 
  crearContenido, 
  enviarNuevaVersion, 
  decidir, 
  publicar, 
  archivar, 
  restaurar,
  listarPublicosPorSitioYSeccion // <-- Exportamos la nueva función aquí
};