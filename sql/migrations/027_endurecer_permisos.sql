begin;

do $$
declare
  t record;
begin
  for t in
    select c.oid::regclass as tabla, c.relname as nombre
      from pg_class c
      join pg_namespace n on n.oid = c.relnamespace
     where n.nspname = 'public'
       and c.relkind in ('r', 'p')
  loop
    execute format('revoke truncate, references, trigger on table %s from anon, authenticated', t.tabla);
    execute format('revoke update, delete on table %s from anon', t.tabla);
    if t.nombre <> 'mensajes_contacto' then
      execute format('revoke insert on table %s from anon', t.tabla);
    end if;
  end loop;
end
$$;

alter default privileges in schema public revoke truncate, references, trigger on tables from anon, authenticated;
alter default privileges in schema public revoke insert, update, delete on tables from anon;

commit;

select jsonb_pretty(jsonb_build_object(
  'tablas_con_truncate_references_o_trigger_para_anon_o_authenticated', (
    select coalesce(jsonb_agg(c.relname order by c.relname), '[]'::jsonb)
      from pg_class c
      join pg_namespace n on n.oid = c.relnamespace
     where n.nspname = 'public' and c.relkind in ('r', 'p')
       and (has_table_privilege('anon', c.oid, 'TRUNCATE, REFERENCES, TRIGGER') or has_table_privilege('authenticated', c.oid, 'TRUNCATE, REFERENCES, TRIGGER'))
  ),
  'tablas_donde_anon_todavia_escribe', (
    select coalesce(jsonb_object_agg(x.relname, x.permisos), '{}'::jsonb)
      from (
        select c.relname,
               array_remove(array[
                 case when has_any_column_privilege('anon', c.oid, 'INSERT') then 'INSERT' end,
                 case when has_any_column_privilege('anon', c.oid, 'UPDATE') then 'UPDATE' end,
                 case when has_table_privilege('anon', c.oid, 'DELETE') then 'DELETE' end
               ], null) as permisos
          from pg_class c
          join pg_namespace n on n.oid = c.relnamespace
         where n.nspname = 'public' and c.relkind in ('r', 'p')
      ) x
     where cardinality(x.permisos) > 0
  ),
  'authenticated_conserva_escritura', (
    select coalesce(jsonb_object_agg(c.relname, jsonb_build_object(
             'insert', has_any_column_privilege('authenticated', c.oid, 'INSERT'),
             'update', has_any_column_privilege('authenticated', c.oid, 'UPDATE'),
             'delete', has_table_privilege('authenticated', c.oid, 'DELETE'))), '{}'::jsonb)
      from pg_class c
      join pg_namespace n on n.oid = c.relnamespace
     where n.nspname = 'public' and c.relkind in ('r', 'p')
       and c.relname in ('productos', 'producto_media', 'producto_variantes', 'producto_sellos', 'vendedores', 'vendedor_sellos',
                         'direcciones', 'favoritos', 'mensajes_contacto', 'leads_gastronomia')
  ),
  'privilegios_por_defecto_para_tablas_nuevas', (
    select coalesce(jsonb_agg(d.defaclacl::text), '[]'::jsonb)
      from pg_default_acl d
      join pg_namespace n on n.oid = d.defaclnamespace
     where n.nspname = 'public' and d.defaclobjtype = 'r'
  )
)) as verificacion;
