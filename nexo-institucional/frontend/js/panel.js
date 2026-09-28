/* panel.js — interfaz del panel editorial.
 * Todo acceso a datos pasa por Nexo.api, así el backend se conecta sin tocar este archivo.
 */
(function () {
  "use strict";

  const { api, util } = Nexo;
  const { esc, fechaCorta, iniciales, slugify, tamano, normalizar } = util;
  const $ = (selector, raiz = document) => raiz.querySelector(selector);

  /* ---------- Iconos ---------- */

  const TRAZOS = {
    panel: '<rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/>',
    inbox: '<polyline points="22 12 16 12 14 15 10 15 8 12 2 12"/><path d="M5.45 5.11L2 12v6a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-6l-3.45-6.89A2 2 0 0 0 16.76 4H7.24a2 2 0 0 0-1.79 1.11z"/>',
    history: '<path d="M3 12a9 9 0 1 0 3-6.7L3 8"/><polyline points="3 3 3 8 8 8"/><polyline points="12 7 12 12 15 14"/>',
    user: '<path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/>',
    userPlus: '<path d="M16 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="8.5" cy="7" r="4"/><line x1="20" y1="8" x2="20" y2="14"/><line x1="17" y1="11" x2="23" y2="11"/>',
    users: '<path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/>',
    archive: '<polyline points="21 8 21 21 3 21 3 8"/><rect x="1" y="3" width="22" height="5"/><line x1="10" y1="12" x2="14" y2="12"/>',
    globe: '<circle cx="12" cy="12" r="10"/><line x1="2" y1="12" x2="22" y2="12"/><path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"/>',
    fileText: '<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/>',
    fileCheck: '<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><polyline points="9 15 11 17 15 13"/>',
    image: '<rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><polyline points="21 15 16 10 5 21"/>',
    clock: '<circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/>',
    shield: '<path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/><polyline points="9 12 11 14 15 10"/>',
    checkCircle: '<circle cx="12" cy="12" r="10"/><polyline points="8 12 11 15 16 9"/>',
    check: '<polyline points="20 6 9 17 4 12"/>',
    lock: '<rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/>',
    arrowUpRight: '<line x1="7" y1="17" x2="17" y2="7"/><polyline points="7 7 17 7 17 17"/>',
    chevronRight: '<polyline points="9 18 15 12 9 6"/>',
    paperclip: '<path d="M21.44 11.05l-9.19 9.19a6 6 0 0 1-8.49-8.49l9.19-9.19a4 4 0 0 1 5.66 5.66l-9.2 9.19a2 2 0 0 1-2.83-2.83l8.49-8.48"/>',
    download: '<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/>',
    x: '<line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>',
    more: '<circle cx="5" cy="12" r="1"/><circle cx="12" cy="12" r="1"/><circle cx="19" cy="12" r="1"/>',
    send: '<line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/>',
  };

  const icono = (nombre, clase = "") =>
    `<svg class="icono ${clase}" viewBox="0 0 24 24" aria-hidden="true" focusable="false">${TRAZOS[nombre]}</svg>`;

  /* ---------- Configuración ---------- */

  const VISTAS = [
    { id: "resumen", menu: "Panel de control", pestana: "Resumen", iconoMenu: "panel", iconoPestana: "panel" },
    { id: "revision", menu: "Revisión editorial", pestana: "Revisión", iconoMenu: "fileCheck", iconoPestana: "inbox" },
    { id: "historial", menu: "Historial y archivo", pestana: "Historial", iconoMenu: "archive", iconoPestana: "history" },
    { id: "equipo", menu: "Equipo y roles", pestana: "Equipo", iconoMenu: "users", iconoPestana: "user" },
  ];

  const ABIERTOS = ["en_revision", "aprobado", "devuelto"];

  const ETIQUETA_EVENTO = {
    envio: "Enviada a revisión",
    aprobacion: "Aprobada",
    devolucion: "Devuelta con observaciones",
    publicacion: "Publicada",
    archivo: "Archivada",
    restauracion: "Restaurada",
  };

  const DESCRIPCION_VERSION = {
    en_revision: "En revisión del director de área.",
    devuelta: "Devuelta con observaciones.",
    aprobada: "Aprobada, pendiente de publicación.",
    publicada: "Publicada y visible para el público.",
    reemplazada: "Reemplazada por una actualización posterior.",
    conservada: "Conservada como respaldo institucional.",
    archivada: "Archivada: oculta del público, con su registro conservado.",
  };

  const EXTENSIONES_OK = ["jpg", "jpeg", "png", "pdf", "doc", "docx", "txt"];
  const MAX_BYTES = 10 * 1024 * 1024;
  const MAX_ADJUNTOS = 8;
  const FILTROS_INICIALES = { q: "", estado: "todos", seccion: "todas", sitio: "todos", tipo: "todos", orden: "recientes" };

  const TIPO_ETIQUETA = { noticia: "Noticia", proyecto: "Proyecto institucional", galeria: "Galería de fotos" };
  const TIPO_ICONO = { noticia: "fileText", proyecto: "fileCheck", galeria: "image" };

  /* ---------- Estado ---------- */

  const estado = {
    usuario: null,
    usuarios: [],
    sitios: [],
    contenidos: [],
    vista: "resumen",
    filtros: { ...FILTROS_INICIALES },
    seleccionRevision: null,
    seleccionHistorial: null,
    contenidoEnEdicion: null,
    adjuntosCarga: [],
  };

  /* ---------- Helpers ---------- */

  const ult = (c) => c.versiones[c.versiones.length - 1];

  const nombreUsuario = (id) => {
    const u = estado.usuarios.find((x) => x.id === id);
    return u ? u.nombre : "Usuario dado de baja";
  };

  const pill = (est) =>
    `<span class="estado estado--${est}"><span class="estado__punto"></span>${esc(api.estados[est])}</span>`;

  const pillTipo = (tipo) =>
    `<span class="pildora pildora--tipo">${icono(TIPO_ICONO[tipo] || "fileText")}${esc(TIPO_ETIQUETA[tipo] || tipo)}</span>`;

  function saludoHora() {
    const h = new Date().getHours();
    if (h < 12) return "Buenos días";
    if (h < 20) return "Buenas tardes";
    return "Buenas noches";
  }

  function vistaDesdeHash() {
    const h = location.hash.slice(1);
    return VISTAS.some((v) => v.id === h) ? h : "resumen";
  }

  function filtrar(base) {
    const f = estado.filtros;
    const busqueda = normalizar(f.q);
    const lista = base.filter((c) => {
      if (f.estado !== "todos" && c.estado !== f.estado) return false;
      if (f.seccion !== "todas" && c.seccion !== f.seccion) return false;
      if (f.sitio !== "todos" && (!c.sitio || c.sitio.slug !== f.sitio)) return false;
      if (f.tipo !== "todos" && c.tipo !== f.tipo) return false;
      if (!busqueda) return true;
      const texto = normalizar([
        ult(c).titulo, c.seccion, c.slug, nombreUsuario(c.autorId),
        c.sitio ? c.sitio.nombre : "", TIPO_ETIQUETA[c.tipo] || "",
      ].join(" "));
      return texto.includes(busqueda);
    });
    const comparar = {
      recientes: (a, b) => new Date(b.actualizado) - new Date(a.actualizado),
      antiguos: (a, b) => new Date(a.actualizado) - new Date(b.actualizado),
      titulo: (a, b) => ult(a).titulo.localeCompare(ult(b).titulo, "es"),
    }[f.orden];
    return lista.sort(comparar);
  }

  function contar(n) {
    $("#f-total").textContent = `${n} ${n === 1 ? "resultado" : "resultados"}`;
  }

  function aviso(texto, tipo = "ok") {
    const caja = document.createElement("div");
    caja.className = `aviso aviso--${tipo}`;
    caja.textContent = texto;
    $("#avisos").appendChild(caja);
    setTimeout(() => caja.remove(), tipo === "error" ? 6000 : 4000);
  }

  function confirmar({ titulo, texto, etiqueta = "Confirmar", conMotivo = false }) {
    return new Promise((resolver) => {
      const dialogo = $("#dialogo");
      $("#dialogo-titulo").textContent = titulo;
      $("#dialogo-texto").textContent = texto;
      $("#dialogo-ok").textContent = etiqueta;
      $("#dialogo-motivo-caja").hidden = !conMotivo;
      $("#dialogo-motivo").value = "";
      dialogo.addEventListener("close", () => {
        resolver({ ok: dialogo.returnValue === "ok", motivo: $("#dialogo-motivo").value.trim() });
      }, { once: true });
      dialogo.returnValue = "";
      dialogo.showModal();
    });
  }

  /* ---------- Carga y refresco de datos ---------- */

  async function refrescar() {
    try {
      const [usuarios, contenidos, sitios] = await Promise.all([api.listarUsuarios(), api.listarContenidos(), api.listarSitios()]);
      estado.usuarios = usuarios;
      estado.contenidos = contenidos;
      estado.sitios = sitios;
      const yo = usuarios.find((u) => u.id === estado.usuario.id);
      if (yo) estado.usuario = yo;
      render();
    } catch (err) {
      if (err.codigo === "sin_sesion") { location.replace("index.html"); return; }
      aviso(err.message || "No pudimos cargar los datos.", "error");
    }
  }

  async function ejecutar(promesa, mensajeOk) {
    try {
      const resultado = await promesa;
      if (mensajeOk) aviso(mensajeOk, "ok");
      await refrescar();
      return resultado;
    } catch (err) {
      if (err.codigo === "sin_sesion") { location.replace("index.html"); return null; }
      aviso(err.message || "No se pudo completar la acción.", "error");
      await refrescar();
      return null;
    }
  }

  /* ---------- Render: estructura común ---------- */

  function construirMenu() {
    $("#menu").innerHTML = VISTAS.map((v) =>
      `<a class="menu__enlace" href="#${v.id}" data-vista="${v.id}">${icono(v.iconoMenu)}<span>${v.menu}</span></a>`
    ).join("") +
      `<a class="menu__enlace" href="publico.html" target="_blank" rel="noopener">${icono("globe")}<span>Vista pública</span></a>`;
  }

  function renderLateral() {
    document.querySelectorAll("#menu [data-vista]").forEach((a) => {
      if (a.dataset.vista === estado.vista) a.setAttribute("aria-current", "page");
      else a.removeAttribute("aria-current");
    });

    const u = estado.usuario;
    $("#usuario-avatar").textContent = u.nombre.charAt(0).toUpperCase();
    $("#usuario-nombre").textContent = u.nombre;
    $("#usuario-rol").textContent = api.roles[u.rol].nombre;

    $("#demo").hidden = !api.modoDemo;
    $("#btn-cambiar-password").hidden = api.modoDemo;
    $("#selector-demo").innerHTML = estado.usuarios.map((x) =>
      `<option value="${esc(x.id)}"${x.id === u.id ? " selected" : ""}>${esc(x.nombre)} · ${esc(api.roles[x.rol].nombre)}</option>`
    ).join("");
  }

  function renderCabecera() {
    const primerNombre = estado.usuario.nombre.split(/\s+/)[0];
    $("#saludo").textContent = `${saludoHora()}, ${primerNombre}`;

    const boton = $("#btn-nuevo");
    const puedeCrear = api.puede(estado.usuario, "crear");
    boton.disabled = !puedeCrear;
    boton.title = puedeCrear ? "" : "Tu rol es de solo lectura.";
  }

  function renderPestanas() {
    const pendientes = estado.contenidos.filter((c) => c.estado === "en_revision").length;
    $("#pestanas").innerHTML = VISTAS.map((v) => {
      const activa = v.id === estado.vista ? ' aria-current="page"' : "";
      const insignia = v.id === "revision" && pendientes
        ? `<span class="insignia" title="${pendientes} pendientes">${pendientes}</span>` : "";
      return `<a class="pestana" href="#${v.id}"${activa}>${icono(v.iconoPestana)}<span>${v.pestana}</span>${insignia}</a>`;
    }).join("");
  }

  function renderFiltros() {
    $("#filtros").hidden = estado.vista === "equipo";

    const selectSitio = $("#f-sitio");
    selectSitio.innerHTML = `<option value="todos">Todos los sitios</option>` +
      estado.sitios.map((s) => `<option value="${esc(s.slug)}">${esc(s.nombre)}</option>`).join("");
    if (!estado.sitios.some((s) => s.slug === estado.filtros.sitio)) estado.filtros.sitio = "todos";
    selectSitio.value = estado.filtros.sitio;
    $("#f-tipo").value = estado.filtros.tipo;

    const secciones = [...new Set(estado.contenidos.map((c) => c.seccion))].sort((a, b) => a.localeCompare(b, "es"));
    const select = $("#f-seccion");
    select.innerHTML = `<option value="todas">Todas las secciones</option>` +
      secciones.map((s) => `<option value="${esc(s)}">${esc(s)}</option>`).join("");
    if (!secciones.includes(estado.filtros.seccion)) estado.filtros.seccion = "todas";
    select.value = estado.filtros.seccion;

    $("#lista-secciones").innerHTML = secciones.map((s) => `<option value="${esc(s)}"></option>`).join("");
  }

  function restablecerFiltros() {
    estado.filtros = { ...FILTROS_INICIALES };
    $("#f-q").value = "";
    $("#f-estado").value = "todos";
    $("#f-orden").value = "recientes";
  }

  function render() {
    renderLateral();
    renderCabecera();
    renderPestanas();
    renderFiltros();
    renderVista();
  }

  function renderVista() {
    const vistas = {
      resumen: vistaResumen,
      revision: vistaRevision,
      historial: vistaHistorial,
      equipo: vistaEquipo,
    };
    $("#vista").innerHTML = vistas[estado.vista]();
  }

  /* ---------- Vista: resumen ---------- */

  function tarjetaMetrica(m) {
    return `
      <article class="metrica">
        <div class="metrica__tope">
          <span class="chip-icono chip-icono--${m.tono}">${icono(m.icono)}</span>
          <span class="metrica__mas">${icono("more")}</span>
        </div>
        <p class="metrica__etiqueta">${m.etiqueta}</p>
        <p class="metrica__fila"><span class="metrica__valor">${m.valor}</span><span class="metrica__nota">${m.nota}</span></p>
      </article>`;
  }

  function filaActividad(c) {
    const v = ult(c);
    const adjuntos = v.adjuntos.length
      ? `<span class="fila__adjuntos">${icono("paperclip")}${v.adjuntos.length}</span>` : "";
    const sitioNombre = c.sitio ? esc(c.sitio.nombre) : "";
    return `
      <li>
        <button type="button" class="fila" data-accion="abrir-contenido" data-id="${esc(c.id)}">
          <span class="chip-icono chip-icono--verde">${icono(TIPO_ICONO[c.tipo] || "fileText")}</span>
          <span class="fila__texto">
            <span class="fila__titulo">${esc(v.titulo)} ${pill(c.estado)}</span>
            <span class="fila__meta">${sitioNombre} · ${esc(c.seccion)} · v${v.numero} · Actualizado ${fechaCorta(c.actualizado)} ${adjuntos}</span>
          </span>
          ${icono("chevronRight", "fila__flecha")}
        </button>
      </li>`;
  }

  function vistaResumen() {
    const todos = estado.contenidos;
    const lista = filtrar(todos);
    contar(lista.length);

    const versiones = todos.flatMap((c) => c.versiones);
    const metricas = [
      { etiqueta: "Contenidos totales", valor: todos.filter((c) => c.estado !== "archivado").length, nota: "en el circuito editorial", icono: "fileText", tono: "verde" },
      { etiqueta: "Pendientes de revisión", valor: todos.filter((c) => c.estado === "en_revision").length, nota: "requieren decisión", icono: "clock", tono: "ambar" },
      { etiqueta: "Publicados", valor: todos.filter((c) => c.publicada).length, nota: "visibles en la web", icono: "globe", tono: "verde" },
      { etiqueta: "Versiones archivadas", valor: versiones.filter((v) => ["reemplazada", "conservada", "archivada"].includes(v.estado)).length, nota: "conservadas para consulta", icono: "archive", tono: "gris" },
    ];

    const filas = lista.slice(0, 6).map(filaActividad).join("");
    const vacio = `<li class="vacio">${todos.length
      ? "Ningún contenido coincide con los filtros."
      : "Todavía no hay actividad. Cargá el primer contenido con «Nuevo contenido»."}</li>`;

    return `
      <div class="encabezado-seccion">
        <div>
          <p class="etiqueta">Resumen operativo</p>
          <h2 class="titulo-seccion">La información correcta, en el momento correcto.</h2>
          <p class="bajada">Supervisá el estado de cada contenido y mantené una trazabilidad completa antes de hacerlo público.</p>
        </div>
        <a class="enlace-flecha" href="#revision">Ver bandeja de revisión ${icono("arrowUpRight")}</a>
      </div>

      <div class="metricas">${metricas.map(tarjetaMetrica).join("")}</div>

      <div class="rejilla rejilla--resumen">
        <section class="panel" aria-labelledby="t-actividad">
          <header class="panel__cabecera">
            <div>
              <h3 class="panel__titulo" id="t-actividad">Actividad reciente</h3>
              <p class="panel__sub">Últimas novedades del circuito editorial</p>
            </div>
            <a class="enlace-suave" href="#historial">Ver historial</a>
          </header>
          <ul class="filas">${filas || vacio}</ul>
        </section>

        <aside class="control">
          <div class="control__tope">
            <span class="chip-icono chip-icono--oscuro">${icono("shield")}</span>
            <span class="pildora pildora--lima">Control editorial</span>
          </div>
          <h3 class="control__titulo">La web pública bajo control.</h3>
          <p class="control__texto">Ningún contenido llega al sitio sin una decisión registrada y una versión identificable.</p>
          <ul class="control__lista">
            <li>${icono("checkCircle")}Aprobación por director de área</li>
            <li>${icono("history")}Historial de versiones inmutable</li>
            <li>${icono("lock")}Publicación explícita y auditable</li>
          </ul>
          <a class="btn btn--lima btn--bloque" href="publico.html" target="_blank" rel="noopener">Explorar vista pública ${icono("arrowUpRight")}</a>
        </aside>
      </div>`;
  }

  /* ---------- Vista: revisión ---------- */

  function chipAdjunto(a) {
  const info = `
    <span class="adjunto__icono">${icono("fileText")}</span>
    <span class="adjunto__info"><strong>${esc(a.nombre)}</strong><small>${tamano(a.tamano)}</small></span>`;
  
  const urlVer = a.id ? `/api/adjuntos/${encodeURIComponent(a.id)}` : (a.url || null);
  
  if (!urlVer) return `<div class="adjunto">${info}</div>`; // sin servidor y sin vista previa: no hay nada que abrir
  
  const urlDescargar = a.id ? `${urlVer}?descarga=1` : urlVer;
  
  return `
    <div class="adjunto">
      <a class="adjunto__ver" href="${esc(urlVer)}" target="_blank" rel="noopener" title="Ver ${esc(a.nombre)}">${info}</a>
      <a class="btn-icono" href="${esc(urlDescargar)}" download="${esc(a.nombre)}" aria-label="Descargar ${esc(a.nombre)}" title="Descargar">${icono("download")}</a>
    </div>`;
}

// 1. Abrir modal y cargar datos al hacer clic en "Editar"
function abrirModalEdicion(documento) {
    document.getElementById('edit-id').value = documento.id;
    document.getElementById('edit-titulo').value = documento.titulo;
    document.getElementById('modal-editar').style.display = 'block';
}

// 2. Enviar los datos modificados al backend utilizando FormData
document.getElementById('form-editar-documento').addEventListener('submit async', async (e) => {
    e.preventDefault();
    
    const id = document.getElementById('edit-id').value;
    const titulo = document.getElementById('edit-titulo').value;
    const archivoInput = document.getElementById('edit-archivo').files[0];

    const formData = new FormData();
    formData.append('titulo', titulo);
    if (archivoInput) {
        formData.append('documento', archivoInput); // El nombre debe coincidir con el que espera multer en el backend
    }

    try {
        const respuesta = await fetch(`/api/contenidos/${id}`, {
            method: 'PUT',
            body: formData,
            headers: {
                // Incluye tu token de autorización si tu panel utiliza autenticación Bearer
                'Authorization': `Bearer ${localStorage.getItem('token')}` 
            }
        });

        const resultado = await respuesta.json();
        if (resultado.success) {
            alert('Documentación actualizada con éxito. Quedará nuevamente lista para revisión.');
            document.getElementById('modal-editar').style.display = 'none';
            location.reload(); // Recargar el panel para ver los cambios
        } else {
            alert('Error al actualizar: ' + resultado.error);
        }
    } catch (error) {
        console.error('Error de red:', error);
    }
});
  /** Grilla de miniaturas para una galería. Con servidor se ven las fotos reales; en demo, la copia liviana si existe. */
  function fotoGaleria(a) {
    const pie = `<span class="foto__nombre">${esc(a.nombre)}</span>`;
    const url = a.id ? `/api/adjuntos/${encodeURIComponent(a.id)}` : a.url;
    if (url) {
      return `
        <a class="foto" href="${esc(url)}" target="_blank" rel="noopener" title="Ver ${esc(a.nombre)}">
          <img src="${esc(url)}" alt="${esc(a.nombre)}" loading="lazy">
          ${pie}
        </a>`;
    }
    return `<div class="foto foto--marcador">${icono("image")}${pie}</div>`;
  }

  function bloqueDecision(c) {
    const yo = estado.usuario;
    const v = ult(c);

    if (c.estado === "en_revision") {
      if (api.puedeRevisar(yo, c)) {
        return `
          <div class="decision">
            <label class="etiqueta" for="comentario-decision">Comentario para el autor</label>
            <p class="decision__ayuda">Obligatorio al devolver, opcional al aprobar.</p>
            <textarea class="campo" id="comentario-decision" rows="3" maxlength="600" placeholder="Explicá qué debe ajustarse o por qué se aprueba…"></textarea>
            <p class="error-inline" id="error-decision" role="alert" hidden></p>
            <div class="decision__acciones">
              <button type="button" class="btn btn--peligro" data-accion="devolver" data-id="${esc(c.id)}">${icono("x")}Devolver</button>
              <button type="button" class="btn btn--claro" data-accion="aprobar" data-id="${esc(c.id)}">${icono("check")}Aprobar</button>
            </div>
          </div>`;
      }
      const motivo = api.puede(yo, "revisar")
        ? "No podés revisar un contenido que cargaste vos. Lo decide otra persona del área."
        : "Está esperando la decisión de un director de área o del administrador.";
      return `<div class="callout callout--info"><p class="callout__texto">${motivo}</p></div>`;
    }

    if (c.estado === "aprobado") {
      if (api.puede(yo, "publicar")) {
        return `
          <div class="callout callout--ok">
            <div>
              <p class="callout__titulo">Aprobado, falta publicarlo</p>
              <p class="callout__texto">Nada es visible en la web hasta que lo publiques de forma explícita.</p>
            </div>
            <div class="callout__acciones">
              <button type="button" class="btn btn--primario" data-accion="publicar" data-id="${esc(c.id)}">${icono("globe")}Publicar en la vista pública</button>
            </div>
          </div>`;
      }
      return `<div class="callout callout--info"><p class="callout__texto">Aprobado. Falta que un director o el administrador lo publique.</p></div>`;
    }

    // devuelto
    const decision = v.decision || {};
    const puedeReenviar = api.puedeReenviar(yo, c);
    return `
      <div class="callout callout--alerta">
        <div>
          <p class="callout__titulo">Devuelto con observaciones${decision.usuarioId ? ` por ${esc(nombreUsuario(decision.usuarioId))}` : ""}</p>
          <p class="callout__texto">${esc(decision.comentario || "Sin comentarios.")}</p>
        </div>
        ${puedeReenviar ? `<div class="callout__acciones"><button type="button" class="btn btn--primario" data-accion="nueva-version" data-id="${esc(c.id)}">${icono("send")}Enviar nueva versión</button></div>` : ""}
      </div>`;
  }

  function detalleRevision(c) {
    const v = ult(c);
    const esGaleria = c.tipo === "galeria";
    const adjuntosHtml = v.adjuntos.length
      ? (esGaleria ? `<div class="galeria-grid">${v.adjuntos.map(fotoGaleria).join("")}</div>` : `<div class="adjuntos">${v.adjuntos.map(chipAdjunto).join("")}</div>`)
      : `<p class="vacio vacio--linea">Esta versión no tiene adjuntos.</p>`;

    // Bloque visual para la Opción A (Borrador y Reemplazo)
    const seccionBorradorHtml = `
      <div class="card p-3 my-3 border-warning bg-light">
        <h5 class="etiqueta text-dark">Gestión de Borrador y Adjuntos</h5>
        <p class="text-muted small">Podés actualizar el archivo adjunto las veces que necesites antes de enviarlo definitivamente.</p>
        
        <div class="input-group mb-2">
          <input type="file" class="form-control" id="input-nuevo-adjunto-${c.id}">
          <button type="button" class="btn btn--secundario" data-accion="reemplazar-archivo" data-id="${c.id}">
            Actualizar Archivo
          </button>
        </div>

        <button type="button" class="btn btn--primario w-100 mt-2" data-accion="enviar-definitivo" data-id="${c.id}">
          ${icono("send")} Enviar definitivamente al Director
        </button>
      </div>
    `;

    return `
      <article class="detalle">
        <header class="detalle__cabecera">
          <div class="detalle__pills">${pill(c.estado)}${pillTipo(c.tipo)}<span class="pildora">Versión ${v.numero}</span></div>
          <h3 class="detalle__titulo">${esc(v.titulo)}</h3>
          <p class="detalle__meta">${c.sitio ? `${esc(c.sitio.nombre)} · ` : ""}${esc(c.seccion)} · enviado por ${esc(nombreUsuario(v.autorId))} el ${fechaCorta(v.fecha)}</p>
        </header>

        <div class="detalle__cuerpo">
          <div class="detalle__principal">
            <section>
              <h4 class="etiqueta">Resumen para publicar</h4>
              <p class="texto-resumen">${esc(v.resumen)}</p>
            </section>
            ${v.cuerpo ? `
            <section>
              <h4 class="etiqueta">${esGaleria ? "Descripción" : "Contenido"}</h4>
              <div class="caja-texto">${esc(v.cuerpo)}</div>
            </section>` : ""}
            <section>
              <h4 class="etiqueta">${esGaleria ? "Fotos de esta versión" : "Adjuntos de esta versión"}</h4>
              ${adjuntosHtml}
            </section>
            
            <!-- Insertamos la sección de borrador aquí -->
            ${seccionBorradorHtml}
          </div>

          <aside class="ficha">
            <h4 class="etiqueta">Ficha editorial</h4>
            <dl>
              <div><dt>Sitio</dt><dd>${c.sitio ? esc(c.sitio.nombre) : "—"}</dd></div>
              <div><dt>Autor</dt><dd>${esc(nombreUsuario(c.autorId))}</dd></div>
              <div><dt>Versión</dt><dd>v${v.numero}</dd></div>
              <div><dt>Último cambio</dt><dd>${fechaCorta(c.actualizado)}</dd></div>
              <div><dt>Identificador</dt><dd>${esc(c.slug)}</dd></div>
            </dl>
          </aside>
        </div>

        ${bloqueDecision(c)}
      </article>`;
  }

  function vistaRevision() {
    const lista = filtrar(estado.contenidos.filter((c) => ABIERTOS.includes(c.estado)));
    contar(lista.length);
    if (!lista.some((c) => c.id === estado.seleccionRevision)) {
      estado.seleccionRevision = lista.length ? lista[0].id : null;
    }
    const seleccionado = lista.find((c) => c.id === estado.seleccionRevision);
    const pendientes = estado.contenidos.filter((c) => c.estado === "en_revision").length;

    const bajada = api.puede(estado.usuario, "revisar")
      ? "Como director, revisá el contenido enviado por el equipo, aprobalo o devolvelo con observaciones."
      : "Seguí el estado de las solicitudes enviadas: acá ves quién decidió y qué observaciones dejó.";

    const items = lista.map((c) => {
      const v = ult(c);
      return `
        <li>
          <button type="button" class="solicitud${c.id === estado.seleccionRevision ? " solicitud--activa" : ""}" data-accion="seleccionar-revision" data-id="${esc(c.id)}">
            <span class="solicitud__tope">${pill(c.estado)}<span class="solicitud__version">v${v.numero}</span></span>
            <strong class="solicitud__titulo">${esc(v.titulo)}</strong>
            <span class="solicitud__meta">${c.sitio ? `${esc(c.sitio.nombre)} · ` : ""}${esc(c.seccion)} · ${fechaCorta(c.actualizado)}</span>
          </button>
        </li>`;
    }).join("");

    return `
      <div class="encabezado-seccion">
        <div>
          <p class="etiqueta">Bandeja de revisión</p>
          <h2 class="titulo-seccion">Decisiones claras, antes de publicar.</h2>
          <p class="bajada">${bajada}</p>
        </div>
        <span class="pildora pildora--ambar">${icono("clock")}${pendientes} ${pendientes === 1 ? "pendiente" : "pendientes"}</span>
      </div>

      <div class="rejilla rejilla--dividida">
        <section class="panel" aria-labelledby="t-solicitudes">
          <header class="panel__cabecera">
            <div>
              <h3 class="panel__titulo" id="t-solicitudes">Solicitudes recibidas</h3>
              <p class="panel__sub">Seleccioná un contenido para ver el detalle.</p>
            </div>
          </header>
          <ul class="solicitudes">${items || `<li class="vacio">No hay solicitudes abiertas. Cuando alguien envíe contenido a revisión, va a aparecer acá.</li>`}</ul>
        </section>

        <section class="panel panel--detalle" aria-label="Detalle de la solicitud">
          ${seleccionado ? detalleRevision(seleccionado) : `<p class="vacio vacio--centrado">Elegí una solicitud de la lista para revisarla.</p>`}
        </section>
      </div>`;
  }

  /* ---------- Vista: historial y archivo ---------- */

  function eventosDeVersion(c, numero) {
    return c.historial
      .filter((e) => e.version === numero)
      .map((e) => `
        <li class="version__evento">
          <strong>${ETIQUETA_EVENTO[e.tipo] || e.tipo}</strong> · ${esc(nombreUsuario(e.usuarioId))} · ${fechaCorta(e.fecha)}
          ${e.comentario ? `<span class="version__comentario">“${esc(e.comentario)}”</span>` : ""}
        </li>`).join("");
  }

  function lineaDeVersiones(c) {
    const actual = c.publicada ? c.publicada.version : ult(c).numero;
    return [...c.versiones].reverse().map((v) => `
      <li class="version${v.numero === actual ? " version--actual" : ""}">
        <span class="version__punto" aria-hidden="true"></span>
        <div class="version__tarjeta">
          <div class="version__tope">
            <strong class="version__nombre">Versión ${v.numero}.0</strong>
            ${v.numero === actual ? '<span class="version__actual">Actual</span>' : ""}
            <time class="version__fecha">${fechaCorta(v.fecha)}</time>
          </div>
          <p class="version__desc">${DESCRIPCION_VERSION[v.estado] || ""}</p>
          <ul class="version__eventos">${eventosDeVersion(c, v.numero)}</ul>
        </div>
      </li>`).join("");
  }

  function cajaArchivo(c) {
    const yo = estado.usuario;
    if (c.estado === "archivado") {
      return `
        <div class="archivar">
          <div>
            <p class="archivar__titulo">Este contenido está archivado</p>
            <p class="archivar__texto">No es visible al público y conserva todo su registro. Para mostrarlo de nuevo hay que publicarlo otra vez.</p>
          </div>
          ${api.puede(yo, "archivar") ? `<button type="button" class="btn btn--claro" data-accion="restaurar" data-id="${esc(c.id)}">${icono("history")}Restaurar</button>` : ""}
        </div>`;
    }
    return `
      <div class="archivar">
        <div>
          <p class="archivar__titulo">¿Necesitás retirar este contenido?</p>
          <p class="archivar__texto">Archivar lo oculta del público pero conserva el registro.</p>
        </div>
        ${api.puede(yo, "archivar")
          ? `<button type="button" class="btn btn--claro" data-accion="archivar" data-id="${esc(c.id)}">${icono("archive")}Archivar sin eliminar</button>`
          : `<span class="archivar__nota">Lo pueden archivar directores y administradores.</span>`}
      </div>`;
  }

  function vistaHistorial() {
    const lista = filtrar(estado.contenidos);
    contar(lista.length);
    if (!lista.some((c) => c.id === estado.seleccionHistorial)) {
      estado.seleccionHistorial = lista.length ? lista[0].id : null;
    }
    const c = lista.find((x) => x.id === estado.seleccionHistorial);

    const items = lista.map((x) => `
      <li>
        <button type="button" class="registro${x.id === estado.seleccionHistorial ? " registro--activo" : ""}" data-accion="seleccionar-historial" data-id="${esc(x.id)}">
          <strong class="registro__titulo">${esc(ult(x).titulo)}</strong>
          <span class="registro__meta">${x.sitio ? `${esc(x.sitio.nombre)} · ` : ""}${esc(x.seccion)} · ${x.versiones.length} ${x.versiones.length === 1 ? "versión" : "versiones"}</span>
          ${pill(x.estado)}
        </button>
      </li>`).join("");

    const puedeNueva = c && c.estado === "publicado" && api.puedeReenviar(estado.usuario, c);

    const detalle = c ? `
      <div class="linea-cabecera">
        <span class="chip-icono chip-icono--verde">${icono(TIPO_ICONO[c.tipo] || "history")}</span>
        <div>
          <p class="etiqueta">Línea de tiempo</p>
          <h3 class="panel__titulo">Versiones del contenido</h3>
          <p class="panel__sub">${esc(ult(c).titulo)} · ${c.sitio ? `${esc(c.sitio.nombre)} · ` : ""}${esc(c.seccion)}</p>
        </div>
        ${puedeNueva ? `<button type="button" class="btn btn--suave btn--mini linea-cabecera__accion" data-accion="nueva-version" data-id="${esc(c.id)}">Proponer nueva versión</button>` : ""}
      </div>
      <ol class="linea">${lineaDeVersiones(c)}</ol>
      ${cajaArchivo(c)}` : `<p class="vacio vacio--centrado">Elegí un registro de la lista para ver sus versiones.</p>`;

    return `
      <div class="encabezado-seccion">
        <div>
          <p class="etiqueta">Trazabilidad</p>
          <h2 class="titulo-seccion">Cada cambio queda registrado.</h2>
          <p class="bajada">Reemplazar información no borra lo anterior: conserva autores, fechas, decisiones y el motivo de cada versión.</p>
        </div>
        <span class="pildora">${icono("history")}Retención activa</span>
      </div>

      <div class="rejilla rejilla--dividida">
        <section class="panel" aria-labelledby="t-registros">
          <header class="panel__cabecera">
            <div>
              <h3 class="panel__titulo" id="t-registros">Registros conservados</h3>
              <p class="panel__sub">Ningún reemplazo borra el historial.</p>
            </div>
          </header>
          <ul class="registros">${items || `<li class="vacio">Ningún registro coincide con los filtros.</li>`}</ul>
        </section>

        <section class="panel panel--linea" aria-label="Versiones del contenido">${detalle}</section>
      </div>`;
  }

  /* ---------- Vista: equipo y roles ---------- */

  function vistaEquipo() {
    const esAdmin = api.puede(estado.usuario, "roles");
    const filas = estado.usuarios.map((u) => {
      const rol = esAdmin
        ? `<select class="select select--tabla" data-accion="cambiar-rol" data-id="${esc(u.id)}" aria-label="Rol de ${esc(u.nombre)}">
            ${Object.entries(api.roles).map(([clave, r]) => `<option value="${clave}"${clave === u.rol ? " selected" : ""}>${r.nombre}</option>`).join("")}
          </select>`
        : `<span class="pildora">${esc(api.roles[u.rol].nombre)}</span>`;
      return `
        <tr>
          <td>
            <div class="persona">
              <span class="persona__avatar">${esc(iniciales(u.nombre))}</span>
              <span><strong class="persona__nombre">${esc(u.nombre)}</strong><span class="persona__correo">${esc(u.email)}</span></span>
            </div>
          </td>
          <td>${rol}</td>
          <td class="celda-suave">${fechaCorta(u.ultimoAcceso)}</td>
          <td><span class="permiso">${icono("checkCircle")}${esc(api.roles[u.rol].permisos)}</span></td>
        </tr>`;
    }).join("");

    return `
      <div class="encabezado-seccion">
        <div>
          <p class="etiqueta">Gobernanza</p>
          <h2 class="titulo-seccion">Personas y permisos.</h2>
          <p class="bajada">El administrador define quién puede cargar información y quién puede tomar decisiones de publicación.</p>
        </div>
        <span class="cabecera-equipo__derecha">
          <span class="pildora">${icono("user")}${estado.usuarios.length} ${estado.usuarios.length === 1 ? "integrante" : "integrantes"}</span>
          ${esAdmin ? `<button type="button" class="btn btn--primario btn--mini" data-accion="abrir-alta-integrante">${icono("userPlus")}Agregar integrante</button>` : ""}
        </span>
      </div>

      <section class="panel" aria-labelledby="t-permisos">
        <header class="panel__cabecera">
          <div>
            <h3 class="panel__titulo" id="t-permisos">Directorio de permisos</h3>
            <p class="panel__sub">${esAdmin ? "Un rol define qué puede hacer cada persona dentro del circuito." : "Solo el administrador puede cambiar los roles del equipo."}</p>
          </div>
        </header>
        <div class="tabla-envoltura">
          <table class="tabla">
            <thead>
              <tr><th scope="col">Persona</th><th scope="col">Rol actual</th><th scope="col">Último acceso</th><th scope="col">Permisos</th></tr>
            </thead>
            <tbody>${filas}</tbody>
          </table>
        </div>
      </section>`;
  }

  /* ---------- Formulario de carga ---------- */

  const EXTENSIONES_IMAGEN = ["jpg", "jpeg", "png"];
  const esImagen = (nombre) => EXTENSIONES_IMAGEN.includes(nombre.split(".").pop().toLowerCase());
  const DEMO_PREVIEW_MAX_BYTES = 1.5 * 1024 * 1024;

  /** Miniatura real de la foto: archivo recién elegido, o ya guardada (servidor: por id; demo: copia liviana). */
  function miniaturaAdjunto(a) {
    if (a.url) return a.url;
    if (a.archivo) {
      try { return URL.createObjectURL(a.archivo); } catch (e) { return null; }
    }
    if (a.id) return `/api/adjuntos/${encodeURIComponent(a.id)}`;
    return null;
  }

  function leerComoDataUrl(archivo) {
    return new Promise((resolver, rechazar) => {
      const lector = new FileReader();
      lector.onload = () => resolver(lector.result);
      lector.onerror = () => rechazar(lector.error);
      lector.readAsDataURL(archivo);
    });
  }

  function renderAdjuntosCarga() {
    $("#lista-adjuntos").innerHTML = estado.adjuntosCarga.map((a, i) => {
      const url = esImagen(a.nombre) ? miniaturaAdjunto(a) : null;
      const vista = url
        ? `<img class="adjunto-item__miniatura" src="${esc(url)}" alt="Vista previa de ${esc(a.nombre)}">`
        : `<span class="adjunto-item__icono">${icono("paperclip")}</span>`;
      return `
      <li class="adjunto-item">
        <span class="adjunto-item__nombre">
          ${vista}
          <span>${esc(a.nombre)} <small>${tamano(a.tamano)}</small></span>
        </span>
        <button type="button" class="btn btn--peligro btn--mini" data-accion="quitar-adjunto" data-indice="${i}">${icono("x")}Quitar</button>
      </li>`;
    }).join("");
  }

  function mostrarErrores(mensajes) {
    const caja = $("#carga-errores");
    caja.innerHTML = `<ul>${mensajes.map((m) => `<li>${esc(m)}</li>`).join("")}</ul>`;
    caja.hidden = false;
  }

  function limpiarErrores() {
    const caja = $("#carga-errores");
    caja.hidden = true;
    caja.innerHTML = "";
  }

  function poblarSelectorSitios() {
    $("#c-sitio").innerHTML = estado.sitios.map((s) => `<option value="${esc(s.id)}">${esc(s.nombre)}</option>`).join("");
  }

  /** El "cuerpo" es opcional en una galería (vive de sus fotos), y los adjuntos pasan a ser el foco. */
  function actualizarEtiquetasSegunTipo() {
    const esGaleria = $("#c-tipo").value === "galeria";
    $("#c-cuerpo-etiqueta").innerHTML = esGaleria ? "Descripción breve (opcional)" : "Contenido completo <i>*</i>";
    $("#c-cuerpo").placeholder = esGaleria
      ? "Opcional: una bajada corta para acompañar las fotos…"
      : "Escribí la información que se publicará en el sitio institucional…";
    $("#c-adjuntos-titulo").textContent = esGaleria ? "Fotos de la galería" : "Imágenes y documentos";
  }

  function abrirCarga(contenido = null) {
    estado.contenidoEnEdicion = contenido;
    estado.adjuntosCarga = [];
    $("#form-carga").reset();
    limpiarErrores();
    poblarSelectorSitios();

    const slug = $("#c-slug");
    delete slug.dataset.manual;
    slug.readOnly = false;
    const sitioSelect = $("#c-sitio");
    const tipoSelect = $("#c-tipo");

    if (contenido) {
      const v = ult(contenido);
      sitioSelect.value = contenido.sitio ? contenido.sitio.id : "";
      sitioSelect.disabled = true;
      tipoSelect.value = contenido.tipo;
      tipoSelect.disabled = true;
      $("#c-seccion").value = contenido.seccion;
      slug.value = contenido.slug;
      slug.readOnly = true;
      $("#c-titulo").value = v.titulo;
      $("#c-resumen").value = v.resumen;
      $("#c-cuerpo").value = v.cuerpo;
      estado.adjuntosCarga = v.adjuntos.map((a) => ({ id: a.id, nombre: a.nombre, tamano: a.tamano, archivo: null, url: a.url }));
      $("#carga-titulo").textContent = "Enviar una nueva versión";
      $("#carga-sub").textContent = `Se conserva la versión ${v.numero} y esta quedará como versión ${v.numero + 1}, pendiente de revisión.`;
      $("#btn-enviar-texto").textContent = "Enviar nueva versión";
    } else {
      sitioSelect.disabled = false;
      tipoSelect.disabled = false;
      tipoSelect.value = "noticia";
      $("#carga-titulo").textContent = "Cargar información institucional";
      $("#carga-sub").textContent = "El contenido quedará como versión 1 y se enviará a revisión del director del área.";
      $("#btn-enviar-texto").textContent = "Enviar a revisión";
    }

    actualizarEtiquetasSegunTipo();
    renderAdjuntosCarga();
    $("#panel-carga").hidden = false;
    $("#panel-carga").scrollIntoView({ block: "nearest" });
    (contenido ? $("#c-titulo") : $("#c-seccion")).focus();
  }

  function cerrarCarga() {
    $("#panel-carga").hidden = true;
    estado.contenidoEnEdicion = null;
    estado.adjuntosCarga = [];
  }

  async function agregarArchivos(archivos) {
    const rechazos = [];
    const nuevos = [];
    for (const archivo of archivos) {
      const extension = archivo.name.split(".").pop().toLowerCase();
      if (estado.adjuntosCarga.length + nuevos.length >= MAX_ADJUNTOS) {
        rechazos.push(`Se permiten hasta ${MAX_ADJUNTOS} adjuntos por versión.`);
        break;
      }
      if (!EXTENSIONES_OK.includes(extension)) {
        rechazos.push(`${archivo.name}: formato no permitido.`);
      } else if (archivo.size > MAX_BYTES) {
        rechazos.push(`${archivo.name}: supera los 10 MB.`);
      } else {
        nuevos.push({ nombre: archivo.name, tamano: archivo.size, archivo });
      }
    }
    estado.adjuntosCarga.push(...nuevos);
    renderAdjuntosCarga();
    if (rechazos.length) mostrarErrores(rechazos); else limpiarErrores();

    // Modo demo: no hay servidor que guarde el archivo, así que le sumamos una copia liviana
    // para poder verlo después (en Revisión, Historial, etc.). Solo fotos chicas: en un navegador
    // real esto se guarda en localStorage, que tiene poco espacio.
    if (api.modoDemo) {
      for (const item of nuevos) {
        if (!esImagen(item.nombre) || item.archivo.size > DEMO_PREVIEW_MAX_BYTES) continue;
        try { item.url = await leerComoDataUrl(item.archivo); } catch (e) { /* sin vista previa, sigue funcionando igual */ }
      }
      renderAdjuntosCarga();
    }
  }

  function leerFormulario() {
    return {
      sitioId: $("#c-sitio").value,
      tipo: $("#c-tipo").value,
      seccion: $("#c-seccion").value.trim(),
      slug: $("#c-slug").value.trim().toLowerCase(),
      titulo: $("#c-titulo").value.trim(),
      resumen: $("#c-resumen").value.trim(),
      cuerpo: $("#c-cuerpo").value.trim(),
      // Con servidor viajan los archivos nuevos (archivo) y los ids de los que se conservan (id).
      // En modo demo viaja además "url": la copia liviana que permite verlo después.
      adjuntos: estado.adjuntosCarga.map((a) => ({ id: a.id, nombre: a.nombre, tamano: a.tamano, archivo: a.archivo, url: a.url })),
    };
  }

  function validarCarga(d) {
    const errores = [];
    const esGaleria = d.tipo === "galeria";
    if (!estado.contenidoEnEdicion && !d.sitioId) errores.push("Elegí a qué sitio pertenece el contenido.");
    if (!d.seccion) errores.push("Indicá la sección.");
    if (!d.slug) errores.push("Indicá el identificador web.");
    else if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(d.slug)) {
      errores.push("El identificador web solo admite minúsculas, números y guiones (ej. convocatoria-becas-2026).");
    }
    if (!d.titulo) errores.push("Escribí el título público.");
    if (!d.resumen) errores.push("Escribí la bajada o resumen.");
    if (!esGaleria && !d.cuerpo) errores.push("Escribí el contenido completo.");
    if (esGaleria && d.adjuntos.length < 1) errores.push("Subí al menos una foto para la galería.");
    return errores;
  }

  async function enviarCarga(evento) {
    evento.preventDefault();
    limpiarErrores();
    const datos = leerFormulario();
    const errores = validarCarga(datos);
    if (errores.length) { mostrarErrores(errores); return; }

    const boton = $("#btn-enviar");
    boton.disabled = true;
    try {
      const enEdicion = estado.contenidoEnEdicion;
      const guardado = enEdicion
        ? await api.enviarNuevaVersion(enEdicion.id, datos)
        : await api.crearContenido(datos);
      cerrarCarga();
      aviso("Enviado a revisión. El director del área ya puede decidir.", "ok");
      await refrescar();
      restablecerFiltros();
      estado.seleccionRevision = guardado.id;
      irA("revision");
    } catch (err) {
      if (err.codigo === "sin_sesion") { location.replace("index.html"); return; }
      mostrarErrores([err.message || "No se pudo enviar el contenido."]);
    } finally {
      boton.disabled = false;
    }
  }

  /* ---------- Alta de integrantes ---------- */

  function poblarSelectorRoles() {
    $("#a-rol").innerHTML = Object.entries(api.roles)
      .map(([clave, r]) => `<option value="${clave}">${esc(r.nombre)}</option>`).join("");
  }

  function mostrarErroresAlta(mensajes) {
    const caja = $("#alta-errores");
    caja.innerHTML = `<ul>${mensajes.map((m) => `<li>${esc(m)}</li>`).join("")}</ul>`;
    caja.hidden = false;
  }

  function limpiarErroresAlta() {
    const caja = $("#alta-errores");
    caja.hidden = true;
    caja.innerHTML = "";
  }

  function abrirAltaIntegrante() {
    $("#form-alta-integrante").reset();
    limpiarErroresAlta();
    poblarSelectorRoles();
    $("#panel-alta-integrante").hidden = false;
    $("#panel-alta-integrante").scrollIntoView({ block: "nearest" });
    $("#a-nombre").focus();
  }

  function cerrarAltaIntegrante() {
    $("#panel-alta-integrante").hidden = true;
  }

  function generarPassword() {
    const alfabeto = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789";
    const azar = new Uint32Array(14);
    crypto.getRandomValues(azar);
    const password = Array.from(azar, (n) => alfabeto[n % alfabeto.length]).join("");
    const campo = $("#a-password");
    campo.value = password;
    campo.type = "text";
    campo.focus();
    campo.select();
  }

  function validarAltaIntegrante(d) {
    const errores = [];
    if (!d.nombre) errores.push("Indicá el nombre y apellido.");
    if (!d.email) errores.push("Indicá el correo institucional.");
    else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(d.email)) errores.push("El correo no tiene un formato válido.");
    if (!d.rol || !api.roles[d.rol]) errores.push("Elegí un rol.");
    if (!d.password || d.password.length < 10) errores.push("La contraseña provisional debe tener al menos 10 caracteres.");
    return errores;
  }

  async function enviarAltaIntegrante(evento) {
    evento.preventDefault();
    limpiarErroresAlta();

    const datos = {
      nombre: $("#a-nombre").value.trim(),
      email: $("#a-email").value.trim(),
      rol: $("#a-rol").value,
      password: $("#a-password").value,
    };
    const errores = validarAltaIntegrante(datos);
    if (errores.length) { mostrarErroresAlta(errores); return; }

    const boton = $("#btn-alta-integrante");
    boton.disabled = true;
    try {
      await api.crearUsuario(datos);
      cerrarAltaIntegrante();
      await refrescar();
      aviso(`${datos.nombre} ya forma parte del equipo como ${api.roles[datos.rol].nombre.toLowerCase()}.`, "ok");
    } catch (err) {
      if (err.codigo === "sin_sesion") { location.replace("index.html"); return; }
      mostrarErroresAlta([err.message || "No se pudo agregar a la persona."]);
    } finally {
      boton.disabled = false;
    }
  }

  /* ---------- Cambiar contraseña (la propia cuenta) ---------- */

  function abrirPassword() {
    $("#form-password").reset();
    $("#password-errores").hidden = true;
    $("#password-errores").textContent = "";
    $("#p-actual").type = "password";
    $("#p-nueva").type = "password";
    $("#dialogo-password").showModal();
    $("#p-actual").focus();
  }

  const cerrarPassword = () => $("#dialogo-password").close();

  function alternarVisibilidadPassword(mostrar) {
    $("#p-actual").type = mostrar ? "text" : "password";
    $("#p-nueva").type = mostrar ? "text" : "password";
  }

  async function enviarPassword(evento) {
    evento.preventDefault();
    const caja = $("#password-errores");
    caja.hidden = true;

    const actual = $("#p-actual").value;
    const nueva = $("#p-nueva").value;
    if (!actual) { caja.textContent = "Ingresá tu contraseña actual."; caja.hidden = false; return; }
    if (nueva.length < 10) { caja.textContent = "La contraseña nueva debe tener al menos 10 caracteres."; caja.hidden = false; return; }
    if (nueva === actual) { caja.textContent = "La contraseña nueva tiene que ser distinta de la actual."; caja.hidden = false; return; }

    const boton = $("#btn-guardar-password");
    boton.disabled = true;
    try {
      await api.cambiarPassword(actual, nueva);
      cerrarPassword();
      aviso("Tu contraseña se actualizó correctamente.", "ok");
    } catch (err) {
      if (err.codigo === "sin_sesion") { location.replace("index.html"); return; }
      caja.textContent = err.message || "No se pudo cambiar la contraseña.";
      caja.hidden = false;
    } finally {
      boton.disabled = false;
    }
  }

  /* ---------- Acciones ---------- */

  function irA(vista) {
    estado.vista = vista;
    if (location.hash !== `#${vista}`) location.hash = vista;
    else render();
  }

  async function decidir(id, decision) {
    const comentario = ($("#comentario-decision") || {}).value || "";
    if (decision === "devolver" && !comentario.trim()) {
      const error = $("#error-decision");
      error.textContent = "Explicá qué debe ajustarse para poder devolver el contenido.";
      error.hidden = false;
      $("#comentario-decision").focus();
      return;
    }
    await ejecutar(
      api.decidir(id, { decision, comentario }),
      decision === "aprobar" ? "Contenido aprobado. Falta publicarlo de forma explícita." : "Contenido devuelto al autor con tus observaciones."
    );
  }

  async function publicar(id) {
    const { ok } = await confirmar({
      titulo: "Publicar en la vista pública",
      texto: "El contenido va a ser visible para cualquier persona en la web institucional. Podés archivarlo después sin perder el registro.",
      etiqueta: "Publicar",
    });
    if (ok) await ejecutar(api.publicar(id), "Publicado en la vista pública.");
  }

  async function archivar(id) {
    const { ok, motivo } = await confirmar({
      titulo: "Archivar sin eliminar",
      texto: "El contenido deja de ser visible al público. Todas sus versiones y decisiones se conservan.",
      etiqueta: "Archivar",
      conMotivo: true,
    });
    if (ok) await ejecutar(api.archivar(id, motivo), "Contenido archivado. El registro se conserva.");
  }

  async function restaurar(id) {
    const { ok } = await confirmar({
      titulo: "Restaurar contenido",
      texto: "Vuelve al circuito editorial. Para mostrarlo en la web tenés que publicarlo otra vez.",
      etiqueta: "Restaurar",
    });
    if (ok) await ejecutar(api.restaurar(id), "Contenido restaurado. Publicalo de nuevo para mostrarlo en la web.");
  }

  async function cambiarUsuarioDemo(id) {
    try {
      const usuario = await api.iniciarSesion(id);
      estado.usuario = usuario;
      await refrescar();
      aviso(`Ahora ves el panel como ${usuario.nombre}.`, "ok");
    } catch (err) {
      aviso(err.message, "error");
    }
  }

  async function reiniciarDemo() {
    const { ok } = await confirmar({
      titulo: "Restablecer datos de ejemplo",
      texto: "Se borran los cambios hechos en este navegador y vuelven los contenidos de ejemplo.",
      etiqueta: "Restablecer",
    });
    if (!ok) return;
    await api.reiniciarDemo();
    estado.usuario = await api.sesion();
    restablecerFiltros();
    await refrescar();
    aviso("Datos de ejemplo restablecidos.", "ok");
  }

  function abrirContenido(id) {
    const c = estado.contenidos.find((x) => x.id === id);
    if (!c) return;
    restablecerFiltros();
    if (ABIERTOS.includes(c.estado)) {
      estado.seleccionRevision = id;
      irA("revision");
    } else {
      estado.seleccionHistorial = id;
      irA("historial");
    }
  }

  /* ---------- Eventos ---------- */

  function enlazarEventos() {
    document.addEventListener("click", async (e) => {
      const el = e.target.closest("[data-accion]");
      if (!el || el.tagName === "SELECT") return;
      const { accion, id } = el.dataset;

      switch (accion) {
        case "abrir-contenido": abrirContenido(id); break;
        case "seleccionar-revision": estado.seleccionRevision = id; renderVista(); break;
        case "seleccionar-historial": estado.seleccionHistorial = id; renderVista(); break;
        case "aprobar": await decidir(id, "aprobar"); break;
        case "devolver": await decidir(id, "devolver"); break;
        case "publicar": await publicar(id); break;
        case "archivar": await archivar(id); break;
        case "restaurar": await restaurar(id); break;
        case "nueva-version": abrirCarga(estado.contenidos.find((c) => c.id === id)); break;
        case "abrir-carga": abrirCarga(); break;
        case "cerrar-carga": cerrarCarga(); break;
        case "abrir-alta-integrante": abrirAltaIntegrante(); break;
        case "cerrar-alta-integrante": cerrarAltaIntegrante(); break;
        case "generar-password": generarPassword(); break;
        case "cambiar-password": abrirPassword(); break;
        case "cerrar-password": cerrarPassword(); break;
        case "elegir-archivos": $("#c-archivos").click(); break;
        case "reemplazar-archivo": await reemplazarArchivoBorrador(id); break;
        case "enviar-definitivo":
          await enviarDefinitivoBorrador(id);
          break;
        case "quitar-adjunto":
          estado.adjuntosCarga.splice(Number(el.dataset.indice), 1);
          renderAdjuntosCarga();
          break;
        case "reiniciar-demo": await reiniciarDemo(); break;
        case "cerrar-sesion":
          await api.cerrarSesion();
          location.replace("index.html");
          break;
        default: break;
      }
    });

    document.addEventListener("change", async (e) => {
      const el = e.target;
      if (el.matches('[data-accion="cambiar-rol"]')) {
        await ejecutar(api.cambiarRol(el.dataset.id, el.value), "Rol actualizado.");
      } else if (el.id === "selector-demo") {
        await cambiarUsuarioDemo(el.value);
      } else if (el.id === "p-mostrar") {
        alternarVisibilidadPassword(el.checked);
      }
    });

    $("#f-q").addEventListener("input", (e) => { estado.filtros.q = e.target.value; renderVista(); });
    $("#f-estado").addEventListener("change", (e) => { estado.filtros.estado = e.target.value; renderVista(); });
    $("#f-seccion").addEventListener("change", (e) => { estado.filtros.seccion = e.target.value; renderVista(); });
    $("#f-sitio").addEventListener("change", (e) => { estado.filtros.sitio = e.target.value; renderVista(); });
    $("#f-tipo").addEventListener("change", (e) => { estado.filtros.tipo = e.target.value; renderVista(); });
    $("#f-orden").addEventListener("change", (e) => { estado.filtros.orden = e.target.value; renderVista(); });

    $("#form-carga").addEventListener("submit", enviarCarga);
    $("#form-alta-integrante").addEventListener("submit", enviarAltaIntegrante);
    $("#form-password").addEventListener("submit", enviarPassword);

    $("#c-slug").addEventListener("input", (e) => { e.target.dataset.manual = "1"; });
    $("#c-titulo").addEventListener("input", (e) => {
      const slug = $("#c-slug");
      if (!estado.contenidoEnEdicion && !slug.dataset.manual) slug.value = slugify(e.target.value);
    });
    $("#c-tipo").addEventListener("change", () => actualizarEtiquetasSegunTipo());

    $("#c-archivos").addEventListener("change", (e) => {
      agregarArchivos([...e.target.files]);
      e.target.value = "";
    });

    window.addEventListener("hashchange", () => {
      estado.vista = vistaDesdeHash();
      render();
      $("#vista").focus({ preventScroll: true });
    });
  }

  /* ---------- Inicio ---------- */
  

  async function enviarDefinitivoBorrador(id) {
    const { ok } = await confirmar({
      titulo: "Enviar definitivamente",
      texto: "Una vez enviado al director, el documento pasará a revisión formal y no podrá modificarse libremente.",
      etiqueta: "Enviar",
    });

    if (!ok) return;

    try {
      const respuesta = await fetch(`/api/documentos/borrador/${id}/enviar`, {
        method: "POST",
        headers: { "Content-Type": "application/json" }
      });
      const resultado = await respuesta.json();

      if (respuesta.ok) {
        aviso("Documento enviado al Director con éxito.", "ok");
        await refrescar();
      } else {
        aviso(resultado.message || "No se pudo enviar el documento.", "error");
      }
    } catch (err) {
      aviso("Error de red al intentar enviar el documento.", "error");
    }
  }

  async function iniciar() {
    const usuario = await api.sesion();
    if (!usuario) { location.replace("index.html"); return; }
    estado.usuario = usuario;
    estado.vista = vistaDesdeHash();
    construirMenu();
    enlazarEventos();
    await refrescar();
  }

  iniciar();
async function reemplazarArchivoBorrador(id) {
    const fileInput = document.getElementById(`input-nuevo-adjunto-${id}`);
    if (!fileInput || fileInput.files.length === 0) {
      aviso("Por favor, seleccioná un archivo primero.", "error");
      return;
    }

    const formData = new FormData();
    // Tu backend espera un campo que procese adjuntos a través del middleware de subida
    formData.append("archivos", fileInput.files[0]);

    try {
      // Esta ruta ya existe en tu backend y utiliza POST para crear una nueva versión con adjuntos
      const respuesta = await fetch(`/api/contenidos/${id}/versiones`, {
        method: "POST",
        body: formData
      });

      if (respuesta.ok) {
        aviso("Archivo actualizado correctamente.", "ok");
        await refrescar();
      } else {
        const resultado = await respuesta.json();
        aviso(resultado.message || "No se pudo actualizar el archivo.", "error");
      }
    } catch (err) {
      aviso("Error de red al intentar actualizar el archivo.", "error");
    }
  }
})();
