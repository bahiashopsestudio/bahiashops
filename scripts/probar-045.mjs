// Prueba de la migración 045 contra una base local (PGlite: Postgres real en
// WebAssembly, sin instalar nada) y de /api/local-shops con la ruta REAL, una
// base y un Resend de mentira. No manda ningún mail ni toca Supabase.
//
//   npm run probar:045
//
// Lo que NO prueba: RLS con PostgREST ni el envío real del mail.

import { register } from 'node:module'
import { readFileSync } from 'node:fs'
import { PGlite } from '@electric-sql/pglite'

process.env.RESEND_API_KEY = 'clave-de-mentira'

const raiz = new URL('../', import.meta.url)
const loader = `
const src = ${JSON.stringify(new URL('src/', raiz).href)}
const falsos = {
  'resend': 'export class Resend { constructor() { this.emails = { send: async (mail) => { globalThis.__enviados.push(mail); if (globalThis.__resendFalla) throw new Error("caído"); return { data: { id: "m" } } } } } }',
  '@/lib/supabase/admin': 'export function getServiceRoleClient() { return { rpc: async (nombre, args) => { globalThis.__llamadas.push({ nombre, args }); return globalThis.__respuestaBase } } }',
}
export function resolve(esp, ctx, sig) {
  if (falsos[esp]) return { url: 'data:text/javascript,' + encodeURIComponent(falsos[esp]), shortCircuit: true }
  if (esp.startsWith('@/')) { const r = src + esp.slice(2); return sig(r.endsWith('.js') ? r : r + '.js', ctx) }
  if (esp.startsWith('./') && !esp.endsWith('.js')) return sig(esp + '.js', ctx)
  return sig(esp, ctx)
}`
register('data:text/javascript,' + encodeURIComponent(loader))

let fallas = 0
const ok = (c, m) => { if (!c) { fallas++; console.log('  ✗ FALLA:', m) } else console.log('  ✓', m) }
const errorOriginal = console.error
console.error = () => {}

// ── La base ──────────────────────────────────────────────────────────────────
const MIG = readFileSync(new URL('sql/migrations/045_ciudades_local_shops.sql', raiz), 'utf8')
const db = new PGlite()
const q = async (sql, p) => (await db.query(sql, p)).rows
await db.exec(`create role anon; create role authenticated; create role service_role; create schema privado;`)

console.log('1. La migración corre, y corre dos veces')
await db.exec(MIG)
await db.exec(MIG)
ok(true, 'corrió dos veces sin error')
const [rls] = await q("select relrowsecurity as rls from pg_class where oid = 'public.ciudades_local_shops'::regclass")
ok(rls.rls === true, 'RLS activado')

console.log('\n2. Nace cerrada')
for (const rol of ['anon', 'authenticated']) {
  for (const permiso of ['select', 'insert', 'update', 'delete']) {
    const [r] = await q(`select has_table_privilege('${rol}', 'public.ciudades_local_shops', '${permiso}') as puede`)
    ok(r.puede === false, `${rol} no tiene ${permiso}`)
  }
  const [f] = await q(`select has_function_privilege('${rol}', 'public.rpc_registrar_local_shops(text, text)', 'execute') as puede`)
  ok(f.puede === false, `${rol} no ejecuta la función`)
}
const [sr] = await q("select has_function_privilege('service_role', 'public.rpc_registrar_local_shops(text, text)', 'execute') as puede")
ok(sr.puede === true, 'service_role ejecuta la función')

console.log('\n3. Las reglas de la tabla')
const registrar = async (p, c) => (await q('select public.rpc_registrar_local_shops($1, $2) as r', [p, c]))[0].r
const falla = async (p, c) => { try { await registrar(p, c); return false } catch { return true } }
ok((await registrar('Neuquén', 'Zapala')).ok === true, 'un pedido válido se guarda')
ok(await falla('Neuquén', ''), 'ciudad vacía: rechazada')
ok(await falla('Neuquén', ' Zapala'), 'ciudad sin recortar: rechazada')
ok(await falla('Neuquén', 'x'.repeat(121)), '121 caracteres: rechazada')
ok(await falla('x'.repeat(61), 'Zapala'), 'provincia absurda: rechazada')

console.log('\n4. El tope de 100 por día')
await db.exec('truncate public.ciudades_local_shops')
for (let i = 0; i < 100; i++) await registrar('Chaco', `Ciudad ${i}`)
const contar = async () => Number((await q('select count(*) as n from public.ciudades_local_shops'))[0].n)
ok((await contar()) === 100, 'entran 100')
const pasado = await registrar('Chaco', 'La 101')
ok(pasado.ok === false && pasado.motivo === 'tope', 'la 101 responde tope')
ok((await contar()) === 100, 'y no se guarda')
await db.exec("update public.ciudades_local_shops set creado_en = now() - interval '2 days'")
ok((await registrar('Chaco', 'Al otro día')).ok === true, 'los pedidos de otro día no cuentan')
await db.close()

// ── La ruta ──────────────────────────────────────────────────────────────────
globalThis.__enviados = []
globalThis.__llamadas = []
globalThis.__resendFalla = false
globalThis.__respuestaBase = { data: { ok: true }, error: null }
const { POST } = await import('../src/app/api/local-shops/route.js')
const { PROVINCIAS } = await import('../src/lib/direcciones.js')
const limpiar = () => { __enviados.length = 0; __llamadas.length = 0; __resendFalla = false; __respuestaBase = { data: { ok: true }, error: null } }
const pedir = async (cuerpo) => {
  const res = await POST({ json: async () => { if (cuerpo === 'roto') throw new Error('json'); return cuerpo } })
  return { status: res.status, body: await res.json() }
}
const PELIGRO = '<script>alert(1)</script><img src=x onerror=alert(2)> "><a href="https://malo.test">clic</a>'

console.log('\n5. Un pedido normal')
limpiar()
let r = await pedir({ provincia: 'Neuquén', ciudad: '  Zapala  ', empresa_web: '' })
ok(r.status === 200 && r.body.ok && r.body.avisado, 'responde ok')
ok(__llamadas[0]?.nombre === 'rpc_registrar_local_shops' && __llamadas[0].args.p_ciudad === 'Zapala' && __llamadas[0].args.p_provincia === 'Neuquén', 'guarda provincia y ciudad recortada')
ok(__enviados.length === 1 && __enviados[0].subject === '📍 Interés en Local Shops: Zapala, Neuquén', 'el mail sale, con su asunto de siempre')

console.log('\n6. Escape')
limpiar()
r = await pedir({ provincia: 'Neuquén', ciudad: PELIGRO })
const html = __enviados[0]?.html || ''
ok(r.status === 200, 'lo guarda como lo escribieron')
ok(!html.includes('<script') && !html.includes('<img') && !html.includes('<a href'), 'el HTML del mail no trae etiquetas de la persona')
ok(html.includes('&lt;script&gt;'), 'las muestra escapadas')
limpiar()
r = await pedir({ provincia: 'Neuquén', ciudad: 'Zapala\nBcc: otro@malo.test' })
ok(r.status === 400 && __enviados.length === 0 && __llamadas.length === 0, 'un salto de línea en la ciudad: 400, sin guardar ni mandar')

console.log('\n7. Lo que llega mal')
for (const [nombre, cuerpo] of [
  ['JSON roto', 'roto'],
  ['sin datos', {}],
  ['provincia que no está en la lista', { provincia: 'Narnia', ciudad: 'Zapala' }],
  ['provincia que no es texto', { provincia: ['Neuquén'], ciudad: 'Zapala' }],
  ['ciudad que no es texto', { provincia: 'Neuquén', ciudad: 8300 }],
  ['ciudad vacía', { provincia: 'Neuquén', ciudad: '   ' }],
  ['121 caracteres', { provincia: 'Neuquén', ciudad: 'x'.repeat(121) }],
]) {
  limpiar()
  r = await pedir(cuerpo)
  ok(r.status === 400 && !r.body.ok && __llamadas.length === 0 && __enviados.length === 0, `${nombre}: 400, sin guardar ni mandar`)
}
limpiar()
r = await pedir({ provincia: 'Neuquén', ciudad: 'x'.repeat(120) })
ok(r.status === 200, '120 caracteres: entra')

console.log('\n8. El campo trampa')
limpiar()
r = await pedir({ provincia: 'Neuquén', ciudad: 'Zapala', empresa_web: 'https://spam.test' })
ok(r.status === 200 && r.body.ok, 'responde ok, para que el bot no se entere')
ok(__llamadas.length === 0 && __enviados.length === 0, 'y no guarda ni manda nada')

console.log('\n9. Cuando algo falla')
limpiar()
__resendFalla = true
r = await pedir({ provincia: 'Neuquén', ciudad: 'Zapala' })
ok(r.status === 200 && r.body.ok && r.body.avisado === false && __llamadas.length === 1, 'falla el mail: lo guardado queda y responde ok')
limpiar()
__respuestaBase = { data: null, error: { message: 'caída' } }
r = await pedir({ provincia: 'Neuquén', ciudad: 'Zapala' })
ok(r.status === 500 && __enviados.length === 0, 'falla el guardado: 500 y sin mail')
limpiar()
__respuestaBase = { data: { ok: false, motivo: 'tope' }, error: null }
r = await pedir({ provincia: 'Neuquén', ciudad: 'Zapala' })
ok(r.status === 429 && !r.body.ok && __enviados.length === 0, 'pasado el tope: 429 y sin mail')

console.log('\n10. La lista de provincias del formulario')
const ANTES = ['Buenos Aires', 'Catamarca', 'Chaco', 'Chubut', 'Ciudad Autónoma de Buenos Aires', 'Córdoba', 'Corrientes', 'Entre Ríos', 'Formosa', 'Jujuy', 'La Pampa', 'La Rioja', 'Mendoza', 'Misiones', 'Neuquén', 'Río Negro', 'Salta', 'San Juan', 'San Luis', 'Santa Cruz', 'Santa Fe', 'Santiago del Estero', 'Tierra del Fuego', 'Tucumán']
const AHORA = [...PROVINCIAS].sort((a, b) => a.localeCompare(b, 'es'))
ok(JSON.stringify(AHORA) === JSON.stringify(ANTES), 'las mismas 24, en el mismo orden que tenía el formulario')

console.error = errorOriginal
console.log(fallas ? `\n✗ ${fallas} fallas` : '\n✓ Todo bien')
process.exitCode = fallas ? 1 : 0
