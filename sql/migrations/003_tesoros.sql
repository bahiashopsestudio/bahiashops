-- ============================================================================
-- Migración 003: Tabla 'tesoros'
-- Fecha: 2026-08-11
--
-- Descripción: Vitrina curada de productos seleccionados a mano para la
-- página pública /tesoros. Cada fila referencia un producto existente;
-- los marcados como 'destacado' se muestran como bloque grande con quote.
-- ============================================================================

CREATE TABLE tesoros (
  id SERIAL PRIMARY KEY,
  producto_id INTEGER REFERENCES productos(id) ON DELETE CASCADE,
  destacado BOOLEAN DEFAULT false,
  color_fondo TEXT DEFAULT '#f1f29f',
  quote TEXT,
  quote_autor TEXT,
  orden INTEGER DEFAULT 0,
  activo BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- RLS
ALTER TABLE tesoros ENABLE ROW LEVEL SECURITY;

-- Lectura pública (es una vitrina)
CREATE POLICY "tesoros_lectura_publica" ON tesoros
  FOR SELECT USING (true);
