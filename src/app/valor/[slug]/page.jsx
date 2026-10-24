import { cache } from 'react'
import { notFound } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import ValorContent from './ValorContent'

// El valor (un sello) lo sigue armando ValorContent en el navegador. Esta capa
// de servidor existe para el código HTTP: un valor que no existe o que está
// inactivo responde 404 de verdad (antes, 200 con "No encontramos ese valor":
// un Soft 404 para Google).

const leerValor = cache(async (slug) => {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('sellos')
    .select('nombre, slug')
    .eq('slug', slug)
    .eq('activa', true)
    .maybeSingle()

  // Una caída de la base no es "no existe": 500, no 404.
  if (error) {
    console.error('[valor/servidor]', slug, error.message)
    throw new Error('No se pudo leer el valor')
  }
  return data
})

export async function generateMetadata({ params }) {
  const { slug } = await params
  const valor = await leerValor(slug)
  if (!valor) return {}

  const titulo = `${valor.nombre} — Bahía Shops`
  const descripcion = `${valor.nombre}: productos de tiendas y emprendedores de Bahía Blanca, en Bahía Shops.`
  return {
    title: titulo,
    description: descripcion,
    alternates: { canonical: `/valor/${encodeURIComponent(valor.slug)}` },
    openGraph: { title: titulo, description: descripcion, siteName: 'Bahía Shops', locale: 'es_AR', type: 'website' },
  }
}

export default async function ValorPage({ params }) {
  const { slug } = await params
  if (!(await leerValor(slug))) notFound()

  return <ValorContent />
}
