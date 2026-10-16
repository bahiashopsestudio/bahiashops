// Las denuncias pendientes, agrupadas por producto, para /admin/denuncias.
//
//   GET             -> { productos: [...], total }
//   GET ?conteo=1   -> { total }  (cuántos productos tienen denuncias pendientes)
//
// verificarAdmin + service_role: la tabla (migración 035) no tiene permisos
// para nadie más. No devuelve quién denunció: para decidir alcanza con qué y
// cuántas veces. Los productos de una tienda cerrada no aparecen.
//
// Resolver: rechazar el producto va por /api/admin/productos/[id]/moderacion
// (también resuelve las denuncias); descartarlas, por ./[productoId].

import { NextResponse } from 'next/server'
import { getServiceRoleClient, verificarAdmin } from '@/lib/supabase/admin'
import { resumirMotivos } from '@/lib/denuncias'

const COLUMNAS = `
  producto_id, motivo, comentario, creada_en,
  productos (
    id, nombre, descripcion, precio, precio_anterior, marca, propiedad_1_nombre, tiempo_preparacion, estado,
    vendedores ( id, nombre_negocio, barrio_id, pausada_en, bloqueado, cerrada_en ),
    producto_media ( url, orden ),
    producto_variantes ( propiedad_1_valor ),
    categorias!categoria_id ( nombre, slug )
  )
`

export async function GET(request) {
  const adminUser = await verificarAdmin()
  if (!adminUser) return NextResponse.json({ error: 'No autorizado.' }, { status: 403 })

  const soloConteo = new URL(request.url).searchParams.get('conteo') === '1'
  const admin = getServiceRoleClient()

  const { data, error } = await admin
    .from('denuncias_productos')
    .select(soloConteo ? 'producto_id, productos ( vendedores ( cerrada_en ) )' : COLUMNAS)
    .eq('estado', 'pendiente')
    .order('creada_en', { ascending: false })
  if (error) {
    console.error('[admin-denuncias/lista]', error.message)
    return NextResponse.json({ error: 'No se pudieron cargar las denuncias.' }, { status: 500 })
  }

  const vigentes = (data || []).filter((d) => d.productos && !d.productos.vendedores?.cerrada_en)
  if (soloConteo) return NextResponse.json({ total: new Set(vigentes.map((d) => d.producto_id)).size })

  // Agrupar por producto. Vienen de la más reciente a la más vieja: el orden
  // en que aparece cada producto es el de su denuncia más reciente.
  const grupos = new Map()
  for (const d of vigentes) {
    if (!grupos.has(d.producto_id)) grupos.set(d.producto_id, { producto: d.productos, denuncias: [] })
    grupos.get(d.producto_id).denuncias.push(d)
  }

  const barrioIds = [...new Set([...grupos.values()].map((g) => g.producto.vendedores?.barrio_id).filter(Boolean))]
  const barrios = new Map()
  if (barrioIds.length > 0) {
    const { data: filas, error: errorBarrios } = await admin.from('barrios').select('id, nombre').in('id', barrioIds)
    if (errorBarrios) console.error('[admin-denuncias/barrios]', errorBarrios.message)
    for (const b of filas || []) barrios.set(b.id, b.nombre)
  }

  const productos = [...grupos.values()].map(({ producto: p, denuncias }) => ({
    id: p.id,
    nombre: p.nombre,
    descripcion: p.descripcion,
    precio: p.precio,
    precio_anterior: p.precio_anterior,
    marca: p.marca,
    propiedad_1_nombre: p.propiedad_1_nombre,
    tiempo_preparacion: p.tiempo_preparacion,
    estado: p.estado,
    vendedor: p.vendedores
      ? {
          id: p.vendedores.id,
          nombre_negocio: p.vendedores.nombre_negocio,
          barrio: barrios.get(p.vendedores.barrio_id) || null,
          pausada: !!p.vendedores.pausada_en,
          bloqueado: !!p.vendedores.bloqueado,
        }
      : null,
    fotos: [...(p.producto_media || [])].sort((a, b) => a.orden - b.orden).map((m) => m.url),
    variantes: (p.producto_variantes || []).map((v) => v.propiedad_1_valor),
    categoria: p.categorias ? { nombre: p.categorias.nombre, slug: p.categorias.slug } : null,
    denuncias: denuncias.length,
    motivos: resumirMotivos(denuncias),
    comentarios: denuncias.map((d) => d.comentario).filter(Boolean),
    primera_en: denuncias[denuncias.length - 1].creada_en,
    ultima_en: denuncias[0].creada_en,
  }))

  return NextResponse.json({ productos, total: productos.length })
}
