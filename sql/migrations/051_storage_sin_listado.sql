-- ============================================================================
-- Bahía Shops · 051 · Storage sin listado público
-- (06/11/2026)
-- Correr entera en el SQL Editor de Supabase. Va en transacción: si algo
-- falla, no cambia nada. Se puede correr dos veces sin romper nada.
--
-- Los cuatro buckets (productos, logos, portadas, colecciones) son públicos
-- (public = true): las fotos se muestran por /storage/v1/object/public/…,
-- que no pasa por estas políticas. Lo que sí pasaba por la lectura pública
-- era listar: cualquiera, sin sesión, podía pedir la lista de archivos.
--
-- Qué hace:
--   1. Saca las tres lecturas públicas de storage.objects:
--        «Lectura pública imágenes productos»   (001)
--        «Lectura pública imágenes colecciones» (002)
--        «Lectura pública marca vendedor»       (logos y portadas; creada
--                                                desde el panel)
--   2. Deja leer (SELECT) solo a la dueña de la carpeta en productos, logos y
--      portadas: la primera carpeta es el id de una tienda suya
--      (vendedores.usuario_id = auth.uid()). La necesitan:
--        · borrar las fotos recién subidas cuando el producto no se guarda
--          (src/lib/fotosProducto.js, remove pide SELECT + DELETE);
--        · subir logo y portada con upsert (src/app/vendedor/perfil/page.jsx,
--          upsert pide SELECT + INSERT + UPDATE).
--      Compara como texto (id::text): una carpeta que no sea un número no
--      hace fallar la consulta.
--   3. colecciones queda sin lectura: solo la usa el admin con service_role.
--
-- No toca la escritura de las tiendas («Vendedor sube/edita/borra imágenes de
-- su carpeta» y «Vendedor sube/edita/borra marca de su carpeta») ni los
-- buckets. Todo lo que corre con service_role (borrar producto, eliminar
-- cuenta, borrar tienda desde el admin, portadas de colección) no depende de
-- estas políticas.
-- ============================================================================

begin;

drop policy if exists "Lectura pública imágenes productos" on storage.objects;
drop policy if exists "Lectura pública imágenes colecciones" on storage.objects;
drop policy if exists "Lectura pública marca vendedor" on storage.objects;

drop policy if exists "Tienda lee los archivos de su carpeta" on storage.objects;
create policy "Tienda lee los archivos de su carpeta"
on storage.objects for select
to authenticated
using (
  bucket_id in ('productos', 'logos', 'portadas')
  and (storage.foldername(name))[1] in (
    select id::text from public.vendedores where usuario_id = (select auth.uid())
  )
);

commit;

-- Corre sola, sin cambio de código.
