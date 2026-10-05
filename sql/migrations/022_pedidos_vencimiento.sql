-- ============================================================================
-- Bahía Shops · 022 · Los links de pago vencen (4/10/2026)
-- Correr entero en el SQL Editor de Supabase. Va en transacción: si algo
-- falla, no cambia nada. Se puede correr dos veces sin romper nada.
--
-- CORRERLA ANTES DE PUBLICAR EL CÓDIGO QUE LA ACOMPAÑA. El código nuevo escribe
-- pedidos.vence_en al crear cada pedido: sin la columna, ninguna compra se
-- podría crear. El código viejo anda con ella: no conoce ninguna de las dos
-- columnas. Los pedidos que se creen entre esta migración y la publicación
-- quedan sin vence_en (y con link sin fecha): los regulariza
-- /api/admin/pedidos/regularizar, igual que los que ya existen.
--
-- Por qué: un link de pago no puede valer para siempre. En Argentina los
-- precios cambian y nadie puede pagar semanas después a un precio viejo. El
-- plazo (3 días) está en src/lib/vencimientoPago.js, no acá: la base solo
-- compara vence_en con la hora.
--
-- Qué deja hecho:
--   1. pedidos.vence_en: hasta cuándo se puede pagar. La escribe el servidor al
--      crear el pedido, con la misma fecha que le manda a MercadoPago.
--   2. pedidos.cancelado_motivo: por qué se canceló un pedido. Valores:
--        pago_vencido      el link venció sin que se pagara (esta etapa)
--        cuenta_eliminada  (etapa 3: eliminar la cuenta con tienda)
--        tienda_cerrada    (etapa 3)
--      Los dos últimos todavía no los escribe nadie.
--   3. Un índice parcial sobre los pedidos pendientes con vencimiento, para
--      que buscar los vencidos no recorra la tabla.
--   4. privado.cancelar_pedidos_vencidos(tienda opcional): cancela los pedidos
--      pendientes, SIN ningún pago, con vence_en ya pasado. Devuelve cuántos.
--      No hay tarea programada: la llama el servidor cuando el vendedor abre su
--      panel de pedidos. Un pedido con un pago en proceso (un ticket en efectivo
--      que se está acreditando) nunca se toca: ese lo resuelve MercadoPago por
--      el webhook.
--   5. public.rpc_cancelar_pedidos_vencidos: la función fina que llama el
--      servidor con .rpc(). Solo service_role puede ejecutarla.
--
-- Mis pedidos lee las dos columnas nuevas con la sesión de quien compró. Los
-- permisos de pedidos parecen ser de tabla (las columnas que se agregaron en la
-- 009 y la 021 se leen sin grants), pero acá se da select por columna a
-- authenticated igual: si ya lo tenía no cambia nada, y si fuera por columna
-- evita que se rompa la pantalla. La política de filas no cambia: cada persona
-- sigue viendo solo sus pedidos.
--
-- Sin backfill: los pedidos que ya existen quedan con vence_en en null.
-- ============================================================================
begin;

create schema if not exists privado;
grant usage on schema privado to service_role;

-- ---------------------------------------------------------------------------
-- 1 y 2. Columnas nuevas
-- ---------------------------------------------------------------------------
alter table public.pedidos
  add column if not exists vence_en timestamptz,
  add column if not exists cancelado_motivo text;

alter table public.pedidos drop constraint if exists pedidos_cancelado_motivo_valido;
alter table public.pedidos add constraint pedidos_cancelado_motivo_valido
  check (cancelado_motivo is null
         or cancelado_motivo in ('pago_vencido', 'cuenta_eliminada', 'tienda_cerrada'));

grant select (vence_en, cancelado_motivo) on public.pedidos to authenticated;

-- ---------------------------------------------------------------------------
-- 3. Índice parcial
-- ---------------------------------------------------------------------------
create index if not exists pedidos_pendientes_por_vencer
  on public.pedidos (vence_en)
  where estado = 'pendiente' and vence_en is not null;

-- ---------------------------------------------------------------------------
-- 4. Cancelar los vencidos
--
-- "Sin ningún pago" es lo mismo que mira la 016: mp_payment_id vacío, o el
-- texto "null" o "undefined". El UPDATE vuelve a mirar la fila antes de
-- escribirla: si el webhook le puso un pago justo antes, no se cancela.
-- ---------------------------------------------------------------------------
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
       and vence_en is not null
       and vence_en < now()
       and coalesce(btrim(mp_payment_id), '') in ('', 'null', 'undefined')
       and (p_vendedor_id is null or vendedor_id = p_vendedor_id)
    returning 1
  )
  select count(*)::integer into v_cancelados from c;

  return v_cancelados;
end;
$$;

-- ---------------------------------------------------------------------------
-- 5. Permisos, y la función que llama el servidor
-- ---------------------------------------------------------------------------
revoke all on function privado.cancelar_pedidos_vencidos(bigint) from public, anon, authenticated;
grant execute on function privado.cancelar_pedidos_vencidos(bigint) to service_role;

create or replace function public.rpc_cancelar_pedidos_vencidos(p_vendedor_id bigint default null)
returns integer
language sql
security invoker
as $$ select privado.cancelar_pedidos_vencidos(p_vendedor_id) $$;

revoke all on function public.rpc_cancelar_pedidos_vencidos(bigint) from public, anon, authenticated;
grant execute on function public.rpc_cancelar_pedidos_vencidos(bigint) to service_role;

commit;

-- ============================================================================
-- Verificación (una sola fila; copiá la celda)
-- Los permisos tienen que dar: anon y authenticated false, service_role true.
-- ============================================================================
select jsonb_pretty(jsonb_build_object(
  'columnas', (select jsonb_agg(column_name order by column_name) from information_schema.columns
                where table_schema = 'public' and table_name = 'pedidos'
                  and column_name in ('vence_en', 'cancelado_motivo')),
  'constraint', exists (select 1 from pg_constraint where conname = 'pedidos_cancelado_motivo_valido'),
  'indice', exists (select 1 from pg_indexes where indexname = 'pedidos_pendientes_por_vencer'),
  'permisos_rpc', jsonb_build_object(
      'anon',          has_function_privilege('anon',          'public.rpc_cancelar_pedidos_vencidos(bigint)', 'execute'),
      'authenticated', has_function_privilege('authenticated', 'public.rpc_cancelar_pedidos_vencidos(bigint)', 'execute'),
      'service_role',  has_function_privilege('service_role',  'public.rpc_cancelar_pedidos_vencidos(bigint)', 'execute')),
  'permisos_privado', jsonb_build_object(
      'anon',          has_function_privilege('anon',          'privado.cancelar_pedidos_vencidos(bigint)', 'execute'),
      'authenticated', has_function_privilege('authenticated', 'privado.cancelar_pedidos_vencidos(bigint)', 'execute'),
      'service_role',  has_function_privilege('service_role',  'privado.cancelar_pedidos_vencidos(bigint)', 'execute')),
  'authenticated_lee_columnas_nuevas', jsonb_build_object(
      'vence_en',         has_column_privilege('authenticated', 'public.pedidos', 'vence_en', 'select'),
      'cancelado_motivo', has_column_privilege('authenticated', 'public.pedidos', 'cancelado_motivo', 'select')),
  'pendientes_sin_pago_sin_vencimiento', (select count(*) from public.pedidos
      where estado = 'pendiente' and vence_en is null
        and coalesce(btrim(mp_payment_id), '') in ('', 'null', 'undefined'))
)) as verificacion;

-- ============================================================================
-- Para deshacer (correr en transacción). Los pedidos que la función ya
-- canceló NO vuelven a pendiente: se cancelaron a propósito.
-- ============================================================================
-- begin;
-- drop function if exists public.rpc_cancelar_pedidos_vencidos(bigint);
-- drop function if exists privado.cancelar_pedidos_vencidos(bigint);
-- drop index if exists public.pedidos_pendientes_por_vencer;
-- alter table public.pedidos drop constraint if exists pedidos_cancelado_motivo_valido;
-- alter table public.pedidos drop column if exists cancelado_motivo;
-- alter table public.pedidos drop column if exists vence_en;
-- commit;
--
-- (No se borra el esquema privado ni el permiso de uso: los usan la 007 y la 016.)
