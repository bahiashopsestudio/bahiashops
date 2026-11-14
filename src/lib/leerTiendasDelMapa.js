import { createClient } from '@supabase/supabase-js'
import { soloVendedoresPublicados } from '@/lib/vendedoresPublicos'

// Las tiendas del mapa de la portada de /vender: las mismas que muestra el
// mapa de la home (los mismos campos que (home)/page.js), leídas como
// visitante anónimo y sin sesión, así la página sigue siendo fija.
//
// Devuelve la lista, o [] si la lectura falla: el mapa sale igual, sin puntos.
// Nunca lanza.
export async function leerTiendasDelMapa() {
  try {
    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
      { auth: { persistSession: false, autoRefreshToken: false } }
    )
    const { data, error } = await soloVendedoresPublicados(
      supabase
        .from('vendedores')
        .select('id, nombre_negocio, slug, latitud, longitud, direccion_visible, barrio_id, logo_url, descripcion_corta, puntaje:puntajes_tiendas(cantidad, promedio)')
        .not('latitud', 'is', null)
        .not('longitud', 'is', null)
    )
    if (error) {
      console.error('[vender/tiendas-mapa]', error.message)
      return []
    }
    return data || []
  } catch (e) {
    console.error('[vender/tiendas-mapa]', e?.message)
    return []
  }
}
