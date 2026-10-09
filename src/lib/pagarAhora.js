// «Pagar ahora»: quien generó un cupón en efectivo (Rapipago, Pago Fácil) y
// prefiere pagar con tarjeta o dinero en cuenta, pide un link de pago NUEVO para
// el mismo pedido. Cada vez que aprieta el botón se arma una preferencia nueva:
// los mismos productos, el mismo total, 2 horas de duración y nunca más allá del
// vencimiento del cupón. Sin medios en efectivo: no se puede generar un segundo
// cupón por el mismo pedido.
//
// Son funciones puras, como validarPago.js: la ruta (/api/pedidos/[id]/pagar-ahora)
// hace las lecturas y le pasa las filas. Todo se decide en el servidor: el
// botón de Mis pedidos es solo una comodidad, y el link nunca se arma en el
// navegador.

import { pedidoTienePago, pagableHasta, vencimientoDeLinkNuevo } from '@/lib/vencimientoPago'
import { camposDeVencimiento, SIN_MEDIOS_EN_EFECTIVO } from '@/lib/mercadopago/preferencias'
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

// ¿Se puede pedir un link nuevo para este pedido?
//
//   pedido    { comprador_id, estado, cancelado_motivo, mp_payment_id,
//               efectivo_vence_en, mp_user_id_cobro }  o null
//   vendedor  { bloqueado, estado_validacion } de la tienda del pedido, o null
//   cuentaMp  { mp_user_id } de la cuenta de MercadoPago conectada HOY, o null
//   usuarioId quien lo pide (sale de la sesión, nunca del cuerpo)
//
// Devuelve { ok: true, venceLinkMs } o { ok: false, status, codigo, error }.
export function evaluarPagarAhora({ pedido, vendedor, cuentaMp, usuarioId, ahoraMs = Date.now() }) {
  // Un pedido ajeno se responde igual que uno que no existe: que el mensaje no
  // sirva para averiguar qué pedidos hay.
  if (!pedido || !usuarioId || String(pedido.comprador_id) !== String(usuarioId)) {
    return rechazo(404, 'NO_EXISTE', 'No encontramos ese pedido.')
  }

  if (pedido.estado === 'cancelado' && pedido.cancelado_motivo === 'pago_vencido') {
    return rechazo(410, 'VENCIDO', 'El cupón venció y el pedido no se cobró. Si todavía querés estos productos, hacé el pedido de nuevo.')
  }
  if (pedido.estado !== 'pendiente') {
    return rechazo(409, 'NO_PAGABLE', 'Este pedido ya no está esperando el pago.')
  }

  // Solo se ofrece sobre un pedido con un cupón generado: sin cupón, el pedido
  // no es una venta todavía.
  if (!pedidoTienePago(pedido) || !pedido.efectivo_vence_en) {
    return rechazo(409, 'SIN_CUPON', 'Este pedido no tiene un pago en efectivo pendiente.')
  }
  if (!pagableHasta(pedido, ahoraMs)) {
    return rechazo(410, 'VENCIDO', 'El cupón venció y el pedido no se cobró. Si todavía querés estos productos, hacé el pedido de nuevo.')
  }

  // La misma regla que /api/pedidos/crear y /api/envio/cotizar: tienda
  // inexistente, bloqueada o sin aprobar es "no disponible".
  if (!vendedor || vendedor.bloqueado || vendedor.estado_validacion !== ESTADO_PUBLICADO) {
    return rechazo(409, 'TIENDA_NO_DISPONIBLE', 'Esta tienda no está disponible por ahora, así que no se puede pagar este pedido.')
  }

  // El cupón cobra para la cuenta con la que se creó el pedido. Un link nuevo
  // cobra para la cuenta que la tienda tiene hoy: si cambió, un pago ahí y el
  // cupón terminarían en cuentas distintas.
  const cuentaActual = idOVacio(cuentaMp?.mp_user_id)
  if (!cuentaActual) {
    return rechazo(409, 'TIENDA_SIN_MP', 'La tienda no tiene MercadoPago conectado por ahora, así que no se puede pagar este pedido.')
  }
  const cuentaDelPedido = idOVacio(pedido.mp_user_id_cobro)
  if (cuentaDelPedido && cuentaDelPedido !== cuentaActual) {
    return rechazo(409, 'CUENTA_CAMBIADA', 'La tienda cambió su cuenta de cobro. Pagá el cupón que ya generaste.')
  }

  return { ok: true, venceLinkMs: vencimientoDeLinkNuevo(pedido, ahoraMs) }
}

function centavos(valor) {
  const n = Number(valor)
  return Number.isFinite(n) ? Math.round(n * 100) : null
}

// El cuerpo de la preferencia nueva. Sale de la foto del pedido (pedido_items y
// los montos guardados), no de ningún dato del navegador. Devuelve
// { ok: true, cuerpo } o { ok: false, motivo }: si los productos más el envío no
// dan el total del pedido, no se arma nada, porque el pago se rechazaría al
// verificarlo.
//
//   pedido    { id, total, costo_envio, comision_plataforma, efectivo_vence_en,
//               comprador_nombre, comprador_apellido, comprador_telefono }
//   items     [{ producto_id, nombre, variante, precio, cantidad, foto_url }]
//   emailComprador  el mail de la sesión
export function armarPreferenciaNueva({ pedido, items, emailComprador, sitioUrl, notificationUrl, venceLinkMs, ahoraMs = Date.now() }) {
  const mpItems = (items || []).map((it) => {
    const mpItem = {
      id: String(it.producto_id ?? it.id),
      title: it.nombre + (it.variante ? ` (${it.variante})` : ''),
      description: it.nombre,
      quantity: it.cantidad,
      unit_price: Number(it.precio),
      currency_id: 'ARS',
      category_id: 'others',
    }
    if (it.foto_url) mpItem.picture_url = it.foto_url
    return mpItem
  })
  if (Number(pedido.costo_envio) > 0) {
    mpItems.push({ title: 'Envío', quantity: 1, unit_price: Number(pedido.costo_envio), currency_id: 'ARS', category_id: 'others' })
  }
  if (mpItems.length === 0) return { ok: false, motivo: 'sin productos' }

  const suma = mpItems.reduce((acc, it) => acc + centavos(it.unit_price) * it.quantity, 0)
  if (!Number.isFinite(suma) || suma !== centavos(pedido.total)) return { ok: false, motivo: 'los productos no suman el total' }

  const payer = { email: emailComprador }
  if (pedido.comprador_nombre) payer.name = pedido.comprador_nombre
  if (pedido.comprador_apellido) payer.surname = pedido.comprador_apellido
  if (pedido.comprador_telefono) payer.phone = { number: pedido.comprador_telefono }

  const venceCuponMs = Date.parse(pedido.efectivo_vence_en)

  return {
    ok: true,
    cuerpo: {
      items: mpItems,
      payer,
      marketplace_fee: Number(pedido.comision_plataforma) || 0,
      statement_descriptor: 'BAHIASHOPS',
      back_urls: {
        success: `${sitioUrl}/compra/exito?pedido=${pedido.id}`,
        failure: `${sitioUrl}/compra/fallo?pedido=${pedido.id}`,
        pending: `${sitioUrl}/compra/pendiente?pedido=${pedido.id}`,
      },
      auto_return: 'approved',
      notification_url: notificationUrl,
      external_reference: String(pedido.id),
      payment_methods: SIN_MEDIOS_EN_EFECTIVO,
      ...camposDeVencimiento(venceLinkMs, venceCuponMs, ahoraMs),
    },
  }
}
