begin;

drop function if exists public.rpc_cancelar_pedidos_de_tienda(bigint, text, text);
drop function if exists privado.cancelar_pedidos_de_tienda(bigint, text, text);

alter table public.pedidos drop constraint if exists pedidos_link_de_pago_valido;
alter table public.pedidos drop column if exists link_de_pago;

commit;

select jsonb_pretty(jsonb_build_object(
  'funciones_de_tienda_eliminadas', not exists (select 1 from pg_proc where proname = 'cancelar_pedidos_de_tienda')
                                    and not exists (select 1 from pg_proc where proname = 'rpc_cancelar_pedidos_de_tienda'),
  'columna_link_de_pago_eliminada', not exists (select 1 from information_schema.columns
      where table_schema = 'public' and table_name = 'pedidos' and column_name = 'link_de_pago'),
  'constraint_link_de_pago_eliminada', not exists (select 1 from pg_constraint where conname = 'pedidos_link_de_pago_valido'),
  'motivos_validos', (select pg_get_constraintdef(oid) from pg_constraint where conname = 'pedidos_cancelado_motivo_valido'),
  'funciones_de_vencidos_siguen', exists (select 1 from pg_proc where proname = 'cancelar_pedidos_vencidos')
                                  and exists (select 1 from pg_proc where proname = 'rpc_cancelar_pedidos_vencidos'),
  'columnas_pedidos_que_siguen', (select jsonb_agg(column_name order by column_name) from information_schema.columns
      where table_schema = 'public' and table_name = 'pedidos'
        and column_name in ('vence_en', 'cancelado_motivo', 'mp_user_id_cobro', 'mp_preference_id', 'efectivo_vence_en'))
)) as verificacion;
