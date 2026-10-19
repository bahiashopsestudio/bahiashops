// La tienda pide revisar una reseña (/vendedor/resenas, "Pedir revisión").
//
//   POST { motivo, comentario? }  -> { ok: true, estado_revision: 'en_revision' }
//
// Lo que se valida, en este orden:
//   1. Hay sesión y es una tienda (tiendaDeLaSesion: la tienda sale de la
//      sesión, nunca del cuerpo).
//   2. Motivo de los cuatro y comentario de hasta 300 (validarPedidoRevision).
//   3. La reseña es de SU tienda (una ajena se responde igual que una
//      inexistente).
//   4. Está publicada y no se pidió antes (una sola vez por reseña).
// La base (migración 038) vuelve a frenar lo mismo y la pone en "Por
// revisar" (revision_pendiente_desde). Mientras se revisa, sigue visible.
// Sin mails.

import { NextResponse } from 'next/server'
import { tiendaDeLaSesion } from '@/lib/tiendaDeLaSesion'
import { validarPedidoRevision } from '@/lib/resenas'

const NO_SE_PUDO = 'No pudimos pedir la revisión. Probá de nuevo en un rato.'
const YA_PEDIDA = 'Ya pediste revisar esta reseña.'

export async function POST(request, { params }) {
  const { respuesta, vendedor, admin } = await tiendaDeLaSesion('vendedor/resenas/revision')
  if (respuesta) return respuesta

  const id = Number((await params).id)
  if (!Number.isInteger(id) || id <= 0) return NextResponse.json({ error: 'Reseña inválida.' }, { status: 400 })

  const cuerpo = await request.json().catch(() => null)
  const validado = validarPedidoRevision(cuerpo)
  if (!validado.ok) return NextResponse.json({ error: validado.error }, { status: 400 })

  const { data: resena, error: errorLectura } = await admin
    .from('resenas')
    .select('id, vendedor_id, estado, revision_pedida_en')
    .eq('id', id)
    .maybeSingle()
  if (errorLectura) {
    console.error('[vendedor/resenas/revision/leer]', id, errorLectura.message)
    return NextResponse.json({ error: NO_SE_PUDO }, { status: 500 })
  }
  if (!resena || Number(resena.vendedor_id) !== Number(vendedor.id)) {
    return NextResponse.json({ error: 'No encontramos esa reseña.' }, { status: 404 })
  }
  if (resena.revision_pedida_en) return NextResponse.json({ error: YA_PEDIDA, motivo: 'ya_pedida' }, { status: 409 })
  if (resena.estado !== 'publicada') {
    return NextResponse.json({ error: 'Esta reseña ya no está publicada.', motivo: 'no_publicada' }, { status: 409 })
  }

  // El UPDATE repite las condiciones: si otra pestaña la pidió entretanto, o
  // se ocultó, no escribe nada.
  const { data: actualizada, error } = await admin
    .from('resenas')
    .update({
      revision_pedida_en: new Date().toISOString(),
      revision_motivo: validado.motivo,
      revision_comentario: validado.comentario,
    })
    .eq('id', id)
    .eq('vendedor_id', vendedor.id)
    .eq('estado', 'publicada')
    .is('revision_pedida_en', null)
    .select('id')
    .maybeSingle()

  if (error) {
    // 22023: la base lo frenó (ya pedida, o no publicada).
    if (error.code === '22023') return NextResponse.json({ error: YA_PEDIDA, motivo: 'ya_pedida' }, { status: 409 })
    console.error('[vendedor/resenas/revision/guardar]', id, error.code, error.message)
    return NextResponse.json({ error: NO_SE_PUDO }, { status: 500 })
  }
  if (!actualizada) return NextResponse.json({ error: YA_PEDIDA, motivo: 'ya_pedida' }, { status: 409 })

  console.log(`Reseña ${id}: la tienda ${vendedor.id} pidió revisarla (${validado.motivo}).`)
  return NextResponse.json({ ok: true, estado_revision: 'en_revision' })
}
