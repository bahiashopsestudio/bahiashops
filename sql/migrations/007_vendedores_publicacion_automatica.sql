-- ============================================================================
-- Migración 007: Publicación automática de vendedores y bloqueo efectivo
-- Fecha: 2026-08-24
--
-- Descripción: cambia el modelo de validación. La aprobación previa deja de
-- existir como puerta de entrada: el alta se publica sola. El control se
-- corre a los productos (moderación, que ya existe) y al bloqueo.
--
-- Tres cosas pasan acá:
--
-- 1. estado_validacion pasa a nacer en 'aprobado', y las tiendas que estaban
--    esperando se publican. Los estados 'pendiente' y 'necesita_cambios'
--    siguen existiendo: ahora son una medida intermedia del admin
--    (despublicar una tienda ya publicada), no un paso obligatorio del alta.
--
-- 2. 'bloqueado' pasa a ser NOT NULL y el motivo del bloqueo se guarda en una
--    tabla aparte, 'vendedor_bloqueos', que no es pública.
--
-- 3. Un vendedor bloqueado deja de ser visible: policies RESTRICTIVE sobre
--    'vendedores' y 'productos'. Son RESTRICTIVE a propósito — se suman con
--    AND a las policies permisivas que ya existen, así que no hace falta
--    tocar ninguna policy anterior ni conocer su nombre.
-- ============================================================================


-- ── 1. Los vendedores se publican solos ─────────────────────────────────────

ALTER TABLE vendedores
  ALTER COLUMN estado_validacion SET DEFAULT 'aprobado';

-- Las tiendas que estaban esperando se publican. No se toca validado_en ni
-- validado_por: nadie las revisó, y decir lo contrario sería falso.
-- notas_validacion sí se limpia en las que estaban en 'necesita_cambios':
-- ese pedido ya no aplica, y el cartel del panel del vendedor lo lee.
UPDATE vendedores
SET
  estado_validacion = 'aprobado',
  notas_validacion  = NULL
WHERE estado_validacion IN ('pendiente', 'necesita_cambios');


-- ── 2. Bloqueo: sin nulos, y el motivo guardado donde no se lea de afuera ───

UPDATE vendedores SET bloqueado = FALSE WHERE bloqueado IS NULL;

ALTER TABLE vendedores
  ALTER COLUMN bloqueado SET DEFAULT FALSE,
  ALTER COLUMN bloqueado SET NOT NULL;

-- Dónde va el motivo y por qué acá:
--
-- No se reusa notas_validacion. Esa columna es de lectura pública (cualquiera
-- con la anon key la lee) y además se le muestra al vendedor en su panel: es
-- el texto de "pedir cambios". El motivo de un bloqueo no es ninguna de las
-- dos cosas.
--
-- Tampoco va como columna nueva en 'vendedores'. Esa tabla tiene el SELECT
-- concedido a nivel de tabla, así que toda columna nueva nace pública, y en
-- PostgreSQL un REVOKE por columna NO recorta un GRANT de tabla: habría que
-- revocar el SELECT entero y volver a concederlo columna por columna, y desde
-- ahí cada columna futura nacería invisible sin que nadie se acuerde de por
-- qué.
--
-- Va en su propia tabla, con RLS activo y sin policies: igual que ideas_admin
-- (migración 005), queda inaccesible salvo por service_role, que es como
-- escriben y leen las rutas de /api/admin. De paso queda el historial: cuántas
-- veces se bloqueó a alguien y por qué, no sólo la última.
CREATE TABLE IF NOT EXISTS vendedor_bloqueos (
  id SERIAL PRIMARY KEY,
  vendedor_id INTEGER NOT NULL REFERENCES vendedores(id) ON DELETE CASCADE,
  motivo TEXT NOT NULL,
  bloqueado_por UUID,
  creado_en TIMESTAMPTZ NOT NULL DEFAULT now(),
  -- NULL mientras el bloqueo sigue vigente; con fecha cuando se levantó.
  levantado_en TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_vendedor_bloqueos_vendedor
  ON vendedor_bloqueos(vendedor_id);

ALTER TABLE vendedor_bloqueos ENABLE ROW LEVEL SECURITY;
-- Sin policies a propósito: nadie que no sea service_role puede tocarla.


-- ── 3. Un vendedor bloqueado desaparece ─────────────────────────────────────

-- La tienda. El propio vendedor sigue viendo su ficha: si no, su panel se
-- rompe entero y no puede ni leer por qué lo bloquearon.
DROP POLICY IF EXISTS "Vendedor bloqueado no se muestra" ON vendedores;

CREATE POLICY "Vendedor bloqueado no se muestra" ON vendedores
  AS RESTRICTIVE
  FOR SELECT
  TO anon, authenticated
  USING (
    bloqueado = FALSE
    OR usuario_id = auth.uid()
  );

-- Los productos. Va por función SECURITY DEFINER y no por un subselect
-- directo sobre 'vendedores' para que la policy de arriba no se aplique
-- adentro de esta: si se aplicara, quedaría una policy leyendo una tabla cuyas
-- policies leen esta misma, y el propio vendedor bloqueado podría perder de
-- vista sus productos.
--
-- La función vive en un esquema aparte a propósito: PostgREST publica como
-- RPC todo lo que encuentra en los esquemas expuestos, y esta responde
-- "¿está bloqueado este vendedor?" — no es algo que deba poder preguntar
-- cualquiera con la anon key.
CREATE SCHEMA IF NOT EXISTS privado;
GRANT USAGE ON SCHEMA privado TO anon, authenticated;

CREATE OR REPLACE FUNCTION privado.vendedor_visible(p_vendedor_id INTEGER)
RETURNS BOOLEAN
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM vendedores v
    WHERE v.id = p_vendedor_id
      AND (v.bloqueado = FALSE OR v.usuario_id = auth.uid())
  );
$$;

DROP POLICY IF EXISTS "Productos de vendedor bloqueado ocultos" ON productos;

CREATE POLICY "Productos de vendedor bloqueado ocultos" ON productos
  AS RESTRICTIVE
  FOR SELECT
  TO anon, authenticated
  USING (privado.vendedor_visible(vendedor_id));

-- Nota: el panel de administración no se ve afectado. Escribe y lee con
-- service_role, que ignora RLS.


-- ============================================================================
-- Para revertir:
--
--   DROP POLICY IF EXISTS "Productos de vendedor bloqueado ocultos" ON productos;
--   DROP POLICY IF EXISTS "Vendedor bloqueado no se muestra" ON vendedores;
--   DROP FUNCTION IF EXISTS privado.vendedor_visible(INTEGER);
--   ALTER TABLE vendedores ALTER COLUMN estado_validacion SET DEFAULT 'pendiente';
--   -- vendedor_bloqueos se puede dejar: es historial y no molesta.
--
-- Lo que NO se revierte solo: las tiendas que este script publicó siguen
-- publicadas. Si hace falta, hay que volver a marcarlas a mano.
-- ============================================================================
