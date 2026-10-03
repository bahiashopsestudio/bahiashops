-- ============================================================================
-- Bahía Shops · 017 · Localidades activas (3/10/2026)
-- Correr entero en el SQL Editor de Supabase. Va en transacción: si algo
-- falla, no cambia nada. Se puede correr dos veces sin romper nada.
--
-- Por qué: Ingeniero White (2) y General Daniel Cerri (3) no tienen barrios
-- cargados. Sin barrios, el alta de vendedor no muestra ni la dirección ni el
-- mapa, la tienda queda sin barrio (no aparece en el mapa, no calcula
-- cadetería) y /vendedor/ubicacion no la deja guardar. Hasta que tengan
-- barrios, no se ofrecen.
--
-- Qué deja hecho:
--   1. localidades.activa (boolean, por defecto true). 2 y 3 en false.
--      Los selectores de la app muestran solo las activas.
--   2. Un disparador que rechaza crear una tienda o una dirección en una
--      localidad inactiva. Hace falta en la base porque el navegador escribe
--      directo en vendedores y direcciones: el filtro del selector no alcanza.
--
-- Lo ya guardado NO se toca: ninguna fila cambia de localidad, y el
-- disparador en un UPDATE solo mira la localidad (o el barrio) si cambia. Una
-- tienda que ya está en Cerri puede seguir editando sus otros datos.
-- ============================================================================
begin;

-- ---------------------------------------------------------------------------
-- 1. La columna
-- ---------------------------------------------------------------------------
alter table public.localidades
  add column if not exists activa boolean not null default true;

update public.localidades set activa = false where id in (2, 3);

-- El navegador lee localidades con la clave pública (anon o authenticated).
-- Si la tabla da SELECT entero, esto no agrega nada; si los permisos son por
-- columna (como vendedores desde la 012), sin esto la columna nueva no se
-- podría leer y los selectores fallarían.
grant select (activa) on public.localidades to anon, authenticated;

-- ---------------------------------------------------------------------------
-- 2. Nada nuevo en una localidad inactiva
-- ---------------------------------------------------------------------------
-- Mira dos caminos, porque una fila puede apuntar a una localidad directo
-- (localidad_id) o a través de su barrio (barrio_id -> barrios.localidad_id).
-- Lee las columnas con to_jsonb(new), como la 016: la misma función sirve
-- para tablas que no tienen alguna de las dos (si falta, da null).
create or replace function privado.rechazar_localidad_inactiva()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_nuevo jsonb := to_jsonb(new);
  v_viejo jsonb := case when tg_op = 'UPDATE' then to_jsonb(old) end;
  v_localidad bigint := nullif(v_nuevo ->> 'localidad_id', '')::bigint;
  v_barrio bigint := nullif(v_nuevo ->> 'barrio_id', '')::bigint;
begin
  if (tg_op = 'INSERT' or v_nuevo -> 'localidad_id' is distinct from v_viejo -> 'localidad_id')
     and exists (select 1 from public.localidades where id = v_localidad and not activa) then
    raise exception 'Por ahora Bahía Shops no está disponible en esa localidad.' using errcode = 'P0001';
  end if;

  if (tg_op = 'INSERT' or v_nuevo -> 'barrio_id' is distinct from v_viejo -> 'barrio_id')
     and exists (
       select 1 from public.barrios b
       join public.localidades l on l.id = b.localidad_id
       where b.id = v_barrio and not l.activa
     ) then
    raise exception 'Por ahora Bahía Shops no está disponible en esa localidad.' using errcode = 'P0001';
  end if;

  return new;
end;
$$;

revoke all on function privado.rechazar_localidad_inactiva() from public, anon, authenticated;

drop trigger if exists rechazar_localidad_inactiva on public.vendedores;
create trigger rechazar_localidad_inactiva before insert or update on public.vendedores
  for each row execute function privado.rechazar_localidad_inactiva();

drop trigger if exists rechazar_localidad_inactiva on public.direcciones;
create trigger rechazar_localidad_inactiva before insert or update on public.direcciones
  for each row execute function privado.rechazar_localidad_inactiva();

commit;

-- ---------------------------------------------------------------------------
-- Verificación (correr aparte, después)
-- ---------------------------------------------------------------------------
-- select id, nombre, activa from public.localidades order by id;
--
-- begin;
-- set local role anon;
-- select id, nombre, activa from public.localidades;   -- tiene que andar
-- rollback;
--
-- Para reactivar una localidad cuando tenga barrios:
-- update public.localidades set activa = true where id = 3;
