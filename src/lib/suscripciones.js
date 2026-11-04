// Las suscripciones del plan con Mercado Pago (migración 048): las reglas, sin
// base ni red. Las usan src/lib/suscripcionesServidor.js, las rutas, el
// webhook y la tarea diaria. Sin imports con '@/' para que las pruebe
// scripts/probar-suscripciones.mjs.
//
// Lo que se sabe de Mercado Pago sale del sondeo con cuentas de prueba
// (scripts/sondear-suscripcion.mjs, 04/11/2026):
//   · POST /preapproval sin plan y con status 'pending' devuelve id e
//     init_point; payer_email vuelve vacío (lo guardamos nosotros).
//   · Pagada, pasa a 'authorized'; el primer cobro es al autorizar y
//     next_payment_date queda a mes exacto. Cancelada: 'cancelled' (Mercado
//     Pago rechaza 'canceled').
//   · El cobro (authorized_payment) trae preapproval_id, external_reference,
//     debit_date, status ('processed') y payment { id, status }.
//   · El pago trae el mismo external_reference.
//   · Un PUT del monto no le pide nada a quien paga y rige desde el próximo
//     cobro.
//
//   npm run probar:suscripciones

export const PREFIJO_SUSCRIPCION = 'bs-sus-'
export const PREFIJO_DIFERENCIA = 'bs-dif-'

// Las que Mercado Pago todavía puede cobrar (o que se están creando).
export const ESTADOS_VIVOS = ['creando', 'pending', 'authorized', 'paused']
export const CANCELADA = 'cancelled'

// Días de gracia después de pagado_hasta: los de los reintentos de Mercado
// Pago. La misma regla está en privado.suscripcion_al_dia (048).
export const DIAS_DE_GRACIA = 10

// Una suscripción esperando el pago se cancela sola después de esto (la tarea
// diaria). Una de menos de REUSAR_PENDIENTE_HORAS se reusa si el monto es el
// mismo, en vez de crear otra.
export const DIAS_PARA_CANCELAR_PENDIENTE = 7
export const REUSAR_PENDIENTE_HORAS = 24

// Por debajo de esto la diferencia de un plan a medida no se cobra: se activa
// sin pago. Es nuestro: Mercado Pago no documenta un mínimo para un pago
// único en pesos. Si en la prueba real rechaza un monto mayor, se sube acá.
export const MINIMO_DIFERENCIA = 100

const DIA_MS = 24 * 60 * 60 * 1000

export const esViva = (estado) => ESTADOS_VIVOS.includes(estado)

// ¿Puede esta tienda usar las suscripciones? SUSCRIPCIONES_TIENDAS lista los
// ids separados por coma ("15"), o "todas". Vacía: ninguna.
export function suscripcionesHabilitadas(vendedorId, entorno = process.env) {
  const valor = String(entorno.SUSCRIPCIONES_TIENDAS ?? '').trim().toLowerCase()
  if (!valor) return false
  if (valor === 'todas') return true
  return valor.split(',').map((x) => x.trim()).filter(Boolean).includes(String(vendedorId))
}

export function emailValido(texto) {
  const email = String(texto ?? '').trim()
  return email.length <= 254 && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) ? email : null
}

// El cuerpo de POST /preapproval: sin plan, con pago pendiente.
export function cuerpoDeAlta({ monto, email, referencia, backUrl, motivo }) {
  return {
    reason: motivo,
    external_reference: referencia,
    payer_email: email,
    auto_recurring: { frequency: 1, frequency_type: 'months', transaction_amount: monto, currency_id: 'ARS' },
    back_url: backUrl,
    status: 'pending',
  }
}

// El cuerpo de la preferencia del pago único de una diferencia.
export function cuerpoDeDiferencia({ monto, referencia, titulo, email, urlMp }) {
  return {
    items: [{ id: referencia, title: titulo, quantity: 1, unit_price: monto, currency_id: 'ARS' }],
    payer: email ? { email } : undefined,
    statement_descriptor: 'BAHIASHOPS',
    back_urls: {
      success: `${urlMp}/vendedor/perfil?diferencia=volvio`,
      failure: `${urlMp}/vendedor/perfil?diferencia=volvio`,
      pending: `${urlMp}/vendedor/perfil?diferencia=volvio`,
    },
    auto_return: 'approved',
    notification_url: `${urlMp}/api/mercadopago/webhook`,
    external_reference: referencia,
    // Solo medios que se acreditan en el momento: un cupón en efectivo
    // dejaría la diferencia colgada días.
    payment_methods: { excluded_payment_types: [{ id: 'ticket' }, { id: 'atm' }] },
  }
}

// ¿La suscripción que devolvió Mercado Pago es la nuestra? Que la cobre la
// plataforma, con nuestra referencia y en pesos. Devuelve null si está bien,
// o el motivo.
export function problemaDeSuscripcion(mp, fila, plataformaId) {
  if (!mp || typeof mp !== 'object') return 'sin_datos'
  if (plataformaId && String(mp.collector_id ?? '') !== String(plataformaId)) return 'otro_cobrador'
  if (fila && String(mp.external_reference ?? '') !== String(fila.external_reference)) return 'otra_referencia'
  if (mp.auto_recurring?.currency_id && mp.auto_recurring.currency_id !== 'ARS') return 'otra_moneda'
  return null
}

const fechaIso = (v) => {
  const ms = Date.parse(v ?? '')
  return Number.isFinite(ms) ? new Date(ms).toISOString() : null
}
const numero = (v) => (v === null || v === undefined || v === '' || !Number.isFinite(Number(v)) ? null : Number(v))

// Lo que se guarda de una suscripción de Mercado Pago (GET /preapproval/{id}).
export function datosDeSuscripcion(mp) {
  const estado = /^[a-z_]{1,30}$/.test(String(mp?.status ?? '')) ? mp.status : null
  const monto = numero(mp?.auto_recurring?.transaction_amount)
  return {
    estado,
    proximo_cobro_en: fechaIso(mp?.next_payment_date),
    monto: Number.isInteger(monto) && monto > 0 ? monto : null,
    // El de una pendiente: la página donde se paga.
    init_point: typeof mp?.init_point === 'string' ? mp.init_point : null,
    ultimo_cobro_resumen: fechaIso(mp?.summarized?.last_charged_date),
  }
}

// Lo que se guarda de un cobro (GET /authorized_payments/{id} o /search).
export function datosDeCobro(cobro) {
  return {
    mp_cobro_id: cobro?.id !== undefined && cobro?.id !== null ? String(cobro.id) : null,
    mp_pago_id: cobro?.payment?.id !== undefined && cobro?.payment?.id !== null ? String(cobro.payment.id) : null,
    estado_cobro: typeof cobro?.status === 'string' ? cobro.status : null,
    estado_pago: typeof cobro?.payment?.status === 'string' ? cobro.payment.status : null,
    monto: numero(cobro?.transaction_amount),
    cobrado_en: fechaIso(cobro?.debit_date) || fechaIso(cobro?.date_created),
    preapproval_id: typeof cobro?.preapproval_id === 'string' ? cobro.preapproval_id : null,
  }
}

// Lo que se guarda de un pago (GET /v1/payments/{id}) que es un cobro de una
// suscripción.
export function datosDePagoDeSuscripcion(pago) {
  return {
    mp_cobro_id: null,
    mp_pago_id: pago?.id !== undefined && pago?.id !== null ? String(pago.id) : null,
    estado_cobro: null,
    estado_pago: typeof pago?.status === 'string' ? pago.status : null,
    monto: numero(pago?.transaction_amount),
    cobrado_en: fechaIso(pago?.date_approved),
    preapproval_id: typeof pago?.point_of_interaction?.transaction_data?.subscription_id === 'string'
      ? pago.point_of_interaction.transaction_data.subscription_id : null,
  }
}

// De quién es un pago a la plataforma, por su external_reference.
export function tipoDePagoDePlataforma(pago) {
  const ref = String(pago?.external_reference ?? '')
  if (ref.startsWith(PREFIJO_DIFERENCIA)) return 'diferencia'
  if (ref.startsWith(PREFIJO_SUSCRIPCION)) return 'suscripcion'
  return null
}

// Un mes calendario antes de una fecha (como interval '1 month' de Postgres:
// el 31/3 menos un mes es el 28 o 29/2).
function unMesAntes(ms) {
  const d = new Date(ms)
  const dia = d.getUTCDate()
  d.setUTCDate(1)
  d.setUTCMonth(d.getUTCMonth() - 1)
  const ultimo = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0)).getUTCDate()
  d.setUTCDate(Math.min(dia, ultimo))
  return d.getTime()
}

// La diferencia proporcional de lo que queda del mes:
//   (precio nuevo − monto actual) × días que faltan para el próximo cobro
//   ÷ días del ciclo, redondeada a pesos.
// El ciclo va del próximo cobro menos un mes al próximo cobro. Los días que
// faltan se cuentan enteros hacia arriba (hoy cuenta).
// Devuelve { monto, diasRestantes, diasCiclo } o null si no corresponde.
export function diferenciaProporcional({ precioNuevo, montoActual, proximoCobro, ahoraMs = Date.now() }) {
  const nuevo = Number(precioNuevo)
  const actual = Number(montoActual)
  const fin = Date.parse(proximoCobro ?? '')
  if (!Number.isInteger(nuevo) || !Number.isInteger(actual) || !(nuevo > actual) || !(actual > 0) || !Number.isFinite(fin)) return null
  const inicio = unMesAntes(fin)
  const diasCiclo = Math.round((fin - inicio) / DIA_MS)
  const diasRestantes = Math.min(diasCiclo, Math.max(0, Math.ceil((fin - ahoraMs) / DIA_MS)))
  return { monto: Math.round(((nuevo - actual) * diasRestantes) / diasCiclo), diasRestantes, diasCiclo }
}

// ¿Una suscripción esperando el pago se puede reusar para este monto?
export function reusarPendiente(fila, monto, ahoraMs = Date.now()) {
  if (!fila || fila.estado !== 'pending' || !fila.init_point) return false
  if (Number(fila.monto) !== Number(monto)) return false
  return ahoraMs - Date.parse(fila.creada_en) < REUSAR_PENDIENTE_HORAS * 3600 * 1000
}

// ¿La tarea diaria la cancela por abandonada?
export function pendienteAbandonada(fila, ahoraMs = Date.now()) {
  return fila?.estado === 'pending' && ahoraMs - Date.parse(fila.creada_en) > DIAS_PARA_CANCELAR_PENDIENTE * DIA_MS
}

// Qué puede hacer la tienda desde su panel, con el plan que rige
// (rpc_plan_de_tienda) y el precio del Básico:
//   { tipo: 'suscribirse', monto, plan }   sin suscripción viva al día
//   { tipo: 'diferencia', precioNuevo, montoActual }  paga menos que su plan a medida
//   null                                    nada que hacer
// suscripcionViva: la fila viva de la tienda (o null).
export function accionDeLaTienda({ plan, suscripcionViva, precioBasico }) {
  const pendiente = plan?.especial_pendiente
  const activa = suscripcionViva && suscripcionViva.estado === 'authorized'
  if (pendiente && Number.isInteger(pendiente.precio) && pendiente.precio > 0) {
    if (activa) {
      if (Number(suscripcionViva.monto) < pendiente.precio) {
        return { tipo: 'diferencia', precioNuevo: pendiente.precio, montoActual: Number(suscripcionViva.monto) }
      }
      return null
    }
    return { tipo: 'suscribirse', monto: pendiente.precio, plan: pendiente.plan }
  }
  if (plan?.origen === 'gratis' && !activa && Number.isInteger(precioBasico) && precioBasico > 0) {
    return { tipo: 'suscribirse', monto: precioBasico, plan: 'basico' }
  }
  return null
}
