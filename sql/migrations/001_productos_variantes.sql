-- ============================================================================
-- Migración 001: Variantes de productos
-- Fecha: 2026-05-30
-- 
-- Descripción: Agrega soporte para productos con hasta 2 propiedades de
-- variantes (ej: talle + color en indumentaria). Los productos sin variantes
-- siguen usando productos.stock; los que tienen variantes guardan el stock
-- por combinación en producto_variantes.
-- ============================================================================

-- 1. Sumar columnas a productos para soporte de variantes
ALTER TABLE productos
  ADD COLUMN tiene_variantes BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN propiedad_1_nombre TEXT,
  ADD COLUMN propiedad_2_nombre TEXT;

-- 2. Constraint de coherencia: si tiene_variantes=true, debe haber al menos
-- una propiedad nombrada. Si tiene_variantes=false, ambas deben ser NULL.
ALTER TABLE productos
  ADD CONSTRAINT check_variantes_coherentes
  CHECK (
    (tiene_variantes = FALSE AND propiedad_1_nombre IS NULL AND propiedad_2_nombre IS NULL)
    OR
    (tiene_variantes = TRUE  AND propiedad_1_nombre IS NOT NULL)
  );

-- 3. Tabla producto_variantes: una fila por combinación de variante
CREATE TABLE producto_variantes (
  id SERIAL PRIMARY KEY,
  producto_id INTEGER NOT NULL REFERENCES productos(id) ON DELETE CASCADE,
  propiedad_1_valor TEXT NOT NULL,
  propiedad_2_valor TEXT,
  stock INTEGER NOT NULL DEFAULT 0,
  imagen_url TEXT,
  creada_en TIMESTAMPTZ DEFAULT NOW(),
  actualizada_en TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (producto_id, propiedad_1_valor, propiedad_2_valor)
);

CREATE INDEX idx_producto_variantes_producto ON producto_variantes(producto_id);

-- 4. RLS policies para producto_variantes
ALTER TABLE producto_variantes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Lectura pública variantes" ON producto_variantes
FOR SELECT USING (
  producto_id IN (
    SELECT p.id FROM productos p
    JOIN vendedores v ON p.vendedor_id = v.id
    WHERE p.estado = 'activo' AND v.estado_validacion = 'aprobado'
  )
);

CREATE POLICY "Vendedor crea variantes de sus productos" ON producto_variantes
FOR INSERT WITH CHECK (
  producto_id IN (
    SELECT p.id FROM productos p
    JOIN vendedores v ON p.vendedor_id = v.id
    WHERE v.usuario_id = auth.uid()
  )
);

CREATE POLICY "Vendedor edita variantes de sus productos" ON producto_variantes
FOR UPDATE USING (
  producto_id IN (
    SELECT p.id FROM productos p
    JOIN vendedores v ON p.vendedor_id = v.id
    WHERE v.usuario_id = auth.uid()
  )
);

CREATE POLICY "Vendedor borra variantes de sus productos" ON producto_variantes
FOR DELETE USING (
  producto_id IN (
    SELECT p.id FROM productos p
    JOIN vendedores v ON p.vendedor_id = v.id
    WHERE v.usuario_id = auth.uid()
  )
);

-- 5. Storage: bucket 'productos' (creado por UI con public=true, 
-- max 5MB, MIME image/jpeg, image/png, image/webp)
-- Policies del bucket:

CREATE POLICY "Lectura pública imágenes productos"
ON storage.objects FOR SELECT
USING (bucket_id = 'productos');

CREATE POLICY "Vendedor sube imágenes a su carpeta"
ON storage.objects FOR INSERT
WITH CHECK (
  bucket_id = 'productos'
  AND (storage.foldername(name))[1]::integer IN (
    SELECT id FROM vendedores WHERE usuario_id = auth.uid()
  )
);

CREATE POLICY "Vendedor edita imágenes de su carpeta"
ON storage.objects FOR UPDATE
USING (
  bucket_id = 'productos'
  AND (storage.foldername(name))[1]::integer IN (
    SELECT id FROM vendedores WHERE usuario_id = auth.uid()
  )
);

CREATE POLICY "Vendedor borra imágenes de su carpeta"
ON storage.objects FOR DELETE
USING (
  bucket_id = 'productos'
  AND (storage.foldername(name))[1]::integer IN (
    SELECT id FROM vendedores WHERE usuario_id = auth.uid()
  )
);