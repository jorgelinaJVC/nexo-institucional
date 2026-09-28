/* api.js — capa de datos del frontend.
 *
 * MODO DEMO: hoy guarda todo en localStorage y aplica acá las reglas de negocio
 * (roles, estados, versiones). Cuando exista el backend, cada función de Nexo.api
 * se reemplaza por un fetch() a la API real conservando la misma firma; el resto
 * del frontend no cambia. Las reglas de este archivo son la especificación que
 * el backend tiene que cumplir (y validar del lado del servidor).
 */
window.Nexo = window.Nexo || {};

(function () {
  "use strict";

  const CLAVE_DATOS = "nexo.datos.v1";
  const CLAVE_SESION = "nexo.sesion.v1";
  const LATENCIA_MS = 80;
  const MAX_ADJUNTOS = 8;

  /* ---------- Roles y permisos ---------- */

  const ROLES = {
    observador: { nombre: "Observador", permisos: "Solo puede consultar" },
    colaborador: { nombre: "Colaborador", permisos: "Puede cargar y enviar a revisión" },
    director: { nombre: "Director de área", permisos: "Puede aprobar y publicar" },
    administrador: { nombre: "Administrador", permisos: "Puede aprobar, publicar y gestionar roles" },
  };

  const PERMISOS = {
    observador: [],
    colaborador: ["crear"],
    director: ["crear", "revisar", "publicar", "archivar"],
    administrador: ["crear", "revisar", "publicar", "archivar", "roles"],
  };

  const ESTADOS = {
    en_revision: "En revisión",
    devuelto: "Devuelto",
    aprobado: "Aprobado",
    publicado: "Publicado",
    archivado: "Archivado",
  };

  const puede = (usuario, permiso) => Boolean(usuario) && PERMISOS[usuario.rol].includes(permiso);

  /** Revisar exige el permiso y no revisar lo propio (salvo el administrador). */
  const puedeRevisar = (usuario, contenido) =>
    puede(usuario, "revisar") && (contenido.autorId !== usuario.id || usuario.rol === "administrador");

  /** Enviar una nueva versión: el autor del contenido o un administrador. */
  const puedeReenviar = (usuario, contenido) =>
    puede(usuario, "crear") && (contenido.autorId === usuario.id || usuario.rol === "administrador");

  /* ---------- Errores y utilidades ---------- */

  class ErrorNexo extends Error {
    constructor(mensaje, codigo = "error") {
      super(mensaje);
      this.name = "ErrorNexo";
      this.codigo = codigo;
    }
  }

  const demora = () => new Promise((resolver) => setTimeout(resolver, LATENCIA_MS));
  const clonar = (x) => JSON.parse(JSON.stringify(x));
  const ahora = () => new Date().toISOString();
  const nuevoId = (prefijo) => prefijo + Math.random().toString(36).slice(2, 10);
  const ultima = (contenido) => contenido.versiones[contenido.versiones.length - 1];
  const evento = (tipo, usuarioId, version, comentario) => ({
    id: nuevoId("e"), tipo, usuarioId, fecha: ahora(), version, comentario: comentario || "",
  });

  /* ---------- Datos de demostración ---------- */

  function semilla() {
    const f = (dia, hora = "12:00") => `2026-09-${dia}T${hora}:00-03:00`;
    const ev = (tipo, usuarioId, fecha, version) => ({
      id: nuevoId("e"), tipo, usuarioId, fecha, version, comentario: "",
    });
    const ver = (numero, fecha, datos, estado, decision) => ({
      numero, autorId: "u3", fecha, titulo: datos.titulo, resumen: datos.resumen,
      cuerpo: datos.cuerpo, adjuntos: datos.adjuntos || [], estado, decision: decision || null,
    });
    const aprobacion = (fecha) => ({ tipo: "aprobacion", usuarioId: "u2", fecha, comentario: "" });
    const instantanea = (c, v, fecha) => ({
      slug: c.slug, sitio: sitios.find((s) => s.id === c.sitioId), tipo: c.tipo, seccion: c.seccion,
      titulo: v.titulo, resumen: v.resumen, cuerpo: v.cuerpo, adjuntos: v.adjuntos, version: v.numero, fecha,
    });

    const usuarios = [
      { id: "u1", nombre: "Jorgelina Campos", email: "jorgelina.campos@ejemplo.edu.ar", rol: "administrador", ultimoAcceso: f("18", "09:15") },
      { id: "u2", nombre: "Marcos Ledesma", email: "marcos.ledesma@ejemplo.edu.ar", rol: "director", ultimoAcceso: f("17", "09:00") },
      { id: "u3", nombre: "Analía Rojas", email: "analia.rojas@ejemplo.edu.ar", rol: "colaborador", ultimoAcceso: f("18", "12:05") },
      { id: "u4", nombre: "Tomás Herrera", email: "tomas.herrera@ejemplo.edu.ar", rol: "observador", ultimoAcceso: f("12", "16:40") },
    ];

    // Dos páginas institucionales de ejemplo: renombralas o agregá más desde /backend/scripts/crear-sitio.js
    const sitios = [
      { id: "s1", nombre: "Sitio institucional 1", slug: "sitio-1" },
      { id: "s2", nombre: "Sitio institucional 2", slug: "sitio-2" },
    ];

    /* Becas: dos versiones publicadas (la primera quedó reemplazada). */
    const becasV1 = {
      titulo: "Convocatoria de becas de permanencia 2026",
      resumen: "Información, requisitos y fechas para postular a las becas de permanencia estudiantil.",
      cuerpo: "Se abre la convocatoria de becas de permanencia para estudiantes regulares.\n\nLa inscripción se realiza en la oficina de Bienestar Estudiantil.",
    };
    const becasV2 = {
      titulo: "Convocatoria de becas de permanencia 2026",
      resumen: "Información, requisitos y fechas para postular a las becas de permanencia estudiantil.",
      cuerpo: "Se abre la convocatoria de becas de permanencia para estudiantes regulares.\n\nLa inscripción se realiza en línea o en la oficina de Bienestar Estudiantil, hasta el 30 de octubre.\n\nRequisitos: certificado de alumno regular, constancia de ingresos familiares y fotocopia del DNI.",
    };
    const becas = {
      id: "c1", sitioId: "s1", tipo: "noticia", seccion: "Becas y beneficios", slug: "convocatoria-becas-2026", autorId: "u3",
      estado: "publicado", creado: f("10", "10:00"), actualizado: f("17", "09:30"), publicada: null,
      versiones: [
        ver(1, f("10", "10:00"), becasV1, "reemplazada", aprobacion(f("10", "15:00"))),
        ver(2, f("16", "11:00"), becasV2, "publicada", aprobacion(f("17", "09:00"))),
      ],
      historial: [
        ev("envio", "u3", f("10", "10:00"), 1), ev("aprobacion", "u2", f("10", "15:00"), 1),
        ev("publicacion", "u2", f("10", "16:00"), 1), ev("envio", "u3", f("16", "11:00"), 2),
        ev("aprobacion", "u2", f("17", "09:00"), 2), ev("publicacion", "u2", f("17", "09:30"), 2),
      ],
    };
    becas.publicada = instantanea(becas, becas.versiones[1], f("17", "09:30"));

    /* Contenidos publicados con una sola versión. */
    const simple = (id, sitioId, tipo, seccion, slug, datos, envio, aprobado, publicado) => {
      const c = {
        id, sitioId, tipo, seccion, slug, autorId: "u3", estado: "publicado", creado: envio, actualizado: publicado,
        publicada: null,
        versiones: [ver(1, envio, datos, "publicada", aprobacion(aprobado))],
        historial: [ev("envio", "u3", envio, 1), ev("aprobacion", "u2", aprobado, 1), ev("publicacion", "u2", publicado, 1)],
      };
      c.publicada = instantanea(c, c.versiones[0], publicado);
      return c;
    };

    const calendario = simple("c2", "s1", "proyecto", "Comunidad académica", "calendario-academico-2027", {
      titulo: "Calendario académico 2027",
      resumen: "Fechas clave del año lectivo: inscripciones, recesos, exámenes y cierre de actas.",
      cuerpo: "El calendario académico 2027 fija el inicio de clases en marzo y el cierre de actas en diciembre.\n\nLas fechas de exámenes y recesos se publican por cuatrimestre.",
    }, f("14", "10:00"), f("15", "10:00"), f("15", "10:30"));

    const protocolo = simple("c3", "s2", "noticia", "Vida universitaria", "protocolo-orientacion-acompanamiento", {
      titulo: "Protocolo de orientación y acompañamiento",
      resumen: "Guía de atención para derivaciones de orientación y acompañamiento integral.",
      cuerpo: "Este protocolo describe cómo se deriva y acompaña a estudiantes que necesitan orientación.\n\nLa primera consulta se solicita en la oficina de Bienestar Estudiantil.",
    }, f("10", "14:00"), f("11", "09:00"), f("11", "09:30"));

    /* Un contenido pendiente de revisión: una galería, para mostrar cómo se ve ese tipo. */
    const abuelos = {
      id: "c4", sitioId: "s2", tipo: "galeria", seccion: "Proyecto escuelas", slug: "visitas", autorId: "u3", estado: "en_revision",
      creado: f("18", "12:00"), actualizado: f("18", "12:00"), publicada: null,
      versiones: [ver(1, f("18", "12:00"), {
        titulo: "Las escuelas podrán visitar a los abuelos",
        resumen: "Los alumnos de las escuelas podrán hacer una visita a los abuelos de la residencia.",
        cuerpo: "A partir del jueves, los estudiantes de las escuelas participantes visitarán la residencia de adultos mayores para compartir una tarde de actividades.",
        adjuntos: [{ nombre: "logoMA.png", tamano: 932864 }],
      }, "en_revision")],
      historial: [ev("envio", "u3", f("18", "12:00"), 1)],
    };

    return { usuarios, sitios, contenidos: [becas, calendario, protocolo, abuelos] };
  }

  /* ---------- Almacenamiento (localStorage con respaldo en memoria) ---------- */

  let memoriaDatos = null;
  let memoriaSesion = null;

  function guardar(datos) {
    memoriaDatos = datos;
    try { localStorage.setItem(CLAVE_DATOS, JSON.stringify(datos)); } catch (e) { /* usa la memoria */ }
  }

  function leer() {
    try {
      const texto = localStorage.getItem(CLAVE_DATOS);
      if (texto) return JSON.parse(texto);
    } catch (e) { /* datos ilegibles: se usa el respaldo o se regeneran */ }
    if (memoriaDatos) return memoriaDatos;
    const datos = semilla();
    guardar(datos);
    return datos;
  }

  function leerSesion() {
    try { return localStorage.getItem(CLAVE_SESION) || memoriaSesion; } catch (e) { return memoriaSesion; }
  }

  function guardarSesion(id) {
    memoriaSesion = id;
    try {
      if (id) localStorage.setItem(CLAVE_SESION, id); else localStorage.removeItem(CLAVE_SESION);
    } catch (e) { /* usa la memoria */ }
  }

  const usuarioActual = (datos) => datos.usuarios.find((u) => u.id === leerSesion()) || null;

  const sinSesion = () => new ErrorNexo("Tu sesión expiró. Volvé a ingresar.", "sin_sesion");
  const prohibido = (mensaje) => new ErrorNexo(mensaje || "Tu rol no permite realizar esta acción.", "prohibido");

  async function consultar(fn) {
    await demora();
    const datos = leer();
    const usuario = usuarioActual(datos);
    if (!usuario) throw sinSesion();
    return clonar(fn(datos, usuario));
  }

  async function mutar(fn) {
    await demora();
    const datos = leer();
    const usuario = usuarioActual(datos);
    if (!usuario) throw sinSesion();
    const resultado = fn(datos, usuario);
    guardar(datos);
    return clonar(resultado);
  }

  function exigir(usuario, permiso) {
    if (!puede(usuario, permiso)) throw prohibido();
  }

  function buscar(datos, id) {
    const contenido = datos.contenidos.find((c) => c.id === id);
    if (!contenido) throw new ErrorNexo("El contenido no existe.", "no_encontrado");
    return contenido;
  }

  /** Resuelve sitioId -> {id,nombre,slug}, igual que hace el backend al unir con la tabla sitios. */
  function formatearContenido(datos, c) {
    const sitio = datos.sitios.find((s) => s.id === c.sitioId) || null;
    const { sitioId, ...resto } = c;
    return { ...resto, sitio: sitio ? { id: sitio.id, nombre: sitio.nombre, slug: sitio.slug } : null };
  }

  const TIPOS = ["noticia", "proyecto", "galeria"];

  function validarDatos(datos, { conSlug, conSitioYTipo = false, tipoGaleria = false }) {
    const t = (x) => String(x ?? "").trim();

    let sitioId, tipo;
    if (conSitioYTipo) {
      sitioId = t(datos.sitioId);
      if (!sitioId) throw new ErrorNexo("Elegí a qué sitio pertenece el contenido.", "datos_invalidos");
      tipo = t(datos.tipo);
      if (!TIPOS.includes(tipo)) throw new ErrorNexo("Elegí un tipo de contenido válido.", "datos_invalidos");
      tipoGaleria = tipo === "galeria";
    }

    const limpio = {
      seccion: t(datos.seccion),
      slug: t(datos.slug).toLowerCase(),
      titulo: t(datos.titulo),
      resumen: t(datos.resumen),
      cuerpo: t(datos.cuerpo),
      adjuntos: (datos.adjuntos || []).map((a) => ({
        id: a.id, nombre: String(a.nombre), tamano: Number(a.tamano) || 0,
        url: typeof a.url === "string" ? a.url : undefined,
      })),
    };
    if (!limpio.seccion || !limpio.titulo || !limpio.resumen || (!tipoGaleria && !limpio.cuerpo)) {
      throw new ErrorNexo(tipoGaleria
        ? "Completá sección, título y resumen."
        : "Completá sección, título, resumen y contenido.", "datos_invalidos");
    }
    if (conSlug && !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(limpio.slug)) {
      throw new ErrorNexo("El identificador web solo admite minúsculas, números y guiones.", "datos_invalidos");
    }
    if (limpio.adjuntos.length > MAX_ADJUNTOS) {
      throw new ErrorNexo(`Se permiten hasta ${MAX_ADJUNTOS} adjuntos por versión.`, "datos_invalidos");
    }
    if (tipoGaleria && limpio.adjuntos.length < 1) {
      throw new ErrorNexo("Una galería necesita al menos una foto.", "datos_invalidos");
    }
    if (conSitioYTipo) {
      limpio.sitioId = sitioId;
      limpio.tipo = tipo;
    }
    return limpio;
  }

  /* ---------- API ---------- */

  const api = {
    modoDemo: true,
    roles: ROLES,
    estados: ESTADOS,
    puede,
    puedeRevisar,
    puedeReenviar,

    /* Autenticación */
    async sesion() {
      await demora();
      const datos = leer();
      const usuario = usuarioActual(datos);
      return usuario ? clonar(usuario) : null;
    },

    async iniciarSesion(usuarioId = "u1") {
      await demora();
      const datos = leer();
      const usuario = datos.usuarios.find((u) => u.id === usuarioId);
      if (!usuario) throw new ErrorNexo("No encontramos esa cuenta institucional.", "no_encontrado");
      usuario.ultimoAcceso = ahora();
      guardar(datos);
      guardarSesion(usuario.id);
      return clonar(usuario);
    },

    async cerrarSesion() {
      await demora();
      guardarSesion(null);
    },

    async reiniciarDemo() {
      await demora();
      guardar(semilla());
      guardarSesion("u1");
    },

    cambiarPassword() {
      return Promise.reject(new ErrorNexo("El cambio de contraseña solo está disponible cuando el panel usa un servidor real.", "no_disponible"));
    },

    /* Equipo y roles */
    listarUsuarios() {
      return consultar((datos) => datos.usuarios);
    },

    cambiarRol(usuarioId, rol) {
      return mutar((datos, usuario) => {
        exigir(usuario, "roles");
        if (!ROLES[rol]) throw new ErrorNexo("El rol indicado no existe.", "datos_invalidos");
        const objetivo = datos.usuarios.find((u) => u.id === usuarioId);
        if (!objetivo) throw new ErrorNexo("La persona no existe.", "no_encontrado");
        const admins = datos.usuarios.filter((u) => u.rol === "administrador").length;
        if (objetivo.rol === "administrador" && rol !== "administrador" && admins === 1) {
          throw new ErrorNexo("Tiene que quedar al menos un administrador.", "regla_negocio");
        }
        objetivo.rol = rol;
        return objetivo;
      });
    },

    crearUsuario({ nombre, email, rol, password } = {}) {
      return mutar((datos, usuario) => {
        exigir(usuario, "roles");
        const nombreLimpio = String(nombre ?? "").trim();
        const correo = String(email ?? "").trim().toLowerCase();
        if (!nombreLimpio) throw new ErrorNexo("Indicá el nombre y apellido.", "datos_invalidos");
        if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(correo)) throw new ErrorNexo("El correo no tiene un formato válido.", "datos_invalidos");
        if (!ROLES[rol]) throw new ErrorNexo("El rol indicado no existe.", "datos_invalidos");
        if (!password || password.length < 10) throw new ErrorNexo("La contraseña provisional debe tener al menos 10 caracteres.", "datos_invalidos");
        if (datos.usuarios.some((u) => u.email === correo)) {
          throw new ErrorNexo("Ya existe una persona con ese correo.", "datos_invalidos");
        }
        const nuevo = { id: nuevoId("u"), nombre: nombreLimpio, email: correo, rol, ultimoAcceso: null };
        datos.usuarios.push(nuevo);
        return nuevo;
      });
    },

    /* Contenidos */
    listarContenidos() {
      return consultar((datos) => datos.contenidos.map((c) => formatearContenido(datos, c)));
    },

    listarSitios() {
      return consultar((datos) => datos.sitios);
    },

    crearContenido(entrada) {
      return mutar((datos, usuario) => {
        exigir(usuario, "crear");
        const v = validarDatos(entrada, { conSlug: true, conSitioYTipo: true });
        if (!datos.sitios.some((s) => s.id === v.sitioId)) {
          throw new ErrorNexo("El sitio indicado no existe.", "datos_invalidos");
        }
        if (datos.contenidos.some((c) => c.sitioId === v.sitioId && c.slug === v.slug)) {
          throw new ErrorNexo("Ya existe un contenido con ese identificador web en este sitio.", "slug_duplicado");
        }
        const fecha = ahora();
        const contenido = {
          id: nuevoId("c"), sitioId: v.sitioId, tipo: v.tipo, seccion: v.seccion, slug: v.slug, autorId: usuario.id,
          estado: "en_revision", creado: fecha, actualizado: fecha, publicada: null,
          versiones: [{
            numero: 1, autorId: usuario.id, fecha, titulo: v.titulo, resumen: v.resumen,
            cuerpo: v.cuerpo, adjuntos: v.adjuntos, estado: "en_revision", decision: null,
          }],
          historial: [evento("envio", usuario.id, 1, "")],
        };
        datos.contenidos.push(contenido);
        return formatearContenido(datos, contenido);
      });
    },

    enviarNuevaVersion(id, entrada) {
      return mutar((datos, usuario) => {
        const contenido = buscar(datos, id);
        if (!puedeReenviar(usuario, contenido)) throw prohibido("Solo el autor o un administrador pueden enviar una nueva versión.");
        if (!["devuelto", "publicado"].includes(contenido.estado)) {
          throw new ErrorNexo("Solo se puede enviar una nueva versión de un contenido devuelto o publicado.", "estado_invalido");
        }
        const v = validarDatos(entrada, { conSlug: false, tipoGaleria: contenido.tipo === "galeria" });
        const previa = ultima(contenido);
        if (previa.estado === "devuelta") previa.estado = "conservada";
        const numero = previa.numero + 1;
        contenido.seccion = v.seccion;
        contenido.versiones.push({
          numero, autorId: usuario.id, fecha: ahora(), titulo: v.titulo, resumen: v.resumen,
          cuerpo: v.cuerpo, adjuntos: v.adjuntos, estado: "en_revision", decision: null,
        });
        contenido.estado = "en_revision";
        contenido.actualizado = ahora();
        contenido.historial.push(evento("envio", usuario.id, numero, ""));
        return formatearContenido(datos, contenido);
      });
    },

    decidir(id, { decision, comentario }) {
      return mutar((datos, usuario) => {
        const contenido = buscar(datos, id);
        if (contenido.estado !== "en_revision") {
          throw new ErrorNexo("Este contenido ya no está pendiente de revisión.", "estado_invalido");
        }
        if (!puedeRevisar(usuario, contenido)) {
          throw prohibido(puede(usuario, "revisar")
            ? "No podés revisar un contenido que cargaste vos."
            : "Solo un director de área o un administrador pueden decidir.");
        }
        const texto = String(comentario ?? "").trim();
        const version = ultima(contenido);
        let tipo;
        if (decision === "aprobar") {
          tipo = "aprobacion"; version.estado = "aprobada"; contenido.estado = "aprobado";
        } else if (decision === "devolver") {
          if (!texto) throw new ErrorNexo("Para devolver un contenido hay que explicar qué debe ajustarse.", "datos_invalidos");
          tipo = "devolucion"; version.estado = "devuelta"; contenido.estado = "devuelto";
        } else {
          throw new ErrorNexo("La decisión indicada no es válida.", "datos_invalidos");
        }
        const fecha = ahora();
        version.decision = { tipo, usuarioId: usuario.id, fecha, comentario: texto };
        contenido.actualizado = fecha;
        contenido.historial.push(evento(tipo, usuario.id, version.numero, texto));
        return formatearContenido(datos, contenido);
      });
    },

    publicar(id) {
      return mutar((datos, usuario) => {
        exigir(usuario, "publicar");
        const contenido = buscar(datos, id);
        if (contenido.estado !== "aprobado") {
          throw new ErrorNexo("Solo se puede publicar un contenido aprobado.", "estado_invalido");
        }
        contenido.versiones.forEach((v) => { if (v.estado === "publicada") v.estado = "reemplazada"; });
        const version = ultima(contenido);
        version.estado = "publicada";
        const fecha = ahora();
        contenido.estado = "publicado";
        contenido.actualizado = fecha;
        const sitio = datos.sitios.find((s) => s.id === contenido.sitioId) || null;
        contenido.publicada = {
          slug: contenido.slug, sitio: sitio ? { nombre: sitio.nombre, slug: sitio.slug } : null, tipo: contenido.tipo,
          seccion: contenido.seccion, titulo: version.titulo, resumen: version.resumen,
          cuerpo: version.cuerpo, adjuntos: version.adjuntos, version: version.numero, fecha,
        };
        contenido.historial.push(evento("publicacion", usuario.id, version.numero, ""));
        return formatearContenido(datos, contenido);
      });
    },

    archivar(id, motivo) {
      return mutar((datos, usuario) => {
        exigir(usuario, "archivar");
        const contenido = buscar(datos, id);
        if (contenido.estado === "archivado") throw new ErrorNexo("El contenido ya está archivado.", "estado_invalido");
        contenido.versiones.forEach((v) => { if (v.estado === "publicada") v.estado = "archivada"; });
        contenido.publicada = null;
        contenido.estado = "archivado";
        contenido.actualizado = ahora();
        contenido.historial.push(evento("archivo", usuario.id, ultima(contenido).numero, String(motivo ?? "").trim()));
        return formatearContenido(datos, contenido);
      });
    },

    restaurar(id) {
      return mutar((datos, usuario) => {
        exigir(usuario, "archivar");
        const contenido = buscar(datos, id);
        if (contenido.estado !== "archivado") throw new ErrorNexo("El contenido no está archivado.", "estado_invalido");
        const version = ultima(contenido);
        const mapa = { en_revision: "en_revision", devuelta: "devuelto", aprobada: "aprobado" };
        if (mapa[version.estado]) {
          contenido.estado = mapa[version.estado];
        } else {
          version.estado = "aprobada";
          contenido.estado = "aprobado";
        }
        contenido.actualizado = ahora();
        contenido.historial.push(evento("restauracion", usuario.id, version.numero, ""));
        return formatearContenido(datos, contenido);
      });
    },

    /* Vista pública: no requiere sesión y solo expone lo publicado. Siempre acotada a un sitio. */
    publico: {
      async listarSitios() {
        await demora();
        return clonar(leer().sitios);
      },

      async listar(sitioSlug, tipo) {
        await demora();
        const publicaciones = leer().contenidos
          .filter((c) => c.publicada && c.publicada.sitio && (!sitioSlug || c.publicada.sitio.slug === sitioSlug) && (!tipo || c.tipo === tipo))
          .map((c) => c.publicada);
        publicaciones.sort((a, b) => new Date(b.fecha) - new Date(a.fecha));
        return clonar(publicaciones);
      },

      async obtener(sitioSlug, slug) {
        await demora();
        const contenido = leer().contenidos.find((c) =>
          c.publicada && c.slug === slug && c.publicada.sitio && c.publicada.sitio.slug === sitioSlug);
        if (!contenido) throw new ErrorNexo("La publicación no existe o ya no está disponible.", "no_encontrado");
        return clonar(contenido.publicada);
      },
    },
  };

  window.Nexo.api = api;
  window.Nexo.ErrorNexo = ErrorNexo;
})();
