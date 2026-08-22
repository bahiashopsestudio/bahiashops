import { createClient } from '@/lib/supabase/server'
import { notFound } from 'next/navigation'
import { getServiceRoleClient, verificarAdmin } from '@/lib/supabase/admin'
import TiendaContent from './TiendaContent'

const CAMPOS = `
  id, nombre_negocio, slug, descripcion_corta, descripcion_larga,
  logo_url, portada_url, instagram, recibe_publico, direccion,
  horarios_texto_libre, estado_validacion,
  barrio:barrios(nombre),
  categoria:categorias(nombre, slug)
`

// ── SEO ──
export async function generateMetadata({ params }) {
  const { slug } = await params
  const supabase = await createClient()
  const { data } = await supabase
    .from('vendedores')
    .select('nombre_negocio, descripcion_corta')
    .eq('slug', slug)
    .eq('estado_validacion', 'aprobado')
    .single()

  // Una tienda sin publicar no expone su nombre ni se indexa, ni siquiera
  // cuando el admin la está previsualizando.
  if (!data) {
    return {
      title: 'Tienda no encontrada — Bahía Shops',
      robots: { index: false, follow: false },
    }
  }

  return {
    title: `${data.nombre_negocio} — Bahía Shops`,
    description: data.descripcion_corta,
  }
}

// ── PÁGINA ──
export default async function TiendaPage({ params, searchParams }) {
  const { slug } = await params
  const { preview } = await searchParams
  const supabase = await createClient()

  // Vista normal: solo tiendas aprobadas.
  const { data: aprobada } = await supabase
    .from('vendedores')
    .select(CAMPOS)
    .eq('slug', slug)
    .eq('estado_validacion', 'aprobado')
    .maybeSingle()

  let vendedor = aprobada
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
      const { data: sinAprobar } = await admin
        .from('vendedores')
        .select(CAMPOS)
        .eq('slug', slug)
        .maybeSingle()
      if (sinAprobar) {
        vendedor = sinAprobar
        esPrevisualizacion = true
      }
    }
  }

  if (!vendedor) notFound()

  const clienteProductos = esPrevisualizacion ? getServiceRoleClient() : supabase
  const { data: productos } = await clienteProductos
    .from('productos')
    .select(`
      id, nombre, precio, precio_anterior,
      media:producto_media(url, es_principal, orden)
    `)
    .eq('vendedor_id', vendedor.id)
    .eq('estado', 'activo')
    .order('creado_en', { ascending: false })

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
          Vista previa · esta tienda todavía no está publicada
        </div>
      )}
      <TiendaContent
        vendedor={vendedor}
        productos={productos || []}
      />
    </>
  )
}
