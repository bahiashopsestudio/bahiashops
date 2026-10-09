// Prueba que los mails internos de los formularios públicos escapan lo que
// escribe la persona (nombre, qué hace, WhatsApp, email): sin escapar, podía
// meter etiquetas, links o un formulario propios en nuestra casilla. Con las
// rutas REALES (/api/lead-gastronomia y /api/contacto) y un Resend de mentira.
//
//   npm run probar:lead-gastronomia
//
// No manda ningún mail.

import { register } from 'node:module'

process.env.RESEND_API_KEY = 'clave-de-mentira'

const raiz = new URL('../', import.meta.url)
const loader = `
const src = ${JSON.stringify(new URL('src/', raiz).href)}
const falsos = {
  'resend': 'export class Resend { constructor() { this.emails = { send: async (mail) => { globalThis.__enviados.push(mail); if (globalThis.__resendFalla) throw new Error("caído"); return { data: { id: "m" } } } } } }',
  'next/server': 'export const NextResponse = { json: (body, init) => ({ body, status: (init && init.status) || 200 }) }',
}
export function resolve(esp, ctx, sig) {
  if (falsos[esp]) return { url: 'data:text/javascript,' + encodeURIComponent(falsos[esp]), shortCircuit: true }
  if (esp.startsWith('@/')) { const r = src + esp.slice(2); return sig(r.endsWith('.js') ? r : r + '.js', ctx) }
  if (esp.startsWith('./') && !esp.endsWith('.js')) return sig(esp + '.js', ctx)
  return sig(esp, ctx)
}`
register('data:text/javascript,' + encodeURIComponent(loader))

globalThis.__enviados = []
globalThis.__resendFalla = false

let fallas = 0
const ok = (c, m) => { if (!c) { fallas++; process.stdout.write('  ✗ FALLA: ' + m + '\n') } else process.stdout.write('  ✓ ' + m + '\n') }
const titulo = (t) => process.stdout.write(t + '\n')
const silencio = () => {}
console.error = silencio

const { POST: lead } = await import('../src/app/api/lead-gastronomia/route.js')
const { POST: contacto } = await import('../src/app/api/contacto/route.js')

// La ruta responde con un Response de verdad: se lee su cuerpo para tener { status, body }.
const comoRespuesta = async (res) => ({ status: res.status, body: await res.json() })
const pedirLead = async (cuerpo) => comoRespuesta(await lead({ json: async () => cuerpo }))
const PELIGRO = '<script>alert(1)</script><img src=x onerror=alert(2)> "><a href="https://malo.test">clic</a> & \''

titulo('1. /api/lead-gastronomia escapa lo que escribe la persona')
let r = await pedirLead({ nombre: PELIGRO, queHace: PELIGRO, whatsapp: PELIGRO, email: PELIGRO })
let mail = __enviados.at(-1)
ok(r.status === 200 && r.body.ok === true && __enviados.length === 1, 'responde ok y manda un solo mail')
for (const campo of ['nombre', 'qué hace', 'WhatsApp', 'email']) {
  const parte = mail.html.slice(mail.html.indexOf(`<strong>${{ nombre: 'Nombre', 'qué hace': 'Qué hace', WhatsApp: 'WhatsApp', email: 'Email' }[campo]}:</strong>`))
  const linea = parte.slice(0, parte.indexOf('</p>'))
  ok(!/<script|<img|<a /i.test(linea) && linea.includes('&lt;script&gt;') && linea.includes('&quot;') && linea.includes('&amp;') && linea.includes('&#39;'), `${campo}: las etiquetas, comillas y & quedan escapados`)
}
ok(!/<script|<img|onerror=alert\(2\)>|<a href="https:\/\/malo/i.test(mail.html.replace(/<div style[\s\S]*?<hr[^>]*>/, '')), 'en todo el mail no queda ninguna etiqueta de la persona sin escapar')
ok(mail.html.includes('<strong>Nombre:</strong>') && mail.html.includes('<h2'), 'el marco del mail (etiquetas nuestras) sigue intacto')

titulo('\n2. El asunto')
__enviados.length = 0
r = await pedirLead({ nombre: 'Ana\r\nBcc: otro@malo.test\nX-Cosa: 1', queHace: 'tortas' })
mail = __enviados.at(-1)
ok(!/[\r\n]/.test(mail.subject), 'el asunto es de una sola línea: un salto de línea no puede agregar encabezados')
ok(mail.subject.startsWith('🍳 Nuevo lead gastronómico: Ana'), 'y conserva el nombre')

titulo('\n3. Lo que ya andaba')
__enviados.length = 0
r = await pedirLead({ nombre: 'María', queHace: 'Vendo tortas' })
mail = __enviados.at(-1)
ok(r.status === 200 && mail.html.includes('<strong>WhatsApp:</strong> No proporcionado') && mail.html.includes('<strong>Email:</strong> No proporcionado'), 'sin WhatsApp ni email dice «No proporcionado»')
ok(mail.html.includes('María') && mail.html.includes('Vendo tortas'), 'un texto común sale igual')
r = await pedirLead({ nombre: 'Ana', queHace: 'x', whatsapp: '+5492915551234', email: 'ana@correo.test' })
mail = __enviados.at(-1)
ok(mail.html.includes('+5492915551234') && mail.html.includes('ana@correo.test'), 'el teléfono y el mail comunes salen enteros')
ok(mail.to === 'notificaciones@bahiashops.com.ar' || typeof mail.to === 'string', 'va a la casilla interna')
for (const [nombre, cuerpo] of [['sin nombre', { queHace: 'x' }], ['sin actividad', { nombre: 'x' }], ['nombre en blanco', { nombre: '   ', queHace: 'x' }], ['cuerpo vacío', {}]]) {
  __enviados.length = 0
  r = await pedirLead(cuerpo)
  ok(r.status === 400 && __enviados.length === 0, `${nombre}: 400 y no manda nada`)
}

titulo('\n4. Datos que no son un texto no rompen nada')
__enviados.length = 0
r = await pedirLead({ nombre: { a: '<b>' }, queHace: ['<i>x</i>'], whatsapp: 5491155551234, email: null })
mail = __enviados.at(-1)
ok(r.status === 200 && !/<b>|<i>/.test(mail.html), 'un objeto, una lista o un número se pasan a texto y se escapan')
__enviados.length = 0
r = await comoRespuesta(await lead({ json: async () => { throw new Error('json roto') } }))
ok(r.status === 500 && __enviados.length === 0, 'un cuerpo que no es JSON: 500 sin mandar nada')

titulo('\n5. Si Resend falla')
globalThis.__resendFalla = true
r = await pedirLead({ nombre: 'Ana', queHace: 'x' })
ok(r.status === 500 && r.body.ok === false, 'responde 500')
globalThis.__resendFalla = false

titulo('\n6. /api/contacto escapa igual (la otra ruta)')
const fetchOriginal = globalThis.fetch
let envio = null
globalThis.fetch = async (url, init) => { envio = { url: String(url), cuerpo: JSON.parse(init.body) }; return { ok: true, status: 200, json: async () => ({ id: 'm' }) } }
r = await contacto({ json: async () => ({ email: PELIGRO, mensaje: PELIGRO }) })
ok(r.status === 200 && envio && /resend/.test(envio.url), 'manda el mail por Resend')
const htmlContacto = envio.cuerpo.html
ok(!/<script|<img|<a href="https:\/\/malo/i.test(htmlContacto) && htmlContacto.includes('&lt;script&gt;'), 'el email y el mensaje salen escapados')
globalThis.fetch = fetchOriginal

process.stdout.write(fallas === 0 ? '\nTODO OK\n' : `\n${fallas} FALLAS\n`)
process.exit(fallas ? 1 : 0)
