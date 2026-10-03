-- ============================================================================
-- Bahía Shops · 018 · Dirección exacta o zona aproximada (3/10/2026)
-- Correr entero en el SQL Editor de Supabase. Va en transacción: si algo
-- falla, no cambia nada. Se puede correr dos veces sin romper nada.
--
-- CORRERLA DESPUÉS DE PUBLICAR EL CÓDIGO QUE LA ACOMPAÑA. El código nuevo
-- anda con y sin esta migración; el viejo no anda con ella (el alta y
-- /vendedor/ubicacion escriben columnas que acá dejan de ser escribibles, y
-- el disparador le borraría la dirección a un local nuevo, porque el alta
-- vieja no completa direccion_visible).
--
-- La pregunta de ubicación pasa a ser "¿Querés que se vea tu dirección
-- exacta?". Con "Sí", dirección y punto exacto como hasta ahora. Con "No",
-- calle y dos entrecalles, y un punto redondeado a una grilla de ~200 m: el
-- punto exacto no se guarda nunca. recibe_publico sigue existiendo y se
-- escribe igual a direccion_visible, hasta que se borre.
--
-- Qué deja hecho:
--   1. vendedores.direccion_visible, zona_calle, zona_entre, zona_y.
--   2. Los que recibían público pasan a direccion_visible = true.
--   3. Un disparador que, con "No", redondea el punto y borra la dirección,
--      y con "Sí" borra las calles. Vale para cualquier rol: es la segunda
--      barrera detrás de la ruta /api/vendedor/ubicacion.
--   4. Permisos: las columnas nuevas se leen en público; ninguna columna de
--      ubicación se escribe desde el navegador (solo la ruta, con
--      service_role).
--   5. De paso: anon y authenticated pierden DELETE, TRUNCATE, REFERENCES y
--      TRIGGER sobre vendedores, que tenían a nivel de tabla.
--
-- Funciona sobre el estado que dejó el borrador corrido por error el
-- 3/10/2026 (columnas, grants, constraint y función ya creados; disparador
-- borrado a mano) y lo deja igual que si se corriera de cero.
-- ============================================================================
begin;

create schema if not exists privado;

-- ---------------------------------------------------------------------------
-- 1. Columnas
-- ---------------------------------------------------------------------------
alter table public.vendedores
  add column if not exists direccion_visible boolean not null default false,
  add column if not exists zona_calle text,
  add column if not exists zona_entre text,
  add column if not exists zona_y text;

-- Por si la columna ya existía con otra definición.
alter table public.vendedores
  alter column direccion_visible set default false,
  alter column direccion_visible set not null;

alter table public.vendedores drop constraint if exists vendedores_zona_largo;
alter table public.vendedores add constraint vendedores_zona_largo check (
  coalesce(char_length(zona_calle), 0) <= 80 and
  coalesce(char_length(zona_entre), 0) <= 80 and
  coalesce(char_length(zona_y), 0) <= 80
);

-- ---------------------------------------------------------------------------
-- 3. El disparador (antes que los datos, para que los normalice)
-- ---------------------------------------------------------------------------
-- Pasos de la grilla: 0,0018° de latitud y 0,0023° de longitud (~200 m en
-- Bahía Blanca). Los mismos que src/lib/zonaVendedor.js. latitud y longitud
-- son numeric: la cuenta es exacta y redondear dos veces da lo mismo.
create or replace function privado.vendedores_redondear_zona()
returns trigger
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
begin
  if new.direccion_visible then
    new.zona_calle := null;
    new.zona_entre := null;
    new.zona_y := null;
  else
    new.direccion := null;
    if new.latitud is not null then
      new.latitud := round(new.latitud / 0.0018) * 0.0018;
    end if;
    if new.longitud is not null then
      new.longitud := round(new.longitud / 0.0023) * 0.0023;
    end if;
  end if;
  return new;
end;
$$;

revoke all on function privado.vendedores_redondear_zona() from public, anon, authenticated;

drop trigger if exists redondear_zona on public.vendedores;
create trigger redondear_zona before insert or update on public.vendedores
  for each row execute function privado.vendedores_redondear_zona();

-- ---------------------------------------------------------------------------
-- 2. Datos existentes
-- ---------------------------------------------------------------------------
-- Sin apagar trg_vendedores_vuelta_a_revision (006), estos UPDATE (corren
-- como postgres, no como service_role) devolverían a 'pendiente' a las
-- tiendas que están en 'necesita_cambios'.
alter table public.vendedores disable trigger trg_vendedores_vuelta_a_revision;

update public.vendedores
   set direccion_visible = true
 where recibe_publico is true and not direccion_visible;

-- Lo que quedó con "No" pasa por el disparador: punto redondeado, sin
-- dirección. Hoy no hay ninguna fila así; queda por si la hubiera.
update public.vendedores
   set latitud = latitud
 where not direccion_visible
   and (direccion is not null or latitud is not null or longitud is not null);

alter table public.vendedores enable trigger trg_vendedores_vuelta_a_revision;

-- ---------------------------------------------------------------------------
-- 4. Permisos (vendedores tiene SELECT, INSERT y UPDATE por columna desde
--    la 012: una columna nueva nace sin permisos)
-- ---------------------------------------------------------------------------
grant select (direccion_visible, zona_calle, zona_entre, zona_y)
  on public.vendedores to anon, authenticated;

-- La ubicación la escribe solo /api/vendedor/ubicacion (service_role).
-- localidad_id también: va junto con el barrio, que sale del punto.
revoke insert (recibe_publico, localidad_id, direccion, barrio_id, barrio_detectado_automaticamente,
               latitud, longitud, direccion_visible, zona_calle, zona_entre, zona_y),
       update (recibe_publico, localidad_id, direccion, barrio_id, barrio_detectado_automaticamente,
               latitud, longitud, direccion_visible, zona_calle, zona_entre, zona_y)
  on public.vendedores from anon, authenticated;

-- ---------------------------------------------------------------------------
-- 5. De paso: lo que anon y authenticated no deberían tener sobre vendedores
-- ---------------------------------------------------------------------------
-- DELETE es alcanzable por la API (DELETE /rest/v1/vendedores) y solo lo
-- frena RLS; ninguna pantalla lo usa: la baja de una tienda va por el
-- servidor. TRUNCATE no lo expone PostgREST, pero ignora RLS por completo.
-- REFERENCES y TRIGGER piden DDL, que la API no permite. Ninguno hace falta.
revoke delete, truncate, references, trigger on public.vendedores from anon, authenticated;

commit;

-- ---------------------------------------------------------------------------
-- Verificación (correr aparte, después)
-- ---------------------------------------------------------------------------
-- select id, recibe_publico, direccion_visible, latitud, longitud,
--        direccion is not null as tiene_direccion, zona_calle, zona_entre, zona_y
-- from public.vendedores order by id;
--
-- select tgname, tgenabled from pg_trigger
-- where tgrelid = 'public.vendedores'::regclass and not tgisinternal order by tgname;
--
-- select attname, attacl from pg_attribute
-- where attrelid = 'public.vendedores'::regclass and attnum > 0 and not attisdropped
--   and attname in ('recibe_publico','localidad_id','direccion','barrio_id','latitud','longitud',
--                   'direccion_visible','zona_calle','zona_entre','zona_y');
--
-- select grantee, privilege_type from information_schema.role_table_grants
-- where table_schema = 'public' and table_name = 'vendedores' and grantee in ('anon','authenticated');
-- (tiene que dar 0 filas)
