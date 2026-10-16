-- ============================================================================
-- Bahía Shops · 033 · Productos: el guardado, el estado y la moderación pasan
-- al servidor (16/10/2026)
-- Correr entero en el SQL Editor de Supabase. Va en transacción: si algo
-- falla, no cambia nada. Se puede correr dos veces sin romper nada.
--
-- CORRERLA DESPUÉS DE PUBLICAR EL CÓDIGO QUE LA ACOMPAÑA. El código nuevo
-- guarda, pausa, borra y modera los productos por el servidor
-- (/api/vendedor/productos y /api/admin/productos/[id]/moderacion, con
-- service_role). Con esta migración corrida y el código viejo publicado, el
-- alta, la edición, la pausa, el borrado de productos y la moderación del
-- admin fallarían (el navegador ya no puede escribir en productos ni en sus
-- fotos, variantes y sellos). El código nuevo anda con o sin la migración: si
-- la función de guardado (4) todavía no existe, guarda paso a paso como antes,
-- sin transacción y sin marcar "revisión posterior" (el paso 1 recupera esas
-- marcas).
--
-- Por qué (hallazgo de seguridad 5 de la baja de un emprendimiento): con
-- INSERT y UPDATE de tabla, un vendedor podía, desde la consola del
-- navegador, publicar un producto sin moderación (estado = 'activo'),
-- marcarse destacado, borrar los avisos de moderación, cambiar el texto o las
-- fotos de un producto aprobado o adelantar creado_en para quedar primero en
-- "Recientes". La moderación (revisarPublicacion) corría solo en el navegador.
--
-- Qué deja hecho:
--   1. productos.revision_posterior_desde: un producto ya aprobado (activo,
--      pausado o agotado) que se editó con avisos de moderación ambiguos.
--      Sigue publicado; la fecha dice desde cuándo espera una mirada del
--      admin. NULL = nada pendiente. Los avisos están en moderacion_avisos.
--      Al crearla, marca los productos aprobados que ya tengan avisos (los
--      que se editaron entre el código nuevo y esta migración).
--   2. estado nace en 'en_revision' (era 'activo'). Hoy solo inserta el
--      servidor, que lo manda igual; es por si algo inserta sin mandarlo.
--   3. privado.guardar_producto: el alta o la edición entera en una sola
--      transacción (producto, fotos, variantes y sellos). Decide el estado:
--        alta                                   -> en_revision
--        edición de en_revision o rechazado     -> en_revision
--        edición de activo, pausado o agotado   -> mantiene el estado; con
--          avisos queda marcado (1), limpio se desmarca.
--      La moderación (bloqueos y avisos) la corre el servidor antes de
--      llamarla: un bloqueo no llega acá.
--   4. public.rpc_guardar_producto: la que llama el servidor. Solo
--      service_role (como las rpc_* de la 016, 022, 024 y 031).
--   5. Permisos: productos, producto_media, producto_variantes y
--      producto_sellos quedan con SELECT para anon y authenticated, nada más.
--      vendedor_sellos (sellos autodeclarados de la tienda, que se siguen
--      eligiendo desde el navegador): SELECT para anon; SELECT, INSERT y
--      DELETE para authenticated (nadie hace UPDATE).
--
-- Lo que NO hace: no toca las políticas RLS (las de escritura quedan sin uso;
-- las de lectura siguen igual, y las de producto_media, producto_variantes y
-- producto_sellos siguen leyendo productos y vendedores con el rol de quien
-- consulta: ese SELECT no se toca). No toca Storage: las políticas del bucket
-- productos del repo (001) ya limitan subir, editar y borrar a la carpeta
-- propia (ver la consulta del PASO 0c). No toca las funciones de la 031
-- (borrar la tienda y la cuenta): son SECURITY DEFINER y no dependen de estos
-- permisos.
-- ============================================================================

-- ============================================================================
-- PASO 0 (correr ANTES, aparte; no cambia nada)
-- ============================================================================
-- 0a. Políticas y disparadores que se romperían: tiene que dar 0 filas.
--     (Disparadores sin SECURITY DEFINER en las tablas de productos.)
--
-- select c.relname, t.tgname, pr.proname
--   from pg_trigger t
--   join pg_class c on c.oid = t.tgrelid
--   join pg_proc pr on pr.oid = t.tgfoid
--  where c.relnamespace = 'public'::regnamespace and not t.tgisinternal
--    and c.relname in ('productos', 'producto_media', 'producto_variantes', 'producto_sellos', 'vendedor_sellos');
--
-- 0b. Productos que el paso 1 marcaría para revisión posterior:
--
-- select id, nombre, estado, moderacion_avisos from public.productos
--  where estado in ('activo', 'pausado', 'agotado') and jsonb_typeof(moderacion_avisos) = 'array'
--    and jsonb_array_length(moderacion_avisos) > 0;
--
-- 0c. Políticas de Storage de los buckets del vendedor:
--
-- select policyname, cmd, roles::text, qual, with_check from pg_policies
--  where schemaname = 'storage' and tablename = 'objects' order by cmd, policyname;
-- ============================================================================

begin;

create schema if not exists privado;
grant usage on schema privado to service_role;

-- ---------------------------------------------------------------------------
-- 1. Revisión posterior
-- ---------------------------------------------------------------------------
do $$
begin
  if not exists (select 1 from information_schema.columns
                  where table_schema = 'public' and table_name = 'productos'
                    and column_name = 'revision_posterior_desde') then
    alter table public.productos add column revision_posterior_desde timestamptz;

    -- Solo al crearla: si se corre de nuevo no vuelve a marcar lo que el
    -- admin ya revisó.
    update public.productos
       set revision_posterior_desde = coalesce(actualizado_en, now())
     where estado in ('activo', 'pausado', 'agotado')
       and jsonb_typeof(moderacion_avisos) = 'array'
       and jsonb_array_length(moderacion_avisos) > 0;
  end if;
end
$$;

-- ---------------------------------------------------------------------------
-- 2. Un producto nace en revisión
-- ---------------------------------------------------------------------------
alter table public.productos alter column estado set default 'en_revision';

-- ---------------------------------------------------------------------------
-- 3. Guardar un producto entero
--
--   p_vendedor_id  la tienda de la sesión (la pone el servidor, nunca el
--                  navegador)
--   p_producto_id  NULL para el alta; el producto a editar, que tiene que ser
--                  de esa tienda (si no: error P0002)
--   p_datos        las columnas que elige el vendedor (las demás no se leen)
--   p_fotos        las URL, en orden; la primera es la principal
--   p_variantes    los valores de la propiedad 1 (si tiene_variantes)
--   p_sellos       los sellos elegidos (los que no existen se ignoran)
--   p_avisos       los avisos de moderación que encontró el servidor
--
-- Devuelve { id, estado, revision_posterior }.
-- ---------------------------------------------------------------------------
create or replace function privado.guardar_producto(
  p_vendedor_id integer,
  p_producto_id integer,
  p_datos jsonb,
  p_fotos text[],
  p_variantes text[],
  p_sellos integer[],
  p_avisos jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_id integer := p_producto_id;
  v_estado text;
  v_revision timestamptz;
  v_avisos jsonb := case when jsonb_typeof(p_avisos) = 'array' then p_avisos else '[]'::jsonb end;
  v_variantes boolean := coalesce((p_datos ->> 'tiene_variantes')::boolean, false);
  v_genero text[];
begin
  if p_vendedor_id is null or p_datos is null or coalesce(cardinality(p_fotos), 0) = 0 then
    raise exception 'Faltan datos del producto.' using errcode = '22023';
  end if;

  if jsonb_typeof(p_datos -> 'genero') = 'array' and jsonb_array_length(p_datos -> 'genero') > 0 then
    v_genero := array(select jsonb_array_elements_text(p_datos -> 'genero'));
  end if;

  if v_id is null then
    insert into public.productos (
      vendedor_id, nombre, descripcion, marca, precio, precio_anterior, tiempo_preparacion,
      categoria_id, subcategoria_id, subcategoria_personalizada,
      categoria_secundaria_id, subcategoria_secundaria_id, subcategoria_secundaria_personalizada,
      genero, tiene_variantes, propiedad_1_nombre,
      estado, moderacion_avisos, revision_posterior_desde
    ) values (
      p_vendedor_id, p_datos ->> 'nombre', p_datos ->> 'descripcion', p_datos ->> 'marca',
      (p_datos ->> 'precio')::numeric, (p_datos ->> 'precio_anterior')::numeric, p_datos ->> 'tiempo_preparacion',
      (p_datos ->> 'categoria_id')::integer, (p_datos ->> 'subcategoria_id')::integer, p_datos ->> 'subcategoria_personalizada',
      (p_datos ->> 'categoria_secundaria_id')::integer, (p_datos ->> 'subcategoria_secundaria_id')::integer,
      p_datos ->> 'subcategoria_secundaria_personalizada',
      v_genero, v_variantes, case when v_variantes then p_datos ->> 'propiedad_1_nombre' end,
      'en_revision', v_avisos, null
    )
    returning id, estado into v_id, v_estado;
  else
    -- FOR UPDATE: si el admin lo aprueba justo ahora, una de las dos espera.
    select estado, revision_posterior_desde into v_estado, v_revision
      from public.productos
     where id = v_id and vendedor_id = p_vendedor_id
       for update;
    if not found then
      raise exception 'No encontramos ese producto.' using errcode = 'P0002';
    end if;

    if v_estado in ('activo', 'pausado', 'agotado') then
      -- Ya aprobado: no se vuelve a moderar. Con avisos queda marcado desde la
      -- primera edición que los trajo; limpio, se desmarca (los avisos que
      -- motivaban la marca ya no están en el texto).
      v_revision := case when jsonb_array_length(v_avisos) > 0 then coalesce(v_revision, now()) end;
    else
      v_estado := 'en_revision';
      v_revision := null;
    end if;

    update public.productos set
      nombre = p_datos ->> 'nombre',
      descripcion = p_datos ->> 'descripcion',
      marca = p_datos ->> 'marca',
      precio = (p_datos ->> 'precio')::numeric,
      precio_anterior = (p_datos ->> 'precio_anterior')::numeric,
      tiempo_preparacion = p_datos ->> 'tiempo_preparacion',
      categoria_id = (p_datos ->> 'categoria_id')::integer,
      subcategoria_id = (p_datos ->> 'subcategoria_id')::integer,
      subcategoria_personalizada = p_datos ->> 'subcategoria_personalizada',
      categoria_secundaria_id = (p_datos ->> 'categoria_secundaria_id')::integer,
      subcategoria_secundaria_id = (p_datos ->> 'subcategoria_secundaria_id')::integer,
      subcategoria_secundaria_personalizada = p_datos ->> 'subcategoria_secundaria_personalizada',
      genero = v_genero,
      tiene_variantes = v_variantes,
      propiedad_1_nombre = case when v_variantes then p_datos ->> 'propiedad_1_nombre' end,
      estado = v_estado,
      moderacion_avisos = v_avisos,
      revision_posterior_desde = v_revision,
      actualizado_en = now()
    where id = v_id;
  end if;

  delete from public.producto_media where producto_id = v_id;
  insert into public.producto_media (producto_id, url, tipo, orden, es_principal)
  select v_id, f.url, 'foto', f.n - 1, f.n = 1
    from unnest(p_fotos) with ordinality as f(url, n);

  delete from public.producto_variantes where producto_id = v_id;
  if v_variantes then
    insert into public.producto_variantes (producto_id, propiedad_1_valor)
    select v_id, x.valor
      from (select distinct btrim(v) as valor from unnest(p_variantes) as v where btrim(v) <> '') x;
  end if;

  delete from public.producto_sellos where producto_id = v_id;
  insert into public.producto_sellos (producto_id, sello_id)
  select v_id, s.id from public.sellos s where s.id = any (coalesce(p_sellos, '{}'));

  return jsonb_build_object('id', v_id, 'estado', v_estado, 'revision_posterior', v_revision is not null);
end;
$$;

revoke all on function privado.guardar_producto(integer, integer, jsonb, text[], text[], integer[], jsonb)
  from public, anon, authenticated;
grant execute on function privado.guardar_producto(integer, integer, jsonb, text[], text[], integer[], jsonb)
  to service_role;

-- ---------------------------------------------------------------------------
-- 4. La que llama el servidor
-- ---------------------------------------------------------------------------
create or replace function public.rpc_guardar_producto(
  p_vendedor_id integer,
  p_producto_id integer,
  p_datos jsonb,
  p_fotos text[],
  p_variantes text[],
  p_sellos integer[],
  p_avisos jsonb
)
returns jsonb
language sql
security invoker
as $$ select privado.guardar_producto(p_vendedor_id, p_producto_id, p_datos, p_fotos, p_variantes, p_sellos, p_avisos) $$;

revoke all on function public.rpc_guardar_producto(integer, integer, jsonb, text[], text[], integer[], jsonb)
  from public, anon, authenticated;
grant execute on function public.rpc_guardar_producto(integer, integer, jsonb, text[], text[], integer[], jsonb)
  to service_role;

-- ---------------------------------------------------------------------------
-- 5. Permisos de tabla
--
-- REVOKE ALL de tabla también saca los permisos por columna. service_role no
-- se toca (lo que escribe el servidor).
-- ---------------------------------------------------------------------------
do $$
declare
  t text;
begin
  foreach t in array array['productos', 'producto_media', 'producto_variantes', 'producto_sellos', 'vendedor_sellos']
  loop
    execute format('revoke all on table public.%I from anon, authenticated', t);
    execute format('grant select on table public.%I to anon, authenticated', t);
  end loop;
end
$$;

grant insert, delete on table public.vendedor_sellos to authenticated;

-- Para que la API vea la función nueva sin esperar.
notify pgrst, 'reload schema';

commit;

-- ============================================================================
-- Verificación (una sola fila; copiá la celda)
--   · columna_revision_posterior: true. estado_por_defecto: 'en_revision'.
--   · permisos: en productos, producto_media, producto_variantes y
--     producto_sellos, anon y authenticated solo "select". En vendedor_sellos,
--     anon "select" y authenticated "delete, insert, select".
--   · rpc_guardar_producto: anon y authenticated false, service_role true.
--   · revision_posterior: cuántos productos quedaron marcados (0b).
-- ============================================================================
select jsonb_pretty(jsonb_build_object(
  'columna_revision_posterior', exists (select 1 from information_schema.columns
                                         where table_schema = 'public' and table_name = 'productos'
                                           and column_name = 'revision_posterior_desde'),
  'estado_por_defecto', (select column_default from information_schema.columns
                          where table_schema = 'public' and table_name = 'productos' and column_name = 'estado'),
  'permisos', (select jsonb_object_agg(t.tabla, jsonb_build_object(
                  'anon', array_to_string(array_remove(array[
                      case when has_table_privilege('anon', 'public.' || t.tabla, 'select') then 'select' end,
                      case when has_table_privilege('anon', 'public.' || t.tabla, 'delete') then 'delete' end,
                      case when has_any_column_privilege('anon', 'public.' || t.tabla, 'insert') then 'insert' end,
                      case when has_any_column_privilege('anon', 'public.' || t.tabla, 'update') then 'update' end], null), ', '),
                  'authenticated', array_to_string(array_remove(array[
                      case when has_table_privilege('authenticated', 'public.' || t.tabla, 'select') then 'select' end,
                      case when has_table_privilege('authenticated', 'public.' || t.tabla, 'delete') then 'delete' end,
                      case when has_any_column_privilege('authenticated', 'public.' || t.tabla, 'insert') then 'insert' end,
                      case when has_any_column_privilege('authenticated', 'public.' || t.tabla, 'update') then 'update' end], null), ', ')))
                 from unnest(array['productos', 'producto_media', 'producto_variantes', 'producto_sellos', 'vendedor_sellos']) as t(tabla)),
  'rpc_guardar_producto', jsonb_build_object(
      'anon',          has_function_privilege('anon',          'public.rpc_guardar_producto(integer, integer, jsonb, text[], text[], integer[], jsonb)', 'execute'),
      'authenticated', has_function_privilege('authenticated', 'public.rpc_guardar_producto(integer, integer, jsonb, text[], text[], integer[], jsonb)', 'execute'),
      'service_role',  has_function_privilege('service_role',  'public.rpc_guardar_producto(integer, integer, jsonb, text[], text[], integer[], jsonb)', 'execute')),
  'revision_posterior', (select count(*) from public.productos where revision_posterior_desde is not null)
)) as verificacion;

-- ============================================================================
-- Para consultar los productos marcados para revisión posterior:
--
-- select p.id, p.nombre, p.estado, v.nombre_negocio, p.revision_posterior_desde, p.moderacion_avisos
--   from public.productos p join public.vendedores v on v.id = p.vendedor_id
--  where p.revision_posterior_desde is not null
--  order by p.revision_posterior_desde;
--
-- Para darlo por revisado (hasta que exista la pantalla):
--
-- update public.productos set revision_posterior_desde = null where id = <id>;
-- ============================================================================

-- ============================================================================
-- Para deshacer (correr en transacción). Vuelve a los permisos de la 032. Con
-- el código nuevo publicado no hace falta deshacer nada para que ande: guarda
-- paso a paso si la función no está.
-- ============================================================================
-- begin;
-- do $$ declare t text; begin
--   foreach t in array array['productos', 'producto_media', 'producto_variantes', 'producto_sellos', 'vendedor_sellos'] loop
--     execute format('grant select, insert, update, delete on table public.%I to authenticated', t);
--   end loop;
-- end $$;
-- drop function if exists public.rpc_guardar_producto(integer, integer, jsonb, text[], text[], integer[], jsonb);
-- drop function if exists privado.guardar_producto(integer, integer, jsonb, text[], text[], integer[], jsonb);
-- alter table public.productos alter column estado set default 'activo';
-- alter table public.productos drop column if exists revision_posterior_desde;
-- notify pgrst, 'reload schema';
-- commit;
-- ============================================================================
