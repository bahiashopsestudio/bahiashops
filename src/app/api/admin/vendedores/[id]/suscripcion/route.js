// La suscripción al plan de una tienda (migración 048), para la ficha del
// admin.
//
//   GET   -> { suscripciones, cobros, diferencias, avisos, plan }
//            suscripciones  todas las de la tienda, la más nueva primero
//            cobros         los de esas suscripciones, el más nuevo primero
//            diferencias    los pagos de la diferencia de un plan a medida
//            avisos         [{ tipo, texto }]:
//              'monto_sin_cambiar'  una diferencia pagada cuyo monto nuevo
//                                   Mercado Pago no aceptó todavía
//              'paga_sin_precio'    la tienda tiene condiciones de $0 y una
//                                   suscripción activa
//            plan           el que rige: { nombre, origen, precio, especialPendiente }
//   POST  { accion: 'sincronizar' }      lee en Mercado Pago la viva y las que dan el plan (o la última)
//                                        y sus cobros, con el estado de cada pago
//         { accion: 'cancelar' }         cancela la viva en Mercado Pago
//         { accion: 'reintentar_monto' } vuelve a mandar el monto nuevo (o el
//                                        anterior, si se devolvió la diferencia)
//         -> { ok } o { error }
//
// El admin sale de la sesión. Nada se escribe con lo que manda el navegador:
// todo sale de Mercado Pago o de la base.

import { NextResponse } from 'next/server'
import { getServiceRoleClient, verificarAdmin } from '@/lib/supabase/admin'
import { textoPrecio } from '@/lib/planes'
import {
  aplicarMontoNuevo, cancelarSuscripcion, revertirMonto, sincronizarSuscripcion, suscripcionesParaSincronizar, suscripcionViva,
} from '@/lib/suscripcionesServidor'

async function inicio(params) {
  const adminUser = await verificarAdmin()
  if (!adminUser) return { respuesta: NextResponse.json({ error: 'No autorizado.' }, { status: 403 }) }
  const vendedorId = Number((await params).id)
  if (!Number.isInteger(vendedorId) || vendedorId <= 0) {
    return { respuesta: NextResponse.json({ error: 'La tienda no es válida.' }, { status: 400 }) }
  }
  return { adminUser, vendedorId, admin: getServiceRoleClient() }
}

const ERROR = 'No pudimos cargar la suscripción de la tienda.'

export async function GET(_request, { params }) {
  const { respuesta, vendedorId, admin } = await inicio(params)
  if (respuesta) return respuesta

  const [suscripciones, diferencias, plan] = await Promise.all([
    admin.from('vendedor_suscripciones')
      .select('id, plan_clave, monto, estado, mp_preapproval_id, payer_email, proximo_cobro_en, ultimo_cobro_en, ultimo_cobro_monto, pagado_hasta, consultada_en, creada_en, cancelada_en, error_mp')
      .eq('vendedor_id', vendedorId).order('creada_en', { ascending: false }),
    admin.from('suscripcion_diferencias')
      .select('id, suscripcion_id, precio_nuevo, monto_anterior, monto, estado, mp_pago_id, pagada_en, monto_mp_actualizado_en, intentos_monto_mp, error_monto_mp, cubre_hasta, creada_en')
      .eq('vendedor_id', vendedorId).order('creada_en', { ascending: false }),
    admin.rpc('rpc_plan_de_tienda', { p_vendedor_id: vendedorId }),
  ])
  const error = suscripciones.error || diferencias.error || plan.error
  if (error) {
    console.error('[admin-suscripcion/leer]', vendedorId, error.message)
    return NextResponse.json({ error: ERROR }, { status: 500 })
  }

  const ids = (suscripciones.data || []).map((s) => s.id)
  const cobros = ids.length
    ? await admin.from('suscripcion_cobros')
      .select('id, suscripcion_id, mp_cobro_id, mp_pago_id, estado_cobro, estado_pago, monto, cobrado_en')
      .in('suscripcion_id', ids).order('cobrado_en', { ascending: false })
    : { data: [], error: null }
  if (cobros.error) {
    console.error('[admin-suscripcion/cobros]', vendedorId, cobros.error.message)
    return NextResponse.json({ error: ERROR }, { status: 500 })
  }

  const avisos = []
  for (const d of diferencias.data || []) {
    if (['pagada', 'sin_cobro'].includes(d.estado) && !d.monto_mp_actualizado_en) {
      avisos.push({
        tipo: 'monto_sin_cambiar',
        texto: `La tienda pagó la diferencia para pasar a ${textoPrecio(d.precio_nuevo)}, pero Mercado Pago todavía no aceptó el monto nuevo`
          + ` (${d.intentos_monto_mp} intento${d.intentos_monto_mp === 1 ? '' : 's'}${d.error_monto_mp ? `: ${d.error_monto_mp}` : ''}).`
          + ' La tarea diaria lo reintenta; si sigue, «Reintentar el monto».',
      })
    }
    if (d.estado === 'devuelta' && d.monto_mp_actualizado_en && d.error_monto_mp) {
      avisos.push({
        tipo: 'monto_sin_cambiar',
        texto: `Se devolvió la diferencia, pero Mercado Pago sigue con ${textoPrecio(d.precio_nuevo)} en vez de ${textoPrecio(d.monto_anterior)}`
          + ` (${d.error_monto_mp}). La tarea diaria lo reintenta; si sigue, «Reintentar el monto».`,
      })
    }
  }
  const viva = (suscripciones.data || []).find((s) => ['authorized', 'paused'].includes(s.estado))
  if (viva && plan.data?.origen === 'especial' && Number(plan.data.precio_mensual) === 0) {
    avisos.push({ tipo: 'paga_sin_precio', texto: `Esta tienda sigue pagando ${textoPrecio(viva.monto)} por mes y tiene condiciones sin abono. Cancelala si ya no corresponde.` })
  }

  const p = plan.data || {}
  return NextResponse.json({
    suscripciones: suscripciones.data || [],
    cobros: cobros.data || [],
    diferencias: diferencias.data || [],
    avisos,
    // El plan que rige, para «Plan» y la pastilla «Diferencia sin pagar».
    plan: {
      nombre: p.nombre ?? null,
      origen: p.origen ?? null,
      precio: Number.isInteger(Number(p.precio_mensual)) ? Number(p.precio_mensual) : null,
      especialPendiente: p.especial_pendiente ?? null,
    },
  })
}

export async function POST(request, { params }) {
  const { respuesta, adminUser, vendedorId, admin } = await inicio(params)
  if (respuesta) return respuesta

  const { accion } = (await request.json().catch(() => ({}))) || {}
  const { fila, error } = await suscripcionViva(admin, vendedorId)
  if (error) return NextResponse.json({ error: ERROR }, { status: 500 })

  if (accion === 'sincronizar') {
    // La viva y todas las que todavía dan el plan (también canceladas, aunque
    // haya una más nueva): así se ve un reembolso de cualquiera de sus cobros.
    // Si no queda ninguna, la última creada en Mercado Pago.
    const { filas, error: errorFilas } = await suscripcionesParaSincronizar(admin, vendedorId, { ultimaSiNoHay: true })
    if (errorFilas) return NextResponse.json({ error: ERROR }, { status: 500 })
    if (!filas.length) return NextResponse.json({ error: 'La tienda no tiene ninguna suscripción en Mercado Pago.' }, { status: 409 })
    const errores = []
    for (const objetivo of filas) {
      const r = await sincronizarSuscripcion(admin, objetivo)
      if (!r.ok) errores.push(r.error)
    }
    return errores.length ? NextResponse.json({ error: `Mercado Pago: ${errores.join(' · ')}` }, { status: 502 }) : NextResponse.json({ ok: true })
  }

  if (accion === 'cancelar') {
    if (!fila) return NextResponse.json({ error: 'La tienda no tiene una suscripción viva.' }, { status: 409 })
    const r = await cancelarSuscripcion(admin, fila)
    if (r.ok) console.log(`[admin-suscripcion] admin ${adminUser.id} canceló la suscripción ${fila.id} de la tienda ${vendedorId}.`)
    return r.ok ? NextResponse.json({ ok: true }) : NextResponse.json({ error: `Mercado Pago no la canceló: ${r.error}` }, { status: 502 })
  }

  if (accion === 'reintentar_monto') {
    const [aplicar, revertir] = await Promise.all([
      admin.from('suscripcion_diferencias').select('*')
        .eq('vendedor_id', vendedorId).in('estado', ['pagada', 'sin_cobro']).is('monto_mp_actualizado_en', null),
      admin.from('suscripcion_diferencias').select('*')
        .eq('vendedor_id', vendedorId).eq('estado', 'devuelta').not('monto_mp_actualizado_en', 'is', null),
    ])
    if (aplicar.error || revertir.error) return NextResponse.json({ error: ERROR }, { status: 500 })
    if (!aplicar.data?.length && !revertir.data?.length) return NextResponse.json({ error: 'No hay ningún monto pendiente.' }, { status: 409 })
    let ok = true
    for (const d of aplicar.data || []) if (!(await aplicarMontoNuevo(admin, d)).ok) ok = false
    for (const d of revertir.data || []) if (!(await revertirMonto(admin, d)).ok) ok = false
    return ok ? NextResponse.json({ ok: true }) : NextResponse.json({ error: 'Mercado Pago no aceptó el monto nuevo.' }, { status: 502 })
  }

  return NextResponse.json({ error: 'Acción desconocida.' }, { status: 400 })
}
