import { createClient } from '@/lib/supabase/server'
import HomeContent from '@/components/HomeContent'
import {
  soloVendedoresPublicados,
  soloProductosPublicados,
} from '@/lib/vendedoresPublicos'

// La home vive en el grupo de rutas (home) — los paréntesis no salen en la URL,
// esto sigue siendo '/'. Está acá para que loading.jsx la acompañe sin abrir un
// límite de Suspense sobre el resto del sitio: ese límite arranca la respuesta
// en streaming y deja el status en 200, y entonces notFound() de las rutas de
// abajo no puede devolver un 404 de verdad.
//
// La canónica: acá se declara cuál de las dos direcciones (con www y sin www)
// es la buena. El path es relativo al metadataBase del layout raíz.
export const metadata = {
  alternates: { canonical: '/' },
}

export default async function Home() {
  const supabase = await createClient()

  // ── Categorías activas ──
  const { data: categorias, error: errorCategorias } = await supabase
    .from('categorias')
    .select('id, nombre, slug, orden')
    .eq('activa', true)
    .order('orden')
  if (errorCategorias) console.error('[home/categorias]', errorCategorias.message)

  // ── Productos recientes (activos, con foto principal y vendedor) ──
  // El !inner en el vendedor no es decorativo: sin él la tienda despublicada
  // o bloqueada llega como vendedor null y el producto se muestra igual.
  const { data: recientes, error: errorRecientes } = await soloProductosPublicados(
    supabase
      .from('productos')
      .select(`
        id, nombre, precio, precio_anterior, creado_en,
        vendedor:vendedores!inner(id, nombre_negocio, slug, estado_validacion, bloqueado),
        media:producto_media(url, es_principal, orden)
      `)
      .eq('estado', 'activo')
      .order('creado_en', { ascending: false })
  ).limit(12)
  if (errorRecientes) console.error('[home/productos-recientes]', errorRecientes.message)

  // ── Elegidos de la semana (destacados) ──
  const { data: elegidosRaw, error: errorElegidos } = await soloProductosPublicados(
    supabase
      .from('productos')
      .select(`
        id, nombre, precio, precio_anterior, tiene_variantes, propiedad_1_nombre,
        variantes:producto_variantes(id),
        vendedor:vendedores!inner(id, nombre_negocio, slug, barrio_id, estado_validacion, bloqueado),
        media:producto_media(url, es_principal, orden)
      `)
      .eq('estado', 'activo')
      .eq('destacado', true)
  ).limit(8)
  if (errorElegidos) console.error('[home/productos-elegidos]', errorElegidos.message)

  // ── Vendedores con ubicación (para el mapa) ──
  const { data: vendedoresMapa, error: errorVendedoresMapa } = await soloVendedoresPublicados(
    supabase
      .from('vendedores')
      .select('id, nombre_negocio, slug, latitud, longitud, direccion_visible, barrio_id, logo_url, descripcion_corta, puntaje:puntajes_tiendas(cantidad, promedio)')
      .not('latitud', 'is', null)
      .not('longitud', 'is', null)
  )
  if (errorVendedoresMapa) console.error('[home/vendedores-mapa]', errorVendedoresMapa.message)

  // ── Productos destacados (para el carrusel filtrable por categoría) ──
  const { data: destacadosRaw, error: errorDestacados } = await soloProductosPublicados(
    supabase
      .from('productos')
      .select(`
        id, nombre, precio, categoria_id, creado_en, tiene_variantes, propiedad_1_nombre,
        variantes:producto_variantes(id),
        vendedor:vendedores!inner(id, nombre_negocio, barrio_id, estado_validacion, bloqueado),
        media:producto_media(url, es_principal, orden)
      `)
      .eq('estado', 'activo')
      .order('destacado', { ascending: false })
      .order('creado_en', { ascending: false })
  ).limit(200)
  if (errorDestacados) console.error('[home/productos-destacados]', errorDestacados.message)

  const { data: barrios, error: errorBarrios } = await supabase
    .from('barrios')
    .select('id, nombre')
  if (errorBarrios) console.error('[home/barrios]', errorBarrios.message)

  const barriosMap = new Map((barrios || []).map((b) => [b.id, b.nombre]))

  const conBarrio = (p) => ({
    ...p,
    barrioNombre: p.vendedor?.barrio_id ? barriosMap.get(p.vendedor.barrio_id) || null : null,
  })

  const elegidos = (elegidosRaw || []).map(conBarrio)
  const destacados = (destacadosRaw || []).map(conBarrio)

  // ── Colecciones activas (cápsulas editoriales) ──
  const { data: colecciones, error: errorColecciones } = await supabase
    .from('colecciones')
    .select('id, nombre, slug, descripcion, imagen_url')
    .eq('activa', true)
    .order('orden')
  if (errorColecciones) console.error('[home/colecciones]', errorColecciones.message)

  return (
    <HomeContent
      categorias={categorias || []}
      recientes={recientes || []}
      elegidos={elegidos}
      vendedoresMapa={vendedoresMapa || []}
      destacados={destacados}
      colecciones={colecciones || []}
    />
  )
}
