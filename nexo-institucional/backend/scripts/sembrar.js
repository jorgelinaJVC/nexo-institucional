"use strict";

/* Carga dos páginas institucionales de ejemplo, cuatro personas (una por rol) y contenidos repartidos
 * en los tres tipos (noticia, proyecto institucional, galería), usando las mismas reglas que la aplicación.
 *   npm run bd:sembrar
 * La contraseña de ejemplo sale de SEMILLA_PASSWORD (por defecto "Nexo-demo-2026"): cambiala en cualquier entorno real.
 * Los nombres de los sitios son de ejemplo: renombralos o creá los tuyos con "npm run sitio:crear".
 */

const fs = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");
const db = require("../src/db");
const config = require("../src/config");
const { consultar } = require("../src/db");
const { crearUsuario } = require("../src/servicios/usuarios");
const { crearSitio } = require("./crear-sitio");
const contenidos = require("../src/servicios/contenidos");

const PERSONAS = [
  { nombre: "Jorgelina Campos", email: "jorgelina.campos@ejemplo.edu.ar", rol: "administrador" },
  { nombre: "Marcos Ledesma", email: "marcos.ledesma@ejemplo.edu.ar", rol: "director" },
  { nombre: "Analía Rojas", email: "analia.rojas@ejemplo.edu.ar", rol: "colaborador" },
  { nombre: "Tomás Herrera", email: "tomas.herrera@ejemplo.edu.ar", rol: "observador" },
];

const SITIOS = [
  { nombre: "Sitio institucional 1", slug: "sitio-1" },
  { nombre: "Sitio institucional 2", slug: "sitio-2" },
];

// PNG de 1x1 píxel, solo para que la galería de ejemplo tenga una foto real y descargable.
const FOTO_EJEMPLO = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==", "base64"
);

async function asegurarSitios() {
  const existentes = await consultar("select slug from sitios");
  const slugs = new Set(existentes.map((s) => s.slug));
  for (const sitio of SITIOS) {
    if (!slugs.has(sitio.slug)) await crearSitio(sitio.nombre, sitio.slug);
  }
  const filas = await consultar("select id, slug from sitios where slug in (?)", [SITIOS.map((s) => s.slug)]);
  return Object.fromEntries(filas.map((f) => [f.slug, String(f.id)]));
}

/** Adjunta una foto real (queda en disco, como si se hubiera subido desde el formulario). */
function fotoAdjunta(nombre) {
  fs.mkdirSync(config.carpetaAdjuntos, { recursive: true });
  const nombreAlmacenado = crypto.randomUUID();
  fs.writeFileSync(path.join(config.carpetaAdjuntos, nombreAlmacenado), FOTO_EJEMPLO);
  return [{ nombreOriginal: nombre, nombreAlmacenado, mime: "image/png", tamano: FOTO_EJEMPLO.length }];
}

async function sembrar() {
  const password = process.env.SEMILLA_PASSWORD || "Nexo-demo-2026";
  const sitios = await asegurarSitios();

  const existentes = await consultar("select email from usuarios");
  const correos = new Set(existentes.map((u) => u.email));
  for (const persona of PERSONAS) {
    if (!correos.has(persona.email)) await crearUsuario({ ...persona, password });
  }

  const [{ total }] = await consultar("select count(*) as total from contenidos");
  if (total > 0) return { contenidosCreados: false, password };

  const usuario = async (email) => {
    const [fila] = await consultar("select id, rol from usuarios where email = ?", [email]);
    return { id: String(fila.id), rol: fila.rol };
  };
  const admin = await usuario("jorgelina.campos@ejemplo.edu.ar");
  const director = await usuario("marcos.ledesma@ejemplo.edu.ar");
  const colaboradora = await usuario("analia.rojas@ejemplo.edu.ar");

  const publicado = async (datos) => {
    const creado = await contenidos.crearContenido(colaboradora, datos);
    await contenidos.decidir(director, creado.id, { decision: "aprobar", comentario: "" });
    await contenidos.publicar(director, creado.id);
    return creado;
  };

  const becas = await publicado({
    sitioId: sitios["sitio-1"], tipo: "noticia",
    seccion: "Becas y beneficios",
    slug: "convocatoria-becas-2026",
    titulo: "Convocatoria de becas de permanencia 2026",
    resumen: "Información, requisitos y fechas para postular a las becas de permanencia estudiantil.",
    cuerpo: "Se abre la convocatoria de becas de permanencia para estudiantes regulares.\n\nLa inscripción se realiza en la oficina de Bienestar Estudiantil.",
  });
  await contenidos.enviarNuevaVersion(colaboradora, becas.id, {
    seccion: "Becas y beneficios",
    titulo: "Convocatoria de becas de permanencia 2026",
    resumen: "Información, requisitos y fechas para postular a las becas de permanencia estudiantil.",
    cuerpo: "Se abre la convocatoria de becas de permanencia para estudiantes regulares.\n\nLa inscripción se realiza en línea o en la oficina de Bienestar Estudiantil, hasta el 30 de octubre.\n\nRequisitos: certificado de alumno regular, constancia de ingresos familiares y fotocopia del DNI.",
  });
  await contenidos.decidir(admin, becas.id, { decision: "aprobar", comentario: "" });
  await contenidos.publicar(admin, becas.id);

  await publicado({
    sitioId: sitios["sitio-1"], tipo: "proyecto",
    seccion: "Comunidad académica",
    slug: "calendario-academico-2027",
    titulo: "Calendario académico 2027",
    resumen: "Fechas clave del año lectivo: inscripciones, recesos, exámenes y cierre de actas.",
    cuerpo: "El calendario académico 2027 fija el inicio de clases en marzo y el cierre de actas en diciembre.\n\nLas fechas de exámenes y recesos se publican por cuatrimestre.",
  });

  await publicado({
    sitioId: sitios["sitio-2"], tipo: "noticia",
    seccion: "Vida universitaria",
    slug: "protocolo-orientacion-acompanamiento",
    titulo: "Protocolo de orientación y acompañamiento",
    resumen: "Guía de atención para derivaciones de orientación y acompañamiento integral.",
    cuerpo: "Este protocolo describe cómo se deriva y acompaña a estudiantes que necesitan orientación.\n\nLa primera consulta se solicita en la oficina de Bienestar Estudiantil.",
  });

  await contenidos.crearContenido(colaboradora, {
    sitioId: sitios["sitio-2"], tipo: "galeria",
    seccion: "Proyecto escuelas",
    slug: "visitas",
    titulo: "Las escuelas podrán visitar a los abuelos",
    resumen: "Los alumnos de las escuelas podrán hacer una visita a los abuelos de la residencia.",
    cuerpo: "A partir del jueves, los estudiantes de las escuelas participantes visitarán la residencia de adultos mayores para compartir una tarde de actividades.",
  }, fotoAdjunta("patio-residencia.png"));

  return { contenidosCreados: true, password };
}

module.exports = { sembrar };

if (require.main === module) {
  sembrar()
    .then(({ contenidosCreados, password }) => {
      console.log(`Base "${config.bd.database}" sembrada${contenidosCreados ? " con contenidos de ejemplo" : " (los contenidos ya existían)"}.`);
      console.log(`Sitios de ejemplo: ${SITIOS.map((s) => `${s.nombre} (${s.slug})`).join(" · ")} — renombralos o creá los tuyos con "npm run sitio:crear".`);
      console.log(`Ingresá con cualquiera de estos correos y la contraseña: ${password}`);
      PERSONAS.forEach((p) => console.log(`  ${p.rol.padEnd(14)} ${p.email}`));
    })
    .catch((error) => {
      console.error("No se pudo sembrar la base:", error.message);
      process.exitCode = 1;
    })
    .finally(() => db.cerrar());
}
