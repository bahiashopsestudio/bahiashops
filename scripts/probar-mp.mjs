// Prueba, contra la API real de MercadoPago, las dos llamadas que va a usar
// "Eliminar mi cuenta". No toca Supabase ni ningún pedido real.
//
//   MP_TOKEN=TEST-xxxx node scripts/probar-mp.mjs
//   MP_TOKEN=TEST-xxxx REF_CON_PAGOS=123 node scripts/probar-mp.mjs   (opcional)
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

const API = 'https://api.mercadopago.com'
const cabeceras = { Authorization: `Bearer ${TOKEN}`, 'Content-Type': 'application/json' }

async function mp(metodo, ruta, cuerpo) {
  const res = await fetch(API + ruta, { method: metodo, headers: cabeceras, body: cuerpo ? JSON.stringify(cuerpo) : undefined })
  let datos = null
  try { datos = await res.json() } catch { /* sin cuerpo */ }
  return { status: res.status, ok: res.ok, datos }
}

// "2026-10-01T09:30:00.000-03:00": la hora de Argentina con su desfase, que es
// el formato que muestra la documentación.
function fechaAR(ms) {
  const d = new Date(ms - 3 * 3600 * 1000)
  return d.toISOString().replace('Z', '-03:00')
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
