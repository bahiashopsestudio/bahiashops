// La respuesta pública de la tienda a una reseña (/vendedor/resenas).
//
//   POST  { texto }  -> publica la respuesta  -> { respuesta }
//   PATCH { texto }  -> la edita (dentro de los 7 días) -> { respuesta }
//
// Lo que se valida, en este orden:
//   1. Hay sesión y es una tienda (tiendaDeLaSesion: la tienda sale de la
//      sesión, nunca del cuerpo).
//   2. Texto de 1 a 500 (validarRespuesta).
//   3. La reseña es de SU tienda (una ajena se responde igual que una
//      inexistente) y está publicada.
//   4. El filtro de respuestas (moderarTextoRespuesta): datos de contacto,
//      links, cuentas con @, "WhatsApp", redes e insultos no se publican
//      (422, con lo que encontró, para el cartel); lo dudoso se publica y
//      queda en "Por revisar".
//   5. Publicar: no tiene respuesta. Editar: tiene una, publicada, de hace
//      menos de 7 días. Al editar se vuelve a pasar el filtro: si queda
//      limpia sale de "Por revisar"; si sigue dudosa, sigue.
// La base (migración 039) vuelve a frenar todo lo de la regla. Sin mails.

import { NextResponse } from 'next/server'
import { tiendaDeLaSesion } from '@/lib/tiendaDeLaSesion'
import { validarRespuesta, moderarTextoRespuesta, edicionRespuesta } from '@/lib/resenas'
import { respuestaParaMostrar } from '@/lib/resenasServidor'

const NO_SE_PUDO = 'No pudimos guardar tu respuesta. Probá de nuevo en un rato.'
const COLUMNAS = 'resena_id, texto, estado, creado_en, editada_en'

// Como la ve el panel (con los días que quedan para editarla).
const paraLaTienda = (r) => respuestaParaMostrar(r, { conEstado: true })

// Lo común a publicar y editar: sesión, texto, reseña propia y publicada,
// filtro. Devuelve { respuesta } (un error listo) o { vendedor, admin, id,
// texto, avisos }.
async function preparar(request, params, contexto) {
  const { respuesta, vendedor, admin } = await tiendaDeLaSesion(contexto)
  if (respuesta) return { respuesta }

  const id = Number((await params).id)
  if (!Number.isInteger(id) || id <= 0) return { respuesta: NextResponse.json({ error: 'Reseña inválida.' }, { status: 400 }) }

  const cuerpo = await request.json().catch(() => null)
  const validado = validarRespuesta(cuerpo)
  if (!validado.ok) return { respuesta: NextResponse.json({ error: validado.error }, { status: 400 }) }

  const { data: resena, error } = await admin
    .from('resenas')
    .select('id, vendedor_id, estado')
    .eq('id', id)
    .maybeSingle()
  if (error) {
    console.error(`[${contexto}/resena]`, id, error.message)
    return { respuesta: NextResponse.json({ error: NO_SE_PUDO }, { status: 500 }) }
  }
  if (!resena || Number(resena.vendedor_id) !== Number(vendedor.id)) {
    return { respuesta: NextResponse.json({ error: 'No encontramos esa reseña.' }, { status: 404 }) }
  }
  if (resena.estado !== 'publicada') {
    return { respuesta: NextResponse.json({ error: 'Esta reseña ya no está publicada.', motivo: 'no_publicada' }, { status: 409 }) }
  }

  const moderacion = moderarTextoRespuesta(validado.texto)
  if (moderacion.nivel === 'bloqueo') {
    return {
      respuesta: NextResponse.json(
        { error: 'La respuesta tiene algo que no se puede publicar.', moderacion: { bloqueos: moderacion.bloqueos } },
        { status: 422 }
      ),
    }
  }
  return { vendedor, admin, id, texto: validado.texto, avisos: moderacion.avisos }
}

export async function POST(request, { params }) {
  const p = await preparar(request, params, 'vendedor/resenas/respuesta')
  if (p.respuesta) return p.respuesta

  const { data, error } = await p.admin
    .from('respuestas_resena')
    .insert({
      resena_id: p.id,
      vendedor_id: p.vendedor.id,
      texto: p.texto,
      moderacion_avisos: p.avisos,
      revision_pendiente_desde: p.avisos.length > 0 ? new Date().toISOString() : null,
    })
    .select(COLUMNAS)
    .single()

  if (error) {
    if (error.code === '23505') {
      return NextResponse.json({ error: 'Ya respondiste esta reseña.', motivo: 'ya_respondida' }, { status: 409 })
    }
    // 22023: la base lo frenó (la reseña dejó de estar publicada).
    if (error.code === '22023') return NextResponse.json({ error: error.message || NO_SE_PUDO }, { status: 409 })
    console.error('[vendedor/resenas/respuesta/publicar]', p.id, error.code, error.message)
    return NextResponse.json({ error: NO_SE_PUDO }, { status: 500 })
  }

  console.log(`Reseña ${p.id}: la tienda ${p.vendedor.id} respondió${p.avisos.length ? ' (para revisar)' : ''}.`)
  return NextResponse.json({ respuesta: paraLaTienda(data) }, { status: 201 })
}

export async function PATCH(request, { params }) {
  const p = await preparar(request, params, 'vendedor/resenas/respuesta/editar')
  if (p.respuesta) return p.respuesta

  const { data: actual, error: errorLectura } = await p.admin
    .from('respuestas_resena')
    .select('resena_id, vendedor_id, estado, creado_en, revision_pendiente_desde')
    .eq('resena_id', p.id)
    .maybeSingle()
  if (errorLectura) {
    console.error('[vendedor/resenas/respuesta/editar/leer]', p.id, errorLectura.message)
    return NextResponse.json({ error: NO_SE_PUDO }, { status: 500 })
  }
  if (!actual || Number(actual.vendedor_id) !== Number(p.vendedor.id)) {
    return NextResponse.json({ error: 'Esta reseña todavía no tiene tu respuesta.' }, { status: 404 })
  }
  if (actual.estado !== 'publicada') {
    return NextResponse.json({ error: 'Esta respuesta está oculta: no se puede editar.', motivo: 'oculta' }, { status: 409 })
  }
  if (!edicionRespuesta(actual).puede) {
    return NextResponse.json({ error: 'Tu respuesta ya no se puede editar.', motivo: 'vencida' }, { status: 409 })
  }

  // Si sigue dudosa, sigue en "Por revisar" (desde cuando ya estaba, o desde
  // ahora); si quedó limpia, sale.
  const pendiente = p.avisos.length > 0 ? (actual.revision_pendiente_desde || new Date().toISOString()) : null
  const { data, error } = await p.admin
    .from('respuestas_resena')
    .update({ texto: p.texto, moderacion_avisos: p.avisos, revision_pendiente_desde: pendiente })
    .eq('resena_id', p.id)
    .eq('vendedor_id', p.vendedor.id)
    .eq('estado', 'publicada')
    .select(COLUMNAS)
    .maybeSingle()

  if (error) {
    // 22023: la base lo frenó (pasaron los 7 días, se ocultó, o la reseña).
    if (error.code === '22023') return NextResponse.json({ error: error.message || NO_SE_PUDO }, { status: 409 })
    console.error('[vendedor/resenas/respuesta/editar]', p.id, error.code, error.message)
    return NextResponse.json({ error: NO_SE_PUDO }, { status: 500 })
  }
  if (!data) return NextResponse.json({ error: 'Tu respuesta cambió. Recargá la página.' }, { status: 409 })

  console.log(`Reseña ${p.id}: la tienda ${p.vendedor.id} editó su respuesta.`)
  return NextResponse.json({ respuesta: paraLaTienda(data) })
}
