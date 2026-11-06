-- ============================================================================
-- Bahía Shops · 050 · Cuando una tienda deja de pagar (tanda F4a)
-- (06/11/2026)
-- Correr entero en el SQL Editor de Supabase. Va en transacción: si algo
-- falla, no cambia nada. Se puede correr dos veces sin romper nada.
--
-- CORRERLA ANTES DE PUBLICAR EL CÓDIGO QUE LA ACOMPAÑA. El código nuevo lee
-- las columnas y las funciones nuevas (el panel, la ficha, la tarea diaria y
-- «Quitar condiciones»). Con la migración corrida y el código viejo publicado
-- no se rompe nada: plan_de_tienda suma claves que el código viejo no lee, y
-- la pausa por tiempo no corre hasta que la llame alguien (la tarea diaria
-- nueva o pg_cron, que se agenda DESPUÉS de publicar el código: ver el final).
-- Lo único que actúa enseguida es registrar_cobro_suscripcion, que restaura
-- (o, con un cobro devuelto, hace caer) al momento; el paso 10 deja como ya
-- caídas las suscripciones que cobraron y hoy no dan el plan, para que nada
-- de antes se pause.
--
-- Cómo funciona (decidido el 05/11 y el 06/11):
--   · Una suscripción con un cobro rechazado sigue al día 10 días después de
--     pagado_hasta (la gracia, 048). cobro_fallido_desde lo anota.
--   · Cuando el plan pago termina (fin de la gracia o del mes pago de una
--     baja), la tienda «cae»: queda una fila en plan_caidas y se pausan los
--     productos que pasan del tope del Gratis. Quedan publicados los primeros
--     que cargó (por creado_en), entre los que se ven o están por verse
--     (activo, agotado, en_revision); los que ella había pausado no cambian.
--   · Por falta de pago, además, el servidor cancela la suscripción en
--     Mercado Pago (la tarea diaria; acá queda anotado si falló).
--   · Si vuelve a pagar, se restauran solos los pausados por el sistema, a su
--     estado de antes (uno en revisión vuelve a revisión), mientras entren en
--     el tope.
--   · Quitar las condiciones de un plan a medida pago pausa lo que pasa del
--     tope del plan que queda (motivo condiciones_quitadas). Las de $0 no.
--
-- Qué hace:
--   1. productos: pausado_por_plan_en y estado_antes_del_plan.
--   2. vendedor_suscripciones: las marcas de los mails del cobro rechazado.
--   3. public.plan_caidas.
--   4. privado.ajustar_productos_al_plan: la caída y la restauración.
--   5. privado.registrar_cobro_suscripcion (048): + cobro_fallido_desde, y al
--      final ajusta los productos.
--   6. privado.aplicar_caidas_vencidas: la red por tiempo (pg_cron y la tarea
--      diaria).
--   7. privado.cambiar_estado_producto (047): reactivar un pausado por el
--      plan.
--   8. privado.plan_de_tienda (048): + la caída abierta, los pausados por el
--      plan y el cobro fallido.
--   9. Permisos y las puertas para el servidor (solo service_role).
--  10. Las suscripciones que ya cobraron y hoy no dan el plan: caídas
--      cerradas, sin pausar nada.
-- ============================================================================

begin;

-- ---------------------------------------------------------------------------
-- 1. Productos pausados por el plan
--
-- pausado_por_plan_en    cuándo lo pausó el sistema. null = no lo pausó el
--                        sistema (aunque esté pausado: lo pausó ella).
-- estado_antes_del_plan  a qué vuelve al restaurarse: 'activo', 'agotado' o
--                        'en_revision' (uno sin aprobar no se publica solo).
-- ---------------------------------------------------------------------------
alter table public.productos add column if not exists pausado_por_plan_en timestamptz;
alter table public.productos add column if not exists estado_antes_del_plan text;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'productos_estado_antes_del_plan_check') then
    alter table public.productos add constraint productos_estado_antes_del_plan_check
      check (estado_antes_del_plan is null or estado_antes_del_plan in ('activo', 'agotado', 'en_revision'));
  end if;
end $$;

create index if not exists productos_pausados_por_plan
  on public.productos (vendedor_id, creado_en) where pausado_por_plan_en is not null;

-- ---------------------------------------------------------------------------
-- 2. Los mails del cobro rechazado (los reclama la tarea diaria antes de
-- mandarlos; se sueltan cuando vuelve a cobrar, así un rechazo futuro avisa
-- de nuevo).
--
-- aviso_rechazo_en     mail 1: Mercado Pago no pudo cobrar.
-- aviso_fin_gracia_en  mail 2: te quedan 3 días.
-- ---------------------------------------------------------------------------
alter table public.vendedor_suscripciones add column if not exists aviso_rechazo_en timestamptz;
alter table public.vendedor_suscripciones add column if not exists aviso_fin_gracia_en timestamptz;

-- ---------------------------------------------------------------------------
-- 3. Las caídas de plan
--
-- Una fila cada vez que una tienda pierde un plan pago. Abierta (restaurada_en
-- null) mientras no vuelva a pagar: de acá salen «Tu plan volvió al
-- Gratis…», el mail 3 y la ficha.
--
-- suscripcion_id   la suscripción que dejó de dar el plan (una caída por
--                  suscripción).
-- a_medida         era un plan a medida (condiciones con precio).
-- tope_antes       el del plan que perdió; tope_despues, el que quedó. Se
--                  restaura cuando el plan vuelve a dar más que tope_despues.
-- motivo           falta_de_pago · baja · devolucion (se devolvió el cobro) ·
--                  condiciones_quitadas
-- pausados         cuántos productos pausó el sistema.
-- restaurada_en    volvió a pagar (o la reemplazó otra caída: reemplazada_por).
-- aviso_mail_en    el mail 3 (lo reclama la tarea diaria).
-- mp_cancelada_en, intentos_cancelar_mp, error_cancelar_mp
--                  la cancelación en Mercado Pago de una caída por falta de
--                  pago (la hace la tarea diaria; si falla, la reintenta).
-- ---------------------------------------------------------------------------
create table if not exists public.plan_caidas (
  id bigint generated always as identity primary key,
  vendedor_id integer not null references public.vendedores (id) on delete cascade,
  suscripcion_id bigint references public.vendedor_suscripciones (id),
  plan_clave text not null references public.planes (clave),
  a_medida boolean not null default false,
  tope_antes integer,
  tope_despues integer,
  motivo text not null,
  cayo_en timestamptz not null default now(),
  pausados integer not null default 0,
  restaurada_en timestamptz,
  restaurados integer,
  reemplazada_por bigint references public.plan_caidas (id),
  aviso_mail_en timestamptz,
  mp_cancelada_en timestamptz,
  intentos_cancelar_mp integer not null default 0,
  error_cancelar_mp text,
  constraint plan_caidas_motivo_check
    check (motivo in ('falta_de_pago', 'baja', 'devolucion', 'condiciones_quitadas')),
  constraint plan_caidas_error_check check (error_cancelar_mp is null or char_length(error_cancelar_mp) <= 300)
);

-- Una abierta por tienda; una por suscripción (no se cae dos veces de lo
-- mismo). Las de condiciones quitadas no cuentan para esta última: la
-- suscripción sigue dando el Básico.
create unique index if not exists plan_caidas_una_abierta
  on public.plan_caidas (vendedor_id) where restaurada_en is null;
create unique index if not exists plan_caidas_una_por_suscripcion
  on public.plan_caidas (suscripcion_id) where suscripcion_id is not null and motivo <> 'condiciones_quitadas';

alter table public.plan_caidas enable row level security;
revoke all on table public.plan_caidas from public, anon, authenticated;
grant select, insert, update on table public.plan_caidas to service_role;

-- ---------------------------------------------------------------------------
-- 4. Ajustar los productos al plan
--
-- Una sola función para las dos direcciones; se puede llamar cuantas veces se
-- quiera. Bloquea la tienda igual que guardar_producto (tienda primero,
-- después productos): una carga, una reactivación y un ajuste no se cruzan.
--
--   Restaurar: hay una caída abierta, el plan que rige no es el Gratis y su
--   tope es mayor que el que quedó (o no tiene tope). Vuelven a su estado los
--   pausados por el plan, del más viejo al más nuevo, mientras entren en el
--   tope. La caída se cierra.
--
--   Caer:
--     · Sola (p_motivo null): el plan que rige es el Gratis (origen 'gratis':
--       una condición de $0 no cae) y la tienda tiene una suscripción que
--       alguna vez cobró y no tiene caída. Si había otra caída abierta (por
--       condiciones quitadas), queda reemplazada por esta.
--     · p_motivo = 'condiciones_quitadas': la llama «Quitar condiciones» con
--       p_tope_antes (el tope del plan a medida que se quitó).
--     Se anota la caída y, entre los que se ven o están por verse (activo,
--     agotado, en_revision), quedan los primeros que cargó (creado_en, id)
--     hasta el tope; el resto pasa a 'pausado' con la marca.
--
-- Devuelve { pausados, restaurados, caida } (caida: el id de la caída que
-- abrió o cerró, o null).
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

  -- ── Restaurar ──
  if p_motivo is null and v_caida.id is not null and not v_gratis
     and (v_tope is null or v_tope > coalesce(v_caida.tope_despues, 0)) then
    select count(*) into v_visibles from public.productos
     where vendedor_id = p_vendedor_id and estado in ('activo', 'agotado', 'en_revision');
    with candidatos as (
      select id from public.productos
       where vendedor_id = p_vendedor_id and pausado_por_plan_en is not null and estado = 'pausado'
       order by creado_en, id
       limit case when v_tope is null then null else greatest(v_tope - v_visibles, 0) end
    ), hechos as (
      update public.productos p set
        estado = coalesce(p.estado_antes_del_plan, 'activo'),
        pausado_por_plan_en = null,
        estado_antes_del_plan = null,
        actualizado_en = now()
      from candidatos c
      where p.id = c.id
      returning p.id
    )
    select count(*) into v_restaurados from hechos;
    update public.plan_caidas set restaurada_en = now(), restaurados = v_restaurados where id = v_caida.id;
    return jsonb_build_object('pausados', 0, 'restaurados', v_restaurados, 'caida', v_caida.id);
  end if;

  select * into v_especial from public.vendedor_planes where vendedor_id = p_vendedor_id;

  -- ── Caer ──
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
      return jsonb_build_object('pausados', 0, 'restaurados', 0, 'caida', null);
    end if;
    -- La última suscripción que alguna vez cobró y todavía no cayó.
    select s.* into v_sus from public.vendedor_suscripciones s
     where s.vendedor_id = p_vendedor_id and s.primer_cobro_en is not null
       and not exists (select 1 from public.plan_caidas c
                        where c.suscripcion_id = s.id and c.motivo <> 'condiciones_quitadas')
     order by coalesce(s.pagado_hasta, s.cancelada_en, s.creada_en) desc, s.id desc
     limit 1;
    if v_sus.id is null then
      return jsonb_build_object('pausados', 0, 'restaurados', 0, 'caida', null);
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

  -- Había otra abierta (condiciones quitadas): esta la reemplaza.
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
    return jsonb_build_object('pausados', 0, 'restaurados', 0, 'caida', null);
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
        actualizado_en = now()
      from visibles v
      where p.id = v.id and v.n > v_tope
      returning p.id
    )
    select count(*) into v_pausados from hechos;
    update public.plan_caidas set pausados = v_pausados where id = v_id;
  end if;

  return jsonb_build_object('pausados', v_pausados, 'restaurados', 0, 'caida', v_id);
end;
$$;

-- ---------------------------------------------------------------------------
-- 5. Guardar un cobro (048) + el cobro fallido + ajustar los productos
--
-- Igual a la de la 048, más:
--   · cobro_fallido_desde: el primer cobro rechazado (o en reintento,
--     'recycling') posterior al último aprobado; null si no hay. Cuando vuelve
--     a cobrar se borra y se sueltan las marcas de los mails.
--   · Al final, ajustar_productos_al_plan: si volvió a pagar, restaura; si un
--     reembolso le sacó el plan, cae.
-- Devuelve { ok, pagado_hasta, cobro_fallido_desde, ajuste } o
-- { ok: false, motivo: 'no_existe' }.
-- ---------------------------------------------------------------------------
create or replace function privado.registrar_cobro_suscripcion(
  p_suscripcion_id bigint, p_mp_cobro_id text, p_mp_pago_id text,
  p_estado_cobro text, p_estado_pago text, p_monto numeric, p_cobrado_en timestamptz)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_id bigint;
  v_hasta timestamptz;
  v_ultimo timestamptz;
  v_fallido timestamptz;
  v_vendedor integer;
  v_ajuste jsonb;
begin
  perform 1 from public.vendedor_suscripciones where id = p_suscripcion_id for update;
  if not found then
    return jsonb_build_object('ok', false, 'motivo', 'no_existe');
  end if;

  select id into v_id from public.suscripcion_cobros
   where (p_mp_cobro_id is not null and mp_cobro_id = p_mp_cobro_id)
      or (p_mp_pago_id is not null and mp_pago_id = p_mp_pago_id)
   order by id
   limit 1;

  if v_id is null then
    insert into public.suscripcion_cobros (suscripcion_id, mp_cobro_id, mp_pago_id, estado_cobro, estado_pago, monto, cobrado_en)
    values (p_suscripcion_id, p_mp_cobro_id, p_mp_pago_id, p_estado_cobro, p_estado_pago, p_monto, p_cobrado_en);
  else
    update public.suscripcion_cobros set
      mp_cobro_id = coalesce(mp_cobro_id, p_mp_cobro_id),
      mp_pago_id = coalesce(mp_pago_id, p_mp_pago_id),
      estado_cobro = coalesce(p_estado_cobro, estado_cobro),
      estado_pago = coalesce(p_estado_pago, estado_pago),
      monto = coalesce(p_monto, monto),
      cobrado_en = coalesce(cobrado_en, p_cobrado_en),
      actualizado_en = now()
    where id = v_id;
  end if;

  update public.vendedor_suscripciones s set
    ultimo_cobro_en = x.ultimo,
    ultimo_cobro_monto = x.monto_ultimo,
    primer_cobro_en = coalesce(s.primer_cobro_en, x.primero),
    primer_pago_id = coalesce(s.primer_pago_id, x.primer_pago),
    pagado_hasta = x.ultimo + interval '1 month',
    actualizada_en = now()
  from (
    select max(cobrado_en) as ultimo,
           min(cobrado_en) as primero,
           (array_agg(monto order by cobrado_en desc))[1] as monto_ultimo,
           (array_agg(mp_pago_id order by cobrado_en))[1] as primer_pago
      from public.suscripcion_cobros
     where suscripcion_id = p_suscripcion_id and estado_pago = 'approved' and cobrado_en is not null
  ) x
  where s.id = p_suscripcion_id
  returning s.pagado_hasta, s.ultimo_cobro_en, s.vendedor_id into v_hasta, v_ultimo, v_vendedor;

  select min(c.cobrado_en) into v_fallido
    from public.suscripcion_cobros c
   where c.suscripcion_id = p_suscripcion_id
     and c.cobrado_en is not null
     and coalesce(c.estado_pago, '') <> 'approved'
     and (c.estado_pago in ('rejected', 'cancelled') or c.estado_cobro = 'recycling')
     and c.cobrado_en > coalesce(v_ultimo, '-infinity'::timestamptz);

  update public.vendedor_suscripciones set
    cobro_fallido_desde = v_fallido,
    aviso_rechazo_en = case when v_fallido is null then null else aviso_rechazo_en end,
    aviso_fin_gracia_en = case when v_fallido is null then null else aviso_fin_gracia_en end
  where id = p_suscripcion_id;

  if v_vendedor is not null then
    v_ajuste := privado.ajustar_productos_al_plan(v_vendedor, null, null);
  end if;

  return jsonb_build_object('ok', true, 'pagado_hasta', v_hasta, 'cobro_fallido_desde', v_fallido, 'ajuste', v_ajuste);
end;
$$;

-- ---------------------------------------------------------------------------
-- 6. La red por tiempo: las tiendas cuyo plan pago ya terminó (fin de la
-- gracia o del mes pago de una baja) y todavía no cayeron. La llaman pg_cron
-- (cada hora) y la tarea diaria. Devuelve cuántas cayeron.
-- ---------------------------------------------------------------------------
create or replace function privado.aplicar_caidas_vencidas()
returns integer
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v record;
  v_n integer := 0;
  v_r jsonb;
begin
  for v in
    select distinct s.vendedor_id
      from public.vendedor_suscripciones s
     where s.vendedor_id is not null
       and s.primer_cobro_en is not null
       and not exists (select 1 from public.plan_caidas c
                        where c.suscripcion_id = s.id and c.motivo <> 'condiciones_quitadas')
       and not exists (select 1 from privado.suscripcion_al_dia(s.vendedor_id))
  loop
    v_r := privado.ajustar_productos_al_plan(v.vendedor_id, null, null);
    if v_r ->> 'caida' is not null then
      v_n := v_n + 1;
    end if;
  end loop;
  return v_n;
end;
$$;

-- ---------------------------------------------------------------------------
-- 7. Pausar y reactivar (047), con los pausados por el plan
--
-- Igual a la de la 047, más: un pausado por el plan que ella reactiva vuelve
-- a su estado de antes ('en_revision' si no estaba aprobado) y pierde la
-- marca (ya no se restaura solo). El tope se controla igual: en el tope se
-- puede, por encima no.
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
    actualizado_en = now()
  where id = p_producto_id;
  return jsonb_build_object('ok', true, 'estado', v_final);
end;
$$;

-- ---------------------------------------------------------------------------
-- 8. El plan para el panel (048) + la caída abierta, los pausados por el plan
-- y el cobro fallido.
-- ---------------------------------------------------------------------------
create or replace function privado.plan_de_tienda(p_vendedor_id integer)
returns jsonb
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select privado.plan_efectivo(p_vendedor_id) || jsonb_build_object(
    'usados', (select count(*) from public.productos where vendedor_id = p_vendedor_id),
    'pausados_por_plan', (select count(*) from public.productos
                           where vendedor_id = p_vendedor_id and pausado_por_plan_en is not null),
    'suscripcion', (
      select jsonb_build_object(
        'estado', s.estado, 'monto', s.monto, 'plan', s.plan_clave,
        'pagado_hasta', s.pagado_hasta, 'proximo_cobro_en', s.proximo_cobro_en,
        'ultimo_cobro_en', s.ultimo_cobro_en, 'ultimo_cobro_monto', s.ultimo_cobro_monto,
        'creada_en', s.creada_en, 'cancelada_en', s.cancelada_en,
        'primer_cobro_en', s.primer_cobro_en, 'cobro_fallido_desde', s.cobro_fallido_desde)
        from public.vendedor_suscripciones s
       where s.vendedor_id = p_vendedor_id
       order by s.creada_en desc, s.id desc
       limit 1),
    'diferencia', (
      select jsonb_build_object('estado', d.estado, 'monto', d.monto, 'precio_nuevo', d.precio_nuevo, 'creada_en', d.creada_en)
        from public.suscripcion_diferencias d
       where d.vendedor_id = p_vendedor_id and d.estado = 'pendiente'
       order by d.creada_en desc
       limit 1),
    'caida', (
      select jsonb_build_object(
        'plan', c.plan_clave, 'nombre', pl.nombre, 'a_medida', c.a_medida, 'motivo', c.motivo,
        'cayo_en', c.cayo_en, 'pausados', c.pausados, 'tope_antes', c.tope_antes, 'tope_despues', c.tope_despues)
        from public.plan_caidas c
        join public.planes pl on pl.clave = c.plan_clave
       where c.vendedor_id = p_vendedor_id and c.restaurada_en is null))
$$;

-- ---------------------------------------------------------------------------
-- 9. Permisos y las puertas para el servidor (solo service_role)
-- ---------------------------------------------------------------------------
revoke all on function privado.ajustar_productos_al_plan(integer, text, integer) from public, anon, authenticated;
revoke all on function privado.aplicar_caidas_vencidas() from public, anon, authenticated;
revoke all on function privado.registrar_cobro_suscripcion(bigint, text, text, text, text, numeric, timestamptz) from public, anon, authenticated;
revoke all on function privado.cambiar_estado_producto(integer, integer, text) from public, anon, authenticated;
revoke all on function privado.plan_de_tienda(integer) from public, anon, authenticated;
grant execute on function privado.ajustar_productos_al_plan(integer, text, integer) to service_role;
grant execute on function privado.aplicar_caidas_vencidas() to service_role;
grant execute on function privado.registrar_cobro_suscripcion(bigint, text, text, text, text, numeric, timestamptz) to service_role;
grant execute on function privado.cambiar_estado_producto(integer, integer, text) to service_role;
grant execute on function privado.plan_de_tienda(integer) to service_role;

create or replace function public.rpc_ajustar_productos_al_plan(
  p_vendedor_id integer, p_motivo text default null, p_tope_antes integer default null)
returns jsonb
language sql
security definer
set search_path = public, pg_temp
as $$ select privado.ajustar_productos_al_plan(p_vendedor_id, p_motivo, p_tope_antes) $$;

create or replace function public.rpc_aplicar_caidas_vencidas()
returns integer
language sql
security definer
set search_path = public, pg_temp
as $$ select privado.aplicar_caidas_vencidas() $$;

revoke all on function public.rpc_ajustar_productos_al_plan(integer, text, integer) from public, anon, authenticated;
revoke all on function public.rpc_aplicar_caidas_vencidas() from public, anon, authenticated;
grant execute on function public.rpc_ajustar_productos_al_plan(integer, text, integer) to service_role;
grant execute on function public.rpc_aplicar_caidas_vencidas() to service_role;

-- ---------------------------------------------------------------------------
-- 10. Lo de antes no cae: las suscripciones que ya cobraron y hoy no dan el
-- plan (las pruebas de F3 en la tienda 15) quedan con una caída cerrada, sin
-- pausar nada. Correrla dos veces no suma filas (una por suscripción).
-- ---------------------------------------------------------------------------
insert into public.plan_caidas (vendedor_id, suscripcion_id, plan_clave, motivo, cayo_en, restaurada_en, restaurados)
select s.vendedor_id, s.id, s.plan_clave,
       case when s.pagado_hasta is null then 'devolucion' when s.estado = 'cancelled' then 'baja' else 'falta_de_pago' end,
       now(), now(), 0
  from public.vendedor_suscripciones s
 where s.vendedor_id is not null
   and s.primer_cobro_en is not null
   and not exists (select 1 from privado.suscripcion_al_dia(s.vendedor_id) a where a.id = s.id)
on conflict do nothing;

notify pgrst, 'reload schema';

-- Verificación: tiene que dar todo true.
select jsonb_build_object(
  'columnas_productos', (select count(*) = 2 from information_schema.columns
     where table_schema = 'public' and table_name = 'productos'
       and column_name in ('pausado_por_plan_en', 'estado_antes_del_plan')),
  'columnas_suscripciones', (select count(*) = 2 from information_schema.columns
     where table_schema = 'public' and table_name = 'vendedor_suscripciones'
       and column_name in ('aviso_rechazo_en', 'aviso_fin_gracia_en')),
  'plan_caidas', to_regclass('public.plan_caidas') is not null,
  'ajustar', to_regprocedure('privado.ajustar_productos_al_plan(integer, text, integer)') is not null,
  'caidas_vencidas', to_regprocedure('public.rpc_aplicar_caidas_vencidas()') is not null,
  'cobro_ajusta', position('ajustar_productos_al_plan' in pg_get_functiondef(
     'privado.registrar_cobro_suscripcion(bigint, text, text, text, text, numeric, timestamptz)'::regprocedure)) > 0,
  'reactivar_con_marca', position('estado_antes_del_plan' in pg_get_functiondef(
     'privado.cambiar_estado_producto(integer, integer, text)'::regprocedure)) > 0,
  'plan_de_tienda_caida', position('plan_caidas' in pg_get_functiondef('privado.plan_de_tienda(integer)'::regprocedure)) > 0,
  'nada_pausado', (select count(*) = 0 from public.productos where pausado_por_plan_en is not null),
  'ninguna_caida_abierta', (select count(*) = 0 from public.plan_caidas where restaurada_en is null)
) as verificacion;

commit;

-- ============================================================================
-- DESPUÉS DE PUBLICAR EL CÓDIGO: pg_cron cada hora (aparte, no en esta
-- transacción). Con pg_cron activado (Database → Extensions → pg_cron):
--
--   select cron.schedule('bs-caidas-de-plan', '7 * * * *', $$select privado.aplicar_caidas_vencidas()$$);
--
-- Con el mismo nombre reemplaza la anterior. Para sacarlo:
--   select cron.unschedule('bs-caidas-de-plan');
-- ============================================================================

-- ============================================================================
-- Para deshacer (en transacción): sacar el cron; volver
-- registrar_cobro_suscripcion y plan_de_tienda a las de la 048 y
-- cambiar_estado_producto a la de la 047 (copiarlas de esos archivos);
-- devolver los pausados por el plan:
--   update public.productos set estado = estado_antes_del_plan, pausado_por_plan_en = null,
--     estado_antes_del_plan = null where pausado_por_plan_en is not null;
-- y después:
--   drop function if exists public.rpc_aplicar_caidas_vencidas();
--   drop function if exists public.rpc_ajustar_productos_al_plan(integer, text, integer);
--   drop function if exists privado.aplicar_caidas_vencidas();
--   drop function if exists privado.ajustar_productos_al_plan(integer, text, integer);
--   drop table if exists public.plan_caidas;
--   alter table public.vendedor_suscripciones drop column if exists aviso_rechazo_en,
--     drop column if exists aviso_fin_gracia_en;
--   alter table public.productos drop constraint if exists productos_estado_antes_del_plan_check,
--     drop column if exists pausado_por_plan_en, drop column if exists estado_antes_del_plan;
--   notify pgrst, 'reload schema';
-- ============================================================================
