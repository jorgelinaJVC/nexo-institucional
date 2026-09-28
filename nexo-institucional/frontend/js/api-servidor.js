/* api-servidor.js — conecta el frontend con la API real.
 * Si config.modo es "servidor", reemplaza las funciones de Nexo.api (que en modo demo usan localStorage)
 * por pedidos HTTP con la misma firma. Las reglas de permisos de la interfaz (puede, puedeRevisar…) se mantienen
 * solo para mostrar u ocultar botones: la decisión real la toma siempre el servidor.
 */
(function () {
  "use strict";

  const config = Nexo.config || {};
  if (config.modo !== "servidor") return;

  const { api, ErrorNexo } = Nexo;
  const base = config.urlApi || "/api";
  const ruta = encodeURIComponent;

  async function pedir(metodo, camino, cuerpo) {
    const opciones = { method: metodo, credentials: "same-origin", headers: { Accept: "application/json" } };
    if (cuerpo instanceof FormData) {
      opciones.body = cuerpo;
    } else if (cuerpo !== undefined) {
      opciones.headers["Content-Type"] = "application/json";
      opciones.body = JSON.stringify(cuerpo);
    }

    let respuesta;
    try {
      respuesta = await fetch(base + camino, opciones);
    } catch (e) {
      throw new ErrorNexo("No pudimos conectar con el servidor. Revisá tu conexión.", "red");
    }

    let datos = null;
    try { datos = await respuesta.json(); } catch (e) { /* respuesta sin cuerpo */ }

    if (!respuesta.ok) {
      const error = (datos && datos.error) || {};
      throw new ErrorNexo(error.mensaje || "Ocurrió un error inesperado.", error.codigo || "error");
    }
    return datos;
  }

  /** Arma el multipart: los datos del formulario en JSON + los archivos nuevos + los ids de adjuntos que se conservan. */
  function formulario(datos) {
    const { adjuntos = [], ...campos } = datos;
    const conservar = adjuntos.filter((a) => a.id && !a.archivo).map((a) => a.id);
    const envio = new FormData();
    envio.append("datos", JSON.stringify({ ...campos, conservar }));
    adjuntos.filter((a) => a.archivo).forEach((a) => envio.append("adjuntos", a.archivo, a.nombre));
    return envio;
  }

  Object.assign(api, {
    modoDemo: false,

    async sesion() {
      return (await pedir("GET", "/auth/sesion")).usuario;
    },

    async iniciarSesion({ email, password }) {
      return (await pedir("POST", "/auth/login", { email, password })).usuario;
    },

    async cerrarSesion() {
      await pedir("POST", "/auth/logout");
    },

    cambiarPassword: (actual, nueva) => pedir("POST", "/auth/password", { actual, nueva }),

    async reiniciarDemo() {
      throw new ErrorNexo("Esta acción solo existe en el modo demostración.", "no_disponible");
    },

    listarUsuarios: () => pedir("GET", "/usuarios"),
    cambiarRol: (id, rol) => pedir("PATCH", `/usuarios/${ruta(id)}/rol`, { rol }),
    crearUsuario: (datos) => pedir("POST", "/usuarios", datos),

    listarSitios: () => pedir("GET", "/sitios"),

    listarContenidos: () => pedir("GET", "/contenidos"),
    crearContenido: (datos) => pedir("POST", "/contenidos", formulario(datos)),
    enviarNuevaVersion: (id, datos) => pedir("POST", `/contenidos/${ruta(id)}/versiones`, formulario(datos)),
    decidir: (id, { decision, comentario }) => pedir("POST", `/contenidos/${ruta(id)}/decision`, { decision, comentario }),
    publicar: (id) => pedir("POST", `/contenidos/${ruta(id)}/publicar`, {}),
    archivar: (id, motivo) => pedir("POST", `/contenidos/${ruta(id)}/archivar`, { motivo }),
    restaurar: (id) => pedir("POST", `/contenidos/${ruta(id)}/restaurar`, {}),

    publico: {
      listarSitios: () => pedir("GET", "/publico/sitios"),
      listar: (sitioSlug, tipo) => pedir("GET", `/publico/${ruta(sitioSlug)}/publicaciones${tipo ? `?tipo=${ruta(tipo)}` : ""}`),
      obtener: (sitioSlug, slug) => pedir("GET", `/publico/${ruta(sitioSlug)}/publicaciones/${ruta(slug)}`),
    },
  });
})();
