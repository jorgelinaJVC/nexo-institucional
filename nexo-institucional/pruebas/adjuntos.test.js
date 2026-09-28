"use strict";

const fs = require("node:fs");
const { describe, it, before, after } = require("node:test");
const assert = require("node:assert/strict");
const { iniciar, cliente, ingresarComo, datosContenido } = require("./ayudas");

let entorno;
let admin, director, colab;

// PNG válido de 1x1 píxel
const PNG = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==",
  "base64"
);
const PDF = Buffer.from("%PDF-1.4\n1 0 obj\n<<>>\nendobj\ntrailer\n<<>>\n%%EOF\n");

before(async () => {
  entorno = await iniciar();
  [admin, director, colab] = await Promise.all(["admin", "director", "colab"].map((c) => ingresarComo(entorno.url, c)));
});

after(() => entorno.cerrar());

const archivosEnDisco = () => (fs.existsSync(entorno.carpetaAdjuntos) ? fs.readdirSync(entorno.carpetaAdjuntos).length : 0);

/** Arma el multipart como lo hace el frontend: datos en JSON + archivos en el campo "adjuntos". */
function formulario(datos, archivos = []) {
  const envio = new FormData();
  envio.append("datos", JSON.stringify(datos));
  for (const { nombre, contenido, tipo } of archivos) {
    envio.append("adjuntos", new Blob([contenido], { type: tipo }), nombre);
  }
  return envio;
}

const logo = { nombre: "logoMA.png", contenido: PNG, tipo: "image/png" };

describe("adjuntos", () => {
  it("guarda un adjunto válido y lo devuelve con id, nombre y tamaño", async () => {
    const r = await colab.post("/api/contenidos", formulario(datosContenido(), [logo]));
    assert.equal(r.estado, 201, JSON.stringify(r.datos));
    const [adjunto] = r.datos.versiones[0].adjuntos;
    assert.equal(adjunto.nombre, "logoMA.png");
    assert.equal(adjunto.tamano, PNG.length);
    assert.match(adjunto.id, /^\d+$/);
  });

  it("guarda el archivo en disco con un nombre generado por el servidor", async () => {
    const antes = archivosEnDisco();
    await colab.post("/api/contenidos", formulario(datosContenido(), [{ nombre: "../../etc/passwd.pdf", contenido: PDF, tipo: "application/pdf" }]));
    assert.equal(archivosEnDisco(), antes + 1);
    for (const nombre of fs.readdirSync(entorno.carpetaAdjuntos)) {
      assert.match(nombre, /^[0-9a-f-]{36}$/, "solo UUID: nada del nombre original toca el disco");
    }
  });

  it("por defecto se puede VER el archivo (sin forzar la descarga), y devuelve exactamente los mismos bytes", async () => {
    const c = (await colab.post("/api/contenidos", formulario(datosContenido(), [logo]))).datos;
    const id = c.versiones[0].adjuntos[0].id;
    const r = await director.get(`/api/adjuntos/${id}`);
    assert.equal(r.estado, 200);
    assert.deepEqual(r.datos, PNG);
    assert.equal(r.cabeceras.get("content-type"), "image/png");
    assert.ok(!(r.cabeceras.get("content-disposition") || "").includes("attachment"), "no debe forzar la descarga por defecto");
  });

  it("con ?descarga=1 fuerza la descarga con el nombre original", async () => {
    const c = (await colab.post("/api/contenidos", formulario(datosContenido(), [logo]))).datos;
    const id = c.versiones[0].adjuntos[0].id;
    const r = await director.get(`/api/adjuntos/${id}?descarga=1`);
    assert.equal(r.estado, 200);
    assert.deepEqual(r.datos, PNG);
    assert.match(r.cabeceras.get("content-disposition"), /attachment; filename="logoMA\.png"/);
  });

  it("no permite descargar sin sesión", async () => {
    const c = (await colab.post("/api/contenidos", formulario(datosContenido(), [logo]))).datos;
    const r = await cliente(entorno.url).get(`/api/adjuntos/${c.versiones[0].adjuntos[0].id}`);
    assert.equal(r.estado, 401);
  });

  it("rechaza formatos no permitidos", async () => {
    const antes = archivosEnDisco();
    const r = await colab.post("/api/contenidos", formulario(datosContenido(), [
      { nombre: "virus.exe", contenido: Buffer.from("MZ...."), tipo: "application/x-msdownload" },
    ]));
    assert.equal(r.estado, 400);
    assert.match(r.datos.error.mensaje, /formato no permitido/);
    assert.equal(archivosEnDisco(), antes, "no queda ningún archivo en disco");
  });

  it("rechaza un archivo cuyo contenido no coincide con su extensión", async () => {
    const antes = archivosEnDisco();
    const r = await colab.post("/api/contenidos", formulario(datosContenido(), [
      { nombre: "falso.png", contenido: Buffer.from("<script>alert(1)</script>"), tipo: "image/png" },
    ]));
    assert.equal(r.estado, 400);
    assert.match(r.datos.error.mensaje, /no coincide/);
    assert.equal(archivosEnDisco(), antes);
  });

  it("rechaza un .txt con bytes binarios y acepta uno de texto", async () => {
    const malo = await colab.post("/api/contenidos", formulario(datosContenido(), [
      { nombre: "nota.txt", contenido: Buffer.from([0x68, 0x00, 0x69]), tipo: "text/plain" },
    ]));
    assert.equal(malo.estado, 400);
    const bueno = await colab.post("/api/contenidos", formulario(datosContenido(), [
      { nombre: "nota.txt", contenido: Buffer.from("Texto plano con acentos: año"), tipo: "text/plain" },
    ]));
    assert.equal(bueno.estado, 201);
  });

  it("rechaza archivos de más de 10 MB", async () => {
    const grande = Buffer.concat([PDF, Buffer.alloc(10 * 1024 * 1024)]);
    const antes = archivosEnDisco();
    const r = await colab.post("/api/contenidos", formulario(datosContenido(), [{ nombre: "grande.pdf", contenido: grande, tipo: "application/pdf" }]));
    assert.equal(r.estado, 400);
    assert.match(r.datos.error.mensaje, /10 MB/);
    assert.equal(archivosEnDisco(), antes);
  });

  it("rechaza más de 8 adjuntos", async () => {
    const nueve = Array.from({ length: 9 }, (_, i) => ({ nombre: `doc${i}.pdf`, contenido: PDF, tipo: "application/pdf" }));
    const r = await colab.post("/api/contenidos", formulario(datosContenido(), nueve));
    assert.equal(r.estado, 400);
  });

  it("si la operación falla, borra los archivos que ya se habían subido", async () => {
    const original = (await colab.post("/api/contenidos", formulario(datosContenido(), []))).datos;
    const antes = archivosEnDisco();
    const r = await colab.post("/api/contenidos", formulario(datosContenido({ slug: original.slug }), [logo]));
    assert.equal(r.estado, 409);
    assert.equal(archivosEnDisco(), antes, "el identificador repetido no deja archivos huérfanos");
  });

  it("un observador no puede subir archivos", async () => {
    const obs = await ingresarComo(entorno.url, "obs");
    const antes = archivosEnDisco();
    const r = await obs.post("/api/contenidos", formulario(datosContenido(), [logo]));
    assert.equal(r.estado, 403);
    assert.equal(archivosEnDisco(), antes, "ni siquiera se procesa el archivo");
  });
});

describe("adjuntos entre versiones y en la vista pública", () => {
  it("una nueva versión conserva los adjuntos que se piden y suma los nuevos", async () => {
    const c = (await colab.post("/api/contenidos", formulario(datosContenido(), [logo]))).datos;
    const idLogo = c.versiones[0].adjuntos[0].id;
    await director.post(`/api/contenidos/${c.id}/decision`, { decision: "devolver", comentario: "Sumar el PDF." });

    const nuevos = { ...datosContenido(), slug: undefined, conservar: [idLogo] };
    const r = await colab.post(`/api/contenidos/${c.id}/versiones`, formulario(nuevos, [
      { nombre: "bases.pdf", contenido: PDF, tipo: "application/pdf" },
    ]));
    assert.equal(r.estado, 201, JSON.stringify(r.datos));
    assert.deepEqual(r.datos.versiones[0].adjuntos.map((a) => a.nombre), ["logoMA.png"], "la versión 1 no cambia");
    assert.deepEqual(r.datos.versiones[1].adjuntos.map((a) => a.nombre).sort(), ["bases.pdf", "logoMA.png"]);
    assert.equal(r.datos.versiones[1].adjuntos.find((a) => a.nombre === "logoMA.png").id, idLogo, "es el mismo archivo, no una copia");
  });

  it("no permite conservar adjuntos de otro contenido", async () => {
    const ajeno = (await colab.post("/api/contenidos", formulario(datosContenido(), [logo]))).datos;
    const propio = (await colab.post("/api/contenidos", formulario(datosContenido(), []))).datos;
    await director.post(`/api/contenidos/${propio.id}/decision`, { decision: "devolver", comentario: "Ajustar." });
    const r = await colab.post(`/api/contenidos/${propio.id}/versiones`, formulario({
      ...datosContenido(), slug: undefined, conservar: [ajeno.versiones[0].adjuntos[0].id],
    }));
    assert.equal(r.estado, 400);
  });

  it("el adjunto solo se descarga públicamente cuando su versión está publicada", async () => {
    const c = (await colab.post("/api/contenidos", formulario(datosContenido(), [logo]))).datos;
    const id = c.versiones[0].adjuntos[0].id;
    const sitioSlug = entorno.sitios[0].slug;
    const anonimo = cliente(entorno.url);

    assert.equal((await anonimo.get(`/api/publico/${sitioSlug}/adjuntos/${id}`)).estado, 404, "en revisión");
    await director.post(`/api/contenidos/${c.id}/decision`, { decision: "aprobar" });
    assert.equal((await anonimo.get(`/api/publico/${sitioSlug}/adjuntos/${id}`)).estado, 404, "aprobado, sin publicar");

    await director.post(`/api/contenidos/${c.id}/publicar`);
    const publico = await anonimo.get(`/api/publico/${sitioSlug}/adjuntos/${id}`);
    assert.equal(publico.estado, 200);
    assert.deepEqual(publico.datos, PNG);

    const detalle = (await anonimo.get(`/api/publico/${sitioSlug}/publicaciones/${c.slug}`)).datos;
    assert.equal(detalle.adjuntos[0].id, id);

    await admin.post(`/api/contenidos/${c.id}/archivar`, { motivo: "Prueba" });
    assert.equal((await anonimo.get(`/api/publico/${sitioSlug}/adjuntos/${id}`)).estado, 404, "archivado: deja de ser público");
    assert.equal((await director.get(`/api/adjuntos/${id}`)).estado, 200, "pero el equipo lo sigue viendo");
  });

  it("no acepta ids de adjunto inválidos", async () => {
    assert.equal((await director.get("/api/adjuntos/abc")).estado, 404);
    assert.equal((await director.get("/api/adjuntos/99999999")).estado, 404);
    assert.equal((await cliente(entorno.url).get(`/api/publico/${entorno.sitios[0].slug}/adjuntos/1%20or%201=1`)).estado, 404);
  });
});
