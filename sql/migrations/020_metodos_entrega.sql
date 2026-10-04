-- ============================================================================
-- Bahía Shops · 020 · Métodos de entrega: cuatro valores (3/10/2026)
-- Correr entero en el SQL Editor de Supabase. Va en transacción: si algo
-- falla, no cambia nada. Se puede correr dos veces sin romper nada.
--
-- CORRERLA DESPUÉS DE PUBLICAR EL CÓDIGO QUE LA ACOMPAÑA (y después de la
-- 019). El código viejo escribe 'acordar', 'cadeteria', 'envio_propio' y
-- 'flash_pedidos', que acá dejan de valer. El código nuevo lee los nombres
-- viejos y los nuevos, así que anda antes y después de esta migración.
--
-- Los métodos son los de src/lib/metodosEntrega.js:
--   retiro, envio_tienda, correo, coordinar.
--
-- Qué deja hecho:
--   1. vendedores.metodos_entrega_default traducido a los nombres nuevos,
--      sin repetidos y sin valores desconocidos:
--        coordinar, acordar                         -> coordinar
--        envio_propio, flash_pedidos, cadeteria    -> envio_tienda
--      Una tienda con envio_tienda pero sin precios no lo ofrece hasta que
--      los cargue; mientras tanto ve el aviso del panel y, si no le queda
--      nada, quien compra ve "Coordinar con la tienda".
--   2. Lo mismo en pedidos.metodo_envio (hoy son todos 'retiro').
--   3. metodos_entrega_default y costos_envio_zona: vacíos en vez de null,
--      con default y not null.
--   4. CHECK: los cuatro valores en vendedores y pedidos, y precios por zona
--      con claves conocidas y números de 0 o más.
--   5. Borra calcular_zona_envio. Desde el código nuevo la zona la calcula el
--      servidor con los puntos de la tienda y de la dirección; la función
--      quedaba sin uso y con la regla vieja (de barrio a barrio, y la zona 4
--      cuando no podía medir): mejor que nadie la vuelva a usar por error.
--      Si algo de la base todavía dependiera de ella, la migración falla
--      entera y no cambia nada.
--
-- metodos_entrega_default puede ser text[] o jsonb: la migración mira el tipo
-- y hace lo que corresponde (no se pudo confirmar antes de escribirla).
--
-- El disparador de la 006 devolvería a revisión a toda tienda en
-- 'necesita_cambios' (el SQL Editor no corre como service_role): se apaga
-- mientras dura la traducción. Esto no es un cambio de la tienda.
-- ============================================================================
begin;

-- Los CHECK de una corrida anterior, afuera mientras se traduce.
alter table public.vendedores drop constraint if exists vendedores_metodos_validos;
alter table public.vendedores drop constraint if exists vendedores_costos_validos;
alter table public.pedidos drop constraint if exists pedidos_metodo_valido;

alter table public.vendedores disable trigger trg_vendedores_vuelta_a_revision;

-- ---------------------------------------------------------------------------
-- 1 y 3. Las tiendas
-- ---------------------------------------------------------------------------
do $$
declare
  tipo text;
begin
  select format_type(a.atttypid, a.atttypmod) into tipo
    from pg_attribute a
   where a.attrelid = 'public.vendedores'::regclass
     and a.attname = 'metodos_entrega_default'
     and not a.attisdropped;

  -- Se reescribe sólo la fila cuyo valor cambia: la segunda corrida no toca
  -- nada.
  if tipo = 'text[]' then
    update public.vendedores v
       set metodos_entrega_default = t.nuevo
      from (select x.id, coalesce((
                     select array_agg(n.valor order by n.primera)
                       from (select case m.valor
                                      when 'acordar' then 'coordinar'
                                      when 'cadeteria' then 'envio_tienda'
                                      when 'envio_propio' then 'envio_tienda'
                                      when 'flash_pedidos' then 'envio_tienda'
                                      else m.valor
                                    end as valor,
                                    min(m.orden) as primera
                               from unnest(x.metodos_entrega_default) with ordinality as m(valor, orden)
                              group by 1) n
                      where n.valor in ('retiro', 'envio_tienda', 'correo', 'coordinar')
                   ), '{}'::text[]) as nuevo
              from public.vendedores x) t
     where t.id = v.id
       and v.metodos_entrega_default is distinct from t.nuevo;

    alter table public.vendedores
      alter column metodos_entrega_default set default '{}'::text[],
      alter column metodos_entrega_default set not null;

    alter table public.vendedores add constraint vendedores_metodos_validos
      check (metodos_entrega_default <@ array['retiro', 'envio_tienda', 'correo', 'coordinar']::text[]);

  elsif tipo = 'jsonb' then
    update public.vendedores v
       set metodos_entrega_default = t.nuevo
      from (select x.id, coalesce((
                     select jsonb_agg(n.valor order by n.primera)
                       from (select case m.valor
                                      when 'acordar' then 'coordinar'
                                      when 'cadeteria' then 'envio_tienda'
                                      when 'envio_propio' then 'envio_tienda'
                                      when 'flash_pedidos' then 'envio_tienda'
                                      else m.valor
                                    end as valor,
                                    min(m.orden) as primera
                               from jsonb_array_elements_text(
                                      case when jsonb_typeof(x.metodos_entrega_default) = 'array'
                                           then x.metodos_entrega_default else '[]'::jsonb end
                                    ) with ordinality as m(valor, orden)
                              group by 1) n
                      where n.valor in ('retiro', 'envio_tienda', 'correo', 'coordinar')
                   ), '[]'::jsonb) as nuevo
              from public.vendedores x) t
     where t.id = v.id
       and v.metodos_entrega_default is distinct from t.nuevo;

    alter table public.vendedores
      alter column metodos_entrega_default set default '[]'::jsonb,
      alter column metodos_entrega_default set not null;

    alter table public.vendedores add constraint vendedores_metodos_validos
      check (jsonb_typeof(metodos_entrega_default) = 'array'
             and metodos_entrega_default <@ '["retiro", "envio_tienda", "correo", "coordinar"]'::jsonb);

  else
    raise exception 'vendedores.metodos_entrega_default es de tipo %, se esperaba text[] o jsonb', tipo;
  end if;
end;
$$;

update public.vendedores set costos_envio_zona = '{}' where costos_envio_zona is null;

alter table public.vendedores enable trigger trg_vendedores_vuelta_a_revision;

alter table public.vendedores
  alter column costos_envio_zona set default '{}',
  alter column costos_envio_zona set not null;

-- ---------------------------------------------------------------------------
-- 2. Los pedidos
-- ---------------------------------------------------------------------------
update public.pedidos
   set metodo_envio = case metodo_envio when 'acordar' then 'coordinar' else 'envio_tienda' end
 where metodo_envio in ('acordar', 'cadeteria', 'envio_propio', 'flash_pedidos');

-- ---------------------------------------------------------------------------
-- 4. Los CHECK
-- ---------------------------------------------------------------------------
create schema if not exists privado;

-- Precios por zona: un objeto con claves conocidas y valores numéricos de 0
-- o más (o null). Las claves son las de ZONAS_TIENDA y ZONAS_CORREO en
-- src/lib/metodosEntrega.js.
create or replace function privado.costos_envio_validos(costos jsonb)
returns boolean
language sql
immutable
set search_path = pg_catalog, pg_temp
as $$
  select jsonb_typeof(costos) = 'object'
     and not exists (
       select 1 from jsonb_each(costos) e
        where e.key not in ('zona_1', 'zona_2', 'zona_3', 'zona_4',
                            'correo_1', 'correo_2', 'correo_3', 'correo_4')
           or (jsonb_typeof(e.value) <> 'null'
               and (jsonb_typeof(e.value) <> 'number' or (e.value)::numeric < 0))
     )
$$;

alter table public.vendedores add constraint vendedores_costos_validos
  check (privado.costos_envio_validos(costos_envio_zona::jsonb));

alter table public.pedidos add constraint pedidos_metodo_valido
  check (metodo_envio in ('retiro', 'envio_tienda', 'correo', 'coordinar'));

-- ---------------------------------------------------------------------------
-- 5. La función de zonas vieja, afuera
-- ---------------------------------------------------------------------------
drop function if exists public.calcular_zona_envio(integer, integer);

commit;

-- ============================================================================
-- Verificación (una sola fila; copiá la celda)
-- ============================================================================
select jsonb_pretty(jsonb_build_object(
  'tiendas', (select jsonb_agg(jsonb_build_object(
      'id', id, 'metodos', to_jsonb(metodos_entrega_default),
      'costos', to_jsonb(costos_envio_zona), 'estado', estado_validacion) order by id)
    from public.vendedores),
  'pedidos', (select jsonb_object_agg(coalesce(metodo_envio, '(null)'), n)
    from (select metodo_envio, count(*) as n from public.pedidos group by 1) p),
  'checks', (select jsonb_agg(conname order by conname) from pg_constraint
    where conname in ('vendedores_metodos_validos', 'vendedores_costos_validos', 'pedidos_metodo_valido')),
  'disparador_006', (select tgenabled from pg_trigger where tgname = 'trg_vendedores_vuelta_a_revision'),
  'calcular_zona_envio', (select count(*) from pg_proc where proname = 'calcular_zona_envio')
));
