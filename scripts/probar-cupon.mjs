// Prueba lo que decide la pantalla a la que se vuelve de MercadoPago
// (/compra/pendiente): si el pago es un cupón en efectivo sin pagar, hasta
// cuándo vale y qué URL del cupón se muestra. Son funciones puras
// (src/lib/cuponEfectivo.js): no toca MercadoPago ni la base.
//
//   npm run probar:cupon

import { readFileSync } from 'node:fs'
import { esCuponSinPagar, urlDeCupon, cuponDelPago, cuponDelPedido } from '../src/lib/cuponEfectivo.js'

let fallas = 0
const ok = (c, m) => { if (!c) { fallas++; console.log('  ✗ FALLA:', m) } else console.log('  ✓', m) }

const pedido = { id: 34, estado: 'pendiente', creado_en: '2026-10-10T10:54:16Z', mp_payment_id: null, efectivo_vence_en: null }
const URL_MP = 'https://www.mercadopago.com.ar/payments/183423584028/ticket?caller_id=1&hash=abc'
const pago = (extra) => ({
  id: 183423584028, status: 'pending', status_detail: 'pending_waiting_payment',
  payment_type_id: 'ticket', payment_method_id: 'rapipago', external_reference: '34',
  date_of_expiration: '2026-10-13T22:59:59.000-04:00',
  transaction_details: { external_resource_url: URL_MP },
  ...extra,
})

console.log('1. Qué es un cupón en efectivo sin pagar')
ok(esCuponSinPagar(pago()), 'Rapipago pendiente (ticket)')
ok(esCuponSinPagar(pago({ payment_method_id: 'pagofacil' })), 'Pago Fácil pendiente (ticket)')
ok(esCuponSinPagar(pago({ payment_type_id: 'atm' })), 'atm pendiente (lo mismo que mira el webhook)')
ok(esCuponSinPagar(pago({ payment_type_id: 'otro_tipo' })), 'rapipago por nombre aunque cambie el tipo')
ok(!esCuponSinPagar(pago({ payment_type_id: 'credit_card', payment_method_id: 'visa' })), 'una tarjeta pendiente no')
ok(!esCuponSinPagar(pago({ payment_type_id: 'bank_transfer', payment_method_id: 'cvu' })), 'una transferencia pendiente no')
ok(!esCuponSinPagar(pago({ status: 'approved' })), 'un cupón ya pagado no')
ok(!esCuponSinPagar(null), 'sin pago: no')

console.log('\n2. La URL del cupón: solo https de MercadoPago')
ok(urlDeCupon(URL_MP) === URL_MP, 'www.mercadopago.com.ar')
ok(urlDeCupon('https://mercadopago.com/x') === 'https://mercadopago.com/x', 'mercadopago.com')
ok(urlDeCupon('http://www.mercadopago.com.ar/x') === null, 'http no')
ok(urlDeCupon('https://mercadopago.com.ar.malo.com/x') === null, 'un dominio que solo empieza igual no')
ok(urlDeCupon('https://otro.com/mercadopago.com.ar') === null, 'otro dominio no')
ok(urlDeCupon('javascript:alert(1)') === null, 'javascript: no')
ok(urlDeCupon(undefined) === null && urlDeCupon('') === null, 'sin URL: null')

console.log('\n3. Lo que ve la pantalla, con el pago de MercadoPago')
const r = cuponDelPago(pago(), pedido)
ok(r?.efectivo === true, 'cupón: efectivo')
ok(r?.vence_en === '2026-10-14T02:59:59.000Z', `vence según el pago (${r?.vence_en})`)
ok(r?.url_cupon === URL_MP, 'con la URL del cupón')
ok(cuponDelPago(pago({ external_reference: '35' }), pedido) === null, 'un pago de OTRO pedido: null')
ok(cuponDelPago(pago({ external_reference: undefined }), pedido) === null, 'un pago sin referencia: null')
ok(cuponDelPago(pago({ payment_type_id: 'credit_card', payment_method_id: 'visa' }), pedido)?.efectivo === false, 'una tarjeta pendiente: pantalla genérica')
ok(cuponDelPago(pago({ transaction_details: { external_resource_url: 'https://otro.com' } }), pedido)?.url_cupon === null, 'URL ajena: sin botón')
const sinFecha = cuponDelPago(pago({ date_of_expiration: undefined }), pedido)
ok(sinFecha?.efectivo && sinFecha.vence_en === '2026-10-14T02:59:59.000Z', `sin date_of_expiration: fin del día argentino, 3 días después (${sinFecha?.vence_en})`)

console.log('\n4. Sin respuesta de MercadoPago: lo que guardó el webhook')
ok(cuponDelPedido({ ...pedido, mp_payment_id: '183423584028', efectivo_vence_en: '2026-10-14T02:59:59+00:00' }).efectivo === true, 'pendiente con pago y cupón: efectivo (sin URL)')
ok(cuponDelPedido({ ...pedido, mp_payment_id: '183423584028', efectivo_vence_en: '2026-10-14T02:59:59+00:00' }).url_cupon === null, 'sin URL del cupón')
ok(cuponDelPedido(pedido).efectivo === false, 'sin pago: pantalla genérica')
ok(cuponDelPedido({ ...pedido, mp_payment_id: '1' }).efectivo === false, 'pago sin cupón: pantalla genérica')

// La ruta y la pantalla son de Next: se lee el código, no se importa.
console.log('\n5. La ruta y la pantalla')
const ruta = readFileSync(new URL('../src/app/api/pedidos/[id]/cupon/route.js', import.meta.url), 'utf8')
ok(/String\(pedido\.comprador_id\) !== String\(user\.id\)/.test(ruta), 'la ruta responde solo a quien compró')
ok(!/\.(update|insert|delete|upsert)\(/.test(ruta), 'la ruta no escribe nada')
const pantalla = readFileSync(new URL('../src/app/compra/pendiente/page.jsx', import.meta.url), 'utf8')
ok(pantalla.includes('Pago en efectivo pendiente') && pantalla.includes('Ver cupón de pago'), 'la pantalla tiene el título y el botón')
ok(pantalla.includes('Si no se paga antes del vencimiento, el pedido se cancela automáticamente.'), 'la pantalla tiene la aclaración')
ok(pantalla.includes('rel="noopener noreferrer"'), 'el cupón se abre en otra pestaña sin acceso a la nuestra')

console.log(fallas === 0 ? '\nTODO OK' : `\n${fallas} FALLAS`)
process.exit(fallas ? 1 : 0)
