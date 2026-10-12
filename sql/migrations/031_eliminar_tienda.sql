-- ============================================================================
-- Bahía Shops · 031 · Eliminar la cuenta con tienda, y borrar tiendas de prueba
-- (12/10/2026)
-- Correr entero en el SQL Editor de Supabase. Va en transacción: si algo
-- falla, no cambia nada. Se puede correr dos veces sin romper nada.
--
-- CORRERLA ANTES DE PUBLICAR EL CÓDIGO QUE LA ACOMPAÑA. El código nuevo ya no
-- le pregunta a MercadoPago antes de eliminar una cuenta (la base cancela los
-- pendientes directamente), espera los motivos TIENDA_ACTIVA y VENTA_EN_CURSO,
-- limpia Storage con lo que devuelve cerrar_cuenta y llama a
-- rpc_borrar_tienda_de_prueba y a mis_tiendas_cerradas. El código viejo, con
-- esta migración ya corrida, sigue eliminando cuentas, pero a quien tenga
-- tienda le mostraría un motivo que no conoce (no se ve el texto).
--
-- Por qué: la etapa 3 de "dar de baja un emprendimiento". Hasta ahora, tener
-- una tienda impedía eliminar la cuenta. Ahora quien la pausó (etapa 2, 030)
-- puede eliminar su cuenta, y la tienda se cierra en la misma transacción.
--
-- Qué deja hecho:
--   1. privado.columnas_a_limpiar_tienda(): qué columnas de vendedores se
--      borran al cerrar una tienda. La tabla se creó fuera de las migraciones,
--      así que no se escribe la lista a mano: se lee de information_schema.
--      Se CONSERVA solo lo estructural (id, usuario_id, slug, categoría,
--      subcategoría, barrio, localidad, estado_validacion, bloqueado,
--      cerrada_en, fechas de alta/cambio y de revisión). TODO lo demás se
--      borra: a NULL si la columna lo permite; si no, a su valor por defecto;
--      si no tiene, el texto a 'cerrada-<id>'. Lo que no entra en ninguno de los tres
--      casos se conserva y queda listado (ver la verificación). Así, una
--      columna de contenido o de contacto que nadie anotó también se borra.
--   2. privado.borrar_productos(ids): borra productos y, a mano, todo lo que
--      los apunta (favoritos, colecciones, tesoros, fotos, variantes,
--      sellos). No depende de que esas claves foráneas sean CASCADE.
--   3. privado.cerrar_tienda(id): la tienda con pedidos. cerrada_en = now(),
--      sin pausa, datos borrados (1), sin sellos ni cuenta de MercadoPago, y
--      sin los productos que nunca se vendieron (los vendidos quedan: los
--      apuntan los ítems de los pedidos).
--   4. privado.borrar_tienda(id): la tienda sin ningún pedido. Se borra
--      entera: productos (2), sellos, MercadoPago, bloqueos, fallas de zona y
--      la fila.
--   5. privado.evaluar_eliminar_cuenta: el motivo TIENDA se reemplaza por dos:
--        TIENDA_ACTIVA   una tienda sin pausar (y sin cerrar)
--        VENTA_EN_CURSO  una tienda pausada con ventas sin entregar: pagado,
--                        preparando, franja, por_salir, un estado que no se
--                        conozca (falla cerrado, como la 016) o un pago en
--                        proceso (un cupón en efectivo generado: es una venta
--                        en curso, la tienda la ve en "Ventas nuevas")
--      Una tienda ya cerrada no impide nada.
--   6. privado.cerrar_cuenta:
--        · los pendientes y rechazados del comprador se cancelan con
--          cancelado_motivo = 'cuenta_eliminada' (antes, sin motivo), sin
--          preguntarle nada a MercadoPago;
--        · si tiene una tienda pausada: sus pendientes se cancelan con
--          'tienda_cerrada', y la tienda se cierra (3) si tiene pedidos o se
--          borra (4) si no;
--        · una tienda cerrada fuerza la cáscara anónima de la cuenta: borrar
--          auth.users arrastraría usuarios -> vendedores, y los pedidos de la
--          tienda lo impiden;
--        · devuelve "tienda": { id, nombre, accion: 'cerrada' | 'borrada' }
--          (el nombre leído ANTES de borrarlo, para el mail), para que el
--          servidor limpie Storage.
--        · ya no toca waitlist (7).
--   7. DROP TABLE waitlist: ya no la usa nada (la 016 la limpiaba al eliminar
--      una cuenta; esa línea se va con este cambio).
--   8. privado.borrar_tienda_de_prueba(id): solo service_role, para el admin.
--      Borra la tienda AUNQUE tenga pedidos: sus ítems, sus pedidos y la
--      tienda (4). No toca la cuenta del dueño.
--   9. public.mis_tiendas_cerradas(): para "Mis pedidos". Devuelve los ids de
--      las tiendas cerradas a las que la persona con sesión les compró. La
--      fila de una tienda cerrada no se puede leer (030), y desde el
--      navegador no se distingue de una bloqueada: esto dice cuál es cuál
--      solo para las tiendas de sus propios pedidos.
-- ============================================================================
begin;

create schema if not exists privado;
grant usage on schema privado to service_role;

-- ---------------------------------------------------------------------------
-- 1. Qué se borra de una tienda cerrada
-- ---------------------------------------------------------------------------
create or replace function privado.columnas_a_limpiar_tienda()
returns table (columna text, accion text)
language sql
stable
set search_path = public, pg_temp
as $$
  select c.column_name::text,
         case
           when c.is_generated = 'ALWAYS' or c.is_identity = 'YES' then 'conservar'
           when c.is_nullable = 'YES' then 'null'
           when c.column_default is not null then 'default'
           when c.data_type in ('text', 'character varying', 'character') then 'vacio'
           else 'conservar'
         end
    from information_schema.columns c
   where c.table_schema = 'public'
     and c.table_name = 'vendedores'
     and c.column_name not in (
       'id', 'usuario_id', 'slug', 'categoria_id', 'subcategoria_id',
       'barrio_id', 'localidad_id', 'estado_validacion', 'bloqueado',
       'cerrada_en', 'pausada_en', 'mensaje_pausa',
       'creado_en', 'actualizado_en', 'validado_en', 'validado_por'
     )
   order by c.ordinal_position;
$$;

-- ---------------------------------------------------------------------------
-- 2. Borrar productos con todo lo que los apunta
--
-- Las tablas que pueden no existir (o cuya clave foránea no conocemos) van con
-- to_regclass: si no está, se saltea.
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
-- 3. Cerrar una tienda con pedidos
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
-- 4. Borrar una tienda sin pedidos
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

  foreach v_tabla in array array['vendedor_sellos', 'mercadopago_cuentas', 'vendedor_bloqueos', 'envio_zona_fallas']
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
-- 5. ¿Se puede eliminar? Solo lee, no cambia nada.
--
-- Igual que en la 016, con la tienda en dos motivos y un dato más, "tienda":
-- { id, nombre, estado: 'activa' | 'pausada' } de la tienda sin cerrar, o null.
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
  v_activa      boolean;
  v_tienda      jsonb;
  v_ventas      int;
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

  -- Las tiendas que todavía no se cerraron.
  select count(*),
         bool_or(pausada_en is null)
    into v_tiendas, v_activa
    from public.vendedores
   where usuario_id = p_id and cerrada_en is null;

  select jsonb_build_object('id', id, 'nombre', nombre_negocio,
                            'estado', case when pausada_en is null then 'activa' else 'pausada' end)
    into v_tienda
    from public.vendedores
   where usuario_id = p_id and cerrada_en is null
   order by id
   limit 1;

  -- Las ventas sin entregar de sus tiendas pausadas.
  select count(*) into v_ventas
    from public.pedidos pe
    join public.vendedores v on v.id = pe.vendedor_id
   where v.usuario_id = p_id
     and v.cerrada_en is null
     and v.pausada_en is not null
     and (
       pe.estado not in ('pendiente', 'rechazado', 'cancelado', 'despachado', 'reembolsado')
       or (pe.estado = 'pendiente'
           and coalesce(btrim(pe.mp_payment_id), '') not in ('', 'null', 'undefined'))
     );

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
  if coalesce(v_activa, false) then v_motivos := v_motivos || '"TIENDA_ACTIVA"'::jsonb; end if;
  if v_ventas   > 0 then v_motivos := v_motivos || '"VENTA_EN_CURSO"'::jsonb; end if;
  if v_activos  > 0 then v_motivos := v_motivos || '"PEDIDO_ACTIVO"'::jsonb; end if;
  if v_en_curso > 0 then v_motivos := v_motivos || '"PAGO_EN_CURSO"'::jsonb; end if;

  return jsonb_build_object(
    'existe',          true,
    'cerrada',         v_u.cerrada_en is not null,
    'es_admin',        coalesce(v_u.es_admin, false),
    'es_validador',    v_validador,
    'tiendas',         v_tiendas,
    'tienda',          v_tienda,
    'ventas_tienda_en_curso', v_ventas,
    'pedidos_activos', v_activos,
    'pagos_en_curso',  v_en_curso,
    'pedidos_total',   v_total,
    'motivos',         v_motivos,
    'abandonados',     v_abandonados
  );
end;
$$;

-- ---------------------------------------------------------------------------
-- 6. El proceso. Todo o nada: es una sola transacción.
--
-- Devuelve un jsonb:
--   { ok: false, motivos: [...] }                       no se tocó nada
--   { ok: true, resultado: 'ya_cerrada' }               ya estaba hecha
--   { ok: true, resultado: 'borrada' | 'anonimizada',
--     emails: [...], nombre, pedidos_cancelados: [...],
--     tienda: { id, nombre, accion: 'cerrada' | 'borrada' } | null }
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
  v_tienda_id   integer;
  v_tienda_nom  text;
  v_tienda      jsonb := null;
  v_email_nuevo text := 'eliminada-' || p_id::text || '@cuenta-eliminada.invalid';
begin
  -- Se bloquea la fila: nadie puede crear una tienda, un pedido ni una
  -- dirección para esta cuenta hasta que esto termine. Y dos pedidos de
  -- eliminar a la vez se ponen en fila.
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

  -- También los pedidos (los de comprador y los de su tienda): el webhook de
  -- MercadoPago escribe sobre ellos. Y la tienda: la pausa se escribe desde
  -- /api/vendedor/pausa.
  perform 1 from public.pedidos where comprador_id = p_id for update;
  perform 1 from public.vendedores where usuario_id = p_id for update;
  perform 1 from public.pedidos
   where vendedor_id in (select id from public.vendedores where usuario_id = p_id and cerrada_en is null)
     for update;

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

  -- Los pedidos de comprador que nunca llegaron a un pago se cancelan, sin
  -- preguntarle a MercadoPago: sus links vencen solos, y un pago que llegue
  -- igual no revive un pedido cancelado (el webhook avisa adentro).
  with c as (
    update public.pedidos
       set estado = 'cancelado', cancelado_motivo = 'cuenta_eliminada', actualizado_en = now()
     where comprador_id = p_id
       and estado in ('pendiente', 'rechazado')
    returning id, vendedor_id, mp_preference_id
  )
  select coalesce(jsonb_agg(jsonb_build_object(
           'id', id, 'vendedor_id', vendedor_id, 'mp_preference_id', mp_preference_id) order by id),
         '[]'::jsonb)
  into v_cancelados
  from c;

  -- La tienda (pausada: si estuviera activa, la evaluación ya lo frenó).
  select id, nombre_negocio into v_tienda_id, v_tienda_nom
    from public.vendedores
   where usuario_id = p_id and cerrada_en is null
   order by id
   limit 1;

  if v_tienda_id is not null then
    update public.pedidos
       set estado = 'cancelado', cancelado_motivo = 'tienda_cerrada', actualizado_en = now()
     where vendedor_id = v_tienda_id
       and estado = 'pendiente';

    if exists (select 1 from public.pedidos where vendedor_id = v_tienda_id) then
      perform privado.cerrar_tienda(v_tienda_id);
      v_tienda := jsonb_build_object('id', v_tienda_id, 'nombre', nullif(btrim(v_tienda_nom), ''), 'accion', 'cerrada');
    else
      perform privado.borrar_tienda(v_tienda_id);
      v_tienda := jsonb_build_object('id', v_tienda_id, 'nombre', nullif(btrim(v_tienda_nom), ''), 'accion', 'borrada');
    end if;
  end if;

  -- Lo que se borra en los dos caminos: los mensajes (por cuenta y por mail,
  -- aunque se hayan mandado sin sesión), los contactos de gastronomía por mail,
  -- y lo que auth guarda sin clave foránea.
  delete from public.mensajes_contacto
   where usuario_id = p_id or lower(btrim(email)) = any (v_emails);
  delete from public.leads_gastronomia
   where lower(btrim(email)) = any (v_emails);

  delete from auth.flow_state     where user_id::text = p_id::text;
  delete from auth.refresh_tokens where user_id::text = p_id::text;

  -- Borrado completo solo si no quedó ninguna tienda (una cerrada sigue ahí,
  -- apuntada por sus pedidos: borrar la cuenta la arrastraría).
  if (v_eval ->> 'pedidos_total')::int = 0
     and not (v_eval ->> 'es_validador')::boolean
     and not exists (select 1 from public.vendedores where usuario_id = p_id) then
    -- ── Camino 1: sin pedidos ni tienda -> borrado completo ──
    delete from auth.users where id = p_id;

    if exists (select 1 from public.usuarios where id = p_id) then
      raise exception 'USUARIO_NO_SE_BORRO';
    end if;

    return jsonb_build_object(
      'ok', true, 'resultado', 'borrada',
      'emails', to_jsonb(v_emails), 'nombre', nullif(btrim(v_u.nombre), ''),
      'pedidos_cancelados', v_cancelados, 'tienda', v_tienda);
  end if;

  -- ── Camino 2: con pedidos (o con una tienda cerrada) -> cáscara anónima ──
  delete from public.favoritos       where usuario_id = p_id;
  delete from public.votos_funciones where usuario_id = p_id;

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
    'pedidos_cancelados', v_cancelados, 'tienda', v_tienda);
end;
$$;

-- ---------------------------------------------------------------------------
-- 7. La lista de espera ya no existe
-- ---------------------------------------------------------------------------
drop table if exists public.waitlist;

-- ---------------------------------------------------------------------------
-- 8. Borrar una tienda de prueba (admin), con pedidos y todo
--
-- Devuelve { ok: true, id, nombre, pedidos_borrados } o { ok: false } si la
-- tienda no existe.
-- ---------------------------------------------------------------------------
create or replace function privado.borrar_tienda_de_prueba(p_vendedor_id integer)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_nombre text;
  v_pedidos integer;
begin
  select nombre_negocio into v_nombre from public.vendedores where id = p_vendedor_id for update;
  if not found then
    return jsonb_build_object('ok', false);
  end if;

  perform 1 from public.pedidos where vendedor_id = p_vendedor_id for update;

  delete from public.pedido_items
   where pedido_id in (select id from public.pedidos where vendedor_id = p_vendedor_id)
      or producto_id in (select id from public.productos where vendedor_id = p_vendedor_id);
  delete from public.pedidos where vendedor_id = p_vendedor_id;
  get diagnostics v_pedidos = row_count;

  perform privado.borrar_tienda(p_vendedor_id);

  return jsonb_build_object('ok', true, 'id', p_vendedor_id, 'nombre', v_nombre, 'pedidos_borrados', v_pedidos);
end;
$$;

-- ---------------------------------------------------------------------------
-- 9. "Mis pedidos": qué tiendas de mis compras están cerradas
--
-- Está en public a propósito (se llama con .rpc() desde el navegador). Solo
-- mira los pedidos de quien llama (auth.uid()): no sirve para preguntar por
-- tiendas ajenas.
-- ---------------------------------------------------------------------------
create or replace function public.mis_tiendas_cerradas()
returns integer[]
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select coalesce(array_agg(distinct v.id), '{}')
    from public.pedidos pe
    join public.vendedores v on v.id = pe.vendedor_id
   where pe.comprador_id = auth.uid()
     and v.cerrada_en is not null;
$$;

-- ---------------------------------------------------------------------------
-- Permisos
-- ---------------------------------------------------------------------------
revoke all on function privado.columnas_a_limpiar_tienda()      from public, anon, authenticated;
revoke all on function privado.borrar_productos(integer[])      from public, anon, authenticated;
revoke all on function privado.cerrar_tienda(integer)           from public, anon, authenticated;
revoke all on function privado.borrar_tienda(integer)           from public, anon, authenticated;
revoke all on function privado.evaluar_eliminar_cuenta(uuid)    from public, anon, authenticated;
revoke all on function privado.cerrar_cuenta(uuid)              from public, anon, authenticated;
revoke all on function privado.borrar_tienda_de_prueba(integer) from public, anon, authenticated;
grant execute on function privado.columnas_a_limpiar_tienda()      to service_role;
grant execute on function privado.evaluar_eliminar_cuenta(uuid)    to service_role;
grant execute on function privado.cerrar_cuenta(uuid)              to service_role;
grant execute on function privado.borrar_tienda_de_prueba(integer) to service_role;

create or replace function public.rpc_borrar_tienda_de_prueba(p_vendedor_id integer)
returns jsonb
language sql
security invoker
as $$ select privado.borrar_tienda_de_prueba(p_vendedor_id) $$;

revoke all on function public.rpc_borrar_tienda_de_prueba(integer) from public, anon, authenticated;
grant execute on function public.rpc_borrar_tienda_de_prueba(integer) to service_role;

revoke all on function public.mis_tiendas_cerradas() from public, anon;
grant execute on function public.mis_tiendas_cerradas() to authenticated;

commit;

-- ============================================================================
-- Verificación (una sola fila; copiá la celda)
--   · funciones: todas true.
--   · permisos: anon y authenticated false, service_role true (salvo
--     mis_tiendas_cerradas, que es para authenticated).
--   · waitlist_existe: false.
--   · columnas_que_se_borran / columnas_que_se_conservan: revisá la lista. Si
--     en "se conservan" aparece algo que no es estructural, avisá.
--   · tiendas: cada tienda sin cerrar con lo que diría evaluar de su dueño.
--     Una activa tiene que dar TIENDA_ACTIVA; una pausada sin ventas en curso,
--     ningún motivo de tienda.
-- ============================================================================
select jsonb_pretty(jsonb_build_object(
  'funciones', jsonb_build_object(
      'evaluar_eliminar_cuenta',  to_regprocedure('privado.evaluar_eliminar_cuenta(uuid)') is not null,
      'cerrar_cuenta',            to_regprocedure('privado.cerrar_cuenta(uuid)') is not null,
      'cerrar_tienda',            to_regprocedure('privado.cerrar_tienda(integer)') is not null,
      'borrar_tienda',            to_regprocedure('privado.borrar_tienda(integer)') is not null,
      'borrar_tienda_de_prueba',  to_regprocedure('privado.borrar_tienda_de_prueba(integer)') is not null,
      'rpc_borrar_tienda_de_prueba', to_regprocedure('public.rpc_borrar_tienda_de_prueba(integer)') is not null,
      'mis_tiendas_cerradas',     to_regprocedure('public.mis_tiendas_cerradas()') is not null),
  'permisos_borrar_de_prueba', jsonb_build_object(
      'anon',          has_function_privilege('anon',          'public.rpc_borrar_tienda_de_prueba(integer)', 'execute'),
      'authenticated', has_function_privilege('authenticated', 'public.rpc_borrar_tienda_de_prueba(integer)', 'execute'),
      'service_role',  has_function_privilege('service_role',  'public.rpc_borrar_tienda_de_prueba(integer)', 'execute')),
  'permisos_mis_tiendas_cerradas', jsonb_build_object(
      'anon',          has_function_privilege('anon',          'public.mis_tiendas_cerradas()', 'execute'),
      'authenticated', has_function_privilege('authenticated', 'public.mis_tiendas_cerradas()', 'execute')),
  'waitlist_existe', to_regclass('public.waitlist') is not null,
  'columnas_que_se_borran', (select jsonb_agg(columna || ' -> ' || accion) from privado.columnas_a_limpiar_tienda() where accion <> 'conservar'),
  'columnas_que_se_conservan', (select jsonb_agg(columna) from privado.columnas_a_limpiar_tienda() where accion = 'conservar'),
  'tiendas', (select jsonb_agg(jsonb_build_object(
                 'id', v.id,
                 'pausada', v.pausada_en is not null,
                 'motivos', privado.evaluar_eliminar_cuenta(v.usuario_id) -> 'motivos') order by v.id)
                from public.vendedores v where v.cerrada_en is null),
  'tiendas_cerradas', (select count(*) from public.vendedores where cerrada_en is not null)
)) as verificacion;

-- ============================================================================
-- Para deshacer (correr en transacción). Las funciones evaluar_eliminar_cuenta
-- y cerrar_cuenta vuelven a las de la 016: correr otra vez las secciones 4, 5
-- y 6 de 016_eliminar_cuenta.sql (antes, volver a crear waitlist, porque la
-- cerrar_cuenta de la 016 la usa). Lo que el proceso ya hizo sobre cuentas y
-- tiendas reales NO se deshace, ni vuelven las filas que tenía waitlist.
-- ============================================================================
-- begin;
-- create table if not exists public.waitlist (id serial primary key, email text not null unique, creado_en timestamptz default now());
-- drop function if exists public.mis_tiendas_cerradas();
-- drop function if exists public.rpc_borrar_tienda_de_prueba(integer);
-- drop function if exists privado.borrar_tienda_de_prueba(integer);
-- drop function if exists privado.borrar_tienda(integer);
-- drop function if exists privado.cerrar_tienda(integer);
-- drop function if exists privado.borrar_productos(integer[]);
-- drop function if exists privado.columnas_a_limpiar_tienda();
-- -- (y acá, las secciones 4, 5 y 6 de la 016)
-- commit;
