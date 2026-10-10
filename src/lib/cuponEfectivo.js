// El cupón en efectivo (Rapipago, Pago Fácil) de un pedido, para la pantalla a
// la que se vuelve de MercadoPago (/compra/pendiente). Funciones puras: las usa
// /api/pedidos/[id]/cupon y las prueba scripts/probar-cupon.mjs.

import { esCuponEnEfectivo, vencimientoDeCupon, esPagoEnEfectivoPendiente } from './vencimientoPago.js'

const MEDIOS_EN_EFECTIVO = ['rapipago', 'pagofacil']

// ¿Es un cupón en efectivo sin pagar? Lo mismo que mira el webhook (pending +
// ticket o atm), más los medios por nombre.
export function esCuponSinPagar(pago) {
  return esCuponEnEfectivo(pago) || (pago?.status === 'pending' && MEDIOS_EN_EFECTIVO.includes(pago?.payment_method_id))
}

// Solo un link https de MercadoPago: va en un botón de nuestra página.
export function urlDeCupon(valor) {
  try {
    const u = new URL(valor)
    return u.protocol === 'https:' && /(^|\.)mercadopago\.com(\.ar)?$/.test(u.hostname) ? u.href : null
  } catch {
    return null
  }
}

// Lo que ve la pantalla, a partir del pago leído en MercadoPago. null si el
// pago no es de este pedido.
export function cuponDelPago(pago, pedido) {
  if (String(pago?.external_reference ?? '').trim() !== String(pedido.id)) return null
  if (!esCuponSinPagar(pago)) return { efectivo: false }
  return {
    efectivo: true,
    vence_en: vencimientoDeCupon(pago, pedido),
    url_cupon: urlDeCupon(pago.transaction_details?.external_resource_url),
  }
}

// Sin respuesta de MercadoPago: lo que guardó el webhook (sin la URL).
export function cuponDelPedido(pedido) {
  return esPagoEnEfectivoPendiente(pedido)
    ? { efectivo: true, vence_en: pedido.efectivo_vence_en, url_cupon: null }
    : { efectivo: false }
}
