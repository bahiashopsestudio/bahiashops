// La moderación de productos, para /admin/moderacion.
//
//   GET                -> { productos, total }   "Productos nuevos": en revisión
//   GET ?vista=revisar -> { productos, total }   "Revisar después": ya aprobados
//                         que se editaron con avisos (revision_posterior_desde,
//                         migración 033), con el fragmento que encontró el filtro
//   GET ?conteo=1      -> { total, revisar_despues }  (los números del panel)
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
import { fragmentosDeAvisos } from '@/lib/fragmentosModeracion'

const COLUMNAS_COLA = `
  id, nombre, descripcion, precio, precio_anterior, marca, estado,
  propiedad_1_nombre, tiempo_preparacion, categoria_id, moderacion_avisos, creado_en,
  vendedores ( id, nombre_negocio, pausada_en, bloqueado, cerrada_en ),
  producto_media ( url, orden ),
  producto_variantes ( propiedad_1_valor ),
  producto_sellos ( sellos ( nombre ) ),
  categorias!categoria_id ( nombre, slug )
`

const sinCerradas = (filas) => (filas || []).filter((p) => !p.vendedores?.cerrada_en)

function nuevos(admin, columnas) {
  return admin.from('productos').select(columnas).eq('estado', 'en_revision').order('creado_en', { ascending: true })
}

function paraRevisar(admin, columnas) {
  return admin.from('productos').select(columnas)
    .not('revision_posterior_desde', 'is', null)
    .order('revision_posterior_desde', { ascending: true })
}

function armar(p) {
  const avisos = Array.isArray(p.moderacion_avisos) ? p.moderacion_avisos : []
  return {
    id: p.id,
    nombre: p.nombre,
    descripcion: p.descripcion,
    precio: p.precio,
    precio_anterior: p.precio_anterior,
    marca: p.marca,
    estado: p.estado,
    propiedad_1_nombre: p.propiedad_1_nombre,
    tiempo_preparacion: p.tiempo_preparacion,
    categoria_id: p.categoria_id,
    moderacion_avisos: avisos,
    creado_en: p.creado_en,
    vendedor: p.vendedores
      ? { id: p.vendedores.id, nombre_negocio: p.vendedores.nombre_negocio, pausada: !!p.vendedores.pausada_en, bloqueado: !!p.vendedores.bloqueado }
      : null,
    fotos: [...(p.producto_media || [])].sort((a, b) => a.orden - b.orden).map((m) => m.url),
    variantes: (p.producto_variantes || []).map((v) => v.propiedad_1_valor),
    sellos: (p.producto_sellos || []).map((s) => s.sellos?.nombre).filter(Boolean),
    categoria: p.categorias ? { nombre: p.categorias.nombre, slug: p.categorias.slug } : null,
  }
}

const fallo = (contexto, error) => {
  console.error(`[admin-moderacion/${contexto}]`, error.message)
  return NextResponse.json({ error: 'No se pudo cargar la cola de moderación.' }, { status: 500 })
}

export async function GET(request) {
  const adminUser = await verificarAdmin()
  if (!adminUser) return NextResponse.json({ error: 'No autorizado.' }, { status: 403 })

  const parametros = new URL(request.url).searchParams
  const admin = getServiceRoleClient()

  if (parametros.get('conteo') === '1') {
    const [cola, revisar] = await Promise.all([
      nuevos(admin, 'id, vendedores ( cerrada_en )'),
      paraRevisar(admin, 'id, vendedores ( cerrada_en )'),
    ])
    if (cola.error) return fallo('conteo', cola.error)
    if (revisar.error) return fallo('conteo-revisar', revisar.error)
    return NextResponse.json({ total: sinCerradas(cola.data).length, revisar_despues: sinCerradas(revisar.data).length })
  }

  if (parametros.get('vista') === 'revisar') {
    const { data, error } = await paraRevisar(admin, `${COLUMNAS_COLA}, revision_posterior_desde, actualizado_en`)
    if (error) return fallo('revisar', error)
    const productos = sinCerradas(data).map((p) => ({
      ...armar(p),
      revision_posterior_desde: p.revision_posterior_desde,
      actualizado_en: p.actualizado_en,
      fragmentos: fragmentosDeAvisos(p, p.moderacion_avisos),
    }))
    return NextResponse.json({ productos, total: productos.length })
  }

  const { data, error } = await nuevos(admin, COLUMNAS_COLA)
  if (error) return fallo('cola', error)
  const productos = sinCerradas(data).map(armar)
  return NextResponse.json({ productos, total: productos.length })
}
