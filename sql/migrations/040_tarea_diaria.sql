-- ============================================================================
-- Bahía Shops · 040 · La tarea diaria: avisos de reseña y renovación de
-- MercadoPago (21/10/2026)
-- Correr entero en el SQL Editor de Supabase. Va en transacción: si algo
-- falla, no cambia nada. Se puede correr dos veces sin romper nada.
--
-- CORRERLA DESPUÉS DE LA 039 Y ANTES DE PUBLICAR EL CÓDIGO QUE LA ACOMPAÑA.
-- Solo AGREGA columnas, dos disparadores y una función, y reescribe
-- privado.cancelar_pedidos_vencidos con la MISMA firma y el MISMO resultado
-- (la condición pasa a una función aparte, para poder listarla sin cancelar).
-- El código de hoy sigue igual: el «¿Cómo te fue?» que marca
-- aviso_resena_en sin decir cuál invitación es queda como 'entregado' (lo
-- completa el disparador del punto 2). El código nuevo la necesita: sin ella,
-- /api/cron/diaria, el aviso del panel de pedidos, la compra (marca
-- renovacion_fallida_en) y el aviso de Mi negocio (/api/mercadopago/cuenta la
-- lee) dan error.
--
-- Por qué: una tarea por día (Vercel Cron, /api/cron/diaria, 10 a 11 de
-- Argentina) manda el aviso de los 14 días (solo entre los días 14 y 21 del
-- pago, y solo a los pedidos que cumplen 14 días desde que se publica la
-- tarea: la fecha de corte va en el código) y el recordatorio de reseña,
-- renueva los tokens de MercadoPago que vencen en 30 días y cancela los
-- pedidos vencidos. Cada mail se marca en la base ANTES de mandarlo, con un
-- UPDATE que solo se lleva la fila si la marca estaba en null (como
-- enviarUnaVez, src/lib/mailsPedidos.js): dos corridas a la vez no mandan nada
-- dos veces.
--
-- MercadoPago: ni la tarea ni la compra desconectan una cuenta porque falle
-- la renovación. Si falla y el token todavía no venció, se sigue usando y se
-- marca renovacion_fallida_en (la compra no manda mail: el aviso a la tienda y
-- a notificaciones@ lo manda la tarea, una vez). Solo con el token ya vencido
-- la compra se comporta como hoy. Mientras haya marca, Mi negocio muestra el
-- aviso para reconectar; se va solo cuando el disparador del punto 5 la
-- limpia.
--
-- Qué deja hecho:
--   1. pedidos.aviso_resena_via ('entregado' | '14_dias'): CUÁL invitación
--      recibió el pedido. La invitación es una sola y la marca sigue siendo
--      pedidos.aviso_resena_en (037): la que la reclama primero se la lleva.
--      Si la tienda marca Entregado después del aviso de los 14 días, el
--      «¿Cómo te fue?» encuentra aviso_resena_en ocupado y no sale.
--      Los pedidos que ya tienen aviso_resena_en quedan como 'entregado'.
--   2. Disparador (privado.pedidos_via_de_invitacion): sin aviso_resena_en
--      no hay via; con aviso_resena_en y sin via, via = 'entregado'. Así el
--      código de hoy (que no conoce la via) sigue andando, y cuando enviarUnaVez
--      suelta la marca porque Resend falló, la via se va con ella.
--   3. pedidos.recordatorio_resena_en: el recordatorio, uno solo por pedido.
--      Solo con invitación (check).
--   4. mercadopago_cuentas.renovacion_fallida_en, renovacion_error,
--      aviso_renovacion_en: la renovación falló (desde cuándo y por qué, sin
--      tokens; la marcan la tarea o la compra) y cuándo avisó la tarea a la
--      tienda y a notificaciones@ (una vez). La cuenta NO se borra ni se
--      desconecta.
--   5. Disparador (privado.mp_cuentas_limpiar_renovacion): cuando cambian los
--      tokens (se renovó bien, al comprar o en la tarea, o la tienda
--      reconectó con el upsert del callback) las tres columnas vuelven a null.
--      Si la tienda desconecta, la fila se borra y la marca con ella.
--   6. privado.pedidos_vencidos(tienda opcional): los pedidos que
--      cancelar_pedidos_vencidos cancelaría, sin tocarlos (para el modo
--      prueba). cancelar_pedidos_vencidos usa esta misma función: la condición
--      está en un solo lugar. public.rpc_pedidos_vencidos, solo service_role.
--
-- Permisos: ninguno para el navegador. mercadopago_cuentas no tiene ningún
-- permiso para anon ni authenticated (024): Mi negocio recibe la marca y el
-- vencimiento por /api/mercadopago/cuenta (servidor, service_role). pedidos sigue con SELECT de tabla
-- para authenticated (con la RLS de los pedidos propios): las dos columnas
-- nuevas quedan legibles para quien compró, en sus pedidos, igual que
-- aviso_resena_en (037). No llevan grant por columna.
--
-- Lo que NO hace: no toca resenas, ni la regla de la ventana (vive en
-- src/lib/resenas.js), ni vendedores.mercadopago_conectado. No marca nada en
-- los pedidos existentes: los viejos quedan afuera del aviso de los 14 días
-- por la fecha de corte del código (el recordatorio no tiene corte). Lo que
-- haría la primera corrida: sql/consultas/040_primera_corrida.sql.
-- ============================================================================

begin;

create schema if not exists privado;
grant usage on schema privado to service_role;

-- ---------------------------------------------------------------------------
-- 1. pedidos.aviso_resena_via
-- ---------------------------------------------------------------------------
alter table public.pedidos
  add column if not exists aviso_resena_via text;

update public.pedidos
   set aviso_resena_via = 'entregado'
 where aviso_resena_en is not null
   and aviso_resena_via is null;

alter table public.pedidos drop constraint if exists pedidos_aviso_resena_via_valida;
alter table public.pedidos add constraint pedidos_aviso_resena_via_valida
  check (aviso_resena_via in ('entregado', '14_dias'));

alter table public.pedidos drop constraint if exists pedidos_aviso_resena_via_con_aviso;
alter table public.pedidos add constraint pedidos_aviso_resena_via_con_aviso
  check ((aviso_resena_en is null) = (aviso_resena_via is null));

-- ---------------------------------------------------------------------------
-- 2. El disparador de la via
-- ---------------------------------------------------------------------------
create or replace function privado.pedidos_via_de_invitacion()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  if new.aviso_resena_en is null then
    new.aviso_resena_via := null;
  elsif new.aviso_resena_via is null then
    new.aviso_resena_via := 'entregado';
  end if;
  return new;
end;
$$;

drop trigger if exists pedidos_via_de_invitacion on public.pedidos;
create trigger pedidos_via_de_invitacion
  before insert or update of aviso_resena_en, aviso_resena_via on public.pedidos
  for each row execute function privado.pedidos_via_de_invitacion();

-- ---------------------------------------------------------------------------
-- 3. pedidos.recordatorio_resena_en
-- ---------------------------------------------------------------------------
alter table public.pedidos
  add column if not exists recordatorio_resena_en timestamptz;

alter table public.pedidos drop constraint if exists pedidos_recordatorio_con_invitacion;
alter table public.pedidos add constraint pedidos_recordatorio_con_invitacion
  check (recordatorio_resena_en is null or aviso_resena_en is not null);

-- ---------------------------------------------------------------------------
-- 4. La renovación fallida, en mercadopago_cuentas
-- ---------------------------------------------------------------------------
alter table public.mercadopago_cuentas
  add column if not exists renovacion_fallida_en timestamptz,
  add column if not exists renovacion_error text,
  add column if not exists aviso_renovacion_en timestamptz;

alter table public.mercadopago_cuentas drop constraint if exists mp_cuentas_aviso_con_falla;
alter table public.mercadopago_cuentas add constraint mp_cuentas_aviso_con_falla
  check (aviso_renovacion_en is null or renovacion_fallida_en is not null);

alter table public.mercadopago_cuentas drop constraint if exists mp_cuentas_error_corto;
alter table public.mercadopago_cuentas add constraint mp_cuentas_error_corto
  check (renovacion_error is null or char_length(renovacion_error) <= 500);

-- ---------------------------------------------------------------------------
-- 5. Tokens nuevos: se limpia la marca
-- ---------------------------------------------------------------------------
create or replace function privado.mp_cuentas_limpiar_renovacion()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  if new.access_token is distinct from old.access_token
     or new.refresh_token is distinct from old.refresh_token then
    new.renovacion_fallida_en := null;
    new.renovacion_error := null;
    new.aviso_renovacion_en := null;
  end if;
  return new;
end;
$$;

drop trigger if exists mp_cuentas_limpiar_renovacion on public.mercadopago_cuentas;
create trigger mp_cuentas_limpiar_renovacion
  before update on public.mercadopago_cuentas
  for each row execute function privado.mp_cuentas_limpiar_renovacion();

-- ---------------------------------------------------------------------------
-- 6. Los pedidos vencidos: la condición, aparte
-- ---------------------------------------------------------------------------
-- La misma condición de la 025, sin cambios: un cupón de efectivo vencido
-- hace más de 6 horas, o un link de pago vencido sin pago en proceso.
create or replace function privado.pedidos_vencidos(p_vendedor_id bigint default null)
returns table (pedido_id bigint, vendedor_id integer, motivo text)
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select p.id, p.vendedor_id,
         case when p.efectivo_vence_en is not null then 'cupon_vencido' else 'link_vencido' end
    from public.pedidos p
   where p.estado = 'pendiente'
     and (p_vendedor_id is null or p.vendedor_id = p_vendedor_id)
     and (
       (p.efectivo_vence_en is not null and p.efectivo_vence_en + interval '6 hours' < now())
       or (
         p.efectivo_vence_en is null
         and p.vence_en is not null
         and p.vence_en < now()
         and coalesce(btrim(p.mp_payment_id), '') in ('', 'null', 'undefined')
       )
     )
$$;

create or replace function privado.cancelar_pedidos_vencidos(p_vendedor_id bigint default null)
returns integer
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_cancelados integer;
begin
  with c as (
    update public.pedidos
       set estado = 'cancelado',
           cancelado_motivo = 'pago_vencido',
           actualizado_en = now()
     where estado = 'pendiente'
       and id in (select v.pedido_id from privado.pedidos_vencidos(p_vendedor_id) v)
    returning 1
  )
  select count(*)::integer into v_cancelados from c;

  return v_cancelados;
end;
$$;

create or replace function public.rpc_pedidos_vencidos()
returns table (pedido_id bigint, vendedor_id integer, motivo text)
language sql
stable
security definer
set search_path = public, pg_temp
as $$ select * from privado.pedidos_vencidos(null) $$;

-- ---------------------------------------------------------------------------
-- Permisos
-- ---------------------------------------------------------------------------
revoke all on function privado.pedidos_via_de_invitacion()      from public, anon, authenticated;
revoke all on function privado.mp_cuentas_limpiar_renovacion()  from public, anon, authenticated;
revoke all on function privado.pedidos_vencidos(bigint)         from public, anon, authenticated;
revoke all on function privado.cancelar_pedidos_vencidos(bigint) from public, anon, authenticated;
revoke all on function public.rpc_pedidos_vencidos()            from public, anon, authenticated;
grant execute on function privado.pedidos_vencidos(bigint)          to service_role;
grant execute on function privado.cancelar_pedidos_vencidos(bigint) to service_role;
grant execute on function public.rpc_pedidos_vencidos()             to service_role;

notify pgrst, 'reload schema';

commit;

-- ============================================================================
-- Verificación (una sola fila; copiá la celda)
--   · columnas: las cinco con su tipo (text / timestamptz).
--   · disparadores: los dos true.
--   · via_sin_aviso y aviso_sin_via: 0.
--   · mp_permisos: anon y authenticated vacíos.
--   · rpc_vencidos_permisos: anon false, authenticated false, service_role true.
--   · vencidos_hoy: cuántos cancelaría ahora (informativo).
-- ============================================================================
select jsonb_pretty(jsonb_build_object(
  'columnas', (select jsonb_object_agg(table_name || '.' || column_name, data_type)
                 from information_schema.columns
                where table_schema = 'public'
                  and (table_name, column_name) in (
                    ('pedidos', 'aviso_resena_via'), ('pedidos', 'recordatorio_resena_en'),
                    ('mercadopago_cuentas', 'renovacion_fallida_en'), ('mercadopago_cuentas', 'renovacion_error'),
                    ('mercadopago_cuentas', 'aviso_renovacion_en'))),
  'disparadores', (select jsonb_object_agg(t.nombre, exists (select 1 from pg_trigger where tgname = t.nombre and not tgisinternal))
                     from unnest(array['pedidos_via_de_invitacion', 'mp_cuentas_limpiar_renovacion']) as t(nombre)),
  'via_sin_aviso', (select count(*) from public.pedidos where aviso_resena_via is not null and aviso_resena_en is null),
  'aviso_sin_via', (select count(*) from public.pedidos where aviso_resena_en is not null and aviso_resena_via is null),
  'mp_permisos', (select jsonb_object_agg(r.rol, coalesce((
        select string_agg(a.privilege_type, ', ' order by a.privilege_type)
          from pg_class c, aclexplode(c.relacl) a
         where c.oid = 'public.mercadopago_cuentas'::regclass and a.grantee = r.rol::regrole), ''))
      from unnest(array['anon', 'authenticated']) as r(rol)),
  'rpc_vencidos_permisos', jsonb_build_object(
      'anon',          has_function_privilege('anon', 'public.rpc_pedidos_vencidos()', 'execute'),
      'authenticated', has_function_privilege('authenticated', 'public.rpc_pedidos_vencidos()', 'execute'),
      'service_role',  has_function_privilege('service_role', 'public.rpc_pedidos_vencidos()', 'execute')),
  'vencidos_hoy', (select count(*) from privado.pedidos_vencidos(null))
)) as verificacion;

-- ============================================================================
-- Para deshacer (correr en transacción). Se pierden las marcas de los avisos:
-- con el código nuevo publicado, la tarea diaria y el panel dan error;
-- despublicar el código antes. cancelar_pedidos_vencidos vuelve a la de la
-- 025 (con la condición adentro).
-- ============================================================================
-- begin;
-- drop trigger if exists pedidos_via_de_invitacion on public.pedidos;
-- drop trigger if exists mp_cuentas_limpiar_renovacion on public.mercadopago_cuentas;
-- drop function if exists privado.pedidos_via_de_invitacion();
-- drop function if exists privado.mp_cuentas_limpiar_renovacion();
-- drop function if exists public.rpc_pedidos_vencidos();
-- -- (acá, pegar privado.cancelar_pedidos_vencidos de la 025 tal cual)
-- drop function if exists privado.pedidos_vencidos(bigint);
-- alter table public.pedidos drop constraint if exists pedidos_recordatorio_con_invitacion;
-- alter table public.pedidos drop constraint if exists pedidos_aviso_resena_via_con_aviso;
-- alter table public.pedidos drop constraint if exists pedidos_aviso_resena_via_valida;
-- alter table public.pedidos drop column if exists recordatorio_resena_en;
-- alter table public.pedidos drop column if exists aviso_resena_via;
-- alter table public.mercadopago_cuentas drop constraint if exists mp_cuentas_aviso_con_falla;
-- alter table public.mercadopago_cuentas drop constraint if exists mp_cuentas_error_corto;
-- alter table public.mercadopago_cuentas drop column if exists aviso_renovacion_en;
-- alter table public.mercadopago_cuentas drop column if exists renovacion_error;
-- alter table public.mercadopago_cuentas drop column if exists renovacion_fallida_en;
-- notify pgrst, 'reload schema';
-- commit;
-- ============================================================================
