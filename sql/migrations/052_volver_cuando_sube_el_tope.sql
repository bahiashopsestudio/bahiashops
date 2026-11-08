-- ============================================================================
-- Bahía Shops · 052 · Los pausados por el plan vuelven cuando sube el tope
-- (08/11/2026)
-- Correr entera en el SQL Editor de Supabase. Va en transacción: si algo
-- falla, no cambia nada. Se puede correr dos veces sin romper nada.
--
-- CORRERLA ANTES DE PUBLICAR EL CÓDIGO QUE LA ACOMPAÑA (Mis productos lee
-- productos.pausado_con_tope para la línea de cada pausado por el plan). Con
-- la migración corrida y el código de hoy no se rompe nada: el código de hoy
-- no lee la columna nueva.
--
-- Qué cambia respecto de la 050 (decidido el 08/11):
--   · Cada producto pausado por el plan guarda el tope con el que se pausó
--     (productos.pausado_con_tope): el tope del plan que quedó en ese
--     momento.
--   · Vuelve solo cuando el tope efectivo de la tienda pasa a ser MAYOR que
--     ese: un cobro aprobado de un plan más grande, o condiciones cargadas
--     con más lugar (también de $0), o sin tope. Nunca porque la tienda
--     eliminó productos: el lugar que libera es suyo.
--   · Funciona haya o no una caída abierta: ya no quedan marcados para
--     siempre (50 → Gratis → Básico → 50: en el Básico vuelven los que
--     entran en 25; con el 50, el resto).
--   · Si el tope sube pero no entran todos, los que no entraron pasan a
--     tener el tope de hoy: vuelven solo si sube otra vez (y no porque ella
--     haga lugar).
--   · Del más viejo al más nuevo (creado_en, id), a su estado de antes.
--   · Reactivar uno a mano sigue igual: pierde la marca (y el tope).
--
-- Qué hace:
--   1. productos.pausado_con_tope, y el de los que ya están pausados por el
--      plan (el tope que les dejó su caída; si no hay caída, el del plan que
--      rige hoy).
--   2. privado.ajustar_productos_al_plan (050) con la regla nueva.
--   3. privado.cambiar_estado_producto (050): también borra pausado_con_tope.
--   4. Un disparador en productos: cuando un producto deja de estar
--      'pausado' por cualquier camino (la moderación, el rechazo por una
--      denuncia de la 035, guardar_producto, o lo que se sume), pierde la
--      marca del plan (las tres columnas). Así la marca nunca queda en un
--      producto rechazado o publicado.
-- Las demás funciones de la 050 no cambian (registrar_cobro_suscripcion y
-- aplicar_caidas_vencidas llaman a esta).
-- ============================================================================

begin;

-- ---------------------------------------------------------------------------
-- 1. El tope con el que se pausó
--
-- pausado_con_tope  el tope efectivo de la tienda cuando el sistema lo pausó
--                   (o cuando una subida no le alcanzó para volver). Vuelve
--                   solo cuando el tope pasa a ser mayor. null si no está
--                   pausado por el plan.
-- ---------------------------------------------------------------------------
alter table public.productos add column if not exists pausado_con_tope integer;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'productos_pausado_con_tope_check') then
    alter table public.productos add constraint productos_pausado_con_tope_check
      check (pausado_con_tope is null or (pausado_con_tope >= 0 and pausado_por_plan_en is not null));
  end if;
end $$;

-- Los que ya estaban pausados por el plan (de la 050): el tope que les dejó
-- la última caída de su tienda; sin caída, el tope que rige hoy.
update public.productos p set
  pausado_con_tope = coalesce(
    (select c.tope_despues from public.plan_caidas c
      where c.vendedor_id = p.vendedor_id and c.tope_despues is not null
      order by c.cayo_en desc, c.id desc limit 1),
    (privado.plan_efectivo(p.vendedor_id) ->> 'tope_productos')::integer)
 where p.pausado_por_plan_en is not null and p.pausado_con_tope is null;

-- ---------------------------------------------------------------------------
-- 2. Ajustar los productos al plan (050), con la regla nueva
--
--   Volver (siempre que no sea p_motivo = 'condiciones_quitadas'): los
--   pausados por el plan con pausado_con_tope menor que el tope de hoy (o
--   todos, sin tope), del más viejo al más nuevo, mientras entren en el tope.
--   Los que tenían que volver y no entraron se quedan con el tope de hoy. Si
--   hay una caída abierta y el plan ya no es el Gratis y su tope es mayor que
--   el que dejó la caída, la caída se cierra (con cuántos volvieron).
--
--   Caer: igual que en la 050. Los que pausa guardan el tope de hoy.
--
-- Devuelve { pausados, restaurados, caida }.
-- ---------------------------------------------------------------------------
create or replace function privado.ajustar_productos_al_plan(
  p_vendedor_id integer, p_motivo text default null, p_tope_antes integer default null)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_plan jsonb;
  v_tope integer;
  v_gratis boolean;
  v_sus public.vendedor_suscripciones%rowtype;
  v_caida public.plan_caidas%rowtype;
  v_especial public.vendedor_planes%rowtype;
  v_precio_plan integer;
  v_motivo text;
  v_a_medida boolean;
  v_tope_antes integer;
  v_visibles integer;
  v_pausados integer := 0;
  v_restaurados integer := 0;
  v_id bigint;
begin
  if p_motivo is not null and p_motivo <> 'condiciones_quitadas' then
    raise exception 'Motivo no válido: %', p_motivo using errcode = '22023';
  end if;

  perform 1 from public.vendedores where id = p_vendedor_id for no key update;
  if not found then
    return jsonb_build_object('pausados', 0, 'restaurados', 0, 'caida', null);
  end if;

  v_plan := privado.plan_efectivo(p_vendedor_id);
  v_gratis := v_plan ->> 'origen' = 'gratis';
  v_tope := case when (v_plan ->> 'sin_tope')::boolean then null else (v_plan ->> 'tope_productos')::integer end;

  select * into v_caida from public.plan_caidas where vendedor_id = p_vendedor_id and restaurada_en is null;

  -- ── Volver: solo cuando el tope de hoy es mayor que el que tenían ──
  if p_motivo is null then
    select count(*) into v_visibles from public.productos
     where vendedor_id = p_vendedor_id and estado in ('activo', 'agotado', 'en_revision');
    with candidatos as (
      select id from public.productos
       where vendedor_id = p_vendedor_id and pausado_por_plan_en is not null and estado = 'pausado'
         and (v_tope is null or pausado_con_tope is null or pausado_con_tope < v_tope)
       order by creado_en, id
       limit case when v_tope is null then null else greatest(v_tope - v_visibles, 0) end
    ), hechos as (
      update public.productos p set
        estado = coalesce(p.estado_antes_del_plan, 'activo'),
        pausado_por_plan_en = null,
        estado_antes_del_plan = null,
        pausado_con_tope = null,
        actualizado_en = now()
      from candidatos c
      where p.id = c.id
      returning p.id
    )
    select count(*) into v_restaurados from hechos;

    -- Los que tenían que volver y no entraron: se quedan con el tope de hoy
    -- (vuelven si sube otra vez, no porque ella haga lugar).
    if v_tope is not null then
      update public.productos set pausado_con_tope = v_tope
       where vendedor_id = p_vendedor_id and pausado_por_plan_en is not null and estado = 'pausado'
         and (pausado_con_tope is null or pausado_con_tope < v_tope);
    end if;

    -- Volvió a pagar un plan más grande que el que le dejó la caída: se cierra.
    if v_caida.id is not null and not v_gratis and (v_tope is null or v_tope > coalesce(v_caida.tope_despues, 0)) then
      update public.plan_caidas set restaurada_en = now(), restaurados = v_restaurados where id = v_caida.id;
      return jsonb_build_object('pausados', 0, 'restaurados', v_restaurados, 'caida', v_caida.id);
    end if;
  end if;

  select * into v_especial from public.vendedor_planes where vendedor_id = p_vendedor_id;

  -- ── Caer (igual que en la 050) ──
  if p_motivo = 'condiciones_quitadas' then
    if v_caida.id is not null then
      return jsonb_build_object('pausados', 0, 'restaurados', 0, 'caida', null);
    end if;
    select * into v_sus from privado.suscripcion_al_dia(p_vendedor_id);
    v_motivo := 'condiciones_quitadas';
    v_a_medida := true;
    v_tope_antes := p_tope_antes;
  else
    if not v_gratis then
      return jsonb_build_object('pausados', 0, 'restaurados', v_restaurados, 'caida', null);
    end if;
    select s.* into v_sus from public.vendedor_suscripciones s
     where s.vendedor_id = p_vendedor_id and s.primer_cobro_en is not null
       and not exists (select 1 from public.plan_caidas c
                        where c.suscripcion_id = s.id and c.motivo <> 'condiciones_quitadas')
     order by coalesce(s.pagado_hasta, s.cancelada_en, s.creada_en) desc, s.id desc
     limit 1;
    if v_sus.id is null then
      return jsonb_build_object('pausados', 0, 'restaurados', v_restaurados, 'caida', null);
    end if;
    v_motivo := case
      when v_sus.pagado_hasta is null then 'devolucion'
      when v_sus.estado = 'cancelled' then 'baja'
      else 'falta_de_pago' end;
    select precio_mensual into v_precio_plan from public.planes where clave = v_especial.plan_clave;
    v_a_medida := v_especial.vendedor_id is not null
                  and coalesce(v_especial.precio_especial, v_precio_plan, 0) > 0;
    select case when v_a_medida and not v_especial.sin_tope then coalesce(v_especial.tope_productos, pl.tope_productos)
                when v_a_medida then null
                else pl.tope_productos end
      into v_tope_antes
      from public.planes pl
     where pl.clave = case when v_a_medida then v_especial.plan_clave else v_sus.plan_clave end;
  end if;

  insert into public.plan_caidas (vendedor_id, suscripcion_id, plan_clave, a_medida, tope_antes, tope_despues, motivo)
  values (p_vendedor_id, v_sus.id,
          coalesce(case when v_a_medida then v_especial.plan_clave end, v_sus.plan_clave, v_especial.plan_clave, 'basico'),
          v_a_medida, v_tope_antes, v_tope, v_motivo)
  on conflict do nothing
  returning id into v_id;

  if v_id is null and v_caida.id is not null then
    update public.plan_caidas set restaurada_en = now(), restaurados = 0 where id = v_caida.id;
    insert into public.plan_caidas (vendedor_id, suscripcion_id, plan_clave, a_medida, tope_antes, tope_despues, motivo)
    values (p_vendedor_id, v_sus.id,
            coalesce(case when v_a_medida then v_especial.plan_clave end, v_sus.plan_clave, v_especial.plan_clave, 'basico'),
            v_a_medida, v_tope_antes, v_tope, v_motivo)
    on conflict do nothing
    returning id into v_id;
    if v_id is not null then
      update public.plan_caidas set reemplazada_por = v_id where id = v_caida.id;
    end if;
  end if;
  if v_id is null then
    return jsonb_build_object('pausados', 0, 'restaurados', v_restaurados, 'caida', null);
  end if;

  if v_tope is not null then
    with visibles as (
      select id, estado, row_number() over (order by creado_en, id) as n
        from public.productos
       where vendedor_id = p_vendedor_id and estado in ('activo', 'agotado', 'en_revision')
    ), hechos as (
      update public.productos p set
        estado_antes_del_plan = v.estado,
        estado = 'pausado',
        pausado_por_plan_en = now(),
        pausado_con_tope = v_tope,
        actualizado_en = now()
      from visibles v
      where p.id = v.id and v.n > v_tope
      returning p.id
    )
    select count(*) into v_pausados from hechos;
    update public.plan_caidas set pausados = v_pausados where id = v_id;
  end if;

  return jsonb_build_object('pausados', v_pausados, 'restaurados', v_restaurados, 'caida', v_id);
end;
$$;

-- ---------------------------------------------------------------------------
-- 3. Pausar y reactivar (050): reactivar a mano también borra
-- pausado_con_tope. El resto, igual.
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
  v_antes text;
  v_superado jsonb;
  v_final text;
begin
  if p_destino is null or p_destino not in ('activo', 'pausado') then
    return jsonb_build_object('ok', false, 'motivo', 'destino');
  end if;

  perform 1 from public.vendedores where id = p_vendedor_id for no key update;
  select estado, estado_antes_del_plan into v_estado, v_antes from public.productos
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

  v_final := case when p_destino = 'activo' and v_estado = 'pausado' and v_antes = 'en_revision' then 'en_revision' else p_destino end;
  update public.productos set
    estado = v_final,
    pausado_por_plan_en = null,
    estado_antes_del_plan = null,
    pausado_con_tope = null,
    actualizado_en = now()
  where id = p_producto_id;
  return jsonb_build_object('ok', true, 'estado', v_final);
end;
$$;

-- ---------------------------------------------------------------------------
-- 4. La marca del plan solo vive en un producto pausado
--
-- Antes de cada UPDATE de estado: si el producto queda en un estado que no
-- es 'pausado', se borran pausado_por_plan_en, estado_antes_del_plan y
-- pausado_con_tope. Cubre los caminos que no pasan por las funciones del plan:
-- la aprobación y el rechazo de la moderación (src/app/api/admin/productos/
-- [id]/moderacion/route.js), el rechazo por una denuncia
-- (privado.rechazar_producto_denunciado, 035) y el reenvío de un rechazado
-- (guardar_producto, 047). Corre antes del check, así nunca lo rompe.
-- ---------------------------------------------------------------------------
create or replace function privado.productos_marca_del_plan()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if new.estado is distinct from 'pausado' then
    new.pausado_por_plan_en := null;
    new.estado_antes_del_plan := null;
    new.pausado_con_tope := null;
  end if;
  return new;
end;
$$;

drop trigger if exists productos_marca_del_plan on public.productos;
create trigger productos_marca_del_plan
  before update of estado on public.productos
  for each row execute function privado.productos_marca_del_plan();

-- Los que hoy tienen la marca sin estar pausados (por ejemplo, rechazados
-- por una denuncia después de la 050): sin marca.
update public.productos set pausado_por_plan_en = null, estado_antes_del_plan = null, pausado_con_tope = null
 where estado <> 'pausado' and (pausado_por_plan_en is not null or estado_antes_del_plan is not null or pausado_con_tope is not null);

revoke all on function privado.productos_marca_del_plan() from public, anon, authenticated;
revoke all on function privado.ajustar_productos_al_plan(integer, text, integer) from public, anon, authenticated;
revoke all on function privado.cambiar_estado_producto(integer, integer, text) from public, anon, authenticated;
grant execute on function privado.ajustar_productos_al_plan(integer, text, integer) to service_role;
grant execute on function privado.cambiar_estado_producto(integer, integer, text) to service_role;

notify pgrst, 'reload schema';

-- Verificación: tiene que dar todo true.
select jsonb_build_object(
  'columna', exists (select 1 from information_schema.columns
     where table_schema = 'public' and table_name = 'productos' and column_name = 'pausado_con_tope'),
  'ajustar_con_tope', position('pausado_con_tope' in pg_get_functiondef(
     'privado.ajustar_productos_al_plan(integer, text, integer)'::regprocedure)) > 0,
  'reactivar_borra_tope', position('pausado_con_tope' in pg_get_functiondef(
     'privado.cambiar_estado_producto(integer, integer, text)'::regprocedure)) > 0,
  'pausados_con_tope', (select count(*) = 0 from public.productos
     where pausado_por_plan_en is not null and pausado_con_tope is null),
  'disparador', exists (select 1 from pg_trigger
     where tgrelid = 'public.productos'::regclass and tgname = 'productos_marca_del_plan' and not tgisinternal),
  'marca_solo_en_pausados', (select count(*) = 0 from public.productos
     where estado <> 'pausado' and (pausado_por_plan_en is not null or pausado_con_tope is not null))
) as verificacion;

commit;

-- ============================================================================
-- Para deshacer (en transacción): volver ajustar_productos_al_plan y
-- cambiar_estado_producto a las de la 050 (copiarlas de ese archivo) y
--   drop trigger if exists productos_marca_del_plan on public.productos;
--   drop function if exists privado.productos_marca_del_plan();
--   alter table public.productos drop constraint if exists productos_pausado_con_tope_check,
--     drop column if exists pausado_con_tope;
--   notify pgrst, 'reload schema';
-- ============================================================================
