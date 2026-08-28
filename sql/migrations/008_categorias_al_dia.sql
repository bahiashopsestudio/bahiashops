-- ============================================================================
-- Migración 008: Poner al día las categorías
-- Fecha: 2026-08-28
--
-- Descripción: abre las categorías que ya tienen contenido pero quedaron
-- cerradas. Es la deuda que dejó el bug que se arregla en esta misma tanda:
-- el alta de vendedor y las pantallas de producto hacían el UPDATE a
-- categorias.activa desde el navegador, la base lo rechazaba por permisos, y
-- como nadie miraba el error la categoría quedaba cerrada sin que se notara.
--
-- Al 2026-08-28 la única afectada es 'tecnologia' (id 18): la eligió el
-- vendedor 'bahia-shops' al darse de alta y nunca se abrió, así que su tienda
-- quedó fuera de la navegación por categoría.
--
-- La consulta no nombra a 'tecnologia': busca la condición, no el caso. Si
-- entre que esto se escribió y se corre apareció otra en la misma situación,
-- la arregla también. Si no hay ninguna, no toca nada.
--
-- De acá en adelante esto no vuelve a pasar: la apertura pasa por
-- /api/categorias/activar, que corre en el servidor con service_role.
--
-- Lo inverso NO se hace: una categoría abierta que se quedó sin vendedores se
-- deja abierta. Cerrarla es una decisión de quien administra, y para eso está
-- /admin/categorias.
-- ============================================================================

-- Para mirar antes de tocar nada — qué se va a abrir:
--
--   SELECT c.id, c.slug, c.activa,
--          COUNT(DISTINCT v.id) AS vendedores,
--          COUNT(DISTINCT p.id) AS productos
--   FROM categorias c
--   LEFT JOIN vendedores v ON v.categoria_id = c.id
--   LEFT JOIN productos  p ON p.categoria_id = c.id
--                          OR p.categoria_secundaria_id = c.id
--   WHERE c.activa = FALSE
--   GROUP BY c.id, c.slug, c.activa
--   HAVING COUNT(DISTINCT v.id) > 0 OR COUNT(DISTINCT p.id) > 0
--   ORDER BY c.id;

UPDATE categorias c
SET activa = TRUE
WHERE c.activa = FALSE
  AND (
    EXISTS (
      SELECT 1 FROM vendedores v
      WHERE v.categoria_id = c.id
    )
    OR EXISTS (
      SELECT 1 FROM productos p
      WHERE p.categoria_id = c.id
         OR p.categoria_secundaria_id = c.id
    )
  );

-- ============================================================================
-- Para revertir: no hay vuelta atrás automática, porque no queda registrado
-- cuáles abrió este script. Si hiciera falta, se cierran a mano desde
-- /admin/categorias, que es justamente para eso.
-- ============================================================================
