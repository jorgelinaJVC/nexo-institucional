-- vista publica: solo lo que tiene una version publicada de forma explicita
-- la api publica lee unicamente esta vista, nunca las tablas internas
-- incluye el sitio y el tipo porque cada pagina institucional filtra por los suyos
-- las sentencias se separan con la marca "-- @@"

create or replace view vista_publicaciones as
select
  c.id as contenido_id,
  c.slug,
  c.tipo,
  c.seccion,
  s.slug as sitio_slug,
  s.nombre as sitio_nombre,
  v.id as version_id,
  v.titulo,
  v.resumen,
  v.cuerpo,
  c.publicado_en as fecha
from contenidos c
join sitios s on s.id = c.sitio_id
join versiones v
  on v.contenido_id = c.id
 and v.numero = c.version_publicada
where c.version_publicada is not null;
