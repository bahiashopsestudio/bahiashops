import { createClient } from '@/lib/supabase/server'
import HomeContent from '@/components/HomeContent'

export default async function Home() {
  const supabase = await createClient()

  // ── Categorías activas ──
  const { data: categorias } = await supabase
    .from('categorias')
    .select('id, nombre, slug, orden')
    .eq('activa', true)
    .order('orden')

  // ── Productos recientes (activos, con foto principal y vendedor) ──
  const { data: recientes } = await supabase
    .from('productos')
    .select(`
      id, nombre, precio, precio_anterior, creado_en,
      vendedor:vendedores(id, nombre_negocio, slug),
      media:producto_media(url, es_principal, orden)
    `)
    .eq('estado', 'activo')
    .order('creado_en', { ascending: false })
    .limit(12)

  // ── Elegidos de la semana (destacados) ──
  const { data: elegidos } = await supabase
    .from('productos')
    .select(`
      id, nombre, precio, precio_anterior,
      vendedor:vendedores(id, nombre_negocio, slug),
      media:producto_media(url, es_principal, orden)
    `)
    .eq('estado', 'activo')
    .eq('destacado', true)
    .limit(8)

  return (
    <HomeContent
      categorias={categorias || []}
      recientes={recientes || []}
      elegidos={elegidos || []}
    />
  )
}
