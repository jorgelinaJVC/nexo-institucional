"use strict";

/* Prueba de extremo a extremo: las páginas reales del frontend (cargadas desde el servidor, con su /js/config.js)
 * hablando con la API real y la base de datos real, con sesión por cookie.
 * jsdom no trae fetch: se le inyecta uno que guarda las cookies igual que un navegador. */

const { describe, it, before, after } = require("node:test");
const assert = require("node:assert/strict");
const { JSDOM, ResourceLoader, CookieJar, VirtualConsole } = require("jsdom");
const { iniciar, cliente, ingresarComo, datosContenido, PASSWORD, db } = require("./ayudas");

let entorno;

before(async () => { entorno = await iniciar(); });
after(() => entorno.cerrar());

const esperar = (ms) => new Promise((r) => setTimeout(r, ms));
async function hasta(fn, ms = 4000) {
  const inicio = Date.now();
  while (Date.now() - inicio < ms) {
    if (await fn()) return true;
    await esperar(25);
  }
  return false;
}

/** fetch con cookies compartidas para una ventana de jsdom. */
function crearFetch(jar, base) {
  return async (ruta, opciones = {}) => {
    const url = new URL(ruta, base).href;
    const cabeceras = { ...(opciones.headers || {}) };
    const cookie = jar.getCookieStringSync(url, { http: true });
    if (cookie) cabeceras.cookie = cookie;
    const respuesta = await fetch(url, { ...opciones, headers: cabeceras, redirect: "manual" });
    for (const c of respuesta.headers.getSetCookie()) jar.setCookieSync(c, url, { http: true });
    return respuesta;
  };
}

/** Abre una página del sitio en jsdom, cargando sus scripts desde el servidor (nada externo). */
async function abrir(pagina, jar) {
  const base = entorno.url;
  class Cargador extends ResourceLoader {
    fetch(url, opciones) {
      return url.startsWith(base) ? super.fetch(url, opciones) : Promise.resolve(Buffer.from(""));
    }
  }
  const errores = [];
  const consola = new VirtualConsole();
  consola.on("jsdomError", (e) => { if (!/Not implemented/.test(e.message)) errores.push(e.message); });

  const dom = await JSDOM.fromURL(`${base}/${pagina}`, {
    runScripts: "dangerously",
    resources: new Cargador(),
    pretendToBeVisual: true,
    cookieJar: jar,
    virtualConsole: consola,
    beforeParse(w) {
      w.fetch = crearFetch(jar, base);
      w.FormData = FormData; // el de Node, para que fetch pueda enviarlo
      w.HTMLDialogElement.prototype.showModal = function () { this.open = true; };
      w.HTMLDialogElement.prototype.close = function (v) {
        if (v !== undefined) this.returnValue = v;
        this.open = false;
        this.dispatchEvent(new w.Event("close"));
      };
      w.Element.prototype.scrollIntoView = function () {};
      w.scrollTo = () => {};
    },
  });
  dom.errores = errores;

  // fromURL resuelve antes de que terminen de cargar los scripts: se espera al evento load.
  await new Promise((resolver) => {
    if (dom.window.document.readyState === "complete") resolver();
    else dom.window.addEventListener("load", resolver, { once: true });
  });
  assert.ok(await hasta(() => dom.window.Nexo && dom.window.Nexo.api), `los scripts de ${pagina} no se cargaron`);
  return dom;
}

async function confirmarDialogo(d, motivo) {
  await hasta(() => d.getElementById("dialogo").open);
  if (motivo) d.getElementById("dialogo-motivo").value = motivo;
  d.getElementById("dialogo").close("ok");
}

const estadoEnBd = async (slug) => (await db.consultar("select estado from contenidos where slug = ?", [slug]))[0].estado;

const PNG = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==",
  "base64"
);

describe("login del frontend contra el servidor", () => {
  it("muestra correo y contraseña, valida y rechaza credenciales incorrectas", async () => {
    const jar = new CookieJar();
    const dom = await abrir("index.html", jar);
    const d = dom.window.document;
    await hasta(() => !d.getElementById("campos-login").hidden);
    assert.equal(d.getElementById("campos-login").hidden, false, "config.js del servidor activa el modo servidor");

    const enviar = () => d.getElementById("form-login").dispatchEvent(new dom.window.Event("submit", { cancelable: true }));

    enviar();
    assert.match(d.getElementById("error-login").textContent, /correo institucional y tu contraseña/);

    d.getElementById("l-email").value = "admin@prueba.edu.ar";
    d.getElementById("l-password").value = "clave-equivocada-1";
    enviar();
    await hasta(() => /incorrectos/.test(d.getElementById("error-login").textContent));
    assert.equal(d.getElementById("error-login").textContent, "Correo o contraseña incorrectos.");
    assert.equal(d.getElementById("btn-ingresar").disabled, false, "el botón vuelve a habilitarse");
  });

  it("con las credenciales correctas abre la sesión (cookie) y api.sesion() la devuelve", async () => {
    const jar = new CookieJar();
    const dom = await abrir("index.html", jar);
    const d = dom.window.document;
    d.getElementById("l-email").value = "admin@prueba.edu.ar";
    d.getElementById("l-password").value = PASSWORD;
    d.getElementById("form-login").dispatchEvent(new dom.window.Event("submit", { cancelable: true }));
    await hasta(async () => (await dom.window.Nexo.api.sesion()) !== null);
    const usuario = await dom.window.Nexo.api.sesion();
    assert.equal(usuario.rol, "administrador");
    assert.match(jar.getCookieStringSync(entorno.url, { http: true }), /nexo_sesion=/);
  });
});

describe("panel del frontend contra el servidor", () => {
  let colab, director, dom, d, w, jarAdmin;
  const slugs = {};

  before(async () => {
    colab = await ingresarComo(entorno.url, "colab");
    director = await ingresarComo(entorno.url, "director");

    // dos contenidos cargados por la colaboradora, uno con adjunto
    const conAdjunto = new FormData();
    slugs.pendiente = datosContenido({ titulo: "Las escuelas visitan a los abuelos", seccion: "Proyecto escuelas" }).slug;
    conAdjunto.append("datos", JSON.stringify(datosContenido({ slug: slugs.pendiente, titulo: "Las escuelas visitan a los abuelos", seccion: "Proyecto escuelas" })));
    conAdjunto.append("adjuntos", new Blob([PNG], { type: "image/png" }), "logoMA.png");
    const creado = await colab.post("/api/contenidos", conAdjunto);
    assert.equal(creado.estado, 201);

    jarAdmin = new CookieJar();
    dom = await abrir("index.html", jarAdmin);
    w = dom.window;
    await w.Nexo.api.iniciarSesion({ email: "admin@prueba.edu.ar", password: PASSWORD });
    dom.window.close();

    dom = await abrir("panel.html", jarAdmin);
    w = dom.window;
    d = w.document;
    assert.ok(await hasta(() => d.querySelector(".metrica")), "el panel se dibuja con datos reales");
  });

  it("muestra las métricas y la actividad que vienen de la base de datos", async () => {
    const valores = [...d.querySelectorAll(".metrica__valor")].map((e) => e.textContent);
    assert.deepEqual(valores, ["1", "1", "0", "0"]);
    assert.ok(d.body.textContent.includes("Las escuelas visitan a los abuelos"));
    assert.match(d.getElementById("saludo").textContent, /^Buen\S* \S+, Persona$/);
    assert.equal(d.getElementById("demo").hidden, true, "sin selector de usuarios de demostración");
  });

  it("en Revisión muestra el autor real y el adjunto se puede ver y descargar por separado", async () => {
    w.location.hash = "revision";
    assert.ok(await hasta(() => d.querySelector(".detalle")));
    assert.ok(d.querySelector(".ficha").textContent.includes("Persona colab"));
    const ver = d.querySelector("a.adjunto__ver");
    assert.ok(ver, "el adjunto tiene un enlace para verlo");
    assert.match(ver.getAttribute("href"), /^\/api\/adjuntos\/\d+$/);
    assert.ok(ver.textContent.includes("logoMA.png"));
    assert.equal(ver.getAttribute("target"), "_blank", "se abre en una pestaña nueva, no fuerza la descarga");
    assert.ok(!ver.hasAttribute("download"), "el enlace para VER no tiene el atributo download");

    const descargar = d.querySelector(`a[href="${ver.getAttribute("href")}?descarga=1"]`);
    assert.ok(descargar, "hay un botón aparte para forzar la descarga");
    assert.ok(descargar.hasAttribute("download"));
  });

  it("devolver exige comentario y aprobar/publicar cambian el estado en la base", async () => {
    d.querySelector('[data-accion="devolver"]').click();
    await esperar(50);
    assert.equal(d.getElementById("error-decision").hidden, false);
    assert.equal(await estadoEnBd(slugs.pendiente), "en_revision");

    d.querySelector('[data-accion="aprobar"]').click();
    assert.ok(await hasta(() => d.querySelector('[data-accion="publicar"]')));
    assert.equal(await estadoEnBd(slugs.pendiente), "aprobado");
    const publicoAntes = await (await fetch(`${entorno.url}/api/publico/${entorno.sitios[0].slug}/publicaciones`)).json();
    assert.equal(publicoAntes.length, 0, "aprobado todavía no es público");

    d.querySelector('[data-accion="publicar"]').click();
    await confirmarDialogo(d);
    assert.ok(await hasta(async () => (await estadoEnBd(slugs.pendiente)) === "publicado"));
    const publico = await (await fetch(`${entorno.url}/api/publico/${entorno.sitios[0].slug}/publicaciones`)).json();
    assert.equal(publico.length, 1);
  });

  it("el historial muestra las decisiones reales con sus responsables", async () => {
    w.location.hash = "historial";
    assert.ok(await hasta(() => d.querySelector(".version")));
    const texto = d.querySelector(".linea").textContent;
    assert.ok(texto.includes("Publicada y visible para el público."));
    assert.ok(texto.includes("Persona admin"));
    assert.ok(texto.includes("Aprobada"));
  });

  it("carga un contenido nuevo desde el formulario, con un archivo adjunto real", async () => {
    d.getElementById("btn-nuevo").click();
    d.getElementById("c-seccion").value = "Becas y beneficios";
    d.getElementById("c-titulo").value = "Beca de transporte 2027";
    d.getElementById("c-titulo").dispatchEvent(new w.Event("input"));
    assert.equal(d.getElementById("c-slug").value, "beca-de-transporte-2027");
    d.getElementById("c-resumen").value = "Ayuda para viajes.";
    d.getElementById("c-cuerpo").value = "Cuerpo del contenido.";

    const archivo = new File([PNG], "afiche.png", { type: "image/png" });
    const input = d.getElementById("c-archivos");
    Object.defineProperty(input, "files", { value: [archivo], configurable: true });
    input.dispatchEvent(new w.Event("change"));
    assert.ok(d.getElementById("lista-adjuntos").textContent.includes("afiche.png"));

    d.getElementById("form-carga").dispatchEvent(new w.Event("submit", { cancelable: true }));
    assert.ok(await hasta(() => d.getElementById("panel-carga").hidden), d.getElementById("carga-errores").textContent);
    assert.ok(await hasta(async () => (await db.consultar("select id from adjuntos where nombre_original = 'afiche.png'")).length === 1));
    assert.equal(await estadoEnBd("beca-de-transporte-2027"), "en_revision");
    assert.ok(await hasta(() => d.body.textContent.includes("Beca de transporte 2027")));
  });

  it("un identificador repetido muestra el error del servidor en el formulario", async () => {
    d.getElementById("btn-nuevo").click();
    d.getElementById("c-seccion").value = "X";
    d.getElementById("c-slug").value = slugs.pendiente;
    d.getElementById("c-titulo").value = "T";
    d.getElementById("c-resumen").value = "R";
    d.getElementById("c-cuerpo").value = "C";
    d.getElementById("form-carga").dispatchEvent(new w.Event("submit", { cancelable: true }));
    assert.ok(await hasta(() => /identificador web/.test(d.getElementById("carga-errores").textContent)));
    d.querySelector('[data-accion="cerrar-carga"]').click();
  });

  it("devolución con comentario y reenvío de nueva versión conservando el adjunto", async () => {
    const pendiente = (await db.consultar("select id from contenidos where slug = 'beca-de-transporte-2027'"))[0].id;
    const r = await director.post(`/api/contenidos/${pendiente}/decision`, { decision: "devolver", comentario: "Falta la fecha." });
    assert.equal(r.estado, 200);

    // el autor (la administradora, que lo cargó desde el formulario) recarga su panel y reenvía
    const domAutor = await abrir("panel.html", jarAdmin);
    const da = domAutor.window.document;
    assert.ok(await hasta(() => da.querySelector(".metrica")));
    domAutor.window.location.hash = "revision";
    assert.ok(await hasta(() => da.querySelector('[data-accion="nueva-version"]')));
    assert.ok(da.body.textContent.includes("Falta la fecha."), "ve el comentario de la devolución");

    da.querySelector('[data-accion="nueva-version"]').click();
    assert.equal(da.getElementById("c-slug").readOnly, true);
    assert.ok(da.getElementById("lista-adjuntos").textContent.includes("afiche.png"), "precarga el adjunto existente");
    da.getElementById("c-cuerpo").value = "Cuerpo con la fecha de cierre.";
    da.getElementById("form-carga").dispatchEvent(new domAutor.window.Event("submit", { cancelable: true }));
    assert.ok(await hasta(() => da.getElementById("panel-carga").hidden), da.getElementById("carga-errores").textContent);

    const versiones = await db.consultar("select numero, estado from versiones where contenido_id = ? order by numero", [pendiente]);
    assert.deepEqual(versiones.map((v) => [v.numero, v.estado]), [[1, "conservada"], [2, "en_revision"]]);
    const enlaces = await db.consultar("select count(*) as total from version_adjuntos where adjunto_id in (select id from adjuntos where nombre_original = 'afiche.png')");
    assert.equal(enlaces[0].total, 2, "el mismo archivo enlazado a las dos versiones");
    assert.equal((await db.consultar("select count(*) as total from adjuntos where nombre_original = 'afiche.png'"))[0].total, 1, "sin duplicar el archivo");
    await esperar(400); // deja terminar el refresco del panel antes de cerrar la ventana
    domAutor.window.close();
  });

  it("archiva sin eliminar y el contenido desaparece de la vista pública", async () => {
    w.location.hash = "historial";
    assert.ok(await hasta(() => d.querySelector(".registro")));
    const idPublicado = (await db.consultar("select id from contenidos where slug = ?", [slugs.pendiente]))[0].id;
    d.querySelector(`[data-accion="seleccionar-historial"][data-id="${idPublicado}"]`).click();
    d.querySelector('[data-accion="archivar"]').click();
    await confirmarDialogo(d, "Convocatoria vencida");
    assert.ok(await hasta(async () => (await estadoEnBd(slugs.pendiente)) === "archivado"));
    const publico = await (await fetch(`${entorno.url}/api/publico/${entorno.sitios[0].slug}/publicaciones`)).json();
    assert.equal(publico.length, 0);
    const [{ total }] = await db.consultar("select count(*) as total from versiones where contenido_id = ?", [idPublicado]);
    assert.equal(total, 1, "la versión se conserva");
    assert.ok(await hasta(() => d.body.textContent.includes("Este contenido está archivado")));
  });

  it("Equipo: el administrador cambia un rol y se guarda en la base", async () => {
    w.location.hash = "equipo";
    assert.ok(await hasta(() => d.querySelector(".tabla")));
    assert.equal(d.querySelectorAll(".tabla tbody tr").length, 4);
    const usuarios = await db.consultar("select id from usuarios where email = 'obs@prueba.edu.ar'");
    const buscar = () => d.querySelector(`select[data-id="${usuarios[0].id}"]`);
    const rolEnBd = async () => (await db.consultar("select rol from usuarios where email = 'obs@prueba.edu.ar'"))[0].rol;

    buscar().value = "colaborador";
    buscar().dispatchEvent(new w.Event("change", { bubbles: true }));
    assert.ok(await hasta(async () => (await rolEnBd()) === "colaborador"));

    // la tabla se vuelve a dibujar después de cada cambio, por eso se busca el select de nuevo
    assert.ok(await hasta(() => buscar() && buscar().value === "colaborador"));
    buscar().value = "observador";
    buscar().dispatchEvent(new w.Event("change", { bubbles: true }));
    assert.ok(await hasta(async () => (await rolEnBd()) === "observador"));
  });

  it("sin errores de JavaScript en toda la sesión", () => {
    assert.deepEqual(dom.errores, []);
  });
});

describe("cambiar contraseña desde el panel conectado al servidor", () => {
  it("muestra el botón, valida y actualiza la contraseña; la sesión sigue activa", async () => {
    const jar = new CookieJar();
    const login = await abrir("index.html", jar);
    await login.window.Nexo.api.iniciarSesion({ email: "director@prueba.edu.ar", password: PASSWORD });
    login.window.close();

    const dom = await abrir("panel.html", jar);
    const d = dom.window.document, w = dom.window;
    assert.ok(await hasta(() => d.querySelector(".metrica")));
    assert.equal(d.getElementById("btn-cambiar-password").hidden, false, "en modo servidor el botón es visible");

    d.getElementById("btn-cambiar-password").click();
    assert.ok(await hasta(() => d.getElementById("dialogo-password").open));

    d.getElementById("form-password").dispatchEvent(new w.Event("submit", { cancelable: true }));
    assert.ok(await hasta(() => !d.getElementById("password-errores").hidden), "exige la contraseña actual");

    d.getElementById("p-actual").value = "una-clave-que-no-es";
    d.getElementById("p-nueva").value = "clave-nueva-director-1";
    d.getElementById("form-password").dispatchEvent(new w.Event("submit", { cancelable: true }));
    assert.ok(await hasta(() => /no es correcta/.test(d.getElementById("password-errores").textContent)));

    d.getElementById("p-actual").value = PASSWORD;
    d.getElementById("p-nueva").value = "clave-nueva-director-1";
    d.getElementById("form-password").dispatchEvent(new w.Event("submit", { cancelable: true }));
    assert.ok(await hasta(() => !d.getElementById("dialogo-password").open), "cierra el diálogo al guardar");
    assert.ok(await hasta(() => d.querySelector(".aviso")?.textContent.includes("actualizó")));

    // la sesión actual sigue funcionando, y la vieja contraseña ya no sirve
    assert.equal((await w.Nexo.api.sesion()).rol, "director");
    assert.equal((await cliente(entorno.url).ingresar("director", PASSWORD)).estado, 401);
    const conLaNueva = await cliente(entorno.url).ingresar("director", "clave-nueva-director-1");
    assert.equal(conLaNueva.estado, 200);

    // se restaura para no afectar otras pruebas de este archivo, que ingresan con PASSWORD
    const restaurar = cliente(entorno.url);
    await restaurar.ingresar("director", "clave-nueva-director-1");
    await restaurar.post("/api/auth/password", { actual: "clave-nueva-director-1", nueva: PASSWORD });

    assert.deepEqual(dom.errores, []);
    dom.window.close();
  });
});

describe("permisos en la interfaz conectada al servidor", () => {
  it("el observador ve el panel de solo lectura y sin acciones de decisión ni de roles", async () => {
    const jar = new CookieJar();
    const login = await abrir("index.html", jar);
    await login.window.Nexo.api.iniciarSesion({ email: "obs@prueba.edu.ar", password: PASSWORD });
    login.window.close();

    const dom = await abrir("panel.html", jar);
    const d = dom.window.document;
    assert.ok(await hasta(() => d.querySelector(".metrica")));
    assert.equal(d.getElementById("btn-nuevo").disabled, true);
    dom.window.location.hash = "equipo";
    assert.ok(await hasta(() => d.querySelector(".tabla")));
    assert.equal(d.querySelectorAll("select[data-accion]").length, 0);
    dom.window.close();
  });

  it("sin sesión, el panel no muestra datos y lleva al login", async () => {
    const dom = await abrir("panel.html", new CookieJar());
    await esperar(600);
    assert.equal(dom.window.document.querySelector(".metrica"), null);
    dom.window.close();
  });

  it("la vista pública funciona sin sesión y muestra lo publicado", async () => {
    const admin = await ingresarComo(entorno.url, "admin");
    const conAdjunto = new FormData();
    conAdjunto.append("datos", JSON.stringify(datosContenido({ slug: "convocatoria-publica", titulo: "Convocatoria pública", seccion: "Comunidad" })));
    conAdjunto.append("adjuntos", new Blob([PNG], { type: "image/png" }), "bases.png");
    const creado = (await admin.post("/api/contenidos", conAdjunto)).datos;
    const director = await ingresarComo(entorno.url, "director");
    await director.post(`/api/contenidos/${creado.id}/decision`, { decision: "aprobar" });
    await director.post(`/api/contenidos/${creado.id}/publicar`);

    const dom = await abrir("publico.html", new CookieJar());
    const d = dom.window.document;
    assert.ok(await hasta(() => d.querySelector(".publicacion")));
    assert.ok(d.querySelector(".publicacion__titulo").textContent.includes("Convocatoria pública"));
    assert.ok(!d.body.textContent.includes("Persona"), "no aparecen autores");

    dom.window.location.hash = "convocatoria-publica";
    assert.ok(await hasta(() => d.querySelector(".articulo")));
    const enlace = d.querySelector(".articulo__documentos a");
    assert.ok(enlace, "muestra el documento adjunto");
    const descarga = await fetch(entorno.url + enlace.getAttribute("href"));
    assert.equal(descarga.status, 200);
    assert.deepEqual(Buffer.from(await descarga.arrayBuffer()), PNG);
    assert.deepEqual(dom.errores, []);
    dom.window.close();
  });
});
