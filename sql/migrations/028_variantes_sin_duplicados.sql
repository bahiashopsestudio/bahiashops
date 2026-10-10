begin;

drop policy if exists "Vendedor lee variantes de sus productos" on public.producto_variantes;
create policy "Vendedor lee variantes de sus productos" on public.producto_variantes
for select using (
  producto_id in (
    select p.id from public.productos p
    join public.vendedores v on p.vendedor_id = v.id
    where v.usuario_id = auth.uid()
  )
);

delete from public.producto_variantes a
 using public.producto_variantes b
 where a.producto_id = b.producto_id
   and a.propiedad_1_valor = b.propiedad_1_valor
   and a.propiedad_2_valor is not distinct from b.propiedad_2_valor
   and a.id > b.id;

alter table public.producto_variantes drop constraint if exists producto_variantes_sin_repetir;
alter table public.producto_variantes
  add constraint producto_variantes_sin_repetir
  unique nulls not distinct (producto_id, propiedad_1_valor, propiedad_2_valor);

commit;

select jsonb_pretty(jsonb_build_object(
  'version_postgres', current_setting('server_version'),
  'policy_lectura_vendedor', exists (select 1 from pg_policies
      where tablename = 'producto_variantes' and policyname = 'Vendedor lee variantes de sus productos' and cmd = 'SELECT'),
  'policy_lectura_publica_sigue', exists (select 1 from pg_policies
      where tablename = 'producto_variantes' and policyname = 'Lectura pública variantes'),
  'constraint_sin_repetir', (select pg_get_constraintdef(oid) from pg_constraint where conname = 'producto_variantes_sin_repetir'),
  'talles_repetidos_que_quedan', (select count(*) from (
      select 1 from public.producto_variantes
       group by producto_id, propiedad_1_valor, propiedad_2_valor having count(*) > 1) x)
)) as verificacion;
