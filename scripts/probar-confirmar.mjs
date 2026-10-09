// Prueba la confirmación de los enlaces de los mails de Supabase Auth en la ruta
// propia (/auth/confirmar/verificar), con la ruta REAL y un Supabase de mentira:
//
//   · confirma con verifyOtp y el token_hash, sin nada del navegador donde se
//     hizo el registro (el caso: registrarse en la computadora y abrir el mail
//     en el celular);
//   · cada type va a su lugar; el registro vuelve a donde estaba la persona;
//   · el destino nunca sale del sitio (ni por next ni por redirect_to);
//   · un formulario de otro sitio no puede usarla;
//   · un enlace vencido o ya usado da un mensaje claro.
//
//   npm run probar:confirmar

import { register } from 'node:module'

const raiz = new URL('../', import.meta.url)
const loader = `
const src = ${JSON.stringify(new URL('src/', raiz).href)}
const falsos = {
  'next/server': 'export const NextResponse = { redirect: (url, status) => ({ redirect: String(url), status: status || 307 }) }',
  '@/lib/supabase/server': 'export async function createClient() { return globalThis.__f.supabase }',
}
export function resolve(esp, ctx, sig) {
  if (falsos[esp]) return { url: 'data:text/javascript,' + encodeURIComponent(falsos[esp]), shortCircuit: true }
  if (esp.startsWith('@/')) { const r = src + esp.slice(2); return sig(r.endsWith('.js') ? r : r + '.js', ctx) }
  if (esp.startsWith('./') && !esp.endsWith('.js')) return sig(esp + '.js', ctx)
  return sig(esp, ctx)
}`
register('data:text/javascript,' + encodeURIComponent(loader))

let fallas = 0
const ok = (c, m) => { if (!c) { fallas++; process.stdout.write('  ✗ FALLA: ' + m + '\n') } else process.stdout.write('  ✓ ' + m + '\n') }
const titulo = (t) => process.stdout.write(t + '\n')
console.warn = () => {}

const SITIO = 'https://bahiashops.com.ar'
const TOKEN = 'pkce_9f8e7d6c5b4a39281706f5e4d3c2b1a0'

let f
function escenario({ error = null, bienvenidaVista = '2026-10-01T00:00:00Z' } = {}) {
  const e = { llamadas: [], canjes: 0 }
  e.supabase = {
    auth: {
      verifyOtp: async (args) => { e.llamadas.push(args); return error ? { data: null, error } : { data: { user: { id: 'u-1' }, session: {} }, error: null } },
      // Si la ruta usara el flujo PKCE, haría falta la clave del otro navegador.
      exchangeCodeForSession: async () => { e.canjes++; return { error: { message: 'code verifier missing' } } },
    },
    from: () => ({ select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: { bienvenida_vista_en: bienvenidaVista }, error: null }) }) }) }),
  }
  return e
}

const { POST } = await import('../src/app/auth/confirmar/verificar/route.js')
const { leerConfirmacion, siguienteDesde, mensajeDeError } = await import('../src/lib/confirmacionAuth.js')

function pedir(campos, { origen = SITIO } = {}) {
  const form = new Map(Object.entries(campos))
  return POST({
    url: `${SITIO}/auth/confirmar/verificar`,
    headers: { get: (n) => (n.toLowerCase() === 'origin' ? origen : null) },
    formData: async () => ({ get: (k) => (form.has(k) ? form.get(k) : null) }),
  })
}

titulo('1. Registro en un navegador, confirmación en otro')
f = globalThis.__f = escenario()
let r = await pedir({ token_hash: TOKEN, type: 'email', redirect_to: `${SITIO}/auth/callback?next=%2Fcheckout` })
ok(f.llamadas.length === 1 && f.llamadas[0].token_hash === TOKEN && f.llamadas[0].type === 'email', 'confirma con verifyOtp, el token_hash y type=email')
ok(f.canjes === 0, 'no usa el canje de PKCE (que necesita la clave guardada en el navegador del registro)')
ok(r.status === 303 && r.redirect === `${SITIO}/checkout`, 'y vuelve a donde estaba la persona (/checkout), con 303')

f = globalThis.__f = escenario({ bienvenidaVista: null })
r = await pedir({ token_hash: TOKEN, type: 'email', redirect_to: `${SITIO}/auth/callback?next=%2Fcheckout` })
ok(r.redirect === `${SITIO}/bienvenida?next=%2Fcheckout`, 'la primera vez pasa por la bienvenida, llevando el next')

titulo('\n2. Cada type a su lugar')
for (const [tipo, destino] of [['recovery', '/actualizar-contrasena'], ['email_change', '/perfil'], ['invite', '/actualizar-contrasena']]) {
  f = globalThis.__f = escenario()
  r = await pedir({ token_hash: TOKEN, type: tipo, next: '/checkout' })
  ok(f.llamadas[0]?.type === tipo && r.redirect === `${SITIO}${destino}`, `${tipo} → ${destino} (aunque venga otro next)`)
}

titulo('\n3. Nunca afuera del sitio')
for (const [nombre, campos] of [
  ['next a otro sitio', { next: 'https://malo.test/robar' }],
  ['next con //', { next: '//malo.test' }],
  ['next con barra invertida', { next: '/\\malo.test' }],
  ['redirect_to de otro sitio', { redirect_to: 'https://malo.test/auth/callback?next=%2Fcheckout' }],
  ['redirect_to del sitio con un next afuera', { redirect_to: `${SITIO}/auth/callback?next=https%3A%2F%2Fmalo.test` }],
  ['redirect_to que no es una URL', { redirect_to: 'javascript:alert(1)' }],
]) {
  f = globalThis.__f = escenario()
  r = await pedir({ token_hash: TOKEN, type: 'email', ...campos })
  ok(r.redirect === `${SITIO}/`, `${nombre}: va al inicio del sitio`)
}

titulo('\n4. Un formulario de otro sitio no puede usarla')
f = globalThis.__f = escenario()
r = await pedir({ token_hash: TOKEN, type: 'email' }, { origen: 'https://malo.test' })
ok(r.redirect === `${SITIO}/auth/confirmar?error=origen` && f.llamadas.length === 0, 'otro origen: no llama a Supabase y muestra el error')
f = globalThis.__f = escenario()
r = await pedir({ token_hash: TOKEN, type: 'email' }, { origen: null })
ok(f.llamadas.length === 1, 'sin cabecera Origin (navegadores viejos): se acepta')

titulo('\n5. Enlaces rotos, vencidos o ya usados')
for (const [nombre, campos] of [
  ['type inventado', { token_hash: TOKEN, type: 'admin' }],
  ['sin type', { token_hash: TOKEN }],
  ['token con caracteres raros', { token_hash: 'abc<script>xyz123', type: 'email' }],
  ['token muy corto', { token_hash: 'abc', type: 'email' }],
  ['sin token', { type: 'email' }],
]) {
  f = globalThis.__f = escenario()
  r = await pedir(campos)
  ok(r.redirect === `${SITIO}/auth/confirmar?error=invalido` && f.llamadas.length === 0, `${nombre}: «no es válido», sin llamar a Supabase`)
}
f = globalThis.__f = escenario({ error: { code: 'otp_expired', message: 'Email link is invalid or has expired' } })
r = await pedir({ token_hash: TOKEN, type: 'recovery' })
ok(r.redirect === `${SITIO}/auth/confirmar?error=vencido&type=recovery`, 'vencido o ya usado: «ya no sirve», con el type para ofrecer otro enlace')
f = globalThis.__f = escenario({ error: { code: 'unexpected_failure', message: 'boom' } })
r = await pedir({ token_hash: TOKEN, type: 'email' })
ok(r.redirect === `${SITIO}/auth/confirmar?error=invalido&type=email`, 'otro error: «no es válido»')
ok(/Venció o ya se usó/.test(mensajeDeError('vencido').texto) && /sirve una sola vez/.test(mensajeDeError('vencido').texto), 'el mensaje de vencido dice qué pasó y qué hacer')

titulo('\n6. Lo que revisa la página antes de mostrar el botón')
ok(leerConfirmacion({ token_hash: TOKEN, type: 'email' }, '').ok === true, 'un enlace bien formado: muestra el botón')
ok(leerConfirmacion({ token_hash: TOKEN, type: 'magiclink' }, '').ok === false, 'un type que el sitio no usa: no')
ok(siguienteDesde({ redirect_to: `${SITIO}/auth/callback?next=%2Fmis-pedidos` }, SITIO) === '/mis-pedidos', 'el next se saca del redirect_to del sitio')
ok(siguienteDesde({ redirect_to: `${SITIO}/auth/callback?next=%2Fmis-pedidos` }, '') === '/', 'sin saber el origen, el redirect_to no se usa')

process.stdout.write(fallas === 0 ? '\nTODO OK\n' : `\n${fallas} FALLAS\n`)
process.exit(fallas ? 1 : 0)
