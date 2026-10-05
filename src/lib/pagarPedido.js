// ¿Esta persona puede volver a abrir el pago de este pedido?
//
// Es una función pura, como validarPago.js: la ruta (/api/pedidos/[id]/pagar)
// hace las lecturas y le pasa las filas. Así la regla se puede probar entera sin
// levantar nada. Todo se decide en el servidor: el botón "Pagar" de Mis pedidos
// es solo una comodidad, y el link nunca se arma en el navegador.
//
// Recibe:
//   pedido    { comprador_id, estado, cancelado_motivo, vence_en, mp_payment_id,
//               link_de_pago } o null
//   vendedor  { bloqueado, estado_validacion } de la tienda del pedido, o null
//   usuarioId el id de quien lo pide (sale de la sesión, nunca del cuerpo)
//
// Devuelve { ok: true, url } o { ok: false, status, codigo, error }. El error
// es el texto para la persona.

import { pedidoTienePago } from '@/lib/vencimientoPago'
import { ESTADO_PUBLICADO } from '@/lib/vendedoresPublicos'

function rechazo(status, codigo, error) {
  return { ok: false, status, codigo, error }
}

export function evaluarPagoDePedido({ pedido, vendedor, usuarioId, ahoraMs = Date.now() }) {
  // Un pedido ajeno se responde igual que uno que no existe: que el mensaje no
  // sirva para averiguar qué pedidos hay.
  if (!pedido || !usuarioId || String(pedido.comprador_id) !== String(usuarioId)) {
    return rechazo(404, 'NO_EXISTE', 'No encontramos ese pedido.')
  }

  if (pedido.estado === 'cancelado' && pedido.cancelado_motivo === 'pago_vencido') {
    return rechazo(410, 'VENCIDO', 'El link de pago venció y el pedido no se cobró. Si todavía querés estos productos, hacé el pedido de nuevo.')
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

  const url = typeof pedido.link_de_pago === 'string' ? pedido.link_de_pago.trim() : ''
  if (!url.startsWith('https://')) {
    return rechazo(409, 'SIN_LINK', 'Este pedido no tiene un link de pago guardado. Hacé el pedido de nuevo.')
  }

  return { ok: true, url }
}
