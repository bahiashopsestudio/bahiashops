// Cuánto tiempo tiene una persona para pagar un pedido. Son DOS plazos, y no
// dependen uno del otro:
//
//   · El link de pago (la preferencia de MercadoPago) vive PLAZO_LINK_HORAS. Se
//     guarda en pedidos.vence_en. Vencido el link no se puede pagar con tarjeta
//     ni con dinero en cuenta desde ahí, pero un cupón de efectivo (Rapipago,
//     Pago Fácil) que ya se generó sigue vivo.
//   · El cupón en efectivo vive PLAZO_CUPON_DIAS desde que se creó el pedido. MP
//     lo redondea al final del día de Argentina y el vencimiento real se lee del
//     pago (date_of_expiration) y se guarda en pedidos.efectivo_vence_en.
//
// En Argentina los precios cambian (casi siempre suben): nadie puede pagar
// semanas después a un precio viejo. Este es el ÚNICO lugar donde están los
// plazos. La base no los sabe: sólo compara las fechas guardadas con la hora
// (privado.cancelar_pedidos_vencidos, migraciones 022 y 025).

export const PLAZO_LINK_HORAS = 2
export const PLAZO_CUPON_DIAS = 3

const MS_POR_MINUTO = 60 * 1000
const MS_POR_HORA = 60 * MS_POR_MINUTO
const MS_POR_DIA = 24 * MS_POR_HORA
const DESFASE_AR_MS = 3 * MS_POR_HORA

// Para probar en la máquina de quien desarrolla: VENCIMIENTO_PAGO_MINUTOS=5 en
// .env.local baja el plazo del LINK a 5 minutos. SOLO se respeta fuera de
// producción (NODE_ENV distinto de 'production', o sea `npm run dev`): en
// producción, y en cualquier build, el plazo son siempre PLAZO_LINK_HORAS,
// aunque la variable esté cargada. Nunca alarga el plazo: el tope es el valor
// normal.
export function plazoLinkMs() {
  const normal = PLAZO_LINK_HORAS * MS_POR_HORA
  if (process.env.NODE_ENV === 'production') return normal

  const minutos = Number(process.env.VENCIMIENTO_PAGO_MINUTOS)
  if (!Number.isFinite(minutos) || minutos <= 0) return normal
  return Math.min(minutos * MS_POR_MINUTO, normal)
}

export function plazoCuponMs() {
  return PLAZO_CUPON_DIAS * MS_POR_DIA
}

// El momento (en milisegundos) en que vence el LINK de un pedido creado en
// `desdeMs`.
export function calcularVencimiento(desdeMs = Date.now()) {
  return desdeMs + plazoLinkMs()
}

// El momento hasta el que vale un cupón en efectivo de un pedido creado en
// `desdeMs`: lo que se le manda a MercadoPago como date_of_expiration.
export function calcularVencimientoCupon(desdeMs = Date.now()) {
  return desdeMs + plazoCuponMs()
}

// El último segundo (23:59:59) del día de Argentina al que pertenece `ms`.
export function finDelDiaAR(ms) {
  const inicioDelDia = Math.floor((ms - DESFASE_AR_MS) / MS_POR_DIA) * MS_POR_DIA
  return inicioDelDia + MS_POR_DIA - 1000 + DESFASE_AR_MS
}

// Hasta cuándo vale el cupón en efectivo de un pago. Sale del pago
// (date_of_expiration, un instante absoluto: el desfase con que venga no
// importa). Si MercadoPago no lo trajo, el respaldo es el final del día
// argentino de la fecha con la que se creó la preferencia (creación del pedido
// + PLAZO_CUPON_DIAS). Devuelve un string ISO.
export function vencimientoDeCupon(pago, pedido, ahoraMs = Date.now()) {
  const delPago = Date.parse(pago?.date_of_expiration)
  if (Number.isFinite(delPago)) return new Date(delPago).toISOString()

  const creado = Date.parse(pedido?.creado_en)
  const base = Number.isFinite(creado) ? creado : ahoraMs
  return new Date(finDelDiaAR(base + plazoCuponMs())).toISOString()
}

// ¿Este pago es un cupón en efectivo que todavía no se pagó? (Rapipago y Pago
// Fácil vuelven como pagos pendientes de tipo ticket.)
export function esCuponEnEfectivo(pago) {
  return pago?.status === 'pending' && ['ticket', 'atm'].includes(pago?.payment_type_id)
}

// La fecha para mostrarle a una persona: solo el día, en hora de Argentina.
// "12 de octubre".
export function fechaDeCupon(valor) {
  const t = valor instanceof Date ? valor.getTime() : Date.parse(valor)
  if (!Number.isFinite(t)) return ''
  return new Date(t).toLocaleDateString('es-AR', { day: 'numeric', month: 'long', timeZone: 'America/Argentina/Buenos_Aires' })
}

// Un pedido "no tiene pago" si mp_payment_id está vacío o quedó como el texto
// "null" o "undefined" (lo mismo que mira la base en 016 y en 022).
const VALORES_SIN_PAGO = ['', 'null', 'undefined']

export function pedidoTienePago(pedido) {
  return !VALORES_SIN_PAGO.includes(String(pedido?.mp_payment_id ?? '').trim())
}

function fechaFutura(valor, ahoraMs) {
  const t = Date.parse(valor)
  return Number.isFinite(t) && t > ahoraMs ? new Date(t) : null
}

// ¿Es una venta en curso por pago en efectivo? Un pedido pendiente con un cupón
// ya generado (hay pago y fecha de cupón). Es una venta, no un carrito
// abandonado: el comprador no la abandonó, está esperando pagar.
export function esPagoEnEfectivoPendiente(pedido) {
  return pedido?.estado === 'pendiente' && pedidoTienePago(pedido) && !!pedido.efectivo_vence_en
}

// ¿El pedido venció sin pagarse?
//   · Ya cancelado por vencimiento (la base lo marcó): sí.
//   · Pendiente con cupón: sí cuando pasó el vencimiento del cupón (la base lo
//     cancela unas horas después, por si se está acreditando).
//   · Pendiente sin cupón, sin ningún pago y con el link vencido: sí. Es lo que
//     se ve en el rato que pasa hasta que alguien lo cancela en la base.
//   · Pendiente CON un pago en proceso pero sin fecha de cupón (por ejemplo una
//     tarjeta que se está acreditando): no. Ese lo resuelve MercadoPago.
// Funciona en el navegador y en el servidor: no lee nada del entorno.
export function pedidoVencido(pedido, ahoraMs = Date.now()) {
  if (!pedido) return false
  if (pedido.estado === 'cancelado') return pedido.cancelado_motivo === 'pago_vencido'
  if (pedido.estado !== 'pendiente') return false

  if (pedido.efectivo_vence_en) {
    const venceCupon = Date.parse(pedido.efectivo_vence_en)
    return Number.isFinite(venceCupon) && ahoraMs >= venceCupon
  }

  if (!pedido.vence_en) return false
  const vence = Date.parse(pedido.vence_en)
  return Number.isFinite(vence) && ahoraMs >= vence && !pedidoTienePago(pedido)
}

// La fecha hasta la que todavía se puede pagar un pedido pendiente, o null si no
// hay (no está pendiente, ya pasó, o no tiene fecha). Con un cupón en efectivo
// es el vencimiento del cupón; sin cupón, el del link.
export function pagableHasta(pedido, ahoraMs = Date.now()) {
  if (!pedido || pedido.estado !== 'pendiente') return null
  if (pedido.efectivo_vence_en) return fechaFutura(pedido.efectivo_vence_en, ahoraMs)
  return fechaFutura(pedido.vence_en, ahoraMs)
}

// Hasta cuándo vale un link de pago NUEVO para un pedido con cupón: las 2 horas
// de siempre, sin pasarse nunca del vencimiento del cupón. Devuelve milisegundos,
// o null si el cupón ya venció.
export function vencimientoDeLinkNuevo(pedido, ahoraMs = Date.now()) {
  const hasta = pagableHasta(pedido, ahoraMs)
  if (!hasta) return null
  return Math.min(ahoraMs + plazoLinkMs(), hasta.getTime())
}
