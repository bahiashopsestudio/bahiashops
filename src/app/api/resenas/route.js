// Las reseñas de quien tiene la sesión.
//
//   GET                                   -> { resenas: [...], apodo }
//   POST { pedido_id, estrellas, texto }  -> { resena }
//
// Por qué una ruta: resenas no tiene permisos para el navegador (migración
// 037). Quien reseña sale de la cookie, nunca del cuerpo.
//
// Lo que se valida al publicar, en este orden:
//   1. Hay sesión y la cuenta no se cerró.
//   2. Estrellas de 1 a 5 y comentario de hasta 500 (validarResena).
//   3. El pedido es SUYO (uno ajeno se responde igual que uno inexistente).
//   4. La tienda no cerró.
//   5. El pedido no tiene reseña y la regla deja (estadoDeResena, en
//      src/lib/resenas.js: la misma que lee Mis pedidos).
//   6. El comentario pasa el filtro: datos de contacto y lenguaje ofensivo no
//      se publican (422, con lo que encontró, para el mismo cartel que en
//      productos); lo dudoso se publica y queda marcado para /admin/denuncias.
// Dos clics seguidos: el UNIQUE de la base deja una sola, y el segundo recibe
// 409 con la reseña que quedó.

import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { getServiceRoleClient } from '@/lib/supabase/admin'
import { validarResena, estadoDeResena, moderarTextoResena, ERROR_DE_ESTADO } from '@/lib/resenas'

const NO_SE_PUDO = 'No pudimos publicar tu reseña. Probá de nuevo en un rato.'
const YA_EXISTE = 'Ya dejaste tu reseña de este pedido.'
// Lo que ve quien compró de su propia reseña. El motivo de una oculta no
// viaja: la pantalla dice que no cumple las reglas.
const COLUMNAS_MIAS = 'id, pedido_id, estrellas, texto, estado, creado_en'

async function sesion() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  return user
}

export async function GET() {
  const user = await sesion()
  if (!user) return NextResponse.json({ error: 'Iniciá sesión.' }, { status: 401 })

  const admin = getServiceRoleClient()
  const [{ data: resenas, error }, { data: cuenta, error: errorCuenta }] = await Promise.all([
    admin.from('resenas').select(COLUMNAS_MIAS).eq('comprador_id', user.id),
    admin.from('usuarios').select('nombre_usuario').eq('id', user.id).maybeSingle(),
  ])
  if (error || errorCuenta) {
    console.error('[resenas/mias]', user.id, error?.message || errorCuenta?.message)
    return NextResponse.json({ error: 'No pudimos cargar tus reseñas.' }, { status: 500 })
  }
  return NextResponse.json({ resenas: resenas || [], apodo: cuenta?.nombre_usuario || null })
}

export async function POST(request) {
  const user = await sesion()
  if (!user) return NextResponse.json({ error: 'Iniciá sesión.' }, { status: 401 })

  const cuerpo = await request.json().catch(() => null)
  const validado = validarResena(cuerpo)
  if (!validado.ok) return NextResponse.json({ error: validado.error }, { status: 400 })
  const { pedidoId, estrellas, texto } = validado

  const admin = getServiceRoleClient()

  // El token de una cuenta eliminada sigue valiendo un rato (ver 016).
  const { data: cuenta, error: errorCuenta } = await admin
    .from('usuarios')
    .select('nombre_usuario, cerrada_en')
    .eq('id', user.id)
    .maybeSingle()
  if (errorCuenta) {
    console.error('[resenas/cuenta]', user.id, errorCuenta.message)
    return NextResponse.json({ error: NO_SE_PUDO }, { status: 500 })
  }
  if (!cuenta || cuenta.cerrada_en) {
    return NextResponse.json({ error: 'Esta cuenta ya no puede dejar reseñas.' }, { status: 403 })
  }

  const { data: pedido, error: errorPedido } = await admin
    .from('pedidos')
    .select('id, comprador_id, vendedor_id, estado, entregado_at, pagado_en, vendedor:vendedores ( cerrada_en )')
    .eq('id', pedidoId)
    .maybeSingle()
  if (errorPedido) {
    console.error('[resenas/pedido]', pedidoId, errorPedido.message)
    return NextResponse.json({ error: NO_SE_PUDO }, { status: 500 })
  }
  if (!pedido || pedido.comprador_id !== user.id) {
    return NextResponse.json({ error: 'No encontramos ese pedido.' }, { status: 404 })
  }
  if (pedido.vendedor?.cerrada_en) {
    return NextResponse.json({ error: 'Esta tienda cerró: ya no recibe reseñas.', motivo: 'tienda_cerrada' }, { status: 409 })
  }

  const { data: existente, error: errorExistente } = await admin
    .from('resenas')
    .select(COLUMNAS_MIAS)
    .eq('pedido_id', pedidoId)
    .maybeSingle()
  if (errorExistente) {
    console.error('[resenas/existente]', pedidoId, errorExistente.message)
    return NextResponse.json({ error: NO_SE_PUDO }, { status: 500 })
  }
  if (existente) {
    return NextResponse.json({ error: YA_EXISTE, motivo: 'ya_existe', resena: existente }, { status: 409 })
  }

  const estado = estadoDeResena({ pedido, resena: null, ahoraMs: Date.now() })
  if (estado.estado !== 'puede') {
    return NextResponse.json({ error: ERROR_DE_ESTADO[estado.estado] || ERROR_DE_ESTADO.no_corresponde, motivo: estado.estado }, { status: 409 })
  }

  const moderacion = moderarTextoResena(texto)
  if (moderacion.nivel === 'bloqueo') {
    return NextResponse.json(
      { error: 'La reseña tiene algo que no se puede publicar.', moderacion: { bloqueos: moderacion.bloqueos } },
      { status: 422 }
    )
  }

  const ahora = new Date().toISOString()
  const { data: resena, error } = await admin
    .from('resenas')
    .insert({
      pedido_id: pedidoId,
      comprador_id: user.id,
      estrellas,
      texto,
      moderacion_avisos: moderacion.avisos,
      revision_pendiente_desde: moderacion.avisos.length > 0 ? ahora : null,
    })
    .select(COLUMNAS_MIAS)
    .single()

  if (error) {
    if (error.code === '23505') {
      // Dos clics a la vez: la otra ganó. Se devuelve la que quedó.
      const { data: ganadora } = await admin.from('resenas').select(COLUMNAS_MIAS).eq('pedido_id', pedidoId).maybeSingle()
      return NextResponse.json({ error: YA_EXISTE, motivo: 'ya_existe', resena: ganadora || null }, { status: 409 })
    }
    console.error('[resenas/insert]', pedidoId, error.code, error.message)
    return NextResponse.json({ error: NO_SE_PUDO }, { status: 500 })
  }

  console.log(`Reseña ${resena.id}: pedido ${pedidoId}, ${estrellas} estrellas${moderacion.avisos.length ? ' (para revisar)' : ''}.`)
  return NextResponse.json({ resena }, { status: 201 })
}
