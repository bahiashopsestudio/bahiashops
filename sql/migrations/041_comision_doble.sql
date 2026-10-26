-- ============================================================================
-- Bahía Shops · 041 · Comisión doble: de dónde vino la compra y qué porcentaje
-- se cobró (26/10/2026)
-- Correr entero en el SQL Editor de Supabase. Va en transacción: si algo
-- falla, no cambia nada. Se puede correr dos veces sin romper nada.
--
-- CORRERLA DESPUÉS DE LA 040 Y ANTES DE PUBLICAR EL CÓDIGO QUE LA ACOMPAÑA.
-- Solo AGREGA columnas con valor por defecto: el código de hoy sigue igual
-- (sus pedidos quedan en 500, 'base', 'directo'). El código nuevo las
-- necesita: /api/pedidos/crear las escribe y /api/vendedor/pedidos las lee.
--
-- Por qué: la comisión pasa a depender de cómo llegó la compra
-- (src/lib/comision.js). 5% (500 puntos básicos) si llegó sola; 2,5% (250) si
-- llegó por el link propio de la tienda (?de=tienda, marca de 48 horas en el
-- navegador); y una comisión especial por tienda (migración 042) si es más
-- baja. Cada pedido guarda la suya:
--
--   origen           'directo' | 'link_tienda'. Es 'link_tienda' aunque
--                    termine aplicando la especial: el panel y los avisos
--                    cuentan las ventas por link.
--   comision_bp      el porcentaje aplicado, en puntos básicos (500 = 5%).
--   comision_motivo  'base' | 'link' | 'especial'.
--   link_tocado_en   cuándo tocó el link quien compró (solo si el origen es
--                    el link).
--
-- comision_plataforma sigue siendo el monto: es lo que leen «Pagar ahora»,
-- los mails y el panel, y no cambia.
--
-- Los pedidos viejos quedan en 500, 'base', 'directo': fueron todos al 5%.
-- Un ADD COLUMN NOT NULL con un DEFAULT fijo no reescribe la tabla ni dispara
-- disparadores (no toca actualizado_en).
--
-- Permisos: pedidos tiene SELECT de tabla para authenticated (034), así que
-- quien compró ve estas columnas de sus pedidos, igual que ya ve
-- comision_plataforma. Nadie las escribe desde el navegador: el pedido lo
-- inserta el servidor con service_role.
-- ============================================================================

begin;

alter table public.pedidos add column if not exists origen text not null default 'directo';
alter table public.pedidos add column if not exists comision_bp integer not null default 500;
alter table public.pedidos add column if not exists comision_motivo text not null default 'base';
alter table public.pedidos add column if not exists link_tocado_en timestamptz;

do $$
begin
  if not exists (select 1 from pg_constraint where conrelid = 'public.pedidos'::regclass and conname = 'pedidos_origen_check') then
    alter table public.pedidos add constraint pedidos_origen_check
      check (origen in ('directo', 'link_tienda'));
  end if;
  if not exists (select 1 from pg_constraint where conrelid = 'public.pedidos'::regclass and conname = 'pedidos_comision_bp_check') then
    alter table public.pedidos add constraint pedidos_comision_bp_check
      check (comision_bp between 0 and 10000);
  end if;
  if not exists (select 1 from pg_constraint where conrelid = 'public.pedidos'::regclass and conname = 'pedidos_comision_motivo_check') then
    alter table public.pedidos add constraint pedidos_comision_motivo_check
      check (comision_motivo in ('base', 'link', 'especial'));
  end if;
  if not exists (select 1 from pg_constraint where conrelid = 'public.pedidos'::regclass and conname = 'pedidos_origen_coherente_check') then
    alter table public.pedidos add constraint pedidos_origen_coherente_check
      check ((comision_motivo <> 'link' or origen = 'link_tienda')
             and ((origen = 'link_tienda') = (link_tocado_en is not null)));
  end if;
end $$;

-- Para el panel de la tienda (ventas por link) y los avisos del admin.
create index if not exists pedidos_vendedor_origen_pagado_idx
  on public.pedidos (vendedor_id, origen, pagado_en);

commit;

-- ---------------------------------------------------------------------------
-- Verificación (correr aparte, después)
-- ---------------------------------------------------------------------------
-- select column_name, data_type, is_nullable, column_default
-- from information_schema.columns
-- where table_schema = 'public' and table_name = 'pedidos'
--   and column_name in ('origen', 'comision_bp', 'comision_motivo', 'link_tocado_en');
--
-- select origen, comision_bp, comision_motivo, count(*) from public.pedidos
-- group by 1, 2, 3;
-- (antes de publicar el código: todo en 'directo', 500, 'base')
