begin;

create schema if not exists privado;
grant usage on schema privado to service_role;

alter table public.pedidos
  add column if not exists efectivo_vence_en timestamptz;

grant select (efectivo_vence_en) on public.pedidos to authenticated;

create index if not exists pedidos_efectivo_por_vencer
  on public.pedidos (efectivo_vence_en)
  where estado = 'pendiente' and efectivo_vence_en is not null;

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
       and (p_vendedor_id is null or vendedor_id = p_vendedor_id)
       and (
         (efectivo_vence_en is not null and efectivo_vence_en + interval '6 hours' < now())
         or (
           efectivo_vence_en is null
           and vence_en is not null
           and vence_en < now()
           and coalesce(btrim(mp_payment_id), '') in ('', 'null', 'undefined')
         )
       )
    returning 1
  )
  select count(*)::integer into v_cancelados from c;

  return v_cancelados;
end;
$$;

revoke all on function privado.cancelar_pedidos_vencidos(bigint) from public, anon, authenticated;
grant execute on function privado.cancelar_pedidos_vencidos(bigint) to service_role;

create or replace function public.rpc_cancelar_pedidos_vencidos(p_vendedor_id bigint default null)
returns integer
language sql
security invoker
as $$ select privado.cancelar_pedidos_vencidos(p_vendedor_id) $$;

revoke all on function public.rpc_cancelar_pedidos_vencidos(bigint) from public, anon, authenticated;
grant execute on function public.rpc_cancelar_pedidos_vencidos(bigint) to service_role;

create table if not exists public.pagos_dobles (
  pedido_id bigint not null references public.pedidos (id) on delete cascade,
  pago_id text not null,
  detectado_en timestamptz not null default now(),
  primary key (pedido_id, pago_id)
);

alter table public.pagos_dobles enable row level security;

revoke all on table public.pagos_dobles from public, anon, authenticated;
grant select, insert on table public.pagos_dobles to service_role;

commit;

select jsonb_pretty(jsonb_build_object(
  'columna_efectivo_vence_en', exists (select 1 from information_schema.columns
      where table_schema = 'public' and table_name = 'pedidos' and column_name = 'efectivo_vence_en'),
  'authenticated_lee_efectivo_vence_en', has_column_privilege('authenticated', 'public.pedidos', 'efectivo_vence_en', 'select'),
  'anon_lee_efectivo_vence_en', has_column_privilege('anon', 'public.pedidos', 'efectivo_vence_en', 'select'),
  'indice', exists (select 1 from pg_indexes where indexname = 'pedidos_efectivo_por_vencer'),
  'funciones_de_tienda_siguen', exists (select 1 from pg_proc where proname = 'cancelar_pedidos_de_tienda')
                                and exists (select 1 from pg_proc where proname = 'rpc_cancelar_pedidos_de_tienda'),
  'motivos_validos', (select pg_get_constraintdef(oid) from pg_constraint where conname = 'pedidos_cancelado_motivo_valido'),
  'permisos_rpc_vencidos', jsonb_build_object(
      'anon',          has_function_privilege('anon',          'public.rpc_cancelar_pedidos_vencidos(bigint)', 'execute'),
      'authenticated', has_function_privilege('authenticated', 'public.rpc_cancelar_pedidos_vencidos(bigint)', 'execute'),
      'service_role',  has_function_privilege('service_role',  'public.rpc_cancelar_pedidos_vencidos(bigint)', 'execute')),
  'permisos_privado_vencidos', jsonb_build_object(
      'anon',          has_function_privilege('anon',          'privado.cancelar_pedidos_vencidos(bigint)', 'execute'),
      'authenticated', has_function_privilege('authenticated', 'privado.cancelar_pedidos_vencidos(bigint)', 'execute'),
      'service_role',  has_function_privilege('service_role',  'privado.cancelar_pedidos_vencidos(bigint)', 'execute')),
  'pagos_dobles', jsonb_build_object(
      'existe', to_regclass('public.pagos_dobles') is not null,
      'rls', (select relrowsecurity from pg_class where oid = 'public.pagos_dobles'::regclass),
      'anon', (select jsonb_object_agg(p, has_table_privilege('anon', 'public.pagos_dobles', p))
                 from unnest(array['SELECT', 'INSERT', 'UPDATE', 'DELETE', 'TRUNCATE']) as p),
      'authenticated', (select jsonb_object_agg(p, has_table_privilege('authenticated', 'public.pagos_dobles', p))
                 from unnest(array['SELECT', 'INSERT', 'UPDATE', 'DELETE', 'TRUNCATE']) as p),
      'service_role_select_insert', has_table_privilege('service_role', 'public.pagos_dobles', 'SELECT')
                                    and has_table_privilege('service_role', 'public.pagos_dobles', 'INSERT'))
)) as verificacion;
