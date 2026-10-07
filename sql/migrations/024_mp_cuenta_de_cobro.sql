-- ============================================================================
-- Bahía Shops · 024 · Qué cuenta de MercadoPago cobra cada pedido (6/10/2026)
-- Correr entero en el SQL Editor de Supabase. Va en transacción: si algo
-- falla, no cambia nada. Se puede correr dos veces sin romper nada.
--
-- CORRERLA ANTES DE PUBLICAR EL CÓDIGO QUE LA ACOMPAÑA, y después de la 022 y la
-- 023. El código nuevo escribe pedidos.mp_user_id_cobro al crear cada pedido y
-- mercadopago_cuentas.mp_nickname al conectar una cuenta: sin las columnas, ni
-- las compras ni la conexión con MercadoPago podrían guardarse. El código viejo
-- anda con ella: no conoce ninguna. (El REVOKE del punto 4 no afecta al código
-- viejo ni al nuevo: ninguno lee mercadopago_cuentas desde el navegador.)
--
-- Por qué: si una tienda reconecta MercadoPago con OTRA cuenta, los links de
-- pago que ya tenían sus pedidos pendientes siguen cobrando para la cuenta
-- vieja, y el botón "Pagar" los volvía a ofrecer. Para comparar, cada pedido
-- guarda QUÉ cuenta lo cobra (el mp_user_id de la tienda en el momento de crear
-- la preferencia): se guarda lo que es, no se deduce del id de la preferencia.
--
-- Qué deja hecho:
--   1. pedidos.mp_user_id_cobro: la cuenta de MercadoPago que cobra ese pedido.
--      La escribe el servidor al crear el pedido. Sin backfill: los pedidos que
--      ya existen quedan en null y no ofrecen el botón "Pagar".
--   2. pedidos.cancelado_motivo acepta un valor más: cuenta_mp_cambiada (la
--      tienda cambió o desconectó la cuenta con la que se iba a cobrar).
--   3. mercadopago_cuentas.mp_nickname: el nombre de la cuenta conectada (para
--      mostrarlo en el panel y en el mail). NO se guarda el mail de la cuenta de
--      MercadoPago.
--      "Desde cuándo está conectada" NO es una columna nueva: ya existe
--      mercadopago_cuentas.conectado_en (timestamptz, not null, default now()).
--      Esta migración no la toca. Qué significa lo decide el callback de la
--      conexión (src/app/api/mercadopago/oauth/callback/route.js): se escribe al
--      conectar por primera vez y al conectar una cuenta DISTINTA, y se deja como
--      está al volver a conectar la misma. Las filas de hoy (tiendas 14 y 15, que
--      se reconectaron hoy) ya tienen la fecha de su conexión actual.
--   4. mercadopago_cuentas: se le quita TODO permiso a anon y authenticated. Es
--      la tabla de los tokens de cada tienda, y hoy solo la frena RLS sin
--      políticas (anon y authenticated tenían permisos de tabla completos,
--      incluso TRUNCATE, que ignora RLS). Nadie la lee desde el navegador: todo
--      el código que la usa corre en el servidor con service_role (el callback,
--      la desconexión, el webhook, tokens.js, las rutas de pago y la del panel).
--      service_role no se toca.
--   5. privado.cancelar_pedidos_de_tienda(tienda, motivo, cuenta a conservar):
--      cancela los pedidos pendientes SIN ningún pago de una tienda. Con "cuenta
--      a conservar", deja en paz a los que cobra esa cuenta (la que acaba de
--      conectarse). Devuelve los cancelados (id y preferencia, para vencer sus
--      links en MercadoPago) y cuántos pedidos con un pago en proceso quedaron
--      sin tocar. Los pagos en proceso (por ejemplo un ticket en efectivo) nunca
--      se cancelan: ya hay plata en camino.
--   6. public.rpc_cancelar_pedidos_de_tienda: la función fina que llama el
--      servidor con .rpc(). Solo service_role puede ejecutarla.
-- ============================================================================
begin;

create schema if not exists privado;
grant usage on schema privado to service_role;

-- ---------------------------------------------------------------------------
-- 1. La cuenta que cobra cada pedido
-- ---------------------------------------------------------------------------
alter table public.pedidos
  add column if not exists mp_user_id_cobro text;

-- ---------------------------------------------------------------------------
-- 2. Un motivo de cancelación más
-- ---------------------------------------------------------------------------
alter table public.pedidos drop constraint if exists pedidos_cancelado_motivo_valido;
alter table public.pedidos add constraint pedidos_cancelado_motivo_valido
  check (cancelado_motivo is null
         or cancelado_motivo in ('pago_vencido', 'cuenta_eliminada', 'tienda_cerrada', 'cuenta_mp_cambiada'));

-- ---------------------------------------------------------------------------
-- 3. El nombre de la cuenta conectada
-- ---------------------------------------------------------------------------
alter table public.mercadopago_cuentas
  add column if not exists mp_nickname text;

-- ---------------------------------------------------------------------------
-- 4. Los tokens, fuera del alcance del navegador
--
-- Quitar un permiso de tabla también lo quita de cada columna. Revocar algo que
-- ya no está no hace nada: se puede correr dos veces.
-- ---------------------------------------------------------------------------
revoke all on table public.mercadopago_cuentas from anon, authenticated;

-- ---------------------------------------------------------------------------
-- 5. Cancelar los pendientes sin pago de una tienda
--
-- "Sin ningún pago" es lo mismo que mira la 016 y la 022: mp_payment_id vacío, o
-- el texto "null" o "undefined". Los pedidos con mp_user_id_cobro en null
-- (anteriores a esta migración) cuentan como "de otra cuenta": no se sabe cuál
-- los cobra, así que no se pueden dar por buenos.
--
-- Una sola sentencia: lo que devuelve es exactamente lo que se canceló.
-- ---------------------------------------------------------------------------
create or replace function privado.cancelar_pedidos_de_tienda(
  p_vendedor_id bigint,
  p_motivo text,
  p_cuenta_a_conservar text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_cancelados jsonb;
  v_en_proceso integer;
begin
  with c as (
    update public.pedidos
       set estado = 'cancelado',
           cancelado_motivo = p_motivo,
           actualizado_en = now()
     where vendedor_id = p_vendedor_id
       and estado = 'pendiente'
       and coalesce(btrim(mp_payment_id), '') in ('', 'null', 'undefined')
       and (p_cuenta_a_conservar is null
            or mp_user_id_cobro is distinct from p_cuenta_a_conservar)
    returning id, mp_preference_id
  )
  select coalesce(jsonb_agg(jsonb_build_object('id', id, 'mp_preference_id', mp_preference_id) order by id), '[]'::jsonb)
    into v_cancelados
    from c;

  select count(*)::integer into v_en_proceso
    from public.pedidos
   where vendedor_id = p_vendedor_id
     and estado = 'pendiente'
     and coalesce(btrim(mp_payment_id), '') not in ('', 'null', 'undefined');

  return jsonb_build_object('cancelados', v_cancelados, 'en_proceso', v_en_proceso);
end;
$$;

-- ---------------------------------------------------------------------------
-- 6. Permisos, y la función que llama el servidor
-- ---------------------------------------------------------------------------
revoke all on function privado.cancelar_pedidos_de_tienda(bigint, text, text) from public, anon, authenticated;
grant execute on function privado.cancelar_pedidos_de_tienda(bigint, text, text) to service_role;

create or replace function public.rpc_cancelar_pedidos_de_tienda(
  p_vendedor_id bigint,
  p_motivo text,
  p_cuenta_a_conservar text default null
)
returns jsonb
language sql
security invoker
as $$ select privado.cancelar_pedidos_de_tienda(p_vendedor_id, p_motivo, p_cuenta_a_conservar) $$;

revoke all on function public.rpc_cancelar_pedidos_de_tienda(bigint, text, text) from public, anon, authenticated;
grant execute on function public.rpc_cancelar_pedidos_de_tienda(bigint, text, text) to service_role;

commit;

-- ============================================================================
-- Verificación (una sola fila; copiá la celda)
--   · permisos_rpc y permisos_privado: anon y authenticated false, service_role true.
--   · mercadopago_cuentas_permisos: TODO false para anon y para authenticated
--     (los siete permisos de tabla), y columnas_con_permiso_para_el_navegador en 0.
--   · conectado_en: la columna que ya existía, intacta.
-- ============================================================================
select jsonb_pretty(jsonb_build_object(
  'columnas_pedidos', (select jsonb_agg(column_name order by column_name) from information_schema.columns
                        where table_schema = 'public' and table_name = 'pedidos'
                          and column_name in ('mp_user_id_cobro', 'vence_en', 'link_de_pago', 'cancelado_motivo')),
  'columnas_cuentas', (select jsonb_agg(column_name order by column_name) from information_schema.columns
                        where table_schema = 'public' and table_name = 'mercadopago_cuentas'
                          and column_name in ('mp_nickname', 'conectado_en', 'conectada_en')),
  'conectado_en', (select jsonb_build_object('tipo', data_type, 'nulo', is_nullable, 'default', column_default)
                     from information_schema.columns
                    where table_schema = 'public' and table_name = 'mercadopago_cuentas' and column_name = 'conectado_en'),
  'motivos_validos', (select pg_get_constraintdef(oid) from pg_constraint where conname = 'pedidos_cancelado_motivo_valido'),
  'permisos_rpc', jsonb_build_object(
      'anon',          has_function_privilege('anon',          'public.rpc_cancelar_pedidos_de_tienda(bigint, text, text)', 'execute'),
      'authenticated', has_function_privilege('authenticated', 'public.rpc_cancelar_pedidos_de_tienda(bigint, text, text)', 'execute'),
      'service_role',  has_function_privilege('service_role',  'public.rpc_cancelar_pedidos_de_tienda(bigint, text, text)', 'execute')),
  'permisos_privado', jsonb_build_object(
      'anon',          has_function_privilege('anon',          'privado.cancelar_pedidos_de_tienda(bigint, text, text)', 'execute'),
      'authenticated', has_function_privilege('authenticated', 'privado.cancelar_pedidos_de_tienda(bigint, text, text)', 'execute'),
      'service_role',  has_function_privilege('service_role',  'privado.cancelar_pedidos_de_tienda(bigint, text, text)', 'execute')),
  'mercadopago_cuentas_permisos', jsonb_build_object(
      'anon', (select jsonb_object_agg(p, has_table_privilege('anon', 'public.mercadopago_cuentas', p))
                 from unnest(array['SELECT', 'INSERT', 'UPDATE', 'DELETE', 'TRUNCATE', 'REFERENCES', 'TRIGGER']) as p),
      'authenticated', (select jsonb_object_agg(p, has_table_privilege('authenticated', 'public.mercadopago_cuentas', p))
                 from unnest(array['SELECT', 'INSERT', 'UPDATE', 'DELETE', 'TRUNCATE', 'REFERENCES', 'TRIGGER']) as p),
      'service_role_select', has_table_privilege('service_role', 'public.mercadopago_cuentas', 'SELECT'),
      'columnas_con_permiso_para_el_navegador', (select count(*) from information_schema.column_privileges
                 where table_schema = 'public' and table_name = 'mercadopago_cuentas'
                   and grantee in ('anon', 'authenticated'))
  )
)) as verificacion;

-- ============================================================================
-- Para deshacer (correr en transacción). Los pedidos que la función ya canceló
-- con cuenta_mp_cambiada NO se pueden volver a pendiente, y antes de sacar el
-- motivo del CHECK hay que pasarlos a otro (acá, a pago_vencido).
-- NO se toca conectado_en (existía antes de esta migración). Y NO se recomienda
-- devolver los permisos de mercadopago_cuentas al navegador: el último renglón
-- lo hace igual, por si hiciera falta volver exactamente al estado anterior.
-- ============================================================================
-- begin;
-- drop function if exists public.rpc_cancelar_pedidos_de_tienda(bigint, text, text);
-- drop function if exists privado.cancelar_pedidos_de_tienda(bigint, text, text);
-- update public.pedidos set cancelado_motivo = 'pago_vencido' where cancelado_motivo = 'cuenta_mp_cambiada';
-- alter table public.pedidos drop constraint if exists pedidos_cancelado_motivo_valido;
-- alter table public.pedidos add constraint pedidos_cancelado_motivo_valido check (cancelado_motivo is null or cancelado_motivo in ('pago_vencido', 'cuenta_eliminada', 'tienda_cerrada'));
-- alter table public.mercadopago_cuentas drop column if exists mp_nickname;
-- alter table public.pedidos drop column if exists mp_user_id_cobro;
-- grant select, insert, update, delete, truncate, references, trigger on table public.mercadopago_cuentas to anon, authenticated;
-- commit;
