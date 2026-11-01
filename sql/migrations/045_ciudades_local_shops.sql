-- ============================================================================
-- Bahía Shops · 045 · Pedidos de Local Shops (1/11/2026)
-- Correr entero en el SQL Editor de Supabase. Va en transacción: si algo
-- falla, no cambia nada. Se puede correr dos veces sin romper nada.
--
-- CORRERLA ANTES DE PUBLICAR EL CÓDIGO QUE LA ACOMPAÑA. Sin ella, el formulario
-- de /local-shops da error y no sale el mail, y /admin/ciudades no carga. El
-- código viejo anda con ella: no la conoce.
--
-- Qué deja hecho:
--   1. ciudades_local_shops: cada pedido del formulario público de /local-shops.
--      Sin sesión y sin datos de contacto: provincia, ciudad y fecha. Por eso
--      no es parte de ciudades_pedidas (una fila por cuenta) y no tiene nada
--      que borrar al eliminar una cuenta.
--   2. Permisos: nace cerrada (grupo "solo el servidor" de la 032). La escribe
--      /api/local-shops, solo a través de la función del punto 3, y la lee
--      /api/admin/ciudades, los dos con service_role.
--   3. privado.registrar_local_shops: el tope de 100 pedidos por día de
--      Argentina, para que nadie llene la tabla ni la casilla: la ruta es
--      pública. Contar y guardar van juntos, bajo un candado, así dos pedidos
--      a la vez no pasan el tope.
--
-- Lo que NO hace: no toca ciudades_pedidas. Ajustar el tope: cambiar la
-- constante v_tope y volver a correr esta migración.
-- ============================================================================
begin;

-- ---------------------------------------------------------------------------
-- 1. La tabla
-- ---------------------------------------------------------------------------
create table if not exists public.ciudades_local_shops (
  id bigint generated always as identity primary key,
  provincia text not null
    check (char_length(provincia) between 1 and 60),
  ciudad text not null
    check (ciudad = btrim(ciudad) and char_length(ciudad) between 1 and 120),
  creado_en timestamptz not null default now()
);

create index if not exists ciudades_local_shops_creado_en
  on public.ciudades_local_shops (creado_en desc);

comment on table public.ciudades_local_shops is
  'Pedidos del formulario público de /local-shops. Sin datos de contacto.';

-- ---------------------------------------------------------------------------
-- 2. Permisos
-- ---------------------------------------------------------------------------
alter table public.ciudades_local_shops enable row level security;
revoke all on table public.ciudades_local_shops from public, anon, authenticated;
grant select, insert, update, delete on table public.ciudades_local_shops to service_role;

-- ---------------------------------------------------------------------------
-- 3. Guardar, con el tope por día
-- ---------------------------------------------------------------------------
-- Devuelve { "ok": true } o { "ok": false, "motivo": "tope" }.
create or replace function privado.registrar_local_shops(p_provincia text, p_ciudad text)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_tope constant integer := 100;
  v_inicio_del_dia timestamptz :=
    date_trunc('day', now() at time zone 'America/Argentina/Buenos_Aires')
      at time zone 'America/Argentina/Buenos_Aires';
  v_hoy integer;
begin
  perform pg_advisory_xact_lock(hashtext('ciudades_local_shops'));

  select count(*) into v_hoy
    from public.ciudades_local_shops
   where creado_en >= v_inicio_del_dia;

  if v_hoy >= v_tope then
    return jsonb_build_object('ok', false, 'motivo', 'tope');
  end if;

  insert into public.ciudades_local_shops (provincia, ciudad)
  values (p_provincia, p_ciudad);

  return jsonb_build_object('ok', true);
end;
$$;

revoke all on function privado.registrar_local_shops(text, text) from public, anon, authenticated;
grant execute on function privado.registrar_local_shops(text, text) to service_role;

-- El esquema privado no está expuesto (007): el servidor la llama con .rpc().
create or replace function public.rpc_registrar_local_shops(p_provincia text, p_ciudad text)
returns jsonb
language sql
security invoker
as $$ select privado.registrar_local_shops(p_provincia, p_ciudad) $$;

revoke all on function public.rpc_registrar_local_shops(text, text) from public, anon, authenticated;
grant execute on function public.rpc_registrar_local_shops(text, text) to service_role;

commit;

-- ============================================================================
-- Verificación (una sola fila). Tiene que dar: rls true, service_role_escribe
-- true, service_role_ejecuta true, y todo lo de anon y authenticated en false.
-- ============================================================================
select jsonb_pretty(jsonb_build_object(
  'rls', (select relrowsecurity from pg_class where oid = 'public.ciudades_local_shops'::regclass),
  'anon_puede_algo', has_table_privilege('anon', 'public.ciudades_local_shops', 'select,insert,update,delete'),
  'authenticated_puede_algo', has_table_privilege('authenticated', 'public.ciudades_local_shops', 'select,insert,update,delete'),
  'service_role_escribe', has_table_privilege('service_role', 'public.ciudades_local_shops', 'insert'),
  'anon_ejecuta_rpc', has_function_privilege('anon', 'public.rpc_registrar_local_shops(text, text)', 'execute'),
  'authenticated_ejecuta_rpc', has_function_privilege('authenticated', 'public.rpc_registrar_local_shops(text, text)', 'execute'),
  'service_role_ejecuta', has_function_privilege('service_role', 'public.rpc_registrar_local_shops(text, text)', 'execute')
));

-- ============================================================================
-- Deshacer (borra los pedidos guardados):
-- ============================================================================
-- begin;
-- drop function if exists public.rpc_registrar_local_shops(text, text);
-- drop function if exists privado.registrar_local_shops(text, text);
-- drop table if exists public.ciudades_local_shops;
-- commit;
