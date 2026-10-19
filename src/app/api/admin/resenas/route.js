// Las reseñas para la pestaña "Reseñas" de /admin/denuncias.
//
//   GET ?filtro=por_revisar  (lo de siempre) publicadas que marcó el filtro
//                            o que una tienda pidió revisar
//   GET ?filtro=ocultas      las que ocultó la moderación, sin las eliminadas
//     -> { resenas: [...], conteos: { por_revisar, ocultas } }
//   GET ?pedido=123          la reseña de ese pedido, esté como esté
//                            (publicada, por revisar, oculta o eliminada)
//     -> { resenas: [una] | [] }
//   GET ?conteo=1            -> { por_revisar }  (para la tarjeta de /admin)
//
// "Por revisar" y su contador cuentan SOLO publicadas: una oculta ya se
// resolvió (y la base le saca la marca al ocultarla, migración 038).
//
// verificarAdmin + service_role: la tabla no tiene permisos para nadie más.
// En las dos vistas no aparecen las de tiendas cerradas (su página ya no
// existe); la búsqueda por pedido las muestra igual. De quien la escribió va
// solo el apodo de hoy. Se muestran hasta LIMITE por vista.
//
// Resolver: /api/admin/resenas/[id] (ocultar, volver a mostrar, dar por
// revisada, eliminar).

import { NextResponse } from 'next/server'
import { getServiceRoleClient, verificarAdmin } from '@/lib/supabase/admin'
import { apodosDe } from '@/lib/resenasServidor'
import { fragmentosDeAvisos } from '@/lib/fragmentosModeracion'
import { motivosPorRevisar, eliminableDesde } from '@/lib/resenas'

const LIMITE = 100
const FILTROS = ['por_revisar', 'ocultas']
const COLUMNAS = `
  id, pedido_id, comprador_id, estrellas, texto, estado, oculta_motivo, oculta_en, eliminada_en,
  moderacion_avisos, revision_pendiente_desde, revisada_en,
  revision_pedida_en, revision_motivo, revision_comentario, creado_en,
  vendedor:vendedores!inner ( id, nombre_negocio, pausada_en, bloqueado, cerrada_en )
`

// Una consulta de resenas con la vista aplicada y sin tiendas cerradas.
function conFiltro(query, filtro) {
  const q = query.is('vendedor.cerrada_en', null)
  if (filtro === 'por_revisar') return q.eq('estado', 'publicada').not('revision_pendiente_desde', 'is', null)
  return q.eq('estado', 'oculta_por_moderacion').is('eliminada_en', null)
}

function contar(admin, filtro) {
  return conFiltro(
    admin.from('resenas').select('id, vendedor:vendedores!inner ( cerrada_en )', { count: 'exact', head: true }),
    filtro
  )
}

// La reseña tal como la ve la pantalla.
function paraLaPantalla(r, apodos) {
  const avisos = Array.isArray(r.moderacion_avisos) ? r.moderacion_avisos : []
  const porRevisar = r.estado === 'publicada' && !!r.revision_pendiente_desde
  const motivos = porRevisar ? motivosPorRevisar(r) : { filtro: false, tienda: false }
  const desde = eliminableDesde(r)
  return {
    id: r.id,
    pedido_id: r.pedido_id,
    apodo: r.comprador_id ? (apodos.get(r.comprador_id) ?? null) : null,
    estrellas: r.estrellas,
    texto: r.texto,
    estado: r.estado,
    oculta_motivo: r.oculta_motivo,
    eliminada_en: r.eliminada_en,
    eliminable_desde: desde ? desde.toISOString() : null,
    creado_en: r.creado_en,
    por_revisar: porRevisar,
    // Por qué está en "Por revisar" (puede ser por las dos cosas).
    marcada_por_filtro: motivos.filtro,
    avisos: motivos.filtro ? avisos.map((a) => a.tipo) : [],
    fragmentos: motivos.filtro ? fragmentosDeAvisos({ descripcion: r.texto }, avisos).filter((f) => f.campo) : [],
    pedido_tienda: motivos.tienda
      ? { motivo: r.revision_motivo, comentario: r.revision_comentario, pedida_en: r.revision_pedida_en }
      : null,
    tienda: {
      id: r.vendedor.id,
      nombre_negocio: r.vendedor.nombre_negocio,
      pausada: !!r.vendedor.pausada_en,
      bloqueado: !!r.vendedor.bloqueado,
      cerrada: !!r.vendedor.cerrada_en,
    },
  }
}

async function conApodos(admin, filas) {
  const { apodos, error } = await apodosDe(admin, filas.map((r) => r.comprador_id))
  if (error) return { error }
  return { resenas: filas.map((r) => paraLaPantalla(r, apodos)) }
}

export async function GET(request) {
  const adminUser = await verificarAdmin()
  if (!adminUser) return NextResponse.json({ error: 'No autorizado.' }, { status: 403 })

  const params = new URL(request.url).searchParams
  const admin = getServiceRoleClient()

  if (params.get('conteo') === '1') {
    const { count, error } = await contar(admin, 'por_revisar')
    if (error) {
      console.error('[admin-resenas/conteo]', error.message)
      return NextResponse.json({ error: 'No se pudieron contar las reseñas.' }, { status: 500 })
    }
    return NextResponse.json({ por_revisar: count || 0 })
  }

  // Búsqueda por número de pedido: esa reseña sola, en el estado que esté.
  if (params.has('pedido')) {
    const pedidoId = Number(params.get('pedido'))
    if (!Number.isInteger(pedidoId) || pedidoId <= 0) {
      return NextResponse.json({ error: 'Escribí un número de pedido.' }, { status: 400 })
    }
    const { data, error } = await admin.from('resenas').select(COLUMNAS).eq('pedido_id', pedidoId).maybeSingle()
    if (error) {
      console.error('[admin-resenas/pedido]', pedidoId, error.message)
      return NextResponse.json({ error: 'No se pudo buscar la reseña.' }, { status: 500 })
    }
    const lista = await conApodos(admin, data ? [data] : [])
    if (lista.error) {
      console.error('[admin-resenas/pedido/apodos]', lista.error.message)
      return NextResponse.json({ error: 'No se pudo buscar la reseña.' }, { status: 500 })
    }
    return NextResponse.json({ resenas: lista.resenas })
  }

  const filtro = FILTROS.includes(params.get('filtro')) ? params.get('filtro') : 'por_revisar'
  const orden = filtro === 'ocultas' ? 'oculta_en' : 'revision_pendiente_desde'
  const [consulta, ...conteos] = await Promise.all([
    conFiltro(admin.from('resenas').select(COLUMNAS), filtro)
      .order(orden, { ascending: false })
      .order('id', { ascending: false })
      .limit(LIMITE),
    ...FILTROS.map((f) => contar(admin, f)),
  ])
  const fallo = consulta.error || conteos.find((c) => c.error)?.error
  if (fallo) {
    console.error('[admin-resenas/lista]', filtro, fallo.message)
    return NextResponse.json({ error: 'No se pudieron cargar las reseñas.' }, { status: 500 })
  }

  const lista = await conApodos(admin, consulta.data || [])
  if (lista.error) {
    console.error('[admin-resenas/apodos]', lista.error.message)
    return NextResponse.json({ error: 'No se pudieron cargar las reseñas.' }, { status: 500 })
  }

  return NextResponse.json({
    resenas: lista.resenas,
    conteos: Object.fromEntries(FILTROS.map((f, i) => [f, conteos[i].count || 0])),
  })
}
