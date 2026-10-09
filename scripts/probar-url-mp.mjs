// Prueba adónde manda MercadoPago el aviso del pago y la vuelta después de pagar
// (urlParaMercadoPago en src/lib/sitio.js): siempre el sitio publicado, salvo
// fuera de producción con URL_PUBLICA_DESARROLLO (un túnel hacia localhost).
// Y que /api/pedidos/crear y «Pagar ahora» la usen para notification_url y
// back_urls.
//
//   npm run probar:url-mp

import { readFileSync } from 'node:fs'
import { SITIO_URL, urlParaMercadoPago, origenPublico } from '../src/lib/sitio.js'

let fallas = 0
const ok = (c, m) => { if (!c) { fallas++; console.log('  ✗ FALLA:', m) } else console.log('  ✓', m) }
console.warn = () => {}

const TUNEL = 'https://algo-raro.trycloudflare.com'

console.log('1. Producción: siempre el sitio')
ok(urlParaMercadoPago({ NODE_ENV: 'production' }) === SITIO_URL, 'sin variable: el sitio')
ok(urlParaMercadoPago({ NODE_ENV: 'production', URL_PUBLICA_DESARROLLO: TUNEL }) === SITIO_URL, 'CON la variable cargada: igual el sitio (un build nunca la respeta)')

console.log('\n2. Desarrollo')
ok(urlParaMercadoPago({ NODE_ENV: 'development' }) === SITIO_URL, 'sin variable: el sitio (como hasta ahora)')
ok(urlParaMercadoPago({ NODE_ENV: 'development', URL_PUBLICA_DESARROLLO: TUNEL }) === TUNEL, 'con el túnel: el túnel')
ok(urlParaMercadoPago({ URL_PUBLICA_DESARROLLO: TUNEL }) === TUNEL, 'sin NODE_ENV (fuera de producción): el túnel')
ok(urlParaMercadoPago({ NODE_ENV: 'development', URL_PUBLICA_DESARROLLO: `  ${TUNEL}/  ` }) === TUNEL, 'con espacios o barra final: se limpia')
for (const [nombre, valor] of [
  ['http (MercadoPago exige https)', 'http://algo.trycloudflare.com'],
  ['localhost sin https', 'http://localhost:3000'],
  ['con ruta', `${TUNEL}/api/mercadopago/webhook`],
  ['con parámetros', `${TUNEL}/?x=1`],
  ['con usuario y clave', 'https://yo:clave@algo.trycloudflare.com'],
  ['no es una dirección', 'cualquier cosa'],
  ['vacía', '   '],
]) ok(urlParaMercadoPago({ NODE_ENV: 'development', URL_PUBLICA_DESARROLLO: valor }) === SITIO_URL, `${nombre}: se ignora, el sitio`)

console.log('\n3. Quién la usa')
const crear = readFileSync(new URL('../src/app/api/pedidos/crear/route.js', import.meta.url), 'utf8')
const pagarAhora = readFileSync(new URL('../src/app/api/pedidos/[id]/pagar-ahora/route.js', import.meta.url), 'utf8')
ok(/const urlMp = urlParaMercadoPago\(\)/.test(crear) && /success: `\$\{urlMp\}\/compra\/exito/.test(crear) && /failure: `\$\{urlMp\}\/compra\/fallo/.test(crear) && /pending: `\$\{urlMp\}\/compra\/pendiente/.test(crear) && /notification_url: `\$\{urlMp\}\/api\/mercadopago\/webhook`/.test(crear), 'crear: back_urls y notification_url salen de urlParaMercadoPago')
ok(!/SITIO_URL/.test(crear), 'crear ya no usa SITIO_URL directo')
ok(/const urlMp = urlParaMercadoPago\(\)/.test(pagarAhora) && /sitioUrl: urlMp/.test(pagarAhora) && /notificationUrl: `\$\{urlMp\}\/api\/mercadopago\/webhook`/.test(pagarAhora), '«Pagar ahora»: también')

console.log('\n4. El origen para redirigir (origenPublico)')
const pedido = (url, cabeceras = {}) => ({ url, headers: { get: (n) => cabeceras[n.toLowerCase()] ?? null } })
const detrasDelTunel = pedido('https://localhost:3000/auth/callback?code=x', { 'cf-ray': '8a1b2c3d4e5f-EZE' })
ok(origenPublico(detrasDelTunel, { NODE_ENV: 'development', URL_PUBLICA_DESARROLLO: TUNEL }) === TUNEL, 'desarrollo, pedido que llegó por el túnel: el túnel (no https://localhost:3000)')
ok(origenPublico(pedido('http://localhost:3000/auth/callback'), { NODE_ENV: 'development', URL_PUBLICA_DESARROLLO: TUNEL }) === 'http://localhost:3000', 'desarrollo, entrando directo por localhost: localhost')
ok(origenPublico(detrasDelTunel, { NODE_ENV: 'development' }) === 'https://localhost:3000', 'desarrollo sin la variable: como siempre, el de request.url')
ok(origenPublico(pedido('https://bahiashops.com.ar/auth/callback', { 'cf-ray': 'x' }), { NODE_ENV: 'production', URL_PUBLICA_DESARROLLO: TUNEL }) === 'https://bahiashops.com.ar', 'producción, aunque haya cf-ray y la variable: el de request.url')
const callback = readFileSync(new URL('../src/app/auth/callback/route.js', import.meta.url), 'utf8')
const verificar = readFileSync(new URL('../src/app/auth/confirmar/verificar/route.js', import.meta.url), 'utf8')
ok(/const origin = origenPublico\(request\)/.test(callback) && /const origen = origenPublico\(request\)/.test(verificar), '/auth/callback y /auth/confirmar/verificar redirigen con origenPublico')

console.log(fallas === 0 ? '\nTODO OK' : `\n${fallas} FALLAS`)
process.exit(fallas ? 1 : 0)
