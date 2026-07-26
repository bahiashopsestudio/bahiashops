import { createClient } from '@/lib/supabase/server'
import MapaContent from './MapaContent'

export const metadata = {
  title: 'Mapa de vendedores — Bahía Shops',
  description: 'Encontrá vendedores y emprendedores cerca tuyo en Bahía Blanca.',
}

export default async function MapaPage() {
  const supabase = await createClient()

  const { data: vendedores } = await supabase
    .from('vendedores')
    .select('id, nombre_negocio, slug, latitud, longitud, recibe_publico, barrio_id, logo_url, descripcion_corta')
    .not('latitud', 'is', null)
    .not('longitud', 'is', null)

  const { data: categorias } = await supabase
    .from('categorias')
    .select('id, nombre, slug')
    .eq('activa', true)
    .order('orden')

  return (
    <MapaContent
      vendedores={vendedores || []}
      categorias={categorias || []}
    />
  )
}