// La suscripción al plan de la tienda de quien tiene la sesión (migración
// 048). La tienda sale de la sesión, nunca del pedido. Mientras dure la
// prueba, solo para las tiendas de SUSCRIPCIONES_TIENDAS (src/lib/suscripciones.js).
//
//   GET     -> { habilitada, email, suscripcion, accion }
//              suscripcion  la viva o la última: { estado, monto, plan,
//                           proximoCobro, pagadoHasta, initPoint } o null.
//                           Si está esperando el pago o activa, antes se
//                           sincroniza con Mercado Pago (una vez por minuto).
//              accion       lo que puede hacer (accionDeLaTienda):
//                           { tipo: 'suscribirse', monto, plan, nombre }
//                           { tipo: 'diferencia', monto, precioNuevo,
//                             proximoCobro, sinCobro }
//                           o null
//   POST    { accion: 'suscribirse', email } -> { initPoint }
//           { accion: 'diferencia' }         -> { initPoint } o { activada: true }
//   DELETE  -> { ok }  cancela la suscripción que espera el pago
//              (la baja de una activa llega en F4).

import { NextResponse } from 'next/server'
import { tiendaDeLaSesion } from '@/lib/tiendaDeLaSesion'
import {
  MINIMO_DIFERENCIA, accionDeLaTienda, diferenciaProporcional, emailValido, suscripcionesHabilitadas,
} from '@/lib/suscripciones'
import {
  cancelarSuscripcion, crearDiferencia, crearSuscripcionDeTienda, sincronizarSuscripcion, suscripcionViva,
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
  let { fila: viva, error } = await suscripcionViva(admin, vendedorId)
  if (error) return { error }

  const vieja = !viva?.consultada_en || Date.now() - Date.parse(viva.consultada_en) > SINCRONIZAR_CADA_MS
  if (sincronizar && viva && ['pending', 'authorized'].includes(viva.estado) && vieja) {
    const r = await sincronizarSuscripcion(admin, viva)
    if (r.ok && r.fila) viva = r.fila
  }

  const [plan, planes, ultima] = await Promise.all([
    admin.rpc('rpc_plan_de_tienda', { p_vendedor_id: vendedorId }),
    admin.from('planes').select('clave, nombre, precio_mensual'),
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
  return { plan: plan.data, planes: planes.data || [], viva, ultima: ultima.data || null, accion }
}

function resumen(fila) {
  if (!fila) return null
  return {
    estado: fila.estado,
    monto: fila.monto,
    plan: fila.plan_clave,
    proximoCobro: fila.proximo_cobro_en,
    pagadoHasta: fila.pagado_hasta,
    initPoint: fila.estado === 'pending' ? fila.init_point : null,
    creadaEn: fila.creada_en,
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
    accion = { ...e.accion, nombre }
  } else if (e.accion?.tipo === 'diferencia') {
    const calculo = diferenciaProporcional({ precioNuevo: e.accion.precioNuevo, montoActual: e.accion.montoActual, proximoCobro: e.viva.proximo_cobro_en })
    accion = {
      tipo: 'diferencia',
      precioNuevo: e.accion.precioNuevo,
      monto: calculo?.monto ?? null,
      proximoCobro: e.viva.proximo_cobro_en,
      sinCobro: !!calculo && calculo.monto < MINIMO_DIFERENCIA,
    }
  }

  return NextResponse.json({
    habilitada: true,
    email: user.email || '',
    suscripcion: resumen(e.viva || e.ultima),
    accion,
  })
}

export async function POST(request) {
  const { respuesta, vendedor, user, admin } = await inicio()
  if (respuesta) return respuesta

  const cuerpo = await request.json().catch(() => ({}))
  const e = await estado(admin, vendedor.id)
  if (e.error) return NextResponse.json({ error: ERROR }, { status: 500 })

  if (cuerpo?.accion === 'suscribirse') {
    if (e.accion?.tipo !== 'suscribirse') return NextResponse.json({ error: 'Tu plan ya está al día.' }, { status: 409 })
    const email = emailValido(cuerpo.email)
    if (!email) return NextResponse.json({ error: 'Escribí el mail de tu cuenta de Mercado Pago.' }, { status: 400 })
    const nombrePlan = e.planes.find((p) => p.clave === e.accion.plan)?.nombre
    const r = await crearSuscripcionDeTienda(admin, { vendedorId: vendedor.id, plan: e.accion.plan, nombrePlan, monto: e.accion.monto, email })
    return r.ok ? NextResponse.json({ initPoint: r.initPoint }) : NextResponse.json({ error: r.error }, { status: r.status })
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
  if (!fila || !['pending', 'creando'].includes(fila.estado)) {
    return NextResponse.json({ error: 'No tenés una suscripción esperando el pago.' }, { status: 409 })
  }
  const r = await cancelarSuscripcion(admin, fila)
  if (!r.ok) return NextResponse.json({ error: 'No pudimos cancelarla. Probá de nuevo en un rato.' }, { status: 502 })
  return NextResponse.json({ ok: true })
}
