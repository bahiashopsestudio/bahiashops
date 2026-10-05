-- ============================================================================
-- Bahía Shops · 023 · El link de pago de cada pedido (5/10/2026)
-- Correr entero en el SQL Editor de Supabase. Va en transacción: si algo
-- falla, no cambia nada. Se puede correr dos veces sin romper nada.
--
-- CORRERLA ANTES DE PUBLICAR EL CÓDIGO QUE LA ACOMPAÑA. El código nuevo guarda
-- pedidos.link_de_pago al crear cada pedido (en el mismo UPDATE que guarda
-- mp_preference_id): sin la columna, ese UPDATE falla y el pedido también se
-- queda sin mp_preference_id. El código viejo anda con ella: no la conoce.
-- Va después de la 022 (el botón "Pagar" también mira vence_en).
--
-- Por qué: Mis pedidos tiene un botón "Pagar" que vuelve a abrir el pago de un
-- pedido pendiente, mientras su link no venza. El link es el init_point que
-- devolvió MercadoPago al crear la preferencia (el de producción, no el de
-- sandbox): se guarda tal cual en vez de armarlo a mano a partir de
-- mp_preference_id, porque la forma de esa dirección es de MercadoPago y no
-- queremos adivinarla. Lo entrega solo /api/pedidos/[id]/pagar, que primero
-- comprueba que el pedido sea de quien lo pide.
--
-- Sin backfill: los pedidos que ya existen quedan con link_de_pago en null y no
-- muestran el botón.
--
-- Permisos: no se da ni se quita nada. Si pedidos tiene select de tabla (todo
-- indica que sí), quien compra podría leer el link de SUS pedidos (la política
-- de filas no cambia); el servidor lo lee con service_role. Es un link que ya
-- recibió al comprar.
-- ============================================================================
begin;

alter table public.pedidos
  add column if not exists link_de_pago text;

alter table public.pedidos drop constraint if exists pedidos_link_de_pago_valido;
alter table public.pedidos add constraint pedidos_link_de_pago_valido
  check (link_de_pago is null or link_de_pago like 'https://%');

commit;

-- ============================================================================
-- Verificación (una sola fila; copiá la celda)
-- ============================================================================
select jsonb_pretty(jsonb_build_object(
  'columna', exists (select 1 from information_schema.columns
                      where table_schema = 'public' and table_name = 'pedidos'
                        and column_name = 'link_de_pago'),
  'constraint', exists (select 1 from pg_constraint where conname = 'pedidos_link_de_pago_valido'),
  'columna_022', (select jsonb_agg(column_name order by column_name) from information_schema.columns
                   where table_schema = 'public' and table_name = 'pedidos'
                     and column_name in ('vence_en', 'cancelado_motivo')),
  'anon_lee_el_link', has_column_privilege('anon', 'public.pedidos', 'link_de_pago', 'select'),
  'pedidos_con_link', (select count(*) from public.pedidos where link_de_pago is not null)
)) as verificacion;

-- ============================================================================
-- Para deshacer (correr en transacción). Se pierden los links guardados: el
-- botón "Pagar" deja de andar hasta que se vuelva a aplicar.
-- ============================================================================
-- begin;
-- alter table public.pedidos drop constraint if exists pedidos_link_de_pago_valido;
-- alter table public.pedidos drop column if exists link_de_pago;
-- commit;
