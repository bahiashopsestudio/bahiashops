import { cache } from 'react'
import { notFound } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import CategoriaContent from './CategoriaContent'

// La categoría la sigue armando CategoriaContent en el navegador. Esta capa de
// servidor existe para el código HTTP: una categoría que no existe o que está
// inactiva responde 404 de verdad (antes, 200 con "No encontramos esa
// categoría": un Soft 404 para Google).

const leerCategoria = cache(async (slug) => {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('categorias')
    .select('nombre, slug')
    .eq('slug', slug)
    .eq('activa', true)
    .maybeSingle()

  // Una caída de la base no es "no existe": 500, no 404.
  if (error) {
    console.error('[categoria/servidor]', slug, error.message)
    throw new Error('No se pudo leer la categoría')
  }
  return data
})

// Los filtros de la barra (?sub=, ?genero=, ?sellos=) no entran en la
// canónica a propósito: son recortes de la misma categoría, y la dirección
// oficial de todos es la categoría sin filtrar.
export async function generateMetadata({ params }) {
  const { slug } = await params
  const categoria = await leerCategoria(slug)
  if (!categoria) return {}

  const titulo = `${categoria.nombre} — Bahía Shops`
  const descripcion = `${categoria.nombre} de tiendas y emprendedores de Bahía Blanca, en Bahía Shops.`
  return {
    title: titulo,
    description: descripcion,
    alternates: { canonical: `/categoria/${encodeURIComponent(categoria.slug)}` },
    openGraph: { title: titulo, description: descripcion, siteName: 'Bahía Shops', locale: 'es_AR', type: 'website' },
  }
}

export default async function CategoriaPage({ params }) {
  const { slug } = await params
  if (!(await leerCategoria(slug))) notFound()

  return <CategoriaContent />
}
