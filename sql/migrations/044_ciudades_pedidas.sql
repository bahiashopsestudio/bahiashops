-- ============================================================================
-- Bahía Shops · 044 · Ciudades pedidas (1/11/2026)
-- Correr entero en el SQL Editor de Supabase. Va en transacción: si algo
-- falla, no cambia nada. Se puede correr dos veces sin romper nada.
--
-- CORRERLA ANTES DE PUBLICAR EL CÓDIGO QUE LA ACOMPAÑA. Sin ella, "Enviar" en
-- la pregunta del alta da error; el resto del alta funciona igual. El código
-- viejo anda con ella: no la conoce.
--
-- Qué deja hecho:
--   1. ciudades_pedidas: quien todavía no puede abrir una tienda porque está
--      en otra ciudad anota cuál. Una fila por cuenta: si vuelve, se actualiza.
--   2. Permisos: nace cerrada (grupo "solo el servidor" de la 032). Escribe
--      /api/ciudades-pedidas y lee /api/admin/ciudades, los dos con
--      service_role. anon y authenticated no tienen nada.
--   3. Eliminar la cuenta (Ley 25.326) borra la fila en los dos caminos de
--      privado.cerrar_cuenta (031):
--        · Sin pedidos, borrado completo: la cascada desde public.usuarios.
--        · Con pedidos o tienda cerrada, cáscara anónima: la cuenta no se
--          borra, así que la cascada no alcanza. Lo hace un disparador sobre
--          usuarios.cerrada_en, como el de denuncias (035).
--   4. Nada nuevo a nombre de una cuenta eliminada: se suma a
--      privado.rechazar_cuenta_cerrada (016). Un upsert también lo dispara.
--
-- Lo que NO hace: no toca vendedores ni localidades, ni reescribe
-- privado.cerrar_cuenta.
-- ============================================================================
begin;

-- ---------------------------------------------------------------------------
-- 1. La tabla
-- ---------------------------------------------------------------------------
-- ciudad: como la escribe la persona, recortada. email: el de la cuenta al
-- anotarse. origen: hoy siempre 'alta'; 'mi_ubicacion' queda previsto por si
-- algún día se ofrece también ahí.
create table if not exists public.ciudades_pedidas (
  usuario_id uuid primary key references public.usuarios(id) on delete cascade,
  ciudad text not null
    check (ciudad = btrim(ciudad) and char_length(ciudad) between 1 and 120),
  email text not null
    check (char_length(email) between 1 and 254),
  origen text not null default 'alta'
    check (origen in ('alta', 'mi_ubicacion')),
  creado_en timestamptz not null default now(),
  actualizado_en timestamptz not null default now()
);

comment on table public.ciudades_pedidas is
  'Quien anotó en qué otra ciudad está su emprendimiento. Se borra al eliminar la cuenta.';

-- ---------------------------------------------------------------------------
-- 2. Permisos
-- ---------------------------------------------------------------------------
alter table public.ciudades_pedidas enable row level security;
revoke all on table public.ciudades_pedidas from public, anon, authenticated;
grant select, insert, update, delete on table public.ciudades_pedidas to service_role;

-- ---------------------------------------------------------------------------
-- 3. Cuenta cerrada: se borra lo que anotó
-- ---------------------------------------------------------------------------
create or replace function privado.ciudades_pedidas_borrar_al_cerrar_cuenta()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if new.cerrada_en is not null and old.cerrada_en is null then
    delete from public.ciudades_pedidas where usuario_id = new.id;
  end if;
  return new;
end;
$$;

revoke all on function privado.ciudades_pedidas_borrar_al_cerrar_cuenta() from public, anon, authenticated;

drop trigger if exists ciudades_pedidas_borrar_al_cerrar_cuenta on public.usuarios;
create trigger ciudades_pedidas_borrar_al_cerrar_cuenta
  after update of cerrada_en on public.usuarios
  for each row execute function privado.ciudades_pedidas_borrar_al_cerrar_cuenta();

-- ---------------------------------------------------------------------------
-- 4. Nada nuevo a nombre de una cuenta eliminada
-- ---------------------------------------------------------------------------
drop trigger if exists rechazar_cuenta_cerrada on public.ciudades_pedidas;
create trigger rechazar_cuenta_cerrada before insert on public.ciudades_pedidas
  for each row execute function privado.rechazar_cuenta_cerrada('usuario_id');

commit;

-- ============================================================================
-- Verificación (una sola fila). Tiene que dar: rls true, anon y authenticated
-- en false, las dos marcas de disparador en true.
-- ============================================================================
select jsonb_pretty(jsonb_build_object(
  'rls', (select relrowsecurity from pg_class where oid = 'public.ciudades_pedidas'::regclass),
  'anon_puede_algo', has_table_privilege('anon', 'public.ciudades_pedidas', 'select,insert,update,delete'),
  'authenticated_puede_algo', has_table_privilege('authenticated', 'public.ciudades_pedidas', 'select,insert,update,delete'),
  'service_role_escribe', has_table_privilege('service_role', 'public.ciudades_pedidas', 'insert'),
  'borra_al_cerrar_cuenta', exists (select 1 from pg_trigger where tgrelid = 'public.usuarios'::regclass and tgname = 'ciudades_pedidas_borrar_al_cerrar_cuenta'),
  'rechaza_cuenta_cerrada', exists (select 1 from pg_trigger where tgrelid = 'public.ciudades_pedidas'::regclass and tgname = 'rechazar_cuenta_cerrada')
));

-- ============================================================================
-- Deshacer (borra lo anotado):
-- ============================================================================
-- begin;
-- drop trigger if exists ciudades_pedidas_borrar_al_cerrar_cuenta on public.usuarios;
-- drop function if exists privado.ciudades_pedidas_borrar_al_cerrar_cuenta();
-- drop table if exists public.ciudades_pedidas;
-- commit;
