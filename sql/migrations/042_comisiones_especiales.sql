-- ============================================================================
-- Bahía Shops · 042 · Comisión especial por tienda (26/10/2026)
-- Correr entero en el SQL Editor de Supabase. Va en transacción: si algo
-- falla, no cambia nada. Se puede correr dos veces sin romper nada.
--
-- CORRERLA DESPUÉS DE LA 041 Y ANTES DE PUBLICAR EL CÓDIGO QUE LA ACOMPAÑA.
-- El código nuevo lee vendedor_comisiones en CADA compra
-- (/api/pedidos/crear): sin la tabla, no se puede crear ningún pedido. El
-- código de hoy no la usa: correrla antes no cambia nada.
--
-- Qué hace:
--   1. public.vendedor_comisiones: las comisiones especiales que pone el admin
--      (promos, descuentos de rescate, la tienda propia en 0%). Sin permisos
--      para anon ni authenticated: la tienda no la lee ni la escribe; su panel
--      la ve por /api/vendedor/link-propio (sin el motivo).
--        comision_bp   0 a 499 (puntos básicos). Gana la más baja entre esta y
--                      la normal (src/lib/comision.js), así que 500 o más no
--                      tendría efecto.
--        vence_en      null = sin vencimiento.
--        terminada_en  el admin la terminó antes (o la reemplazó otra).
--      Vigente: terminada_en null, desde <= now() y vence_en null o futuro.
--   2. privado.cargar_comision_especial: termina la vigente (si hay) y carga
--      la nueva, en una sola transacción y con la fila de la tienda bloqueada:
--      dos cargas a la vez no dejan dos vigentes.
--   3. privado.terminar_comision_especial: «terminar ahora».
--   4. privado.borrar_tienda: la misma de la 031, con vendedor_comisiones en
--      la lista (no depende de la cascada, como el resto).
--   5. public.rpc_cargar_comision_especial y rpc_terminar_comision_especial:
--      solo service_role, para /api/admin/vendedores/[id]/comisiones.
--
-- creado_por y terminada_por son el id del admin (de la sesión, nunca del
-- body), sin clave foránea: el historial no tiene que frenar que se elimine
-- una cuenta.
-- ============================================================================

begin;

-- ---------------------------------------------------------------------------
-- 1. La tabla
-- ---------------------------------------------------------------------------
create table if not exists public.vendedor_comisiones (
  id bigint generated always as identity primary key,
  vendedor_id integer not null references public.vendedores (id) on delete cascade,
  comision_bp integer not null,
  desde timestamptz not null default now(),
  vence_en timestamptz,
  terminada_en timestamptz,
  terminada_por uuid,
  motivo text not null,
  creado_por uuid not null,
  creado_en timestamptz not null default now(),
  constraint vendedor_comisiones_bp_check check (comision_bp between 0 and 499),
  constraint vendedor_comisiones_motivo_check check (char_length(btrim(motivo)) between 1 and 300),
  constraint vendedor_comisiones_vence_check check (vence_en is null or vence_en > desde),
  constraint vendedor_comisiones_terminada_check check (terminada_en is null or terminada_en >= desde)
);

create index if not exists vendedor_comisiones_vendedor_idx
  on public.vendedor_comisiones (vendedor_id, creado_en desc);

alter table public.vendedor_comisiones enable row level security;
revoke all on table public.vendedor_comisiones from public, anon, authenticated;
grant select, insert, update, delete on table public.vendedor_comisiones to service_role;

-- ---------------------------------------------------------------------------
-- 2. Cargar una especial (termina la vigente)
--
-- Devuelve { ok: true, id, terminadas } o { ok: false, motivo }.
-- ---------------------------------------------------------------------------
create or replace function privado.cargar_comision_especial(
  p_vendedor_id integer, p_comision_bp integer, p_vence_en timestamptz, p_motivo text, p_admin uuid)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_terminadas integer;
  v_id bigint;
begin
  perform 1 from public.vendedores where id = p_vendedor_id for update;
  if not found then
    return jsonb_build_object('ok', false, 'motivo', 'no_existe');
  end if;
  if p_vence_en is not null and p_vence_en <= now() then
    return jsonb_build_object('ok', false, 'motivo', 'vence_en_pasado');
  end if;

  update public.vendedor_comisiones
     set terminada_en = now(), terminada_por = p_admin
   where vendedor_id = p_vendedor_id
     and terminada_en is null
     and (vence_en is null or vence_en > now());
  get diagnostics v_terminadas = row_count;

  insert into public.vendedor_comisiones (vendedor_id, comision_bp, vence_en, motivo, creado_por)
  values (p_vendedor_id, p_comision_bp, p_vence_en, btrim(p_motivo), p_admin)
  returning id into v_id;

  return jsonb_build_object('ok', true, 'id', v_id, 'terminadas', v_terminadas);
end;
$$;

-- ---------------------------------------------------------------------------
-- 3. Terminar una especial antes de tiempo
--
-- Devuelve { ok: true } o { ok: false } si no existe, es de otra tienda o ya
-- no estaba vigente.
-- ---------------------------------------------------------------------------
create or replace function privado.terminar_comision_especial(
  p_vendedor_id integer, p_comision_id bigint, p_admin uuid)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_filas integer;
begin
  update public.vendedor_comisiones
     set terminada_en = now(), terminada_por = p_admin
   where id = p_comision_id
     and vendedor_id = p_vendedor_id
     and terminada_en is null
     and (vence_en is null or vence_en > now());
  get diagnostics v_filas = row_count;
  return jsonb_build_object('ok', v_filas = 1);
end;
$$;

-- ---------------------------------------------------------------------------
-- 4. Borrar una tienda sin pedidos (031), con vendedor_comisiones
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

  foreach v_tabla in array array['vendedor_sellos', 'mercadopago_cuentas', 'vendedor_bloqueos', 'envio_zona_fallas', 'vendedor_comisiones']
  loop
    if to_regclass('public.' || v_tabla) is not null then
      execute format('delete from public.%I where vendedor_id = $1', v_tabla) using p_vendedor_id;
    end if;
  end loop;

  delete from public.vendedores where id = p_vendedor_id;

  return jsonb_build_object('productos_borrados', v_productos);
end;
$$;

revoke all on function privado.cargar_comision_especial(integer, integer, timestamptz, text, uuid) from public, anon, authenticated;
revoke all on function privado.terminar_comision_especial(integer, bigint, uuid) from public, anon, authenticated;
revoke all on function privado.borrar_tienda(integer) from public, anon, authenticated;
grant execute on function privado.cargar_comision_especial(integer, integer, timestamptz, text, uuid) to service_role;
grant execute on function privado.terminar_comision_especial(integer, bigint, uuid) to service_role;

-- ---------------------------------------------------------------------------
-- 5. Las puertas para el servidor
-- ---------------------------------------------------------------------------
create or replace function public.rpc_cargar_comision_especial(
  p_vendedor_id integer, p_comision_bp integer, p_vence_en timestamptz, p_motivo text, p_admin uuid)
returns jsonb
language sql
security invoker
as $$ select privado.cargar_comision_especial(p_vendedor_id, p_comision_bp, p_vence_en, p_motivo, p_admin) $$;

create or replace function public.rpc_terminar_comision_especial(
  p_vendedor_id integer, p_comision_id bigint, p_admin uuid)
returns jsonb
language sql
security invoker
as $$ select privado.terminar_comision_especial(p_vendedor_id, p_comision_id, p_admin) $$;

revoke all on function public.rpc_cargar_comision_especial(integer, integer, timestamptz, text, uuid) from public, anon, authenticated;
revoke all on function public.rpc_terminar_comision_especial(integer, bigint, uuid) from public, anon, authenticated;
grant execute on function public.rpc_cargar_comision_especial(integer, integer, timestamptz, text, uuid) to service_role;
grant execute on function public.rpc_terminar_comision_especial(integer, bigint, uuid) to service_role;

commit;

-- ---------------------------------------------------------------------------
-- Verificación (correr aparte, después)
-- ---------------------------------------------------------------------------
-- select grantee, privilege_type from information_schema.role_table_grants
-- where table_schema = 'public' and table_name = 'vendedor_comisiones'
--   and grantee in ('anon', 'authenticated');
-- (tiene que dar 0 filas)
--
-- select position('vendedor_comisiones' in pg_get_functiondef('privado.borrar_tienda(integer)'::regprocedure)) > 0;
-- (true)
