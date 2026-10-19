-- ============================================================================
-- Bahía Shops · 038 · Reseñas: la tienda pide revisión, y eliminar las ocultas
-- (19/10/2026)
-- Correr entero en el SQL Editor de Supabase. Va en transacción: si algo
-- falla, no cambia nada. Se puede correr dos veces sin romper nada.
--
-- CORRERLA DESPUÉS DE LA 037 Y ANTES DE PUBLICAR EL CÓDIGO QUE LA ACOMPAÑA.
-- Solo AGREGA: cuatro columnas, tres CHECK, dos índices (en lugar de dos de la
-- 037) y una función reemplazada (más la limpieza de la sección 5, que no
-- debería tocar ninguna fila). El código de hoy no las conoce y sigue
-- igual (nada de lo que escribe hoy queda frenado). El código nuevo las
-- necesita: sin ellas, "Pedir revisión", "Eliminar" y la búsqueda por pedido
-- dan un error visible.
--
-- Por qué: la moderación de reseñas tiene dos entradas a "Por revisar" (lo
-- que marcó el filtro, y lo que una tienda pidió revisar) y dos salidas
-- (sigue publicada, u oculta). Una oculta se puede eliminar a los 45 días:
-- se borra el texto para siempre y la fila queda, porque el UNIQUE de
-- pedido_id es lo que impide volver a reseñar ese pedido. Ningún mail.
--
-- Qué deja hecho:
--   1. resenas.revision_pedida_en / revision_motivo / revision_comentario:
--      la tienda pidió revisarla (una sola vez por reseña), con uno de los
--      cuatro motivos de la política y un comentario opcional (hasta 300,
--      sin espacios sueltos). Motivo y fecha van juntos; el comentario, solo
--      si se pidió.
--   2. resenas.eliminada_en: cuándo se eliminó. Solo en una oculta.
--   3. privado.resenas_no_se_editan (la de la 037, reemplazada). Sigue
--      frenando todo lo que frenaba (estrellas, texto, pedido, tienda,
--      fecha, avisos; quien la escribió solo puede pasar a null), y suma:
--        · pedir revisión: solo sobre una publicada, una sola vez (fecha,
--          motivo y comentario no cambian más). La base pone
--          revision_pendiente_desde = now() si estaba en null: así entra a
--          "Por revisar" con la misma columna que el filtro.
--        · ocultar (de publicada a oculta): la base pone
--          revision_pendiente_desde en null, así "Por revisar" y su
--          contador nunca cuentan una oculta (la ruta del admin también lo
--          hace).
--        · eliminar: eliminada_en pasa de null a una fecha, en una oculta
--          hace al menos 45 días de oculta_en. La base deja el texto en
--          null, los avisos en '[]' (guardan fragmentos del texto) y el
--          comentario de la tienda en null (puede citar el texto o tener
--          datos personales); el motivo y la fecha del pedido quedan. El
--          estado no cambia (sigue oculta): el puntaje no se mueve.
--        · una eliminada no se toca más (ni volver a mostrar): solo pueden
--          pasar a null quien la escribió, quién la ocultó y quién la
--          revisó (para que cerrar una cuenta siga andando, 037 sección 6).
--   4. Índices: "Por revisar" (publicadas con revisión pendiente) y "Ocultas"
--      sin eliminar. Reemplazan a resenas_por_revisar y resenas_ocultas de la
--      037, que quedan de más.
--   5. Las ocultas que hubieran quedado con revision_pendiente_desde se
--      limpian (no debería haber: la ruta del admin ya lo hacía).
--
-- Lo que NO hace: no toca permisos (resenas sigue sin nada para anon ni
-- authenticated: todo pasa por el servidor), ni el puntaje, ni el disparador
-- de cuenta cerrada.
-- ============================================================================

begin;

-- ---------------------------------------------------------------------------
-- 1 y 2. Columnas nuevas
-- ---------------------------------------------------------------------------
alter table public.resenas
  add column if not exists revision_pedida_en timestamptz,
  add column if not exists revision_motivo text,
  add column if not exists revision_comentario text,
  add column if not exists eliminada_en timestamptz;

alter table public.resenas drop constraint if exists resenas_revision_motivo_valido;
alter table public.resenas add constraint resenas_revision_motivo_valido
  check (revision_motivo is null
         or revision_motivo in ('insultos', 'datos_personales', 'no_es_esta_compra', 'sin_compra_real'));

-- Fecha y motivo van juntos; el comentario, de 1 a 300 y sin espacios
-- sueltos, solo si se pidió.
alter table public.resenas drop constraint if exists resenas_revision_coherente;
alter table public.resenas add constraint resenas_revision_coherente
  check ((revision_motivo is null) = (revision_pedida_en is null)
         and (revision_comentario is null
              or (revision_pedida_en is not null
                  and char_length(revision_comentario) between 1 and 300
                  and revision_comentario = btrim(revision_comentario, E' \t\r\n'))));

-- Solo una oculta puede estar eliminada.
alter table public.resenas drop constraint if exists resenas_eliminada_coherente;
alter table public.resenas add constraint resenas_eliminada_coherente
  check (eliminada_en is null or estado = 'oculta_por_moderacion');

-- ---------------------------------------------------------------------------
-- 3. Qué se puede cambiar de una reseña
-- ---------------------------------------------------------------------------
create or replace function privado.resenas_no_se_editan()
returns trigger
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
declare
  -- Lo único que puede cambiar en una eliminada (y solo a null).
  v_solo_a_null constant text[] := array['comprador_id', 'oculta_por', 'revisada_por'];
  v_elimina boolean := old.eliminada_en is null and new.eliminada_en is not null;
begin
  -- Una eliminada no se toca más.
  if old.eliminada_en is not null then
    if (to_jsonb(new) - v_solo_a_null) is distinct from (to_jsonb(old) - v_solo_a_null)
       or (new.comprador_id is distinct from old.comprador_id and new.comprador_id is not null)
       or (new.oculta_por   is distinct from old.oculta_por   and new.oculta_por   is not null)
       or (new.revisada_por is distinct from old.revisada_por and new.revisada_por is not null) then
      raise exception 'Una reseña eliminada no se puede modificar.' using errcode = '22023';
    end if;
    return new;
  end if;

  -- Eliminar: una oculta hace al menos 45 días. Se borra el texto y los
  -- avisos (que guardan fragmentos del texto); el estado no cambia.
  if v_elimina then
    if old.estado <> 'oculta_por_moderacion' or new.estado <> 'oculta_por_moderacion'
       or new.oculta_en is distinct from old.oculta_en then
      raise exception 'Solo se puede eliminar una reseña oculta.' using errcode = '22023';
    end if;
    if old.oculta_en > now() - interval '45 days' then
      raise exception 'Una reseña oculta se puede eliminar recién a los 45 días.' using errcode = '22023';
    end if;
    new.texto := null;
    new.moderacion_avisos := '[]'::jsonb;
    -- El comentario de la tienda puede citar el texto o tener datos
    -- personales: también se borra. Motivo y fecha del pedido quedan.
    new.revision_comentario := null;
  end if;

  -- Ocultar (de publicada a oculta) también la saca de "Por revisar".
  if old.estado = 'publicada' and new.estado = 'oculta_por_moderacion' then
    new.revision_pendiente_desde := null;
  end if;

  -- Lo que no cambia nunca (texto y avisos, salvo al eliminar).
  if new.pedido_id   is distinct from old.pedido_id
     or new.vendedor_id is distinct from old.vendedor_id
     or new.estrellas   is distinct from old.estrellas
     or new.creado_en   is distinct from old.creado_en
     or (not v_elimina and new.texto is distinct from old.texto)
     or (not v_elimina and new.moderacion_avisos is distinct from old.moderacion_avisos)
     or (new.comprador_id is distinct from old.comprador_id and new.comprador_id is not null) then
    raise exception 'Una reseña no se puede editar.' using errcode = '22023';
  end if;

  -- Pedir revisión: una sola vez, y solo sobre una publicada. Fecha, motivo
  -- y comentario no cambian más (el comentario, salvo al eliminar).
  if old.revision_pedida_en is not null then
    if new.revision_pedida_en  is distinct from old.revision_pedida_en
       or new.revision_motivo     is distinct from old.revision_motivo
       or (not v_elimina and new.revision_comentario is distinct from old.revision_comentario) then
      raise exception 'La revisión de esta reseña ya se pidió.' using errcode = '22023';
    end if;
  elsif new.revision_pedida_en is not null then
    if old.estado <> 'publicada' or new.estado <> 'publicada' then
      raise exception 'Solo se puede pedir revisar una reseña publicada.' using errcode = '22023';
    end if;
    -- Entra a "Por revisar" con la misma columna que el filtro.
    new.revision_pendiente_desde := coalesce(old.revision_pendiente_desde, now());
  elsif new.revision_motivo is not null or new.revision_comentario is not null then
    raise exception 'Falta la fecha del pedido de revisión.' using errcode = '22023';
  end if;

  return new;
end;
$$;

revoke all on function privado.resenas_no_se_editan() from public, anon, authenticated;

-- El disparador es el de la 037 (before update); se recrea por si acaso.
drop trigger if exists resenas_no_se_editan on public.resenas;
create trigger resenas_no_se_editan
  before update on public.resenas
  for each row execute function privado.resenas_no_se_editan();

-- ---------------------------------------------------------------------------
-- 4. Índices de /admin/denuncias (reemplazan a los de la 037)
-- ---------------------------------------------------------------------------
drop index if exists public.resenas_por_revisar;
drop index if exists public.resenas_ocultas;

create index if not exists resenas_por_revisar_publicadas
  on public.resenas (revision_pendiente_desde desc)
  where estado = 'publicada' and revision_pendiente_desde is not null;

create index if not exists resenas_ocultas_sin_eliminar
  on public.resenas (oculta_en desc)
  where estado = 'oculta_por_moderacion' and eliminada_en is null;

-- ---------------------------------------------------------------------------
-- 5. Una oculta no queda "por revisar" (por si alguna quedó con la marca)
-- ---------------------------------------------------------------------------
update public.resenas
   set revision_pendiente_desde = null
 where estado = 'oculta_por_moderacion'
   and revision_pendiente_desde is not null;

notify pgrst, 'reload schema';

commit;

-- ============================================================================
-- Verificación (una sola fila; copiá la celda)
--   · columnas: las cuatro (timestamptz, text, text, timestamptz).
--   · checks: los tres true.
--   · funcion_nueva: true. disparador: true.
--   · indices: los dos nuevos true, los dos viejos false.
--   · filas_incoherentes: 0.
--   · ocultas_por_revisar: 0 (la sección 5 limpia las que hubieran quedado).
--   · permisos_resenas: anon y authenticated siguen vacíos.
-- ============================================================================
select jsonb_pretty(jsonb_build_object(
  'columnas', (select jsonb_object_agg(column_name, data_type)
                 from information_schema.columns
                where table_schema = 'public' and table_name = 'resenas'
                  and column_name in ('revision_pedida_en', 'revision_motivo', 'revision_comentario', 'eliminada_en')),
  'checks', (select jsonb_object_agg(c.nombre, exists (select 1 from pg_constraint
                                                       where conrelid = 'public.resenas'::regclass and conname = c.nombre))
               from unnest(array['resenas_revision_motivo_valido', 'resenas_revision_coherente', 'resenas_eliminada_coherente']) as c(nombre)),
  'funcion_nueva', (select prosrc like '%eliminada_en%' and prosrc like '%revision_pedida_en%'
                      from pg_proc p join pg_namespace n on n.oid = p.pronamespace
                     where n.nspname = 'privado' and p.proname = 'resenas_no_se_editan'),
  'disparador', exists (select 1 from pg_trigger where tgname = 'resenas_no_se_editan' and not tgisinternal),
  'indices', (select jsonb_object_agg(i.nombre, to_regclass('public.' || i.nombre) is not null)
                from unnest(array['resenas_por_revisar_publicadas', 'resenas_ocultas_sin_eliminar',
                                  'resenas_por_revisar', 'resenas_ocultas']) as i(nombre)),
  'filas_incoherentes', (select count(*) from public.resenas
                          where (eliminada_en is not null and (estado <> 'oculta_por_moderacion' or texto is not null or revision_comentario is not null))
                             or ((revision_motivo is null) <> (revision_pedida_en is null))),
  'ocultas_por_revisar', (select count(*) from public.resenas
                           where estado = 'oculta_por_moderacion' and revision_pendiente_desde is not null),
  'permisos_resenas', (select jsonb_object_agg(r.rol, coalesce((
        select string_agg(a.privilege_type, ', ' order by a.privilege_type)
          from pg_class c, aclexplode(c.relacl) a
         where c.oid = 'public.resenas'::regclass and a.grantee = r.rol::regrole), ''))
      from unnest(array['anon', 'authenticated']) as r(rol))
)) as verificacion;

-- ============================================================================
-- Para deshacer (correr en transacción). Se pierden los pedidos de revisión.
-- Las reseñas eliminadas siguen sin texto (eso no vuelve). Con el código
-- nuevo publicado, "Pedir revisión", "Eliminar" y la búsqueda por pedido
-- dejan de andar (con error visible): despublicar el código antes. La función
-- vuelve a la de la 037.
-- ============================================================================
-- begin;
-- drop index if exists public.resenas_por_revisar_publicadas;
-- drop index if exists public.resenas_ocultas_sin_eliminar;
-- create index if not exists resenas_por_revisar on public.resenas (revision_pendiente_desde) where revision_pendiente_desde is not null;
-- create index if not exists resenas_ocultas on public.resenas (oculta_en desc) where estado = 'oculta_por_moderacion';
-- create or replace function privado.resenas_no_se_editan()
-- returns trigger language plpgsql security invoker set search_path = public, pg_temp
-- as $f$
-- begin
--   if new.pedido_id   is distinct from old.pedido_id
--      or new.vendedor_id is distinct from old.vendedor_id
--      or new.estrellas   is distinct from old.estrellas
--      or new.texto       is distinct from old.texto
--      or new.creado_en   is distinct from old.creado_en
--      or new.moderacion_avisos is distinct from old.moderacion_avisos
--      or (new.comprador_id is distinct from old.comprador_id and new.comprador_id is not null) then
--     raise exception 'Una reseña no se puede editar.' using errcode = '22023';
--   end if;
--   return new;
-- end;
-- $f$;
-- revoke all on function privado.resenas_no_se_editan() from public, anon, authenticated;
-- alter table public.resenas drop constraint if exists resenas_eliminada_coherente;
-- alter table public.resenas drop constraint if exists resenas_revision_coherente;
-- alter table public.resenas drop constraint if exists resenas_revision_motivo_valido;
-- alter table public.resenas drop column if exists eliminada_en;
-- alter table public.resenas drop column if exists revision_comentario;
-- alter table public.resenas drop column if exists revision_motivo;
-- alter table public.resenas drop column if exists revision_pedida_en;
-- notify pgrst, 'reload schema';
-- commit;
-- ============================================================================
