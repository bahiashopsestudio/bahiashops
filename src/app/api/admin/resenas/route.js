// Las reseñas para la pestaña "Reseñas" de /admin/denuncias.
//
//   GET ?filtro=por_revisar  (lo de siempre) publicadas que marcó el filtro
//                            o que una tienda pidió revisar, y las que tienen
//                            una respuesta de la tienda marcada por el filtro
//   GET ?filtro=ocultas      las que ocultó la moderación, sin las eliminadas
//     -> { resenas: [...], conteos: { por_revisar, ocultas } }
//   GET ?pedido=123          la reseña de ese pedido, esté como esté
//                            (publicada, por revisar, oculta o eliminada), con
//                            su respuesta
//     -> { resenas: [una] | [] }
//   GET ?conteo=1            -> { por_revisar }  (para la tarjeta de /admin)
//
// "Por revisar" y su contador cuentan SOLO publicadas: una oculta ya se
// resolvió (y la base le saca la marca al ocultarla, migraciones 038 y 039).
// Una reseña con las dos cosas por revisar (ella y su respuesta) es una sola
// tarjeta y cuenta una vez.
//
// verificarAdmin + service_role: las tablas no tienen permisos para nadie
// más. En las dos vistas no aparecen las de tiendas cerradas (su página ya no
// existe); la búsqueda por pedido las muestra igual. De quien la escribió va
// solo el apodo de hoy. Se muestran hasta LIMITE por vista.
//
// Resolver: /api/admin/resenas/[id] (ocultar, volver a mostrar, dar por
// revisada, eliminar, y lo mismo con la respuesta).

import { NextResponse } from 'next/server'
import { getServiceRoleClient, verificarAdmin } from '@/lib/supabase/admin'
import { apodosDe } from '@/lib/resenasServidor'
import { fragmentosDeAvisos } from '@/lib/fragmentosModeracion'
import { motivosPorRevisar, eliminableDesde, respuestaDe } from '@/lib/resenas'

const LIMITE = 100
// Hasta cuántas pendientes se juntan para armar "Por revisar" y su contador.
const TOPE_PENDIENTES = 1000
const FILTROS = ['por_revisar', 'ocultas']
const COLUMNAS = `
  id, pedido_id, comprador_id, estrellas, texto, estado, oculta_motivo, oculta_en, eliminada_en,
  moderacion_avisos, revision_pendiente_desde, revisada_en,
  revision_pedida_en, revision_motivo, revision_comentario, creado_en,
  vendedor:vendedores!inner ( id, nombre_negocio, pausada_en, bloqueado, cerrada_en ),
  respuesta:respuestas_resena ( texto, estado, moderacion_avisos, revision_pendiente_desde, creado_en, editada_en )
`

// Las reseñas en "Por revisar": { pendientes: Map(id -> fecha más reciente
// de lo que espera revisión) } o { error }. Dos entradas: la reseña misma, o
// su respuesta (publicada, con la reseña publicada). Sin tiendas cerradas.
async function porRevisar(admin) {
  const [resenas, respuestas] = await Promise.all([
    admin.from('resenas')
      .select('id, revision_pendiente_desde, vendedor:vendedores!inner ( cerrada_en )')
      .eq('estado', 'publicada')
      .not('revision_pendiente_desde', 'is', null)
      .is('vendedor.cerrada_en', null)
      .limit(TOPE_PENDIENTES),
    admin.from('respuestas_resena')
      .select('resena_id, revision_pendiente_desde, resena:resenas!inner ( estado, vendedor:vendedores!inner ( cerrada_en ) )')
      .eq('estado', 'publicada')
      .not('revision_pendiente_desde', 'is', null)
      .eq('resena.estado', 'publicada')
      .is('resena.vendedor.cerrada_en', null)
      .limit(TOPE_PENDIENTES),
  ])
  const error = resenas.error || respuestas.error
  if (error) return { error }
  const pendientes = new Map()
  const sumar = (id, fecha) => {
    const previa = pendientes.get(id)
    if (!previa || Date.parse(fecha) > Date.parse(previa)) pendientes.set(id, fecha)
  }
  for (const r of resenas.data || []) sumar(r.id, r.revision_pendiente_desde)
  for (const r of respuestas.data || []) sumar(r.resena_id, r.revision_pendiente_desde)
  return { pendientes }
}

function contarOcultas(admin) {
  return admin.from('resenas')
    .select('id, vendedor:vendedores!inner ( cerrada_en )', { count: 'exact', head: true })
    .is('vendedor.cerrada_en', null)
    .eq('estado', 'oculta_por_moderacion')
    .is('eliminada_en', null)
}

// La respuesta de la tienda, como la ve la pantalla del admin.
function respuestaParaElAdmin(fila, resenaPublicada) {
  const r = respuestaDe(fila)
  if (!r) return null
  const avisos = Array.isArray(r.moderacion_avisos) ? r.moderacion_avisos : []
  const porRevisarla = resenaPublicada && r.estado === 'publicada' && !!r.revision_pendiente_desde
  const marcada = porRevisarla && avisos.length > 0
  return {
    texto: r.texto,
    estado: r.estado,
    creado_en: r.creado_en,
    editada: !!r.editada_en,
    por_revisar: porRevisarla,
    marcada_por_filtro: marcada,
    avisos: marcada ? avisos.map((a) => a.tipo) : [],
    fragmentos: marcada ? fragmentosDeAvisos({ descripcion: r.texto }, avisos).filter((f) => f.campo) : [],
  }
}

// La reseña tal como la ve la pantalla.
function paraLaPantalla(r, apodos) {
  const avisos = Array.isArray(r.moderacion_avisos) ? r.moderacion_avisos : []
  const porRevisarla = r.estado === 'publicada' && !!r.revision_pendiente_desde
  const motivos = porRevisarla ? motivosPorRevisar(r) : { filtro: false, tienda: false }
  const desde = eliminableDesde(r)
  const respuesta = respuestaParaElAdmin(r.respuesta, r.estado === 'publicada')
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
    // La reseña misma está por revisar (la respuesta va aparte, en respuesta).
    por_revisar: porRevisarla,
    // Por qué está en "Por revisar" (puede ser por las dos cosas).
    marcada_por_filtro: motivos.filtro,
    avisos: motivos.filtro ? avisos.map((a) => a.tipo) : [],
    fragmentos: motivos.filtro ? fragmentosDeAvisos({ descripcion: r.texto }, avisos).filter((f) => f.campo) : [],
    pedido_tienda: motivos.tienda
      ? { motivo: r.revision_motivo, comentario: r.revision_comentario, pedida_en: r.revision_pedida_en }
      : null,
    respuesta,
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

const errorDeLista = (msj) => NextResponse.json({ error: msj }, { status: 500 })

export async function GET(request) {
  const adminUser = await verificarAdmin()
  if (!adminUser) return NextResponse.json({ error: 'No autorizado.' }, { status: 403 })

  const params = new URL(request.url).searchParams
  const admin = getServiceRoleClient()

  if (params.get('conteo') === '1') {
    const pr = await porRevisar(admin)
    if (pr.error) {
      console.error('[admin-resenas/conteo]', pr.error.message)
      return errorDeLista('No se pudieron contar las reseñas.')
    }
    return NextResponse.json({ por_revisar: pr.pendientes.size })
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
      return errorDeLista('No se pudo buscar la reseña.')
    }
    const lista = await conApodos(admin, data ? [data] : [])
    if (lista.error) {
      console.error('[admin-resenas/pedido/apodos]', lista.error.message)
      return errorDeLista('No se pudo buscar la reseña.')
    }
    return NextResponse.json({ resenas: lista.resenas })
  }

  const filtro = FILTROS.includes(params.get('filtro')) ? params.get('filtro') : 'por_revisar'
  const [pr, ocultas] = await Promise.all([porRevisar(admin), contarOcultas(admin)])
  const falloConteos = pr.error || ocultas.error
  if (falloConteos) {
    console.error('[admin-resenas/conteos]', falloConteos.message)
    return errorDeLista('No se pudieron cargar las reseñas.')
  }

  let filas = []
  if (filtro === 'por_revisar') {
    // Las más recientes primero (por lo último que espera revisión).
    const ids = [...pr.pendientes.entries()]
      .sort((a, b) => Date.parse(b[1]) - Date.parse(a[1]))
      .slice(0, LIMITE)
      .map(([id]) => id)
    if (ids.length > 0) {
      const { data, error } = await admin.from('resenas').select(COLUMNAS).in('id', ids)
      if (error) {
        console.error('[admin-resenas/por-revisar]', error.message)
        return errorDeLista('No se pudieron cargar las reseñas.')
      }
      const orden = new Map(ids.map((id, i) => [id, i]))
      filas = (data || []).sort((a, b) => orden.get(a.id) - orden.get(b.id))
    }
  } else {
    const { data, error } = await admin.from('resenas').select(COLUMNAS)
      .is('vendedor.cerrada_en', null)
      .eq('estado', 'oculta_por_moderacion')
      .is('eliminada_en', null)
      .order('oculta_en', { ascending: false })
      .order('id', { ascending: false })
      .limit(LIMITE)
    if (error) {
      console.error('[admin-resenas/ocultas]', error.message)
      return errorDeLista('No se pudieron cargar las reseñas.')
    }
    filas = data || []
  }

  const lista = await conApodos(admin, filas)
  if (lista.error) {
    console.error('[admin-resenas/apodos]', lista.error.message)
    return errorDeLista('No se pudieron cargar las reseñas.')
  }

  return NextResponse.json({
    resenas: lista.resenas,
    conteos: { por_revisar: pr.pendientes.size, ocultas: ocultas.count || 0 },
  })
}
