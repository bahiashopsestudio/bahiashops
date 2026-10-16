// La cola de moderación: los productos en revisión, para /admin/moderacion.
//
//   GET             -> { productos: [...], total }
//   GET ?conteo=1   -> { total }  (el número del panel de admin)
//
// Por qué por el servidor: desde el navegador el admin ve el producto (la
// política "Admin ve todos los productos") pero NO sus fotos ni sus variantes:
// producto_media y producto_variantes solo dejan leer lo publicado o lo propio,
// y RLS lo filtra sin dar error. Además, la política restrictiva de la 007/030
// esconde los productos de una tienda pausada o bloqueada, también al admin.
// Con verificarAdmin + service_role se ve todo, sin abrir excepciones de admin
// en las políticas.
//
// Los productos de una tienda pausada o bloqueada se incluyen (con
// vendedor.pausada / vendedor.bloqueado, para la etiqueta). Los de una tienda
// cerrada no: la tienda ya no existe para nadie.

import { NextResponse } from 'next/server'
import { getServiceRoleClient, verificarAdmin } from '@/lib/supabase/admin'

const COLUMNAS_COLA = `
  id, nombre, descripcion, precio, precio_anterior, marca,
  propiedad_1_nombre, tiempo_preparacion, categoria_id, moderacion_avisos, creado_en,
  vendedores ( id, nombre_negocio, pausada_en, bloqueado, cerrada_en ),
  producto_media ( url, orden ),
  producto_variantes ( propiedad_1_valor ),
  producto_sellos ( sellos ( nombre ) ),
  categorias!categoria_id ( nombre, slug )
`

export async function GET(request) {
  const adminUser = await verificarAdmin()
  if (!adminUser) return NextResponse.json({ error: 'No autorizado.' }, { status: 403 })

  const soloConteo = new URL(request.url).searchParams.get('conteo') === '1'

  const admin = getServiceRoleClient()
  const { data, error } = await admin
    .from('productos')
    .select(soloConteo ? 'id, vendedores ( cerrada_en )' : COLUMNAS_COLA)
    .eq('estado', 'en_revision')
    .order('creado_en', { ascending: true })
  if (error) {
    console.error('[admin-moderacion/cola]', error.message)
    return NextResponse.json({ error: 'No se pudo cargar la cola de moderación.' }, { status: 500 })
  }

  const vigentes = (data || []).filter((p) => !p.vendedores?.cerrada_en)
  if (soloConteo) return NextResponse.json({ total: vigentes.length })

  const productos = vigentes.map((p) => ({
    id: p.id,
    nombre: p.nombre,
    descripcion: p.descripcion,
    precio: p.precio,
    precio_anterior: p.precio_anterior,
    marca: p.marca,
    propiedad_1_nombre: p.propiedad_1_nombre,
    tiempo_preparacion: p.tiempo_preparacion,
    categoria_id: p.categoria_id,
    moderacion_avisos: Array.isArray(p.moderacion_avisos) ? p.moderacion_avisos : [],
    creado_en: p.creado_en,
    vendedor: p.vendedores
      ? { id: p.vendedores.id, nombre_negocio: p.vendedores.nombre_negocio, pausada: !!p.vendedores.pausada_en, bloqueado: !!p.vendedores.bloqueado }
      : null,
    fotos: [...(p.producto_media || [])].sort((a, b) => a.orden - b.orden).map((m) => m.url),
    variantes: (p.producto_variantes || []).map((v) => v.propiedad_1_valor),
    sellos: (p.producto_sellos || []).map((s) => s.sellos?.nombre).filter(Boolean),
    categoria: p.categorias ? { nombre: p.categorias.nombre, slug: p.categorias.slug } : null,
  }))

  return NextResponse.json({ productos, total: productos.length })
}
