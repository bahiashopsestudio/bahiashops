-- 029: columna para el recordatorio de carrito abandonado
--
-- Una tienda puede mandarle un mail al comprador recordándole que dejó algo
-- en el carrito. El envío se reclama igual que los demás mails de pedido:
-- SET recordatorio_enviado_en = now() WHERE recordatorio_enviado_en IS NULL.
-- Nunca se manda más de una vez.

ALTER TABLE pedidos
  ADD COLUMN IF NOT EXISTS recordatorio_enviado_en timestamptz;

COMMENT ON COLUMN pedidos.recordatorio_enviado_en IS
  'Cuándo se envió el mail de recordatorio de carrito abandonado. NULL = no se envió.';
