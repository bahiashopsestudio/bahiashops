// Prueba los dos formularios públicos que guarda el servidor desde la migración
// 032 (antes los guardaba el navegador): /api/leads (interesados en vender
// alimentos; reemplaza a /api/lead-gastronomia) y /api/contacto. Con las rutas
// REALES, una base y un Resend de mentira:
//
//   · validan lo que llega (obligatorios, mail con forma de mail, largos);
//   · guardan con service_role; en contacto, la cuenta sale de la sesión del
//     servidor, nunca de lo que mande el navegador;
//   · los mails internos escapan lo que escribe la persona (sin escapar, podía
//     meter etiquetas, links o un formulario propios en nuestra casilla) y el
//     asunto no puede colar encabezados;
//   · si el mail falla, lo guardado queda y la respuesta es ok.
//
//   npm run probar:lead-gastronomia
//
// No manda ningún mail ni toca Supabase.

import { register } from 'node:module'
import { existsSync } from 'node:fs'

process.env.RESEND_API_KEY = 'clave-de-mentira'

const raiz = new URL('../', import.meta.url)
const loader = `
const src = ${JSON.stringify(new URL('src/', raiz).href)}
const falsos = {
  'resend': 'export class Resend { constructor() { this.emails = { send: async (mail) => { globalThis.__enviados.push(mail); if (globalThis.__resendFalla) throw new Error("caído"); return { data: { id: "m" } } } } } }',
  'next/server': 'export const NextResponse = { json: (body, init) => ({ body, status: (init && init.status) || 200 }) }',
  '@/lib/supabase/admin': 'export function getServiceRoleClient() { return { from: (t) => ({ insert: async (fila) => { globalThis.__guardados.push({ tabla: t, fila }); return { error: globalThis.__baseFalla ? { message: "caída" } : null } } }) } }',
  '@/lib/supabase/server': 'export async function createClient() { return { auth: { getUser: async () => ({ data: { user: globalThis.__sesion } }) } } }',
}
export function resolve(esp, ctx, sig) {
  if (falsos[esp]) return { url: 'data:text/javascript,' + encodeURIComponent(falsos[esp]), shortCircuit: true }
  if (esp.startsWith('@/')) { const r = src + esp.slice(2); return sig(r.endsWith('.js') ? r : r + '.js', ctx) }
  if (esp.startsWith('./') && !esp.endsWith('.js')) return sig(esp + '.js', ctx)
  return sig(esp, ctx)
}`
register('data:text/javascript,' + encodeURIComponent(loader))

globalThis.__enviados = []
globalThis.__guardados = []
globalThis.__resendFalla = false
globalThis.__baseFalla = false
globalThis.__sesion = null

let fallas = 0
const ok = (c, m) => { if (!c) { fallas++; process.stdout.write('  ✗ FALLA: ' + m + '\n') } else process.stdout.write('  ✓ ' + m + '\n') }
const titulo = (t) => process.stdout.write(t + '\n')
console.error = () => {}

const { POST: lead } = await import('../src/app/api/leads/route.js')
const { POST: contacto } = await import('../src/app/api/contacto/route.js')

const comoRespuesta = async (res) => ({ status: res.status, body: await res.json() })
const pedirLead = async (cuerpo) => comoRespuesta(await lead({ json: async () => cuerpo }))
const PELIGRO = '<script>alert(1)</script><img src=x onerror=alert(2)> "><a href="https://malo.test">clic</a> & \''
const limpiar = () => { __enviados.length = 0; __guardados.length = 0 }

titulo('1. /api/leads guarda y escapa')
limpiar()
let r = await pedirLead({ nombre: PELIGRO, queHace: PELIGRO, whatsapp: '+5492915551234', email: 'ana@correo.test' })
let mail = __enviados.at(-1)
ok(r.status === 200 && r.body.ok === true && __enviados.length === 1, 'responde ok y manda un solo mail')
ok(__guardados.length === 1 && __guardados[0].tabla === 'leads_gastronomia', 'lo guarda en leads_gastronomia (con service_role)')
ok(__guardados[0].fila.nombre === PELIGRO.trim() && __guardados[0].fila.que_hace === PELIGRO.trim() && __guardados[0].fila.whatsapp === '+5492915551234' && __guardados[0].fila.email === 'ana@correo.test', 'con los campos de la tabla (que_hace, whatsapp, email)')
for (const campo of ['Nombre', 'Qué hace']) {
  const parte = mail.html.slice(mail.html.indexOf(`<strong>${campo}:</strong>`))
  const linea = parte.slice(0, parte.indexOf('</p>'))
  ok(!/<script|<img|<a /i.test(linea) && linea.includes('&lt;script&gt;') && linea.includes('&quot;') && linea.includes('&amp;') && linea.includes('&#39;'), `${campo}: las etiquetas, comillas y & quedan escapados`)
}
ok(mail.html.includes('<strong>Nombre:</strong>') && mail.html.includes('<h2'), 'el marco del mail (etiquetas nuestras) sigue intacto')
ok(!existsSync(new URL('src/app/api/lead-gastronomia/route.js', raiz)), 'la ruta vieja /api/lead-gastronomia (solo mandaba el mail) ya no existe')

titulo('\n2. El asunto')
limpiar()
r = await pedirLead({ nombre: 'Ana\r\nBcc: otro@malo.test\nX-Cosa: 1', queHace: 'tortas' })
mail = __enviados.at(-1)
ok(!/[\r\n]/.test(mail.subject), 'el asunto es de una sola línea: un salto de línea no puede agregar encabezados')
ok(mail.subject.startsWith('🍳 Nuevo lead gastronómico: Ana'), 'y conserva el nombre')

titulo('\n3. Validación')
limpiar()
r = await pedirLead({ nombre: 'María', queHace: 'Vendo tortas' })
mail = __enviados.at(-1)
ok(r.status === 200 && mail.html.includes('<strong>WhatsApp:</strong> No proporcionado') && mail.html.includes('<strong>Email:</strong> No proporcionado'), 'sin WhatsApp ni email: se guarda y dice «No proporcionado»')
ok(__guardados[0].fila.whatsapp === null && __guardados[0].fila.email === null, 'y se guardan en null')
for (const [nombre, cuerpo] of [
  ['sin nombre', { queHace: 'x' }], ['sin actividad', { nombre: 'x' }], ['nombre en blanco', { nombre: '   ', queHace: 'x' }], ['cuerpo vacío', {}],
  ['un nombre de 2001 caracteres', { nombre: 'x'.repeat(2001), queHace: 'x' }],
  ['un email que no es un email', { nombre: 'x', queHace: 'x', email: 'no-es-un-mail' }],
  ['un email con un salto de línea', { nombre: 'x', queHace: 'x', email: 'a@b.c\nBcc: x@y.z' }],
  ['un WhatsApp con letras', { nombre: 'x', queHace: 'x', whatsapp: 'llamame al cel' }],
  ['un objeto en vez de un texto', { nombre: { a: '<b>' }, queHace: 'x' }],
]) {
  limpiar()
  r = await pedirLead(cuerpo)
  ok(r.status === 400 && __guardados.length === 0 && __enviados.length === 0, `${nombre}: 400, no guarda ni manda nada`)
}
limpiar()
r = await comoRespuesta(await lead({ json: async () => { throw new Error('json roto') } }))
ok(r.status === 400 && __guardados.length === 0, 'un cuerpo que no es JSON: 400')

titulo('\n4. Si algo falla')
limpiar()
globalThis.__resendFalla = true
r = await pedirLead({ nombre: 'Ana', queHace: 'x' })
ok(r.status === 200 && r.body.ok === true && r.body.avisado === false && __guardados.length === 1, 'el mail falla: queda guardado y responde ok (avisado: false)')
globalThis.__resendFalla = false
limpiar()
globalThis.__baseFalla = true
r = await pedirLead({ nombre: 'Ana', queHace: 'x' })
ok(r.status === 500 && __enviados.length === 0, 'la base falla: 500 y no manda el mail')
globalThis.__baseFalla = false

titulo('\n5. /api/contacto')
const fetchOriginal = globalThis.fetch
let envio = null
let resendOk = true
globalThis.fetch = async (url, init) => { envio = { url: String(url), cuerpo: JSON.parse(init.body) }; return { ok: resendOk, status: resendOk ? 200 : 500, json: async () => ({ id: 'm' }) } }
const pedirContacto = async (cuerpo) => contacto({ json: async () => cuerpo })
limpiar()
globalThis.__sesion = { id: 'u-ana', email: 'ana@correo.test' }
r = await pedirContacto({ email: 'ana@correo.test', mensaje: PELIGRO, usuario_id: 'u-otra-persona' })
ok(r.status === 200 && r.body.ok && __guardados.length === 1 && __guardados[0].tabla === 'mensajes_contacto', 'guarda en mensajes_contacto (con service_role)')
ok(__guardados[0].fila.usuario_id === 'u-ana', 'a nombre de la cuenta de la sesión del servidor, aunque el navegador mande otra')
ok(envio && /resend/.test(envio.url) && !/<script|<img|<a href="https:\/\/malo/i.test(envio.cuerpo.html) && envio.cuerpo.html.includes('&lt;script&gt;'), 'manda el aviso, con el mensaje escapado')
limpiar()
globalThis.__sesion = null
r = await pedirContacto({ email: 'beto@correo.test', mensaje: 'hola' })
ok(r.status === 200 && __guardados[0].fila.usuario_id === null, 'sin sesión: sale sin cuenta')
for (const [nombre, cuerpo] of [
  ['sin email', { mensaje: 'hola' }], ['sin mensaje', { email: 'a@b.c' }],
  ['email inválido', { email: 'cualquiera', mensaje: 'hola' }],
  ['email que intenta colar un encabezado', { email: 'a@b.c\r\nBcc: x@y.z', mensaje: 'hola' }],
  ['mensaje de 2001 caracteres', { email: 'a@b.c', mensaje: 'x'.repeat(2001) }],
]) {
  limpiar(); envio = null
  r = await pedirContacto(cuerpo)
  ok(r.status === 400 && __guardados.length === 0 && envio === null, `${nombre}: 400, no guarda ni manda nada`)
}
limpiar()
resendOk = false
r = await pedirContacto({ email: 'a@b.c', mensaje: 'hola' })
ok(r.status === 200 && r.body.avisado === false && __guardados.length === 1, 'el mail falla: el mensaje queda guardado y responde ok')
resendOk = true
limpiar()
globalThis.__baseFalla = true
r = await pedirContacto({ email: 'a@b.c', mensaje: 'hola' })
ok(r.status === 500, 'la base falla: 500 (el navegador muestra el error de siempre)')
globalThis.__baseFalla = false
globalThis.fetch = fetchOriginal

process.stdout.write(fallas === 0 ? '\nTODO OK\n' : `\n${fallas} FALLAS\n`)
process.exit(fallas ? 1 : 0)
