-- ============================================================================
-- Bahía Shops · 035 · Denuncias de productos, y rechazar un producto publicado
-- (16/10/2026)
-- Correr entero en el SQL Editor de Supabase. Va en transacción: si algo
-- falla, no cambia nada. Se puede correr dos veces sin romper nada.
--
-- CORRERLA ANTES DE PUBLICAR EL CÓDIGO QUE LA ACOMPAÑA (y después de la 033,
-- que crea productos.revision_posterior_desde). Solo AGREGA: una tabla, dos
-- funciones y un disparador en usuarios. El código de hoy no conoce nada de
-- esto y sigue igual. El código nuevo (denunciar desde la ficha,
-- /admin/denuncias, rechazar un producto ya publicado) necesita esta
-- migración: sin ella, esas tres cosas dan un error visible.
--
-- Por qué: desde la 033 no se moderan las ediciones de productos ya
-- aprobados (el filtro bloquea lo claro y marca lo dudoso). El filtro no lee
-- imágenes: un teléfono escrito en una foto pasa. Las denuncias son cómo avisa
-- la gente cuando algo se coló.
--
-- Qué deja hecho:
--   1. public.denuncias_productos: una fila por denuncia. RLS activo y SIN
--      permisos para anon ni authenticated (convención de la 034): todo pasa
--      por el servidor, y la tienda nunca puede leer quién la denunció.
--        · motivo: uno de seis (CHECK); comentario opcional, hasta 1000.
--        · una sola denuncia PENDIENTE por persona y producto (índice único
--          parcial).
--        · si se borra el producto, sus denuncias se borran (cascada: también
--          vale para borrar y cerrar tiendas de la 031, sin tocarlas).
--        · si se elimina la cuenta de quien denunció, la denuncia queda sin
--          dueño (usuario_id = null): por la clave foránea cuando se borra la
--          cuenta entera, y por el disparador (4) cuando queda la cáscara
--          anónima. Lo mismo con quien la resolvió (resuelta_por).
--   2. privado.registrar_denuncia: la regla entera, atómica. Bloquea el
--      producto y la persona, y devuelve qué pasó:
--        creada        (con "primera": es la primera pendiente del producto,
--                      para mandar un solo mail por producto)
--        ya_existia    ya tenía una pendiente de esta persona
--        propio        es un producto de su tienda
--        no_disponible no existe o no está publicado
--        limite        ya hizo 10 en las últimas 24 horas
--   3. privado.rechazar_producto: rechaza un producto en revisión O ya
--      publicado (activo, pausado o agotado), y en la misma transacción
--      limpia la marca de revisión posterior y resuelve sus denuncias
--      pendientes como 'producto_rechazado'.
--   4. Disparador en usuarios: cuando una cuenta se cierra (cerrada_en pasa a
--      tener fecha: la cáscara anónima de cerrar_cuenta, 016/031), sus
--      denuncias quedan sin dueño. Así no hace falta reescribir cerrar_cuenta.
--   5. public.rpc_registrar_denuncia y public.rpc_rechazar_producto: las que
--      llama el servidor. Solo service_role.
-- ============================================================================

begin;

create schema if not exists privado;
grant usage on schema privado to service_role;

-- ---------------------------------------------------------------------------
-- 1. La tabla
-- ---------------------------------------------------------------------------
create table if not exists public.denuncias_productos (
  id bigint generated always as identity primary key,
  producto_id integer not null references public.productos(id) on delete cascade,
  usuario_id uuid references public.usuarios(id) on delete set null,
  motivo text not null,
  comentario text,
  estado text not null default 'pendiente',
  creada_en timestamptz not null default now(),
  resuelta_en timestamptz,
  resuelta_por uuid references public.usuarios(id) on delete set null,
  constraint denuncias_motivo_valido
    check (motivo in ('contacto', 'fotos', 'prohibido', 'enganoso', 'estafa', 'otro')),
  constraint denuncias_comentario_largo
    check (comentario is null or char_length(comentario) <= 1000),
  constraint denuncias_estado_valido
    check (estado in ('pendiente', 'producto_rechazado', 'descartada')),
  constraint denuncias_resuelta_coherente
    check ((estado = 'pendiente') = (resuelta_en is null))
);

create unique index if not exists denuncias_una_pendiente_por_persona
  on public.denuncias_productos (producto_id, usuario_id) where estado = 'pendiente';
create index if not exists denuncias_pendientes_por_producto
  on public.denuncias_productos (producto_id) where estado = 'pendiente';
create index if not exists denuncias_por_persona
  on public.denuncias_productos (usuario_id, creada_en);

alter table public.denuncias_productos enable row level security;
-- Sin políticas a propósito: solo service_role (que ignora RLS).
revoke all on table public.denuncias_productos from public, anon, authenticated;
grant select, insert, update, delete on table public.denuncias_productos to service_role;

-- ---------------------------------------------------------------------------
-- 2. Registrar una denuncia
-- ---------------------------------------------------------------------------
create or replace function privado.registrar_denuncia(
  p_usuario_id uuid,
  p_producto_id integer,
  p_motivo text,
  p_comentario text
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_producto record;
  v_primera boolean;
  v_id bigint;
begin
  if p_usuario_id is null or p_producto_id is null then
    raise exception 'Faltan datos de la denuncia.' using errcode = '22023';
  end if;

  -- La persona: bloqueada, para que el límite diario no se pase con dos
  -- denuncias al mismo tiempo. Una cuenta cerrada no denuncia.
  perform 1 from public.usuarios where id = p_usuario_id and cerrada_en is null for update;
  if not found then
    return jsonb_build_object('resultado', 'no_disponible');
  end if;

  -- El producto: bloqueado, para que "primera" sea cierta aunque lleguen dos
  -- denuncias juntas (un solo mail por producto).
  select p.id, p.estado, v.usuario_id as duena, v.estado_validacion, v.bloqueado, v.pausada_en, v.cerrada_en
    into v_producto
    from public.productos p
    join public.vendedores v on v.id = p.vendedor_id
   where p.id = p_producto_id
     for update of p;

  if not found
     or v_producto.estado <> 'activo'
     or v_producto.estado_validacion <> 'aprobado'
     or v_producto.bloqueado
     or v_producto.pausada_en is not null
     or v_producto.cerrada_en is not null then
    return jsonb_build_object('resultado', 'no_disponible');
  end if;

  if v_producto.duena = p_usuario_id then
    return jsonb_build_object('resultado', 'propio');
  end if;

  if exists (select 1 from public.denuncias_productos
              where producto_id = p_producto_id and usuario_id = p_usuario_id and estado = 'pendiente') then
    return jsonb_build_object('resultado', 'ya_existia');
  end if;

  if (select count(*) from public.denuncias_productos
       where usuario_id = p_usuario_id and creada_en > now() - interval '24 hours') >= 10 then
    return jsonb_build_object('resultado', 'limite');
  end if;

  v_primera := not exists (select 1 from public.denuncias_productos
                            where producto_id = p_producto_id and estado = 'pendiente');

  insert into public.denuncias_productos (producto_id, usuario_id, motivo, comentario)
  values (p_producto_id, p_usuario_id, p_motivo, nullif(btrim(p_comentario), ''))
  returning id into v_id;

  return jsonb_build_object('resultado', 'creada', 'id', v_id, 'primera', v_primera);
end;
$$;

-- ---------------------------------------------------------------------------
-- 3. Rechazar un producto (en revisión o ya publicado)
-- ---------------------------------------------------------------------------
create or replace function privado.rechazar_producto(
  p_producto_id integer,
  p_motivo text,
  p_admin_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_resueltas integer;
begin
  if p_producto_id is null or nullif(btrim(p_motivo), '') is null then
    raise exception 'Falta el motivo del rechazo.' using errcode = '22023';
  end if;

  update public.productos
     set estado = 'rechazado',
         motivo_rechazo = btrim(p_motivo),
         revision_posterior_desde = null,
         actualizado_en = now()
   where id = p_producto_id
     and estado in ('en_revision', 'activo', 'pausado', 'agotado');

  if not found then
    return jsonb_build_object('resultado',
      case when exists (select 1 from public.productos where id = p_producto_id) then 'no_se_puede' else 'no_existe' end);
  end if;

  update public.denuncias_productos
     set estado = 'producto_rechazado', resuelta_en = now(), resuelta_por = p_admin_id
   where producto_id = p_producto_id and estado = 'pendiente';
  get diagnostics v_resueltas = row_count;

  return jsonb_build_object('resultado', 'rechazado', 'denuncias_resueltas', v_resueltas);
end;
$$;

-- ---------------------------------------------------------------------------
-- 4. Cuenta cerrada: sus denuncias quedan sin dueño
-- ---------------------------------------------------------------------------
create or replace function privado.denuncias_sin_duena_al_cerrar_cuenta()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if new.cerrada_en is not null and old.cerrada_en is null then
    update public.denuncias_productos set usuario_id = null where usuario_id = new.id;
    update public.denuncias_productos set resuelta_por = null where resuelta_por = new.id;
  end if;
  return new;
end;
$$;

drop trigger if exists denuncias_sin_duena_al_cerrar_cuenta on public.usuarios;
create trigger denuncias_sin_duena_al_cerrar_cuenta
  after update of cerrada_en on public.usuarios
  for each row execute function privado.denuncias_sin_duena_al_cerrar_cuenta();

-- ---------------------------------------------------------------------------
-- 5. Las que llama el servidor, y los permisos de las funciones
-- ---------------------------------------------------------------------------
create or replace function public.rpc_registrar_denuncia(p_usuario_id uuid, p_producto_id integer, p_motivo text, p_comentario text)
returns jsonb
language sql
security invoker
as $$ select privado.registrar_denuncia(p_usuario_id, p_producto_id, p_motivo, p_comentario) $$;

create or replace function public.rpc_rechazar_producto(p_producto_id integer, p_motivo text, p_admin_id uuid)
returns jsonb
language sql
security invoker
as $$ select privado.rechazar_producto(p_producto_id, p_motivo, p_admin_id) $$;

revoke all on function privado.registrar_denuncia(uuid, integer, text, text)           from public, anon, authenticated;
revoke all on function privado.rechazar_producto(integer, text, uuid)                  from public, anon, authenticated;
revoke all on function privado.denuncias_sin_duena_al_cerrar_cuenta()                  from public, anon, authenticated;
revoke all on function public.rpc_registrar_denuncia(uuid, integer, text, text)        from public, anon, authenticated;
revoke all on function public.rpc_rechazar_producto(integer, text, uuid)               from public, anon, authenticated;
grant execute on function privado.registrar_denuncia(uuid, integer, text, text)        to service_role;
grant execute on function privado.rechazar_producto(integer, text, uuid)               to service_role;
grant execute on function public.rpc_registrar_denuncia(uuid, integer, text, text)     to service_role;
grant execute on function public.rpc_rechazar_producto(integer, text, uuid)            to service_role;

-- Para que la API vea las funciones nuevas sin esperar.
notify pgrst, 'reload schema';

commit;

-- ============================================================================
-- Verificación (una sola fila; copiá la celda)
--   · tabla y rls: true.
--   · permisos_tabla: anon y authenticated vacíos; service_role con
--     DELETE, INSERT, SELECT, UPDATE.
--   · funciones: anon y authenticated false, service_role true, en las dos.
--   · disparador: true.
--   · denuncias: 0 (recién creada).
-- ============================================================================
select jsonb_pretty(jsonb_build_object(
  'tabla', to_regclass('public.denuncias_productos') is not null,
  'rls', (select relrowsecurity from pg_class where oid = 'public.denuncias_productos'::regclass),
  'permisos_tabla', (select jsonb_object_agg(r.rol, coalesce((
        select string_agg(a.privilege_type, ', ' order by a.privilege_type)
          from pg_class c, aclexplode(c.relacl) a
         where c.oid = 'public.denuncias_productos'::regclass and a.grantee = r.rol::regrole), ''))
      from unnest(array['anon', 'authenticated', 'service_role']) as r(rol)),
  'funciones', jsonb_build_object(
      'rpc_registrar_denuncia', jsonb_build_object(
          'anon',          has_function_privilege('anon',          'public.rpc_registrar_denuncia(uuid, integer, text, text)', 'execute'),
          'authenticated', has_function_privilege('authenticated', 'public.rpc_registrar_denuncia(uuid, integer, text, text)', 'execute'),
          'service_role',  has_function_privilege('service_role',  'public.rpc_registrar_denuncia(uuid, integer, text, text)', 'execute')),
      'rpc_rechazar_producto', jsonb_build_object(
          'anon',          has_function_privilege('anon',          'public.rpc_rechazar_producto(integer, text, uuid)', 'execute'),
          'authenticated', has_function_privilege('authenticated', 'public.rpc_rechazar_producto(integer, text, uuid)', 'execute'),
          'service_role',  has_function_privilege('service_role',  'public.rpc_rechazar_producto(integer, text, uuid)', 'execute'))),
  'disparador', exists (select 1 from pg_trigger where tgname = 'denuncias_sin_duena_al_cerrar_cuenta'),
  'denuncias', (select count(*) from public.denuncias_productos)
)) as verificacion;

-- ============================================================================
-- Para consultar las denuncias pendientes (hasta mirar /admin/denuncias):
--
-- select d.producto_id, p.nombre, count(*) as denuncias, min(d.creada_en) as primera
--   from public.denuncias_productos d join public.productos p on p.id = d.producto_id
--  where d.estado = 'pendiente' group by 1, 2 order by max(d.creada_en) desc;
-- ============================================================================

-- ============================================================================
-- Para deshacer (correr en transacción). Se pierden las denuncias guardadas.
-- Con el código nuevo publicado, denunciar, /admin/denuncias y rechazar un
-- producto ya publicado dejan de andar (con error visible).
-- ============================================================================
-- begin;
-- drop trigger if exists denuncias_sin_duena_al_cerrar_cuenta on public.usuarios;
-- drop function if exists privado.denuncias_sin_duena_al_cerrar_cuenta();
-- drop function if exists public.rpc_rechazar_producto(integer, text, uuid);
-- drop function if exists public.rpc_registrar_denuncia(uuid, integer, text, text);
-- drop function if exists privado.rechazar_producto(integer, text, uuid);
-- drop function if exists privado.registrar_denuncia(uuid, integer, text, text);
-- drop table if exists public.denuncias_productos;
-- notify pgrst, 'reload schema';
-- commit;
-- ============================================================================
