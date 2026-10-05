// Cuánto tiempo tiene una persona para pagar un pedido.
//
// En Argentina los precios cambian (casi siempre suben): nadie puede pagar
// semanas después a un precio viejo. Por eso el link de pago y el ticket en
// efectivo de cada pedido vencen a los PLAZO_PAGO_DIAS de crearlo. El
// vencimiento se guarda en pedidos.vence_en al crear el pedido: ahí vive el
// plazo que de verdad se le mandó a MercadoPago, aunque después se cambie el
// número de acá.
//
// Este es el ÚNICO lugar donde está el plazo. La base no lo sabe: sólo compara
// vence_en con la hora (privado.cancelar_pedidos_vencidos, migración 022).

export const PLAZO_PAGO_DIAS = 3

const MS_POR_DIA = 24 * 60 * 60 * 1000
const MS_POR_MINUTO = 60 * 1000

// Para probar en la máquina de quien desarrolla: VENCIMIENTO_PAGO_MINUTOS=5 en
// .env.local baja el plazo a 5 minutos. SOLO se respeta fuera de producción
// (NODE_ENV distinto de 'production', o sea `npm run dev`): en producción, y en
// cualquier build, el plazo son siempre PLAZO_PAGO_DIAS, aunque la variable
// esté cargada. Nunca alarga el plazo: el tope es el valor normal.
export function plazoPagoMs() {
  const normal = PLAZO_PAGO_DIAS * MS_POR_DIA
  if (process.env.NODE_ENV === 'production') return normal

  const minutos = Number(process.env.VENCIMIENTO_PAGO_MINUTOS)
  if (!Number.isFinite(minutos) || minutos <= 0) return normal
  return Math.min(minutos * MS_POR_MINUTO, normal)
}

// El momento (en milisegundos) en que vence un pedido creado en `desdeMs`.
export function calcularVencimiento(desdeMs = Date.now()) {
  return desdeMs + plazoPagoMs()
}

// Un pedido "no tiene pago" si mp_payment_id está vacío o quedó como el texto
// "null" o "undefined" (lo mismo que mira la base en 016 y en 022).
const VALORES_SIN_PAGO = ['', 'null', 'undefined']

export function pedidoTienePago(pedido) {
  return !VALORES_SIN_PAGO.includes(String(pedido?.mp_payment_id ?? '').trim())
}

// ¿El pedido venció sin pagarse?
//   · Ya cancelado por vencimiento (la base lo marcó): sí.
//   · Todavía pendiente, sin ningún pago y con la fecha pasada: sí. Es lo que
//     se ve en el rato que pasa hasta que alguien lo cancela en la base.
//   · Pendiente CON un pago en proceso (por ejemplo un ticket en efectivo ya
//     pagado que se está acreditando): no. Ese lo resuelve MercadoPago.
// Funciona en el navegador y en el servidor: no lee nada del entorno.
export function pedidoVencido(pedido, ahoraMs = Date.now()) {
  if (!pedido) return false
  if (pedido.estado === 'cancelado') return pedido.cancelado_motivo === 'pago_vencido'
  if (pedido.estado !== 'pendiente' || !pedido.vence_en) return false

  const vence = Date.parse(pedido.vence_en)
  return Number.isFinite(vence) && ahoraMs >= vence && !pedidoTienePago(pedido)
}

// La fecha hasta la que todavía se puede pagar un pedido pendiente, o null si
// no hay (no tiene vence_en, no está pendiente o ya pasó).
export function pagableHasta(pedido, ahoraMs = Date.now()) {
  if (!pedido || pedido.estado !== 'pendiente' || !pedido.vence_en) return null
  const vence = Date.parse(pedido.vence_en)
  return Number.isFinite(vence) && vence > ahoraMs ? new Date(vence) : null
}
