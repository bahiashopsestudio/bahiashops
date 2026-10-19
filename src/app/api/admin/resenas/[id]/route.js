// Moderar una reseña (/admin/denuncias, pestaña Reseñas).
//
//   POST { accion: 'ocultar', motivo }  -> deja de verse en público y de contar
//   POST { accion: 'mostrar' }          -> "Volver a mostrar" (no una eliminada)
//   POST { accion: 'revisada' }         -> "Dar por revisada" (sigue publicada).
//                                          Vale para la reseña y para su
//                                          respuesta, lo que esté por revisar
//   POST { accion: 'eliminar' }         -> una oculta, desde los 45 días: se
//                                          borra el texto para siempre y la
//                                          fila queda (impide volver a
//                                          reseñar ese pedido)
//   POST { accion: 'ocultar_respuesta' } -> saca SOLO la respuesta de la tienda;
//                                          la reseña sigue publicada
//   POST { accion: 'mostrar_respuesta' } -> "Volver a mostrar respuesta"
//     -> { ok: true }
//
// Una reseña negativa no es motivo para ocultarla: los motivos son los cuatro
// de MOTIVOS_OCULTAR. No se le avisa a nadie. El puntaje de la tienda lo
// actualiza la base (037), y la base (038) vuelve a frenar lo que no se
// puede: eliminar antes de tiempo, tocar una eliminada. Cada UPDATE se acota
// al estado del que parte: si otra pestaña ya lo resolvió, 409.

import { NextResponse } from 'next/server'
import { getServiceRoleClient, verificarAdmin } from '@/lib/supabase/admin'
import { MOTIVOS_OCULTAR, puedeEliminar, eliminableDesde } from '@/lib/resenas'
import { fechaLarga } from '@/lib/fechas'

const COLUMNAS = 'id, estado, oculta_motivo, revision_pendiente_desde, eliminada_en'
const CAMBIO = 'Esta reseña ya cambió. Recargá la lista.'

// Ocultar o volver a mostrar SOLO la respuesta (migración 039). La base no
// deja editarla mientras está oculta, y al ocultarla la saca de "Por revisar".
async function moderarRespuesta(admin, adminUser, id, accion) {
  const ahora = new Date().toISOString()
  const consulta = accion === 'ocultar_respuesta'
    ? admin.from('respuestas_resena')
        .update({ estado: 'oculta_por_moderacion', oculta_en: ahora, oculta_por: adminUser.id,
          revision_pendiente_desde: null, revisada_en: ahora, revisada_por: adminUser.id })
        .eq('resena_id', id)
        .eq('estado', 'publicada')
    : admin.from('respuestas_resena')
        .update({ estado: 'publicada', oculta_en: null, oculta_por: null })
        .eq('resena_id', id)
        .eq('estado', 'oculta_por_moderacion')
  const { data, error } = await consulta.select('resena_id').maybeSingle()
  if (error) {
    console.error('[admin-resenas/respuesta]', id, accion, error.message)
    return NextResponse.json({ error: 'No se pudo guardar. Probá de nuevo.' }, { status: 500 })
  }
  if (!data) return NextResponse.json({ error: 'Esta respuesta ya cambió. Recargá la lista.' }, { status: 409 })
  console.log(`Respuesta de la reseña ${id}: ${accion} por ${adminUser.id}.`)
  return NextResponse.json({ ok: true })
}

// "Dar por revisada": lo que esté por revisar, la reseña y/o su respuesta.
async function darPorRevisada(admin, adminUser, id) {
  const ahora = new Date().toISOString()
  const marca = { revision_pendiente_desde: null, revisada_en: ahora, revisada_por: adminUser.id }
  const [resena, respuesta] = await Promise.all([
    admin.from('resenas').update(marca).eq('id', id).eq('estado', 'publicada')
      .not('revision_pendiente_desde', 'is', null).select('id'),
    admin.from('respuestas_resena').update(marca).eq('resena_id', id).eq('estado', 'publicada')
      .not('revision_pendiente_desde', 'is', null).select('resena_id'),
  ])
  const error = resena.error || respuesta.error
  if (error) {
    console.error('[admin-resenas/revisada]', id, error.message)
    return NextResponse.json({ error: 'No se pudo guardar. Probá de nuevo.' }, { status: 500 })
  }
  if ((resena.data || []).length === 0 && (respuesta.data || []).length === 0) {
    return NextResponse.json({ error: CAMBIO }, { status: 409 })
  }
  console.log(`Reseña ${id}: revisada por ${adminUser.id}.`)
  return NextResponse.json({ ok: true })
}

export async function POST(request, { params }) {
  const adminUser = await verificarAdmin()
  if (!adminUser) return NextResponse.json({ error: 'No autorizado.' }, { status: 403 })

  const id = Number((await params).id)
  if (!Number.isInteger(id) || id <= 0) return NextResponse.json({ error: 'Reseña inválida.' }, { status: 400 })

  const cuerpo = await request.json().catch(() => null)
  const accion = cuerpo?.accion
  const ahora = new Date().toISOString()
  const admin = getServiceRoleClient()
  let consulta

  if (accion === 'ocultar_respuesta' || accion === 'mostrar_respuesta') return moderarRespuesta(admin, adminUser, id, accion)
  if (accion === 'revisada') return darPorRevisada(admin, adminUser, id)

  if (accion === 'ocultar') {
    const motivo = cuerpo?.motivo
    if (!MOTIVOS_OCULTAR.some((m) => m.valor === motivo)) {
      return NextResponse.json({ error: 'Elegí por qué la ocultás.' }, { status: 400 })
    }
    consulta = admin.from('resenas')
      .update({
        estado: 'oculta_por_moderacion', oculta_motivo: motivo, oculta_en: ahora, oculta_por: adminUser.id,
        // Ocultarla también es revisarla: sale de "Por revisar" (la base
        // también lo hace, 038).
        revision_pendiente_desde: null, revisada_en: ahora, revisada_por: adminUser.id,
      })
      .eq('id', id)
      .eq('estado', 'publicada')
  } else if (accion === 'mostrar') {
    consulta = admin.from('resenas')
      .update({ estado: 'publicada', oculta_motivo: null, oculta_en: null, oculta_por: null })
      .eq('id', id)
      .eq('estado', 'oculta_por_moderacion')
      .is('eliminada_en', null)
  } else if (accion === 'eliminar') {
    // Antes de escribir, el plazo: así el error dice desde cuándo.
    const { data: actual, error: errorLectura } = await admin
      .from('resenas').select('id, estado, oculta_en, eliminada_en').eq('id', id).maybeSingle()
    if (errorLectura) {
      console.error('[admin-resenas/eliminar/leer]', id, errorLectura.message)
      return NextResponse.json({ error: 'No se pudo eliminar. Probá de nuevo.' }, { status: 500 })
    }
    if (!actual || actual.estado !== 'oculta_por_moderacion' || actual.eliminada_en) {
      return NextResponse.json({ error: 'Solo se puede eliminar una reseña oculta. Recargá la lista.' }, { status: 409 })
    }
    if (!puedeEliminar(actual)) {
      return NextResponse.json({ error: `Podés eliminarla desde el ${fechaLarga(eliminableDesde(actual))}.` }, { status: 409 })
    }
    // La base borra el texto, los avisos y el comentario de la tienda.
    consulta = admin.from('resenas')
      .update({ eliminada_en: ahora })
      .eq('id', id)
      .eq('estado', 'oculta_por_moderacion')
      .is('eliminada_en', null)
  } else {
    return NextResponse.json({ error: 'Acción inválida.' }, { status: 400 })
  }

  const { data, error } = await consulta.select(COLUMNAS).maybeSingle()
  if (error) {
    // 22023: la base lo frenó (una eliminada, o antes de los 45 días).
    if (error.code === '22023') return NextResponse.json({ error: error.message || CAMBIO }, { status: 409 })
    console.error('[admin-resenas/accion]', id, accion, error.message)
    return NextResponse.json({ error: 'No se pudo guardar. Probá de nuevo.' }, { status: 500 })
  }
  if (!data) return NextResponse.json({ error: CAMBIO }, { status: 409 })

  console.log(`Reseña ${id}: ${accion}${accion === 'ocultar' ? ` (${cuerpo.motivo})` : ''} por ${adminUser.id}.`)
  return NextResponse.json({
    ok: true,
    resena: {
      id: data.id,
      estado: data.estado,
      oculta_motivo: data.oculta_motivo,
      por_revisar: data.estado === 'publicada' && !!data.revision_pendiente_desde,
      eliminada: !!data.eliminada_en,
    },
  })
}
