-- ============================================================================
-- Bahía Shops · 021 · Correo a cualquier ciudad y seguimiento (4/10/2026)
-- Correr entero en el SQL Editor de Supabase. Va en transacción: si algo
-- falla, no cambia nada. Se puede correr dos veces sin romper nada.
--
-- CORRERLA ANTES DE PUBLICAR EL CÓDIGO QUE LA ACOMPAÑA. El código nuevo lee
-- y escribe las columnas que nacen acá. El código viejo anda con ella: no las
-- conoce, y todas aceptan null.
--
-- Qué deja hecho:
--   1. direcciones: ciudad, provincia y codigo_postal. Una dirección de
--      Bahía Blanca es la que tiene barrio; las de otra ciudad no lo tienen.
--      A las que ya existen (todas con barrio) se les completa ciudad y
--      provincia. El código postal no se inventa: se pide al editarlas y al
--      elegir correo. Los CHECK aceptan null (las filas viejas) y exigen el
--      formato cuando hay dato. Las listas son las de src/lib/direcciones.js.
--   2. El disparador de la 017 sale de direcciones: quien compra puede vivir
--      en cualquier ciudad. Sigue en vendedores.
--   3. Permisos de direcciones: anon pierde todo (tabla y columnas, incluido
--      TRUNCATE); authenticated pierde TRUNCATE, REFERENCES y TRIGGER. Ninguna
--      pantalla sin sesión lee ni escribe direcciones: el checkout y Mis
--      direcciones piden la sesión antes, y las rutas usan service_role. Las
--      columnas nuevas, para authenticated, con los mismos permisos que las
--      demás (SELECT, INSERT y UPDATE). Las políticas no cambian.
--   4. pedidos: envio_empresa, envio_empresa_otra y envio_seguimiento, que la
--      tienda carga al despachar un pedido por correo (y puede corregir).
--   5. envio_zona_fallas.metodo: la zona sin calcular puede ser del envío de
--      la tienda o del correo. Las filas que ya hay son del envío de la tienda.
--   6. Los precios de correo (correo_1..4) se borran de costos_envio_zona:
--      eran por provincia y ahora las zonas van por distancia. Sólo los tenía
--      la tienda 15, de prueba. El método correo queda tildado; sin precios
--      no se ofrece y el panel avisa que hay que cargarlos. El disparador de
--      la 006 se apaga mientras dura: esto no es un cambio de la tienda.
-- ============================================================================
begin;

-- ---------------------------------------------------------------------------
-- 1. Ciudad, provincia y código postal
-- ---------------------------------------------------------------------------
alter table public.direcciones
  add column if not exists ciudad text,
  add column if not exists provincia text,
  add column if not exists codigo_postal text;

alter table public.direcciones drop constraint if exists direcciones_ciudad_valida;
alter table public.direcciones add constraint direcciones_ciudad_valida
  check (ciudad is null or char_length(ciudad) between 1 and 80);

alter table public.direcciones drop constraint if exists direcciones_provincia_valida;
alter table public.direcciones add constraint direcciones_provincia_valida
  check (provincia is null or provincia in (
    'Buenos Aires', 'Ciudad Autónoma de Buenos Aires', 'Catamarca', 'Chaco', 'Chubut', 'Córdoba',
    'Corrientes', 'Entre Ríos', 'Formosa', 'Jujuy', 'La Pampa', 'La Rioja', 'Mendoza', 'Misiones',
    'Neuquén', 'Río Negro', 'Salta', 'San Juan', 'San Luis', 'Santa Cruz', 'Santa Fe',
    'Santiago del Estero', 'Tierra del Fuego', 'Tucumán'
  ));

-- El CPA (B8000ABC) o el código de cuatro números (8000), ya normalizado.
alter table public.direcciones drop constraint if exists direcciones_codigo_postal_valido;
alter table public.direcciones add constraint direcciones_codigo_postal_valido
  check (codigo_postal is null or codigo_postal ~ '^([A-Z][0-9]{4}[A-Z]{3}|[0-9]{4})$');

-- ---------------------------------------------------------------------------
-- 2. El disparador de localidades inactivas, sólo para tiendas
-- ---------------------------------------------------------------------------
drop trigger if exists rechazar_localidad_inactiva on public.direcciones;

-- Las que ya existen son de Bahía (todas tienen barrio).
update public.direcciones
   set ciudad = 'Bahía Blanca', provincia = 'Buenos Aires'
 where barrio_id is not null
   and ciudad is null;

-- ---------------------------------------------------------------------------
-- 3. Permisos de direcciones
-- ---------------------------------------------------------------------------
-- Revocar un permiso de tabla también lo revoca en cada columna.
revoke all on table public.direcciones from anon;
revoke truncate, references, trigger on table public.direcciones from authenticated;
grant select (ciudad, provincia, codigo_postal),
      insert (ciudad, provincia, codigo_postal),
      update (ciudad, provincia, codigo_postal)
   on public.direcciones to authenticated;

-- ---------------------------------------------------------------------------
-- 4. Seguimiento del correo
-- ---------------------------------------------------------------------------
alter table public.pedidos
  add column if not exists envio_empresa text,
  add column if not exists envio_empresa_otra text,
  add column if not exists envio_seguimiento text;

alter table public.pedidos drop constraint if exists pedidos_envio_empresa_valida;
alter table public.pedidos add constraint pedidos_envio_empresa_valida
  check (envio_empresa is null or envio_empresa in ('correo_argentino', 'andreani', 'oca', 'otra'));

-- Empresa y número van juntos.
alter table public.pedidos drop constraint if exists pedidos_envio_seguimiento_completo;
alter table public.pedidos add constraint pedidos_envio_seguimiento_completo
  check ((envio_empresa is null) = (envio_seguimiento is null)
         and (envio_seguimiento is null or char_length(envio_seguimiento) between 1 and 60));

-- El nombre de la empresa, sólo y siempre con 'otra'. El "is not null" hace
-- falta: sin él, 'otra' sin nombre daría null, y un CHECK null deja pasar.
alter table public.pedidos drop constraint if exists pedidos_envio_empresa_otra_valida;
alter table public.pedidos add constraint pedidos_envio_empresa_otra_valida
  check ((envio_empresa is distinct from 'otra' and envio_empresa_otra is null)
         or (envio_empresa = 'otra' and envio_empresa_otra is not null
             and char_length(envio_empresa_otra) between 1 and 60));

-- ---------------------------------------------------------------------------
-- 5. El método en el registro de zonas sin calcular
-- ---------------------------------------------------------------------------
alter table public.envio_zona_fallas
  add column if not exists metodo text not null default 'envio_tienda';

alter table public.envio_zona_fallas drop constraint if exists envio_zona_fallas_metodo;
alter table public.envio_zona_fallas add constraint envio_zona_fallas_metodo
  check (metodo in ('envio_tienda', 'correo'));

-- ---------------------------------------------------------------------------
-- 6. Los precios de correo por provincia, afuera
-- ---------------------------------------------------------------------------
alter table public.vendedores disable trigger trg_vendedores_vuelta_a_revision;

-- costos_envio_zona puede ser jsonb o json: se quita con jsonb y se guarda en
-- el tipo de la columna.
do $$
declare
  tipo text;
begin
  select format_type(a.atttypid, a.atttypmod) into tipo
    from pg_attribute a
   where a.attrelid = 'public.vendedores'::regclass
     and a.attname = 'costos_envio_zona'
     and not a.attisdropped;

  if tipo = 'jsonb' then
    update public.vendedores
       set costos_envio_zona = costos_envio_zona - array['correo_1', 'correo_2', 'correo_3', 'correo_4']
     where costos_envio_zona ?| array['correo_1', 'correo_2', 'correo_3', 'correo_4'];
  elsif tipo = 'json' then
    update public.vendedores
       set costos_envio_zona = (costos_envio_zona::jsonb - array['correo_1', 'correo_2', 'correo_3', 'correo_4'])::json
     where costos_envio_zona::jsonb ?| array['correo_1', 'correo_2', 'correo_3', 'correo_4'];
  else
    raise exception 'vendedores.costos_envio_zona es de tipo %, se esperaba jsonb o json', tipo;
  end if;
end;
$$;

alter table public.vendedores enable trigger trg_vendedores_vuelta_a_revision;

commit;

-- ============================================================================
-- Verificación (una sola fila; copiá la celda)
-- ============================================================================
select jsonb_pretty(jsonb_build_object(
  'direcciones', (select jsonb_build_object(
      'total', count(*),
      'con_ciudad', count(*) filter (where ciudad is not null),
      'de_bahia', count(*) filter (where barrio_id is not null and ciudad = 'Bahía Blanca'),
      'sin_codigo_postal', count(*) filter (where codigo_postal is null))
    from public.direcciones),
  'disparadores_direcciones', (select jsonb_agg(tgname order by tgname) from pg_trigger
    where tgrelid = 'public.direcciones'::regclass and not tgisinternal),
  'disparadores_vendedores', (select jsonb_agg(tgname order by tgname) from pg_trigger
    where tgrelid = 'public.vendedores'::regclass and not tgisinternal),
  'permisos_anon', (select count(*) from information_schema.table_privileges
    where table_schema = 'public' and table_name = 'direcciones' and grantee = 'anon')
    + (select count(*) from information_schema.column_privileges
    where table_schema = 'public' and table_name = 'direcciones' and grantee = 'anon'),
  'permisos_authenticated_tabla', (select jsonb_agg(privilege_type order by privilege_type) from information_schema.table_privileges
    where table_schema = 'public' and table_name = 'direcciones' and grantee = 'authenticated'),
  'precios_correo', (select count(*) from public.vendedores
    where costos_envio_zona::jsonb ?| array['correo_1', 'correo_2', 'correo_3', 'correo_4']),
  'tienda_15', (select jsonb_build_object('metodos', to_jsonb(metodos_entrega_default), 'costos', costos_envio_zona::jsonb, 'estado', estado_validacion)
    from public.vendedores where id = 15)
));
