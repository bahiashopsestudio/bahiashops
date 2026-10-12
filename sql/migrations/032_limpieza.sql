-- ============================================================================
-- Bahía Shops · 032 · Limpieza: columnas sin uso y permisos de tabla (12/10/2026)
-- Correr entero en el SQL Editor de Supabase. Va en transacción: si algo
-- falla, no cambia nada. Se puede correr dos veces sin romper nada.
--
-- ANTES DE CORRERLA:
--   1. Correr el PASO 0 (abajo, comentado) y guardar el resultado: es la foto
--      de los permisos de hoy, para comparar después con la verificación.
--   2. Mirar la segunda consulta del PASO 0 (políticas y disparadores que
--      tocan tablas que pierden permisos). Si devuelve alguna fila, avisar
--      antes de correr: es lo que rompería páginas (ver "Por qué el PASO 0").
--   3. Publicar PRIMERO el código que acompaña a esta migración: el formulario
--      de contacto y el de gastronomía ahora guardan por el servidor
--      (/api/contacto y /api/leads). Con esta migración corrida y el código
--      viejo publicado, esos dos formularios fallarían (el navegador ya no
--      puede insertar en mensajes_contacto ni en leads_gastronomia). El código
--      nuevo anda con o sin la migración.
--
-- Qué deja hecho:
--
-- A. h8 · Lo que quedó sin uso de la 018 (entrecalles en la ficha pública:
--    se decidió no mostrarlas, "con el círculo y el barrio alcanza")
--      · el disparador redondear_zona y privado.vendedores_redondear_zona: la
--        ruta POST /api/vendedor/ubicacion ya redondea el punto y deja la
--        dirección vacía cuando no se muestra, y es la única que escribe esas
--        columnas (el navegador no tiene permiso desde la 018);
--      · la restricción vendedores_zona_largo;
--      · las columnas zona_calle, zona_entre, zona_y y recibe_publico (la
--        reemplazó direccion_visible en la 018). Sus permisos por columna se
--        van con ellas.
--
-- B. h7 · Permisos de tabla: cada tabla queda con lo que el sitio usa, nada
--    más. REVOKE ALL a anon y authenticated (también los permisos por columna)
--    y después los GRANT de la lista. Las políticas RLS no se tocan: deciden
--    las FILAS; esto decide qué OPERACIONES existen para cada rol.
--      · NO se tocan vendedores, usuarios, envio_zona_fallas ni
--        votos_funciones: ya se cerraron antes (007/018/030, 010, 019).
--      · Una tabla de la lista que no exista se saltea (queda en el aviso).
--      · Una tabla que no está en la lista no se toca: la verificación la
--        muestra para decidir aparte.
--
--    Catálogo (lectura pública, el navegador no escribe):
--      barrios, categorias, localidades, subcategorias, sellos,
--      colecciones, coleccion_productos, tesoros         anon y auth: SELECT
--    Lo de la tienda (RLS decide de quién es cada fila):
--      productos, producto_media, producto_variantes,
--      producto_sellos, vendedor_sellos                    anon: SELECT
--                                                          auth: SELECT, INSERT, UPDATE, DELETE
--    De cada persona:
--      favoritos                                           auth: SELECT, INSERT, DELETE
--      direcciones                                         auth: SELECT, INSERT, UPDATE, DELETE
--      pedidos, pedido_items                               auth: SELECT (escribe el servidor)
--    Solo el servidor (service_role, que no se toca):
--      mercadopago_cuentas, vendedor_bloqueos, ideas_admin, pagos_dobles,
--      mensajes_contacto, leads_gastronomia                nada
--
-- C. barrios_csv: no la usa nada del código ni de las migraciones. Se borra
--    si en la base tampoco depende nada de ella (clave foránea o vista que la
--    apunte); si algo depende, se deja sin permisos y queda un aviso.
--
-- Por qué el PASO 0: una política de una tabla puede consultar OTRA tabla
-- con el rol de quien lee (ya pasó en la 010: "Admin ve todos los productos"
-- consulta usuarios, y sin SELECT sobre usuarios el catálogo entero le daba
-- error a quien navega sin sesión). Lo mismo con un disparador que no sea
-- SECURITY DEFINER y escriba en otra tabla. Las políticas de la base no están
-- todas en el repo: la segunda consulta busca justo esos casos.
-- ============================================================================

-- ============================================================================
-- PASO 0 (correr ANTES, aparte; no cambia nada)
-- ============================================================================
-- 0a. Los permisos de hoy (la consulta de auditoría):
--
-- select t.tablename,
--   (select array_agg(distinct p.privilege_type order by p.privilege_type)
--      from information_schema.role_table_grants p
--     where p.table_schema = 'public' and p.table_name = t.tablename and p.grantee = 'anon') as permisos_anon,
--   (select array_agg(distinct p2.privilege_type order by p2.privilege_type)
--      from information_schema.role_table_grants p2
--     where p2.table_schema = 'public' and p2.table_name = t.tablename and p2.grantee = 'authenticated') as permisos_auth,
--   (select count(*) from pg_policies pol where pol.tablename = t.tablename and pol.schemaname = 'public') as cant_policies
-- from pg_tables t
-- where t.schemaname = 'public'
-- order by t.tablename;
--
-- 0b. Lo que se rompería: políticas que leen una tabla que pierde el SELECT
--     de anon o de authenticated, y disparadores sin SECURITY DEFINER en
--     tablas que escribe el navegador. Tiene que dar 0 filas (o avisar).
--
-- select 'politica' as que, p.tablename as en_tabla, p.policyname as nombre, p.roles::text as roles,
--        coalesce(p.qual, '') || ' ' || coalesce(p.with_check, '') as texto
--   from pg_policies p
--  where p.schemaname = 'public'
--    and (coalesce(p.qual, '') || ' ' || coalesce(p.with_check, ''))
--        ~ '\m(pedidos|pedido_items|direcciones|favoritos|mercadopago_cuentas|vendedor_bloqueos|ideas_admin|pagos_dobles|mensajes_contacto|leads_gastronomia|barrios_csv)\M'
--    and p.tablename <> all (array['pedidos','pedido_items','direcciones','favoritos'])
-- union all
-- select 'disparador', c.relname, t.tgname, '', pr.proname
--   from pg_trigger t
--   join pg_class c on c.oid = t.tgrelid
--   join pg_namespace n on n.oid = c.relnamespace
--   join pg_proc pr on pr.oid = t.tgfoid
--  where n.nspname = 'public' and not t.tgisinternal and not pr.prosecdef
--    and c.relname in ('productos','producto_media','producto_variantes','producto_sellos',
--                      'vendedor_sellos','favoritos','direcciones','vendedores')
--    and t.tgname not in ('trg_vendedores_vuelta_a_revision', 'vendedores_proteger_pausa', 'redondear_zona');
-- ============================================================================

begin;

-- ---------------------------------------------------------------------------
-- A. h8: zona_* y recibe_publico
-- ---------------------------------------------------------------------------
drop trigger if exists redondear_zona on public.vendedores;
drop function if exists privado.vendedores_redondear_zona();
alter table public.vendedores drop constraint if exists vendedores_zona_largo;
alter table public.vendedores
  drop column if exists zona_calle,
  drop column if exists zona_entre,
  drop column if exists zona_y,
  drop column if exists recibe_publico;

-- ---------------------------------------------------------------------------
-- B. h7: permisos de tabla
-- ---------------------------------------------------------------------------
do $$
declare
  r record;
begin
  for r in
    select * from (values
      -- tabla                  anon        authenticated
      ('barrios',               'select',   'select'),
      ('categorias',            'select',   'select'),
      ('localidades',           'select',   'select'),
      ('subcategorias',         'select',   'select'),
      ('sellos',                'select',   'select'),
      ('colecciones',           'select',   'select'),
      ('coleccion_productos',   'select',   'select'),
      ('tesoros',               'select',   'select'),
      ('productos',             'select',   'select, insert, update, delete'),
      ('producto_media',        'select',   'select, insert, update, delete'),
      ('producto_variantes',    'select',   'select, insert, update, delete'),
      ('producto_sellos',       'select',   'select, insert, update, delete'),
      ('vendedor_sellos',       'select',   'select, insert, update, delete'),
      ('favoritos',             '',         'select, insert, delete'),
      ('direcciones',           '',         'select, insert, update, delete'),
      ('pedidos',               '',         'select'),
      ('pedido_items',          '',         'select'),
      ('mercadopago_cuentas',   '',         ''),
      ('vendedor_bloqueos',     '',         ''),
      ('ideas_admin',           '',         ''),
      ('pagos_dobles',          '',         ''),
      ('mensajes_contacto',     '',         ''),
      ('leads_gastronomia',     '',         '')
    ) as t(tabla, anon, auth)
  loop
    if to_regclass('public.' || r.tabla) is null then
      raise notice '032: la tabla % no existe, se saltea.', r.tabla;
      continue;
    end if;
    execute format('revoke all on table public.%I from anon, authenticated', r.tabla);
    if r.anon <> '' then
      execute format('grant %s on table public.%I to anon', r.anon, r.tabla);
    end if;
    if r.auth <> '' then
      execute format('grant %s on table public.%I to authenticated', r.auth, r.tabla);
    end if;
  end loop;
end
$$;

-- ---------------------------------------------------------------------------
-- C. barrios_csv
-- ---------------------------------------------------------------------------
do $$
declare
  v_tabla regclass := to_regclass('public.barrios_csv');
  v_dependencias int;
begin
  if v_tabla is null then
    return;
  end if;

  -- Claves foráneas que la apuntan, y vistas que la leen.
  select (select count(*) from pg_constraint where confrelid = v_tabla)
       + (select count(*) from pg_depend d
            join pg_rewrite rw on rw.oid = d.objid
           where d.refobjid = v_tabla and rw.ev_class <> v_tabla)
    into v_dependencias;

  if v_dependencias = 0 then
    drop table public.barrios_csv;
  else
    revoke all on table public.barrios_csv from anon, authenticated;
    raise notice '032: barrios_csv tiene % dependencia(s): no se borra, queda sin permisos.', v_dependencias;
  end if;
end
$$;

commit;

-- ============================================================================
-- Verificación (correr después; dos resultados)
--
-- 1. Una fila: h8 y barrios_csv. Todo false (salvo que barrios_csv haya
--    quedado por tener dependencias: entonces true, sin permisos).
-- ============================================================================
select jsonb_pretty(jsonb_build_object(
  'columnas_zona_que_quedan', (select coalesce(jsonb_agg(column_name), '[]'::jsonb) from information_schema.columns
                                where table_schema = 'public' and table_name = 'vendedores'
                                  and column_name in ('zona_calle', 'zona_entre', 'zona_y', 'recibe_publico')),
  'disparador_redondear_zona', exists (select 1 from pg_trigger where tgname = 'redondear_zona'),
  'funcion_vendedores_redondear_zona', to_regprocedure('privado.vendedores_redondear_zona()') is not null,
  'restriccion_vendedores_zona_largo', exists (select 1 from pg_constraint where conname = 'vendedores_zona_largo'),
  'barrios_csv_existe', to_regclass('public.barrios_csv') is not null,
  'direccion_visible_sigue', exists (select 1 from information_schema.columns
                                      where table_schema = 'public' and table_name = 'vendedores'
                                        and column_name = 'direccion_visible')
)) as verificacion;

-- 2. La misma consulta de auditoría del PASO 0, para comparar antes y después.
select t.tablename,
  (select array_agg(distinct p.privilege_type order by p.privilege_type)
     from information_schema.role_table_grants p
    where p.table_schema = 'public' and p.table_name = t.tablename and p.grantee = 'anon') as permisos_anon,
  (select array_agg(distinct p2.privilege_type order by p2.privilege_type)
     from information_schema.role_table_grants p2
    where p2.table_schema = 'public' and p2.table_name = t.tablename and p2.grantee = 'authenticated') as permisos_auth,
  (select count(*) from pg_policies pol where pol.tablename = t.tablename and pol.schemaname = 'public') as cant_policies
from pg_tables t
where t.schemaname = 'public'
order by t.tablename;

-- ============================================================================
-- Para deshacer los permisos (correr en transacción): volver a dar lo que
-- tenía cada tabla según el resultado del PASO 0a. Lo de h8 no se deshace solo:
-- las columnas zona_* y recibe_publico no tenían datos en uso; para volver a
-- tenerlas, correr de nuevo las secciones 1 y 3 de la 018. barrios_csv, si se
-- borró, no vuelve.
--
-- Ejemplo para una tabla (lo que tenían casi todas antes, según la 027):
-- begin;
-- grant select, insert, update, delete on table public.<tabla> to authenticated;
-- grant select on table public.<tabla> to anon;
-- commit;
-- ============================================================================
