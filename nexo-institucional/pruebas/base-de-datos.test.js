"use strict";

const { describe, it, before, after } = require("node:test");
const assert = require("node:assert/strict");
const { iniciar, ingresarComo, cliente, datosContenido, db } = require("./ayudas");

let entorno;
let colab, director;
let contenido;

const PNG = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==",
  "base64"
);

before(async () => {
  entorno = await iniciar();
  colab = await ingresarComo(entorno.url, "colab");
  director = await ingresarComo(entorno.url, "director");
  contenido = (await colab.post("/api/contenidos", datosContenido())).datos;
  await director.post(`/api/contenidos/${contenido.id}/decision`, { decision: "aprobar", comentario: "ok" });
  await director.post(`/api/contenidos/${contenido.id}/publicar`);

  // un contenido con adjunto, para probar que los archivos tampoco se pueden borrar
  const envio = new FormData();
  envio.append("datos", JSON.stringify(datosContenido()));
  envio.append("adjuntos", new Blob([PNG], { type: "image/png" }), "logo.png");
  const conAdjunto = await colab.post("/api/contenidos", envio);
  assert.equal(conAdjunto.estado, 201);
});

after(() => entorno.cerrar());

const rechaza = (promesa, patron) => assert.rejects(promesa, (error) => {
  assert.match(error.message, patron);
  return true;
});

describe("triggers: el historial no se puede reescribir ni borrar", () => {
  it("no permite modificar el texto de una versión", async () => {
    await rechaza(db.ejecutar("update versiones set titulo = 'Manipulado' where contenido_id = ?", [contenido.id]), /no se puede modificar/);
    await rechaza(db.ejecutar("update versiones set cuerpo = 'Manipulado' where contenido_id = ?", [contenido.id]), /no se puede modificar/);
  });

  it("sí permite cambiar el estado y la decisión de una versión (flujo normal)", async () => {
    await db.ejecutar("update versiones set estado = 'reemplazada' where contenido_id = ?", [contenido.id]);
    await db.ejecutar("update versiones set estado = 'publicada' where contenido_id = ?", [contenido.id]);
    const [v] = await db.consultar("select estado from versiones where contenido_id = ?", [contenido.id]);
    assert.equal(v.estado, "publicada");
  });

  it("no permite borrar ni editar eventos", async () => {
    await rechaza(db.ejecutar("delete from eventos"), /no se puede eliminar/);
    await rechaza(db.ejecutar("update eventos set comentario = 'borrado' where contenido_id = ?", [contenido.id]), /inmutable/);
  });

  it("no permite borrar versiones, contenidos ni adjuntos", async () => {
    await rechaza(db.ejecutar("delete from versiones"), /no se pueden eliminar/);
    await rechaza(db.ejecutar("delete from contenidos"), /se archivan/);
    const [{ total }] = await db.consultar("select count(*) as total from adjuntos");
    assert.ok(total > 0, "la prueba necesita al menos un adjunto para que el trigger se dispare");
    await rechaza(db.ejecutar("delete from adjuntos"), /no se pueden eliminar/);
  });

  it("no permite cambiar el identificador web, el sitio ni el tipo de un contenido", async () => {
    await rechaza(db.ejecutar("update contenidos set slug = 'otro' where id = ?", [contenido.id]), /no se puede cambiar/);
    await rechaza(db.ejecutar("update contenidos set sitio_id = 999999 where id = ?", [contenido.id]), /el sitio de un contenido no se puede cambiar/);
    await rechaza(db.ejecutar("update contenidos set tipo = 'galeria' where id = ?", [contenido.id]), /el tipo de un contenido no se puede cambiar/);
  });

  it("los datos siguen intactos después de los intentos", async () => {
    const [v] = await db.consultar("select titulo from versiones where contenido_id = ?", [contenido.id]);
    assert.equal(v.titulo, "Convocatoria de becas");
    const [{ total }] = await db.consultar("select count(*) as total from eventos where contenido_id = ?", [contenido.id]);
    assert.equal(total, 3, "envío, aprobación y publicación");
  });
});

describe("restricciones e integridad", () => {
  it("el identificador web es único dentro del mismo sitio", async () => {
    await rechaza(
      db.ejecutar(
        "insert into contenidos (sitio_id, tipo, seccion, slug, autor_id, creado_en, actualizado_en) values (?, 'noticia', 'x', ?, 1, utc_timestamp(), utc_timestamp())",
        [contenido.sitio.id, contenido.slug]
      ),
      /Duplicate entry/
    );
  });

  it("no acepta roles ni estados fuera de los permitidos", async () => {
    await assert.rejects(db.ejecutar("update usuarios set rol = 'superusuario' where id = 1"));
    await assert.rejects(db.ejecutar("update contenidos set estado = 'inventado' where id = ?", [contenido.id]));
  });

  it("las claves foráneas impiden datos huérfanos", async () => {
    await assert.rejects(
      db.ejecutar("insert into versiones (contenido_id, numero, autor_id, titulo, resumen, cuerpo, creada_en) values (999999, 1, 1, 't', 'r', 'c', utc_timestamp())")
    );
  });

  it("las contraseñas se guardan con bcrypt, nunca en claro", async () => {
    const [u] = await db.consultar("select password_hash from usuarios where email = 'admin@prueba.edu.ar'");
    assert.match(u.password_hash, /^\$2[aby]\$/);
    assert.ok(!u.password_hash.includes("Clave-de-prueba"));
  });

  it("los tokens de sesión se guardan como hash, no en claro", async () => {
    const [s] = await db.consultar("select token_hash from sesiones limit 1");
    assert.match(s.token_hash, /^[0-9a-f]{64}$/);
  });
});

describe("vista_publicaciones", () => {
  it("muestra únicamente lo que tiene versión publicada", async () => {
    const pendiente = (await colab.post("/api/contenidos", datosContenido({ titulo: "Todavía en revisión" }))).datos;
    const filas = await db.consultar("select slug, titulo from vista_publicaciones");
    assert.ok(filas.some((f) => f.slug === contenido.slug));
    assert.ok(!filas.some((f) => f.slug === pendiente.slug));
  });
});

describe("seguridad de los datos", () => {
  it("guarda tal cual un intento de inyección SQL, sin ejecutarlo", async () => {
    const malicioso = "Robert'); drop table usuarios;-- ' or '1'='1";
    const r = await colab.post("/api/contenidos", datosContenido({ titulo: malicioso, seccion: "x' or '1'='1" }));
    assert.equal(r.estado, 201);
    assert.equal(r.datos.versiones[0].titulo, malicioso);
    const [{ total }] = await db.consultar("select count(*) as total from usuarios");
    assert.equal(total, 4, "la tabla de usuarios sigue existiendo");
  });

  it("no falla con inyección en el correo del login", async () => {
    const r = await cliente(entorno.url).pedir("POST", "/api/auth/login", { email: "' or 1=1 --", password: "cualquier-clave-larga" });
    assert.equal(r.estado, 401);
  });

  it("guarda acentos, eñes y emojis (utf8mb4)", async () => {
    const titulo = "Ñandú y sus crías 🌱 — año 2027";
    const r = await colab.post("/api/contenidos", datosContenido({ titulo }));
    assert.equal(r.datos.versiones[0].titulo, titulo);
    const [fila] = await db.consultar("select titulo from versiones where contenido_id = ?", [r.datos.id]);
    assert.equal(fila.titulo, titulo);
  });

  it("guarda el HTML como texto plano (el frontend lo escapa al mostrarlo)", async () => {
    const titulo = "<img src=x onerror=alert(1)>";
    const r = await colab.post("/api/contenidos", datosContenido({ titulo }));
    assert.equal(r.datos.versiones[0].titulo, titulo);
  });
});
