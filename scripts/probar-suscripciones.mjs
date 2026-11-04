// Prueba de las reglas de las suscripciones del plan (src/lib/suscripciones.js)
// y de la firma del webhook (src/lib/mercadopago/firma.js). Sin base ni red.
//
//   npm run probar:suscripciones
//
// Los datos de Mercado Pago son los del sondeo con cuentas de prueba
// (04/11/2026): una suscripción autorizada, su cobro y su pago.

import crypto from 'node:crypto'
import {
  accionDeLaTienda, cuerpoDeAlta, datosDeCobro, datosDePagoDeSuscripcion, datosDeSuscripcion, diferenciaProporcional,
  emailValido, mensajeDeAltaRechazada, MAIL_DE_LA_PLATAFORMA, pendienteAbandonada, problemaDeSuscripcion, reusarPendiente, suscripcionesHabilitadas, tipoDePagoDePlataforma,
} from '../src/lib/suscripciones.js'
import { manifiesto, verificarFirma, firmaEstricta } from '../src/lib/mercadopago/firma.js'

let fallas = 0
const ok = (cond, msg) => { if (!cond) { fallas++; console.log('  ✗ FALLA:', msg) } else console.log('  ✓', msg) }

const SUSCRIPCION = {
  id: '1c0ec0b0f39d4206b934465bbb1a9816', payer_email: '', collector_id: 3738474446, status: 'authorized',
  external_reference: 'bs-sus-abc', init_point: 'https://www.mercadopago.com.ar/subscriptions/checkout?preapproval_id=1c0e',
  auto_recurring: { frequency: 1, frequency_type: 'months', transaction_amount: 1000, currency_id: 'ARS' },
  summarized: { charged_quantity: 1, last_charged_date: '2026-11-04T12:26:59.000-04:00', last_charged_amount: 1000 },
  next_payment_date: '2026-12-04T12:26:58.000-04:00',
}
const COBRO = {
  preapproval_id: '1c0ec0b0f39d4206b934465bbb1a9816', id: 7033599542, type: 'recurring', status: 'processed',
  transaction_amount: 1000, currency_id: 'ARS', external_reference: 'bs-sus-abc',
  payment: { id: 186679190341, status: 'approved', status_detail: 'accredited' }, debit_date: '2026-11-04T12:26:58.000-04:00',
}
const PAGO = {
  id: 186679190341, status: 'approved', transaction_amount: 1000, currency_id: 'ARS', date_approved: '2026-11-04T12:26:59.000-04:00',
  collector_id: 3738474446, external_reference: 'bs-sus-abc',
  point_of_interaction: { type: 'SUBSCRIPTIONS', transaction_data: { subscription_id: '1c0ec0b0f39d4206b934465bbb1a9816' } },
}

console.log('1. Habilitadas por tienda')
ok(!suscripcionesHabilitadas(15, {}), 'sin SUSCRIPCIONES_TIENDAS: ninguna')
ok(suscripcionesHabilitadas(15, { SUSCRIPCIONES_TIENDAS: '15' }) && !suscripcionesHabilitadas(16, { SUSCRIPCIONES_TIENDAS: '15' }), '"15": solo la 15')
ok(suscripcionesHabilitadas(16, { SUSCRIPCIONES_TIENDAS: ' 15, 16 ' }), 'una lista con espacios')
ok(suscripcionesHabilitadas(99, { SUSCRIPCIONES_TIENDAS: 'todas' }), '"todas": todas')

console.log('\n2. Lo que manda y lo que lee de Mercado Pago')
const alta = cuerpoDeAlta({ monto: 10000, email: 'a@b.com', referencia: 'bs-sus-x', backUrl: 'https://bahiashops.com.ar/vendedor/perfil?suscripcion=volvio', motivo: 'Bahía Shops · plan Básico' })
ok(alta.status === 'pending' && alta.auto_recurring.frequency === 1 && alta.auto_recurring.frequency_type === 'months'
  && alta.auto_recurring.currency_id === 'ARS' && alta.auto_recurring.transaction_amount === 10000 && !('start_date' in alta.auto_recurring),
  'el alta: pendiente, mensual, en pesos, sin fecha de inicio (cobra al autorizar)')
let d = datosDeSuscripcion(SUSCRIPCION)
ok(d.estado === 'authorized' && d.monto === 1000 && d.proximo_cobro_en === '2026-12-04T16:26:58.000Z', 'la suscripción: estado, monto y próximo cobro (en UTC)')
d = datosDeCobro(COBRO)
ok(d.mp_cobro_id === '7033599542' && d.mp_pago_id === '186679190341' && d.estado_cobro === 'processed' && d.estado_pago === 'approved'
  && d.monto === 1000 && d.cobrado_en === '2026-11-04T16:26:58.000Z' && d.preapproval_id === COBRO.preapproval_id,
  'el cobro: ids como texto, estados, monto, fecha del débito y su suscripción')
d = datosDePagoDeSuscripcion(PAGO)
ok(d.mp_cobro_id === null && d.mp_pago_id === '186679190341' && d.cobrado_en === '2026-11-04T16:26:59.000Z' && d.preapproval_id === COBRO.preapproval_id,
  'el pago: su id, la fecha de aprobación y la suscripción (point_of_interaction)')
ok(tipoDePagoDePlataforma(PAGO) === 'suscripcion' && tipoDePagoDePlataforma({ external_reference: 'bs-dif-1' }) === 'diferencia'
  && tipoDePagoDePlataforma({ external_reference: '34' }) === null, 'de quién es un pago: bs-sus-, bs-dif- o una venta')

console.log('\n3. ¿Es nuestra?')
ok(problemaDeSuscripcion(SUSCRIPCION, { external_reference: 'bs-sus-abc' }, '3738474446') === null, 'la plataforma y nuestra referencia: sí')
ok(problemaDeSuscripcion(SUSCRIPCION, { external_reference: 'bs-sus-abc' }, '999') === 'otro_cobrador', 'otro cobrador: no')
ok(problemaDeSuscripcion(SUSCRIPCION, { external_reference: 'bs-sus-otra' }, '3738474446') === 'otra_referencia', 'otra referencia: no')
ok(problemaDeSuscripcion({ ...SUSCRIPCION, auto_recurring: { currency_id: 'USD' } }, null, null) === 'otra_moneda', 'otra moneda: no')

console.log('\n4. La diferencia proporcional')
// Ciclo del 4/11 al 4/12: 30 días.
let c = diferenciaProporcional({ precioNuevo: 20000, montoActual: 10000, proximoCobro: '2026-12-04T15:00:00Z', ahoraMs: Date.parse('2026-11-19T15:00:00Z') })
ok(c.diasCiclo === 30 && c.diasRestantes === 15 && c.monto === 5000, 'a mitad de un ciclo de 30 días: la mitad de la diferencia ($5.000)')
c = diferenciaProporcional({ precioNuevo: 20000, montoActual: 10000, proximoCobro: '2026-12-04T15:00:00Z', ahoraMs: Date.parse('2026-12-03T20:00:00Z') })
ok(c.diasRestantes === 1 && c.monto === 333, 'el último día: un día, redondeado a pesos ($333)')
c = diferenciaProporcional({ precioNuevo: 15000, montoActual: 10000, proximoCobro: '2026-03-31T15:00:00Z', ahoraMs: Date.parse('2026-03-01T15:00:00Z') })
ok(c.diasCiclo === 31 && c.diasRestantes === 30, 'ciclo que arranca a fin de febrero (28/2 al 31/3): 31 días, como interval 1 month')
c = diferenciaProporcional({ precioNuevo: 20000, montoActual: 10000, proximoCobro: '2026-12-04T15:00:00Z', ahoraMs: Date.parse('2026-10-01T15:00:00Z') })
ok(c.diasRestantes === c.diasCiclo && c.monto === 10000, 'nunca más que un ciclo entero')
ok(diferenciaProporcional({ precioNuevo: 10000, montoActual: 10000, proximoCobro: '2026-12-04' }) === null, 'sin aumento: null')
ok(diferenciaProporcional({ precioNuevo: 20000, montoActual: 10000, proximoCobro: null }) === null, 'sin próximo cobro: null')

console.log('\n5. Qué puede hacer la tienda')
const viva = (extra = {}) => ({ estado: 'authorized', monto: 10000, ...extra })
let a = accionDeLaTienda({ plan: { origen: 'gratis', especial_pendiente: null }, suscripcionViva: null, precioBasico: 10000 })
ok(a?.tipo === 'suscribirse' && a.monto === 10000 && a.plan === 'basico', 'en el Gratis: suscribirse al Básico')
a = accionDeLaTienda({ plan: { origen: 'gratis', especial_pendiente: null }, suscripcionViva: viva(), precioBasico: 10000 })
ok(a === null, 'autorizada pero el cobro todavía no llegó: nada (no se suscribe dos veces)')
a = accionDeLaTienda({ plan: { origen: 'gratis', especial_pendiente: null }, suscripcionViva: viva({ estado: 'pending' }), precioBasico: 10000 })
ok(a?.tipo === 'suscribirse', 'esperando el pago: puede volver a intentar')
a = accionDeLaTienda({ plan: { origen: 'gratis', especial_pendiente: { plan: 'basico', precio: 20000 } }, suscripcionViva: null, precioBasico: 10000 })
ok(a?.tipo === 'suscribirse' && a.monto === 20000, 'plan a medida sin suscripción: se suscribe directo por su precio')
a = accionDeLaTienda({ plan: { origen: 'suscripcion', especial_pendiente: { plan: 'basico', precio: 20000 } }, suscripcionViva: viva(), precioBasico: 10000 })
ok(a?.tipo === 'diferencia' && a.precioNuevo === 20000 && a.montoActual === 10000, 'plan a medida con el Básico pagado: la diferencia')
a = accionDeLaTienda({ plan: { origen: 'suscripcion', especial_pendiente: { plan: 'basico', precio: 20000 } }, suscripcionViva: viva({ monto: 20000 }), precioBasico: 10000 })
ok(a === null, 'con el monto ya cambiado (esperando el cobro): nada')
a = accionDeLaTienda({ plan: { origen: 'suscripcion', especial_pendiente: null }, suscripcionViva: viva(), precioBasico: 10000 })
ok(a === null, 'en el Básico al día: nada')
a = accionDeLaTienda({ plan: { origen: 'especial', especial_pendiente: null }, suscripcionViva: null, precioBasico: 10000 })
ok(a === null, 'condición especial que vale (por ejemplo, de $0): nada')

console.log('\n6. Pendientes')
const ahora = Date.parse('2026-11-10T12:00:00Z')
ok(reusarPendiente({ estado: 'pending', init_point: 'x', monto: 10000, creada_en: '2026-11-10T01:00:00Z' }, 10000, ahora), 'una de hoy por el mismo monto: se reusa')
ok(!reusarPendiente({ estado: 'pending', init_point: 'x', monto: 10000, creada_en: '2026-11-08T01:00:00Z' }, 10000, ahora), 'una de anteayer: no')
ok(!reusarPendiente({ estado: 'pending', init_point: 'x', monto: 10000, creada_en: '2026-11-10T01:00:00Z' }, 20000, ahora), 'otro monto: no')
ok(pendienteAbandonada({ estado: 'pending', creada_en: '2026-11-02T00:00:00Z' }, ahora), 'esperando el pago hace 8 días: se cancela')
ok(!pendienteAbandonada({ estado: 'pending', creada_en: '2026-11-05T00:00:00Z' }, ahora), 'hace 5 días: todavía no')
ok(!pendienteAbandonada({ estado: 'authorized', creada_en: '2026-01-01T00:00:00Z' }, ahora), 'una activa: nunca')
ok(emailValido(' a@b.com ') === 'a@b.com' && emailValido('sin-arroba') === null, 'el mail: recortado, y con arroba')

console.log('\n6b. El mensaje cuando Mercado Pago no acepta el alta')
ok(mensajeDeAltaRechazada({ status: 400, email: 'Cobra@Bahia.com', mailPlataforma: 'cobra@bahia.com' }) === MAIL_DE_LA_PLATAFORMA,
  'el mail de la cuenta que cobra: lo dice (sin importar mayúsculas)')
ok(/mail con el que entrás a tu cuenta de Mercado Pago/.test(mensajeDeAltaRechazada({ status: 400, email: 'a@b.com', mailPlataforma: 'c@d.com' })),
  'un 400: qué mail tiene que ser')
ok(/no respondió/.test(mensajeDeAltaRechazada({ status: 0, email: 'a@b.com' })), 'sin respuesta: probá de nuevo')

console.log('\n7. La firma del webhook')
const secreto = 'clave-de-prueba'
const firmar = (texto) => crypto.createHmac('sha256', secreto).update(texto).digest('hex')
const ts = '1704908010'
ok(manifiesto({ dataId: 'ABC123', xRequestId: 'req-1', ts }) === 'id:abc123;request-id:req-1;ts:1704908010;', 'el texto: el id en minúsculas')
ok(manifiesto({ dataId: null, xRequestId: 'req-1', ts }) === 'request-id:req-1;ts:1704908010;', 'sin id: esa parte se saca entera')
let f = verificarFirma({ xSignature: `ts=${ts},v1=${firmar('id:abc123;request-id:req-1;ts:1704908010;')}`, xRequestId: 'req-1', dataId: 'ABC123', secreto })
ok(f.valida, 'un id con letras firmado en minúsculas: válida')
f = verificarFirma({ xSignature: `ts=${ts},v1=${firmar('id:186679190341;request-id:req-1;ts:1704908010;')}`, xRequestId: 'req-1', dataId: 186679190341, secreto })
ok(f.valida, 'un id numérico: válida')
f = verificarFirma({ xSignature: `ts=${ts}, v1=${firmar('id:1;request-id:req-1;ts:1704908010;')}`, xRequestId: 'req-1', dataId: '2', secreto })
ok(!f.valida && f.motivo === 'no_coincide', 'otro id: no coincide')
f = verificarFirma({ xSignature: `ts=${ts},v1=abc`, xRequestId: 'req-1', dataId: '1', secreto })
ok(!f.valida && f.motivo === 'no_coincide', 'una firma de otro largo: no coincide (sin romper)')
ok(verificarFirma({ xSignature: 'v1=abc', xRequestId: 'r', dataId: '1', secreto }).motivo === 'header_incompleto', 'sin ts: header incompleto')
ok(verificarFirma({ xSignature: null, xRequestId: null, dataId: '1', secreto }).motivo === 'sin_headers', 'sin headers')
ok(verificarFirma({ xSignature: 'ts=1,v1=a', xRequestId: 'r', dataId: '1', secreto: '' }).motivo === 'sin_clave', 'sin clave')
ok(!firmaEstricta({}) && firmaEstricta({ MP_FIRMA_ESTRICTA: '1' }), 'estricta solo con MP_FIRMA_ESTRICTA=1 (si no, observación)')

console.log(fallas === 0 ? '\nTODO OK' : `\n${fallas} FALLAS`)
process.exit(fallas ? 1 : 0)
