-- ============================================================================
-- Bahía Shops · 034 · Lo nuevo nace cerrado: permisos por defecto (16/10/2026)
-- Correr entero en el SQL Editor de Supabase. Va en transacción: si algo
-- falla, no cambia nada. Se puede correr dos veces sin romper nada.
--
-- CORRERLA DESPUÉS DE LA 033 (la verificación compara contra la matriz que
-- deja la 033). No depende del código: no cambia ningún permiso que use el
-- sitio hoy. Se puede publicar código antes o después.
--
-- Por qué (hallazgo 6 de la baja de un emprendimiento): en Supabase, toda
-- tabla, función o secuencia que crea postgres (el SQL Editor, el panel de
-- tablas) nace con permisos para anon y authenticated. La 027 sacó TRUNCATE,
-- REFERENCES y TRIGGER, y la escritura de anon, pero una tabla nueva igual
-- nacía con SELECT para anon y con INSERT, UPDATE, DELETE y MAINTAIN para
-- authenticated: abierta hasta que alguien se acordara de cerrarla.
--
-- Qué deja hecho:
--   1. Permisos por defecto de postgres: las tablas, secuencias y funciones
--      NUEVAS de public nacen sin nada para anon y authenticated (service_role
--      sigue teniendo todo), y las funciones nuevas de CUALQUIER esquema
--      nacen sin EXECUTE para PUBLIC. No cambia nada de lo que ya existe.
--      Lo que crea supabase_admin (las extensiones) no se puede cambiar desde
--      acá y no se toca.
--   2. MAINTAIN (Postgres 17: VACUUM, ANALYZE, REINDEX, LOCK TABLE): se le
--      saca a anon y authenticated en todas las tablas de public. Hoy lo
--      tienen usuarios y vendedores (las demás lo perdieron con la 032). La
--      API no lo usa.
--   3. spatial_ref_sys (PostGIS): hoy NO está en public (consulta 5 del
--      relevamiento). Si apareciera, se le sacan los permisos a anon y
--      authenticated; si el REVOKE falla (es de supabase_admin), queda un
--      aviso y la migración sigue.
--
-- CONVENCIÓN DESDE ESTA MIGRACIÓN (para las próximas):
--   · Tabla nueva: enable row level security, y un bloque "Permisos" con los
--     GRANT explícitos, en los grupos de la 032 (catálogo / de la tienda / de
--     cada persona / solo el servidor). service_role ya los tiene. Si el
--     navegador inserta en una columna serial: grant usage on sequence.
--     Agregarla a la matriz de la verificación de abajo (y de probar-034).
--   · Función nueva: revoke all ... from public, anon, authenticated y el
--     grant execute a quien la use (como desde la 016). Una función que llama
--     el navegador (.rpc) necesita su grant a authenticated (o anon).
--   · Columna nueva: nace con los permisos de tabla que tenga su tabla; en
--     vendedores y usuarios (permisos por columna) nace invisible: darle su
--     grant select (columna) si la leen las páginas (ver el incidente de
--     cerrada_en, 5a18850).
--   · Si algo nuevo da 42501 (permission denied), falta su GRANT: ahora los
--     errores de Supabase se loguean en Vercel.
-- ============================================================================

-- ============================================================================
-- PASO 0 (correr ANTES, aparte; no cambia nada)
-- ============================================================================
-- 0a. Dónde está spatial_ref_sys y de quién es (hoy no está en public):
--
-- select n.nspname, c.relname, pg_get_userbyid(c.relowner) as dueno
--   from pg_class c join pg_namespace n on n.oid = c.relnamespace
--  where c.relname = 'spatial_ref_sys';
--
-- 0b. Si 0a la muestra en public, probar el REVOKE solo (si falla por dueño,
--     no hace falta hacer nada: la sección 3 lo saltea):
--
-- revoke all on table public.spatial_ref_sys from anon, authenticated;
--
-- 0c. Los permisos por defecto de hoy (consulta 10 del relevamiento):
--
-- select pg_get_userbyid(d.defaclrole) as para_objetos_de, coalesce(n.nspname, '(todos)') as esquema,
--        d.defaclobjtype as tipo, d.defaclacl::text as permisos
--   from pg_default_acl d left join pg_namespace n on n.oid = d.defaclnamespace order by 1, 2, 3;
-- ============================================================================

begin;

-- ---------------------------------------------------------------------------
-- 1. Lo nuevo nace cerrado
-- ---------------------------------------------------------------------------
alter default privileges for role postgres in schema public revoke all on tables from anon, authenticated;
alter default privileges for role postgres in schema public revoke all on sequences from anon, authenticated;
alter default privileges for role postgres in schema public revoke all on functions from anon, authenticated;
alter default privileges for role postgres revoke execute on functions from public;

-- ---------------------------------------------------------------------------
-- 2. MAINTAIN
-- ---------------------------------------------------------------------------
do $$
declare
  t record;
begin
  if current_setting('server_version_num')::int < 170000 then
    return;
  end if;
  for t in
    select c.oid::regclass as tabla
      from pg_class c
     where c.relnamespace = 'public'::regnamespace and c.relkind in ('r', 'p')
       and pg_get_userbyid(c.relowner) = current_user
  loop
    execute format('revoke maintain on table %s from anon, authenticated', t.tabla);
  end loop;
end
$$;

-- ---------------------------------------------------------------------------
-- 3. spatial_ref_sys (si existiera en public)
-- ---------------------------------------------------------------------------
-- spatial_ref_sys: inicio
do $$
begin
  if to_regclass('public.spatial_ref_sys') is null then
    return;
  end if;
  begin
    revoke all on table public.spatial_ref_sys from anon, authenticated;
  exception when others then
    raise notice '034: no se pudo cerrar spatial_ref_sys (%): queda como está.', sqlerrm;
  end;
end
$$;
-- spatial_ref_sys: fin

commit;

-- ============================================================================
-- Verificación (una sola fila; copiá la celda)
--   · por_defecto_public: anon y authenticated ya no aparecen en las filas de
--     postgres para tablas (r), secuencias (S) y funciones (f).
--   · funciones_publicas_por_defecto: true = las funciones nuevas nacen sin
--     EXECUTE para PUBLIC.
--   · con_maintain: [] (ninguna tabla de public con MAINTAIN para anon o
--     authenticated).
--   · diferencias_con_la_matriz: {} . Si aparece una tabla, tiene permisos
--     distintos de los que debería (o es nueva y no está en la matriz: darle
--     sus GRANT y sumarla acá).
-- ============================================================================
select jsonb_pretty(jsonb_build_object(
  'por_defecto_public', (select coalesce(jsonb_object_agg(d.defaclobjtype, d.defaclacl::text), '{}'::jsonb)
                           from pg_default_acl d
                          where d.defaclrole = 'postgres'::regrole and d.defaclnamespace = 'public'::regnamespace),
  'funciones_publicas_por_defecto', exists (select 1 from pg_default_acl d
                          where d.defaclrole = 'postgres'::regrole and d.defaclnamespace = 0 and d.defaclobjtype = 'f'
                            and not exists (select 1 from aclexplode(d.defaclacl) a where a.grantee = 0)),
  'con_maintain', (select coalesce(jsonb_agg(c.relname order by c.relname), '[]'::jsonb)
                     from pg_class c
                    where c.relnamespace = 'public'::regnamespace and c.relkind in ('r', 'p')
                      and exists (select 1 from aclexplode(c.relacl) a
                                   where a.grantee in ('anon'::regrole, 'authenticated'::regrole) and a.privilege_type = 'MAINTAIN')),
  'diferencias_con_la_matriz', (
    with matriz(tabla, anon, auth) as (values
      ('barrios', 'SELECT', 'SELECT'), ('categorias', 'SELECT', 'SELECT'), ('localidades', 'SELECT', 'SELECT'),
      ('subcategorias', 'SELECT', 'SELECT'), ('sellos', 'SELECT', 'SELECT'), ('colecciones', 'SELECT', 'SELECT'),
      ('coleccion_productos', 'SELECT', 'SELECT'), ('tesoros', 'SELECT', 'SELECT'),
      ('productos', 'SELECT', 'SELECT'), ('producto_media', 'SELECT', 'SELECT'),
      ('producto_variantes', 'SELECT', 'SELECT'), ('producto_sellos', 'SELECT', 'SELECT'),
      ('vendedor_sellos', 'SELECT', 'DELETE,INSERT,SELECT'),
      ('favoritos', '', 'DELETE,INSERT,SELECT'), ('direcciones', '', 'DELETE,INSERT,SELECT,UPDATE'),
      ('pedidos', '', 'SELECT'), ('pedido_items', '', 'SELECT'),
      ('usuarios', 'SELECT', 'SELECT'), ('vendedores', '', ''),
      ('mercadopago_cuentas', '', ''), ('vendedor_bloqueos', '', ''), ('ideas_admin', '', ''), ('pagos_dobles', '', ''),
      ('mensajes_contacto', '', ''), ('leads_gastronomia', '', ''), ('envio_zona_fallas', '', ''), ('votos_funciones', '', '')
    ),
    hoy as (
      select c.relname as tabla,
             coalesce((select string_agg(a.privilege_type, ',' order by a.privilege_type) from aclexplode(c.relacl) a
                        where a.grantee = 'anon'::regrole), '') as anon,
             coalesce((select string_agg(a.privilege_type, ',' order by a.privilege_type) from aclexplode(c.relacl) a
                        where a.grantee = 'authenticated'::regrole), '') as auth
        from pg_class c
       where c.relnamespace = 'public'::regnamespace and c.relkind in ('r', 'p')
    )
    select coalesce(jsonb_object_agg(h.tabla, jsonb_build_object(
             'anon', h.anon, 'authenticated', h.auth,
             'deberia', coalesce(m.anon || ' / ' || m.auth, 'no está en la matriz'))), '{}'::jsonb)
      from hoy h left join matriz m on m.tabla = h.tabla
     where m.tabla is null or h.anon <> m.anon or h.auth <> m.auth
  )
)) as verificacion;

-- ============================================================================
-- Para deshacer (correr en transacción): vuelven los permisos por defecto de
-- Supabase para lo que se cree después. Lo que ya existe no cambia. MAINTAIN
-- no se devuelve (no lo usa nada).
-- ============================================================================
-- begin;
-- alter default privileges for role postgres in schema public grant select on tables to anon;
-- alter default privileges for role postgres in schema public grant select, insert, update, delete on tables to authenticated;
-- alter default privileges for role postgres in schema public grant all on sequences to anon, authenticated;
-- alter default privileges for role postgres in schema public grant all on functions to anon, authenticated;
-- alter default privileges for role postgres grant execute on functions to public;
-- commit;
-- ============================================================================
