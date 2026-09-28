/* publico.js — vista pública institucional.
 * No usa sesión: solo lee lo publicado con Nexo.api.publico. Siempre está acotada a UN sitio (una de las páginas
 * institucionales); el sitio se elige con ?sitio=<slug> en la URL, o el primero disponible si no se indica.
 */
(function () {
  "use strict";

  const { api, util } = Nexo;
  const { esc, fechaLarga, tamano } = util;
  const raiz = document.getElementById("principal");
  const selectorSitio = document.getElementById("selector-sitio");

  const ICONO_CALENDARIO = '<svg class="icono" viewBox="0 0 24 24" aria-hidden="true"><rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>';
  const ICONO_FLECHA = '<svg class="icono" viewBox="0 0 24 24" aria-hidden="true"><line x1="5" y1="12" x2="19" y2="12"/><polyline points="12 5 19 12 12 19"/></svg>';
  const ICONO_GALERIA = '<svg class="icono" viewBox="0 0 24 24" aria-hidden="true"><rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><polyline points="21 15 16 10 5 21"/></svg>';

  const TIPO_ETIQUETA = { noticia: "Noticia", proyecto: "Proyecto institucional", galeria: "Galería de fotos" };

  let sitioSlug = null;
  let publicaciones = [];
  let seccionActiva = "todas";
  let tipoActivo = "todos";

  /* ---------- Elegir el sitio ---------- */

  async function resolverSitio() {
    const params = new URLSearchParams(location.search);
    const pedido = params.get("sitio");
    const sitios = await api.publico.listarSitios();

    if (pedido && sitios.some((s) => s.slug === pedido)) return { slug: pedido, sitios };
    if (sitios.length) {
      const url = new URL(location.href);
      url.searchParams.set("sitio", sitios[0].slug);
      history.replaceState(null, "", url);
      return { slug: sitios[0].slug, sitios };
    }
    return { slug: null, sitios: [] };
  }

  function renderSelectorSitio(sitios) {
    if (sitios.length < 2) { selectorSitio.hidden = true; return; }
    selectorSitio.hidden = false;
    selectorSitio.innerHTML = sitios.map((s) => {
      const url = new URL(location.href);
      url.searchParams.set("sitio", s.slug);
      url.hash = "";
      return `<a class="chip-sitio${s.slug === sitioSlug ? " chip-sitio--activo" : ""}" href="${esc(url.pathname + url.search)}">${esc(s.nombre)}</a>`;
    }).join("");
  }

  /* ---------- Listado ---------- */

  function tarjeta(p) {
    const esGaleria = p.tipo === "galeria";
    const primeraFoto = esGaleria && p.adjuntos.length ? p.adjuntos[0] : null;
    const urlFoto = primeraFoto ? (primeraFoto.id ? `/api/publico/${esc(sitioSlug)}/adjuntos/${encodeURIComponent(primeraFoto.id)}` : primeraFoto.url) : null;
    const cabecera = urlFoto ? `<img class="publicacion__miniatura" src="${esc(urlFoto)}" alt="" loading="lazy">` : "";
    return `
      <article class="publicacion">
        <a class="publicacion__enlace" href="#${encodeURIComponent(p.slug)}">
          ${cabecera}
          <div class="publicacion__tope">
            <span class="etiqueta-seccion">${esc(p.seccion)}</span>
            ${esGaleria ? ICONO_GALERIA : ICONO_CALENDARIO}
          </div>
          <h3 class="publicacion__titulo">${esc(p.titulo)}</h3>
          <p class="publicacion__resumen">${esc(p.resumen)}</p>
          <div class="publicacion__pie">
            <span>Publicado el ${fechaLarga(p.fecha)}</span>
            ${ICONO_FLECHA}
          </div>
        </a>
      </article>`;
  }

  function renderLista() {
    document.title = "Novedades y convocatorias | Nexo institucional";
    const secciones = [...new Set(publicaciones.map((p) => p.seccion))].sort((a, b) => a.localeCompare(b, "es"));
    const tipos = [...new Set(publicaciones.map((p) => p.tipo))];

    const visibles = publicaciones.filter((p) =>
      (seccionActiva === "todas" || p.seccion === seccionActiva) && (tipoActivo === "todos" || p.tipo === tipoActivo));

    const chipsSeccion = secciones.length > 1
      ? `<div class="chips" role="group" aria-label="Filtrar por sección">
          ${["todas", ...secciones].map((s) => `
            <button type="button" class="chip" data-seccion="${esc(s)}" aria-pressed="${s === seccionActiva}">${s === "todas" ? "Todas las secciones" : esc(s)}</button>`).join("")}
        </div>`
      : "";

    const chipsTipo = tipos.length > 1
      ? `<div class="chips" role="group" aria-label="Filtrar por tipo">
          ${["todos", ...tipos].map((t) => `
            <button type="button" class="chip" data-tipo="${esc(t)}" aria-pressed="${t === tipoActivo}">${t === "todos" ? "Todos los tipos" : esc(TIPO_ETIQUETA[t] || t)}</button>`).join("")}
        </div>`
      : "";

    raiz.innerHTML = `
      <div class="seccion-cabecera">
        <div>
          <p class="etiqueta">Actualidad</p>
          <h1 class="seccion-titulo">Novedades y convocatorias</h1>
        </div>
        <p class="seccion-conteo">${publicaciones.length} ${publicaciones.length === 1 ? "publicación visible" : "publicaciones visibles"}</p>
      </div>
      ${chipsTipo}
      ${chipsSeccion}
      ${visibles.length
        ? `<div class="publicaciones">${visibles.map(tarjeta).join("")}</div>`
        : `<p class="vacio-publico">Todavía no hay publicaciones visibles.</p>`}`;
  }

  function parrafos(texto) {
    return String(texto).split(/\n{2,}/).map((p) => `<p>${esc(p.trim()).replace(/\n/g, "<br>")}</p>`).join("");
  }

  /* ---------- Detalle ---------- */

  function documentos(adjuntos) {
    const lista = (adjuntos || []).filter((a) => a.id || a.url);
    if (!lista.length) return "";
    return `
      <section class="articulo__documentos">
        <h2 class="etiqueta">Documentos</h2>
        <ul>${lista.map((a) => {
          const url = a.id ? `/api/publico/${esc(sitioSlug)}/adjuntos/${encodeURIComponent(a.id)}` : a.url;
          return `<li><a href="${esc(url)}" download="${esc(a.nombre)}">${esc(a.nombre)}</a> <small>${tamano(a.tamano)}</small></li>`;
        }).join("")}
        </ul>
      </section>`;
  }

  function galeria(adjuntos) {
    const lista = (adjuntos || []).filter((a) => a.id || a.url);
    if (!lista.length) return "";
    return `
      <div class="articulo__galeria">${lista.map((a) => {
        const url = a.id ? `/api/publico/${esc(sitioSlug)}/adjuntos/${encodeURIComponent(a.id)}` : a.url;
        return `
        <a href="${esc(url)}" target="_blank" rel="noopener">
          <img src="${esc(url)}" alt="${esc(a.nombre)}" loading="lazy">
        </a>`;
      }).join("")}
      </div>`;
  }

  async function renderArticulo(slug) {
    try {
      const p = await api.publico.obtener(sitioSlug, slug);
      const esGaleria = p.tipo === "galeria";
      document.title = `${p.titulo} | Nexo institucional`;
      raiz.innerHTML = `
        <article class="articulo">
          <a class="articulo__volver" href="#">${ICONO_FLECHA} Volver a novedades</a>
          <span class="etiqueta-seccion">${esc(p.seccion)}</span>
          <h1 class="articulo__titulo">${esc(p.titulo)}</h1>
          <p class="articulo__fecha">Publicado el ${fechaLarga(p.fecha)}</p>
          ${p.resumen ? `<p class="articulo__resumen">${esc(p.resumen)}</p>` : ""}
          ${p.cuerpo ? `<div class="articulo__cuerpo">${parrafos(p.cuerpo)}</div>` : ""}
          ${esGaleria ? galeria(p.adjuntos) : documentos(p.adjuntos)}
        </article>`;
    } catch (err) {
      raiz.innerHTML = `
        <a class="articulo__volver" href="#">${ICONO_FLECHA} Volver a novedades</a>
        <p class="vacio-publico">${esc(err.message)}</p>`;
    }
  }

  /* ---------- Ciclo de render ---------- */

  async function render() {
    if (!sitioSlug) {
      raiz.innerHTML = `<p class="vacio-publico">Todavía no hay ningún sitio configurado.</p>`;
      return;
    }
    const slug = decodeURIComponent(location.hash.slice(1));
    if (slug) {
      await renderArticulo(slug);
    } else {
      publicaciones = await api.publico.listar(sitioSlug);
      renderLista();
    }
    window.scrollTo(0, 0);
  }

  raiz.addEventListener("click", (e) => {
    const chipSeccion = e.target.closest("[data-seccion]");
    if (chipSeccion) { seccionActiva = chipSeccion.dataset.seccion; renderLista(); return; }
    const chipTipo = e.target.closest("[data-tipo]");
    if (chipTipo) { tipoActivo = chipTipo.dataset.tipo; renderLista(); }
  });

  window.addEventListener("hashchange", render);

  resolverSitio().then(({ slug, sitios }) => {
    sitioSlug = slug;
    renderSelectorSitio(sitios);
    render();
  });
})();
