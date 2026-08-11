-- ============================================================================
-- Migración 004: Columna 'bloqueado' en vendedores
-- Fecha: 2026-08-11
--
-- Descripción: Permite al admin bloquear un vendedor desde /admin/vendedores
-- sin borrar sus datos. Es una medida básica: el vendedor sigue pudiendo
-- loguearse, pero sus productos deberían dejar de mostrarse públicamente
-- (a resolver a nivel de query/RLS en las páginas públicas).
-- ============================================================================

ALTER TABLE vendedores ADD COLUMN IF NOT EXISTS bloqueado BOOLEAN DEFAULT false;
