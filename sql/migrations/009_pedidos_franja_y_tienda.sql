-- ============================================================================
-- Migración 009: Franja horaria del despacho y nombre de la tienda en el pedido
-- Fecha: 2026-08-29
--
-- Dos columnas nuevas en 'pedidos', las dos por el mismo motivo: un pedido
-- tiene que poder contar su propia historia sin depender de lo que exista hoy
-- en el resto de la base.
--
-- 1. franja_horaria — la franja que el vendedor elige al avisar cuándo sale el
--    pedido. Hasta ahora la elegía, se usaba para armar el mensaje de WhatsApp
--    y se tiraba: el estado pasaba a 'franja' pero cuál franja era no quedaba
--    en ningún lado. La escribe /api/vendedor/pedidos/avanzar al pasar a
--    'franja'.
--
-- 2. vendedor_nombre — el nombre de la tienda tal como estaba al comprar. El
--    historial del comprador lo leía atravesando la tabla 'vendedores', y esa
--    lectura pasa por RLS: si la tienda se bloquea, la compra vieja se queda
--    sin nombre. Un historial muestra lo que la persona compró, no lo que
--    existe hoy. Es la misma idea con la que pedido_items ya guarda el nombre,
--    el precio y la foto de cada producto.
--
-- El enlace a la tienda sí sigue saliendo de 'vendedores': si la tienda ya no
-- está publicada, el nombre se muestra igual pero deja de ser un enlace.
--
-- No hace falta rellenar nada: al 2026-08-29 la tabla 'pedidos' está vacía.
-- La consulta de abajo igual cubre el caso por si se corre más tarde.
-- ============================================================================

ALTER TABLE pedidos
  ADD COLUMN IF NOT EXISTS franja_horaria TEXT,
  ADD COLUMN IF NOT EXISTS vendedor_nombre TEXT;

-- Por si ya hubiera pedidos cuando esto se corra: se copia el nombre actual
-- de cada tienda. De acá en adelante lo escribe /api/pedidos/crear.
UPDATE pedidos p
SET vendedor_nombre = v.nombre_negocio
FROM vendedores v
WHERE p.vendedor_id = v.id
  AND p.vendedor_nombre IS NULL;

-- ============================================================================
-- Para revertir:
--
--   ALTER TABLE pedidos DROP COLUMN IF EXISTS franja_horaria;
--   ALTER TABLE pedidos DROP COLUMN IF EXISTS vendedor_nombre;
--
-- Si sólo querés descartar vendedor_nombre y quedarte con la franja, borrá esa
-- sola: /mis-pedidos vuelve a mostrar el nombre desde el join, con el hueco
-- que eso implica para las tiendas bloqueadas.
-- ============================================================================
