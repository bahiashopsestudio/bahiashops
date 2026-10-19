import { createClient } from '@/lib/supabase/server'
import { soloVendedoresPublicados } from '@/lib/vendedoresPublicos'
import MapaContent from './MapaContent'

export const metadata = {
  title: 'Mapa de vendedores — Bahía Shops',
  description: 'Encontrá vendedores y emprendedores cerca tuyo en Bahía Blanca.',
  alternates: { canonical: '/mapa' },
}

export default async function MapaPage() {
  const supabase = await createClient()

  const { data: vendedores, error: errorVendedores } = await soloVendedoresPublicados(
    supabase
      .from('vendedores')
      .select('id, nombre_negocio, slug, latitud, longitud, direccion_visible, barrio_id, logo_url, descripcion_corta, puntaje:puntajes_tiendas(cantidad, promedio)')
      .not('latitud', 'is', null)
      .not('longitud', 'is', null)
  )
  if (errorVendedores) console.error('[mapa/vendedores]', errorVendedores.message)

  const { data: categorias, error: errorCategorias } = await supabase
    .from('categorias')
    .select('id, nombre, slug')
    .eq('activa', true)
    .order('orden')
  if (errorCategorias) console.error('[mapa/categorias]', errorCategorias.message)

  return (
    <MapaContent
      vendedores={vendedores || []}
      categorias={categorias || []}
    />
  )
}