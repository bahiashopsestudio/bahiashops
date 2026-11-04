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

// ¿Puede esta tienda usar las suscripciones? Desde F3.2, todas. La variable
// SUSCRIPCIONES_TIENDAS queda como interruptor para volver a cerrarlo rápido:
//   sin cargar o "todas"  todas
//   "ninguna"             ninguna (el panel y los carteles vuelven a /vender)
//   "15,16"               solo esas
export function suscripcionesHabilitadas(vendedorId, entorno = process.env) {
  const valor = String(entorno.SUSCRIPCIONES_TIENDAS ?? '').trim().toLowerCase()
  if (!valor || valor === 'todas') return true
  if (valor === 'ninguna') return false
  return valor.split(',').map((x) => x.trim()).filter(Boolean).includes(String(vendedorId))
}

export function emailValido(texto) {
  const email = String(texto ?? '').trim()
  return email.length <= 254 && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) ? email : null
}

// El texto para la tienda cuando no se pudo crear la suscripción.
//   status        el de Mercado Pago (0 = no respondió)
//   mailPlataforma  el mail de la cuenta que cobra (Bahía Shops): nadie puede
//                 pagarse a sí mismo, así que ese mail se frena antes de llamar.
// Mercado Pago no documenta los errores del alta: un 400 casi siempre es el
// mail (que no es de una cuenta de Mercado Pago, o es de otro país). El
// mensaje real queda en error_mp (049) para la ficha del admin.
// Nunca se muestra el texto de Mercado Pago tal cual (es técnico y en inglés).
export const MAIL_DE_LA_PLATAFORMA = 'Ese es el mail de la cuenta de Mercado Pago de Bahía Shops, que es la que cobra. Escribí el de tu cuenta de Mercado Pago.'
export const MAIL_RECHAZADO = 'Mercado Pago no aceptó ese mail. Revisá que sea el de la cuenta con la que vas a pagar.'
export const MP_NO_RESPONDIO = 'Mercado Pago no respondió. Probá de nuevo en unos minutos.'
export const MAIL_INVALIDO = 'Escribí el mail de tu cuenta de Mercado Pago.'

// { texto, campo }: campo 'email' si el problema es el mail (el modal pinta el
// campo en rojo), null si no.
export function errorDeAltaRechazada({ status, email, mailPlataforma }) {
  if (email && mailPlataforma && email.toLowerCase() === mailPlataforma.toLowerCase()) return { texto: MAIL_DE_LA_PLATAFORMA, campo: 'email' }
  if (status === 400) return { texto: MAIL_RECHAZADO, campo: 'email' }
  return { texto: MP_NO_RESPONDIO, campo: null }
}
export function mensajeDeAltaRechazada(datos) {
  return errorDeAltaRechazada(datos).texto
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
    return { tipo: 'suscribirse', monto: pendiente.precio, plan: pendiente.plan, medida: true }
  }
  if (plan?.origen === 'gratis' && !activa && Number.isInteger(precioBasico) && precioBasico > 0) {
    return { tipo: 'suscribirse', monto: precioBasico, plan: 'basico', medida: false }
  }
  return null
}

// «¡Listo!» se muestra mientras el primer cobro tenga menos de esto (y una
// sola vez por navegador: el panel guarda una marca en localStorage).
export const HORAS_RECIEN_CONFIRMADA = 48

// ¿La suscripción acaba de cobrar su primer mes? Activa, creada hace menos de
// una semana y con el último cobro de hace menos de HORAS_RECIEN_CONFIRMADA
// (el primer cobro es al autorizar, así que en esa semana es el primero).
//   fila  la de vendedor_suscripciones
export function recienConfirmada(fila, ahoraMs = Date.now()) {
  if (fila?.estado !== 'authorized' || !fila.ultimo_cobro_en) return false
  const creada = Date.parse(fila.creada_en ?? '')
  const cobro = Date.parse(fila.ultimo_cobro_en)
  if (!Number.isFinite(creada) || !Number.isFinite(cobro)) return false
  return ahoraMs - creada < 7 * DIA_MS && ahoraMs - cobro < HORAS_RECIEN_CONFIRMADA * 3600 * 1000
}

// Qué muestra «Tu plan» (SuscripcionPlan), con lo que devuelve
// GET /api/vendedor/suscripcion:
//   suscripcion       { estado, monto, initPoint, pagadoHasta, recienConfirmada } o null
//   accion            la de accionDeLaTienda (con medida) o null
//   volvio            entró con ?suscripcion=volvio o ?diferencia=volvio
//   consultaAgotada   ya pasó el rato de consultar después de volver
//   listoVisto        el navegador ya mostró el «¡Listo!» de esta suscripción
// Devuelve { tipo, pendienteVieja }:
//   'confirmando'  volvió de Mercado Pago y todavía no se confirma, o Mercado
//                  Pago ya la autorizó y falta que llegue el cobro
//   'sin_pagar'    volvió, pasó el rato y sigue esperando el pago
//   'esperando'    tiene una esperando el pago
//   'gratis'       puede pasarse al Básico
//   'medida'       tiene un plan a medida sin pagar (sin suscripción activa)
//   'diferencia'   tiene un plan a medida y ya paga el Básico
//   'listo'        recién confirmada (una sola vez)
//   'al_dia'       activa y al día
//   'cancelada'    cancelada, todavía con días pagos
//   'nada'         nada que mostrar (por ejemplo, condiciones de $0)
export function estadoParaPantalla({ suscripcion, accion, volvio = false, consultaAgotada = false, listoVisto = false, ahoraMs = Date.now() } = {}) {
  const sus = suscripcion || null
  const esperandoVolver = volvio && !consultaAgotada

  if (accion?.tipo === 'diferencia') return { tipo: esperandoVolver ? 'confirmando' : 'diferencia' }

  const deEsteMonto = accion?.tipo === 'suscribirse' && Number(accion.monto) === Number(sus?.monto)
  // Una esperando el pago por otro monto (por ejemplo, la del Básico antes de
  // que se cargara un plan a medida) no tapa la que corresponde: se ofrece la
  // nueva, y al crearla se cancela la vieja.
  const pendienteVieja = sus?.estado === 'pending' && accion?.tipo === 'suscribirse' && !deEsteMonto
  // Mercado Pago ya la autorizó, pero el cobro todavía no está registrado.
  if (sus?.estado === 'authorized' && deEsteMonto) return { tipo: 'confirmando' }

  if (accion?.tipo === 'suscribirse') {
    if (sus?.estado === 'pending' && !pendienteVieja) {
      if (esperandoVolver) return { tipo: 'confirmando' }
      if (volvio) return { tipo: 'sin_pagar' }
      if (sus.initPoint) return { tipo: 'esperando' }
    }
    return { tipo: accion.medida ? 'medida' : 'gratis', pendienteVieja }
  }

  if (sus?.estado === 'authorized') return { tipo: sus.recienConfirmada && !listoVisto ? 'listo' : 'al_dia' }
  if (sus?.estado === CANCELADA && Date.parse(sus.pagadoHasta ?? '') > ahoraMs) return { tipo: 'cancelada' }
  return { tipo: 'nada' }
}

// ── La ficha del admin (SuscripcionTienda) ───────────────────────────────────

// El estado de un cobro, en castellano y con su tono:
//   'ok' Aprobado (verde) · 'espera' Devuelto o Esperando (ámbar) ·
//   'no' Rechazado (rojo) · 'gris' lo demás
export function estadoDeCobro({ estado_pago: pago, estado_cobro: cobro } = {}) {
  if (pago === 'approved') return { texto: 'Aprobado', tono: 'ok' }
  if (pago === 'refunded' || pago === 'charged_back') return { texto: 'Devuelto', tono: 'espera' }
  if (['pending', 'in_process', 'authorized', 'in_mediation'].includes(pago)) return { texto: 'Esperando', tono: 'espera' }
  if (pago === 'rejected' || pago === 'cancelled') return { texto: 'Rechazado', tono: 'no' }
  if (!pago && ['scheduled', 'processed', 'recycling'].includes(cobro)) return { texto: 'Esperando', tono: 'espera' }
  return { texto: pago || cobro || 'Sin dato', tono: 'gris' }
}

const ESTADO_DE_DIFERENCIA = {
  pagada: { texto: 'Aprobado', tono: 'ok' },
  devuelta: { texto: 'Devuelto', tono: 'espera' },
  pendiente: { texto: 'Esperando', tono: 'espera' },
  vencida: { texto: 'Vencida', tono: 'gris' },
  sin_cobro: { texto: 'Sin cobro', tono: 'gris' },
}

// Una sola tabla con los cobros de todas las suscripciones de la tienda y los
// pagos de la diferencia, la más nueva primero:
//   [{ clave, fecha, monto, estado: { texto, tono }, suscripcion: '#7' | 'Diferencia' }]
export function filasDeCobros({ cobros = [], diferencias = [] } = {}) {
  const filas = [
    ...cobros.map((c) => ({
      clave: `c${c.id}`,
      fecha: c.cobrado_en || null,
      monto: c.monto ?? null,
      estado: estadoDeCobro(c),
      suscripcion: `#${c.suscripcion_id}`,
    })),
    ...diferencias.map((d) => ({
      clave: `d${d.id}`,
      fecha: d.pagada_en || d.creada_en || null,
      monto: d.monto ?? null,
      estado: ESTADO_DE_DIFERENCIA[d.estado] || { texto: d.estado || 'Sin dato', tono: 'gris' },
      suscripcion: 'Diferencia',
    })),
  ]
  return filas.sort((a, b) => (Date.parse(b.fecha ?? '') || 0) - (Date.parse(a.fecha ?? '') || 0))
}

// La suscripción que se muestra arriba en la ficha: la viva, o la última que
// llegó a Mercado Pago (las altas rechazadas van aparte). null si no hay.
export function suscripcionDeLaFicha(suscripciones = []) {
  return suscripciones.find((s) => esViva(s.estado)) || suscripciones.find((s) => s.estado !== 'error') || null
}

// La pastilla de estado de la ficha: { texto, tono: 'ok' | 'espera' | 'gris' }.
//   diferenciaSinPagar  tiene un plan a medida por encima de lo que paga
export function pastillaDeLaFicha(fila, { diferenciaSinPagar = false } = {}) {
  if (!fila) return null
  if (fila.estado === 'authorized') return diferenciaSinPagar ? { texto: 'Diferencia sin pagar', tono: 'espera' } : { texto: 'Al día', tono: 'ok' }
  if (fila.estado === 'pending' || fila.estado === 'creando') return { texto: 'Esperando el pago', tono: 'espera' }
  if (fila.estado === 'paused') return { texto: 'Pausada', tono: 'espera' }
  if (fila.estado === CANCELADA) return { texto: 'Cancelada', tono: 'gris' }
  return { texto: fila.estado || 'Sin dato', tono: 'gris' }
}

// Cuándo la cancela sola la tarea diaria a una que espera el pago.
export function seCancelaSola(fila) {
  const creada = Date.parse(fila?.creada_en ?? '')
  return Number.isFinite(creada) ? new Date(creada + DIAS_PARA_CANCELAR_PENDIENTE * DIA_MS).toISOString() : null
}
