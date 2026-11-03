-- ============================================================================
-- Bahía Shops · 047 · El tope cuenta todo lo guardado, y eliminar con ventas
-- (tanda F1, publicación 2a) (03/11/2026)
-- Correr entero en el SQL Editor de Supabase. Va en transacción: si algo
-- falla, no cambia nada. Se puede correr dos veces sin romper nada.
--
-- CORRERLA ANTES DE PUBLICAR EL CÓDIGO QUE LA ACOMPAÑA. El código nuevo
-- elimina productos con rpc_eliminar_producto: sin la migración, eliminar
-- falla. Con la migración corrida y el código viejo publicado no se rompe
-- nada: el alta en el tope sigue dando su 409 (con el texto viejo, «pausá o
-- eliminá»); reactivar o reenviar por encima del tope da un error genérico
-- (el código viejo no conoce el motivo 'tope_superado'), y eliminar un
-- producto con ventas sigue frenado (el código viejo borra la fila directo y
-- la clave foránea de pedido_items no cambia).
--
-- Por qué: con el tope sobre los activos, una tienda del Gratis podía guardar
-- un catálogo grande pausado y rotarlo, ocupando la base y Storage sin pagar.
--
-- La regla nueva:
--   · Cargar uno nuevo: cuentan TODOS los productos de la tienda (activo, en
--     revisión, agotado, pausado, rechazado y cualquier estado que se sume):
--     entra si guardados < tope (privado.tope_lleno). Pausar no hace lugar;
--     eliminar sí.
--   · Reactivar un pausado y reenviar un rechazado: el producto ya contaba,
--     así que no suma; se permite si guardados <= tope
--     (privado.tope_superado). Una tienda por encima del tope (volvió al
--     Gratis, o le bajaron el tope) no puede reactivar ni reenviar hasta
--     eliminar productos y bajar al tope: así no rota un catálogo más grande
--     que su plan.
--   · Pausar, editar y agotado -> activo: sin control (no cambian el total).
--   · Bajar un tope sigue sin pausar nada.
--
-- Eliminar un producto con ventas: se borra la fila, como uno sin ventas, y
-- sus ítems de pedido quedan con producto_id en null. El pedido ya guarda
-- nombre, variante, precio y foto (pedido_items): Mis pedidos, los mails y el
-- panel de la tienda siguen mostrando qué se compró. El servidor borra de
-- Storage las fotos del producto salvo las que usa algún pedido.
--
-- Qué hace:
--   1. pedido_items.producto_id acepta null. La clave foránea no cambia (sin
--      cascada): borrar un producto sin pasar por borrar_productos sigue
--      frenado.
--   2. privado.tope_lleno (046): cuenta todos los guardados.
--   3. privado.tope_superado (nueva): ¿tiene más guardados que el tope?
--   4. privado.plan_de_tienda (046): usados = los guardados.
--   5. privado.guardar_producto (046): el reenvío de un rechazado usa
--      tope_superado (BS409 'tope_superado'). El resto, igual.
--   6. privado.cambiar_estado_producto (046): reactivar un pausado usa
--      tope_superado ({ ok: false, motivo: 'tope_superado' }). El resto, igual.
--   7. privado.borrar_productos (031): antes de borrar, deja en null el
--      producto de los ítems de pedido. Con quienes la llaman hoy no cambia
--      nada: borrar_tienda corre en tiendas sin pedidos, cerrar_tienda le pasa
--      solo los que nunca se vendieron y borrar_tienda_de_prueba ya borra los
--      ítems antes.
--   8. privado.eliminar_producto (nueva): elimina un producto de la tienda,
--      con ventas o sin ellas, y devuelve sus fotos y las que usan los pedidos.
--   9. Permisos y la puerta para el servidor: rpc_eliminar_producto, solo
--      service_role.
--
-- Cómo avisa la base:
--   · guardar_producto: excepción con SQLSTATE BS409, mensaje
--     'tope_productos' (alta), 'tope_superado' (reenvío) o 'tope_fotos', y en
--     el DETAIL un JSON { tope, usados } (más cuenta: 'guardados' en los de
--     productos).
--   · cambiar_estado_producto: { ok: false, motivo: 'tope_superado', tope,
--     usados, cuenta }.
--
-- No suma columnas a productos: nada nuevo queda público (productos tiene
-- SELECT de tabla para anon, 033).
--
-- Bloqueos: siempre primero la fila de la tienda (FOR NO KEY UPDATE) y
-- después la del producto, como la 046.
-- ============================================================================

begin;

create schema if not exists privado;
grant usage on schema privado to service_role;

-- ---------------------------------------------------------------------------
-- 1. Un ítem de pedido puede quedar sin producto (el producto se eliminó)
-- ---------------------------------------------------------------------------
alter table public.pedido_items alter column producto_id drop not null;

-- ---------------------------------------------------------------------------
-- 2. ¿Está lleno el tope? Para CARGAR uno nuevo.
--
-- null = hay lugar (o no tiene tope); si no, { tope, usados, cuenta }.
-- Cuentan todos los productos de la tienda, sin filtrar por estado. Quien la
-- llama YA bloqueó la fila de la tienda. Volátil a propósito: el conteo toma
-- una foto nueva de la base, después del bloqueo.
-- ---------------------------------------------------------------------------
create or replace function privado.tope_lleno(p_vendedor_id integer)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_tope integer := (privado.plan_efectivo(p_vendedor_id) ->> 'tope_productos')::integer;
  v_usados integer;
begin
  if v_tope is null then
    return null;
  end if;
  select count(*) into v_usados from public.productos where vendedor_id = p_vendedor_id;
  if v_usados < v_tope then
    return null;
  end if;
  return jsonb_build_object('tope', v_tope, 'usados', v_usados, 'cuenta', 'guardados');
end;
$$;

-- ---------------------------------------------------------------------------
-- 3. ¿Tiene más productos guardados que el tope? Para reactivar un pausado y
-- reenviar un rechazado: el producto ya cuenta, así que en el tope se
-- permite; por encima, no.
--
-- null = está en el tope o por debajo (o no tiene tope); si no,
-- { tope, usados, cuenta }. Quien la llama YA bloqueó la fila de la tienda.
-- ---------------------------------------------------------------------------
create or replace function privado.tope_superado(p_vendedor_id integer)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_tope integer := (privado.plan_efectivo(p_vendedor_id) ->> 'tope_productos')::integer;
  v_usados integer;
begin
  if v_tope is null then
    return null;
  end if;
  select count(*) into v_usados from public.productos where vendedor_id = p_vendedor_id;
  if v_usados <= v_tope then
    return null;
  end if;
  return jsonb_build_object('tope', v_tope, 'usados', v_usados, 'cuenta', 'guardados');
end;
$$;

-- ---------------------------------------------------------------------------
-- 4. El plan que rige y los productos que cuentan (todos los guardados).
-- ---------------------------------------------------------------------------
create or replace function privado.plan_de_tienda(p_vendedor_id integer)
returns jsonb
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select privado.plan_efectivo(p_vendedor_id) || jsonb_build_object('usados',
    (select count(*) from public.productos where vendedor_id = p_vendedor_id))
$$;

-- ---------------------------------------------------------------------------
-- 5. Guardar un producto entero (033 y 046), con los topes
--
-- Igual a la de la 046, salvo el reenvío de un rechazado: ya contaba, así que
-- en el tope se permite; por encima del tope, BS409 'tope_superado'.
-- Lo que devuelve cuando sale bien no cambia: { id, estado, revision_posterior }.
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
  v_lleno jsonb;
  v_fotos_plan integer;
  v_fotos_antes integer;
begin
  if p_vendedor_id is null or p_datos is null or coalesce(cardinality(p_fotos), 0) = 0 then
    raise exception 'Faltan datos del producto.' using errcode = '22023';
  end if;

  if jsonb_typeof(p_datos -> 'genero') = 'array' and jsonb_array_length(p_datos -> 'genero') > 0 then
    v_genero := array(select jsonb_array_elements_text(p_datos -> 'genero'));
  end if;

  -- La tienda primero (siempre en este orden: tienda, después producto).
  perform 1 from public.vendedores where id = p_vendedor_id for no key update;
  if not found then
    raise exception 'No encontramos la tienda.' using errcode = 'P0002';
  end if;
  v_fotos_plan := (privado.plan_efectivo(p_vendedor_id) ->> 'fotos_por_producto')::integer;

  if v_id is null then
    v_lleno := privado.tope_lleno(p_vendedor_id);
    if v_lleno is not null then
      raise exception 'tope_productos' using errcode = 'BS409', detail = v_lleno::text;
    end if;
    if cardinality(p_fotos) > v_fotos_plan then
      raise exception 'tope_fotos' using errcode = 'BS409',
        detail = jsonb_build_object('tope', v_fotos_plan, 'usados', cardinality(p_fotos))::text;
    end if;

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

    -- Reenviar un rechazado: ya contaba. En el tope se puede; por encima, no.
    if v_estado = 'rechazado' then
      v_lleno := privado.tope_superado(p_vendedor_id);
      if v_lleno is not null then
        raise exception 'tope_superado' using errcode = 'BS409', detail = v_lleno::text;
      end if;
    end if;

    -- Las fotos: las que ya tenía o las del plan, lo que sea mayor.
    select count(*) into v_fotos_antes from public.producto_media
     where producto_id = v_id and tipo = 'foto';
    if cardinality(p_fotos) > greatest(v_fotos_plan, v_fotos_antes) then
      raise exception 'tope_fotos' using errcode = 'BS409',
        detail = jsonb_build_object('tope', greatest(v_fotos_plan, v_fotos_antes), 'usados', cardinality(p_fotos))::text;
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

-- ---------------------------------------------------------------------------
-- 6. Pausar y reactivar (046)
--
-- Las mismas transiciones que TRANSICIONES en src/lib/productos.js:
--   activo -> pausado; pausado o agotado -> activo.
-- pausado -> activo: ya contaba; en el tope se puede, por encima no.
-- agotado -> activo: ya estaba a la vista; sin control.
--
-- Devuelve { ok: true, estado } o { ok: false, motivo } con motivo
--   'destino'        no es 'activo' ni 'pausado'
--   'no_existe'      no existe o es de otra tienda
--   'estado'         no se puede desde su estado (y va 'estado': el actual)
--   'tope_superado'  la tienda tiene más guardados que el tope (y van
--                    'tope', 'usados' y 'cuenta')
-- ---------------------------------------------------------------------------
create or replace function privado.cambiar_estado_producto(
  p_vendedor_id integer, p_producto_id integer, p_destino text)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_estado text;
  v_superado jsonb;
begin
  if p_destino is null or p_destino not in ('activo', 'pausado') then
    return jsonb_build_object('ok', false, 'motivo', 'destino');
  end if;

  perform 1 from public.vendedores where id = p_vendedor_id for no key update;
  select estado into v_estado from public.productos
   where id = p_producto_id and vendedor_id = p_vendedor_id
     for update;
  if not found then
    return jsonb_build_object('ok', false, 'motivo', 'no_existe');
  end if;

  if not ((p_destino = 'pausado' and v_estado = 'activo')
       or (p_destino = 'activo' and v_estado in ('pausado', 'agotado'))) then
    return jsonb_build_object('ok', false, 'motivo', 'estado', 'estado', v_estado);
  end if;

  if p_destino = 'activo' and v_estado = 'pausado' then
    v_superado := privado.tope_superado(p_vendedor_id);
    if v_superado is not null then
      return jsonb_build_object('ok', false, 'motivo', 'tope_superado') || v_superado;
    end if;
  end if;

  update public.productos set estado = p_destino, actualizado_en = now() where id = p_producto_id;
  return jsonb_build_object('ok', true, 'estado', p_destino);
end;
$$;

-- ---------------------------------------------------------------------------
-- 7. Borrar productos con todo lo que los apunta (031)
--
-- Igual a la de la 031, más: los ítems de pedido de esos productos quedan con
-- producto_id en null (el pedido conserva nombre, variante, precio y foto).
-- Las tablas que pueden no existir van con to_regclass: si no está, se saltea.
-- ---------------------------------------------------------------------------
create or replace function privado.borrar_productos(p_ids integer[])
returns integer
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_tabla text;
  v_borrados integer;
begin
  if p_ids is null or cardinality(p_ids) = 0 then
    return 0;
  end if;

  if to_regclass('public.pedido_items') is not null then
    update public.pedido_items set producto_id = null where producto_id = any (p_ids);
  end if;

  foreach v_tabla in array array['favoritos', 'coleccion_productos', 'tesoros',
                                  'producto_media', 'producto_variantes', 'producto_sellos']
  loop
    if to_regclass('public.' || v_tabla) is not null then
      execute format('delete from public.%I where producto_id = any ($1)', v_tabla) using p_ids;
    end if;
  end loop;

  delete from public.productos where id = any (p_ids);
  get diagnostics v_borrados = row_count;
  return v_borrados;
end;
$$;

-- ---------------------------------------------------------------------------
-- 8. Eliminar un producto de la tienda, con ventas o sin ellas
--
-- Devuelve { ok: true, con_ventas, fotos, fotos_en_pedidos } o
--          { ok: false, motivo: 'no_existe' } (no existe o es de otra tienda).
--   fotos             las URL de sus fotos y de las fotos de sus variantes
--   fotos_en_pedidos  las que usa algún pedido (pedido_items.foto_url)
-- El servidor borra de Storage las fotos que no usa ningún pedido. Las
-- denuncias se van en cascada (035), como al borrar uno sin ventas.
-- ---------------------------------------------------------------------------
create or replace function privado.eliminar_producto(p_vendedor_id integer, p_producto_id integer)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_fotos jsonb;
  v_en_pedidos jsonb;
  v_ventas integer;
begin
  -- Siempre en este orden: tienda, después producto.
  perform 1 from public.vendedores where id = p_vendedor_id for no key update;
  perform 1 from public.productos
   where id = p_producto_id and vendedor_id = p_vendedor_id
     for update;
  if not found then
    return jsonb_build_object('ok', false, 'motivo', 'no_existe');
  end if;

  select coalesce(jsonb_agg(distinct x.url), '[]'::jsonb) into v_fotos
    from (select url from public.producto_media where producto_id = p_producto_id
          union
          select imagen_url from public.producto_variantes where producto_id = p_producto_id) as x(url)
   where x.url is not null;

  select count(*), coalesce(jsonb_agg(distinct foto_url) filter (where foto_url is not null), '[]'::jsonb)
    into v_ventas, v_en_pedidos
    from public.pedido_items
   where producto_id = p_producto_id;

  perform privado.borrar_productos(array[p_producto_id]);

  return jsonb_build_object('ok', true, 'con_ventas', v_ventas > 0,
                            'fotos', v_fotos, 'fotos_en_pedidos', v_en_pedidos);
end;
$$;

-- ---------------------------------------------------------------------------
-- 9. Permisos y la puerta para el servidor
-- ---------------------------------------------------------------------------
revoke all on function privado.tope_lleno(integer) from public, anon, authenticated;
revoke all on function privado.tope_superado(integer) from public, anon, authenticated;
revoke all on function privado.plan_de_tienda(integer) from public, anon, authenticated;
revoke all on function privado.guardar_producto(integer, integer, jsonb, text[], text[], integer[], jsonb) from public, anon, authenticated;
revoke all on function privado.cambiar_estado_producto(integer, integer, text) from public, anon, authenticated;
revoke all on function privado.borrar_productos(integer[]) from public, anon, authenticated;
revoke all on function privado.eliminar_producto(integer, integer) from public, anon, authenticated;
grant execute on function privado.plan_de_tienda(integer) to service_role;
grant execute on function privado.guardar_producto(integer, integer, jsonb, text[], text[], integer[], jsonb) to service_role;
grant execute on function privado.cambiar_estado_producto(integer, integer, text) to service_role;
grant execute on function privado.eliminar_producto(integer, integer) to service_role;

create or replace function public.rpc_eliminar_producto(p_vendedor_id integer, p_producto_id integer)
returns jsonb
language sql
security invoker
as $$ select privado.eliminar_producto(p_vendedor_id, p_producto_id) $$;

revoke all on function public.rpc_eliminar_producto(integer, integer) from public, anon, authenticated;
grant execute on function public.rpc_eliminar_producto(integer, integer) to service_role;

-- Para que la API vea la función nueva sin esperar.
notify pgrst, 'reload schema';

commit;

-- ============================================================================
-- Verificación (una sola fila; copiá la celda)
--   · items_sin_producto_permitido: true.
--   · alta_cuenta_guardados, reenvio_y_reactivar_con_superado,
--     plan_cuenta_guardados, borrar_productos_suelta_pedidos: true.
--   · rpc_eliminar_producto: anon y authenticated false, service_role true.
--   · clave_foranea_items: 'a' (sin acción: sigue sin cascada).
-- ============================================================================
select jsonb_pretty(jsonb_build_object(
  'items_sin_producto_permitido', (select is_nullable = 'YES' from information_schema.columns
      where table_schema = 'public' and table_name = 'pedido_items' and column_name = 'producto_id'),
  'alta_cuenta_guardados', position('estado' in pg_get_functiondef('privado.tope_lleno(integer)'::regprocedure)) = 0,
  'reenvio_y_reactivar_con_superado',
      position('tope_superado' in pg_get_functiondef('privado.guardar_producto(integer, integer, jsonb, text[], text[], integer[], jsonb)'::regprocedure)) > 0
      and position('tope_superado' in pg_get_functiondef('privado.cambiar_estado_producto(integer, integer, text)'::regprocedure)) > 0,
  'plan_cuenta_guardados', position('estado' in pg_get_functiondef('privado.plan_de_tienda(integer)'::regprocedure)) = 0,
  'borrar_productos_suelta_pedidos', position('pedido_items' in pg_get_functiondef('privado.borrar_productos(integer[])'::regprocedure)) > 0,
  'rpc_eliminar_producto', jsonb_build_object(
      'anon',          has_function_privilege('anon',          'public.rpc_eliminar_producto(integer, integer)', 'execute'),
      'authenticated', has_function_privilege('authenticated', 'public.rpc_eliminar_producto(integer, integer)', 'execute'),
      'service_role',  has_function_privilege('service_role',  'public.rpc_eliminar_producto(integer, integer)', 'execute')),
  'clave_foranea_items', (select confdeltype from pg_constraint
      where contype = 'f' and conrelid = 'public.pedido_items'::regclass and confrelid = 'public.productos'::regclass limit 1)
)) as verificacion;

-- ============================================================================
-- Para deshacer (correr en transacción). Vuelve tope_lleno, plan_de_tienda,
-- guardar_producto y cambiar_estado_producto a las de la 046, y
-- borrar_productos a la de la 031: pegá su definición de esos archivos. Con
-- el código nuevo publicado, sin la 047 eliminar falla: deshacer también el
-- código.
-- ============================================================================
-- begin;
-- drop function if exists public.rpc_eliminar_producto(integer, integer);
-- drop function if exists privado.eliminar_producto(integer, integer);
-- (tope_lleno, plan_de_tienda, guardar_producto y cambiar_estado_producto de la 046;
--  borrar_productos de la 031)
-- drop function if exists privado.tope_superado(integer);
-- -- Solo si no quedó ningún ítem sin producto:
-- --   select count(*) from public.pedido_items where producto_id is null;
-- alter table public.pedido_items alter column producto_id set not null;
-- notify pgrst, 'reload schema';
-- commit;
-- ============================================================================
