-- ============================================================================
-- Bahía Shops · 030 · Pausar la tienda (12/10/2026)
-- Correr entero en el SQL Editor de Supabase. Va en transacción: si algo
-- falla, no cambia nada. Se puede correr dos veces sin romper nada.
--
-- CORRERLA ANTES DE PUBLICAR EL CÓDIGO QUE LA ACOMPAÑA. El código nuevo lee y
-- filtra por vendedores.pausada_en y vendedores.cerrada_en en todos los
-- listados públicos (src/lib/vendedoresPublicos.js): sin las columnas, el
-- inicio, el mapa, las búsquedas y las categorías fallarían. El código viejo
-- anda con ella: no conoce ninguna de las columnas nuevas.
--
-- Por qué: la etapa 2 de "dar de baja un emprendimiento". El vendedor puede
-- pausar su tienda: deja de verse en los listados, sus productos se ocultan y
-- no recibe pedidos nuevos, pero no pierde nada y la reactiva cuando quiere.
-- La decide solo el vendedor (las rutas de /api/vendedor/pausa, con
-- service_role). Los pedidos que ya tenía siguen su curso, y MercadoPago queda
-- conectado.
--
-- Qué deja hecho:
--   1. vendedores.pausada_en (con fecha = pausada), vendedores.mensaje_pausa
--      (lo que ve el público, hasta 200 caracteres, solo con la tienda
--      pausada) y vendedores.cerrada_en (para la etapa 3; hoy nadie la
--      escribe, pero las políticas ya la miran).
--   2. SELECT de pausada_en y mensaje_pausa para anon y authenticated: la
--      ficha en pausa los lee.
--   3. Nadie desde el navegador puede escribir esas tres columnas: un
--      disparador lo rechaza para anon y authenticated (el permiso de UPDATE
--      sobre vendedores lo tiene el navegador, porque el vendedor edita su
--      tienda directo; un REVOKE por columna no alcanza si el permiso es de
--      tabla). Pausar y reactivar van por /api/vendedor/pausa (service_role).
--   4. RLS de vendedores: una política RESTRICTIVE nueva oculta las tiendas
--      cerradas. La pausa NO va en las políticas de vendedores: la fila de una
--      tienda pausada sigue legible, para que la ficha pueda mostrar su
--      nombre, logo y mensaje. Que no aparezca en los listados lo hace el
--      código (soloVendedoresPublicados).
--   5. privado.vendedor_visible (la de la 007, que usa la política de
--      productos): además de bloqueada, ahora también es "no visible" una
--      tienda pausada o cerrada, salvo para su dueño. Los productos de una
--      tienda pausada desaparecen para el público y para quien compra; el
--      dueño los sigue viendo en su panel.
--   6. privado.producto_visible y políticas RESTRICTIVE nuevas en
--      producto_media, producto_variantes y producto_sellos: las fotos, las
--      variantes y los sellos de un producto oculto también se ocultan.
--   7. Un disparador que rechaza pedidos NUEVOS a una tienda pausada o
--      cerrada: "Esta tienda no está recibiendo pedidos." Vale para cualquier
--      rol, también service_role (la ruta de crear pedidos ya lo verifica antes;
--      esto cubre la carrera de una pausa justo en el medio). No toca los
--      pedidos que ya existen.
--
-- Lo que NO hace: no toca los links de pago ni los cupones (vencen solos), ni
-- MercadoPago, ni el webhook, ni la 006 (es un disparador de revisión, no una
-- política: no frena nada de esto, y como las rutas de pausa escriben con
-- service_role, pausar no devuelve la tienda a revisión).
-- ============================================================================
begin;

create schema if not exists privado;
grant usage on schema privado to anon, authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 1. Columnas nuevas
-- ---------------------------------------------------------------------------
alter table public.vendedores
  add column if not exists pausada_en timestamptz,
  add column if not exists mensaje_pausa text,
  add column if not exists cerrada_en timestamptz;

alter table public.vendedores drop constraint if exists vendedores_mensaje_pausa_valido;
alter table public.vendedores add constraint vendedores_mensaje_pausa_valido
  check (
    mensaje_pausa is null
    or (char_length(mensaje_pausa) <= 200 and pausada_en is not null)
  );

-- ---------------------------------------------------------------------------
-- 2. Lectura pública de la pausa (la ficha en pausa)
--
-- Si el SELECT de vendedores es de tabla (como dice la 007), esto no cambia
-- nada; si fuera por columna, evita que se rompa la ficha.
-- ---------------------------------------------------------------------------
grant select (pausada_en, mensaje_pausa) on public.vendedores to anon, authenticated;

-- ---------------------------------------------------------------------------
-- 3. Solo el servidor pausa, reactiva o cierra
--
-- Sin SECURITY DEFINER a propósito: current_user tiene que ser el rol de quien
-- escribe (como en la 006). Desde el navegador es anon o authenticated; las
-- rutas del servidor escriben con service_role, y el SQL Editor con postgres.
-- ---------------------------------------------------------------------------
create or replace function privado.vendedores_proteger_pausa()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  if current_user not in ('anon', 'authenticated') then
    return new;
  end if;

  if tg_op = 'INSERT' then
    if new.pausada_en is not null or new.mensaje_pausa is not null or new.cerrada_en is not null then
      raise exception 'Solo se puede pausar o reactivar la tienda desde Mi negocio.' using errcode = '42501';
    end if;
  elsif new.pausada_en is distinct from old.pausada_en
     or new.mensaje_pausa is distinct from old.mensaje_pausa
     or new.cerrada_en is distinct from old.cerrada_en then
    raise exception 'Solo se puede pausar o reactivar la tienda desde Mi negocio.' using errcode = '42501';
  end if;

  return new;
end;
$$;

revoke all on function privado.vendedores_proteger_pausa() from public, anon, authenticated;

drop trigger if exists vendedores_proteger_pausa on public.vendedores;
create trigger vendedores_proteger_pausa before insert or update on public.vendedores
  for each row execute function privado.vendedores_proteger_pausa();

-- ---------------------------------------------------------------------------
-- 4. Las tiendas cerradas no se ven (etapa 3; hoy no hay ninguna)
--
-- RESTRICTIVE, como las de la 007: se suma con AND a las que ya existen.
-- ---------------------------------------------------------------------------
drop policy if exists "Tienda cerrada no se muestra" on public.vendedores;
create policy "Tienda cerrada no se muestra" on public.vendedores
  as restrictive
  for select
  to anon, authenticated
  using (cerrada_en is null);

-- ---------------------------------------------------------------------------
-- 5. Productos de una tienda pausada o cerrada: ocultos (salvo para el dueño)
--
-- Misma firma que en la 007: la política "Productos de vendedor bloqueado
-- ocultos" la sigue usando sin cambios.
-- ---------------------------------------------------------------------------
create or replace function privado.vendedor_visible(p_vendedor_id integer)
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select exists (
    select 1
    from vendedores v
    where v.id = p_vendedor_id
      and v.cerrada_en is null
      and (
        (v.bloqueado = false and v.pausada_en is null)
        or v.usuario_id = auth.uid()
      )
  );
$$;

-- ---------------------------------------------------------------------------
-- 6. Fotos, variantes y sellos de un producto oculto
-- ---------------------------------------------------------------------------
create or replace function privado.producto_visible(p_producto_id integer)
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select exists (
    select 1
    from productos p
    where p.id = p_producto_id
      and privado.vendedor_visible(p.vendedor_id)
  );
$$;

grant execute on function privado.vendedor_visible(integer) to anon, authenticated;
grant execute on function privado.producto_visible(integer) to anon, authenticated;

drop policy if exists "Fotos de producto oculto ocultas" on public.producto_media;
create policy "Fotos de producto oculto ocultas" on public.producto_media
  as restrictive
  for select
  to anon, authenticated
  using (privado.producto_visible(producto_id));

drop policy if exists "Variantes de producto oculto ocultas" on public.producto_variantes;
create policy "Variantes de producto oculto ocultas" on public.producto_variantes
  as restrictive
  for select
  to anon, authenticated
  using (privado.producto_visible(producto_id));

drop policy if exists "Sellos de producto oculto ocultos" on public.producto_sellos;
create policy "Sellos de producto oculto ocultos" on public.producto_sellos
  as restrictive
  for select
  to anon, authenticated
  using (privado.producto_visible(producto_id));

-- ---------------------------------------------------------------------------
-- 7. Ningún pedido nuevo a una tienda pausada o cerrada
-- ---------------------------------------------------------------------------
create or replace function privado.rechazar_pedido_tienda_sin_ventas()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if exists (
    select 1 from public.vendedores
     where id = new.vendedor_id
       and (pausada_en is not null or cerrada_en is not null)
  ) then
    raise exception 'Esta tienda no está recibiendo pedidos.' using errcode = 'P0001';
  end if;
  return new;
end;
$$;

revoke all on function privado.rechazar_pedido_tienda_sin_ventas() from public, anon, authenticated;

drop trigger if exists rechazar_pedido_tienda_sin_ventas on public.pedidos;
create trigger rechazar_pedido_tienda_sin_ventas before insert on public.pedidos
  for each row execute function privado.rechazar_pedido_tienda_sin_ventas();

commit;

-- ============================================================================
-- Verificación (una sola fila; copiá la celda)
--   · columnas: las tres.
--   · rls_activo: TODO true. Si alguna tabla da false, sus políticas (las de
--     antes y las de esta migración) no se aplican: avisá antes de activarlo,
--     porque activarlo sin políticas de lectura la deja invisible.
--   · lectura_publica_pausa: true para anon y authenticated.
--   · politicas: las cuatro nuevas, más las dos de la 007.
--   · disparadores: los dos.
-- ============================================================================
select jsonb_pretty(jsonb_build_object(
  'columnas', (select jsonb_agg(column_name order by column_name) from information_schema.columns
                where table_schema = 'public' and table_name = 'vendedores'
                  and column_name in ('pausada_en', 'mensaje_pausa', 'cerrada_en')),
  'restriccion_mensaje', (select pg_get_constraintdef(oid) from pg_constraint where conname = 'vendedores_mensaje_pausa_valido'),
  'rls_activo', (select jsonb_object_agg(relname, relrowsecurity) from pg_class
                  where relnamespace = 'public'::regnamespace
                    and relname in ('vendedores', 'productos', 'producto_media', 'producto_variantes', 'producto_sellos')),
  'lectura_publica_pausa', jsonb_build_object(
      'anon',          has_column_privilege('anon',          'public.vendedores', 'pausada_en', 'select')
                       and has_column_privilege('anon',          'public.vendedores', 'mensaje_pausa', 'select'),
      'authenticated', has_column_privilege('authenticated', 'public.vendedores', 'pausada_en', 'select')
                       and has_column_privilege('authenticated', 'public.vendedores', 'mensaje_pausa', 'select')),
  'politicas', (select jsonb_agg(tablename || ': ' || policyname || ' (' || permissive || ')' order by tablename, policyname)
                  from pg_policies
                 where schemaname = 'public'
                   and policyname in ('Tienda cerrada no se muestra', 'Fotos de producto oculto ocultas',
                                      'Variantes de producto oculto ocultas', 'Sellos de producto oculto ocultos',
                                      'Vendedor bloqueado no se muestra', 'Productos de vendedor bloqueado ocultos')),
  'disparadores', (select jsonb_agg(tgrelid::regclass || ': ' || tgname order by tgname) from pg_trigger
                    where tgname in ('vendedores_proteger_pausa', 'rechazar_pedido_tienda_sin_ventas')),
  'tiendas_pausadas', (select count(*) from public.vendedores where pausada_en is not null),
  'tiendas_cerradas', (select count(*) from public.vendedores where cerrada_en is not null)
)) as verificacion;

-- ============================================================================
-- Para deshacer (correr en transacción). La función vendedor_visible vuelve a
-- la de la 007. Las tiendas que estén pausadas dejan de estarlo (se pierde la
-- fecha y el mensaje).
-- ============================================================================
-- begin;
-- drop trigger if exists rechazar_pedido_tienda_sin_ventas on public.pedidos;
-- drop function if exists privado.rechazar_pedido_tienda_sin_ventas();
-- drop policy if exists "Fotos de producto oculto ocultas" on public.producto_media;
-- drop policy if exists "Variantes de producto oculto ocultas" on public.producto_variantes;
-- drop policy if exists "Sellos de producto oculto ocultos" on public.producto_sellos;
-- drop function if exists privado.producto_visible(integer);
-- create or replace function privado.vendedor_visible(p_vendedor_id integer)
--   returns boolean language sql security definer stable set search_path = public
--   as $f$ select exists (select 1 from vendedores v where v.id = p_vendedor_id
--          and (v.bloqueado = false or v.usuario_id = auth.uid())); $f$;
-- drop policy if exists "Tienda cerrada no se muestra" on public.vendedores;
-- drop trigger if exists vendedores_proteger_pausa on public.vendedores;
-- drop function if exists privado.vendedores_proteger_pausa();
-- alter table public.vendedores drop constraint if exists vendedores_mensaje_pausa_valido;
-- alter table public.vendedores drop column if exists mensaje_pausa;
-- alter table public.vendedores drop column if exists pausada_en;
-- alter table public.vendedores drop column if exists cerrada_en;
-- commit;
