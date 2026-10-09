// Prueba, contra la API real de MercadoPago, que el ticket en efectivo
// (Rapipago / Pago Fácil) vive POR SU CUENTA: que cuando vence el link de la
// preferencia (2 horas en producción) el ticket ya generado sigue pendiente y
// conserva su propia fecha de vencimiento (3 días).
//
//   MP_TOKEN=TEST-xxxx node scripts/probar-mp-efectivo.mjs
//   MP_TOKEN=TEST-xxxx MINUTOS_LINK=4 CANCELAR_TICKET=1 node scripts/probar-mp-efectivo.mjs
//
// MP_TOKEN: access token de una CUENTA DE PRUEBA vendedora (no una tienda real).
// MINUTOS_LINK: cuánto dura el link en la prueba (por defecto 4; en producción
//   son 120). Solo se acorta para no esperar dos horas.
// CANCELAR_TICKET=1: al final prueba también cancelar el ticket pendiente con
//   PUT /v1/payments/{id} {status: 'cancelled'} (lo necesita "pagué con tarjeta,
//   anulá el cupón").
//
// Este script NO puede correrse solo: hace falta una persona que genere el ticket.
//   1. Corré el script: crea una preferencia y te imprime el link.
//   2. Abrí el link en una ventana de incógnito, entrá con el COMPRADOR DE PRUEBA
//      (el código de verificación son los últimos 6 dígitos de su User ID), elegí
//      Rapipago o Pago Fácil y generá el cupón. Tenés hasta que venza el link.
//   3. El script lo detecta solo (busca por external_reference cada 10 segundos),
//      espera a que venza el link y vuelve a leer el pago y la preferencia.
//
// Los campos de vencimiento son los de la versión nueva (link corto, ticket
// largo). Cuando se construya A3 se pasan a importar de preferencias.js.

const TOKEN = process.env.MP_TOKEN
if (!TOKEN) {
  console.error('Falta MP_TOKEN (access token de una cuenta de prueba vendedora).')
  process.exit(1)
}

const API = 'https://api.mercadopago.com'
const cabeceras = { Authorization: `Bearer ${TOKEN}`, 'Content-Type': 'application/json' }
const MINUTOS_LINK = Number(process.env.MINUTOS_LINK) > 0 ? Number(process.env.MINUTOS_LINK) : 4
const MS_MIN = 60 * 1000
const MS_DIA = 24 * 60 * MS_MIN
const DIAS_TICKET = 3

async function mp(metodo, ruta, cuerpo) {
  const res = await fetch(API + ruta, { method: metodo, headers: cabeceras, body: cuerpo ? JSON.stringify(cuerpo) : undefined })
  let datos = null
  try { datos = await res.json() } catch { /* sin cuerpo */ }
  return { status: res.status, ok: res.ok, datos }
}

const dormir = (ms) => new Promise((r) => setTimeout(r, ms))
const problemas = []
const fila = (nombre, ok, detalle) => {
  console.log(`  ${ok ? '✓' : '✗'} ${nombre}${detalle ? ' — ' + detalle : ''}`)
  if (!ok) problemas.push(nombre)
}

function fechaAR(ms) {
  const d = new Date(ms - 3 * 3600 * 1000)
  return d.toISOString().replace('Z', '-03:00')
}
const cerca = (devuelta, esperadaMs, tolMs = 2 * MS_MIN) => {
  const t = Date.parse(devuelta)
  return Number.isFinite(t) && Math.abs(t - esperadaMs) <= tolMs
}

// MercadoPago redondea el vencimiento del cupón al FINAL DEL DÍA de Argentina
// (23:59:59, UTC-3), aunque el offset con que lo devuelve sea otro. Se acepta
// tanto el instante pedido como el final de ese día argentino.
const AR_MS = 3 * 3600 * 1000
function finDelDiaAR(ms) {
  const inicioDelDia = Math.floor((ms - AR_MS) / MS_DIA) * MS_DIA
  return inicioDelDia + MS_DIA - 1000 + AR_MS
}
const vencimientoDeTicketOk = (devuelta, pedidoMs) => cerca(devuelta, pedidoMs) || cerca(devuelta, finDelDiaAR(pedidoMs))
const comoFinDeDia = (devuelta, pedidoMs) => (cerca(devuelta, finDelDiaAR(pedidoMs)) ? 'final del día argentino' : 'instante pedido')

const ahora = Date.now()
const venceLink = ahora + MINUTOS_LINK * MS_MIN
const venceTicket = ahora + DIAS_TICKET * MS_DIA
const referencia = `prueba-efectivo-${ahora}`

console.log(`── Independencia del ticket en efectivo (link ${MINUTOS_LINK} min, ticket ${DIAS_TICKET} días) ──`)
const creada = await mp('POST', '/checkout/preferences', {
  items: [{ title: 'Prueba de ticket en efectivo (no pagar de verdad)', quantity: 1, unit_price: 100, currency_id: 'ARS' }],
  external_reference: referencia,
  expires: true,
  expiration_date_from: fechaAR(ahora - MS_MIN),
  expiration_date_to: fechaAR(venceLink),
  date_of_expiration: fechaAR(venceTicket),
})
if (!creada.ok) { console.error('No se pudo crear la preferencia:', creada.datos); process.exit(1) }
const prefId = creada.datos.id
console.log('  Preferencia', prefId, '| devuelve:', JSON.stringify({
  expires: creada.datos.expires, to: creada.datos.expiration_date_to, date_of_expiration: creada.datos.date_of_expiration,
}))
fila('el link vence a los minutos pedidos', cerca(creada.datos.expiration_date_to, venceLink))
fila('date_of_expiration (ticket) devuelve los 3 días (o el final de ese día argentino), no el vencimiento del link', vencimientoDeTicketOk(creada.datos.date_of_expiration, venceTicket), creada.datos.date_of_expiration)

console.log(`\n  AHORA: abrí este link en incógnito, entrá con el comprador de prueba, elegí Rapipago o Pago Fácil y generá el cupón.`)
console.log(`  Tenés hasta ${new Date(venceLink).toLocaleTimeString('es-AR')} (hora de esta computadora).`)
console.log('  ' + (creada.datos.sandbox_init_point || creada.datos.init_point))

async function buscarPago() {
  const r = await mp('GET', `/v1/payments/search?external_reference=${encodeURIComponent(referencia)}&sort=date_created&criteria=desc&limit=5`)
  return r.ok ? (r.datos?.results || [])[0] || null : null
}

let pago = null
const limite = venceLink + 2 * MS_MIN
while (Date.now() < limite && !pago) {
  await dormir(10 * 1000)
  pago = await buscarPago()
  if (!pago) process.stdout.write('.')
}
console.log('')
if (!pago) {
  console.log('  ✗ No apareció ningún pago antes de que venza el link. Si el sandbox no te dejó generar el cupón, decímelo: la prueba no se puede completar con esta cuenta.')
  process.exit(2)
}

const resumen = (p) => ({
  id: p.id, status: p.status, status_detail: p.status_detail, payment_type_id: p.payment_type_id,
  payment_method_id: p.payment_method_id, date_created: p.date_created, date_of_expiration: p.date_of_expiration,
})
console.log('\n  Pago encontrado:', JSON.stringify(resumen(pago)))
fila('es un cupón en efectivo (ticket)', pago.payment_type_id === 'ticket' || pago.payment_type_id === 'atm', `payment_type_id: ${pago.payment_type_id}`)
fila('queda pendiente', pago.status === 'pending', `status: ${pago.status}`)
fila('su date_of_expiration es la de los 3 días (no la del link)', vencimientoDeTicketOk(pago.date_of_expiration, venceTicket), `date_of_expiration: ${pago.date_of_expiration} (${comoFinDeDia(pago.date_of_expiration, venceTicket)})`)
const fechaAntes = pago.date_of_expiration

const espera = venceLink + MS_MIN - Date.now()
if (espera > 0) {
  console.log(`\n  Esperando ${Math.ceil(espera / 1000)} s a que venza el link...`)
  await dormir(espera)
}

console.log('\n  Después de vencido el link:')
const pref = await mp('GET', `/checkout/preferences/${prefId}`)
fila('la preferencia sigue consultable', pref.ok, `HTTP ${pref.status}`)
const despues = await mp('GET', `/v1/payments/${pago.id}`)
fila('el pago se puede leer', despues.ok, `HTTP ${despues.status}`)
if (despues.ok) {
  console.log('  Pago ahora:', JSON.stringify(resumen(despues.datos)))
  fila('el cupón sigue pendiente (el vencimiento del link NO lo canceló)', despues.datos.status === 'pending', `status: ${despues.datos.status}, detalle: ${despues.datos.status_detail}`)
  fila('conserva su fecha de vencimiento de 3 días', despues.datos.date_of_expiration === fechaAntes, `${fechaAntes} -> ${despues.datos.date_of_expiration}`)
}
const urlCupon = despues.ok ? despues.datos?.transaction_details?.external_resource_url : null
console.log('  Para un "Ver cupón" en Mis pedidos:', urlCupon ? `el pago trae transaction_details.external_resource_url (${(() => { try { return new URL(urlCupon).host } catch { return 'URL no válida' } })()})` : 'el pago NO trae transaction_details.external_resource_url')
console.log('  Falta lo que se mira a mano: abrí el link ahora y confirmá que MercadoPago dice que venció (no deja generar otro cupón).')

if (process.env.CANCELAR_TICKET === '1' && despues.ok && despues.datos.status === 'pending') {
  console.log('\n  Cancelar el cupón pendiente con el token de la tienda:')
  const cancelado = await mp('PUT', `/v1/payments/${pago.id}`, { status: 'cancelled' })
  console.log('  PUT ->', cancelado.status, JSON.stringify({ status: cancelado.datos?.status, status_detail: cancelado.datos?.status_detail, error: cancelado.datos?.message }))
  console.log(cancelado.ok && cancelado.datos?.status === 'cancelled'
    ? '  (dato) MercadoPago aceptó cancelar el cupón.'
    : `  (dato, no es un fallo) no se pudo cancelar el cupón con esta cuenta: HTTP ${cancelado.status}. Por eso la cancelación automática no se implementa.`)
}

if (problemas.length > 0) {
  console.log(`\n✗ ${problemas.length} cosa(s) que no dieron como se esperaba:`)
  for (const p of problemas) console.log('   -', p)
  process.exit(1)
}
console.log('\n✓ El ticket en efectivo es independiente del link: sobrevive a su vencimiento y mantiene sus 3 días.')
