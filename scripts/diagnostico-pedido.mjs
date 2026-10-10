// Diagnóstico de UN pedido: por qué el comprador lo ve y la tienda no.
// SOLO LECTURAS: un select en Supabase y un GET del pago en MercadoPago.
// No escribe nada en la base ni en MercadoPago.
//
//   node --env-file=.env.local scripts/diagnostico-pedido.mjs 34
//
// Usa SUPABASE_SERVICE_ROLE_KEY porque es una pregunta de datos (qué tiene
// guardado el pedido), no de permisos. No imprime datos de contacto de quien
// compra ni el token de la tienda.

import { createClient } from '@supabase/supabase-js'
import { pestanaDePedido, esVentaVisible } from '../src/lib/pedidos.js'
import { esPagoEnEfectivoPendiente } from '../src/lib/vencimientoPago.js'

const id = Number(process.argv[2])
if (!Number.isInteger(id) || id <= 0) {
  console.error('Uso: node --env-file=.env.local scripts/diagnostico-pedido.mjs <id del pedido>')
  process.exit(1)
}

const admin = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY)

// Consulta 1: el pedido (sin datos de contacto).
const { data: pedido, error } = await admin
  .from('pedidos')
  .select('id, vendedor_id, estado, total, creado_en, actualizado_en, vence_en, efectivo_vence_en, cancelado_motivo, mp_payment_id, mp_preference_id, mp_user_id_cobro')
  .eq('id', id)
  .maybeSingle()

if (error) { console.error('No se pudo leer el pedido:', error.message); process.exit(1) }
if (!pedido) { console.log(`No existe el pedido ${id}.`); process.exit(0) }

const ahora = Date.now()
console.log('Pedido:', pedido)
console.log('Ahora:', new Date(ahora).toISOString())
console.log('esPagoEnEfectivoPendiente:', esPagoEnEfectivoPendiente(pedido))
console.log('esVentaVisible (Mis pedidos):', esVentaVisible(pedido))
console.log('pestanaDePedido (panel de la tienda):', pestanaDePedido(pedido, ahora))

// Consulta 2: el pago en MercadoPago, con el token de la tienda del pedido.
// Solo GET. Se imprimen campos del pago, nunca el token ni datos de quien paga.
const pagoId = String(pedido.mp_payment_id ?? '').trim()
if (!pagoId || ['null', 'undefined'].includes(pagoId)) {
  console.log('El pedido no tiene mp_payment_id: el webhook nunca guardó un pago.')
  process.exit(0)
}

const { data: cuenta, error: errorCuenta } = await admin
  .from('mercadopago_cuentas')
  .select('access_token')
  .eq('vendedor_id', pedido.vendedor_id)
  .maybeSingle()

if (errorCuenta || !cuenta) {
  console.log('No se pudo leer la cuenta de MP de la tienda:', errorCuenta?.message || 'no hay cuenta conectada')
  process.exit(0)
}

const res = await fetch(`https://api.mercadopago.com/v1/payments/${encodeURIComponent(pagoId)}`, {
  headers: { Authorization: `Bearer ${cuenta.access_token}` },
})
if (!res.ok) {
  console.log(`MercadoPago respondió ${res.status} al leer el pago ${pagoId}.`)
  process.exit(0)
}
const pago = await res.json()
const urlCupon = pago.transaction_details?.external_resource_url
console.log('Pago en MP:', {
  id: pago.id,
  status: pago.status,
  status_detail: pago.status_detail,
  payment_type_id: pago.payment_type_id,
  payment_method_id: pago.payment_method_id,
  date_of_expiration: pago.date_of_expiration,
  external_reference: pago.external_reference,
  tiene_url_del_cupon: !!urlCupon,
  host_url_del_cupon: urlCupon ? new URL(urlCupon).host : null,
})
