"use strict";

const { describe, it, before, after } = require("node:test");
const assert = require("node:assert/strict");
const { iniciar, cliente, ingresarComo, datosContenido, db, PASSWORD } = require("./ayudas");
const auth = require("../backend/src/auth");

let entorno;
let admin, director, colab, obs;

before(async () => {
  entorno = await iniciar();
  [admin, director, colab, obs] = await Promise.all(
    ["admin", "director", "colab", "obs"].map((clave) => ingresarComo(entorno.url, clave))
  );
});

after(() => entorno.cerrar());

/** El colaborador carga un contenido y devuelve lo que responde la API. */
async function cargar(extra) {
  const r = await colab.post("/api/contenidos", datosContenido(extra));
  assert.equal(r.estado, 201, JSON.stringify(r.datos));
  return r.datos;
}

/** Lo lleva hasta "aprobado" (director) o "publicado" (director + publicar). */
async function aprobar(contenido) {
  const r = await director.post(`/api/contenidos/${contenido.id}/decision`, { decision: "aprobar" });
  assert.equal(r.estado, 200, JSON.stringify(r.datos));
  return r.datos;
}

/** URL pública del sitio de prueba por defecto (el mismo que usa datosContenido()). */
const publico = (camino = "") => `/api/publico/${entorno.sitios[0].slug}${camino}`;

describe("autenticación", () => {
  it("rechaza contraseña incorrecta con un mensaje genérico", async () => {
    const r = await cliente(entorno.url).ingresar("admin", "otra-clave-larga");
    assert.equal(r.estado, 401);
    assert.equal(r.datos.error.codigo, "credenciales");
    assert.equal(r.datos.error.mensaje, "Correo o contraseña incorrectos.");
  });

  it("no revela si un correo existe", async () => {
    const r = await cliente(entorno.url).pedir("POST", "/api/auth/login", { email: "nadie@prueba.edu.ar", password: PASSWORD });
    assert.equal(r.estado, 401);
    assert.equal(r.datos.error.mensaje, "Correo o contraseña incorrectos.");
  });

  it("inicia sesión con una cookie HttpOnly y SameSite", async () => {
    const c = cliente(entorno.url);
    const r = await c.ingresar("colab");
    assert.equal(r.estado, 200);
    assert.equal(r.datos.usuario.rol, "colaborador");
    assert.equal(r.datos.usuario.password_hash, undefined);
    const cookie = r.cabeceras.getSetCookie()[0];
    assert.match(cookie, /HttpOnly/);
    assert.match(cookie, /SameSite=Lax/);
  });

  it("GET /auth/sesion devuelve el usuario o null", async () => {
    const anonimo = await cliente(entorno.url).get("/api/auth/sesion");
    assert.equal(anonimo.estado, 200);
    assert.equal(anonimo.datos.usuario, null);
    const propio = await admin.get("/api/auth/sesion");
    assert.equal(propio.datos.usuario.email, "admin@prueba.edu.ar");
  });

  it("exige sesión para todo lo interno", async () => {
    const anonimo = cliente(entorno.url);
    for (const ruta of ["/api/contenidos", "/api/usuarios", "/api/adjuntos/1"]) {
      const r = await anonimo.get(ruta);
      assert.equal(r.estado, 401, ruta);
      assert.equal(r.datos.error.codigo, "sin_sesion");
    }
  });

  it("cerrar sesión invalida la cookie", async () => {
    const c = await ingresarComo(entorno.url, "obs");
    const cookieVieja = c.cookie;
    assert.equal((await c.get("/api/contenidos")).estado, 200);
    await c.post("/api/auth/logout");
    const reutilizada = cliente(entorno.url);
    reutilizada.cookie = cookieVieja;
    assert.equal((await reutilizada.get("/api/contenidos")).estado, 401);
  });

  it("una sesión vencida deja de valer", async () => {
    const c = await ingresarComo(entorno.url, "obs");
    await db.ejecutar("update sesiones set expira_en = date_sub(utc_timestamp(), interval 1 minute)");
    assert.equal((await c.get("/api/contenidos")).estado, 401);
    // las demás sesiones de la prueba también quedaron vencidas: se vuelven a abrir
    [admin, director, colab, obs] = await Promise.all(
      ["admin", "director", "colab", "obs"].map((clave) => ingresarComo(entorno.url, clave))
    );
  });

  it("limita los intentos fallidos de inicio de sesión", async () => {
    auth.reiniciarLimites();
    const c = cliente(entorno.url);
    for (let i = 0; i < 5; i += 1) assert.equal((await c.ingresar("obs", "incorrecta-larga-1")).estado, 401);
    const bloqueado = await c.ingresar("obs");
    assert.equal(bloqueado.estado, 429, "incluso con la clave correcta, mientras dura el bloqueo");
    auth.reiniciarLimites();
  });

  it("rechaza pedidos que modifican datos desde otro origen (CSRF)", async () => {
    const r = await admin.post("/api/contenidos", datosContenido(), { origin: "http://sitio-malicioso.example" });
    assert.equal(r.estado, 403);
    assert.equal(r.datos.error.codigo, "origen_invalido");
  });

  it("no expone hashes de contraseña en el listado de usuarios", async () => {
    const r = await admin.get("/api/usuarios");
    assert.equal(r.estado, 200);
    assert.equal(r.datos.length, 4);
    assert.ok(!JSON.stringify(r.datos).includes("password"));
    assert.ok(r.datos.every((u) => typeof u.id === "string"));
  });
});

describe("cambiar la propia contraseña", () => {
  it("exige sesión y valida la contraseña actual", async () => {
    const anonimo = cliente(entorno.url);
    assert.equal((await anonimo.post("/api/auth/password", { actual: PASSWORD, nueva: "otra-clave-larga-1" })).estado, 401);

    const c = await ingresarComo(entorno.url, "colab");
    const r = await c.post("/api/auth/password", { actual: "clave-incorrecta-larga", nueva: "otra-clave-larga-1" });
    assert.equal(r.estado, 401);
    assert.equal(r.datos.error.codigo, "credenciales");
  });

  it("exige que la nueva contraseña sea distinta y cumpla el largo mínimo", async () => {
    const c = await ingresarComo(entorno.url, "director");
    assert.equal((await c.post("/api/auth/password", { actual: PASSWORD, nueva: "corta" })).estado, 400);
    assert.equal((await c.post("/api/auth/password", { actual: PASSWORD, nueva: PASSWORD })).estado, 400);
  });

  it("cambia la contraseña y desde ese momento hay que ingresar con la nueva", async () => {
    const c = await ingresarComo(entorno.url, "obs");
    const r = await c.post("/api/auth/password", { actual: PASSWORD, nueva: "clave-nueva-larga-1" });
    assert.equal(r.estado, 200);

    const conLaVieja = await cliente(entorno.url).ingresar("obs", PASSWORD);
    assert.equal(conLaVieja.estado, 401);

    const conLaNueva = await cliente(entorno.url).ingresar("obs", "clave-nueva-larga-1");
    assert.equal(conLaNueva.estado, 200);

    // se restaura para no afectar al resto de las pruebas de este archivo
    const nuevo = cliente(entorno.url);
    await nuevo.ingresar("obs", "clave-nueva-larga-1");
    await nuevo.post("/api/auth/password", { actual: "clave-nueva-larga-1", nueva: PASSWORD });
  });
});

describe("roles y permisos", () => {
  it("el observador solo consulta", async () => {
    assert.equal((await obs.get("/api/contenidos")).estado, 200);
    const r = await obs.post("/api/contenidos", datosContenido());
    assert.equal(r.estado, 403);
    assert.equal((await obs.patch("/api/usuarios/1/rol", { rol: "administrador" })).estado, 403);
  });

  it("el colaborador carga pero no decide, publica, archiva ni cambia roles", async () => {
    const c = await cargar();
    assert.equal((await colab.post(`/api/contenidos/${c.id}/decision`, { decision: "aprobar" })).estado, 403);
    assert.equal((await colab.post(`/api/contenidos/${c.id}/publicar`)).estado, 403);
    assert.equal((await colab.post(`/api/contenidos/${c.id}/archivar`, {})).estado, 403);
    assert.equal((await colab.patch(`/api/usuarios/${c.autorId}/rol`, { rol: "administrador" })).estado, 403);
  });

  it("el director no puede revisar lo que cargó él mismo, pero el administrador sí", async () => {
    const propio = (await director.post("/api/contenidos", datosContenido())).datos;
    const intento = await director.post(`/api/contenidos/${propio.id}/decision`, { decision: "aprobar" });
    assert.equal(intento.estado, 403);
    assert.match(intento.datos.error.mensaje, /cargaste vos/);
    const porAdmin = await admin.post(`/api/contenidos/${propio.id}/decision`, { decision: "aprobar" });
    assert.equal(porAdmin.estado, 200);
  });

  it("solo el administrador cambia roles y siempre queda uno", async () => {
    const usuarios = (await admin.get("/api/usuarios")).datos;
    const idObs = usuarios.find((u) => u.email === "obs@prueba.edu.ar").id;
    const idAdmin = usuarios.find((u) => u.email === "admin@prueba.edu.ar").id;

    assert.equal((await director.patch(`/api/usuarios/${idObs}/rol`, { rol: "colaborador" })).estado, 403);

    const cambio = await admin.patch(`/api/usuarios/${idObs}/rol`, { rol: "colaborador" });
    assert.equal(cambio.estado, 200);
    assert.equal(cambio.datos.rol, "colaborador");
    await admin.patch(`/api/usuarios/${idObs}/rol`, { rol: "observador" });

    const ultimo = await admin.patch(`/api/usuarios/${idAdmin}/rol`, { rol: "observador" });
    assert.equal(ultimo.estado, 409);
    assert.match(ultimo.datos.error.mensaje, /al menos un administrador/);

    assert.equal((await admin.patch(`/api/usuarios/${idObs}/rol`, { rol: "superusuario" })).estado, 400);
    assert.equal((await admin.patch("/api/usuarios/99999/rol", { rol: "director" })).estado, 404);
  });

  it("el cambio de rol se aplica de inmediato en los permisos", async () => {
    const usuarios = (await admin.get("/api/usuarios")).datos;
    const idObs = usuarios.find((u) => u.email === "obs@prueba.edu.ar").id;
    await admin.patch(`/api/usuarios/${idObs}/rol`, { rol: "colaborador" });
    assert.equal((await obs.post("/api/contenidos", datosContenido())).estado, 201);
    await admin.patch(`/api/usuarios/${idObs}/rol`, { rol: "observador" });
    assert.equal((await obs.post("/api/contenidos", datosContenido())).estado, 403);
  });

  it("solo el administrador puede agregar integrantes al equipo", async () => {
    const datos = { nombre: "Nueva Persona", email: "nueva.persona@prueba.edu.ar", rol: "colaborador", password: "Clave-larga-1" };
    for (const c of [director, colab, obs]) {
      const r = await c.post("/api/usuarios", datos);
      assert.equal(r.estado, 403);
    }
    const total = (await admin.get("/api/usuarios")).datos.length;
    const r = await admin.post("/api/usuarios", datos);
    assert.equal(r.estado, 201, JSON.stringify(r.datos));
    assert.equal(r.datos.rol, "colaborador");
    assert.equal(r.datos.email, "nueva.persona@prueba.edu.ar");
    assert.equal(r.datos.password, undefined, "no expone la contraseña ni su hash");
    assert.equal((await admin.get("/api/usuarios")).datos.length, total + 1);

    // ya puede ingresar de inmediato con la contraseña provisional
    const c = cliente(entorno.url);
    const login = await c.pedir("POST", "/api/auth/login", { email: "nueva.persona@prueba.edu.ar", password: "Clave-larga-1" });
    assert.equal(login.estado, 200);
    assert.equal(login.datos.usuario.rol, "colaborador");
  });

  it("el alta de integrantes valida los datos y rechaza correos repetidos", async () => {
    const base = { nombre: "Otra Persona", email: "otra.persona@prueba.edu.ar", rol: "director", password: "Clave-larga-1" };
    assert.equal((await admin.post("/api/usuarios", { ...base, nombre: "" })).estado, 400);
    assert.equal((await admin.post("/api/usuarios", { ...base, email: "no-es-un-correo" })).estado, 400);
    assert.equal((await admin.post("/api/usuarios", { ...base, rol: "superusuario" })).estado, 400);
    assert.equal((await admin.post("/api/usuarios", { ...base, password: "corta" })).estado, 400);

    assert.equal((await admin.post("/api/usuarios", base)).estado, 201);
    const repetido = await admin.post("/api/usuarios", base);
    assert.equal(repetido.estado, 400);
    assert.match(repetido.datos.error.mensaje, /ya existe/i);
  });
});

describe("circuito editorial", () => {
  it("un contenido nuevo queda en revisión como versión 1 y registra el envío", async () => {
    const c = await cargar();
    assert.equal(c.estado, "en_revision");
    assert.equal(c.versiones.length, 1);
    assert.equal(c.versiones[0].numero, 1);
    assert.equal(c.historial[0].tipo, "envio");
    assert.equal(c.publicada, null);
  });

  it("valida los datos y rechaza identificadores repetidos", async () => {
    assert.equal((await colab.post("/api/contenidos", datosContenido({ titulo: "" }))).estado, 400);
    assert.equal((await colab.post("/api/contenidos", datosContenido({ slug: "Con Espacios" }))).estado, 400);
    assert.equal((await colab.post("/api/contenidos", datosContenido({ resumen: "x".repeat(281) }))).estado, 400);
    const primero = await cargar();
    const repetido = await colab.post("/api/contenidos", datosContenido({ slug: primero.slug }));
    assert.equal(repetido.estado, 409);
    assert.equal(repetido.datos.error.codigo, "slug_duplicado");
  });

  it("devolver exige un comentario, que queda visible para el autor", async () => {
    const c = await cargar();
    const sin = await director.post(`/api/contenidos/${c.id}/decision`, { decision: "devolver", comentario: "  " });
    assert.equal(sin.estado, 400);

    const r = await director.post(`/api/contenidos/${c.id}/decision`, { decision: "devolver", comentario: "Falta la fecha de cierre." });
    assert.equal(r.estado, 200);
    assert.equal(r.datos.estado, "devuelto");
    assert.equal(r.datos.versiones[0].estado, "devuelta");
    assert.equal(r.datos.versiones[0].decision.comentario, "Falta la fecha de cierre.");
  });

  it("solo el autor (o un administrador) reenvía; la versión devuelta queda conservada", async () => {
    const c = await cargar();
    await director.post(`/api/contenidos/${c.id}/decision`, { decision: "devolver", comentario: "Ajustar." });

    const cambio = { ...datosContenido({ cuerpo: "Texto corregido." }), slug: undefined };
    assert.equal((await director.post(`/api/contenidos/${c.id}/versiones`, cambio)).estado, 403);

    const r = await colab.post(`/api/contenidos/${c.id}/versiones`, cambio);
    assert.equal(r.estado, 201);
    assert.equal(r.datos.estado, "en_revision");
    assert.equal(r.datos.versiones.length, 2);
    assert.equal(r.datos.versiones[0].estado, "conservada");
    assert.equal(r.datos.versiones[0].cuerpo, "Texto completo del contenido.", "la versión anterior no se reescribe");
    assert.equal(r.datos.versiones[1].cuerpo, "Texto corregido.");
  });

  it("aprobar NO publica: la publicación es un paso explícito", async () => {
    const c = await cargar();
    const aprobado = await aprobar(c);
    assert.equal(aprobado.estado, "aprobado");

    let listaPublica = await cliente(entorno.url).get(publico("/publicaciones"));
    assert.ok(!listaPublica.datos.some((p) => p.slug === c.slug), "aprobado todavía no es público");

    const publicado = await director.post(`/api/contenidos/${c.id}/publicar`);
    assert.equal(publicado.estado, 200);
    assert.equal(publicado.datos.estado, "publicado");
    assert.equal(publicado.datos.publicada.version, 1);

    listaPublica = await cliente(entorno.url).get(publico("/publicaciones"));
    assert.ok(listaPublica.datos.some((p) => p.slug === c.slug));
  });

  it("no se puede publicar algo que no está aprobado, ni decidir dos veces", async () => {
    const c = await cargar();
    assert.equal((await director.post(`/api/contenidos/${c.id}/publicar`)).estado, 409);
    await aprobar(c);
    const segunda = await admin.post(`/api/contenidos/${c.id}/decision`, { decision: "devolver", comentario: "tarde" });
    assert.equal(segunda.estado, 409);
  });

  it("dos decisiones simultáneas: solo una gana", async () => {
    const c = await cargar();
    const [a, b] = await Promise.all([
      admin.post(`/api/contenidos/${c.id}/decision`, { decision: "aprobar" }),
      director.post(`/api/contenidos/${c.id}/decision`, { decision: "devolver", comentario: "Otra opinión." }),
    ]);
    assert.deepEqual([a.estado, b.estado].sort(), [200, 409]);
    const lista = (await admin.get("/api/contenidos")).datos;
    const final = lista.find((x) => x.id === c.id);
    assert.equal(final.historial.filter((e) => ["aprobacion", "devolucion"].includes(e.tipo)).length, 1);
  });

  it("una nueva versión de algo publicado no retira la publicada hasta aprobarse y publicarse", async () => {
    const c = await cargar({ titulo: "Versión uno" });
    await aprobar(c);
    await director.post(`/api/contenidos/${c.id}/publicar`);

    const v2 = await colab.post(`/api/contenidos/${c.id}/versiones`, { ...datosContenido({ titulo: "Versión dos" }), slug: undefined });
    assert.equal(v2.estado, 201);
    assert.equal(v2.datos.estado, "en_revision");

    let publica = (await cliente(entorno.url).get(publico(`/publicaciones/${c.slug}`))).datos;
    assert.equal(publica.titulo, "Versión uno", "sigue visible la versión anterior");

    await director.post(`/api/contenidos/${c.id}/decision`, { decision: "aprobar" });
    await director.post(`/api/contenidos/${c.id}/publicar`);
    publica = (await cliente(entorno.url).get(publico(`/publicaciones/${c.slug}`))).datos;
    assert.equal(publica.titulo, "Versión dos");

    const completo = (await admin.get("/api/contenidos")).datos.find((x) => x.id === c.id);
    assert.deepEqual(completo.versiones.map((v) => v.estado), ["reemplazada", "publicada"]);
  });

  it("archivar oculta del público sin borrar nada; restaurar no republica", async () => {
    const c = await cargar();
    await aprobar(c);
    await director.post(`/api/contenidos/${c.id}/publicar`);

    const archivado = await director.post(`/api/contenidos/${c.id}/archivar`, { motivo: "Convocatoria vencida" });
    assert.equal(archivado.estado, 200);
    assert.equal(archivado.datos.estado, "archivado");
    assert.equal(archivado.datos.versiones.length, 1, "las versiones se conservan");
    assert.equal(archivado.datos.historial.at(-1).comentario, "Convocatoria vencida");
    assert.equal((await cliente(entorno.url).get(publico(`/publicaciones/${c.slug}`))).estado, 404);

    const restaurado = await director.post(`/api/contenidos/${c.id}/restaurar`);
    assert.equal(restaurado.estado, 200);
    assert.equal(restaurado.datos.estado, "aprobado");
    assert.equal((await cliente(entorno.url).get(publico(`/publicaciones/${c.slug}`))).estado, 404, "hay que publicar de nuevo");
  });

  it("el historial completo queda registrado en orden", async () => {
    const c = await cargar();
    await director.post(`/api/contenidos/${c.id}/decision`, { decision: "devolver", comentario: "Ajustar." });
    await colab.post(`/api/contenidos/${c.id}/versiones`, { ...datosContenido(), slug: undefined });
    await director.post(`/api/contenidos/${c.id}/decision`, { decision: "aprobar" });
    await director.post(`/api/contenidos/${c.id}/publicar`);
    const final = (await admin.get("/api/contenidos")).datos.find((x) => x.id === c.id);
    assert.deepEqual(final.historial.map((e) => e.tipo), ["envio", "devolucion", "envio", "aprobacion", "publicacion"]);
    assert.deepEqual(final.historial.map((e) => e.version), [1, 1, 2, 2, 2]);
  });

  it("responde 404 para contenidos inexistentes o ids inválidos", async () => {
    assert.equal((await director.post("/api/contenidos/999999/publicar")).estado, 404);
    assert.equal((await director.post("/api/contenidos/abc/publicar")).estado, 404);
  });

  it("una nueva versión con adjuntos inexistentes falla sin dejar nada a medias", async () => {
    const c = await cargar();
    await director.post(`/api/contenidos/${c.id}/decision`, { decision: "devolver", comentario: "Ajustar." });
    const envio = new FormData();
    envio.append("datos", JSON.stringify({ ...datosContenido(), slug: undefined, conservar: [999999] }));
    const r = await colab.post(`/api/contenidos/${c.id}/versiones`, envio);
    assert.equal(r.estado, 400);
    const final = (await admin.get("/api/contenidos")).datos.find((x) => x.id === c.id);
    assert.equal(final.versiones.length, 1);
    assert.equal(final.versiones[0].estado, "devuelta", "la transacción se revirtió por completo");
  });
});

describe("sitios y tipos de contenido", () => {
  it("lista los sitios sembrados", async () => {
    const r = await admin.get("/api/sitios");
    assert.equal(r.estado, 200);
    assert.equal(r.datos.length, 2);
    assert.deepEqual(Object.keys(r.datos[0]).sort(), ["id", "nombre", "slug"]);
  });

  it("exige un sitio y un tipo válidos al crear", async () => {
    assert.equal((await colab.post("/api/contenidos", datosContenido({ sitioId: 999999 }))).estado, 400);
    assert.equal((await colab.post("/api/contenidos", datosContenido({ sitioId: undefined }))).estado, 400);
    assert.equal((await colab.post("/api/contenidos", datosContenido({ tipo: "video" }))).estado, 400);
  });

  it("un mismo identificador web puede repetirse en sitios distintos, pero no dentro del mismo sitio", async () => {
    const otroSitioId = entorno.sitios[1].id;
    const slug = `compartido-${Date.now()}`;
    const primero = await colab.post("/api/contenidos", datosContenido({ slug }));
    assert.equal(primero.estado, 201);
    const repetidoMismoSitio = await colab.post("/api/contenidos", datosContenido({ slug }));
    assert.equal(repetidoMismoSitio.estado, 409);
    const otroSitio = await colab.post("/api/contenidos", datosContenido({ slug, sitioId: otroSitioId }));
    assert.equal(otroSitio.estado, 201, "el mismo identificador es válido en otro sitio");
    assert.equal(otroSitio.datos.sitio.id, String(otroSitioId));
  });

  it("una galería exige al menos una foto, y el cuerpo pasa a ser opcional", async () => {
    const sinFoto = await colab.post("/api/contenidos", datosContenido({ tipo: "galeria", cuerpo: "" }));
    assert.equal(sinFoto.estado, 400);
    assert.match(sinFoto.datos.error.mensaje, /al menos una foto/);

    const png = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==", "base64");
    const envio = new FormData();
    envio.append("datos", JSON.stringify({ ...datosContenido({ tipo: "galeria", cuerpo: "" }), slug: `galeria-${Date.now()}` }));
    envio.append("adjuntos", new Blob([png], { type: "image/png" }), "foto.png");
    const conFoto = await colab.post("/api/contenidos", envio);
    assert.equal(conFoto.estado, 201, JSON.stringify(conFoto.datos));
    assert.equal(conFoto.datos.tipo, "galeria");
    assert.equal(conFoto.datos.versiones[0].cuerpo, "");
  });

  it("el sitio y el tipo no se pueden cambiar en una nueva versión", async () => {
    const c = await cargar();
    await director.post(`/api/contenidos/${c.id}/decision`, { decision: "devolver", comentario: "Ajustar." });
    const r = await colab.post(`/api/contenidos/${c.id}/versiones`, { ...datosContenido(), slug: undefined, sitioId: entorno.sitios[1].id, tipo: "galeria" });
    assert.equal(r.estado, 201, "la nueva versión se crea igual...");
    assert.equal(r.datos.sitio.id, c.sitio.id, "...pero conserva el sitio original");
    assert.equal(r.datos.tipo, c.tipo, "...y el tipo original");
  });
});

describe("vista pública", () => {
  it("no expone autores, historial, correos ni contenido sin publicar", async () => {
    const c = await cargar({ titulo: "Sin publicar todavía" });
    const c2 = await cargar({ titulo: "Ya publicado" });
    await aprobar(c2);
    await director.post(`/api/contenidos/${c2.id}/publicar`);

    const r = await cliente(entorno.url).get(publico("/publicaciones"));
    assert.equal(r.estado, 200);
    const texto = JSON.stringify(r.datos);
    assert.ok(texto.includes("Ya publicado"));
    assert.ok(!texto.includes("Sin publicar todavía"));
    for (const prohibido of ["autorId", "historial", "usuarioId", "@prueba.edu.ar", "estado"]) {
      assert.ok(!texto.includes(prohibido), `no debe aparecer "${prohibido}"`);
    }
    assert.deepEqual(Object.keys(r.datos[0]).sort(), ["adjuntos", "cuerpo", "fecha", "resumen", "seccion", "sitio", "slug", "tipo", "titulo"]);
    assert.deepEqual(Object.keys(r.datos[0].sitio).sort(), ["nombre", "slug"]);
    assert.equal(typeof c.id, "string");
  });

  it("responde 404 si la publicación no existe", async () => {
    const r = await cliente(entorno.url).get(publico("/publicaciones/no-existe"));
    assert.equal(r.estado, 404);
  });

  it("ordena de la más reciente a la más antigua", async () => {
    const lista = (await cliente(entorno.url).get(publico("/publicaciones"))).datos;
    const fechas = lista.map((p) => new Date(p.fecha).getTime());
    assert.deepEqual(fechas, [...fechas].sort((a, b) => b - a));
  });
});

describe("servidor", () => {
  it("entrega su propio config.js en modo servidor y el frontend estático", async () => {
    const config = await cliente(entorno.url).get("/js/config.js");
    assert.equal(config.estado, 200);
    assert.match(config.datos.toString(), /modo: "servidor"/);
    const portada = await cliente(entorno.url).get("/");
    assert.equal(portada.estado, 200);
    assert.match(portada.datos.toString(), /Portal interno/);
  });

  it("envía cabeceras de seguridad y no revela el framework", async () => {
    const r = await cliente(entorno.url).get("/api/salud");
    assert.equal(r.cabeceras.get("x-content-type-options"), "nosniff");
    assert.equal(r.cabeceras.get("x-powered-by"), null);
    assert.ok(r.cabeceras.get("content-security-policy").includes("default-src 'self'"));
  });

  it("responde 400 ante JSON mal formado", async () => {
    const respuesta = await fetch(`${entorno.url}/api/auth/login`, {
      method: "POST", headers: { "content-type": "application/json" }, body: "{no es json",
    });
    assert.equal(respuesta.status, 400);
  });
});
