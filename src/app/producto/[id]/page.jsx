import { cache } from 'react'
import { notFound } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { soloProductosPublicados } from '@/lib/vendedoresPublicos'
import ProductoContent from './ProductoContent'

// La ficha la sigue armando ProductoContent en el navegador, igual que antes.
// Esta capa de servidor existe para el código HTTP: lo que no se puede ver
// responde 404 de verdad (antes era un 200 con "No encontramos este
// producto", un Soft 404 para Google).
//
// Consulta con el cliente de sesión, sujeto a RLS, con el mismo filtro que
// usa ProductoContent:
//   · el público solo recibe productos activos de tiendas publicadas;
//   · la dueña ve también los suyos que no están activos (en revisión,
//     pausados, rechazados), y el admin los de cualquier tienda visible.
// Una tienda pausada, bloqueada, sin publicar o cerrada da 404 para todos,
// como el "No encontramos" que ya mostraba la ficha.

// Una sola consulta por pedido: la comparten generateMetadata y la página.
const leerProducto = cache(async (id) => {
  // Un id que no es número ni llega a la base.
  if (!/^\d+$/.test(id)) return null

  const supabase = await createClient()
  const { data, error } = await soloProductosPublicados(
    supabase
      .from('productos')
      .select(`
        id, nombre, descripcion, estado,
        vendedores!inner(nombre_negocio, estado_validacion, bloqueado),
        media:producto_media(url, es_principal, orden)
      `)
      .eq('id', id),
    'vendedores'
  ).maybeSingle()

  // Si la base falla no se puede decir que no existe: un 404 haría que Google
  // la saque del índice por una caída. Se corta con error (500) y reintenta.
  if (error) {
    console.error('[producto/servidor]', id, error.message)
    throw new Error('No se pudo leer el producto')
  }
  return data
})

function fotoPrincipal(media) {
  const fotos = [...(media || [])].sort((a, b) =>
    (b.es_principal === true) - (a.es_principal === true) || (a.orden ?? 0) - (b.orden ?? 0)
  )
  return fotos[0]?.url || null
}

function resumen(texto, nombre, tienda) {
  const limpio = String(texto || '').replace(/\s+/g, ' ').trim()
  if (!limpio) return `${nombre}, de ${tienda}. En Bahía Shops, el marketplace de Bahía Blanca.`
  return limpio.length > 160 ? `${limpio.slice(0, 157).trimEnd()}...` : limpio
}

export async function generateMetadata({ params }) {
  const { id } = await params
  const producto = await leerProducto(id)
  // Sin fila la página llama a notFound(): esta metadata no se llega a usar.
  if (!producto) return {}

  const titulo = `${producto.nombre} — Bahía Shops`

  // Lo ve la dueña o el admin pero no el público: ni se indexa ni declara
  // canónica.
  if (producto.estado !== 'activo') {
    return { title: titulo, robots: { index: false, follow: false } }
  }

  const descripcion = resumen(producto.descripcion, producto.nombre, producto.vendedores.nombre_negocio)
  const foto = fotoPrincipal(producto.media)

  return {
    title: titulo,
    description: descripcion,
    alternates: { canonical: `/producto/${producto.id}` },
    openGraph: {
      title: titulo,
      description: descripcion,
      url: `/producto/${producto.id}`,
      siteName: 'Bahía Shops',
      locale: 'es_AR',
      type: 'website',
      ...(foto ? { images: [{ url: foto, alt: producto.nombre }] } : {}),
    },
  }
}

export default async function ProductoPage({ params }) {
  const { id } = await params
  const producto = await leerProducto(id)
  if (!producto) notFound()

  return <ProductoContent />
}
