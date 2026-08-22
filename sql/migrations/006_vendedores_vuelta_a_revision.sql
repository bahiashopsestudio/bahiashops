-- ============================================================================
-- Migración 006: Disparador 'vendedores_vuelta_a_revision'
-- Fecha: 2026-08-22
--
-- Descripción: Cuando un vendedor al que se le pidieron cambios edita y guarda
-- sus datos, su tienda vuelve sola a la cola de revisión.
--
-- Por qué en la base y no en el código: el navegador NO tiene permiso de
-- escritura sobre estado_validacion (se revocó a propósito para que nadie se
-- apruebe solo), así que el guardado del vendedor no puede tocar esa columna.
-- Además, el vendedor edita sus datos desde cuatro pantallas distintas
-- (/vendedor/datos, /vendedor/ubicacion, /vendedor/envios y /vendedor/perfil);
-- con el disparador la regla vale para las cuatro y para cualquier otra que
-- se agregue después.
--
-- La regla:
--   Si la escritura NO viene del panel de administración,
--   y la fila venía en 'necesita_cambios',
--   y esta escritura no está tocando estado_validacion,
--   entonces pasa a 'pendiente'.
--
-- "No viene del panel de administración" se detecta por el rol: las rutas de
-- /api/admin escriben con service_role, y el navegador del vendedor lo hace
-- como 'authenticated'. Sin esta guarda, bloquear a un vendedor que estaba en
-- 'necesita_cambios' lo devolvería a la cola de revisión sin querer, porque
-- ese PUT manda solo la columna 'bloqueado'.
--
-- "No está tocando estado_validacion" se detecta comparando NEW con OLD:
-- PostgREST arma el UPDATE solo con las columnas que vienen en el payload, así
-- que si el vendedor no la manda, NEW.estado_validacion llega igual a OLD.
--
-- notas_validacion NO se borra: cuando el vendedor reaparece en la lista, el
-- admin necesita leer qué le había pedido para verificar si lo corrigió.
-- validado_en y validado_por tampoco se tocan: siguen contando cuándo y quién
-- hizo la última revisión, que es un dato cierto.
--
-- Nota: subir un logo o una portada desde /vendedor/perfil también devuelve la
-- ficha a revisión. Es intencional: cambió el contenido de la tienda.
-- ============================================================================

CREATE OR REPLACE FUNCTION vendedores_vuelta_a_revision()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  -- El panel de administración escribe con service_role: sus cambios nunca
  -- deben reabrir la revisión.
  IF current_user = 'service_role' THEN
    RETURN NEW;
  END IF;

  IF OLD.estado_validacion = 'necesita_cambios'
     AND NEW.estado_validacion IS NOT DISTINCT FROM OLD.estado_validacion
  THEN
    NEW.estado_validacion := 'pendiente';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_vendedores_vuelta_a_revision ON vendedores;

CREATE TRIGGER trg_vendedores_vuelta_a_revision
  BEFORE UPDATE ON vendedores
  FOR EACH ROW
  EXECUTE FUNCTION vendedores_vuelta_a_revision();

-- ============================================================================
-- Para revertir:
--
--   DROP TRIGGER IF EXISTS trg_vendedores_vuelta_a_revision ON vendedores;
--   DROP FUNCTION IF EXISTS vendedores_vuelta_a_revision();
-- ============================================================================
