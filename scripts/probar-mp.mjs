// Prueba, contra la API real de MercadoPago, las llamadas que usa la app con
// las preferencias (los links de pago). No toca Supabase ni ningún pedido real.
//
//   MP_TOKEN=TEST-xxxx node scripts/probar-mp.mjs
//   MP_TOKEN=TEST-xxxx REF_CON_PAGOS=123 node scripts/probar-mp.mjs   (opcional)
//   MP_TOKEN=TEST-xxxx PAGO_EN_EFECTIVO=123 node scripts/probar-mp.mjs (opcional)
//
// Partes 1 a 3: lo que usa "Eliminar mi cuenta" (buscar pagos y vencer una
// preferencia). Parte 4: el vencimiento de los links de pago de los pedidos,
// con los MISMOS campos y los mismos plazos que manda /api/pedidos/crear (salen de
// src/lib/mercadopago/preferencias.js y src/lib/vencimientoPago.js): el link vale
// 2 horas y el cupón en efectivo 3 días. Que el cupón sobreviva al link se prueba
// con scripts/probar-mp-efectivo.mjs.
//
// MP_TOKEN: el access token de una CUENTA DE PRUEBA vendedora (la que se crea
// desde "Cuentas de prueba" en el panel de MercadoPago Developers). No uses el
// token de una tienda real: el script crea una preferencia de $100 y la vence.
// REF_CON_PAGOS (opcional): un external_reference que sepas que tiene pagos en
// esa cuenta, para ver cómo vuelve un resultado no vacío.
//
// Qué se confirma:
//   1. Búsqueda de pagos por external_reference (forma de la respuesta y que un
//      pedido sin pagos devuelve results vacío).
//   2. Vencer una preferencia con PUT /checkout/preferences/{id}: si acepta
//      una fecha pasada o hay que dejarle un minuto, y qué devuelve.
//   3. Qué ve quien abre el link de una preferencia vencida (esto lo mirás
//      vos: el script imprime el link).

const TOKEN = process.env.MP_TOKEN
if (!TOKEN) {
  console.error('Falta MP_TOKEN (access token de una cuenta de prueba vendedora).')
  process.exit(1)
}

import { camposDeVencimiento, fechaAR } from '../src/lib/mercadopago/preferencias.js'
import { PLAZO_LINK_HORAS, PLAZO_CUPON_DIAS } from '../src/lib/vencimientoPago.js'

const API = 'https://api.mercadopago.com'
const cabeceras = { Authorization: `Bearer ${TOKEN}`, 'Content-Type': 'application/json' }

async function mp(metodo, ruta, cuerpo) {
  const res = await fetch(API + ruta, { method: metodo, headers: cabeceras, body: cuerpo ? JSON.stringify(cuerpo) : undefined })
  let datos = null
  try { datos = await res.json() } catch { /* sin cuerpo */ }
  return { status: res.status, ok: res.ok, datos }
}

const resumirPagos = (datos) => ({
  paging: datos?.paging,
  cantidad: datos?.results?.length,
  // Solo lo que va a usar la app: id y estado. Sin datos de la persona.
  pagos: (datos?.results || []).map((p) => ({ id: p.id, status: p.status, status_detail: p.status_detail })),
})

console.log('── 1. Buscar pagos por external_reference ──')
const refVacia = `prueba-sin-pagos-${Date.now()}`
const busquedaVacia = await mp('GET', `/v1/payments/search?external_reference=${encodeURIComponent(refVacia)}&sort=date_created&criteria=desc&limit=10`)
console.log('Sin pagos ->', busquedaVacia.status, JSON.stringify(resumirPagos(busquedaVacia.datos)))

if (process.env.REF_CON_PAGOS) {
  const conPagos = await mp('GET', `/v1/payments/search?external_reference=${encodeURIComponent(process.env.REF_CON_PAGOS)}&sort=date_created&criteria=desc&limit=10`)
  console.log('Con pagos ->', conPagos.status, JSON.stringify(resumirPagos(conPagos.datos)))
}

console.log('\n── 2. Crear una preferencia de prueba y vencerla ──')
const externalReference = `prueba-vencer-${Date.now()}`
const creada = await mp('POST', '/checkout/preferences', {
  items: [{ title: 'Prueba de vencimiento (no pagar)', quantity: 1, unit_price: 100, currency_id: 'ARS' }],
  external_reference: externalReference,
})
console.log('Crear ->', creada.status, creada.datos?.id)
if (!creada.ok) { console.error(creada.datos); process.exit(1) }
const id = creada.datos.id
const link = creada.datos.sandbox_init_point || creada.datos.init_point
console.log('expires al crear:', creada.datos.expires)

// Intento A: vencida en el pasado.
const ahora = Date.now()
const pasado = await mp('PUT', `/checkout/preferences/${id}`, {
  expires: true,
  expiration_date_from: fechaAR(ahora - 2 * 3600 * 1000),
  expiration_date_to: fechaAR(ahora - 3600 * 1000),
})
console.log('PUT con fecha pasada ->', pasado.status, JSON.stringify({ expires: pasado.datos?.expires, to: pasado.datos?.expiration_date_to, error: pasado.datos?.message || pasado.datos?.error }))

let vencimiento = 'pasado'
if (!pasado.ok) {
  // Intento B: vence en un minuto.
  const enUnMinuto = await mp('PUT', `/checkout/preferences/${id}`, {
    expires: true,
    expiration_date_from: fechaAR(ahora - 60 * 1000),
    expiration_date_to: fechaAR(ahora + 60 * 1000),
  })
  console.log('PUT con vencimiento en 1 minuto ->', enUnMinuto.status, JSON.stringify({ expires: enUnMinuto.datos?.expires, to: enUnMinuto.datos?.expiration_date_to, error: enUnMinuto.datos?.message || enUnMinuto.datos?.error }))
  vencimiento = enUnMinuto.ok ? 'en un minuto' : 'ninguno'
}

const leida = await mp('GET', `/checkout/preferences/${id}`)
console.log('Releída ->', leida.status, JSON.stringify({ expires: leida.datos?.expires, from: leida.datos?.expiration_date_from, to: leida.datos?.expiration_date_to }))

console.log(`\nResultado: la preferencia quedó vencida con el modo "${vencimiento}".`)
console.log('Falta lo que NO se puede ver desde acá: abrí este link en el navegador (pasado el vencimiento)')
console.log('y fijate qué muestra MercadoPago (¿error, o deja pagar igual?):')
console.log(link)

// ─────────────────────────────────────────────────────────────────────────────
// 4. Vencimiento de los links de pago de los pedidos
//
// Con los campos exactos que manda /api/pedidos/crear (camposDeVencimiento) y el
// plazos reales (PLAZO_LINK_HORAS y PLAZO_CUPON_DIAS). Se prueba:
//   A. crear una preferencia con el link a PLAZO_LINK_HORAS y el cupón a PLAZO_CUPON_DIAS;
//   B. crear otra que vence en pocos minutos (para ver cómo se ve vencida);
//   C. ponerle el vencimiento a una preferencia que ya existe sin fecha (es lo
//      que hace la regularización de los pedidos viejos).
// "Rechazo" = MercadoPago contestó con error: hay que parar y avisar. "Sin eco"
// = aceptó pero no devolvió el dato: crear/route.js lo trata como falla y cancela
// el pedido, así que también hay que avisar.
// ─────────────────────────────────────────────────────────────────────────────
console.log(`\n── 4. Vencimiento de los links de pago (link: ${PLAZO_LINK_HORAS} horas, cupón: ${PLAZO_CUPON_DIAS} días) ──`)

const MS_DIA = 24 * 3600 * 1000
const problemas = []
const fila = (nombre, ok, detalle) => {
  console.log(`  ${ok ? '✓' : '✗'} ${nombre}${detalle ? ' — ' + detalle : ''}`)
  if (!ok) problemas.push(nombre)
}

// ¿La fecha que devolvió MP es la que se mandó (con un minuto de tolerancia)?
function mismaFecha(devuelta, mandadaMs) {
  const t = Date.parse(devuelta)
  return Number.isFinite(t) && Math.abs(t - mandadaMs) <= 60 * 1000
}

// Revisa una respuesta (POST o GET) contra lo que se mandó.
function revisar(titulo, respuesta, venceEnMs, venceCuponMs = venceEnMs) {
  const d = respuesta.datos
  console.log(`  ${titulo}: HTTP ${respuesta.status}`)
  console.log('    devuelve:', JSON.stringify({
    expires: d?.expires, from: d?.expiration_date_from, to: d?.expiration_date_to, date_of_expiration: d?.date_of_expiration,
    error: d?.message || d?.error,
  }))
  fila(`${titulo}: MercadoPago la aceptó`, respuesta.ok, respuesta.ok ? '' : `RECHAZO ${JSON.stringify(d)}`)
  if (!respuesta.ok) return
  fila(`${titulo}: devuelve expires = true`, d?.expires === true)
  fila(`${titulo}: devuelve expiration_date_to igual a lo mandado`, mismaFecha(d?.expiration_date_to, venceEnMs), d?.expiration_date_to ? '' : 'SIN ECO')
  fila(`${titulo}: devuelve date_of_expiration igual a lo mandado`, mismaFecha(d?.date_of_expiration, venceCuponMs), d?.date_of_expiration ? '' : 'SIN ECO (mirá el ticket a mano, ver abajo)')
}

const itemPrueba = { title: 'Prueba de vencimiento (no pagar)', quantity: 1, unit_price: 100, currency_id: 'ARS' }

// A. Link a PLAZO_LINK_HORAS, cupón a PLAZO_CUPON_DIAS.
const venceA = Date.now() + PLAZO_LINK_HORAS * 3600 * 1000
const venceCuponA = Date.now() + PLAZO_CUPON_DIAS * MS_DIA
const campos = camposDeVencimiento(venceA, venceCuponA)
console.log('  Campos que se mandan en A:', JSON.stringify(campos))
const crearA = await mp('POST', '/checkout/preferences', {
  items: [itemPrueba], external_reference: `prueba-3dias-${Date.now()}`, ...campos,
})
revisar('A (link 2 h, cupón 3 días), al crear', crearA, venceA, venceCuponA)
if (crearA.ok) {
  const leerA = await mp('GET', `/checkout/preferences/${crearA.datos.id}`)
  revisar('A (link 2 h, cupón 3 días), releída', leerA, venceA, venceCuponA)
  console.log('  Link A (para generar un ticket en efectivo con un comprador de prueba):')
  console.log('   ', crearA.datos.sandbox_init_point || crearA.datos.init_point)
}

// B. A pocos minutos.
const venceB = Date.now() + 5 * 60 * 1000
const crearB = await mp('POST', '/checkout/preferences', {
  items: [itemPrueba], external_reference: `prueba-5min-${Date.now()}`, ...camposDeVencimiento(venceB, venceCuponA),
})
revisar('B (5 minutos), al crear', crearB, venceB, venceCuponA)
if (crearB.ok) {
  console.log(`  Link B (vence a las ${fechaAR(venceB)}; abrilo ANTES y DESPUÉS de esa hora):`)
  console.log('   ', crearB.datos.sandbox_init_point || crearB.datos.init_point)
}

// C. Ponerle vencimiento a una preferencia que ya existe, sin fecha.
const sinFecha = await mp('POST', '/checkout/preferences', {
  items: [itemPrueba], external_reference: `prueba-regularizar-${Date.now()}`,
})
if (!sinFecha.ok) {
  fila('C: crear la preferencia sin fecha (preparación)', false, JSON.stringify(sinFecha.datos))
} else {
  fila('C: la preferencia sin fecha nace con expires = false', sinFecha.datos.expires !== true, `expires: ${sinFecha.datos.expires}`)
  const venceC = Date.now() + PLAZO_LINK_HORAS * 3600 * 1000
  const ponerC = await mp('PUT', `/checkout/preferences/${sinFecha.datos.id}`, camposDeVencimiento(venceC, venceCuponA))
  revisar('C (PUT sobre una existente)', ponerC, venceC, venceCuponA)
  const leerC = await mp('GET', `/checkout/preferences/${sinFecha.datos.id}`)
  revisar('C (PUT), releída', leerC, venceC, venceCuponA)
}

// El ticket en efectivo: no se puede generar por API. Si tenés un pago en
// efectivo ya generado con el link A, pasá su id y se ve su vencimiento real.
if (process.env.PAGO_EN_EFECTIVO) {
  const pago = await mp('GET', `/v1/payments/${encodeURIComponent(process.env.PAGO_EN_EFECTIVO)}`)
  console.log('  Pago en efectivo ->', pago.status, JSON.stringify({
    status: pago.datos?.status, payment_type_id: pago.datos?.payment_type_id, payment_method_id: pago.datos?.payment_method_id,
    date_created: pago.datos?.date_created, date_of_expiration: pago.datos?.date_of_expiration,
  }))
  const esperado = Date.parse(pago.datos?.date_created) + PLAZO_CUPON_DIAS * MS_DIA
  fila('Ticket en efectivo: vence a los 3 días (MercadoPago lo redondea al final del día)',
    Number.isFinite(Date.parse(pago.datos?.date_of_expiration)) && Date.parse(pago.datos.date_of_expiration) <= venceCuponA + MS_DIA,
    `date_of_expiration: ${pago.datos?.date_of_expiration}; cupón pedido: ${fechaAR(venceCuponA)}; creado + 3 días: ${Number.isFinite(esperado) ? fechaAR(esperado) : 'n/d'}`)
}

console.log('\nLo que NO se puede ver desde acá (lo mirás vos):')
console.log('  · En el link A, con un comprador de prueba, elegí un medio en efectivo (Rapipago / Pago Fácil) y mirá hasta cuándo dice que se puede pagar el ticket: tiene que ser a más tardar a los 3 días (el final de ese día).')
console.log('  · Si lo generás, copiá el id del pago (aparece en la URL o en tu cuenta de prueba) y volvé a correr con PAGO_EN_EFECTIVO=<id>.')
console.log('  · El link B, pasada la hora, tiene que mostrar un error de MercadoPago (no dejar pagar).')

if (problemas.length > 0) {
  console.log(`\n✗ ${problemas.length} cosa(s) para avisar ANTES de seguir con la etapa 1:`)
  for (const p of problemas) console.log('   -', p)
  process.exit(1)
}
console.log('\n✓ Parte 4: MercadoPago aceptó y devolvió los cuatro campos en A, B y C.')

// ─────────────────────────────────────────────────────────────────────────────
// 5. Quién es la cuenta conectada (GET /users/me)
//
// El callback de la conexión con MercadoPago lo usa para leer el NOMBRE de la
// cuenta (nickname) y mostrarlo en el panel y en el mail. Solo se mira que
// devuelva id y nickname; el mail de la cuenta que trae la respuesta ni se lee
// ni se imprime acá.
// ─────────────────────────────────────────────────────────────────────────────
console.log('\n── 5. Quién es la cuenta (GET /users/me) ──')
const yo = await mp('GET', '/users/me')
console.log('  HTTP', yo.status, JSON.stringify({ id: yo.datos?.id, nickname: yo.datos?.nickname }))
if (!yo.ok || !yo.datos?.id) {
  console.log('  ✗ /users/me no devolvió el id de la cuenta: el panel va a mostrar la cuenta sin nombre (la conexión anda igual). Avisá.')
  process.exit(1)
}
console.log(yo.datos.nickname ? '  ✓ devuelve id y nickname' : '  ! devuelve el id pero NO el nickname: el panel va a decir "sin nombre"')
