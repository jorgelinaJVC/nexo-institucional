"use strict";

/* Prueba del frontend en MODO DEMO (sin servidor): carga las páginas reales en jsdom y recorre el circuito
 * completo con los distintos roles. Las páginas se abren desde los archivos, con localStorage como "base de datos". */

const fs = require("node:fs");
const path = require("node:path");
const { describe, it } = require("node:test");
const assert = require("node:assert/strict");
const { JSDOM, VirtualConsole } = require("jsdom");

const RAIZ = path.join(__dirname, "..", "frontend");
const ok = (condicion, mensaje) => assert.ok(condicion, mensaje);

function cargar(pagina, sesion, hash = "") {
  let html = fs.readFileSync(path.join(RAIZ, pagina), "utf8");
  html = html.replace(/<script src="([^"]+)"><\/script>/g, (_, src) =>
    `<script>${fs.readFileSync(path.join(RAIZ, src), "utf8")}</script>`);
  html = html.replace(/<link[^>]*>/g, "");
  const consola = new VirtualConsole();
  const errores = [];
  consola.on("jsdomError", (e) => errores.push(e.message));
  consola.on("error", (e) => errores.push(String(e)));
  const dom = new JSDOM(html, {
    url: `http://localhost/${pagina}${hash}`, runScripts: "dangerously", pretendToBeVisual: true,
    virtualConsole: consola,
    beforeParse(w) {
      if (sesion) w.localStorage.setItem("nexo.sesion.v1", sesion);
      w.HTMLDialogElement.prototype.showModal = function () { this.open = true; };
      w.HTMLDialogElement.prototype.close = function (v) { if (v !== undefined) this.returnValue = v; this.open = false; this.dispatchEvent(new w.Event("close")); };
      w.Element.prototype.scrollIntoView = function () {};
      w.scrollTo = () => {};
    },
  });
  dom.errores = errores;
  return dom;
}
const esperar = (ms) => new Promise((r) => setTimeout(r, ms));
async function hasta(fn, ms = 2000) { const t = Date.now(); while (Date.now() - t < ms) { if (fn()) return true; await esperar(20); } return false; }

async function confirmarDialogo(w, valor = "ok", motivo) {
  await hasta(() => w.document.getElementById("dialogo").open);
  if (motivo) w.document.getElementById("dialogo-motivo").value = motivo;
  w.document.getElementById("dialogo").close(valor);
  await esperar(200);
}

describe("frontend en modo demo", () => {
  it("recorre el circuito editorial completo con los cuatro roles y la vista pública", async () => {
    const dom = cargar("panel.html", "u1");
  const w = dom.window, d = w.document;
  ok(await hasta(() => d.querySelector(".metrica")), "renderiza las métricas");
  ok(/^Buen/.test(d.getElementById("saludo").textContent) && d.getElementById("saludo").textContent.includes("Jorgelina"), "saludo con nombre: " + d.getElementById("saludo").textContent);
  const valores = [...d.querySelectorAll(".metrica__valor")].map((e) => e.textContent);
  ok(valores.join() === "4,1,3,1", "métricas 4,1,3,1 -> " + valores.join());
  ok(d.querySelectorAll(".fila").length === 4, "4 filas de actividad");
  ok(d.querySelector(".insignia")?.textContent === "1", "insignia de revisión = 1");

  // Filtros
  const q = d.getElementById("f-q"); q.value = "escuelas"; q.dispatchEvent(new w.Event("input"));
  ok(d.getElementById("f-total").textContent === "1 resultado", "búsqueda por 'escuelas' -> 1 resultado");
  q.value = "BÉCAS"; q.dispatchEvent(new w.Event("input"));
  ok(d.querySelectorAll(".fila").length === 1, "búsqueda sin tildes/mayúsculas");
  q.value = ""; q.dispatchEvent(new w.Event("input"));

  // Ir a revisión
  w.location.hash = "revision";
  ok(await hasta(() => d.querySelector(".detalle")), "abre el detalle de revisión");
  ok(d.querySelector(".detalle__titulo").textContent.includes("abuelos"), "detalle del contenido pendiente");
  ok(d.querySelectorAll(".foto").length === 1 && d.body.textContent.includes("logoMA.png"), "galería con la foto logoMA.png (tipo galeria)");
  ok(d.querySelector('.ficha').textContent.includes("Analía Rojas"), "ficha muestra autor");

  // Devolver sin comentario
  d.querySelector('[data-accion="devolver"]').click();
  await esperar(50);
  ok(!d.getElementById("error-decision").hidden, "devolver sin comentario muestra error");

  // Aprobar
  d.querySelector('[data-accion="aprobar"]').click();
  ok(await hasta(() => d.querySelector('[data-accion="publicar"]')), "tras aprobar aparece 'Publicar'");
  ok((await w.Nexo.api.publico.listar()).length === 3, "aprobado NO es público todavía (publicación explícita)");

  // Publicar
  d.querySelector('[data-accion="publicar"]').click();
  await confirmarDialogo(w);
  ok(await hasta(async () => true), "publicando…");
  await esperar(300);
  const pub = await w.Nexo.api.publico.listar();
  ok(pub.length === 4 && pub[0].slug === "visitas", "tras publicar hay 4 públicos y el nuevo va primero");

  // Historial
  w.location.hash = "historial";
  await hasta(() => d.querySelector(".linea"));
  ok(d.querySelectorAll(".version").length >= 1, "línea de tiempo renderizada");
  d.querySelector('[data-id="c1"][data-accion="seleccionar-historial"]').click();
  ok(d.querySelectorAll(".version").length === 2 && d.querySelector(".version--actual .version__nombre").textContent === "Versión 2.0", "becas: 2 versiones, actual = 2.0");
  ok(d.body.textContent.includes("Reemplazada por una actualización posterior"), "v1 marcada como reemplazada");

  // Archivar y restaurar
  d.querySelector('[data-accion="archivar"]').click();
  await confirmarDialogo(w, "ok", "Convocatoria vencida");
  await esperar(300);
  ok((await w.Nexo.api.publico.listar()).length === 3, "archivar quita de la vista pública");
  const lista = await w.Nexo.api.listarContenidos();
  const c1 = lista.find((c) => c.id === "c1");
  ok(c1.versiones.length === 2 && c1.estado === "archivado", "archivar conserva versiones");
  ok(c1.historial.at(-1).comentario === "Convocatoria vencida", "motivo del archivo guardado");
  d.querySelector('[data-accion="restaurar"]').click();
  await confirmarDialogo(w);
  await esperar(300);
  ok((await w.Nexo.api.publico.listar()).length === 3, "restaurar NO republica automáticamente");

  // Nuevo contenido (formulario)
  d.getElementById("btn-nuevo").click();
  ok(!d.getElementById("panel-carga").hidden, "abre formulario de carga");
  d.getElementById("c-titulo").value = "Beca de Transporte 2027"; d.getElementById("c-titulo").dispatchEvent(new w.Event("input"));
  ok(d.getElementById("c-slug").value === "beca-de-transporte-2027", "slug automático desde el título");
  d.getElementById("form-carga").dispatchEvent(new w.Event("submit", { cancelable: true }));
  await esperar(50);
  ok(!d.getElementById("carga-errores").hidden && d.getElementById("carga-errores").textContent.includes("sección"), "valida campos obligatorios");
  d.getElementById("c-seccion").value = "Becas y beneficios";
  d.getElementById("c-resumen").value = "Resumen"; d.getElementById("c-cuerpo").value = "Cuerpo largo";
  d.getElementById("form-carga").dispatchEvent(new w.Event("submit", { cancelable: true }));
  await hasta(() => d.getElementById("panel-carga").hidden);
  ok(d.getElementById("panel-carga").hidden, "envía y cierra el formulario");
  await hasta(() => w.location.hash === "#revision");
  ok(w.location.hash === "#revision", "navega a la bandeja de revisión");
  await esperar(200);
  ok(d.body.textContent.includes("Beca de Transporte 2027"), "nuevo contenido en la bandeja");

  // Slug duplicado (mismo sitio que "visitas": s2)
  d.getElementById("btn-nuevo").click();
  d.getElementById("c-sitio").value = "s2";
  d.getElementById("c-seccion").value = "X"; d.getElementById("c-slug").value = "visitas";
  d.getElementById("c-titulo").value = "T"; d.getElementById("c-resumen").value = "R"; d.getElementById("c-cuerpo").value = "C";
  d.getElementById("form-carga").dispatchEvent(new w.Event("submit", { cancelable: true }));
  await esperar(300);
  ok(d.getElementById("carga-errores").textContent.includes("identificador"), "rechaza identificador duplicado dentro del mismo sitio");
  d.querySelector('[data-accion="cerrar-carga"]').click();

  // Equipo
  w.location.hash = "equipo";
  await hasta(() => d.querySelector(".tabla"));
  ok(d.querySelectorAll(".tabla tbody tr").length === 4, "tabla con 4 integrantes");
  const sel = d.querySelector('select[data-id="u4"]'); sel.value = "colaborador"; sel.dispatchEvent(new w.Event("change", { bubbles: true }));
  await esperar(300);
  ok((await w.Nexo.api.listarUsuarios()).find((u) => u.id === "u4").rol === "colaborador", "cambia el rol de Tomás a colaborador");
  const selAdmin = d.querySelector('select[data-id="u1"]'); selAdmin.value = "observador"; selAdmin.dispatchEvent(new w.Event("change", { bubbles: true }));
  await esperar(300);
  ok((await w.Nexo.api.listarUsuarios()).find((u) => u.id === "u1").rol === "administrador", "no deja sin administradores");
  ok(d.querySelector(".aviso--error"), "muestra aviso de error");

    await w.Nexo.api.cambiarRol("u4", "observador");
  const selDemo = d.getElementById("selector-demo"); selDemo.value = "u4"; selDemo.dispatchEvent(new w.Event("change", { bubbles: true }));
  await esperar(400);
  ok(d.getElementById("btn-nuevo").disabled, "observador: 'Nuevo contenido' deshabilitado");
  ok(!d.querySelector('select[data-id]'), "observador: no puede cambiar roles");
  w.location.hash = "revision"; await esperar(200);
  ok(!d.querySelector('[data-accion="aprobar"]'), "observador: sin botones de decisión");

  selDemo.value = "u3"; selDemo.dispatchEvent(new w.Event("change", { bubbles: true }));
  await esperar(400);
  ok(!d.getElementById("btn-nuevo").disabled, "colaboradora puede crear");
  ok(!d.querySelector('[data-accion="aprobar"]'), "colaboradora: sin botones de aprobar");
  let rechazo = null; try { await w.Nexo.api.publicar("c4"); } catch (e) { rechazo = e; }
  ok(rechazo && rechazo.codigo === "prohibido", "la API rechaza publicar a una colaboradora");

  // Devolver y reenviar (director u2)
  selDemo.value = "u2"; selDemo.dispatchEvent(new w.Event("change", { bubbles: true }));
  await esperar(400);
  const nuevo = (await w.Nexo.api.listarContenidos()).find((c) => c.slug === "beca-de-transporte-2027");
  d.querySelector(`[data-accion="seleccionar-revision"][data-id="${nuevo.id}"]`)?.click();
  d.getElementById("comentario-decision").value = "Falta la fecha de cierre.";
  d.querySelector('[data-accion="devolver"]').click();
  await esperar(300);
  ok(d.body.textContent.includes("Falta la fecha de cierre."), "devolución con comentario visible");
  // Autor reenvía
  await w.Nexo.api.iniciarSesion("u1");
  selDemo.value = "u1"; selDemo.dispatchEvent(new w.Event("change", { bubbles: true })); await esperar(300);
  d.querySelector('[data-accion="nueva-version"]').click();
  ok(d.getElementById("c-slug").readOnly && d.getElementById("c-titulo").value === "Beca de Transporte 2027", "reenvío precarga y bloquea el identificador");
  d.getElementById("c-cuerpo").value = "Cuerpo con fecha de cierre.";
  d.getElementById("form-carga").dispatchEvent(new w.Event("submit", { cancelable: true }));
  await esperar(400);
  const c5 = (await w.Nexo.api.listarContenidos()).find((c) => c.slug === "beca-de-transporte-2027");
  ok(c5.versiones.length === 2 && c5.versiones[0].estado === "conservada" && c5.estado === "en_revision", "nueva versión: v1 conservada, v2 en revisión");

  ok(dom.errores.length === 0, "sin errores de JS en consola: " + dom.errores.join(" | "));

  // Vista pública: cada sitio ve solo lo suyo (becas quedó archivada, así que "sitio-1" solo tiene "calendario")
  const datos = w.localStorage.getItem("nexo.datos.v1");
  const cargarPublico = (query) => {
    let html = fs.readFileSync(path.join(RAIZ, "publico.html"), "utf8");
    html = html.replace(/<script src="([^"]+)"><\/script>/g, (_, s) => `<script>${fs.readFileSync(path.join(RAIZ, s), "utf8")}</script>`).replace(/<link[^>]*>/g, "");
    return new JSDOM(html, {
      url: `http://localhost/publico.html${query}`, runScripts: "dangerously", pretendToBeVisual: true,
      beforeParse(x) { x.localStorage.setItem("nexo.datos.v1", datos); x.scrollTo = () => {}; },
    });
  };

  const dom2 = cargarPublico("?sitio=sitio-1");
  const p = dom2.window.document;
  await hasta(() => p.querySelector(".publicacion"));
  ok(p.querySelectorAll(".publicacion").length === 1, "sitio 1: 1 tarjeta pública (becas quedó archivada): " + p.querySelectorAll(".publicacion").length);
  ok(p.querySelector(".seccion-conteo").textContent.startsWith("1 publicación"), "contador de publicaciones del sitio 1");
  ok(!p.body.textContent.includes("Beca de Transporte"), "lo que está en revisión no se ve en público");
  ok(!p.getElementById("selector-sitio").hidden, "el selector de sitio se muestra cuando hay más de uno");
  ok(p.querySelectorAll(".chip-sitio").length === 2, "el selector lista los dos sitios");
  dom2.window.location.hash = "calendario-academico-2027";
  await hasta(() => p.querySelector(".articulo"));
  ok(p.querySelector(".articulo__titulo").textContent === "Calendario académico 2027", "detalle de una publicación del sitio 1");
  dom2.window.location.hash = "no-existe";
  await hasta(() => p.querySelector(".vacio-publico"));
  ok(p.querySelector(".vacio-publico"), "publicación inexistente muestra mensaje");

  const dom3 = cargarPublico("?sitio=sitio-2");
  const p2 = dom3.window.document;
  await hasta(() => p2.querySelector(".publicacion"));
  ok(p2.querySelectorAll(".publicacion").length === 2, "sitio 2: 2 tarjetas públicas (protocolo + la galería): " + p2.querySelectorAll(".publicacion").length);
  dom3.window.location.hash = "visitas";
  await hasta(() => p2.querySelector(".articulo"));
  ok(p2.querySelector(".articulo__titulo").textContent.includes("abuelos"), "detalle de la galería (modo demo: sin archivo real, sin fotos que mostrar)");

  // Una colaboradora sube una foto real (no solo el nombre): el director tiene que poder verla al revisar.
  d.getElementById("selector-demo").value = "u3";
  d.getElementById("selector-demo").dispatchEvent(new w.Event("change", { bubbles: true }));
  await esperar(300);
  d.getElementById("btn-nuevo").click();
  d.getElementById("c-seccion").value = "Comunidad académica";
  d.getElementById("c-titulo").value = "comunidad";
  d.getElementById("c-titulo").dispatchEvent(new w.Event("input"));
  d.getElementById("c-resumen").value = "Resumen";
  d.getElementById("c-cuerpo").value = "Cuerpo";
  const bytesFoto = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==", "base64");
  const foto = new w.File([bytesFoto], "dia Estu.jpeg", { type: "image/jpeg" });
  const inputArchivo = d.getElementById("c-archivos");
  Object.defineProperty(inputArchivo, "files", { value: [foto], configurable: true });
  inputArchivo.dispatchEvent(new w.Event("change"));
  ok(await hasta(() => d.querySelector(".adjunto-item__miniatura")), "genera una vista previa real de la foto en modo demo");
  d.getElementById("form-carga").dispatchEvent(new w.Event("submit", { cancelable: true }));
  ok(await hasta(() => d.getElementById("panel-carga").hidden), "envía la noticia con la foto a revisión");

  d.getElementById("selector-demo").value = "u2";
  d.getElementById("selector-demo").dispatchEvent(new w.Event("change", { bubbles: true }));
  await esperar(300);
  w.location.hash = "revision";
  await esperar(200);
  const solicitudFoto = [...d.querySelectorAll(".solicitud")].find((el) => el.textContent.includes("comunidad"));
  ok(!!solicitudFoto, "el director ve la solicitud de la colaboradora en su propia bandeja");
  solicitudFoto?.click();
  await esperar(100);
  const enlaceVer = d.querySelector("a.adjunto__ver");
  ok(!!enlaceVer, "el director tiene un enlace para VER el adjunto (antes de esta corrección no había nada)");
  ok((enlaceVer?.getAttribute("href") || "").startsWith("data:image/jpeg"), "el enlace apunta a la foto real, no solo a su nombre");
  });
});
