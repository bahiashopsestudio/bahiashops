-- ============================================================================
-- Bahía Shops · 036 · Pasos por forma de entrega y pedido entregado
-- (16/10/2026)
-- Correr entero en el SQL Editor de Supabase. Va en transacción: si algo
-- falla, no cambia nada. Se puede correr dos veces sin romper nada.
--
-- CORRERLA ANTES DE PUBLICAR EL CÓDIGO QUE LA ACOMPAÑA. Solo agrega: dos
-- columnas, un permiso, un CHECK y una función reemplazada. El código de hoy
-- no escribe nada nuevo y sigue igual (el CHECK acepta todos los estados que
-- usa). El código nuevo necesita esta migración: sin ella, marcar un pedido
-- como entregado o como listo da error visible, y Mis pedidos no carga (lee
-- entregado_at).
--
-- Por qué: cada forma de entrega tiene ahora su propia secuencia de pasos
-- (src/lib/pedidos.js) y todas terminan en 'entregado', que marca la tienda:
--
--   Retiro               pagado → preparando → listo → entregado
--   Envío de la tienda   pagado → preparando → franja → despachado → entregado
--   Correo               pagado → preparando → despachado → entregado
--   Coordinar            pagado → preparando → acordado → entregado
--
-- Qué deja hecho:
--   1. pedidos.entregado_at: cuándo la tienda lo marcó como entregado. Lo
--      lee Mis pedidos desde el navegador: lleva su grant select (pedidos
--      tiene permisos por columna para authenticated).
--   2. pedidos.aviso_listo_en: el mail «Tu pedido está listo para retirar»
--      sale una sola vez (el mismo reclamo que aviso_vendedor_en). Lo usa
--      solo el servidor: sin grant.
--   3. CHECK sobre pedidos.estado con los doce valores del código. Hasta hoy
--      era text sin ninguna regla.
--   4. privado.evaluar_eliminar_cuenta: 'entregado' cuenta como terminado,
--      igual que 'despachado'. 'listo' y 'acordado' cuentan como en curso,
--      igual que 'preparando' (ya pasaba: la lista es de los terminados).
--      Es la de la 031 con un solo cambio, en dos lugares: la lista de
--      estados terminados suma 'entregado'.
-- ============================================================================

begin;

-- ---------------------------------------------------------------------------
-- 1 y 2. Columnas nuevas
-- ---------------------------------------------------------------------------
alter table public.pedidos
  add column if not exists entregado_at timestamptz,
  add column if not exists aviso_listo_en timestamptz;

-- ---------------------------------------------------------------------------
-- Permisos. aviso_listo_en nace cerrado: el navegador no lo necesita.
-- ---------------------------------------------------------------------------
grant select (entregado_at) on public.pedidos to authenticated;

-- ---------------------------------------------------------------------------
-- 3. Los estados posibles
-- ---------------------------------------------------------------------------
alter table public.pedidos drop constraint if exists pedidos_estado_valido;
alter table public.pedidos add constraint pedidos_estado_valido
  check (estado in (
    'pendiente', 'pagado', 'rechazado', 'cancelado', 'reembolsado',
    'preparando', 'franja', 'por_salir', 'despachado',
    'listo', 'acordado', 'entregado'
  ));

-- ---------------------------------------------------------------------------
-- 4. ¿Se puede eliminar la cuenta? (la de la 031, con 'entregado' terminado)
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
       pe.estado not in ('pendiente', 'rechazado', 'cancelado', 'despachado', 'entregado', 'reembolsado')
       or (pe.estado = 'pendiente'
           and coalesce(btrim(pe.mp_payment_id), '') not in ('', 'null', 'undefined'))
     );

  select exists (select 1 from public.vendedores where validado_por = p_id) into v_validador;

  select
    count(*) filter (where estado not in ('pendiente', 'rechazado', 'cancelado', 'despachado', 'entregado', 'reembolsado')),
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

-- create or replace conserva los permisos de la 016 y la 031, pero se
-- repiten para que esta migración no dependa de eso.
revoke all on function privado.evaluar_eliminar_cuenta(uuid) from public, anon, authenticated;
grant execute on function privado.evaluar_eliminar_cuenta(uuid) to service_role;

notify pgrst, 'reload schema';

commit;

-- ============================================================================
-- Verificación (una sola fila; copiá la celda)
--   · columnas: entregado_at y aviso_listo_en, las dos timestamptz.
--   · entregado_at_authenticated: true. aviso_listo_en_authenticated: false.
--     anon: false en las dos.
--   · check_estado: la definición con los doce valores.
--   · funcion_con_entregado: true.
-- ============================================================================
select jsonb_pretty(jsonb_build_object(
  'columnas', (select jsonb_object_agg(column_name, data_type)
                 from information_schema.columns
                where table_schema = 'public' and table_name = 'pedidos'
                  and column_name in ('entregado_at', 'aviso_listo_en')),
  'entregado_at_authenticated',   has_column_privilege('authenticated', 'public.pedidos', 'entregado_at', 'select'),
  'aviso_listo_en_authenticated', has_column_privilege('authenticated', 'public.pedidos', 'aviso_listo_en', 'select'),
  'entregado_at_anon',            has_column_privilege('anon', 'public.pedidos', 'entregado_at', 'select'),
  'aviso_listo_en_anon',          has_column_privilege('anon', 'public.pedidos', 'aviso_listo_en', 'select'),
  'check_estado', (select pg_get_constraintdef(oid) from pg_constraint
                    where conrelid = 'public.pedidos'::regclass and conname = 'pedidos_estado_valido'),
  'funcion_con_entregado', (select prosrc like '%''entregado''%' from pg_proc p
                              join pg_namespace n on n.oid = p.pronamespace
                             where n.nspname = 'privado' and p.proname = 'evaluar_eliminar_cuenta')
)) as verificacion;

-- ============================================================================
-- Pedidos que quedarían afuera del CHECK. Tiene que dar cero filas. Si la
-- migración falló en el paso 3, correr esta consulta sola: muestra cuáles son.
-- ============================================================================
select estado, count(*)
  from public.pedidos
 where estado not in (
   'pendiente', 'pagado', 'rechazado', 'cancelado', 'reembolsado',
   'preparando', 'franja', 'por_salir', 'despachado',
   'listo', 'acordado', 'entregado'
 )
 group by estado;

-- ============================================================================
-- Para deshacer (correr en transacción). Con el código nuevo publicado,
-- marcar entregado o listo y Mis pedidos dejan de andar (con error visible).
-- La función vuelve a la de la 031 corriendo su sección 5.
-- ============================================================================
-- begin;
-- alter table public.pedidos drop constraint if exists pedidos_estado_valido;
-- revoke select (entregado_at) on public.pedidos from authenticated;
-- alter table public.pedidos drop column if exists aviso_listo_en;
-- alter table public.pedidos drop column if exists entregado_at;
-- notify pgrst, 'reload schema';
-- commit;
-- ============================================================================
