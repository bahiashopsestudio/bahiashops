-- ============================================================================
-- Migración 005: Tabla 'ideas_admin'
-- Fecha: 2026-08-12
--
-- Descripción: Lista de ideas pendientes para retomar más adelante, anotada
-- desde /admin/ideas. Se marcan como 'hecha' (queda el registro) o se
-- descartan (se borran). No es pública: toda la lectura/escritura pasa por
-- las rutas /api/admin/ideas con service_role, por eso no lleva policies.
-- ============================================================================

CREATE TABLE ideas_admin (
  id SERIAL PRIMARY KEY,
  texto TEXT NOT NULL,
  hecha BOOLEAN NOT NULL DEFAULT false,
  creada_en TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE ideas_admin ENABLE ROW LEVEL SECURITY;
-- Sin policies a propósito: la tabla queda inaccesible salvo por service_role.

INSERT INTO ideas_admin (texto) VALUES
  ('Historias — pestaña del navbar que no llevaba a ningún lado (apuntaba al inicio). Se ocultó hasta definir qué contenido va a tener y armar la página real.');
