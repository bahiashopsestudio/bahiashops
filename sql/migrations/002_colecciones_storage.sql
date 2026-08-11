-- ============================================================================
-- Migración 002: Storage para imágenes de colecciones
-- Fecha: 2026-08-09
--
-- Descripción: Política de lectura pública para el bucket 'colecciones'
-- (portadas de las cápsulas/colecciones editoriales del panel admin).
--
-- IMPORTANTE — paso manual antes de correr esto:
-- 1. Crear el bucket 'colecciones' desde el dashboard de Supabase
--    (Storage → New bucket), igual que se hizo con 'productos':
--    public = true, límite ~5MB, MIME image/jpeg, image/png, image/webp.
--
-- No hace falta policy de escritura: las subidas de imagen se hacen desde
-- una API route del admin (src/app/api/admin/colecciones/imagen/route.js)
-- usando el cliente con service_role, que bypassea RLS.
-- ============================================================================

CREATE POLICY "Lectura pública imágenes colecciones"
ON storage.objects FOR SELECT
USING (bucket_id = 'colecciones');
