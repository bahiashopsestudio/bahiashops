// ¿Esta persona puede volver a abrir el pago de este pedido?
//
// Es una función pura, como validarPago.js: la ruta (/api/pedidos/[id]/pagar)
// hace las lecturas y le pasa las filas. Así la regla se puede probar entera sin
// levantar nada. Todo se decide en el servidor: el botón "Pagar" de Mis pedidos
// es solo una comodidad, y el link nunca se arma en el navegador.
//
// Recibe:
//   pedido    { comprador_id, estado, cancelado_motivo, vence_en, mp_payment_id,
//               link_de_pago, mp_user_id_cobro } o null
//   vendedor  { bloqueado, estado_validacion } de la tienda del pedido, o null
//   cuentaMp  { mp_user_id } de la cuenta de MercadoPago que la tienda tiene
//             conectada HOY, o null si no tiene ninguna
//   usuarioId el id de quien lo pide (sale de la sesión, nunca del cuerpo)
//
// Devuelve { ok: true, url } o { ok: false, status, codigo, error }. El error
// es el texto para la persona.

import { pedidoTienePago } from '@/lib/vencimientoPago'
import { ESTADO_PUBLICADO } from '@/lib/vendedoresPublicos'

function rechazo(status, codigo, error) {
  return { ok: false, status, codigo, error }
}

// Un id de cuenta guardado como texto puede haber quedado "null" o "undefined":
// es lo mismo que no tenerlo (como en validarPago.js).
function idOVacio(valor) {
  const t = valor === null || valor === undefined ? '' : String(valor).trim()
  return t === 'undefined' || t === 'null' ? '' : t
}

export function evaluarPagoDePedido({ pedido, vendedor, cuentaMp, usuarioId, ahoraMs = Date.now() }) {
  // Un pedido ajeno se responde igual que uno que no existe: que el mensaje no
  // sirva para averiguar qué pedidos hay.
  if (!pedido || !usuarioId || String(pedido.comprador_id) !== String(usuarioId)) {
    return rechazo(404, 'NO_EXISTE', 'No encontramos ese pedido.')
  }

  if (pedido.estado === 'cancelado' && pedido.cancelado_motivo === 'pago_vencido') {
    return rechazo(410, 'VENCIDO', 'El link de pago venció y el pedido no se cobró. Si todavía querés estos productos, hacé el pedido de nuevo.')
  }
  if (pedido.estado === 'cancelado' && pedido.cancelado_motivo === 'cuenta_mp_cambiada') {
    return rechazo(410, 'CUENTA_CAMBIADA', 'La tienda cambió su cuenta de cobro y este pedido se canceló sin cobrarse. Si todavía querés estos productos, hacé el pedido de nuevo.')
  }
  if (pedido.estado !== 'pendiente') {
    return rechazo(409, 'NO_PAGABLE', 'Este pedido ya no está esperando el pago.')
  }

  // Mismo criterio que privado.cancelar_pedidos_vencidos (migración 022).
  if (pedidoTienePago(pedido)) {
    return rechazo(409, 'PAGO_EN_PROCESO', 'Este pedido ya tiene un pago en proceso. Apenas se acredite te avisamos por mail.')
  }

  // Un pedido viejo, de antes del vencimiento, no tiene fecha: los resuelve la
  // regularización, y mientras tanto no se abre.
  if (!pedido.vence_en) {
    return rechazo(409, 'SIN_VENCIMIENTO', 'Este pedido no se puede pagar desde acá. Hacé el pedido de nuevo.')
  }
  const vence = Date.parse(pedido.vence_en)
  if (!Number.isFinite(vence) || ahoraMs >= vence) {
    return rechazo(410, 'VENCIDO', 'El link de pago venció y el pedido no se cobró. Si todavía querés estos productos, hacé el pedido de nuevo.')
  }

  // La misma regla que /api/pedidos/crear y /api/envio/cotizar: tienda
  // inexistente, bloqueada o sin aprobar es "no disponible". (La pausa de la
  // tienda se suma acá cuando exista.)
  if (!vendedor || vendedor.bloqueado || vendedor.estado_validacion !== ESTADO_PUBLICADO) {
    return rechazo(409, 'TIENDA_NO_DISPONIBLE', 'Esta tienda no está disponible por ahora, así que no se puede pagar este pedido.')
  }

  // La cuenta que cobra. El link de un pedido cobra para la cuenta con la que se
  // creó: si la tienda la cambió o la desconectó, ese link va a una cuenta que ya
  // no es la de la tienda, y un pago ahí no se podría verificar. Se compara lo
  // que el pedido guardó (qué cuenta lo cobra) con la cuenta conectada hoy; un
  // pedido que no guardó ese dato no se ofrece.
  const cuentaDelPedido = idOVacio(pedido.mp_user_id_cobro)
  if (!cuentaDelPedido) {
    return rechazo(409, 'SIN_CUENTA_DE_COBRO', 'Este pedido no se puede pagar desde acá. Hacé el pedido de nuevo.')
  }
  const cuentaActual = idOVacio(cuentaMp?.mp_user_id)
  if (!cuentaActual) {
    return rechazo(409, 'TIENDA_SIN_MP', 'La tienda no tiene MercadoPago conectado por ahora, así que no se puede pagar este pedido.')
  }
  if (cuentaDelPedido !== cuentaActual) {
    return rechazo(409, 'CUENTA_CAMBIADA', 'La tienda cambió su cuenta de cobro y este link ya no sirve. Hacé el pedido de nuevo.')
  }

  const url = typeof pedido.link_de_pago === 'string' ? pedido.link_de_pago.trim() : ''
  if (!url.startsWith('https://')) {
    return rechazo(409, 'SIN_LINK', 'Este pedido no tiene un link de pago guardado. Hacé el pedido de nuevo.')
  }

  return { ok: true, url }
}
