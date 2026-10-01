-- ============================================================================
-- Bahía Shops · 016 · Eliminar mi cuenta (derecho de supresión, Ley 25.326)
-- Correr entero en el SQL Editor de Supabase. Va en transacción: si algo
-- falla, no cambia nada. Se puede correr dos veces sin romper nada.
--
-- Qué deja hecho:
--   1. usuarios.cerrada_en: marca de "esta cuenta ya se eliminó".
--   2. pedidos.aviso_pago_tardio_en: marca de "ya avisamos internamente que
--      llegó un pago sobre un pedido cancelado" (para no mandar el mail
--      interno dos veces cuando MercadoPago reenvía el aviso).
--   3. Un disparador que impide crear tiendas, direcciones, favoritos, votos
--      o pedidos nuevos a nombre de una cuenta ya eliminada. Hace falta porque
--      el token de sesión de quien eliminó la cuenta sigue valiendo hasta ~1
--      hora para PostgREST, que no consulta si la sesión existe.
--   4. privado.evaluar_eliminar_cuenta(uuid): SOLO LEE. Dice si la cuenta se
--      puede eliminar y por qué no. Lo usa la página al abrirse y el proceso.
--   5. privado.cerrar_cuenta(uuid): el proceso, entero, en UNA transacción.
--        · Sin pedidos  -> borra la cuenta de auth (y en cascada usuarios,
--                          direcciones, favoritos, votos).
--        · Con pedidos  -> "cáscara anónima": los pedidos se conservan como
--                          registro de venta, sin datos personales.
--   6. Dos funciones finas en public para que el servidor las pueda llamar
--      con .rpc(): el esquema privado NO está expuesto a propósito (007), y
--      desde afuera solo service_role las puede ejecutar.
--
-- Nada de esto corre solo: hasta que la app llame a la función, no pasa nada.
-- ============================================================================
begin;

create schema if not exists privado;
grant usage on schema privado to service_role;

-- ---------------------------------------------------------------------------
-- 1 y 2. Columnas nuevas
-- ---------------------------------------------------------------------------
alter table public.usuarios
  add column if not exists cerrada_en timestamptz;

alter table public.pedidos
  add column if not exists aviso_pago_tardio_en timestamptz;

-- ---------------------------------------------------------------------------
-- 3. Nada nuevo a nombre de una cuenta eliminada
-- ---------------------------------------------------------------------------
create or replace function privado.rechazar_cuenta_cerrada()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_id uuid := nullif(to_jsonb(new) ->> tg_argv[0], '')::uuid;
begin
  if v_id is not null
     and exists (select 1 from public.usuarios where id = v_id and cerrada_en is not null) then
    raise exception 'cuenta_cerrada' using errcode = 'P0001';
  end if;
  return new;
end;
$$;

revoke all on function privado.rechazar_cuenta_cerrada() from public, anon, authenticated;

drop trigger if exists rechazar_cuenta_cerrada on public.vendedores;
create trigger rechazar_cuenta_cerrada before insert on public.vendedores
  for each row execute function privado.rechazar_cuenta_cerrada('usuario_id');

drop trigger if exists rechazar_cuenta_cerrada on public.direcciones;
create trigger rechazar_cuenta_cerrada before insert on public.direcciones
  for each row execute function privado.rechazar_cuenta_cerrada('usuario_id');

drop trigger if exists rechazar_cuenta_cerrada on public.favoritos;
create trigger rechazar_cuenta_cerrada before insert on public.favoritos
  for each row execute function privado.rechazar_cuenta_cerrada('usuario_id');

drop trigger if exists rechazar_cuenta_cerrada on public.votos_funciones;
create trigger rechazar_cuenta_cerrada before insert on public.votos_funciones
  for each row execute function privado.rechazar_cuenta_cerrada('usuario_id');

drop trigger if exists rechazar_cuenta_cerrada on public.pedidos;
create trigger rechazar_cuenta_cerrada before insert on public.pedidos
  for each row execute function privado.rechazar_cuenta_cerrada('comprador_id');

-- ---------------------------------------------------------------------------
-- 4. ¿Se puede eliminar? Solo lee, no cambia nada.
--
-- Devuelve un jsonb:
--   existe, cerrada, es_admin, es_validador,
--   tiendas, pedidos_activos, pagos_en_curso, pedidos_total,
--   motivos       lista de lo que lo impide (vacía = se puede):
--                   ES_ADMIN, TIENDA, PEDIDO_ACTIVO, PAGO_EN_CURSO
--   abandonados   los pedidos que se cancelarían al eliminar
--                 (id, vendedor_id, mp_preference_id)
--
-- Estados que cuentan como terminados: despachado, reembolsado, cancelado.
-- Sin pago: pendiente sin mp_payment_id, y rechazado. Cualquier estado que no
-- esté en esas dos listas impide eliminar (si algún día aparece uno nuevo, el
-- proceso falla cerrado, no abierto).
-- ---------------------------------------------------------------------------
create or replace function privado.evaluar_eliminar_cuenta(p_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public, auth, pg_temp
as $$
declare
  v_u           public.usuarios%rowtype;
  v_tiendas     int;
  v_activos     int;
  v_en_curso    int;
  v_total       int;
  v_validador   boolean;
  v_abandonados jsonb;
  v_motivos     jsonb := '[]'::jsonb;
begin
  select * into v_u from public.usuarios where id = p_id;
  if not found then
    return jsonb_build_object('existe', false);
  end if;

  select count(*) into v_tiendas from public.vendedores where usuario_id = p_id;
  select exists (select 1 from public.vendedores where validado_por = p_id) into v_validador;

  select
    count(*) filter (where estado not in ('pendiente', 'rechazado', 'cancelado', 'despachado', 'reembolsado')),
    count(*) filter (where estado = 'pendiente'
                       and coalesce(btrim(mp_payment_id), '') not in ('', 'null', 'undefined')),
    count(*)
  into v_activos, v_en_curso, v_total
  from public.pedidos
  where comprador_id = p_id;

  select coalesce(jsonb_agg(jsonb_build_object(
           'id', id, 'vendedor_id', vendedor_id, 'mp_preference_id', mp_preference_id) order by id),
         '[]'::jsonb)
  into v_abandonados
  from public.pedidos
  where comprador_id = p_id
    and (estado = 'rechazado'
         or (estado = 'pendiente'
             and coalesce(btrim(mp_payment_id), '') in ('', 'null', 'undefined')));

  if coalesce(v_u.es_admin, false) then v_motivos := v_motivos || '"ES_ADMIN"'::jsonb; end if;
  if v_tiendas  > 0 then v_motivos := v_motivos || '"TIENDA"'::jsonb; end if;
  if v_activos  > 0 then v_motivos := v_motivos || '"PEDIDO_ACTIVO"'::jsonb; end if;
  if v_en_curso > 0 then v_motivos := v_motivos || '"PAGO_EN_CURSO"'::jsonb; end if;

  return jsonb_build_object(
    'existe',          true,
    'cerrada',         v_u.cerrada_en is not null,
    'es_admin',        coalesce(v_u.es_admin, false),
    'es_validador',    v_validador,
    'tiendas',         v_tiendas,
    'pedidos_activos', v_activos,
    'pagos_en_curso',  v_en_curso,
    'pedidos_total',   v_total,
    'motivos',         v_motivos,
    'abandonados',     v_abandonados
  );
end;
$$;

-- ---------------------------------------------------------------------------
-- 5. El proceso. Todo o nada: es una sola transacción.
--
-- Devuelve un jsonb:
--   { ok: false, motivos: [...] }                       no se tocó nada
--   { ok: true, resultado: 'ya_cerrada' }               ya estaba hecha
--   { ok: true, resultado: 'borrada' | 'anonimizada',
--     emails: [...], nombre, pedidos_cancelados: [...] }
-- 'emails' y 'nombre' se leen ACÁ, antes de borrarlos, para que el servidor
-- pueda mandar el mail final. Es lo único que los guarda, y solo en memoria.
-- ---------------------------------------------------------------------------
create or replace function privado.cerrar_cuenta(p_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public, auth, pg_temp
as $$
declare
  v_u           public.usuarios%rowtype;
  v_eval        jsonb;
  v_emails      text[];
  v_cancelados  jsonb;
  v_email_nuevo text := 'eliminada-' || p_id::text || '@cuenta-eliminada.invalid';
begin
  -- Se bloquea la fila: nadie puede crear una tienda, un pedido ni una
  -- dirección para esta cuenta (todas miran esta fila por su clave foránea)
  -- hasta que esto termine. Y dos pedidos de eliminar a la vez se ponen en fila.
  select * into v_u from public.usuarios where id = p_id for update;

  if not found then
    if exists (select 1 from auth.users where id = p_id) then
      return jsonb_build_object('ok', false, 'motivos', '["SIN_PERFIL"]'::jsonb);
    end if;
    return jsonb_build_object('ok', true, 'resultado', 'ya_cerrada');
  end if;

  if v_u.cerrada_en is not null then
    return jsonb_build_object('ok', true, 'resultado', 'ya_cerrada');
  end if;

  -- También los pedidos: el webhook de MercadoPago escribe sobre ellos.
  perform 1 from public.pedidos where comprador_id = p_id for update;

  -- Las verificaciones, dentro de la misma transacción que las escrituras.
  v_eval := privado.evaluar_eliminar_cuenta(p_id);
  if jsonb_array_length(v_eval -> 'motivos') > 0 then
    return jsonb_build_object('ok', false, 'motivos', v_eval -> 'motivos');
  end if;

  v_emails := array(
    select distinct lower(btrim(e))
    from unnest(array[v_u.email, (select u.email from auth.users u where u.id = p_id)]) as e
    where nullif(btrim(e), '') is not null
  );

  -- Los pedidos que nunca llegaron a un pago se cancelan. (Siguen siendo
  -- pedidos: una persona que solo tenía carritos abandonados va por la
  -- cáscara, no por el borrado completo.)
  with c as (
    update public.pedidos
       set estado = 'cancelado', actualizado_en = now()
     where comprador_id = p_id
       and estado in ('pendiente', 'rechazado')
    returning id, vendedor_id, mp_preference_id
  )
  select coalesce(jsonb_agg(jsonb_build_object(
           'id', id, 'vendedor_id', vendedor_id, 'mp_preference_id', mp_preference_id) order by id),
         '[]'::jsonb)
  into v_cancelados
  from c;

  -- Lo que se borra en los dos caminos: los mensajes (por cuenta y por mail,
  -- aunque se hayan mandado sin sesión), la lista de espera y los contactos de
  -- gastronomía por mail, y lo que auth guarda sin clave foránea.
  delete from public.mensajes_contacto
   where usuario_id = p_id or lower(btrim(email)) = any (v_emails);
  delete from public.waitlist
   where lower(btrim(email)) = any (v_emails);
  delete from public.leads_gastronomia
   where lower(btrim(email)) = any (v_emails);

  -- Sin clave foránea hacia la cuenta. refresh_tokens.user_id es character
  -- varying, no uuid: se compara como texto. flow_state igual, por si acaso.
  delete from auth.flow_state     where user_id::text = p_id::text;
  delete from auth.refresh_tokens where user_id::text = p_id::text;

  if (v_eval ->> 'pedidos_total')::int = 0 and not (v_eval ->> 'es_validador')::boolean then
    -- ── Camino 1: sin pedidos -> borrado completo ──
    -- Segunda verificación, pegada al borrado: vendedores.usuario_id es
    -- CASCADE, así que un DELETE con una tienda de por medio se la llevaría.
    if exists (select 1 from public.vendedores where usuario_id = p_id) then
      raise exception 'TIENDA_INESPERADA';
    end if;

    -- Arrastra: usuarios, direcciones, favoritos, votos_funciones, identities,
    -- sessions, tokens. mensajes_contacto ya se borró arriba.
    delete from auth.users where id = p_id;

    if exists (select 1 from public.usuarios where id = p_id) then
      raise exception 'USUARIO_NO_SE_BORRO';
    end if;

    return jsonb_build_object(
      'ok', true, 'resultado', 'borrada',
      'emails', to_jsonb(v_emails), 'nombre', nullif(btrim(v_u.nombre), ''),
      'pedidos_cancelados', v_cancelados);
  end if;

  -- ── Camino 2: con pedidos -> cáscara anónima ──
  delete from public.favoritos       where usuario_id = p_id;
  delete from public.votos_funciones where usuario_id = p_id;

  -- Las copias de contacto y el puntero a la dirección, en TODOS sus pedidos.
  -- direccion_id primero: así no depende de la regla de la clave foránea.
  update public.pedidos
     set direccion_id = null,
         comprador_nombre = null, comprador_apellido = null, comprador_telefono = null,
         direccion_copia = null
   where comprador_id = p_id;

  delete from public.direcciones where usuario_id = p_id;

  update public.usuarios
     set email = v_email_nuevo, nombre = '', apellido = '',
         nombre_usuario = null, telefono = null, avatar_url = null,
         email_verificado = false, es_admin = false,
         cerrada_en = now(), actualizado_en = now()
   where id = p_id;

  -- La cuenta de auth: sin identidades (así Google no la vuelve a encontrar y
  -- vuelve a entrar como cuenta nueva), sin sesiones, con el mail reemplazado
  -- y bloqueada por 100 años.
  delete from auth.identities          where user_id = p_id;
  delete from auth.sessions            where user_id = p_id;
  delete from auth.one_time_tokens     where user_id = p_id;
  delete from auth.mfa_factors         where user_id = p_id;
  delete from auth.oauth_consents      where user_id = p_id;
  delete from auth.oauth_authorizations where user_id = p_id;
  delete from auth.webauthn_credentials where user_id = p_id;
  delete from auth.webauthn_challenges  where user_id = p_id;

  update auth.users
     set email = v_email_nuevo, phone = null,
         raw_user_meta_data = '{}'::jsonb, raw_app_meta_data = '{}'::jsonb,
         encrypted_password = '', email_change = '', phone_change = '',
         last_sign_in_at = null,
         banned_until = now() + interval '100 years', updated_at = now()
   where id = p_id;

  return jsonb_build_object(
    'ok', true, 'resultado', 'anonimizada',
    'emails', to_jsonb(v_emails), 'nombre', nullif(btrim(v_u.nombre), ''),
    'pedidos_cancelados', v_cancelados);
end;
$$;

-- ---------------------------------------------------------------------------
-- 6. Permisos, y las dos funciones que llama el servidor
-- ---------------------------------------------------------------------------
revoke all on function privado.evaluar_eliminar_cuenta(uuid) from public, anon, authenticated;
revoke all on function privado.cerrar_cuenta(uuid)           from public, anon, authenticated;
grant execute on function privado.evaluar_eliminar_cuenta(uuid) to service_role;
grant execute on function privado.cerrar_cuenta(uuid)           to service_role;

create or replace function public.rpc_evaluar_eliminar_cuenta(p_id uuid)
returns jsonb
language sql
security invoker
as $$ select privado.evaluar_eliminar_cuenta(p_id) $$;

create or replace function public.rpc_cerrar_cuenta(p_id uuid)
returns jsonb
language sql
security invoker
as $$ select privado.cerrar_cuenta(p_id) $$;

revoke all on function public.rpc_evaluar_eliminar_cuenta(uuid) from public, anon, authenticated;
revoke all on function public.rpc_cerrar_cuenta(uuid)           from public, anon, authenticated;
grant execute on function public.rpc_evaluar_eliminar_cuenta(uuid) to service_role;
grant execute on function public.rpc_cerrar_cuenta(uuid)           to service_role;

commit;

-- ============================================================================
-- Verificación (una sola fila; copiá la celda)
-- Los permisos tienen que dar: anon y authenticated false, service_role true.
-- ============================================================================
select jsonb_pretty(jsonb_build_object(
  'columna_cerrada_en',    exists (select 1 from information_schema.columns
                                    where table_schema = 'public' and table_name = 'usuarios'
                                      and column_name = 'cerrada_en'),
  'columna_aviso_tardio',  exists (select 1 from information_schema.columns
                                    where table_schema = 'public' and table_name = 'pedidos'
                                      and column_name = 'aviso_pago_tardio_en'),
  'disparadores',          (select jsonb_agg(event_object_table order by event_object_table)
                              from information_schema.triggers
                             where trigger_name = 'rechazar_cuenta_cerrada'),
  'permisos_cerrar_cuenta', jsonb_build_object(
      'anon',          has_function_privilege('anon',          'public.rpc_cerrar_cuenta(uuid)', 'execute'),
      'authenticated', has_function_privilege('authenticated', 'public.rpc_cerrar_cuenta(uuid)', 'execute'),
      'service_role',  has_function_privilege('service_role',  'public.rpc_cerrar_cuenta(uuid)', 'execute')),
  'permisos_privado', jsonb_build_object(
      'anon',          has_function_privilege('anon',          'privado.cerrar_cuenta(uuid)', 'execute'),
      'authenticated', has_function_privilege('authenticated', 'privado.cerrar_cuenta(uuid)', 'execute'),
      'service_role',  has_function_privilege('service_role',  'privado.cerrar_cuenta(uuid)', 'execute')),
  'cuentas_ya_cerradas',   (select count(*) from public.usuarios where cerrada_en is not null)
)) as verificacion;

-- ============================================================================
-- Para deshacer (correr en transacción). OJO: lo que el proceso ya hizo sobre
-- cuentas reales NO se deshace: esos datos se borraron a propósito.
-- ============================================================================
-- begin;
-- drop function if exists public.rpc_cerrar_cuenta(uuid);
-- drop function if exists public.rpc_evaluar_eliminar_cuenta(uuid);
-- drop function if exists privado.cerrar_cuenta(uuid);
-- drop function if exists privado.evaluar_eliminar_cuenta(uuid);
-- drop trigger if exists rechazar_cuenta_cerrada on public.vendedores;
-- drop trigger if exists rechazar_cuenta_cerrada on public.direcciones;
-- drop trigger if exists rechazar_cuenta_cerrada on public.favoritos;
-- drop trigger if exists rechazar_cuenta_cerrada on public.votos_funciones;
-- drop trigger if exists rechazar_cuenta_cerrada on public.pedidos;
-- drop function if exists privado.rechazar_cuenta_cerrada();
-- alter table public.pedidos  drop column if exists aviso_pago_tardio_en;
-- alter table public.usuarios drop column if exists cerrada_en;
-- commit;
--
-- (No se borra el esquema privado ni el permiso de uso: los usa 007.)

-- ============================================================================
-- Aparte, NO corre: índices repetidos del apodo (se decide después)
-- ============================================================================
-- drop index if exists public.idx_usuarios_nombre_usuario;   -- sobra sin duda
-- alter table public.usuarios drop constraint if exists usuarios_nombre_usuario_key;  -- también redundante
