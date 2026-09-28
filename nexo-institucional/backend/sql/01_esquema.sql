-- nexo institucional: esquema de la base de datos
-- las sentencias se separan con la marca "-- @@" (la lee scripts/iniciar-bd.js)
-- todas las fechas se guardan en utc

create table if not exists usuarios (
  id int unsigned not null auto_increment,
  nombre varchar(120) not null,
  email varchar(160) not null,
  password_hash varchar(100) not null,
  rol enum('observador', 'colaborador', 'director', 'administrador') not null default 'observador',
  activo tinyint(1) not null default 1,
  ultimo_acceso datetime null,
  creado_en datetime not null,
  primary key (id),
  unique key uq_usuarios_email (email)
) engine = innodb default charset = utf8mb4 collate = utf8mb4_unicode_ci;

-- @@

create table if not exists sesiones (
  id int unsigned not null auto_increment,
  usuario_id int unsigned not null,
  token_hash char(64) not null,
  expira_en datetime not null,
  creado_en datetime not null,
  primary key (id),
  unique key uq_sesiones_token (token_hash),
  key ix_sesiones_usuario (usuario_id),
  constraint fk_sesiones_usuario foreign key (usuario_id) references usuarios (id) on delete cascade
) engine = innodb default charset = utf8mb4 collate = utf8mb4_unicode_ci;

-- @@

-- cada una de las páginas institucionales (hoy: 2, puede sumarse una tercera sin tocar el resto)
create table if not exists sitios (
  id int unsigned not null auto_increment,
  nombre varchar(120) not null,
  slug varchar(60) not null,
  creado_en datetime not null,
  primary key (id),
  unique key uq_sitios_slug (slug)
) engine = innodb default charset = utf8mb4 collate = utf8mb4_unicode_ci;

-- @@

-- un contenido es el "tema"; el texto vive en sus versiones
-- version_publicada = numero de la version visible en la web (null = nada publicado)
-- tipo define la plantilla: noticia/proyecto llevan cuerpo de texto, galeria vive de sus adjuntos
-- el identificador web se repite entre sitios distintos, pero no dos veces dentro del mismo sitio
create table if not exists contenidos (
  id int unsigned not null auto_increment,
  sitio_id int unsigned not null,
  tipo enum('noticia', 'proyecto', 'galeria') not null default 'noticia',
  seccion varchar(60) not null,
  slug varchar(80) not null,
  autor_id int unsigned not null,
  estado enum('en_revision', 'devuelto', 'aprobado', 'publicado', 'archivado') not null default 'en_revision',
  version_publicada int unsigned null,
  publicado_en datetime null,
  creado_en datetime not null,
  actualizado_en datetime not null,
  primary key (id),
  unique key uq_contenidos_sitio_slug (sitio_id, slug),
  key ix_contenidos_estado (estado),
  key ix_contenidos_seccion (seccion),
  key ix_contenidos_tipo (tipo),
  constraint fk_contenidos_sitio foreign key (sitio_id) references sitios (id),
  constraint fk_contenidos_autor foreign key (autor_id) references usuarios (id)
) engine = innodb default charset = utf8mb4 collate = utf8mb4_unicode_ci;

-- @@

create table if not exists versiones (
  id int unsigned not null auto_increment,
  contenido_id int unsigned not null,
  numero int unsigned not null,
  autor_id int unsigned not null,
  titulo varchar(120) not null,
  resumen varchar(280) not null,
  cuerpo mediumtext not null,
  estado enum('en_revision', 'devuelta', 'aprobada', 'publicada', 'reemplazada', 'conservada', 'archivada') not null default 'en_revision',
  decision_tipo enum('aprobacion', 'devolucion') null,
  decision_usuario_id int unsigned null,
  decision_comentario varchar(600) null,
  decision_en datetime null,
  creada_en datetime not null,
  primary key (id),
  unique key uq_versiones_numero (contenido_id, numero),
  constraint fk_versiones_contenido foreign key (contenido_id) references contenidos (id),
  constraint fk_versiones_autor foreign key (autor_id) references usuarios (id),
  constraint fk_versiones_decision foreign key (decision_usuario_id) references usuarios (id)
) engine = innodb default charset = utf8mb4 collate = utf8mb4_unicode_ci;

-- @@

-- el archivo pertenece al contenido; se enlaza a una o varias versiones
-- (una version nueva puede conservar los adjuntos anteriores sin duplicar el archivo)
create table if not exists adjuntos (
  id int unsigned not null auto_increment,
  contenido_id int unsigned not null,
  nombre_original varchar(255) not null,
  nombre_almacenado varchar(80) not null,
  tipo_mime varchar(100) not null,
  tamano int unsigned not null,
  subido_por int unsigned not null,
  creado_en datetime not null,
  primary key (id),
  unique key uq_adjuntos_almacenado (nombre_almacenado),
  key ix_adjuntos_contenido (contenido_id),
  constraint fk_adjuntos_contenido foreign key (contenido_id) references contenidos (id),
  constraint fk_adjuntos_usuario foreign key (subido_por) references usuarios (id)
) engine = innodb default charset = utf8mb4 collate = utf8mb4_unicode_ci;

-- @@

create table if not exists version_adjuntos (
  version_id int unsigned not null,
  adjunto_id int unsigned not null,
  primary key (version_id, adjunto_id),
  constraint fk_va_version foreign key (version_id) references versiones (id),
  constraint fk_va_adjunto foreign key (adjunto_id) references adjuntos (id)
) engine = innodb default charset = utf8mb4 collate = utf8mb4_unicode_ci;

-- @@

-- registro de auditoria: quien hizo que y cuando (inmutable, ver triggers)
create table if not exists eventos (
  id int unsigned not null auto_increment,
  contenido_id int unsigned not null,
  version_numero int unsigned not null,
  tipo enum('envio', 'aprobacion', 'devolucion', 'publicacion', 'archivo', 'restauracion') not null,
  usuario_id int unsigned not null,
  comentario varchar(600) not null default '',
  creado_en datetime not null,
  primary key (id),
  key ix_eventos_contenido (contenido_id, id),
  constraint fk_eventos_contenido foreign key (contenido_id) references contenidos (id),
  constraint fk_eventos_usuario foreign key (usuario_id) references usuarios (id)
) engine = innodb default charset = utf8mb4 collate = utf8mb4_unicode_ci;

-- @@

-- Tabla opcional para gestionar el estado de borrador local del adjunto antes de enviarlo
create table if not exists documentos_borradores (
    id int unsigned not null auto_increment,
    contenido_id int unsigned not null,
    titulo varchar(120) not null,
    archivo_path varchar(255) not null,
    estado enum('Borrador', 'Enviado') not null default 'Borrador',
    usuario_id int unsigned not null,
    fecha_creacion datetime not null,
    fecha_envio datetime null,
    primary key (id),
    key ix_documentos_borradores_contenido (contenido_id),
    constraint fk_doc_borrador_contenido foreign key (contenido_id) references contenidos (id) on delete cascade,
    constraint fk_doc_borrador_usuario foreign key (usuario_id) references usuarios (id)
) engine = innodb default charset = utf8mb4 collate = utf8mb4_unicode_ci;