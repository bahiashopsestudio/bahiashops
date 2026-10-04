-- ============================================================================
-- Bahía Shops · 019 · Envíos: zona del pedido y registro de fallas (4/10/2026)
-- Correr entero en el SQL Editor de Supabase. Va en transacción: si algo
-- falla, no cambia nada. Se puede correr dos veces sin romper nada.
--
-- CORRERLA ANTES DE PUBLICAR EL CÓDIGO QUE LA ACOMPAÑA. El código nuevo lee
-- y escribe pedidos.zona_envio y envio_zona_fallas, que nacen acá. El código
-- viejo anda con ella: no conoce ninguna de las dos.
--
-- La zona del envío de la tienda ya no la calcula la base: la calcula el
-- servidor (src/lib/zonaEnvio.js) con la línea recta entre el punto de la
-- tienda y el de la dirección, por 1,3 para aproximar las calles. Por eso
-- calcular_zona_envio no se toca acá (el código viejo la sigue usando hasta
-- que se publique el nuevo) y se borra en la 020.
--
-- Qué deja hecho:
--   1. pedidos.zona_envio: la zona cobrada (envío de la tienda o correo).
--   2. envio_zona_fallas: cada vez que no se pudo calcular la zona porque
--      falta el punto de la tienda o el de la dirección. En public porque la
--      API no expone 'privado'; con RLS y sin políticas: sólo la escribe y la
--      lee service_role.
--      Arreglo: un borrador anterior de esta migración (corrido el 3/10/2026)
--      creó la tabla con barrio_vendedor_id y barrio_comprador_id en lugar de
--      motivo. Si la tabla tiene esas columnas y está vacía, se borra y se
--      vuelve a crear: queda igual que creada de cero (columnas en el mismo
--      orden, restricciones y permisos). Si tuviera filas, la migración se
--      frena sin cambiar nada, para no perder registros.
--      Ese borrador también reemplazó calcular_zona_envio por la versión que
--      devuelve null en vez de 4; acá no se toca (el código viejo anda con
--      cualquiera de las dos) y la 020 la borra.
--   3. barrio_en_punto y barrios_con_poligono pasan al repo tal cual
--      estaban (las usan el mapa y la ubicación de las tiendas). Van sin
--      search_path fijo, como las originales: PostGIS puede estar en otro
--      esquema ('extensions') y fijarlo rompería ST_*. create or replace
--      conserva sus permisos; si una firma o tipo de retorno no coincide con
--      el de producción, la migración falla entera y no cambia nada.
-- ============================================================================
begin;

-- ---------------------------------------------------------------------------
-- 1. La zona del pedido
-- ---------------------------------------------------------------------------
alter table public.pedidos add column if not exists zona_envio smallint;

alter table public.pedidos drop constraint if exists pedidos_zona_envio_valida;
alter table public.pedidos add constraint pedidos_zona_envio_valida
  check (zona_envio between 1 and 4);

-- ---------------------------------------------------------------------------
-- 2. Registro de las zonas que no se pudieron calcular
-- ---------------------------------------------------------------------------

-- La tabla del borrador anterior (con columnas de barrios), afuera si está
-- vacía. En una base nueva, o en la segunda corrida, no hace nada.
do $$
declare
  hay_filas boolean;
begin
  if exists (
    select 1 from pg_attribute
     where attrelid = to_regclass('public.envio_zona_fallas')
       and attname in ('barrio_vendedor_id', 'barrio_comprador_id')
       and not attisdropped
  ) then
    execute 'select exists (select 1 from public.envio_zona_fallas)' into hay_filas;
    if hay_filas then
      raise exception 'envio_zona_fallas tiene filas del borrador anterior: revisalas antes de correr la 019 (no se cambió nada)';
    end if;
    drop table public.envio_zona_fallas;
  end if;
end;
$$;

create table if not exists public.envio_zona_fallas (
  id bigint generated always as identity primary key,
  creado_en timestamptz not null default now(),
  vendedor_id bigint,
  direccion_id bigint,
  motivo text not null,
  origen text not null
);

alter table public.envio_zona_fallas drop constraint if exists envio_zona_fallas_motivo;
alter table public.envio_zona_fallas add constraint envio_zona_fallas_motivo
  check (motivo in ('tienda_sin_punto', 'direccion_sin_punto', 'sin_ningun_punto'));

alter table public.envio_zona_fallas drop constraint if exists envio_zona_fallas_origen;
alter table public.envio_zona_fallas add constraint envio_zona_fallas_origen
  check (origen in ('cotizar', 'crear'));

alter table public.envio_zona_fallas enable row level security;
revoke all on public.envio_zona_fallas from public, anon, authenticated;
grant select, insert on public.envio_zona_fallas to service_role;

-- ---------------------------------------------------------------------------
-- 3. Las funciones de barrios, en el repo (sin cambios)
-- ---------------------------------------------------------------------------

-- El barrio que contiene un punto (el más chico, prefiriendo los no oficiales).
create or replace function public.barrio_en_punto(lat double precision, lng double precision)
returns table(id integer, nombre text)
language sql
stable
as $$
  select b.id, b.nombre from public.barrios b
  where b.poligono is not null
    and ST_Contains(b.poligono, ST_SetSRID(ST_MakePoint(lng, lat), 4326))
  order by b.es_oficial asc, ST_Area(b.poligono) asc limit 1;
$$;

-- Los barrios con polígono, para dibujarlos en el mapa.
create or replace function public.barrios_con_poligono()
returns table(id integer, nombre text, es_oficial boolean, localidad_id integer, geojson json)
language sql
stable
as $$
  select b.id, b.nombre, b.es_oficial, b.localidad_id,
         ST_AsGeoJSON(b.poligono)::json
  from public.barrios b where b.poligono is not null;
$$;

commit;

-- ============================================================================
-- Verificación (una sola fila)
-- ============================================================================
select jsonb_pretty(jsonb_build_object(
  'zona_envio', (select format_type(atttypid, atttypmod) from pg_attribute
                  where attrelid = 'public.pedidos'::regclass and attname = 'zona_envio'),
  'fallas_rls', (select relrowsecurity from pg_class where oid = 'public.envio_zona_fallas'::regclass),
  'fallas_columnas', (select jsonb_agg(attname order by attnum) from pg_attribute
                  where attrelid = 'public.envio_zona_fallas'::regclass and attnum > 0 and not attisdropped)
));
