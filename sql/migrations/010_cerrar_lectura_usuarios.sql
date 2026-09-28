-- Bahía Shops · 010 · Cerrar la lectura pública de usuarios (25/9/2026)
-- Ya corrido en Supabase. En transacción: si algo falla, no cambia nada.
begin;

-- 1. Se va la lectura pública
drop policy if exists "Lectura pública usuarios" on public.usuarios;

-- 2. Cada persona con sesión lee solo su propia fila
create policy "Cada usuario lee su fila"
  on public.usuarios for select
  to authenticated
  using (auth.uid() = id);

-- 3. Sin sesión no se lee nada: no hay policy para anon, así que ve 0 filas.
--    OJO: NO se le saca el permiso SELECT a anon. La policy "Admin ve todos
--    los productos" consulta usuarios, y sin ese permiso el catálogo entero
--    daría error a quien navega sin sesión.

-- 4. Permisos que nadie usa (vienen por defecto de Supabase)
revoke delete, truncate, trigger, references on public.usuarios from anon, authenticated;

-- 5. Policies de escritura inertes (el permiso se sacó en agosto)
drop policy if exists "Usuario crea su perfil" on public.usuarios;
drop policy if exists "Usuario edita su perfil" on public.usuarios;

commit;
