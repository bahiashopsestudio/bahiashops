import { createClient } from '@supabase/supabase-js'

// Los planes para la página pública /vender. Se leen como visitante anónimo
// (anon key, sin sesión: la migración 046 le dio a anon la lectura de estas
// columnas), igual que el sitemap. Sin cookies, la página sigue siendo fija y
// se rehace con su revalidate.
//
// Devuelve { planes } (las filas, por orden) o { planes: null } si la lectura
// falla. Nunca lanza: /vender sale igual, con la sección de planes sin números.
export async function leerPlanesPublicos() {
  try {
    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
      { auth: { persistSession: false, autoRefreshToken: false } }
    )
    const { data, error } = await supabase
      .from('planes')
      .select('clave, nombre, orden, precio_mensual, tope_productos, fotos_por_producto, carritos_abandonados, disponible')
      .order('orden')
    if (error) {
      console.error('[vender/planes]', error.message)
      return { planes: null }
    }
    return { planes: data || [] }
  } catch (e) {
    console.error('[vender/planes]', e?.message)
    return { planes: null }
  }
}
