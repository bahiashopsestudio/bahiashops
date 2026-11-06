// La suscripción al plan de la tienda de quien tiene la sesión (migración
// 048). La tienda sale de la sesión, nunca del pedido. Desde F3.2, para todas
// las tiendas (salvo que SUSCRIPCIONES_TIENDAS lo cierre: src/lib/suscripciones.js).
//
//   GET     -> { habilitada, email, suscripcion, accion, caida, topeGratis,
//                sePausarian, planCambio }
//              suscripcion  la viva o la última: { id, estado, monto, plan,
//                           proximoCobro, pagadoHasta, initPoint, creadaEn,
//                           recienConfirmada, cobroFallidoDesde, graciaHasta }
//                           o null. Si está esperando el
//                           pago o activa (o cancelada con días pagos), antes
//                           se sincroniza con Mercado Pago (una vez por minuto).
//              planCambio   la sincronización trajo (o devolvió) un cobro: el
//                           panel vuelve a leer el plan.
//              accion       lo que puede hacer (accionDeLaTienda):
//                           { tipo: 'suscribirse', monto, plan, nombre, medida, trae }
//                           { tipo: 'diferencia', monto, precioNuevo,
//                             proximoCobro, sinCobro, trae }
//                           o null
//                trae       { tope, sinTope, fotos, carritos }: lo del plan
//                           (con el tope del plan a medida si es a medida),
//                           para las pastillas del modal y los textos.
//   POST    { accion: 'suscribirse', email } -> { initPoint }
//           { accion: 'diferencia' }         -> { initPoint } o { activada: true }
//           si falla: { error, campo } (campo 'email' si el problema es el mail)
//              caida        la caída abierta (050): { motivo, plan, nombre,
//                           aMedida, pausados, cayoEn, topeDespues } o null
//              topeGratis   el tope del plan Gratis (para los textos)
//              sePausarian  con una suscripción activa: cuántos productos se
//                           pausarían si el plan cae hoy (o null)
//   DELETE  -> { ok, baja }  cancela la que espera el pago, o da de baja la
//              activa (F4a): sigue con el plan hasta el fin del mes pago.

import { NextResponse } from 'next/server'
import { tiendaDeLaSesion } from '@/lib/tiendaDeLaSesion'
import {
  MAIL_INVALIDO, MINIMO_DIFERENCIA, accionDeLaTienda, diferenciaProporcional, emailValido, graciaHasta, recienConfirmada,
  suscripcionesHabilitadas,
} from '@/lib/suscripciones'
import {
  cancelarSuscripcion, crearDiferencia, crearSuscripcionDeTienda, ponerAlDiaLaCaida, sincronizarSuscripcion,
  suscripcionesParaSincronizar, suscripcionViva, topeDelPlanAMedida,
} from '@/lib/suscripcionesServidor'

const ERROR = 'No pudimos cargar tu suscripción. Probá de nuevo en un rato.'
const SINCRONIZAR_CADA_MS = 60 * 1000

async function inicio() {
  const sesion = await tiendaDeLaSesion('suscripcion')
  if (sesion.respuesta) return sesion
  if (!suscripcionesHabilitadas(sesion.vendedor.id)) {
    return { ...sesion, respuesta: NextResponse.json({ habilitada: false }) }
  }
  return sesion
}

// El plan que rige (con especial_pendiente), la suscripción viva y los
// planes, para decidir qué puede hacer la tienda.
async function estado(admin, vendedorId, { sincronizar = false } = {}) {
  let planCambio = false
  if (sincronizar) {
    // La viva y todas las que todavía dan el plan, cada una como mucho una
    // vez por minuto.
    const { filas } = await suscripcionesParaSincronizar(admin, vendedorId)
    for (const objetivo of filas || []) {
      const vieja = !objetivo.consultada_en || Date.now() - Date.parse(objetivo.consultada_en) > SINCRONIZAR_CADA_MS
      if (!vieja) continue
      const r = await sincronizarSuscripcion(admin, objetivo)
      if (r.planCambio) planCambio = true
    }
  }
  // Si el plan pago ya terminó, que caiga ahora y, por falta de pago, que se
  // cancele en Mercado Pago (050): así puede reactivarlo enseguida.
  await ponerAlDiaLaCaida(admin, vendedorId)

  const { fila: viva, error } = await suscripcionViva(admin, vendedorId)
  if (error) return { error }

  const [plan, planes, ultima] = await Promise.all([
    admin.rpc('rpc_plan_de_tienda', { p_vendedor_id: vendedorId }),
    admin.from('planes').select('clave, nombre, precio_mensual, tope_productos, fotos_por_producto, carritos_abandonados'),
    viva ? Promise.resolve({ data: viva }) : admin.from('vendedor_suscripciones').select('*')
      .eq('vendedor_id', vendedorId).order('creada_en', { ascending: false }).limit(1).maybeSingle(),
  ])
  const fallo = plan.error || planes.error || ultima.error
  if (fallo || !plan.data) {
    console.error('[suscripcion/estado]', vendedorId, fallo?.message || 'sin plan')
    return { error: fallo || new Error('sin plan') }
  }
  const basico = (planes.data || []).find((p) => p.clave === 'basico')
  // El plan lo decide la base con los cobros aprobados, aunque Mercado Pago ya
  // diga 'authorized': hasta que llega el cobro, la acción sigue siendo esa.
  const accion = accionDeLaTienda({ plan: plan.data, suscripcionViva: viva, precioBasico: basico?.precio_mensual })
  return { plan: plan.data, planes: planes.data || [], viva, ultima: ultima.data || null, accion, planCambio }
}

// Lo que trae el plan de la acción: el de la tabla planes, con el tope del
// plan a medida si es a medida.
async function queTrae(admin, vendedorId, e, { clave, medida }) {
  const fila = e.planes.find((p) => p.clave === clave)
  const trae = {
    tope: fila?.tope_productos ?? null,
    sinTope: false,
    fotos: fila?.fotos_por_producto ?? null,
    carritos: fila?.carritos_abandonados === true,
  }
  if (medida) {
    const aMedida = await topeDelPlanAMedida(admin, vendedorId, e.planes)
    if (aMedida) Object.assign(trae, aMedida)
  }
  return trae
}

function resumen(fila) {
  if (!fila) return null
  return {
    id: fila.id,
    estado: fila.estado,
    monto: fila.monto,
    plan: fila.plan_clave,
    proximoCobro: fila.proximo_cobro_en,
    pagadoHasta: fila.pagado_hasta,
    initPoint: fila.estado === 'pending' ? fila.init_point : null,
    creadaEn: fila.creada_en,
    recienConfirmada: recienConfirmada(fila),
    cobroFallidoDesde: fila.cobro_fallido_desde ?? null,
    graciaHasta: fila.cobro_fallido_desde ? graciaHasta(fila.pagado_hasta) : null,
  }
}

// La caída abierta (050), para «Tu plan volvió al Gratis».
function resumenCaida(c) {
  if (!c) return null
  return {
    motivo: c.motivo,
    plan: c.plan,
    nombre: c.nombre,
    aMedida: c.a_medida === true,
    pausados: Number(c.pausados) || 0,
    cayoEn: c.cayo_en,
    topeDespues: c.tope_despues ?? null,
  }
}

export async function GET() {
  const { respuesta, vendedor, user, admin } = await inicio()
  if (respuesta) return respuesta

  const e = await estado(admin, vendedor.id, { sincronizar: true })
  if (e.error) return NextResponse.json({ error: ERROR }, { status: 500 })

  let accion = null
  if (e.accion?.tipo === 'suscribirse') {
    const nombre = e.planes.find((p) => p.clave === e.accion.plan)?.nombre || e.accion.plan
    const trae = await queTrae(admin, vendedor.id, e, { clave: e.accion.plan, medida: e.accion.medida })
    accion = { ...e.accion, nombre, trae }
  } else if (e.accion?.tipo === 'diferencia') {
    const calculo = diferenciaProporcional({ precioNuevo: e.accion.precioNuevo, montoActual: e.accion.montoActual, proximoCobro: e.viva.proximo_cobro_en })
    const trae = await queTrae(admin, vendedor.id, e, { clave: e.plan.especial_pendiente?.plan, medida: true })
    accion = {
      tipo: 'diferencia',
      precioNuevo: e.accion.precioNuevo,
      monto: calculo?.monto ?? null,
      proximoCobro: e.viva.proximo_cobro_en,
      sinCobro: !!calculo && calculo.monto < MINIMO_DIFERENCIA,
      trae,
    }
  }

  // Para la baja y la gracia: el tope del Gratis y cuántos productos se
  // pausarían si cae hoy (los que se ven o están por verse, menos el tope).
  const topeGratis = e.planes.find((p) => p.clave === 'gratis')?.tope_productos ?? null
  let sePausarian = null
  if (Number.isInteger(topeGratis) && (e.viva?.estado === 'authorized' || e.viva?.estado === 'paused')) {
    const { count, error: errorConteo } = await admin.from('productos').select('id', { count: 'exact', head: true })
      .eq('vendedor_id', vendedor.id).in('estado', ['activo', 'agotado', 'en_revision'])
    if (errorConteo) console.error('[suscripcion/visibles]', vendedor.id, errorConteo.message)
    else sePausarian = Math.max(0, (count ?? 0) - topeGratis)
  }

  return NextResponse.json({
    habilitada: true,
    email: user.email || '',
    suscripcion: resumen(e.viva || e.ultima),
    accion,
    caida: resumenCaida(e.plan.caida),
    topeGratis,
    sePausarian,
    planCambio: e.planCambio,
  })
}

export async function POST(request) {
  const { respuesta, vendedor, user, admin } = await inicio()
  if (respuesta) return respuesta

  const cuerpo = await request.json().catch(() => ({}))
  // Reactivar después de una caída: la suscripción vieja se cancela antes.
  if (cuerpo?.accion === 'suscribirse') await ponerAlDiaLaCaida(admin, vendedor.id)
  const e = await estado(admin, vendedor.id)
  if (e.error) return NextResponse.json({ error: ERROR }, { status: 500 })

  if (cuerpo?.accion === 'suscribirse') {
    if (e.accion?.tipo !== 'suscribirse') return NextResponse.json({ error: 'Tu plan ya está al día.' }, { status: 409 })
    const email = emailValido(cuerpo.email)
    if (!email) return NextResponse.json({ error: MAIL_INVALIDO, campo: 'email' }, { status: 400 })
    const nombrePlan = e.planes.find((p) => p.clave === e.accion.plan)?.nombre
    const r = await crearSuscripcionDeTienda(admin, { vendedorId: vendedor.id, plan: e.accion.plan, nombrePlan, monto: e.accion.monto, email })
    return r.ok
      ? NextResponse.json({ initPoint: r.initPoint })
      : NextResponse.json({ error: r.error, campo: r.campo || null }, { status: r.status })
  }

  if (cuerpo?.accion === 'diferencia') {
    if (e.accion?.tipo !== 'diferencia') return NextResponse.json({ error: 'No hay ninguna diferencia para pagar.' }, { status: 409 })
    const r = await crearDiferencia(admin, {
      vendedorId: vendedor.id,
      suscripcion: e.viva,
      plan: e.plan.especial_pendiente.plan,
      precioNuevo: e.accion.precioNuevo,
      email: e.viva.payer_email || user.email,
    })
    if (!r.ok) return NextResponse.json({ error: r.error }, { status: r.status })
    return NextResponse.json(r.activada ? { activada: true } : { initPoint: r.initPoint })
  }

  return NextResponse.json({ error: 'No entendimos qué querés hacer.' }, { status: 400 })
}

export async function DELETE() {
  const { respuesta, vendedor, admin } = await inicio()
  if (respuesta) return respuesta

  const { fila, error } = await suscripcionViva(admin, vendedor.id)
  if (error) return NextResponse.json({ error: ERROR }, { status: 500 })
  if (!fila) return NextResponse.json({ error: 'No tenés una suscripción para cancelar.' }, { status: 409 })

  // La que espera el pago se cancela; una activa se da de baja (050): el plan
  // sigue hasta pagado_hasta, sin gracia.
  const baja = fila.estado === 'authorized' || fila.estado === 'paused'
  const r = await cancelarSuscripcion(admin, fila)
  if (!r.ok) {
    return NextResponse.json({
      error: baja ? 'Mercado Pago no respondió y no pudimos darla de baja. Probá de nuevo en unos minutos.' : 'No pudimos cancelarla. Probá de nuevo en un rato.',
    }, { status: 502 })
  }
  if (baja) {
    console.log(`[suscripcion] tienda ${vendedor.id}: dio de baja la suscripción ${fila.id}.`)
    // Si ya no tenía días pagos (por ejemplo, en la gracia), cae ahora mismo.
    const { error: errorAjuste } = await admin.rpc('rpc_ajustar_productos_al_plan', { p_vendedor_id: vendedor.id })
    if (errorAjuste) console.error('[suscripcion/baja/ajustar]', vendedor.id, errorAjuste.message)
  }
  return NextResponse.json({ ok: true, baja })
}
