import { createClient } from '@/lib/supabase/server'
import { notFound } from 'next/navigation'
import { getServiceRoleClient, verificarAdmin } from '@/lib/supabase/admin'
import { soloVendedoresConFicha, tiendaPausada } from '@/lib/vendedoresPublicos'
import TiendaContent from './TiendaContent'
import TiendaPausada from './TiendaPausada'

const CAMPOS = `
  id, nombre_negocio, slug, descripcion_corta, descripcion_larga,
  logo_url, portada_url, instagram, direccion_visible, direccion,
  horarios_texto_libre, estado_validacion, bloqueado, pausada_en, mensaje_pausa,
  barrio:barrios(nombre),
  categoria:categorias(nombre, slug)
`

// ── SEO ──
export async function generateMetadata({ params }) {
  const { slug } = await params
  const supabase = await createClient()
  const { data, error } = await soloVendedoresConFicha(
    supabase
      .from('vendedores')
      .select('nombre_negocio, descripcion_corta, pausada_en')
      .eq('slug', slug)
  ).maybeSingle()
  if (error) console.error('[tienda/metadata-vendedor]', error.message)

  // Una tienda sin publicar o bloqueada no expone su nombre ni se indexa, ni
  // siquiera cuando el admin la está previsualizando.
  if (!data) {
    return {
      title: 'Tienda no encontrada — Bahía Shops',
      robots: { index: false, follow: false },
    }
  }

  // Una tienda pausada muestra su ficha con el cartel, pero no se indexa: no
  // vende, y puede quedar así para siempre (cierre definitivo).
  if (tiendaPausada(data)) {
    return {
      title: `${data.nombre_negocio} — Bahía Shops`,
      robots: { index: false, follow: false },
    }
  }

  return {
    title: `${data.nombre_negocio} — Bahía Shops`,
    description: data.descripcion_corta,
    // La dirección oficial de esta tienda, sin www. Sólo la declaran las
    // tiendas que existen: arriba, sin fila, se sale con noindex y sin
    // canónica, porque no hay página oficial que señalar.
    alternates: { canonical: `/tienda/${encodeURIComponent(slug)}` },
  }
}

// ── PÁGINA ──
export default async function TiendaPage({ params, searchParams }) {
  const { slug } = await params
  const { preview } = await searchParams
  const supabase = await createClient()

  // Vista normal: sólo tiendas publicadas, no bloqueadas y no cerradas. Para
  // el visitante esas situaciones son la misma: el 404 de siempre, sin decir
  // cuál es. Una tienda PAUSADA sí tiene ficha: la del cartel, sin productos.
  const { data: publicada, error: errorPublicada } = await soloVendedoresConFicha(
    supabase
      .from('vendedores')
      .select(CAMPOS)
      .eq('slug', slug)
  ).maybeSingle()
  if (errorPublicada) console.error('[tienda/vendedor]', errorPublicada.message)

  let vendedor = publicada
  let esPrevisualizacion = false

  // Previsualización para el admin: le deja ver la tienda antes de aprobarla.
  // La puerta la abre verificarAdmin() del lado del servidor, no el parámetro:
  // si lo agrega cualquier otro, esta rama no se ejecuta y sigue viendo el 404.
  //
  // Importante: la lectura va con service role. El cliente de sesión está
  // sujeto a RLS, que no le deja ver las tiendas sin aprobar de otros — ni
  // siquiera al admin.
  if (!vendedor && preview) {
    const admin_user = await verificarAdmin()
    if (admin_user) {
      const admin = getServiceRoleClient()
      const { data: sinAprobar, error: errorSinAprobar } = await admin
        .from('vendedores')
        .select(CAMPOS)
        .eq('slug', slug)
        .maybeSingle()
      if (errorSinAprobar) console.error('[tienda/vendedor-preview]', errorSinAprobar.message)
      if (sinAprobar) {
        vendedor = sinAprobar
        esPrevisualizacion = true
      }
    }
  }

  if (!vendedor) notFound()

  // En pausa: nombre, logo y el mensaje que dejó. Ni productos, ni horarios,
  // ni dirección, ni nada más (la base igual no devolvería sus productos).
  if (tiendaPausada(vendedor) && !esPrevisualizacion) {
    return (
      <TiendaPausada
        nombre={vendedor.nombre_negocio}
        logoUrl={vendedor.logo_url}
        portadaUrl={vendedor.portada_url}
        mensaje={vendedor.mensaje_pausa}
      />
    )
  }

  const clienteProductos = esPrevisualizacion ? getServiceRoleClient() : supabase
  const { data: productos, error: errorProductos } = await clienteProductos
    .from('productos')
    .select(`
      id, nombre, precio, precio_anterior,
      media:producto_media(url, es_principal, orden)
    `)
    .eq('vendedor_id', vendedor.id)
    .eq('estado', 'activo')
    .order('creado_en', { ascending: false })
  if (errorProductos) console.error('[tienda/productos]', errorProductos.message)

  return (
    <>
      {esPrevisualizacion && (
        <div
          style={{
            position: 'sticky', top: 0, zIndex: 940,
            backgroundColor: '#f1f29f', color: '#5a5c00',
            fontFamily: "'Inter', sans-serif", fontSize: '13px', fontWeight: 500,
            textAlign: 'center', padding: '10px 16px',
          }}
        >
          {vendedor.bloqueado
            ? 'Vista previa · esta tienda está bloqueada y no se ve en público'
            : 'Vista previa · esta tienda todavía no está publicada'}
        </div>
      )}
      <TiendaContent
        vendedor={vendedor}
        productos={productos || []}
      />
    </>
  )
}
