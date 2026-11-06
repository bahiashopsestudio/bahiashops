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
  errorDeAltaRechazada, MAIL_RECHAZADO, MP_NO_RESPONDIO, estadoParaPantalla, recienConfirmada, estadoDeCobro, filasDeCobros,
  suscripcionDeLaFicha, pastillaDeLaFicha, seCancelaSola,
  graciaHasta, enGracia, ultimosDiasDeGracia, mailDeCobroQueToca, caidaConMail,
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
ok(suscripcionesHabilitadas(15, {}) && suscripcionesHabilitadas(99, { SUSCRIPCIONES_TIENDAS: '' }), 'sin SUSCRIPCIONES_TIENDAS: todas (F3.2)')
ok(!suscripcionesHabilitadas(15, { SUSCRIPCIONES_TIENDAS: 'ninguna' }) && !suscripcionesHabilitadas(15, { SUSCRIPCIONES_TIENDAS: ' Ninguna ' }), '"ninguna": se cierra para todas')
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
ok(a?.tipo === 'suscribirse' && a.monto === 10000 && a.plan === 'basico' && a.medida === false, 'en el Gratis: suscribirse al Básico')
a = accionDeLaTienda({ plan: { origen: 'gratis', especial_pendiente: null }, suscripcionViva: viva(), precioBasico: 10000 })
ok(a === null, 'autorizada pero el cobro todavía no llegó: nada (no se suscribe dos veces)')
a = accionDeLaTienda({ plan: { origen: 'gratis', especial_pendiente: null }, suscripcionViva: viva({ estado: 'pending' }), precioBasico: 10000 })
ok(a?.tipo === 'suscribirse', 'esperando el pago: puede volver a intentar')
a = accionDeLaTienda({ plan: { origen: 'gratis', especial_pendiente: { plan: 'basico', precio: 20000 } }, suscripcionViva: null, precioBasico: 10000 })
ok(a?.tipo === 'suscribirse' && a.monto === 20000 && a.medida === true, 'plan a medida sin suscripción: se suscribe directo por su precio')
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
ok(mensajeDeAltaRechazada({ status: 400, email: 'a@b.com', mailPlataforma: 'c@d.com' }) === 'Mercado Pago no aceptó ese mail. Revisá que sea el de la cuenta con la que vas a pagar.',
  'un 400: «Mercado Pago no aceptó ese mail…»')
ok(mensajeDeAltaRechazada({ status: 0, email: 'a@b.com' }) === 'Mercado Pago no respondió. Probá de nuevo en unos minutos.', 'sin respuesta: «Mercado Pago no respondió…»')
ok(mensajeDeAltaRechazada({ status: 500, email: 'a@b.com' }) === MP_NO_RESPONDIO && mensajeDeAltaRechazada({ status: 401 }) === MP_NO_RESPONDIO, 'cualquier otro: «no respondió»')
let er = errorDeAltaRechazada({ status: 400, email: 'a@b.com', mailPlataforma: 'c@d.com' })
ok(er.texto === MAIL_RECHAZADO && er.campo === 'email', 'el mail rechazado pinta el campo en rojo')
er = errorDeAltaRechazada({ status: 503, email: 'a@b.com' })
ok(er.texto === MP_NO_RESPONDIO && er.campo === null, 'sin respuesta: el campo no va en rojo')
ok(errorDeAltaRechazada({ status: 400, email: 'X@y.com', mailPlataforma: 'x@Y.com' }).campo === 'email', 'el de la plataforma: también el campo')

console.log('\n6c. Qué muestra «Tu plan» (estadoParaPantalla)')
const basico = { tipo: 'suscribirse', monto: 10000, plan: 'basico', medida: false }
const medida = { tipo: 'suscribirse', monto: 20000, plan: 'basico', medida: true }
const pantalla = (o) => estadoParaPantalla({ ahoraMs: Date.parse('2026-11-10T12:00:00Z'), ...o })
ok(pantalla({ suscripcion: null, accion: basico }).tipo === 'gratis', 'sin suscripción, en el Gratis: «Pasarme al Básico»')
ok(pantalla({ suscripcion: { estado: 'pending', monto: 10000, initPoint: 'x' }, accion: basico }).tipo === 'esperando', 'esperando el pago')
ok(pantalla({ suscripcion: { estado: 'pending', monto: 10000, initPoint: null }, accion: basico }).tipo === 'gratis', 'esperando sin dónde pagar: vuelve a ofrecer el alta')
ok(pantalla({ suscripcion: { estado: 'pending', monto: 10000, initPoint: 'x' }, accion: basico, volvio: true }).tipo === 'confirmando', 'volvió de Mercado Pago: confirmando')
ok(pantalla({ suscripcion: { estado: 'pending', monto: 10000, initPoint: 'x' }, accion: basico, volvio: true, consultaAgotada: true }).tipo === 'sin_pagar', 'volvió y pasó el rato sin pago: «No se completó el pago»')
ok(pantalla({ suscripcion: { estado: 'authorized', monto: 10000 }, accion: basico }).tipo === 'confirmando', 'autorizada sin el cobro todavía: confirmando (también sin volver)')
ok(pantalla({ suscripcion: { id: 7, estado: 'authorized', monto: 10000, recienConfirmada: true }, accion: null }).tipo === 'listo', 'recién confirmada: «¡Listo!»')
ok(pantalla({ suscripcion: { id: 7, estado: 'authorized', monto: 10000, recienConfirmada: true }, accion: null, listoVisto: true }).tipo === 'al_dia', 'el «¡Listo!» ya visto: al día')
ok(pantalla({ suscripcion: { estado: 'authorized', monto: 10000, recienConfirmada: false }, accion: null }).tipo === 'al_dia', 'al día')
ok(pantalla({ suscripcion: null, accion: medida }).tipo === 'medida', 'plan a medida sin pagar')
const pv = pantalla({ suscripcion: { estado: 'pending', monto: 10000, initPoint: 'x' }, accion: medida })
ok(pv.tipo === 'medida' && pv.pendienteVieja === true, 'una del Básico esperando el pago no tapa el plan a medida')
ok(pantalla({ suscripcion: { estado: 'authorized', monto: 10000 }, accion: { tipo: 'diferencia', precioNuevo: 20000 } }).tipo === 'diferencia', 'plan a medida y ya paga el Básico: la diferencia')
ok(pantalla({ suscripcion: { estado: 'authorized', monto: 10000 }, accion: { tipo: 'diferencia' }, volvio: true }).tipo === 'confirmando', 'volvió de pagar la diferencia: confirmando')
ok(pantalla({ suscripcion: { estado: 'authorized', monto: 10000 }, accion: { tipo: 'diferencia' }, volvio: true, consultaAgotada: true }).tipo === 'diferencia', 'y si no se confirmó: otra vez la diferencia')
ok(pantalla({ suscripcion: { estado: 'cancelled', monto: 10000, pagadoHasta: '2026-12-04T00:00:00Z' }, accion: null }).tipo === 'cancelada', 'cancelada con días pagos')
ok(pantalla({ suscripcion: { estado: 'cancelled', monto: 10000, pagadoHasta: '2026-11-01T00:00:00Z' }, accion: basico }).tipo === 'gratis', 'cancelada y vencida: vuelve a ofrecer el Básico')
ok(pantalla({ suscripcion: null, accion: null }).tipo === 'nada', 'condiciones de $0: nada')

const ahoraRC = Date.parse('2026-11-10T12:00:00Z')
ok(recienConfirmada({ estado: 'authorized', creada_en: '2026-11-09T12:00:00Z', ultimo_cobro_en: '2026-11-09T12:05:00Z' }, ahoraRC), 'primer cobro de ayer: recién confirmada')
ok(!recienConfirmada({ estado: 'authorized', creada_en: '2026-11-07T12:00:00Z', ultimo_cobro_en: '2026-11-07T12:05:00Z' }, ahoraRC), 'de hace tres días: ya no')
ok(!recienConfirmada({ estado: 'authorized', creada_en: '2026-10-01T12:00:00Z', ultimo_cobro_en: '2026-11-09T12:05:00Z' }, ahoraRC), 'un cobro de renovación: no es «¡Listo!»')
ok(!recienConfirmada({ estado: 'pending', creada_en: '2026-11-09T12:00:00Z', ultimo_cobro_en: null }, ahoraRC), 'sin cobro: no')

console.log('\n6d. La ficha del admin')
ok(estadoDeCobro({ estado_pago: 'approved' }).texto === 'Aprobado' && estadoDeCobro({ estado_pago: 'approved' }).tono === 'ok', 'approved: Aprobado, verde')
ok(estadoDeCobro({ estado_pago: 'refunded' }).texto === 'Devuelto' && estadoDeCobro({ estado_pago: 'refunded' }).tono === 'espera', 'refunded: Devuelto, ámbar')
ok(estadoDeCobro({ estado_pago: 'rejected' }).tono === 'no', 'rejected: Rechazado, rojo')
ok(estadoDeCobro({ estado_pago: null, estado_cobro: 'scheduled' }).texto === 'Esperando', 'sin pago todavía: Esperando')
const filas = filasDeCobros({
  cobros: [
    { id: 1, suscripcion_id: 4, monto: 500, estado_pago: 'refunded', cobrado_en: '2026-10-04T12:00:00Z' },
    { id: 2, suscripcion_id: 7, monto: 10000, estado_pago: 'approved', cobrado_en: '2026-11-04T12:00:00Z' },
  ],
  diferencias: [{ id: 3, monto: 6700, estado: 'pendiente', creada_en: '2026-11-05T12:00:00Z', pagada_en: null }],
})
ok(filas.length === 3 && filas[0].suscripcion === 'Diferencia' && filas[1].suscripcion === '#7' && filas[2].suscripcion === '#4',
  'una sola tabla con los cobros de todas las suscripciones y la diferencia, la más nueva primero')
ok(filas[2].estado.texto === 'Devuelto' && filas[0].estado.texto === 'Esperando', 'con los estados en castellano')
const subs = [{ id: 9, estado: 'error' }, { id: 8, estado: 'cancelled' }, { id: 7, estado: 'cancelled' }]
ok(suscripcionDeLaFicha(subs).id === 8, 'arriba: la última que llegó a Mercado Pago (no un alta rechazada)')
ok(suscripcionDeLaFicha([{ id: 9, estado: 'cancelled' }, { id: 10, estado: 'authorized' }]).id === 10, 'la viva primero')
ok(suscripcionDeLaFicha([{ id: 9, estado: 'error' }]) === null, 'solo altas rechazadas: sin suscripción')
ok(pastillaDeLaFicha({ estado: 'authorized' }).texto === 'Al día' && pastillaDeLaFicha({ estado: 'authorized' }, { diferenciaSinPagar: true }).texto === 'Diferencia sin pagar', 'pastilla: Al día o Diferencia sin pagar')
ok(pastillaDeLaFicha({ estado: 'pending' }).texto === 'Esperando el pago' && pastillaDeLaFicha({ estado: 'cancelled' }).tono === 'gris', 'pastilla: Esperando el pago, Cancelada en gris')
ok(seCancelaSola({ creada_en: '2026-11-04T12:00:00Z' }) === '2026-11-11T12:00:00.000Z', 'se cancela sola a los 7 días')

console.log('\n6e. Cuando deja de pagar (050)')
const H = Date.parse('2026-12-10T12:00:00Z')
const dia = 864e5
const isoH = (d) => new Date(H + d * dia).toISOString()
ok(graciaHasta('2026-12-04T15:00:00Z') === '2026-12-14T15:00:00.000Z' && graciaHasta(null) === null, 'la gracia: pagado_hasta + 10 días')
const rech = (extra = {}) => ({ estado: 'authorized', cobro_fallido_desde: isoH(-6), pagado_hasta: isoH(-6), aviso_rechazo_en: null, aviso_fin_gracia_en: null, ...extra })
ok(enGracia(rech(), H) && !enGracia(rech({ cobro_fallido_desde: null }), H) && !enGracia(rech({ pagado_hasta: isoH(-11) }), H) && !enGracia(rech({ estado: 'cancelled' }), H),
  'en gracia: viva, con cobro rechazado y antes del fin (no sin rechazo, ni pasada, ni cancelada)')
ok(!ultimosDiasDeGracia(rech(), H) && ultimosDiasDeGracia(rech({ pagado_hasta: isoH(-8) }), H), 'los últimos 3 días')
ok(mailDeCobroQueToca(rech(), H) === 'rechazo' && mailDeCobroQueToca(rech({ aviso_rechazo_en: isoH(-1) }), H) === null, 'mail 1: una sola vez')
ok(mailDeCobroQueToca(rech({ pagado_hasta: isoH(-8), aviso_rechazo_en: isoH(-1) }), H) === 'fin_gracia'
  && mailDeCobroQueToca(rech({ pagado_hasta: isoH(-8) }), H) === 'fin_gracia'
  && mailDeCobroQueToca(rech({ pagado_hasta: isoH(-8), aviso_fin_gracia_en: isoH(0) }), H) === null, 'mail 2 en los últimos días (aunque el 1 no haya salido), una sola vez')
ok(mailDeCobroQueToca(rech({ pagado_hasta: isoH(-11) }), H) === null, 'terminada la gracia, ninguno de los dos')
const caidaM = (extra = {}) => ({ motivo: 'falta_de_pago', cayo_en: isoH(-1), restaurada_en: null, aviso_mail_en: null, ...extra })
ok(caidaConMail(caidaM(), H) && caidaConMail(caidaM({ motivo: 'baja' }), H) && caidaConMail(caidaM({ motivo: 'devolucion' }), H), 'mail 3: falta de pago, baja y devolución')
ok(!caidaConMail(caidaM({ motivo: 'condiciones_quitadas' }), H) && !caidaConMail(caidaM({ aviso_mail_en: isoH(0) }), H)
  && !caidaConMail(caidaM({ restaurada_en: isoH(0) }), H) && !caidaConMail(caidaM({ cayo_en: isoH(-8) }), H),
  'no con condiciones quitadas, ya avisada, ya restaurada (volvió a pagar) ni de hace más de 7 días')
ok(estadoDeCobro({ estado_cobro: 'recycling', estado_pago: null }).tono === 'no' && estadoDeCobro({ estado_cobro: 'recycling', estado_pago: 'rejected' }).texto === 'Rechazado',
  'un cobro en reintento: Rechazado, en rojo')
const enG = pastillaDeLaFicha({ estado: 'authorized', cobro_fallido_desde: isoH(-6), pagado_hasta: isoH(-6) }, { ahoraMs: H })
ok(enG.texto === 'En gracia' && enG.tono === 'espera' && enG.hasta === graciaHasta(isoH(-6)), 'la pastilla de la ficha: En gracia, con la fecha')

const susP = (extra = {}) => ({ estado: 'authorized', monto: 10000, pagadoHasta: isoH(-6), cobroFallidoDesde: isoH(-6), ...extra })
const basicoP = { tipo: 'suscribirse', monto: 10000, plan: 'basico', medida: false }
const pant = (o) => estadoParaPantalla({ ahoraMs: H, ...o })
let g = pant({ suscripcion: susP(), accion: null })
ok(g.tipo === 'gracia' && g.ultimosDias === false, 'Tu plan: cobro rechazado, en gracia')
g = pant({ suscripcion: susP({ pagadoHasta: isoH(-8) }), accion: null })
ok(g.tipo === 'gracia' && g.ultimosDias === true, 'Tu plan: los últimos 3 días')
ok(pant({ suscripcion: susP({ cobroFallidoDesde: null, pagadoHasta: isoH(20) }), accion: null }).tipo === 'al_dia', 'al día, sin rechazo')
ok(pant({ suscripcion: susP({ estado: 'cancelled', cobroFallidoDesde: null, pagadoHasta: isoH(20) }), accion: null }).tipo === 'cancelada', 'de baja con días pagos')
const caidaP = { motivo: 'falta_de_pago', pausados: 15 }
ok(pant({ suscripcion: susP({ estado: 'cancelled', pagadoHasta: isoH(-11) }), accion: basicoP, caida: caidaP }).tipo === 'de_vuelta', 'volvió al Gratis (cancelada)')
ok(pant({ suscripcion: susP({ pagadoHasta: isoH(-11) }), accion: basicoP, caida: caidaP }).tipo === 'de_vuelta',
  'volvió al Gratis aunque Mercado Pago todavía no la canceló (no es «confirmando»)')
ok(pant({ suscripcion: susP({ pagadoHasta: isoH(-11), cobroFallidoDesde: isoH(-11) }), accion: basicoP, caida: null }).tipo === 'gratis',
  'gracia terminada sin caída todavía: el Gratis, no «confirmando»')
ok(pant({ suscripcion: { estado: 'pending', monto: 10000, initPoint: 'x' }, accion: basicoP, caida: caidaP }).tipo === 'esperando',
  'reactivando: la nueva esperando el pago tapa el «volvió al Gratis»')
ok(pant({ suscripcion: { estado: 'pending', monto: 10000, initPoint: 'x' }, accion: basicoP, caida: caidaP, volvio: true }).tipo === 'confirmando', 'y volviendo de pagar, confirmando')
ok(pant({ suscripcion: susP({ cobroFallidoDesde: null, pagadoHasta: isoH(20) }), accion: null, caida: { motivo: 'condiciones_quitadas' } }).tipo === 'al_dia',
  'con condiciones quitadas sigue en su Básico al día')
ok(pant({ suscripcion: null, accion: { ...basicoP, monto: 20000, medida: true }, caida: { motivo: 'falta_de_pago', pausados: 32 } }).tipo === 'de_vuelta', 'volvió, era a medida')

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
