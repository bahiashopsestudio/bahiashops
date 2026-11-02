-- ============================================================================
-- Bahía Shops · 046 · Planes y topes del Gratis (tanda F1) (02/11/2026)
-- Correr entero en el SQL Editor de Supabase. Va en transacción: si algo
-- falla, no cambia nada. Se puede correr dos veces sin romper nada (no pisa
-- los valores de los planes que ya se hayan editado).
--
-- CORRERLA ANTES DE PUBLICAR EL CÓDIGO QUE LA ACOMPAÑA. El código nuevo lee el
-- plan (rpc_plan_de_tienda) en el alta y la edición de productos, en los
-- pedidos y en el recordatorio, y pausa y reactiva con
-- rpc_cambiar_estado_producto: sin la migración, eso falla. Con la migración
-- corrida y el código viejo publicado, todo anda salvo que un producto que
-- pase el tope (o traiga más fotos de las del plan) da el error genérico «No
-- pudimos guardar el producto» en vez del 409: el código viejo no conoce el
-- error BS409. Lo que devuelve guardar_producto cuando sale bien no cambia.
--
-- Qué hace:
--   1. public.planes: Gratis, Básico y Pro con sus valores iniciales. La lee el
--      público (la página /vender, en F2), sin quién ni cuándo la editó; escribe
--      solo el servidor. precio_proximo y precio_proximo_desde quedan para F5.
--   2. public.vendedor_planes: las condiciones especiales de una tienda (una
--      por tienda): el plan, un tope especial o sin tope, un precio especial,
--      el motivo y quién. Sin permisos para el navegador, como
--      vendedor_comisiones (042).
--   3. Un plan asignado a una tienda tiene que estar completo (con tope de
--      productos y fotos por producto): un disparador en cada tabla.
--   4. privado.plan_efectivo: el plan que rige.
--   5. privado.tope_lleno: si la tienda ya llegó al tope de productos.
--   6. privado.plan_de_tienda: el plan que rige más los productos que cuentan.
--   7. privado.guardar_producto (033) con los topes de productos y de fotos.
--   8. privado.cambiar_estado_producto: pausar y reactivar, con el tope.
--   9. privado.borrar_tienda (042) con vendedor_planes.
--  10. privado.cerrar_tienda (031) con vendedor_planes y vendedor_comisiones
--      (el porcentaje de cada venta ya queda en el pedido: comision_bp y
--      comision_motivo).
--  11. Permisos y las puertas para el servidor: rpc_plan_de_tienda y
--      rpc_cambiar_estado_producto, solo service_role.
--
-- Qué productos cuentan para el tope: activo, en_revision y agotado (agotado
-- vuelve a activo sin moderación). rechazado y pausado no cuentan. Bajar un
-- tope nunca pausa nada: el tope solo frena el alta, el reenvío de un
-- rechazado y la reactivación de un pausado.
--
-- Cómo avisa la base que se llegó al tope (guardar_producto): una excepción
-- con SQLSTATE BS409, el mensaje 'tope_productos' o 'tope_fotos' y en el
-- DETAIL un JSON { tope, usados }. cambiar_estado_producto, en cambio,
-- devuelve { ok: false, motivo: 'tope_productos', tope, usados }.
--
-- Bloqueos: siempre primero la fila de la tienda (FOR NO KEY UPDATE: dos
-- guardados de la misma tienda se esperan, pero no frena las claves foráneas
-- que apuntan a la tienda, como crear un pedido) y después la del producto.
-- ============================================================================

-- ============================================================================
-- PASO 0 (correr ANTES, aparte; no cambia nada)
-- ============================================================================
-- 0a. Tienen que dar null las dos (las tablas no existen todavía):
--
-- select to_regclass('public.planes'), to_regclass('public.vendedor_planes');
--
-- 0b. Las tiendas que ya pasan los 10 productos (no se pausa nada; solo no
--     van a poder sumar más):
--
-- select vendedor_id, count(*) as cuentan from public.productos
--  where estado in ('activo', 'en_revision', 'agotado')
--  group by vendedor_id having count(*) > 10 order by cuentan desc;
-- ============================================================================

begin;

create schema if not exists privado;
grant usage on schema privado to service_role;

-- ---------------------------------------------------------------------------
-- 1. Los planes
--
-- precio_mensual en pesos, sin centavos. null = sin precio («Próximamente»).
-- disponible = se puede elegir. Un plan disponible tiene precio, tope y fotos.
-- El Gratis siempre está disponible y vale 0: es el que rige si no hay otro.
-- ---------------------------------------------------------------------------
create table if not exists public.planes (
  clave text primary key,
  nombre text not null,
  orden smallint not null,
  precio_mensual integer,
  tope_productos integer,
  fotos_por_producto integer,
  carritos_abandonados boolean not null default false,
  disponible boolean not null default false,
  precio_proximo integer,
  precio_proximo_desde timestamptz,
  actualizado_en timestamptz not null default now(),
  actualizado_por uuid,
  constraint planes_clave_check check (clave ~ '^[a-z_]{2,20}$'),
  constraint planes_nombre_check check (char_length(btrim(nombre)) between 1 and 40),
  constraint planes_precio_check check (precio_mensual is null or precio_mensual >= 0),
  constraint planes_tope_check check (tope_productos is null or tope_productos between 1 and 10000),
  constraint planes_fotos_check check (fotos_por_producto is null or fotos_por_producto between 1 and 20),
  constraint planes_disponible_check check (not disponible
    or (precio_mensual is not null and tope_productos is not null and fotos_por_producto is not null)),
  constraint planes_gratis_check check (clave <> 'gratis' or (disponible and precio_mensual = 0)),
  constraint planes_proximo_check check ((precio_proximo is null) = (precio_proximo_desde is null)
    and (precio_proximo is null or precio_proximo >= 0))
);

insert into public.planes (clave, nombre, orden, precio_mensual, tope_productos, fotos_por_producto, carritos_abandonados, disponible)
values ('gratis', 'Gratis', 1, 0,     10,   4,    false, true),
       ('basico', 'Básico', 2, 10000, 25,   8,    true,  true),
       ('pro',    'Pro',    3, null,  null, null, false, false)
on conflict (clave) do nothing;

alter table public.planes enable row level security;
revoke all on table public.planes from public, anon, authenticated;
grant select (clave, nombre, orden, precio_mensual, tope_productos, fotos_por_producto,
              carritos_abandonados, disponible, precio_proximo, precio_proximo_desde)
  on table public.planes to anon, authenticated;
grant select, insert, update on table public.planes to service_role;
drop policy if exists planes_lectura on public.planes;
create policy planes_lectura on public.planes for select to anon, authenticated using (true);

-- ---------------------------------------------------------------------------
-- 2. Las condiciones especiales de una tienda
--
-- tope_productos   null = el del plan
-- sin_tope         true = sin límite de productos (la tienda propia)
-- precio_especial  null = el del plan; 0 = sin abono
-- motivo           nota interna del admin: la tienda no la ve
-- creado_por y actualizado_por son el id del admin (de la sesión), sin clave
-- foránea: el historial no tiene que frenar que se elimine una cuenta.
-- ---------------------------------------------------------------------------
create table if not exists public.vendedor_planes (
  vendedor_id integer primary key references public.vendedores (id) on delete cascade,
  plan_clave text not null references public.planes (clave),
  tope_productos integer,
  sin_tope boolean not null default false,
  precio_especial integer,
  motivo text not null,
  creado_por uuid not null,
  creado_en timestamptz not null default now(),
  actualizado_por uuid,
  actualizado_en timestamptz,
  constraint vendedor_planes_tope_check check (tope_productos is null or tope_productos between 1 and 10000),
  constraint vendedor_planes_sin_tope_check check (not (sin_tope and tope_productos is not null)),
  constraint vendedor_planes_precio_check check (precio_especial is null or precio_especial >= 0),
  constraint vendedor_planes_motivo_check check (char_length(btrim(motivo)) between 1 and 300)
);

alter table public.vendedor_planes enable row level security;
revoke all on table public.vendedor_planes from public, anon, authenticated;
grant select, insert, update, delete on table public.vendedor_planes to service_role;

-- ---------------------------------------------------------------------------
-- 3. Un plan asignado tiene que estar completo
--
-- Sin tope de productos o sin fotos por producto, plan_efectivo no puede
-- decir los límites y la tienda no podría guardar productos (por ejemplo, el
-- Pro hoy). Error 23514 (como una restricción CHECK).
--
-- Al asignar: el plan se lee FOR SHARE, así que espera a quien lo esté
-- editando. Al editar el plan: la fila del plan ya está bloqueada cuando
-- corre el disparador, así que espera a quien lo esté asignando.
-- ---------------------------------------------------------------------------
create or replace function privado.vendedor_planes_plan_completo()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  perform 1 from public.planes
   where clave = new.plan_clave
     and tope_productos is not null
     and fotos_por_producto is not null
     for share;
  if not found then
    raise exception 'El plan % no tiene tope de productos o fotos por producto: no se puede asignar a una tienda.', new.plan_clave
      using errcode = '23514';
  end if;
  return new;
end;
$$;

drop trigger if exists vendedor_planes_plan_completo on public.vendedor_planes;
create trigger vendedor_planes_plan_completo
  before insert or update of plan_clave on public.vendedor_planes
  for each row execute function privado.vendedor_planes_plan_completo();

create or replace function privado.planes_asignado_completo()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if (new.tope_productos is null or new.fotos_por_producto is null)
     and exists (select 1 from public.vendedor_planes where plan_clave = old.clave) then
    raise exception 'El plan % está asignado a alguna tienda: no puede quedar sin tope de productos ni fotos por producto.', old.clave
      using errcode = '23514';
  end if;
  return new;
end;
$$;

drop trigger if exists planes_asignado_completo on public.planes;
create trigger planes_asignado_completo
  before update of tope_productos, fotos_por_producto on public.planes
  for each row execute function privado.planes_asignado_completo();

-- ---------------------------------------------------------------------------
-- 4. El plan que rige
--
-- F1: las condiciones especiales de la tienda si tiene; si no, el Gratis.
--
-- F3 (suscripción de Mercado Pago) cambia esto, sin cambiar lo que devuelve:
--   · una condición especial con precio_especial > 0 (los planes a medida)
--     va a exigir la suscripción al día; sin ella rige el Gratis. Si no se
--     hace, un plan a medida queda gratis para siempre;
--   · una condición especial con precio_especial = 0 (la tienda propia, una
--     cortesía) sigue valiendo sin suscripción;
--   · sin condiciones especiales: con la suscripción al día rige el Básico
--     (origen 'suscripcion'); si no, el Gratis.
--
-- Devuelve { plan, nombre, origen ('especial' | 'gratis'), especial,
-- sin_tope, tope_productos (null = sin tope), fotos_por_producto,
-- carritos_abandonados, precio_mensual }.
-- ---------------------------------------------------------------------------
create or replace function privado.plan_efectivo(p_vendedor_id integer)
returns jsonb
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  v_especial public.vendedor_planes%rowtype;
  v_plan public.planes%rowtype;
  v_origen text;
begin
  select * into v_especial from public.vendedor_planes where vendedor_id = p_vendedor_id;
  if found then
    select * into v_plan from public.planes where clave = v_especial.plan_clave;
    v_origen := 'especial';
  else
    select * into v_plan from public.planes where clave = 'gratis';
    v_origen := 'gratis';
  end if;

  -- No debería pasar (las restricciones y los disparadores de arriba lo
  -- frenan), pero si pasa, mejor un error claro que un tope inventado.
  if v_plan.clave is null or v_plan.fotos_por_producto is null
     or (v_plan.tope_productos is null and not coalesce(v_especial.sin_tope, false)) then
    raise exception 'El plan de la tienda % no está completo.', p_vendedor_id using errcode = '55000';
  end if;

  return jsonb_build_object(
    'plan', v_plan.clave,
    'nombre', v_plan.nombre,
    'origen', v_origen,
    'especial', v_origen = 'especial',
    'sin_tope', coalesce(v_especial.sin_tope, false),
    'tope_productos', case when coalesce(v_especial.sin_tope, false) then null
                           else coalesce(v_especial.tope_productos, v_plan.tope_productos) end,
    'fotos_por_producto', v_plan.fotos_por_producto,
    'carritos_abandonados', v_plan.carritos_abandonados,
    'precio_mensual', coalesce(v_especial.precio_especial, v_plan.precio_mensual)
  );
end;
$$;

-- ---------------------------------------------------------------------------
-- 5. ¿Está lleno el tope de productos?
--
-- null = hay lugar (o no tiene tope); si no, { tope, usados }. Quien la llama
-- YA bloqueó la fila de la tienda. Es volátil a propósito: el conteo toma una
-- foto nueva de la base, después del bloqueo, y ve lo que acaba de guardar la
-- otra pestaña.
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
  select count(*) into v_usados from public.productos
   where vendedor_id = p_vendedor_id and estado in ('activo', 'en_revision', 'agotado');
  if v_usados < v_tope then
    return null;
  end if;
  return jsonb_build_object('tope', v_tope, 'usados', v_usados);
end;
$$;

-- ---------------------------------------------------------------------------
-- 6. El plan que rige y los productos que cuentan (para el panel de la
-- tienda, los pedidos y el admin). No bloquea nada.
-- ---------------------------------------------------------------------------
create or replace function privado.plan_de_tienda(p_vendedor_id integer)
returns jsonb
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select privado.plan_efectivo(p_vendedor_id) || jsonb_build_object('usados',
    (select count(*) from public.productos
      where vendedor_id = p_vendedor_id and estado in ('activo', 'en_revision', 'agotado')))
$$;

-- ---------------------------------------------------------------------------
-- 7. Guardar un producto entero (033), con los topes
--
-- Igual a la de la 033, más:
--   · bloquea la fila de la tienda antes que nada;
--   · alta: si el tope está lleno, BS409 'tope_productos'; con más fotos que
--     las del plan, BS409 'tope_fotos';
--   · editar un rechazado (reenviarlo) lo vuelve a contar: si el tope está
--     lleno, BS409 'tope_productos';
--   · editar: se aceptan como máximo las fotos que el producto ya tenía o las
--     del plan, lo que sea mayor (un producto con 8 fotos que volvió al
--     Gratis las conserva, pero no suma una novena).
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

    -- Reenviar un rechazado lo vuelve a contar.
    if v_estado = 'rechazado' then
      v_lleno := privado.tope_lleno(p_vendedor_id);
      if v_lleno is not null then
        raise exception 'tope_productos' using errcode = 'BS409', detail = v_lleno::text;
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
-- 8. Pausar y reactivar
--
-- Reemplaza el UPDATE suelto de PATCH /api/vendedor/productos/[id]. Las
-- mismas transiciones que TRANSICIONES en src/lib/productos.js:
--   activo -> pausado; pausado o agotado -> activo.
-- pausado -> activo suma uno al tope; agotado -> activo ya contaba.
--
-- Devuelve { ok: true, estado } o { ok: false, motivo } con motivo
--   'destino'         no es 'activo' ni 'pausado'
--   'no_existe'       no existe o es de otra tienda
--   'estado'          no se puede desde su estado (y va 'estado': el actual)
--   'tope_productos'  el tope está lleno (y van 'tope' y 'usados')
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
  v_lleno jsonb;
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
    v_lleno := privado.tope_lleno(p_vendedor_id);
    if v_lleno is not null then
      return jsonb_build_object('ok', false, 'motivo', 'tope_productos') || v_lleno;
    end if;
  end if;

  update public.productos set estado = p_destino, actualizado_en = now() where id = p_producto_id;
  return jsonb_build_object('ok', true, 'estado', p_destino);
end;
$$;

-- ---------------------------------------------------------------------------
-- 9. Borrar una tienda sin pedidos (042), con vendedor_planes
-- ---------------------------------------------------------------------------
create or replace function privado.borrar_tienda(p_vendedor_id integer)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_tabla text;
  v_productos integer;
begin
  v_productos := privado.borrar_productos(array(
    select id from public.productos where vendedor_id = p_vendedor_id));

  foreach v_tabla in array array['vendedor_sellos', 'mercadopago_cuentas', 'vendedor_bloqueos', 'envio_zona_fallas',
                                 'vendedor_comisiones', 'vendedor_planes']
  loop
    if to_regclass('public.' || v_tabla) is not null then
      execute format('delete from public.%I where vendedor_id = $1', v_tabla) using p_vendedor_id;
    end if;
  end loop;

  delete from public.vendedores where id = p_vendedor_id;

  return jsonb_build_object('productos_borrados', v_productos);
end;
$$;

-- ---------------------------------------------------------------------------
-- 10. Cerrar una tienda con pedidos (031), con vendedor_planes y
-- vendedor_comisiones. El resto, igual a la 031.
-- ---------------------------------------------------------------------------
create or replace function privado.cerrar_tienda(p_vendedor_id integer)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_set text;
  v_sin_vender integer[];
  v_productos integer;
begin
  update public.vendedores
     set cerrada_en = now(), pausada_en = null, mensaje_pausa = null
   where id = p_vendedor_id;

  -- Un texto obligatorio sin valor por defecto queda en 'cerrada-<id>' y no
  -- en '': si la columna tuviera un índice único, dos tiendas cerradas con ''
  -- chocarían y la eliminación de la cuenta fallaría entera.
  select string_agg(format('%I = %s', columna,
           case accion when 'null' then 'null' when 'default' then 'default'
                       else quote_literal('cerrada-' || p_vendedor_id) end), ', ')
    into v_set
    from privado.columnas_a_limpiar_tienda()
   where accion <> 'conservar';

  if v_set is not null then
    execute format('update public.vendedores set %s where id = $1', v_set) using p_vendedor_id;
  end if;

  if to_regclass('public.vendedor_sellos') is not null then
    delete from public.vendedor_sellos where vendedor_id = p_vendedor_id;
  end if;
  delete from public.mercadopago_cuentas where vendedor_id = p_vendedor_id;

  -- Las condiciones del admin: la tienda ya no vende. El porcentaje de cada
  -- venta queda en el pedido (comision_bp, comision_motivo).
  if to_regclass('public.vendedor_comisiones') is not null then
    delete from public.vendedor_comisiones where vendedor_id = p_vendedor_id;
  end if;
  delete from public.vendedor_planes where vendedor_id = p_vendedor_id;

  -- Los productos que nunca se vendieron. Los vendidos quedan: los apuntan
  -- los ítems de los pedidos (y la base no los muestra: la tienda está cerrada).
  v_sin_vender := array(
    select p.id from public.productos p
     where p.vendedor_id = p_vendedor_id
       and not exists (select 1 from public.pedido_items pi where pi.producto_id = p.id)
  );
  v_productos := privado.borrar_productos(v_sin_vender);

  return jsonb_build_object('productos_borrados', v_productos);
end;
$$;

-- ---------------------------------------------------------------------------
-- 11. Permisos y las puertas para el servidor
-- ---------------------------------------------------------------------------
revoke all on function privado.vendedor_planes_plan_completo() from public, anon, authenticated;
revoke all on function privado.planes_asignado_completo() from public, anon, authenticated;
revoke all on function privado.plan_efectivo(integer) from public, anon, authenticated;
revoke all on function privado.tope_lleno(integer) from public, anon, authenticated;
revoke all on function privado.plan_de_tienda(integer) from public, anon, authenticated;
revoke all on function privado.guardar_producto(integer, integer, jsonb, text[], text[], integer[], jsonb) from public, anon, authenticated;
revoke all on function privado.cambiar_estado_producto(integer, integer, text) from public, anon, authenticated;
revoke all on function privado.borrar_tienda(integer) from public, anon, authenticated;
revoke all on function privado.cerrar_tienda(integer) from public, anon, authenticated;
grant execute on function privado.plan_de_tienda(integer) to service_role;
grant execute on function privado.guardar_producto(integer, integer, jsonb, text[], text[], integer[], jsonb) to service_role;
grant execute on function privado.cambiar_estado_producto(integer, integer, text) to service_role;

create or replace function public.rpc_plan_de_tienda(p_vendedor_id integer)
returns jsonb
language sql
security invoker
as $$ select privado.plan_de_tienda(p_vendedor_id) $$;

create or replace function public.rpc_cambiar_estado_producto(
  p_vendedor_id integer, p_producto_id integer, p_destino text)
returns jsonb
language sql
security invoker
as $$ select privado.cambiar_estado_producto(p_vendedor_id, p_producto_id, p_destino) $$;

revoke all on function public.rpc_plan_de_tienda(integer) from public, anon, authenticated;
revoke all on function public.rpc_cambiar_estado_producto(integer, integer, text) from public, anon, authenticated;
grant execute on function public.rpc_plan_de_tienda(integer) to service_role;
grant execute on function public.rpc_cambiar_estado_producto(integer, integer, text) to service_role;

-- Para que la API vea las funciones nuevas sin esperar.
notify pgrst, 'reload schema';

commit;

-- ============================================================================
-- Verificación (una sola fila; copiá la celda)
--   · tablas: true las dos.
--   · planes: gratis 0/10/4/sin carritos, basico 10000/25/8/con carritos,
--     pro sin precio y no disponible (o lo que hayas editado después).
--   · anon_lee_planes true; anon_lee_actualizado_por false;
--     navegador_en_vendedor_planes "" (ningún permiso).
--   · rpc: anon y authenticated false, service_role true, en las dos.
--   · borrar_tienda_planes, cerrar_tienda_planes y cerrar_tienda_comisiones:
--     true. guardar_producto_con_tope: true.
--   · disparadores: 2.
-- ============================================================================
select jsonb_pretty(jsonb_build_object(
  'tablas', jsonb_build_object(
      'planes', to_regclass('public.planes') is not null,
      'vendedor_planes', to_regclass('public.vendedor_planes') is not null),
  'planes', (select jsonb_object_agg(clave, jsonb_build_object(
                 'precio', precio_mensual, 'tope', tope_productos, 'fotos', fotos_por_producto,
                 'carritos', carritos_abandonados, 'disponible', disponible))
               from public.planes),
  'anon_lee_planes', has_column_privilege('anon', 'public.planes', 'tope_productos', 'select'),
  'anon_lee_actualizado_por', has_column_privilege('anon', 'public.planes', 'actualizado_por', 'select'),
  'navegador_en_vendedor_planes', array_to_string(array_remove(array[
      case when has_any_column_privilege('anon', 'public.vendedor_planes', 'select') then 'anon select' end,
      case when has_any_column_privilege('authenticated', 'public.vendedor_planes', 'select') then 'authenticated select' end,
      case when has_any_column_privilege('authenticated', 'public.vendedor_planes', 'insert') then 'authenticated insert' end,
      case when has_any_column_privilege('authenticated', 'public.vendedor_planes', 'update') then 'authenticated update' end,
      case when has_table_privilege('authenticated', 'public.vendedor_planes', 'delete') then 'authenticated delete' end], null), ', '),
  'rpc_plan_de_tienda', jsonb_build_object(
      'anon',          has_function_privilege('anon',          'public.rpc_plan_de_tienda(integer)', 'execute'),
      'authenticated', has_function_privilege('authenticated', 'public.rpc_plan_de_tienda(integer)', 'execute'),
      'service_role',  has_function_privilege('service_role',  'public.rpc_plan_de_tienda(integer)', 'execute')),
  'rpc_cambiar_estado_producto', jsonb_build_object(
      'anon',          has_function_privilege('anon',          'public.rpc_cambiar_estado_producto(integer, integer, text)', 'execute'),
      'authenticated', has_function_privilege('authenticated', 'public.rpc_cambiar_estado_producto(integer, integer, text)', 'execute'),
      'service_role',  has_function_privilege('service_role',  'public.rpc_cambiar_estado_producto(integer, integer, text)', 'execute')),
  'borrar_tienda_planes', position('vendedor_planes' in pg_get_functiondef('privado.borrar_tienda(integer)'::regprocedure)) > 0,
  'cerrar_tienda_planes', position('vendedor_planes' in pg_get_functiondef('privado.cerrar_tienda(integer)'::regprocedure)) > 0,
  'cerrar_tienda_comisiones', position('vendedor_comisiones' in pg_get_functiondef('privado.cerrar_tienda(integer)'::regprocedure)) > 0,
  'guardar_producto_con_tope', position('BS409' in pg_get_functiondef('privado.guardar_producto(integer, integer, jsonb, text[], text[], integer[], jsonb)'::regprocedure)) > 0,
  'disparadores', (select count(*) from pg_trigger
                    where not tgisinternal
                      and tgname in ('vendedor_planes_plan_completo', 'planes_asignado_completo'))
)) as verificacion;

-- ============================================================================
-- Para deshacer (correr en transacción). Vuelve guardar_producto,
-- borrar_tienda y cerrar_tienda a las de la 033, 042 y 031: pegá su
-- definición de esos archivos. Con el código nuevo publicado, sin la 046 el
-- alta, la edición, la pausa y los pedidos fallan: deshacer también el código.
-- ============================================================================
-- begin;
-- drop function if exists public.rpc_cambiar_estado_producto(integer, integer, text);
-- drop function if exists public.rpc_plan_de_tienda(integer);
-- drop function if exists privado.cambiar_estado_producto(integer, integer, text);
-- drop function if exists privado.plan_de_tienda(integer);
-- drop function if exists privado.tope_lleno(integer);
-- (guardar_producto de la 033, borrar_tienda de la 042, cerrar_tienda de la 031)
-- drop function if exists privado.plan_efectivo(integer);
-- drop table if exists public.vendedor_planes;
-- drop table if exists public.planes;
-- drop function if exists privado.vendedor_planes_plan_completo();
-- drop function if exists privado.planes_asignado_completo();
-- notify pgrst, 'reload schema';
-- commit;
-- ============================================================================
