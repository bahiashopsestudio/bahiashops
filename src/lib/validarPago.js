// ¿Este pago de MercadoPago corresponde a este pedido?
//
// Es una función pura, como precioPedido.js y contactoComprador.js: el
// webhook hace las lecturas y le pasa las filas. Así la regla se puede probar
// entera sin levantar nada.
//
// Por qué existe: el webhook toma el número de pedido del external_reference
// del pago. Ese campo lo pone quien arma el cobro, así que un vendedor con su
// cuenta de MercadoPago conectada podía cobrarse $1 a sí mismo con el número
// de un pedido ajeno (son correlativos) y dejarlo como pagado. Acá se
// comprueba que el pago lo cobró el vendedor de ESE pedido, por ESE monto.
//
// Todo lo que viene de `pago` tiene que salir de la API de MercadoPago
// (GET /v1/payments/:id), nunca del cuerpo del aviso.
//
// Recibe:
//   pago               la respuesta de la API
//   pedido             { id, vendedor_id, total, estado, mp_payment_id } o null
//   cuentaMp           la fila de mercadopago_cuentas del vendedor del pedido
//                      ({ vendedor_id, mp_user_id }) o null
//   idVendedorDelToken el vendedor_id de la fila cuyo token consultó el pago
//
// Devuelve { ok: true } o { ok: false, motivo }.

import { ESTADOS_DE_PAGO, ESTADO_REEMBOLSADO } from '@/lib/pedidos'

// Estados de MercadoPago que dicen que la plata volvió al comprador, con la
// palabra que va al log. Bahía Shops no ejecuta reembolsos: sólo refleja los
// que hace el vendedor o MercadoPago.
export const DEVOLUCIONES_MP = { refunded: 'reembolso', charged_back: 'contracargo' }

// Estados de MercadoPago que no tocan el pedido, con la frase que va al log.
// in_mediation es un reclamo abierto: la plata todavía no volvió, y si vuelve
// llega después como charged_back o refunded.
export const SIN_CAMBIOS_MP = { in_mediation: 'reclamo abierto' }

// Los estados en los que un pago nuevo puede reemplazar al que ya tiene el
// pedido. El webhook usa la misma lista en la condición de su escritura.
export const ESTADOS_REEMPLAZABLES = ['pendiente', 'rechazado']

// Los motivos que indican un intento de cobrar un pedido ajeno.
export const MOTIVOS_DE_FRAUDE = ['cobrador distinto', 'token de otro vendedor', 'monto distinto', 'cuenta de MP sin id']

function rechazo(motivo) {
  return { ok: false, motivo }
}

function centavos(valor) {
  if (valor === null || valor === undefined || valor === '') return null
  const n = Number(valor)
  return Number.isFinite(n) ? Math.round(n * 100) : null
}

// Un id guardado como texto puede haber quedado como "undefined" o "null" si
// MercadoPago no lo mandó al conectar: eso es lo mismo que no tenerlo.
function idOVacio(valor) {
  const t = valor === null || valor === undefined ? '' : String(valor).trim()
  return t === 'undefined' || t === 'null' ? '' : t
}

// El estado del pedido que corresponde al estado del pago en MercadoPago.
// refunded y charged_back van a 'reembolsado': nunca vuelven a 'pendiente'.
export function estadoDelPedido(statusMp) {
  if (statusMp === 'approved') return 'pagado'
  if (statusMp === 'rejected' || statusMp === 'cancelled') return 'rechazado'
  if (DEVOLUCIONES_MP[statusMp]) return ESTADO_REEMBOLSADO
  return 'pendiente'
}

export function validarPago(pago, pedido, cuentaMp, idVendedorDelToken) {
  // 1. El número de pedido: un entero positivo, y el pedido existe.
  const referencia = idOVacio(pago?.external_reference)
  if (!/^[1-9]\d*$/.test(referencia)) return rechazo('external_reference inválido')
  if (!pedido || String(pedido.id) !== referencia) return rechazo('pedido inexistente')

  // 2. Lo cobró el vendedor de ese pedido.
  if (!cuentaMp || String(cuentaMp.vendedor_id) !== String(pedido.vendedor_id) || !idOVacio(cuentaMp.mp_user_id)) {
    return rechazo('cuenta de MP sin id')
  }
  if (String(idVendedorDelToken) !== String(pedido.vendedor_id)) return rechazo('token de otro vendedor')
  if (!idOVacio(pago.collector_id) || idOVacio(pago.collector_id) !== idOVacio(cuentaMp.mp_user_id)) {
    return rechazo('cobrador distinto')
  }

  // 3. En pesos y por el total del pedido, con un centavo de tolerancia.
  if (pago.currency_id !== 'ARS') return rechazo('moneda distinta')
  const cobrado = centavos(pago.transaction_amount)
  const esperado = centavos(pedido.total)
  if (cobrado === null || esperado === null || Math.abs(cobrado - esperado) > 1) return rechazo('monto distinto')

  // Estados del pago que no cambian el pedido (un reclamo abierto): pasan
  // desde cualquier estado, y el webhook sólo los deja en el log.
  if (SIN_CAMBIOS_MP[pago.status]) return { ok: true }

  // Devolución (reembolso o contracargo): vale desde cualquier estado, pero
  // sólo si es el pago guardado en el pedido. La de otro pago no toca nada.
  if (DEVOLUCIONES_MP[pago.status]) {
    const pagoGuardadoDevuelto = idOVacio(pedido.mp_payment_id)
    if (!pagoGuardadoDevuelto || pagoGuardadoDevuelto !== idOVacio(pago.id)) return rechazo('devolución de otro pago')
    return { ok: true }
  }

  // 4. El pedido todavía está en un estado de cobro.
  if (!ESTADOS_DE_PAGO.includes(pedido.estado)) return rechazo('estado no admite pago')

  // 5. Un pedido no se paga dos veces. Si ya está pagado (o más adelante) con
  // otro pago, no se toca: un pago aprobado nunca se pisa, y el aviso tardío
  // de un intento viejo se ignora. Si está pendiente o rechazado, el pago nuevo
  // reemplaza al anterior: es la persona reintentando después de un rechazo o
  // de un pago en efectivo que nunca completó. El mismo pago otra vez es un
  // reintento normal de MercadoPago.
  const pagoGuardado = idOVacio(pedido.mp_payment_id)
  const esOtroPago = pagoGuardado && pagoGuardado !== idOVacio(pago.id)
  if (esOtroPago && !ESTADOS_REEMPLAZABLES.includes(pedido.estado)) return rechazo('ya tenía otro pago')

  return { ok: true }
}
