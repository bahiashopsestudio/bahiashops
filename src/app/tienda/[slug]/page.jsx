import { createClient } from '@/lib/supabase/server'
import { notFound } from 'next/navigation'
import TiendaContent from './TiendaContent'

// ── SEO ──
export async function generateMetadata({ params }) {
  const { slug } = await params
  const supabase = await createClient()
  const { data } = await supabase
    .from('vendedores')
    .select('nombre_negocio, descripcion_corta')
    .eq('slug', slug)
    .eq('estado_validacion', 'aprobado')
    .single()

  if (!data) return { title: 'Tienda no encontrada — Bahía Shops' }

  return {
    title: `${data.nombre_negocio} — Bahía Shops`,
    description: data.descripcion_corta,
  }
}

// ── PÁGINA ──
export default async function TiendaPage({ params }) {
  const { slug } = await params
  const supabase = await createClient()

  const { data: vendedor } = await supabase
    .from('vendedores')
    .select(`
      id, nombre_negocio, slug, descripcion_corta, descripcion_larga,
      logo_url, portada_url, instagram, recibe_publico, direccion,
      horarios_texto_libre,
      barrio:barrios(nombre),
      categoria:categorias(nombre, slug)
    `)
    .eq('slug', slug)
    .eq('estado_validacion', 'aprobado')
    .single()

  if (!vendedor) notFound()

  const { data: productos } = await supabase
    .from('productos')
    .select(`
      id, nombre, precio, precio_anterior,
      media:producto_media(url, es_principal, orden)
    `)
    .eq('vendedor_id', vendedor.id)
    .eq('estado', 'activo')
    .order('creado_en', { ascending: false })

  return (
    <TiendaContent
      vendedor={vendedor}
      productos={productos || []}
    />
  )
}
