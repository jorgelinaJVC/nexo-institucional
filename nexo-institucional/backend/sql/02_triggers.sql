-- triggers: la base de datos misma impide borrar o reescribir el historial,
-- aunque alguien lo intente saltandose la aplicacion
-- las sentencias se separan con la marca "-- @@"

drop trigger if exists tg_eventos_no_actualizar;

-- @@

create trigger tg_eventos_no_actualizar before update on eventos
for each row
begin
  signal sqlstate '45000' set message_text = 'el registro de eventos es inmutable';
end

-- @@

drop trigger if exists tg_eventos_no_eliminar;

-- @@

create trigger tg_eventos_no_eliminar before delete on eventos
for each row
begin
  signal sqlstate '45000' set message_text = 'el registro de eventos no se puede eliminar';
end

-- @@

drop trigger if exists tg_versiones_texto_inmutable;

-- @@

-- de una version solo pueden cambiar su estado y los datos de la decision
create trigger tg_versiones_texto_inmutable before update on versiones
for each row
begin
  if new.contenido_id <> old.contenido_id
     or new.numero <> old.numero
     or new.autor_id <> old.autor_id
     or new.titulo <> old.titulo
     or new.resumen <> old.resumen
     or new.cuerpo <> old.cuerpo then
    signal sqlstate '45000' set message_text = 'el contenido de una version no se puede modificar';
  end if;
end

-- @@

drop trigger if exists tg_versiones_no_eliminar;

-- @@

create trigger tg_versiones_no_eliminar before delete on versiones
for each row
begin
  signal sqlstate '45000' set message_text = 'las versiones no se pueden eliminar';
end

-- @@

drop trigger if exists tg_contenidos_no_eliminar;

-- @@

create trigger tg_contenidos_no_eliminar before delete on contenidos
for each row
begin
  signal sqlstate '45000' set message_text = 'los contenidos no se eliminan: se archivan';
end

-- @@

drop trigger if exists tg_contenidos_slug_inmutable;

-- @@

-- lo estructural (sitio, tipo, identificador web) no se puede cambiar una vez creado el contenido;
-- cada condición tiene su propio mensaje para que el error diga exactamente qué se intentó tocar
create trigger tg_contenidos_slug_inmutable before update on contenidos
for each row
begin
  if new.slug <> old.slug then
    signal sqlstate '45000' set message_text = 'el identificador web no se puede cambiar';
  elseif new.sitio_id <> old.sitio_id then
    signal sqlstate '45000' set message_text = 'el sitio de un contenido no se puede cambiar';
  elseif new.tipo <> old.tipo then
    signal sqlstate '45000' set message_text = 'el tipo de un contenido no se puede cambiar';
  end if;
end

-- @@

drop trigger if exists tg_adjuntos_no_eliminar;

-- @@

create trigger tg_adjuntos_no_eliminar before delete on adjuntos
for each row
begin
  signal sqlstate '45000' set message_text = 'los adjuntos no se pueden eliminar';
end
