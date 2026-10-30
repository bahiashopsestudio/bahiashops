-- ============================================================================
-- Bahía Shops · 043 · El cartel de "publicada" y el link propio (29/10/2026)
-- Correr entero en el SQL Editor de Supabase. Va en transacción: si algo
-- falla, no cambia nada. Se puede correr dos veces sin romper nada.
--
-- CORRERLA ANTES DE PUBLICAR EL CÓDIGO QUE LA ACOMPAÑA. Mi negocio lee las
-- dos columnas en su select de vendedores: sin ellas, la página no carga. El
-- código viejo anda con ella: no las conoce.
--
-- Qué deja hecho:
--   1. vendedores.cartel_publicada_cerrado: la tienda cerró el cartel de
--      "Tu tienda está publicada". Para siempre, en cualquier dispositivo.
--   2. vendedores.link_propio_minimizado: el bloque "Tu link" de Mi negocio
--      está minimizado.
--   3. SELECT de las dos para authenticated (vendedores tiene permisos por
--      columna: una columna nueva nace invisible, ver la 034).
--   4. Nadie las escribe desde el navegador: las escribe
--      /api/vendedor/preferencias con service_role. Así el disparador de la
--      006 (trg_vendedores_vuelta_a_revision) no manda a revisión una tienda
--      en 'necesita_cambios' por minimizar el link.
--
-- Lo que NO hace: no toca disparadores, políticas ni funciones.
-- privado.borrar_tienda borra la fila; privado.cerrar_tienda las vuelve a
-- false (columnas_a_limpiar_tienda las toma solas, acción 'default').
-- ============================================================================
begin;

alter table public.vendedores
  add column if not exists cartel_publicada_cerrado boolean not null default false,
  add column if not exists link_propio_minimizado boolean not null default false;

grant select (cartel_publicada_cerrado, link_propio_minimizado)
  on public.vendedores to authenticated;

revoke insert (cartel_publicada_cerrado, link_propio_minimizado),
       update (cartel_publicada_cerrado, link_propio_minimizado)
  on public.vendedores from anon, authenticated;

commit;

-- ============================================================================
-- Verificación (una sola fila; copiá la celda)
--   · columnas: las dos, boolean, NO, default false.
--   · lee_authenticated: true. lee_anon: false.
--   · escribe_el_navegador: false.
--   · al_cerrar_tienda: las dos con 'default'.
-- ============================================================================
select jsonb_pretty(jsonb_build_object(
  'columnas', (select jsonb_agg(jsonb_build_object('columna', column_name, 'tipo', data_type,
                                                   'nulo', is_nullable, 'default', column_default)
                                order by column_name)
                 from information_schema.columns
                where table_schema = 'public' and table_name = 'vendedores'
                  and column_name in ('cartel_publicada_cerrado', 'link_propio_minimizado')),
  'lee_authenticated', has_column_privilege('authenticated', 'public.vendedores', 'cartel_publicada_cerrado', 'select')
                       and has_column_privilege('authenticated', 'public.vendedores', 'link_propio_minimizado', 'select'),
  'lee_anon', has_column_privilege('anon', 'public.vendedores', 'cartel_publicada_cerrado', 'select')
              or has_column_privilege('anon', 'public.vendedores', 'link_propio_minimizado', 'select'),
  'escribe_el_navegador', has_column_privilege('authenticated', 'public.vendedores', 'cartel_publicada_cerrado', 'update')
                          or has_column_privilege('authenticated', 'public.vendedores', 'link_propio_minimizado', 'update')
                          or has_column_privilege('authenticated', 'public.vendedores', 'cartel_publicada_cerrado', 'insert')
                          or has_column_privilege('authenticated', 'public.vendedores', 'link_propio_minimizado', 'insert')
                          or has_column_privilege('anon', 'public.vendedores', 'cartel_publicada_cerrado', 'update')
                          or has_column_privilege('anon', 'public.vendedores', 'link_propio_minimizado', 'update'),
  'al_cerrar_tienda', (select jsonb_object_agg(columna, accion) from privado.columnas_a_limpiar_tienda()
                        where columna in ('cartel_publicada_cerrado', 'link_propio_minimizado')),
  'filas_en_true', (select count(*) from public.vendedores
                     where cartel_publicada_cerrado or link_propio_minimizado)
)) as verificacion;

-- ============================================================================
-- Para deshacer (correr en transacción; antes, volver al código anterior).
-- ============================================================================
-- begin;
-- alter table public.vendedores drop column if exists cartel_publicada_cerrado;
-- alter table public.vendedores drop column if exists link_propio_minimizado;
-- commit;
