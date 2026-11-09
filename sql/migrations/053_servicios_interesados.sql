-- ============================================================================
-- Bahía Shops · 053 · Servicios: quienes quieren sumarse (09/11/2026)
-- Correr entera en el SQL Editor de Supabase. Va en transacción: si algo
-- falla, no cambia nada. Se puede correr dos veces sin romper nada.
--
-- CORRERLA ANTES DE PUBLICAR EL CÓDIGO QUE LA ACOMPAÑA. Sin ella, «Anotarme»
-- en /servicios da error y /admin/servicios no carga. El código de hoy anda
-- con ella: no la conoce.
--
-- Qué deja hecho:
--   1. servicios_interesados: quien se anota en /servicios para sumarse cuando
--      abra la sección. Email (en minúscula, sin espacios), rubro con sus
--      palabras y fecha. Sin cuenta ni IP: se puede anotar sin sesión.
--      Un email, una fila: si vuelve a anotarse, no cambia nada.
--   2. Permisos: nace cerrada (grupo "solo el servidor" de la 032). La escribe
--      /api/servicios, solo a través de la función del punto 3, y la leen y
--      borran /api/admin/servicios, los dos con service_role.
--   3. privado.registrar_interes_servicios: el tope de 100 anotaciones nuevas
--      por día de Argentina, como la 045: la ruta es pública. Contar y guardar
--      van juntos, bajo un candado. Un email repetido no se guarda ni cuenta,
--      y la respuesta es la misma: no se puede averiguar si ya estaba.
--   4. Eliminar la cuenta (Ley 25.326) borra la anotación hecha con el email
--      de esa cuenta, en los dos caminos de privado.cerrar_cuenta (031):
--        · Cáscara anónima: la misma actualización pone cerrada_en y cambia el
--          email, así que se busca por el email de antes (old.email) y por el
--          de auth.users, que en ese momento todavía es el original.
--        · Borrado completo: la cascada desde auth.users borra la fila de
--          usuarios; un disparador AFTER DELETE busca por old.email. Es el
--          primer AFTER DELETE sobre usuarios: solo borra en esta tabla, que
--          no tiene claves foráneas, así que no interfiere con la cascada ni
--          con el chequeo final de cerrar_cuenta.
--
-- Lo que NO hace: no toca privado.cerrar_cuenta, ni mensajes_contacto ni
-- leads_gastronomia (sus políticas RLS quedan pendientes de revisar aparte).
-- Ajustar el tope: cambiar la constante v_tope y volver a correr esta migración.
-- ============================================================================
begin;

-- ---------------------------------------------------------------------------
-- 1. La tabla
-- ---------------------------------------------------------------------------
create table if not exists public.servicios_interesados (
  id bigint generated always as identity primary key,
  email text not null unique
    check (email = lower(btrim(email)) and char_length(email) between 3 and 254),
  rubro text not null
    check (rubro = btrim(rubro) and char_length(rubro) between 1 and 80),
  creado_en timestamptz not null default now()
);

create index if not exists servicios_interesados_creado_en
  on public.servicios_interesados (creado_en desc);

comment on table public.servicios_interesados is
  'Quienes se anotaron en /servicios para sumarse. Se borra al eliminar la cuenta con ese email.';

-- ---------------------------------------------------------------------------
-- 2. Permisos
-- ---------------------------------------------------------------------------
alter table public.servicios_interesados enable row level security;
revoke all on table public.servicios_interesados from public, anon, authenticated;
grant select, insert, update, delete on table public.servicios_interesados to service_role;

-- ---------------------------------------------------------------------------
-- 3. Guardar, con el tope por día
-- ---------------------------------------------------------------------------
-- Devuelve { "ok": true } (nuevo o repetido) o { "ok": false, "motivo": "tope" }.
create or replace function privado.registrar_interes_servicios(p_email text, p_rubro text)
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
  perform pg_advisory_xact_lock(hashtext('servicios_interesados'));

  select count(*) into v_hoy
    from public.servicios_interesados
   where creado_en >= v_inicio_del_dia;

  if v_hoy >= v_tope then
    return jsonb_build_object('ok', false, 'motivo', 'tope');
  end if;

  insert into public.servicios_interesados (email, rubro)
  values (lower(btrim(p_email)), btrim(p_rubro))
  on conflict (email) do nothing;

  return jsonb_build_object('ok', true);
end;
$$;

revoke all on function privado.registrar_interes_servicios(text, text) from public, anon, authenticated;
grant execute on function privado.registrar_interes_servicios(text, text) to service_role;

-- El esquema privado no está expuesto (007): el servidor la llama con .rpc().
create or replace function public.rpc_registrar_interes_servicios(p_email text, p_rubro text)
returns jsonb
language sql
security invoker
as $$ select privado.registrar_interes_servicios(p_email, p_rubro) $$;

revoke all on function public.rpc_registrar_interes_servicios(text, text) from public, anon, authenticated;
grant execute on function public.rpc_registrar_interes_servicios(text, text) to service_role;

-- ---------------------------------------------------------------------------
-- 4. Cuenta eliminada: se borra la anotación con su email
-- ---------------------------------------------------------------------------
create or replace function privado.servicios_interesados_borrar_al_cerrar_cuenta()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_emails text[];
begin
  if tg_op = 'UPDATE' and not (new.cerrada_en is not null and old.cerrada_en is null) then
    return null;
  end if;

  v_emails := array(
    select distinct lower(btrim(e))
      from unnest(array[old.email, (select u.email from auth.users u where u.id = old.id)]) as e
     where nullif(btrim(e), '') is not null
  );

  if cardinality(v_emails) > 0 then
    delete from public.servicios_interesados where email = any (v_emails);
  end if;

  return null;
end;
$$;

revoke all on function privado.servicios_interesados_borrar_al_cerrar_cuenta() from public, anon, authenticated;

drop trigger if exists servicios_interesados_borrar_al_cerrar_cuenta on public.usuarios;
create trigger servicios_interesados_borrar_al_cerrar_cuenta
  after update of cerrada_en on public.usuarios
  for each row execute function privado.servicios_interesados_borrar_al_cerrar_cuenta();

drop trigger if exists servicios_interesados_borrar_al_borrar_cuenta on public.usuarios;
create trigger servicios_interesados_borrar_al_borrar_cuenta
  after delete on public.usuarios
  for each row execute function privado.servicios_interesados_borrar_al_cerrar_cuenta();

commit;

-- ============================================================================
-- Verificación (correr aparte, después; una sola fila). Tiene que dar: rls
-- true, service_role_escribe y service_role_ejecuta true, las dos marcas de
-- disparador true, y todo lo de anon y authenticated en false.
-- ============================================================================
-- select jsonb_pretty(jsonb_build_object(
--   'rls', (select relrowsecurity from pg_class where oid = 'public.servicios_interesados'::regclass),
--   'anon_puede_algo', has_table_privilege('anon', 'public.servicios_interesados', 'select,insert,update,delete'),
--   'authenticated_puede_algo', has_table_privilege('authenticated', 'public.servicios_interesados', 'select,insert,update,delete'),
--   'service_role_escribe', has_table_privilege('service_role', 'public.servicios_interesados', 'insert'),
--   'anon_ejecuta_rpc', has_function_privilege('anon', 'public.rpc_registrar_interes_servicios(text, text)', 'execute'),
--   'authenticated_ejecuta_rpc', has_function_privilege('authenticated', 'public.rpc_registrar_interes_servicios(text, text)', 'execute'),
--   'service_role_ejecuta', has_function_privilege('service_role', 'public.rpc_registrar_interes_servicios(text, text)', 'execute'),
--   'borra_al_cerrar_cuenta', exists (select 1 from pg_trigger where tgrelid = 'public.usuarios'::regclass and tgname = 'servicios_interesados_borrar_al_cerrar_cuenta'),
--   'borra_al_borrar_cuenta', exists (select 1 from pg_trigger where tgrelid = 'public.usuarios'::regclass and tgname = 'servicios_interesados_borrar_al_borrar_cuenta')
-- ));

-- ============================================================================
-- Deshacer (borra las anotaciones guardadas):
-- ============================================================================
-- begin;
-- drop trigger if exists servicios_interesados_borrar_al_borrar_cuenta on public.usuarios;
-- drop trigger if exists servicios_interesados_borrar_al_cerrar_cuenta on public.usuarios;
-- drop function if exists privado.servicios_interesados_borrar_al_cerrar_cuenta();
-- drop function if exists public.rpc_registrar_interes_servicios(text, text);
-- drop function if exists privado.registrar_interes_servicios(text, text);
-- drop table if exists public.servicios_interesados;
-- commit;
