"use strict";

const { consultar } = require("./db");

const iso = (fecha) => (fecha ? new Date(fecha).toISOString() : null);
const texto = (id) => String(id);

const formatearAdjunto = (a) => ({ id: texto(a.id), nombre: a.nombre_original, tamano: a.tamano });

function formatearVersion(v, adjuntos) {
  return {
    numero: v.numero,
    autorId: texto(v.autor_id),
    fecha: iso(v.creada_en),
    titulo: v.titulo,
    resumen: v.resumen,
    cuerpo: v.cuerpo,
    adjuntos: adjuntos.filter((a) => a.version_id === v.id).map(formatearAdjunto),
    estado: v.estado,
    decision: v.decision_tipo
      ? {
          tipo: v.decision_tipo,
          usuarioId: texto(v.decision_usuario_id),
          fecha: iso(v.decision_en),
          comentario: v.decision_comentario || "",
        }
      : null,
  };
}

/**
 * Devuelve contenidos completos (versiones, adjuntos e historial), con el sitio y el tipo.
 * Sin `id` trae todos; con `id`, solo ese contenido.
 */
async function cargarContenidos(conexion, { id } = {}) {
  const filtro = id ? "where c.id = ?" : "";
  const contenidos = await consultar(
    `select c.*, s.slug as sitio_slug, s.nombre as sitio_nombre
       from contenidos c join sitios s on s.id = c.sitio_id
       ${filtro} order by c.id`,
    id ? [id] : [], conexion
  );
  if (!contenidos.length) return [];

  const ids = contenidos.map((c) => c.id);
  const versiones = await consultar(
    "select * from versiones where contenido_id in (?) order by contenido_id, numero", [ids], conexion
  );
  const adjuntos = await consultar(
    `select va.version_id, a.id, a.nombre_original, a.tamano
       from version_adjuntos va join adjuntos a on a.id = va.adjunto_id
      where a.contenido_id in (?) order by a.id`,
    [ids], conexion
  );
  const eventos = await consultar(
    "select * from eventos where contenido_id in (?) order by id", [ids], conexion
  );

  return contenidos.map((c) => {
    const propias = versiones.filter((v) => v.contenido_id === c.id);
    const formateadas = propias.map((v) => formatearVersion(v, adjuntos));
    const publicada = c.version_publicada
      ? formateadas.find((v) => v.numero === c.version_publicada)
      : null;

    return {
      id: texto(c.id),
      sitio: { id: texto(c.sitio_id), nombre: c.sitio_nombre, slug: c.sitio_slug },
      tipo: c.tipo,
      seccion: c.seccion,
      slug: c.slug,
      autorId: texto(c.autor_id),
      estado: c.estado,
      creado: iso(c.creado_en),
      actualizado: iso(c.actualizado_en),
      publicada: publicada
        ? {
            slug: c.slug, seccion: c.seccion, titulo: publicada.titulo, resumen: publicada.resumen,
            cuerpo: publicada.cuerpo, adjuntos: publicada.adjuntos, version: publicada.numero,
            fecha: iso(c.publicado_en),
          }
        : null,
      versiones: formateadas,
      historial: eventos.filter((e) => e.contenido_id === c.id).map((e) => ({
        id: texto(e.id),
        tipo: e.tipo,
        usuarioId: texto(e.usuario_id),
        fecha: iso(e.creado_en),
        version: e.version_numero,
        comentario: e.comentario,
      })),
    };
  });
}

/* ---------- Vista pública (lee solo vista_publicaciones, siempre acotada a un sitio) ---------- */

/** Adjuntos de publicaciones vigentes, opcionalmente acotados a un sitio y/o a un contenido puntual. */
async function adjuntosPublicados({ sitioSlug, slug } = {}) {
  const condiciones = ["c.version_publicada is not null"];
  const parametros = [];
  if (sitioSlug) { condiciones.push("s.slug = ?"); parametros.push(sitioSlug); }
  if (slug) { condiciones.push("c.slug = ?"); parametros.push(slug); }
  return consultar(
    `select a.id, a.nombre_original, a.tamano, c.slug, s.slug as sitio_slug
       from contenidos c
       join sitios s on s.id = c.sitio_id
       join versiones v on v.contenido_id = c.id and v.numero = c.version_publicada
       join version_adjuntos va on va.version_id = v.id
       join adjuntos a on a.id = va.adjunto_id
      where ${condiciones.join(" and ")}
      order by a.id`,
    parametros
  );
}

function formatearPublicacion(fila, adjuntos) {
  return {
    slug: fila.slug,
    sitio: { nombre: fila.sitio_nombre, slug: fila.sitio_slug },
    tipo: fila.tipo,
    seccion: fila.seccion,
    titulo: fila.titulo,
    resumen: fila.resumen,
    cuerpo: fila.cuerpo,
    adjuntos: adjuntos.filter((a) => a.slug === fila.slug && a.sitio_slug === fila.sitio_slug).map(formatearAdjunto),
    fecha: iso(fila.fecha),
  };
}

/** Listado público. sitioSlug es obligatorio en la práctica (cada página solo pide el suyo); tipo es opcional. */
async function listarPublicaciones({ sitioSlug, tipo } = {}) {
  const condiciones = [];
  const parametros = [];
  if (sitioSlug) { condiciones.push("sitio_slug = ?"); parametros.push(sitioSlug); }
  if (tipo) { condiciones.push("tipo = ?"); parametros.push(tipo); }
  const where = condiciones.length ? `where ${condiciones.join(" and ")}` : "";

  const filas = await consultar(`select * from vista_publicaciones ${where} order by fecha desc, contenido_id desc`, parametros);
  const adjuntos = await adjuntosPublicados({ sitioSlug });
  return filas.map((f) => formatearPublicacion(f, adjuntos));
}

async function obtenerPublicacion(sitioSlug, slug) {
  const [fila] = await consultar("select * from vista_publicaciones where sitio_slug = ? and slug = ?", [sitioSlug, slug]);
  if (!fila) return null;
  return formatearPublicacion(fila, await adjuntosPublicados({ sitioSlug, slug }));
}

module.exports = { cargarContenidos, listarPublicaciones, obtenerPublicacion };
