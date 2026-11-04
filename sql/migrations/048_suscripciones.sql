-- ============================================================================
-- Bahía Shops · 048 · Suscripciones del plan con Mercado Pago (tanda F3.1)
-- (04/11/2026)
-- Correr entero en el SQL Editor de Supabase. Va en transacción: si algo
-- falla, no cambia nada. Se puede correr dos veces sin romper nada.
--
-- CORRERLA ANTES DE PUBLICAR EL CÓDIGO QUE LA ACOMPAÑA. El código nuevo lee y
-- escribe las tablas nuevas (la tarea diaria, el webhook, el panel y la ficha
-- del admin): sin la migración, esas partes fallan. Con la migración corrida
-- y el código viejo publicado no se rompe nada: nadie crea suscripciones, así
-- que plan_efectivo devuelve lo mismo que hoy para todas las tiendas (no hay
-- condiciones especiales con precio: consulta 1 del 04/11, sin filas), y
-- plan_de_tienda suma dos claves que el código viejo no lee.
--
-- Cómo funciona (lo confirmó el sondeo con cuentas de prueba, 04/11):
--   · La tienda se suscribe a la cuenta de la plataforma (POST /preapproval
--     sin plan, status 'pending'), paga en el init_point y la suscripción
--     pasa a 'authorized'. El primer cobro es al autorizar; Mercado Pago
--     vuelve a cobrar a mes exacto. Cancelada, el estado es 'cancelled'.
--   · Cada cobro (authorized_payment) dice su suscripción (preapproval_id) y
--     su pago (payment.id, payment.status). Se guarda en suscripcion_cobros, y
--     las fechas de la suscripción salen siempre de TODOS los cobros aprobados:
--     procesar dos veces el mismo aviso no cambia nada, y un reembolso deja de
--     contar.
--   · «Al día»: hasta pagado_hasta (último cobro aprobado + 1 mes) más 10 días
--     de gracia, los de los reintentos de Mercado Pago. Cancelada, sin gracia.
--   · Plan a medida con el Básico ya pagado: la tienda paga la diferencia
--     proporcional del mes con un pago único (suscripcion_diferencias). Con
--     ese pago aprobado (o sin cobro, si no llega al mínimo de Mercado Pago)
--     la condición especial vale hasta el próximo cobro, que ya es por el
--     monto nuevo (el servidor lo cambia en Mercado Pago).
--
-- Qué hace:
--   1. public.vendedor_suscripciones: una fila por suscripción de Mercado
--      Pago. Una sola viva por tienda.
--   2. public.suscripcion_cobros: los cobros de cada suscripción.
--   3. public.suscripcion_diferencias: los pagos de la diferencia de un plan
--      a medida.
--   4. privado.registrar_cobro_suscripcion: guarda un cobro y recalcula las
--      fechas.
--   5. privado.registrar_pago_diferencia: guarda el pago de una diferencia.
--   6. privado.suscripcion_al_dia: la suscripción que hoy da el plan.
--   7. privado.plan_efectivo (046) con la suscripción (ver el paso 7).
--   8. privado.plan_de_tienda (047) con la última suscripción y la
--      diferencia pendiente, para el panel.
--   9. Un disparador en vendedores: no se cierra ni se borra una tienda con
--      una suscripción que Mercado Pago todavía puede cobrar (el servidor la
--      cancela antes; esto es la red).
--  10. Permisos y las puertas para el servidor: rpc_registrar_cobro_suscripcion
--      y rpc_registrar_pago_diferencia, solo service_role.
--
-- Nada de esto lo lee el navegador: las tablas no tienen permisos para anon
-- ni authenticated.
-- ============================================================================

-- ============================================================================
-- PASO 0 (correr ANTES, aparte; no cambia nada). Hechas el 04/11:
--   select vendedor_id, plan_clave, tope_productos, sin_tope, precio_especial
--     from public.vendedor_planes order by vendedor_id;            -- sin filas
--   select tgname from pg_trigger where tgrelid = 'public.vendedores'::regclass
--     and not tgisinternal;                       -- ninguno de delete ni cerrada_en
-- ============================================================================

begin;

create schema if not exists privado;
grant usage on schema privado to service_role;

-- ---------------------------------------------------------------------------
-- 1. Las suscripciones
--
-- estado       el de Mercado Pago ('pending', 'authorized', 'paused',
--              'cancelled') o el nuestro mientras se crea ('creando') o si
--              Mercado Pago la rechazó ('error').
-- monto        lo que Mercado Pago cobra por mes, en pesos.
-- pagado_hasta ultimo_cobro_en + 1 mes; lo calcula registrar_cobro_suscripcion.
-- vendedor_id  queda en null si se borra la tienda: el historial de cobros de
--              la plataforma se conserva, sin el mail de pago.
-- primer_cobro_en, primer_pago_id y cobro_fallido_desde quedan para F4 (el
-- botón de arrepentimiento y el cobro fallido).
-- ---------------------------------------------------------------------------
create table if not exists public.vendedor_suscripciones (
  id bigint generated always as identity primary key,
  vendedor_id integer references public.vendedores (id) on delete set null,
  plan_clave text not null references public.planes (clave),
  monto integer not null,
  external_reference text not null unique default ('bs-sus-' || gen_random_uuid()),
  mp_preapproval_id text unique,
  estado text not null default 'creando',
  init_point text,
  payer_email text,
  proximo_cobro_en timestamptz,
  ultimo_cobro_en timestamptz,
  ultimo_cobro_monto numeric(12, 2),
  pagado_hasta timestamptz,
  primer_cobro_en timestamptz,
  primer_pago_id text,
  cobro_fallido_desde timestamptz,
  consultada_en timestamptz,
  creada_en timestamptz not null default now(),
  actualizada_en timestamptz not null default now(),
  cancelada_en timestamptz,
  constraint vendedor_suscripciones_monto_check check (monto > 0),
  constraint vendedor_suscripciones_estado_check check (estado ~ '^[a-z_]{1,30}$')
);

-- Una sola viva por tienda: una que Mercado Pago todavía puede cobrar.
create unique index if not exists vendedor_suscripciones_una_viva
  on public.vendedor_suscripciones (vendedor_id)
  where estado in ('creando', 'pending', 'authorized', 'paused');

-- ---------------------------------------------------------------------------
-- 2. Los cobros
--
-- mp_cobro_id   el authorized_payment de Mercado Pago
-- mp_pago_id    su payment
-- estado_cobro  processed, recycling, … (el del authorized_payment)
-- estado_pago   approved, rejected, refunded, … (el del payment)
-- cobrado_en    debit_date del cobro, o date_approved del pago
-- ---------------------------------------------------------------------------
create table if not exists public.suscripcion_cobros (
  id bigint generated always as identity primary key,
  suscripcion_id bigint not null references public.vendedor_suscripciones (id),
  mp_cobro_id text unique,
  mp_pago_id text unique,
  estado_cobro text,
  estado_pago text,
  monto numeric(12, 2),
  cobrado_en timestamptz,
  creado_en timestamptz not null default now(),
  actualizado_en timestamptz not null default now(),
  constraint suscripcion_cobros_algun_id check (mp_cobro_id is not null or mp_pago_id is not null)
);

create index if not exists suscripcion_cobros_suscripcion on public.suscripcion_cobros (suscripcion_id);

-- ---------------------------------------------------------------------------
-- 3. La diferencia de un plan a medida
--
-- Una tienda que ya paga el Básico y recibe un plan a medida más caro paga la
-- diferencia proporcional de lo que queda del mes con un pago único a la
-- plataforma (una preferencia de Mercado Pago, external_reference 'bs-dif-…').
--
-- estado       'pendiente' (esperando el pago), 'pagada', 'sin_cobro' (la
--              diferencia no llegaba al mínimo de Mercado Pago), 'devuelta'
--              (reembolso o contracargo) o 'vencida' (la reemplazó otra).
-- cubre_hasta  el próximo cobro de la suscripción cuando se calculó: hasta
--              ahí (más la gracia) vale la condición especial sin que la
--              suscripción haya cobrado el monto nuevo.
-- monto_mp_actualizado_en  cuándo Mercado Pago aceptó el monto nuevo de la
--              suscripción. null con la diferencia pagada = hay que
--              reintentarlo (la tarea diaria) y la ficha del admin lo avisa.
-- ---------------------------------------------------------------------------
create table if not exists public.suscripcion_diferencias (
  id bigint generated always as identity primary key,
  suscripcion_id bigint not null references public.vendedor_suscripciones (id),
  vendedor_id integer references public.vendedores (id) on delete set null,
  plan_clave text not null references public.planes (clave),
  precio_nuevo integer not null,
  monto_anterior integer not null,
  monto integer not null,
  cubre_hasta timestamptz not null,
  external_reference text not null unique default ('bs-dif-' || gen_random_uuid()),
  mp_preferencia_id text,
  init_point text,
  mp_pago_id text unique,
  estado text not null default 'pendiente',
  pagada_en timestamptz,
  monto_mp_actualizado_en timestamptz,
  intentos_monto_mp integer not null default 0,
  error_monto_mp text,
  creada_en timestamptz not null default now(),
  actualizada_en timestamptz not null default now(),
  constraint suscripcion_diferencias_precio_check check (precio_nuevo > monto_anterior and monto_anterior > 0),
  constraint suscripcion_diferencias_monto_check check (monto >= 0),
  constraint suscripcion_diferencias_estado_check
    check (estado in ('pendiente', 'pagada', 'sin_cobro', 'devuelta', 'vencida'))
);

-- Una sola esperando el pago por suscripción.
create unique index if not exists suscripcion_diferencias_una_pendiente
  on public.suscripcion_diferencias (suscripcion_id)
  where estado = 'pendiente';

alter table public.vendedor_suscripciones enable row level security;
alter table public.suscripcion_cobros enable row level security;
alter table public.suscripcion_diferencias enable row level security;
revoke all on table public.vendedor_suscripciones from public, anon, authenticated;
revoke all on table public.suscripcion_cobros from public, anon, authenticated;
revoke all on table public.suscripcion_diferencias from public, anon, authenticated;
grant select, insert, update on table public.vendedor_suscripciones to service_role;
grant select, insert, update on table public.suscripcion_cobros to service_role;
grant select, insert, update on table public.suscripcion_diferencias to service_role;

-- ---------------------------------------------------------------------------
-- 4. Guardar un cobro y recalcular las fechas, en una transacción
--
-- Busca el cobro por cualquiera de sus dos ids y completa lo que falte. Las
-- fechas de la suscripción salen de todos los cobros aprobados: el mismo
-- aviso dos veces no cambia nada, y un cobro devuelto deja de contar.
-- Devuelve { ok, pagado_hasta } o { ok: false, motivo: 'no_existe' }.
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
  returning s.pagado_hasta into v_hasta;

  return jsonb_build_object('ok', true, 'pagado_hasta', v_hasta);
end;
$$;

-- ---------------------------------------------------------------------------
-- 5. Guardar el pago de una diferencia
--
-- Aprobado y por el monto (o más): 'pagada'. Devuelto o contracargado:
-- 'devuelta'. Cualquier otro estado no cambia nada. Una diferencia 'vencida'
-- que igual se pagó queda 'pagada': la plata llegó.
-- Devuelve { ok, estado, recien_pagada } o { ok: false, motivo }.
-- ---------------------------------------------------------------------------
create or replace function privado.registrar_pago_diferencia(
  p_diferencia_id bigint, p_mp_pago_id text, p_estado_pago text, p_monto numeric, p_pagado_en timestamptz)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_dif public.suscripcion_diferencias%rowtype;
  v_estado text;
begin
  select * into v_dif from public.suscripcion_diferencias where id = p_diferencia_id for update;
  if not found then
    return jsonb_build_object('ok', false, 'motivo', 'no_existe');
  end if;
  -- Ya la pagó otro pago: este es un pago doble (lo avisa el servidor).
  if v_dif.mp_pago_id is not null and v_dif.mp_pago_id <> p_mp_pago_id then
    return jsonb_build_object('ok', false, 'motivo', 'otro_pago', 'estado', v_dif.estado);
  end if;

  v_estado := case
    when p_estado_pago = 'approved' and p_monto >= v_dif.monto then 'pagada'
    when p_estado_pago in ('refunded', 'charged_back') and v_dif.estado = 'pagada' then 'devuelta'
    else v_dif.estado
  end;

  update public.suscripcion_diferencias set
    -- Un intento rechazado no se queda con la diferencia: puede pagarla otro.
    mp_pago_id = coalesce(mp_pago_id, case when v_estado = 'pagada' then p_mp_pago_id end),
    estado = v_estado,
    pagada_en = case when v_estado = 'pagada' then coalesce(pagada_en, p_pagado_en, now()) else pagada_en end,
    actualizada_en = now()
  where id = p_diferencia_id;

  return jsonb_build_object('ok', true, 'estado', v_estado,
                            'recien_pagada', v_estado = 'pagada' and v_dif.estado <> 'pagada');
end;
$$;

-- ---------------------------------------------------------------------------
-- 6. La suscripción al día de una tienda (o ninguna fila)
-- ---------------------------------------------------------------------------
create or replace function privado.suscripcion_al_dia(p_vendedor_id integer)
returns setof public.vendedor_suscripciones
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select s.* from public.vendedor_suscripciones s
   where s.vendedor_id = p_vendedor_id
     and s.pagado_hasta is not null
     and now() < s.pagado_hasta
                 + case when s.estado = 'cancelled' then interval '0' else interval '10 days' end
   order by s.pagado_hasta desc
   limit 1
$$;

-- ---------------------------------------------------------------------------
-- 7. El plan que rige (046), con la suscripción
--
--   a) Condición especial que cuesta 0 (precio_especial = 0, o vacío en un
--      plan que vale 0): vale sin suscripción.
--   b) Condición especial con precio (el suyo o, si está vacío, el del
--      plan): vale con una suscripción al día cuyo último cobro aprobado
--      cubra ese precio, o con una diferencia pagada (o sin cobro) por ese
--      precio que todavía cubra (cubre_hasta + 10 días). Si no, queda
--      anotada en especial_pendiente y se sigue con c).
--   c) Suscripción al día: su plan, origen 'suscripcion'.
--   d) Si no, el Gratis.
--
-- Devuelve lo mismo que la 046 (origen suma 'suscripcion') más
-- especial_pendiente: { plan, precio } o null.
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
  v_hay_especial boolean;
  v_sus public.vendedor_suscripciones%rowtype;
  v_plan public.planes%rowtype;
  v_origen text;
  v_precio integer;
  v_pendiente jsonb := null;
  v_sin_tope boolean := false;
  v_tope integer;
begin
  select * into v_especial from public.vendedor_planes where vendedor_id = p_vendedor_id;
  v_hay_especial := found;
  select * into v_sus from privado.suscripcion_al_dia(p_vendedor_id);

  if v_hay_especial then
    select * into v_plan from public.planes where clave = v_especial.plan_clave;
    v_precio := coalesce(v_especial.precio_especial, v_plan.precio_mensual, 0);
    if v_precio = 0
       or (v_sus.id is not null and v_sus.ultimo_cobro_monto >= v_precio)
       or (v_sus.id is not null and exists (
             select 1 from public.suscripcion_diferencias d
              where d.suscripcion_id = v_sus.id
                and d.estado in ('pagada', 'sin_cobro')
                and d.precio_nuevo >= v_precio
                and now() < d.cubre_hasta + interval '10 days')) then
      v_origen := 'especial';
    else
      v_pendiente := jsonb_build_object('plan', v_plan.clave, 'precio', v_precio);
    end if;
  end if;

  if v_origen is null and v_sus.id is not null then
    select * into v_plan from public.planes where clave = v_sus.plan_clave;
    v_origen := 'suscripcion';
  end if;

  if v_origen is null then
    select * into v_plan from public.planes where clave = 'gratis';
    v_origen := 'gratis';
  end if;

  if v_origen = 'especial' then
    v_sin_tope := v_especial.sin_tope;
    v_tope := case when v_sin_tope then null else coalesce(v_especial.tope_productos, v_plan.tope_productos) end;
  else
    v_tope := v_plan.tope_productos;
  end if;

  -- No debería pasar (las restricciones y los disparadores de la 046 lo
  -- frenan), pero si pasa, mejor un error claro que un tope inventado.
  if v_plan.clave is null or v_plan.fotos_por_producto is null or (v_tope is null and not v_sin_tope) then
    raise exception 'El plan de la tienda % no está completo.', p_vendedor_id using errcode = '55000';
  end if;

  return jsonb_build_object(
    'plan', v_plan.clave,
    'nombre', v_plan.nombre,
    'origen', v_origen,
    'especial', v_origen = 'especial',
    'sin_tope', v_sin_tope,
    'tope_productos', v_tope,
    'fotos_por_producto', v_plan.fotos_por_producto,
    'carritos_abandonados', v_plan.carritos_abandonados,
    'precio_mensual', case when v_origen = 'especial' then v_precio
                           when v_origen = 'suscripcion' then v_sus.monto
                           else v_plan.precio_mensual end,
    'especial_pendiente', v_pendiente
  );
end;
$$;

-- ---------------------------------------------------------------------------
-- 8. El plan que rige, los productos que cuentan (047), la última suscripción
-- y la diferencia esperando el pago, para el panel de la tienda.
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
    'suscripcion', (
      select jsonb_build_object(
        'estado', s.estado, 'monto', s.monto, 'plan', s.plan_clave,
        'pagado_hasta', s.pagado_hasta, 'proximo_cobro_en', s.proximo_cobro_en,
        'ultimo_cobro_en', s.ultimo_cobro_en, 'ultimo_cobro_monto', s.ultimo_cobro_monto,
        'creada_en', s.creada_en, 'cancelada_en', s.cancelada_en)
        from public.vendedor_suscripciones s
       where s.vendedor_id = p_vendedor_id
       order by s.creada_en desc, s.id desc
       limit 1),
    'diferencia', (
      select jsonb_build_object('estado', d.estado, 'monto', d.monto, 'precio_nuevo', d.precio_nuevo, 'creada_en', d.creada_en)
        from public.suscripcion_diferencias d
       where d.vendedor_id = p_vendedor_id and d.estado = 'pendiente'
       order by d.creada_en desc
       limit 1))
$$;

-- ---------------------------------------------------------------------------
-- 9. No se cierra ni se borra una tienda que Mercado Pago todavía puede cobrar
--
-- Cubre borrar_tienda, cerrar_tienda (las llama cerrar_cuenta) y
-- borrar_tienda_de_prueba sin reescribirlas. El servidor cancela antes en
-- Mercado Pago; esto es la red: error BS423 y no cambia nada. Al cerrar o
-- borrar, se borra el mail de pago de sus suscripciones.
-- ---------------------------------------------------------------------------
create or replace function privado.vendedores_sin_suscripcion_viva()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if tg_op = 'DELETE' or (old.cerrada_en is null and new.cerrada_en is not null) then
    if exists (select 1 from public.vendedor_suscripciones
                where vendedor_id = old.id and estado in ('creando', 'pending', 'authorized', 'paused')) then
      raise exception 'La tienda % tiene una suscripción viva en Mercado Pago: hay que cancelarla antes.', old.id
        using errcode = 'BS423';
    end if;
    update public.vendedor_suscripciones set payer_email = null
     where vendedor_id = old.id and payer_email is not null;
  end if;
  return case when tg_op = 'DELETE' then old else new end;
end;
$$;

drop trigger if exists vendedores_sin_suscripcion_viva on public.vendedores;
create trigger vendedores_sin_suscripcion_viva
  before delete or update of cerrada_en on public.vendedores
  for each row execute function privado.vendedores_sin_suscripcion_viva();

-- ---------------------------------------------------------------------------
-- 10. Permisos y las puertas para el servidor
-- ---------------------------------------------------------------------------
revoke all on function privado.registrar_cobro_suscripcion(bigint, text, text, text, text, numeric, timestamptz) from public, anon, authenticated;
revoke all on function privado.registrar_pago_diferencia(bigint, text, text, numeric, timestamptz) from public, anon, authenticated;
revoke all on function privado.suscripcion_al_dia(integer) from public, anon, authenticated;
revoke all on function privado.plan_efectivo(integer) from public, anon, authenticated;
revoke all on function privado.plan_de_tienda(integer) from public, anon, authenticated;
revoke all on function privado.vendedores_sin_suscripcion_viva() from public, anon, authenticated;
grant execute on function privado.registrar_cobro_suscripcion(bigint, text, text, text, text, numeric, timestamptz) to service_role;
grant execute on function privado.registrar_pago_diferencia(bigint, text, text, numeric, timestamptz) to service_role;
grant execute on function privado.plan_de_tienda(integer) to service_role;

create or replace function public.rpc_registrar_cobro_suscripcion(
  p_suscripcion_id bigint, p_mp_cobro_id text, p_mp_pago_id text,
  p_estado_cobro text, p_estado_pago text, p_monto numeric, p_cobrado_en timestamptz)
returns jsonb
language sql
security invoker
as $$ select privado.registrar_cobro_suscripcion(p_suscripcion_id, p_mp_cobro_id, p_mp_pago_id,
                                                 p_estado_cobro, p_estado_pago, p_monto, p_cobrado_en) $$;

create or replace function public.rpc_registrar_pago_diferencia(
  p_diferencia_id bigint, p_mp_pago_id text, p_estado_pago text, p_monto numeric, p_pagado_en timestamptz)
returns jsonb
language sql
security invoker
as $$ select privado.registrar_pago_diferencia(p_diferencia_id, p_mp_pago_id, p_estado_pago, p_monto, p_pagado_en) $$;

revoke all on function public.rpc_registrar_cobro_suscripcion(bigint, text, text, text, text, numeric, timestamptz) from public, anon, authenticated;
revoke all on function public.rpc_registrar_pago_diferencia(bigint, text, text, numeric, timestamptz) from public, anon, authenticated;
grant execute on function public.rpc_registrar_cobro_suscripcion(bigint, text, text, text, text, numeric, timestamptz) to service_role;
grant execute on function public.rpc_registrar_pago_diferencia(bigint, text, text, numeric, timestamptz) to service_role;

-- Para que la API vea las tablas y las funciones nuevas sin esperar.
notify pgrst, 'reload schema';

commit;

-- ============================================================================
-- Verificación (una sola fila; copiá la celda)
--   · tablas: las tres true.
--   · navegador_sin_acceso: false las seis (anon y authenticated no leen
--     ninguna de las tablas).
--   · rpc_*: anon y authenticated false, service_role true.
--   · disparador_cierre: true.
--   · plan_con_suscripcion: true (plan_efectivo nueva).
-- ============================================================================
select jsonb_pretty(jsonb_build_object(
  'tablas', jsonb_build_object(
      'vendedor_suscripciones', to_regclass('public.vendedor_suscripciones') is not null,
      'suscripcion_cobros', to_regclass('public.suscripcion_cobros') is not null,
      'suscripcion_diferencias', to_regclass('public.suscripcion_diferencias') is not null),
  'navegador_sin_acceso', jsonb_build_object(
      'anon_suscripciones',          has_table_privilege('anon',          'public.vendedor_suscripciones', 'select'),
      'authenticated_suscripciones', has_table_privilege('authenticated', 'public.vendedor_suscripciones', 'select'),
      'anon_cobros',                 has_table_privilege('anon',          'public.suscripcion_cobros', 'select'),
      'authenticated_cobros',        has_table_privilege('authenticated', 'public.suscripcion_cobros', 'select'),
      'anon_diferencias',            has_table_privilege('anon',          'public.suscripcion_diferencias', 'select'),
      'authenticated_diferencias',   has_table_privilege('authenticated', 'public.suscripcion_diferencias', 'select')),
  'rpc_registrar_cobro_suscripcion', jsonb_build_object(
      'anon',          has_function_privilege('anon',          'public.rpc_registrar_cobro_suscripcion(bigint, text, text, text, text, numeric, timestamptz)', 'execute'),
      'authenticated', has_function_privilege('authenticated', 'public.rpc_registrar_cobro_suscripcion(bigint, text, text, text, text, numeric, timestamptz)', 'execute'),
      'service_role',  has_function_privilege('service_role',  'public.rpc_registrar_cobro_suscripcion(bigint, text, text, text, text, numeric, timestamptz)', 'execute')),
  'rpc_registrar_pago_diferencia', jsonb_build_object(
      'anon',          has_function_privilege('anon',          'public.rpc_registrar_pago_diferencia(bigint, text, text, numeric, timestamptz)', 'execute'),
      'authenticated', has_function_privilege('authenticated', 'public.rpc_registrar_pago_diferencia(bigint, text, text, numeric, timestamptz)', 'execute'),
      'service_role',  has_function_privilege('service_role',  'public.rpc_registrar_pago_diferencia(bigint, text, text, numeric, timestamptz)', 'execute')),
  'disparador_cierre', exists (select 1 from pg_trigger
      where tgrelid = 'public.vendedores'::regclass and tgname = 'vendedores_sin_suscripcion_viva'),
  'plan_con_suscripcion', position('suscripcion_al_dia' in pg_get_functiondef('privado.plan_efectivo(integer)'::regprocedure)) > 0
)) as verificacion;

-- ============================================================================
-- Para deshacer (correr en transacción). Vuelve plan_efectivo a la de la 046
-- y plan_de_tienda a la de la 047: pegá su definición de esos archivos. Borra
-- las suscripciones guardadas: antes, cancelalas en Mercado Pago. Con el
-- código nuevo publicado, sin la 048 fallan la tarea diaria y el webhook de
-- suscripciones: deshacer también el código.
-- ============================================================================
-- begin;
-- drop trigger if exists vendedores_sin_suscripcion_viva on public.vendedores;
-- drop function if exists privado.vendedores_sin_suscripcion_viva();
-- drop function if exists public.rpc_registrar_pago_diferencia(bigint, text, text, numeric, timestamptz);
-- drop function if exists public.rpc_registrar_cobro_suscripcion(bigint, text, text, text, text, numeric, timestamptz);
-- (plan_efectivo de la 046 y plan_de_tienda de la 047)
-- drop function if exists privado.suscripcion_al_dia(integer);
-- drop function if exists privado.registrar_pago_diferencia(bigint, text, text, numeric, timestamptz);
-- drop function if exists privado.registrar_cobro_suscripcion(bigint, text, text, text, text, numeric, timestamptz);
-- drop table if exists public.suscripcion_diferencias;
-- drop table if exists public.suscripcion_cobros;
-- drop table if exists public.vendedor_suscripciones;
-- notify pgrst, 'reload schema';
-- commit;
-- ============================================================================
