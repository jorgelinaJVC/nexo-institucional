# Nexo institucional

Portal de gestión editorial para varias páginas institucionales a la vez: el equipo carga noticias, proyectos
institucionales y galerías de fotos para cualquiera de los sitios, una directora las revisa desde una sola bandeja,
la publicación es un paso explícito y todo cambio queda registrado en un historial de versiones que no se puede reescribir.

## Estructura

```
frontend/   HTML, CSS y JS separados (index = login, panel, publico)
backend/    API (Express) + base de datos (MySQL/MariaDB)
  sql/        esquema, triggers y vista pública (SQL en minúsculas)
  src/        config, auth, permisos, servicios y rutas
  scripts/    iniciar-bd, sembrar, crear-usuario, crear-sitio
pruebas/    pruebas automatizadas (API, base de datos, adjuntos y frontend)
```

## Puesta en marcha

Requisitos: Node.js 20.12 o superior y MySQL 8 (o MariaDB 10.6+).

1. Crear el usuario de base de datos (una sola vez):

   ```sql
   create user 'nexo'@'localhost' identified by 'cambia-esta-clave';
   grant all privileges on `nexo\_%`.* to 'nexo'@'localhost';
   ```

2. Configurar y crear las tablas:

   ```bash
   npm install
   cp .env.example .env        # completá DB_USER y DB_PASSWORD
   npm run bd:iniciar          # crea la base, tablas, triggers y vista
   npm run bd:sembrar          # (opcional) 2 sitios, 4 personas y contenidos de ejemplo
   npm start                   # http://localhost:3000
   ```

3. Crear tus páginas institucionales reales (podés tener 2, 3 o las que necesites):

   ```bash
   npm run sitio:crear -- "Nombre real del sitio" identificador-del-sitio
   ```

   El identificador (`slug`) es el que usa cada página pública para pedir solo lo suyo:
   `GET /api/publico/<identificador>/publicaciones`.

4. Crear personas reales:

   ```bash
   NEXO_PASSWORD='una-clave-larga' npm run usuario:crear -- "Nombre Apellido" correo@institucion.edu.ar administrador
   ```

Con `bd:sembrar` podés ingresar con `jorgelina.campos@ejemplo.edu.ar`, `marcos.ledesma@…`, `analia.rojas@…` o
`tomas.herrera@…` (`ejemplo.edu.ar`) y la contraseña `Nexo-demo-2026`. Los dos sitios de ejemplo se llaman
"Sitio institucional 1" y "Sitio institucional 2" (slugs `sitio-1` y `sitio-2`): son placeholders, renombralos o
creá los tuyos con `sitio:crear`.

## Roles

Los roles son los mismos para todos los sitios: no hay un rol "por sitio", el mismo director revisa todo.

| Rol | Puede |
|---|---|
| Observador | Consultar |
| Colaborador | Cargar contenido (en cualquier sitio), enviarlo a revisión y mandar nuevas versiones de lo suyo |
| Director de área | Lo anterior + aprobar/devolver, publicar y archivar (no revisa lo que cargó él mismo) |
| Administrador | Todo lo anterior + gestionar roles y agregar integrantes (siempre queda al menos un administrador) |

## Sitios y tipos de contenido

Cada contenido pertenece a **un sitio** (una de las páginas institucionales) y tiene **un tipo**:

- **Noticia** o **Proyecto institucional**: llevan título, resumen y cuerpo de texto; los adjuntos son opcionales.
- **Galería de fotos**: el cuerpo es opcional (queda como bajada corta); en cambio exige subir **al menos una foto**.
  En el panel y en la vista pública se muestra como una grilla de miniaturas en vez de un bloque de texto.

El identificador web (slug) es único **dentro de cada sitio**, no globalmente: dos sitios distintos pueden tener,
por ejemplo, un contenido con el mismo identificador `becas-2026` sin chocar entre sí. El sitio y el tipo se eligen
al crear el contenido y no se pueden cambiar después (ni siquiera con una nueva versión): son estructurales, como el
identificador web.

El panel tiene una sola bandeja de Revisión para todos los sitios; se puede filtrar por sitio y por tipo cuando hace
falta enfocarse en uno solo.

## Circuito

`en revisión` → `aprobado` o `devuelto` (con comentario obligatorio) → `publicado` (paso explícito) → `archivado` (opcional).
Aprobar no publica. Una versión nueva de algo publicado no retira la anterior hasta que la nueva se apruebe y se publique.
Archivar oculta del público pero conserva todo; restaurar no republica.

## Modo demo vs. modo servidor

Abriendo `frontend/index.html` directamente el sitio funciona en **modo demo** (datos en el navegador, con un selector
para ver el panel como cada rol, y dos sitios de ejemplo). Servido por el backend pasa solo a **modo servidor**:
`/js/config.js` lo entrega el servidor y `js/api-servidor.js` reemplaza la demo por llamadas a la API.

## La vista pública y tus páginas ya existentes

`frontend/publico.html` es una página de referencia (sirve para ver cómo se consume la API y para pruebas), no un
reemplazo obligatorio de tus 2 páginas ya creadas. Cada una de tus páginas puede seguir siendo el código que ya
tenés y simplemente pedirle a esta API lo que necesite mostrar:

```
GET /api/publico/<sitio>/publicaciones              todo lo publicado de ese sitio
GET /api/publico/<sitio>/publicaciones?tipo=galeria  filtrado por tipo (noticia | proyecto | galeria)
GET /api/publico/<sitio>/publicaciones/<slug>        el detalle de una publicación
GET /api/publico/<sitio>/adjuntos/<id>               descarga de una foto o documento publicado
GET /api/publico/sitios                              lista de sitios (nombre y slug), sin necesidad de sesión
```

Ninguna de estas rutas requiere sesión ni expone autores, historial o contenido sin publicar: solo lo que la
directora aprobó y alguien publicó de forma explícita.

## Pruebas

```bash
DB_NAME_PRUEBAS=nexo_pruebas npm test
```

Recrean la base de pruebas en cada archivo (se niegan a correr si el nombre no contiene "prueba" o "test").
Cubren permisos por rol, circuito completo, concurrencia, triggers, inyección SQL, CSRF, límite de intentos de login,
validación de archivos, sitios y tipos de contenido, y el frontend real conectado al backend real. 91 pruebas en total.

## Seguridad incluida

Contraseñas con bcrypt · cambio de contraseña propia desde el panel · sesiones en base con token guardado como hash y
cookie HttpOnly/SameSite · límite de intentos de login · verificación de Origin (CSRF) · consultas siempre
parametrizadas · cabeceras de seguridad (helmet + CSP) · adjuntos validados por extensión, tipo y firma real,
guardados con nombre generado por el servidor · la API pública solo lee `vista_publicaciones`, siempre acotada a un
sitio · sitio, tipo e identificador web quedan fijos una vez creado el contenido (lo protege un trigger de base de datos).

## Pendiente antes de producción

- HTTPS y `NODE_ENV=production` (cookies `Secure`, HSTS).
- Backups de la base y de la carpeta `almacen/`.
- El límite de intentos de login vive en memoria: con varias instancias hay que moverlo a la base o a un caché compartido.
- Alta de personas desde la interfaz (hoy es por terminal); el cambio de la propia contraseña ya está en el panel.
- Gestión de sitios desde la interfaz (hoy `sitio:crear` es por terminal; alcanza para 2-3 sitios, pero si van a ser
  muchos conviene una pantalla de administración).
- Login con proveedor institucional (SSO) si la institución lo usa.
- Paginación del listado de contenidos si el volumen crece.
- Probado en MariaDB 10.11; probar también en MySQL 8 (si no tenés permiso de triggers, puede hacer falta
  `log_bin_trust_function_creators`).
