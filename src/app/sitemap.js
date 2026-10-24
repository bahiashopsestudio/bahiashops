import { createClient } from '@supabase/supabase-js'
import { SITIO_URL } from '@/lib/sitio'
import { soloProductosPublicados, soloVendedoresPublicados } from '@/lib/vendedoresPublicos'

// /sitemap.xml: lo que Google puede recorrer. Se lee como visitante anónimo
// (anon key, sujeto a RLS, sin sesión): si un visitante no lo ve, no va.
// Las tiendas pausadas no van (su ficha es noindex), ni sus productos.
//
// Se rehace como mucho una vez por hora. Si una consulta falla, esa parte se
// omite y el resto se sirve igual.
export const revalidate = 3600

const PAGINAS_FIJAS = [
  '/', '/categorias', '/tesoros', '/mapa', '/local-shops', '/resenas',
  '/sobre-nosotros', '/terminos', '/privacidad',
]

async function leer(nombre, consulta) {
  const { data, error } = await consulta
  if (error) {
    console.error(`[sitemap/${nombre}]`, error.message)
    return []
  }
  return data || []
}

export default async function sitemap() {
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    { auth: { persistSession: false, autoRefreshToken: false } }
  )

  const [categorias, valores, colecciones, tiendas, productos] = await Promise.all([
    leer('categorias', supabase.from('categorias').select('slug').eq('activa', true)),
    leer('valores', supabase.from('sellos').select('slug').eq('activa', true)),
    leer('colecciones', supabase.from('colecciones').select('slug').eq('activa', true)),
    leer('tiendas', soloVendedoresPublicados(supabase.from('vendedores').select('slug'))),
    leer('productos', soloProductosPublicados(
      supabase
        .from('productos')
        .select('id, vendedor:vendedores!inner(estado_validacion, bloqueado, pausada_en, cerrada_en)')
        .eq('estado', 'activo')
    )),
  ])

  const url = (ruta) => ({ url: `${SITIO_URL}${ruta === '/' ? '' : ruta}` })
  const conSlug = (base, filas) =>
    filas.filter((f) => f.slug).map((f) => url(`${base}/${encodeURIComponent(f.slug)}`))

  return [
    ...PAGINAS_FIJAS.map(url),
    ...conSlug('/categoria', categorias),
    ...conSlug('/valor', valores),
    ...conSlug('/coleccion', colecciones),
    ...conSlug('/tienda', tiendas),
    ...productos.map((p) => url(`/producto/${p.id}`)),
  ]
}
