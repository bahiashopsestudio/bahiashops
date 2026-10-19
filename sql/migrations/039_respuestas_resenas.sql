-- ============================================================================
-- Bahía Shops · 039 · Reseñas: la tienda responde (19/10/2026)
-- Correr entero en el SQL Editor de Supabase. Va en transacción: si algo
-- falla, no cambia nada. Se puede correr dos veces sin romper nada.
--
-- CORRERLA DESPUÉS DE LA 038 Y ANTES DE PUBLICAR EL CÓDIGO QUE LA ACOMPAÑA.
-- Solo AGREGA: una tabla, cuatro funciones y cuatro disparadores. No toca resenas
-- ni sus disparadores (suma uno nuevo, AFTER, al eliminar una reseña). El
-- código de hoy no conoce nada de esto y sigue igual. El código nuevo la
-- necesita: sin ella, la página de la tienda, Mis pedidos, el panel de
-- reseñas y /admin/denuncias dan un error visible (leen las respuestas).
--
-- Por qué: la tienda responde públicamente cada reseña, una vez, y la puede
-- editar durante 7 días. La respuesta pasa por el filtro (más estricto con el
-- contacto que el de las reseñas) y por /admin/denuncias, donde Rosario
-- puede ocultar SOLO la respuesta. Ningún mail.
--
-- Por qué una tabla aparte (public.respuestas_resena) y no columnas en
-- resenas: la respuesta tiene su propio estado (oculta o no), su propia
-- revisión y su propia regla de edición. En resenas, cada una de esas
-- columnas habría que sumarla a privado.resenas_no_se_editan (038), que
-- congela una reseña eliminada entera: mezclaría dos reglas en una función.
-- Aparte, cada tabla tiene su disparador y la de resenas no cambia.
--
-- Qué deja hecho:
--   1. public.respuestas_resena: una fila por respuesta. RLS activo y SIN
--      permisos para anon ni authenticated (como resenas): todo pasa por el
--      servidor.
--        · una por reseña: resena_id es la clave primaria.
--        · texto de 1 a 500, sin espacios sueltos al principio o al final.
--        · estado 'publicada' u 'oculta_por_moderacion' (la oculta Rosario:
--          la reseña sigue publicada), con su fecha y quién.
--        · moderacion_avisos + revision_pendiente_desde: lo dudoso del
--          filtro, para "Por revisar" (como en resenas).
--        · editada_en: la última edición, para mostrar "editada".
--        · si se borra la reseña (solo borrar_tienda_de_prueba, 031), la
--          respuesta también (cascada).
--   2. Disparador al crear (privado.respuestas_completar): la tienda sale
--      de la reseña, no de quien inserta; solo sobre una reseña publicada;
--      creado_en es siempre now() (de ahí cuentan los 7 días), sin editar y
--      publicada.
--   3. Disparador al cambiar (privado.respuestas_no_se_editan):
--        · no cambian nunca la reseña, la tienda ni creado_en;
--        · el texto se edita solo con la respuesta publicada, la reseña
--          publicada y dentro de los 7 días de creado_en; la base pone
--          editada_en = now(). Los avisos del filtro cambian solo junto con
--          el texto (se vuelven a calcular al editar). editada_en no se
--          toca a mano.
--        · ocultar (de publicada a oculta) la saca de "Por revisar".
--   4. Disparador en resenas al eliminar (privado.resenas_borrar_respuesta):
--      cuando una reseña pasa a eliminada (038), su respuesta se borra
--      entera. Así no queda texto de respuesta en una reseña eliminada, y
--      no se puede volver a responder (solo se responde una publicada).
--      Si la reseña solo se oculta, la respuesta queda (no se muestra) y
--      vuelve si la reseña se vuelve a mostrar.
--   5. Disparador al borrar (privado.respuestas_no_se_borran): una respuesta
--      no se borra a mano. Solo cuando su reseña se elimina (4) o cuando se
--      borra una tienda de prueba (031, en cascada). Así una oculta no se
--      puede reemplazar por otra.
--
-- Lo que NO hace: no cambia el puntaje (ninguna respuesta lo toca), ni los
-- permisos de resenas, ni privado.resenas_no_se_editan.
-- ============================================================================

begin;

create schema if not exists privado;
grant usage on schema privado to service_role;

-- ---------------------------------------------------------------------------
-- 1. La tabla
-- ---------------------------------------------------------------------------
create table if not exists public.respuestas_resena (
  resena_id bigint primary key references public.resenas(id) on delete cascade,
  vendedor_id integer not null references public.vendedores(id) on delete cascade,
  texto text not null,
  estado text not null default 'publicada',
  oculta_en timestamptz,
  oculta_por uuid references public.usuarios(id) on delete set null,
  moderacion_avisos jsonb not null default '[]'::jsonb,
  revision_pendiente_desde timestamptz,
  revisada_en timestamptz,
  revisada_por uuid references public.usuarios(id) on delete set null,
  creado_en timestamptz not null default now(),
  editada_en timestamptz,
  constraint respuestas_texto_valido
    check (char_length(texto) between 1 and 500 and texto = btrim(texto, E' \t\r\n')),
  constraint respuestas_estado_valido
    check (estado in ('publicada', 'oculta_por_moderacion')),
  -- Publicada: sin nada de la ocultación. Oculta: con fecha (oculta_por puede
  -- quedar null si se cierra la cuenta de quien la ocultó).
  constraint respuestas_oculta_coherente
    check ((estado = 'publicada' and oculta_en is null and oculta_por is null)
           or (estado = 'oculta_por_moderacion' and oculta_en is not null)),
  constraint respuestas_avisos_lista
    check (jsonb_typeof(moderacion_avisos) = 'array'),
  constraint respuestas_editada_coherente
    check (editada_en is null or editada_en >= creado_en)
);

-- El panel de la tienda (sus respuestas) y "Por revisar" del admin.
create index if not exists respuestas_por_tienda
  on public.respuestas_resena (vendedor_id);
create index if not exists respuestas_por_revisar
  on public.respuestas_resena (revision_pendiente_desde desc)
  where estado = 'publicada' and revision_pendiente_desde is not null;

alter table public.respuestas_resena enable row level security;
-- Sin políticas a propósito: solo service_role (que ignora RLS).

-- ---------------------------------------------------------------------------
-- 2. Al crear
-- ---------------------------------------------------------------------------
create or replace function privado.respuestas_completar()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_resena record;
begin
  -- La reseña, bloqueada: que no se oculte ni se elimine mientras tanto.
  select vendedor_id, estado, eliminada_en into v_resena
    from public.resenas where id = new.resena_id for update;
  if not found then
    raise exception 'La respuesta apunta a una reseña que no existe.' using errcode = '23503';
  end if;
  if v_resena.estado <> 'publicada' or v_resena.eliminada_en is not null then
    raise exception 'Solo se puede responder una reseña publicada.' using errcode = '22023';
  end if;
  -- Si el servidor manda otra tienda, es un error del código: se frena.
  if new.vendedor_id is not null and new.vendedor_id is distinct from v_resena.vendedor_id then
    raise exception 'La respuesta no es de la tienda de la reseña.' using errcode = '22023';
  end if;
  new.vendedor_id := v_resena.vendedor_id;
  -- De acá cuentan los 7 días: no se puede crear "vieja" ni ya editada.
  new.creado_en := now();
  new.editada_en := null;
  new.estado := 'publicada';
  new.oculta_en := null;
  new.oculta_por := null;
  return new;
end;
$$;

drop trigger if exists respuestas_completar on public.respuestas_resena;
create trigger respuestas_completar
  before insert on public.respuestas_resena
  for each row execute function privado.respuestas_completar();

-- ---------------------------------------------------------------------------
-- 3. Al cambiar
-- ---------------------------------------------------------------------------
create or replace function privado.respuestas_no_se_editan()
returns trigger
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
declare
  v_estado_resena text;
begin
  if new.resena_id   is distinct from old.resena_id
     or new.vendedor_id is distinct from old.vendedor_id
     or new.creado_en   is distinct from old.creado_en then
    raise exception 'Una respuesta no se puede mover.' using errcode = '22023';
  end if;

  if new.texto is distinct from old.texto then
    if old.estado <> 'publicada' or new.estado <> 'publicada' then
      raise exception 'Una respuesta oculta no se puede editar.' using errcode = '22023';
    end if;
    select estado into v_estado_resena from public.resenas where id = old.resena_id;
    if v_estado_resena is distinct from 'publicada' then
      raise exception 'Solo se puede editar la respuesta de una reseña publicada.' using errcode = '22023';
    end if;
    if now() > old.creado_en + interval '7 days' then
      raise exception 'Una respuesta se puede editar solo durante 7 días.' using errcode = '22023';
    end if;
    new.editada_en := now();
  else
    -- Sin cambio de texto: ni "editada" ni avisos nuevos a mano.
    new.editada_en := old.editada_en;
    if new.moderacion_avisos is distinct from old.moderacion_avisos then
      raise exception 'Los avisos del filtro cambian solo al editar el texto.' using errcode = '22023';
    end if;
  end if;

  -- Ocultar (de publicada a oculta) también la saca de "Por revisar".
  if old.estado = 'publicada' and new.estado = 'oculta_por_moderacion' then
    new.revision_pendiente_desde := null;
  end if;

  return new;
end;
$$;

drop trigger if exists respuestas_no_se_editan on public.respuestas_resena;
create trigger respuestas_no_se_editan
  before update on public.respuestas_resena
  for each row execute function privado.respuestas_no_se_editan();

-- ---------------------------------------------------------------------------
-- 4. Reseña eliminada: su respuesta se borra
-- ---------------------------------------------------------------------------
create or replace function privado.resenas_borrar_respuesta()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if new.eliminada_en is not null and old.eliminada_en is null then
    delete from public.respuestas_resena where resena_id = new.id;
  end if;
  return null;
end;
$$;

drop trigger if exists resenas_borrar_respuesta on public.resenas;
create trigger resenas_borrar_respuesta
  after update of eliminada_en on public.resenas
  for each row execute function privado.resenas_borrar_respuesta();

-- Si alguna reseña ya estaba eliminada, su respuesta se borra (en la primera
-- corrida no hay ninguna: la tabla es nueva). Va antes del disparador 5, que
-- igual lo dejaría pasar.
delete from public.respuestas_resena r
 using public.resenas s
 where s.id = r.resena_id and s.eliminada_en is not null;

-- ---------------------------------------------------------------------------
-- 5. Una respuesta no se borra a mano
-- ---------------------------------------------------------------------------
-- Solo se borra cuando su reseña se elimina (4) o cuando se borra una tienda
-- de prueba (borrar_tienda_de_prueba, 031: la cascada llega por la reseña o
-- por la tienda, en cualquier orden). Así una respuesta oculta no se puede
-- reemplazar por otra borrándola.
create or replace function privado.respuestas_no_se_borran()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if not exists (select 1 from public.resenas where id = old.resena_id and eliminada_en is null)
     or not exists (select 1 from public.vendedores where id = old.vendedor_id) then
    return old;
  end if;
  raise exception 'Una respuesta no se puede borrar.' using errcode = '22023';
end;
$$;

drop trigger if exists respuestas_no_se_borran on public.respuestas_resena;
create trigger respuestas_no_se_borran
  before delete on public.respuestas_resena
  for each row execute function privado.respuestas_no_se_borran();

-- ---------------------------------------------------------------------------
-- Permisos
-- ---------------------------------------------------------------------------
revoke all on table public.respuestas_resena from public, anon, authenticated;
grant select, insert, update, delete on table public.respuestas_resena to service_role;

revoke all on function privado.respuestas_completar()     from public, anon, authenticated;
revoke all on function privado.respuestas_no_se_editan()  from public, anon, authenticated;
revoke all on function privado.resenas_borrar_respuesta() from public, anon, authenticated;
revoke all on function privado.respuestas_no_se_borran()  from public, anon, authenticated;

notify pgrst, 'reload schema';

commit;

-- ============================================================================
-- Verificación (una sola fila; copiá la celda)
--   · tabla y rls: true.
--   · tipos: resena_id bigint (como resenas.id), vendedor_id integer (como
--     vendedores.id).
--   · permisos: anon y authenticated vacíos; service_role con DELETE,
--     INSERT, SELECT, UPDATE.
--   · disparadores: los cuatro true.
--   · respuestas_en_eliminadas: 0.
-- ============================================================================
select jsonb_pretty(jsonb_build_object(
  'tabla', to_regclass('public.respuestas_resena') is not null,
  'rls', (select relrowsecurity from pg_class where oid = 'public.respuestas_resena'::regclass),
  'tipos', jsonb_build_object(
      'respuestas.resena_id',   (select data_type from information_schema.columns where table_schema = 'public' and table_name = 'respuestas_resena' and column_name = 'resena_id'),
      'resenas.id',             (select data_type from information_schema.columns where table_schema = 'public' and table_name = 'resenas' and column_name = 'id'),
      'respuestas.vendedor_id', (select data_type from information_schema.columns where table_schema = 'public' and table_name = 'respuestas_resena' and column_name = 'vendedor_id'),
      'vendedores.id',          (select data_type from information_schema.columns where table_schema = 'public' and table_name = 'vendedores' and column_name = 'id')),
  'permisos', (select jsonb_object_agg(r.rol, coalesce((
        select string_agg(a.privilege_type, ', ' order by a.privilege_type)
          from pg_class c, aclexplode(c.relacl) a
         where c.oid = 'public.respuestas_resena'::regclass and a.grantee = r.rol::regrole), ''))
      from unnest(array['anon', 'authenticated', 'service_role']) as r(rol)),
  'disparadores', (select jsonb_object_agg(t.nombre, exists (select 1 from pg_trigger where tgname = t.nombre and not tgisinternal))
                     from unnest(array['respuestas_completar', 'respuestas_no_se_editan', 'resenas_borrar_respuesta',
                                       'respuestas_no_se_borran']) as t(nombre)),
  'respuestas_en_eliminadas', (select count(*) from public.respuestas_resena r
                                 join public.resenas s on s.id = r.resena_id
                                where s.eliminada_en is not null)
)) as verificacion;

-- ============================================================================
-- Para deshacer (correr en transacción). Se pierden las respuestas. Con el
-- código nuevo publicado, la tienda, Mis pedidos, el panel de reseñas y
-- /admin/denuncias dejan de andar (con error visible): despublicar el código
-- antes.
-- ============================================================================
-- begin;
-- drop trigger if exists resenas_borrar_respuesta on public.resenas;
-- drop table if exists public.respuestas_resena;
-- drop function if exists privado.resenas_borrar_respuesta();
-- drop function if exists privado.respuestas_no_se_borran();
-- drop function if exists privado.respuestas_no_se_editan();
-- drop function if exists privado.respuestas_completar();
-- notify pgrst, 'reload schema';
-- commit;
-- ============================================================================
