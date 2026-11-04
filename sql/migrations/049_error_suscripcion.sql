-- ============================================================================
-- Bahía Shops · 049 · El error de Mercado Pago al crear una suscripción
-- (tanda F3.1, ajustes de la prueba real) (04/11/2026)
-- Correr entero en el SQL Editor de Supabase. Va en transacción. Se puede
-- correr dos veces sin romper nada.
--
-- CORRERLA ANTES DE PUBLICAR EL CÓDIGO QUE LA ACOMPAÑA: el código nuevo
-- guarda el error en esta columna; sin ella, una suscripción que Mercado Pago
-- rechaza queda en 'creando' (la tarea diaria la cancela al día siguiente) en
-- vez de 'error'. Con la columna y el código viejo no cambia nada.
--
-- Por qué: en la prueba real del 04/11 Mercado Pago rechazó dos altas y el
-- motivo quedó solo en el log de Vercel, que dura minutos. Ahora queda en la
-- fila y la ficha del admin lo muestra.
--
-- Qué hace:
--   1. vendedor_suscripciones.error_mp: el status y el mensaje de Mercado Pago
--      cuando no aceptó crear la suscripción (como mucho 300 caracteres). Sin
--      permisos nuevos: la tabla sigue siendo solo de service_role (048).
-- ============================================================================

begin;

alter table public.vendedor_suscripciones add column if not exists error_mp text;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'vendedor_suscripciones_error_mp_check') then
    alter table public.vendedor_suscripciones
      add constraint vendedor_suscripciones_error_mp_check check (error_mp is null or char_length(error_mp) <= 300);
  end if;
end $$;

notify pgrst, 'reload schema';

commit;

-- ============================================================================
-- Verificación (una sola fila): columna true; anon y authenticated false.
-- ============================================================================
select jsonb_pretty(jsonb_build_object(
  'columna', exists (select 1 from information_schema.columns
      where table_schema = 'public' and table_name = 'vendedor_suscripciones' and column_name = 'error_mp'),
  'anon', has_table_privilege('anon', 'public.vendedor_suscripciones', 'select'),
  'authenticated', has_table_privilege('authenticated', 'public.vendedor_suscripciones', 'select')
)) as verificacion;

-- ============================================================================
-- Para deshacer:
--   alter table public.vendedor_suscripciones drop column if exists error_mp;
-- ============================================================================
