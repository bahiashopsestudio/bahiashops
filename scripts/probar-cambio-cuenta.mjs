// Prueba, con las rutas REALES y una base y un MercadoPago de mentira, qué pasa
// cuando una tienda conecta, cambia o desconecta su cuenta de MercadoPago:
//
//   · se guarda cómo se llama la cuenta y desde cuándo está conectada (nunca el
//     mail de la cuenta de MercadoPago);
//   · cambiar a OTRA cuenta o desconectar cancela los pedidos pendientes que
//     todavía se pueden pagar (cuenta_mp_cambiada), vence sus links y cupones
//     con el token de la cuenta anterior y le avisa por mail a cada persona
//     que compró; volver a conectar la MISMA cuenta no toca nada;
//   · el vendedor recibe un mail, a la dirección de su cuenta, sin tokens, que
//     dice cuántos pedidos se cancelaron;
//   · el webhook avisa cuando ninguna cuenta puede verificar un pago;
//   · el panel recibe el nombre de la cuenta y jamás los tokens.
//
//   npm run probar:cuenta-mp
//
// No toca MercadoPago, Resend ni Supabase.

import { register } from 'node:module'

process.env.RESEND_API_KEY = 'clave-de-mentira'
process.env.MP_CLIENT_ID = 'cliente'
process.env.MP_CLIENT_SECRET = 'secreto-del-cliente'
process.env.MP_REDIRECT_URI = 'https://sitio.test/api/mercadopago/oauth/callback'
delete process.env.MP_WEBHOOK_SECRET

const raiz = new URL('../', import.meta.url)
const loader = `
const src = ${JSON.stringify(new URL('src/', raiz).href)}
const falsos = {
  'next/server': 'const cookies = () => ({ borradas: [], puestas: [], delete(n) { this.borradas.push(n) }, set(n, v, o) { this.puestas.push({ nombre: n, valor: v, opciones: o }) } }); export const NextResponse = { json: (body, init) => ({ body, status: (init && init.status) || 200 }), redirect: (url) => ({ redirect: String(url), cookies: cookies() }) }',
  '@/lib/supabase/server': 'export async function createClient() { return globalThis.__f.sesion }',
  '@supabase/supabase-js': 'export function createClient() { return globalThis.__f.admin }',
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

// ── El mundo de mentira ──
const EMAIL_VENDEDOR = 'vendedora@correo.test'
const TOKEN_VIEJO = 'TOKEN_DE_LA_CUENTA_VIEJA'
const TOKEN_NUEVO = 'TOKEN_DE_LA_CUENTA_NUEVA'
const MAIL_DE_MP = 'secreto-de-la-cuenta-mp@mp.test'

// Quienes compraron: una cuenta normal, otra normal y una cerrada (mail .invalid).
const COMPRADORES = [
  { id: 'c-1', email: 'ana@correo.test', nombre_usuario: 'Nutria Curiosa', cerrada_en: null },
  { id: 'c-2', email: 'beto@correo.test', nombre_usuario: 'Zorro Veloz', cerrada_en: null },
  { id: 'c-3', email: 'borrada-c3@cuentas.invalid', nombre_usuario: 'Cuenta eliminada', cerrada_en: '2026-10-01T00:00:00Z' },
]
const ITEMS = [
  { pedido_id: 1, nombre: 'Taza esmaltada', variante: 'Azul', cantidad: 2, precio: 6500 },
  { pedido_id: 2, nombre: 'Plato playo', variante: null, cantidad: 1, precio: 9800 },
]
const HORA = 3600 * 1000
const enHoras = (h) => new Date(Date.now() + h * HORA).toISOString()
// Pedidos de la tienda 15. Los cobra la cuenta 111 (la vieja) salvo que se diga otra.
const linkVivo = (id, extra = {}) => ({ id, estado: 'pendiente', comprador_id: 'c-1', total: 13000, costo_envio: 0, vence_en: enHoras(1), efectivo_vence_en: null, mp_payment_id: null, mp_preference_id: `PREF-${id}`, mp_user_id_cobro: '111', ...extra })
const cuponVigente = (id, extra = {}) => linkVivo(id, { comprador_id: 'c-2', total: 9800, vence_en: enHoras(-20), efectivo_vence_en: enHoras(40), mp_payment_id: `PAGO-${id}`, ...extra })
const linkVencido = (id, extra = {}) => linkVivo(id, { vence_en: enHoras(-1), ...extra })
const pagado = (id) => linkVivo(id, { estado: 'pagado', mp_payment_id: `PAGO-${id}` })

let f // el escenario de cada prueba

function escenario(opciones = {}) {
  const e = {
    secuencia: [], // lo que pasó, en orden
    upserts: [], deletes: [], flags: [], rpcs: [], puts: [], pagosCancelados: [], cancelaciones: [], mails: [],
    previa: null, // { mp_user_id, mp_nickname } o null
    errorPrevia: false,
    tokenViejoDisponible: true,
    pedidos: [], // los pedidos de la tienda
    pedidosFalla: false,
    prefsQueFallan: new Set(),
    mailsQueFallan: new Set(),
    cuentaNueva: { id: '777', nickname: 'Ludomestica' },
    cuentasParaWebhook: [{ vendedor_id: 15, access_token: 'T', mp_user_id: '111' }],
    pagoLegible: false,
    usersMeFalla: false,
    ...opciones,
  }

  const tabla = (nombre) => {
    let op = 'select'
    let payload = null
    let columnas = null
    let ids = null
    const q = {
      select(c) { if (op === 'select') columnas = String(c).split(',').map((x) => x.trim()); return q },
      eq() { return q },
      in(_, valores) { ids = valores; return q },
      not() { return q },
      upsert(p) { op = 'upsert'; payload = p; return q },
      delete() { op = 'delete'; return q },
      update(p) { op = 'update'; payload = p; return q },
    }
    const proyectar = (fila) => {
      if (!fila || !columnas) return fila
      const salida = {}
      for (const c of columnas) if (c in fila) salida[c] = fila[c]
      return salida
    }
    const resolver = (modo) => {
      if (nombre === 'vendedores') {
        if (op === 'update') { e.flags.push(payload); e.secuencia.push('flag'); return { data: null, error: null } }
        return { data: { id: 15, nombre_negocio: 'Ludoméstica', slug: 'ludomestica' }, error: null }
      }
      if (nombre === 'mercadopago_cuentas') {
        if (op === 'upsert') { e.upserts.push(payload); e.secuencia.push('upsert'); return { data: null, error: null } }
        if (op === 'delete') { e.deletes.push(true); e.secuencia.push('delete'); return { data: e.previa ? [{ vendedor_id: 15 }] : [], error: null } }
        if (modo === 'single') {
          e.secuencia.push('leer_token')
          if (!e.previa || !e.tokenViejoDisponible) return { data: null, error: { message: 'no hay' } }
          return { data: { access_token: TOKEN_VIEJO, refresh_token: 'R', token_expira_en: '2099-01-01T00:00:00Z', mp_user_id: e.previa.mp_user_id }, error: null }
        }
        if (modo === 'lista') return { data: e.cuentasParaWebhook, error: null }
        if (e.errorPrevia) return { data: null, error: { message: 'falla de mentira' } }
        e.secuencia.push('leer_previa')
        return { data: proyectar(e.previa ? { ...e.previa, conectado_en: '2026-09-01T10:00:00Z', token_expira_en: new Date(Date.now() + 40 * 86400000).toISOString(), access_token: TOKEN_VIEJO } : null), error: null }
      }
      if (nombre === 'pedidos') {
        if (e.pedidosFalla) return { data: null, error: { message: 'falla de mentira' } }
        if (op === 'update') {
          // Solo cancela los que siguen pendientes, y devuelve exactamente esos.
          const tocados = e.pedidos.filter((p) => ids.includes(p.id) && p.estado === 'pendiente')
          for (const p of tocados) Object.assign(p, payload)
          e.cancelaciones.push({ payload, ids: tocados.map((p) => p.id) })
          e.secuencia.push('cancelar')
          return { data: tocados.map((p) => ({ ...p })), error: null }
        }
        return { data: e.pedidos.filter((p) => p.estado === 'pendiente').map((p) => ({ ...p })), error: null }
      }
      if (nombre === 'pedido_items') {
        return { data: ITEMS.filter((it) => ids.includes(it.pedido_id)), error: null }
      }
      if (nombre === 'usuarios') {
        return { data: COMPRADORES.filter((c) => ids.includes(c.id)), error: null }
      }
      return { data: null, error: null }
    }
    q.maybeSingle = async () => resolver('uno')
    q.single = async () => resolver('single')
    q.then = (res) => res(resolver(columnas && columnas.includes('access_token') && !columnas.includes('refresh_token') ? 'lista' : 'lista'))
    return q
  }

  e.admin = {
    from: tabla,
    rpc: async (nombre, args) => {
      e.rpcs.push({ nombre, args })
      e.secuencia.push('rpc')
      return e.rpcError ? { data: null, error: { message: e.rpcError } } : { data: e.rpc, error: null }
    },
  }
  e.sesion = { auth: { getUser: async () => ({ data: { user: { id: 'u-1', email: EMAIL_VENDEDOR } } }) }, from: tabla }
  return e
}

// MercadoPago y Resend de mentira.
globalThis.fetch = async (url, init = {}) => {
  const u = String(url)
  const json = (status, cuerpo) => ({ ok: status >= 200 && status < 300, status, json: async () => cuerpo, text: async () => JSON.stringify(cuerpo) })
  if (u.endsWith('/oauth/token')) {
    return json(200, { access_token: TOKEN_NUEVO, refresh_token: 'REFRESH_NUEVO', public_key: 'pk', expires_in: 15552000, user_id: Number(f.cuentaNueva.id) })
  }
  if (u.endsWith('/users/me')) {
    if (f.usersMeFalla) return json(500, { message: 'caído' })
    return json(200, { id: Number(f.cuentaNueva.id), nickname: f.cuentaNueva.nickname, email: MAIL_DE_MP })
  }
  const pref = u.match(/\/checkout\/preferences\/(.+)$/)
  if (pref && init.method === 'PUT') {
    const id = decodeURIComponent(pref[1])
    f.puts.push({ id, auth: init.headers?.Authorization })
    f.secuencia.push('put:' + id)
    return f.prefsQueFallan.has(id) ? json(400, { message: 'no se puede' }) : json(200, { id })
  }
  const pagoMp = u.match(/\/v1\/payments\/(.+)$/)
  if (pagoMp && init.method === 'PUT') {
    const id = decodeURIComponent(pagoMp[1])
    f.pagosCancelados.push({ id, auth: init.headers?.Authorization, cuerpo: JSON.parse(init.body) })
    f.secuencia.push('cancelar_pago:' + id)
    return json(200, { id, status: 'cancelled' })
  }
  if (u.includes('/v1/payments/')) {
    return f.pagoLegible
      ? json(200, { id: 123, status: 'approved', external_reference: '9999', transaction_amount: 10, currency_id: 'ARS', collector_id: 111 })
      : json(404, { message: 'Payment not found' })
  }
  if (u.includes('api.resend.com')) {
    const cuerpo = JSON.parse(init.body)
    if (f.mailsQueFallan.has(cuerpo.to)) return json(500, { message: 'Resend caído para esta dirección' })
    f.mails.push({ para: cuerpo.to, desde: cuerpo.from, responderA: cuerpo.reply_to, asunto: cuerpo.subject, html: cuerpo.html, texto: cuerpo.text })
    f.secuencia.push('mail:' + cuerpo.to)
    return json(200, { id: 'm' })
  }
  throw new Error('llamada inesperada: ' + u)
}

const rutas = {
  callback: (await import('../src/app/api/mercadopago/oauth/callback/route.js')).GET,
  desconectar: (await import('../src/app/api/mercadopago/oauth/disconnect/route.js')).POST,
  webhook: (await import('../src/app/api/mercadopago/webhook/route.js')).POST,
  cuenta: (await import('../src/app/api/mercadopago/cuenta/route.js')).GET,
  empezar: (await import('../src/app/api/mercadopago/oauth/start/route.js')).GET,
}

const SITIO = 'https://sitio.test'
const ESTADO = 'a1b2c3d4e5f60718293a4b5c6d7e8f90a1b2c3d4e5f60718'
// El navegador vuelve de MercadoPago con el "state" en la dirección y la cookie
// que se guardó al empezar. Por defecto coinciden.
const pedirCallback = ({ enUrl = ESTADO, enCookie = ESTADO } = {}) => rutas.callback({
  url: `${SITIO}/api/mercadopago/oauth/callback?code=codigo-de-mentira${enUrl === null ? '' : '&state=' + enUrl}`,
  cookies: { get: (n) => (n === 'mp_oauth_state' && enCookie !== null ? { value: enCookie } : undefined) },
})
const todoElTexto = (e) => e.mails.map((m) => `${m.asunto} ${m.html} ${m.texto}`).join(' ')
const mailAlVendedor = (e) => e.mails.find((m) => m.para === EMAIL_VENDEDOR)
const mailsACompradores = (e) => e.mails.filter((m) => m.para !== EMAIL_VENDEDOR && m.para !== 'notificaciones@bahiashops.com.ar')
const estadoDe = (e, id) => e.pedidos.find((p) => p.id === id)

console.log('1. Primera conexión')
f = globalThis.__f = escenario()
let r = await pedirCallback()
ok(r.redirect === `${SITIO}/vendedor/perfil?mp=exito`, 'vuelve al panel con mp=exito (sin "cancelados")')
ok(f.upserts.length === 1 && f.upserts[0].mp_user_id === '777' && f.upserts[0].mp_nickname === 'Ludomestica', 'guarda el id y el nombre de la cuenta')
ok(!!f.upserts[0].conectado_en && Math.abs(Date.parse(f.upserts[0].conectado_en) - Date.now()) < 5000, 'guarda desde cuándo está conectada, en conectado_en (la columna que ya existía)')
ok(!('conectada_en' in f.upserts[0]), 'y no escribe ninguna columna conectada_en')
ok(!JSON.stringify(f.upserts[0]).includes(MAIL_DE_MP), 'nunca guarda el mail de la cuenta de MercadoPago')
ok(f.cancelaciones.length === 0 && f.puts.length === 0 && f.pagosCancelados.length === 0, 'sin pedidos pendientes: no cancela ni vence nada')
ok(f.mails.length === 1 && mailAlVendedor(f) && mailAlVendedor(f).asunto === 'Conectaste MercadoPago a Ludoméstica', 'un mail al vendedor, a la dirección de su cuenta: "Conectaste MercadoPago a Ludoméstica"')
ok(/Ludomestica/.test(mailAlVendedor(f).texto) && /N° 777/.test(mailAlVendedor(f).texto), 'dice cómo se llama la cuenta y su número')
ok(!todoElTexto(f).includes(TOKEN_NUEVO) && !todoElTexto(f).includes(MAIL_DE_MP) && !todoElTexto(f).includes('REFRESH'), 'el mail no lleva tokens ni el mail de la cuenta de MercadoPago')

// Un pendiente que quedó de una cuenta desconectada antes de este cambio.
f = globalThis.__f = escenario({ pedidos: [linkVivo(1)] })
r = await pedirCallback()
ok(r.redirect === `${SITIO}/vendedor/perfil?mp=exito&cancelados=1`, 'primera conexión con un pendiente de otra cuenta: lo cancela (cancelados=1)')
ok(f.puts.length === 0 && f.pagosCancelados.length === 0, 'sin token de la cuenta anterior no intenta vencer nada en MercadoPago')
ok(mailsACompradores(f).length === 1, 'y le avisa a quien compró')

console.log('\n2. Reconexión a la MISMA cuenta')
f = globalThis.__f = escenario({ previa: { mp_user_id: '777', mp_nickname: 'Ludomestica' }, pedidos: [linkVivo(1, { mp_user_id_cobro: '777' }), cuponVigente(2, { mp_user_id_cobro: '777' })] })
r = await pedirCallback()
ok(r.redirect === `${SITIO}/vendedor/perfil?mp=exito`, 'vuelve con mp=exito')
ok(f.cancelaciones.length === 0 && f.puts.length === 0 && f.pagosCancelados.length === 0, 'NO cancela ni vence nada (la cuenta no cambió), aunque haya pendientes')
ok(estadoDe(f, 1).estado === 'pendiente' && estadoDe(f, 2).estado === 'pendiente', 'los pedidos siguen pendientes')
ok(f.mails.length === 1 && mailAlVendedor(f).asunto === 'Conectaste MercadoPago a Ludoméstica', 'un solo mail, al vendedor: "Conectaste…"')
ok(!('conectado_en' in f.upserts[0]), 'conectado_en NO se manda: sigue siendo la misma cuenta conectada desde la fecha original (el upsert deja la columna como está)')
ok(f.upserts[0].mp_nickname === 'Ludomestica' && f.upserts[0].access_token === 'TOKEN_DE_LA_CUENTA_NUEVA', 'los tokens sí se renuevan')

f = globalThis.__f = escenario({ previa: { mp_user_id: '777', mp_nickname: 'Ludomestica' }, usersMeFalla: true })
r = await pedirCallback()
ok(r.redirect.includes('mp=exito') && f.upserts[0].mp_nickname === 'Ludomestica', 'si /users/me falla al volver a conectar la misma cuenta, se conserva el nombre que ya había (no se pisa con null)')
f = globalThis.__f = escenario({ previa: { mp_user_id: '111', mp_nickname: 'CuentaVieja' }, usersMeFalla: true })
r = await pedirCallback()
ok(f.upserts[0].mp_nickname === null, 'pero si la cuenta es OTRA y /users/me falla, no se arrastra el nombre de la anterior')

console.log('\n3. Cambio a una cuenta DISTINTA')
f = globalThis.__f = escenario({
  previa: { mp_user_id: '111', mp_nickname: 'CuentaVieja' },
  pedidos: [linkVivo(1), cuponVigente(2), linkVencido(3), pagado(4), linkVivo(5, { comprador_id: 'c-3' })],
})
r = await pedirCallback()
ok(r.redirect === `${SITIO}/vendedor/perfil?mp=exito&cambio=1&cancelados=3`, 'vuelve con mp=exito, cambio=1 y cancelados=3')
ok(f.upserts[0].mp_user_id === '777' && f.upserts[0].mp_nickname === 'Ludomestica', 'la cuenta nueva quedó guardada')
ok(f.secuencia.indexOf('upsert') < f.secuencia.indexOf('cancelar'), 'primero guarda la cuenta nueva, después cancela (si guardar falla, no se cancela nada)')
ok(!!f.upserts[0].conectado_en && Math.abs(Date.parse(f.upserts[0].conectado_en) - Date.now()) < 5000, 'conectado_en se renueva: dice desde cuándo está conectada la cuenta NUEVA')
ok(f.cancelaciones.length === 1 && f.cancelaciones[0].ids.join(',') === '1,2,5', 'cancela los pendientes que se podían pagar: link vivo, cupón vigente (1, 2, 5)')
ok(f.cancelaciones[0].payload.estado === 'cancelado' && f.cancelaciones[0].payload.cancelado_motivo === 'cuenta_mp_cambiada' && !!f.cancelaciones[0].payload.actualizado_en, 'con estado cancelado, motivo cuenta_mp_cambiada y actualizado_en')
ok(estadoDe(f, 3).estado === 'pendiente', 'el link ya vencido no: lo cancela el vencimiento de siempre (pago_vencido)')
ok(estadoDe(f, 4).estado === 'pagado', 'el pagado no se toca')
ok(f.puts.map((p) => p.id).sort().join(',') === 'PREF-1,PREF-2,PREF-5' && f.puts.every((p) => p.auth === `Bearer ${TOKEN_VIEJO}`), 'vence los links en MercadoPago con el token de la cuenta VIEJA')
ok(f.pagosCancelados.length === 1 && f.pagosCancelados[0].id === 'PAGO-2' && f.pagosCancelados[0].auth === `Bearer ${TOKEN_VIEJO}` && f.pagosCancelados[0].cuerpo.status === 'cancelled', 'y cancela el cupón en efectivo sin pagar, también con el token viejo')
let compradores = mailsACompradores(f)
ok(compradores.length === 2 && compradores.some((m) => m.para === 'ana@correo.test') && compradores.some((m) => m.para === 'beto@correo.test'), 'un mail a cada persona que compró (2)')
ok(!compradores.some((m) => /invalid/.test(m.para)), 'la cuenta cerrada (.invalid) no recibe mail')
const mailAna = compradores.find((m) => m.para === 'ana@correo.test')
ok(mailAna.asunto === 'Tu pedido en Ludoméstica fue cancelado', `asunto: "${mailAna.asunto}"`)
ok(/Hola Nutria Curiosa\./.test(mailAna.texto) && /2 × Taza esmaltada · Azul/.test(mailAna.texto) && /tienda\/ludomestica/.test(mailAna.texto), 'con el apodo, lo que había pedido y el link a la tienda')
ok(mailAna.desde === 'Bahía Shops <no-reply@bahiashops.com.ar>' && mailAna.responderA === 'hola@bahiashops.com.ar', 'sale de no-reply y se responde a hola@')
const mail = mailAlVendedor(f)
ok(!!mail && mail.asunto === 'Cambiaste la cuenta de MercadoPago de Ludoméstica', 'mail "Cambiaste la cuenta…" al vendedor')
ok(/Ludomestica \(N° 777\)/.test(mail.texto), 'dice cuál es la cuenta nueva')
ok(/Se cancelaron 3 pedidos pendientes de pago/.test(mail.texto), 'y cuántos pedidos se cancelaron')
ok(!/2 horas|efectivo en proceso/.test(mail.texto), 'ya no habla de links que vencen solos ni de pagos en efectivo que se acreditan')
ok(!todoElTexto(f).includes(TOKEN_VIEJO) && !todoElTexto(f).includes(TOKEN_NUEVO) && !todoElTexto(f).includes(MAIL_DE_MP), 'ningún mail lleva tokens ni el mail de la cuenta de MercadoPago')

f = globalThis.__f = escenario({ previa: { mp_user_id: '111', mp_nickname: 'CuentaVieja' }, pedidos: [linkVencido(3)] })
r = await pedirCallback()
ok(r.redirect === `${SITIO}/vendedor/perfil?mp=exito&cambio=1` && f.cancelaciones.length === 0, 'cambio sin pendientes vivos: no cancela nada (sin "cancelados")')
ok(!/cancel/i.test(mailAlVendedor(f).texto), 'y el mail no habla de cancelaciones')

console.log('\n4. Fallas')
f = globalThis.__f = escenario({ errorPrevia: true, pedidos: [linkVivo(1)] })
r = await pedirCallback()
ok(r.redirect.includes('mp=error') && r.redirect.includes('no_guardado'), 'si no se puede leer la cuenta anterior, no se guarda nada y se pide reintentar')
ok(f.upserts.length === 0 && f.mails.length === 0 && f.cancelaciones.length === 0, 'ni se pisa la cuenta, ni se cancela nada, ni se manda mail')
f = globalThis.__f = escenario({ previa: { mp_user_id: '111', mp_nickname: 'CuentaVieja' }, pedidosFalla: true })
r = await pedirCallback()
ok(r.redirect === `${SITIO}/vendedor/perfil?mp=exito&cambio=1` && f.upserts.length === 1, 'si falla leer los pedidos, la conexión queda hecha igual')
ok(f.mails.length === 1 && /Cambiaste la cuenta/.test(mailAlVendedor(f).asunto), 'y el mail al vendedor sale igual')
f = globalThis.__f = escenario({
  previa: { mp_user_id: '111', mp_nickname: 'CuentaVieja' },
  pedidos: [linkVivo(1), cuponVigente(2)],
  prefsQueFallan: new Set(['PREF-1']),
  mailsQueFallan: new Set(['ana@correo.test']),
})
r = await pedirCallback()
ok(r.redirect.includes('cancelados=2') && estadoDe(f, 1).estado === 'cancelado', 'si MercadoPago no vence un link o un mail falla, el pedido queda cancelado igual')
ok(mailsACompradores(f).length === 1 && mailsACompradores(f)[0].para === 'beto@correo.test', 'el mail que falla no frena a los demás')
ok(!!mailAlVendedor(f), 'y el del vendedor sale')

console.log('\n5. Desconectar')
f = globalThis.__f = escenario({ previa: { mp_user_id: '777', mp_nickname: 'Ludomestica' }, pedidos: [linkVivo(1), cuponVigente(2), linkVencido(3)] })
r = await rutas.desconectar()
ok(r.status === 200 && r.body.ok === true && r.body.habiaConexion === true && r.body.pedidosCancelados === 2, 'responde ok, con 2 pedidos cancelados')
ok(f.deletes.length === 1 && f.flags[0]?.mercadopago_conectado === false, 'borra la cuenta y apaga el flag')
ok(f.secuencia.indexOf('delete') < f.secuencia.indexOf('cancelar'), 'borra la cuenta ANTES de cancelar: nadie puede crear un pedido nuevo con ella mientras tanto')
ok(f.cancelaciones[0].ids.join(',') === '1,2' && f.cancelaciones[0].payload.cancelado_motivo === 'cuenta_mp_cambiada', 'cancela los dos pendientes vivos con cuenta_mp_cambiada')
ok(f.puts.length === 2 && f.puts.every((p) => p.auth === `Bearer ${TOKEN_VIEJO}`) && f.pagosCancelados.length === 1, 'vence los links y el cupón con el token que se leyó antes de borrar')
ok(mailsACompradores(f).length === 2, 'avisa a las 2 personas que compraron')
ok(mailAlVendedor(f)?.asunto === 'Desconectaste MercadoPago de Ludoméstica' && /Se cancelaron 2 pedidos pendientes de pago/.test(mailAlVendedor(f).texto), 'mail "Desconectaste…" al vendedor, con los 2 cancelados')
ok(!todoElTexto(f).includes(TOKEN_VIEJO), 'sin tokens en los mails')

f = globalThis.__f = escenario({ previa: { mp_user_id: '777', mp_nickname: 'Ludomestica' } })
r = await rutas.desconectar()
ok(r.status === 200 && r.body.pedidosCancelados === 0 && f.cancelaciones.length === 0, 'sin pendientes: no cancela nada')
ok(f.mails.length === 1 && !/cancel/i.test(mailAlVendedor(f).texto), 'y el mail al vendedor no habla de cancelaciones')

f = globalThis.__f = escenario({ previa: null })
r = await rutas.desconectar()
ok(r.status === 200 && r.body.habiaConexion === false && f.mails.length === 0, 'desconectar sin ninguna cuenta: no manda mail al vendedor')
f = globalThis.__f = escenario({ previa: null, pedidos: [linkVivo(1)] })
r = await rutas.desconectar()
ok(r.body.pedidosCancelados === 1 && mailsACompradores(f).length === 1 && !mailAlVendedor(f), 'pero si quedó un pendiente (la vez anterior falló la cancelación), lo cancela y avisa a quien compró')

f = globalThis.__f = escenario({ previa: { mp_user_id: '777', mp_nickname: 'Ludomestica' }, pedidosFalla: true })
r = await rutas.desconectar()
ok(r.status === 200 && f.deletes.length === 1 && r.body.pedidosCancelados === 0, 'si falla leer los pedidos, la desconexión se hace igual (es lo que la persona pidió)')

console.log('\n5b. El "state" de la conexión')
f = globalThis.__f = escenario()
r = await pedirCallback()
ok(r.cookies.borradas.includes('mp_oauth_state'), 'una conexión buena borra la cookie del state: sirve una sola vez')
let intentos = 0
const contarCanjes = globalThis.fetch
globalThis.fetch = async (url, init) => { if (String(url).endsWith('/oauth/token')) intentos++; return contarCanjes(url, init) }
for (const [nombre, args] of [
  ['sin state en la dirección', { enUrl: null }],
  ['sin la cookie', { enCookie: null }],
  ['un state distinto al de la cookie', { enUrl: 'ffffffffffffffffffffffffffffffffffffffffffffffff' }],
  ['un state demasiado corto', { enUrl: 'abc', enCookie: 'abc' }],
  ['un state vacío en los dos lados', { enUrl: '', enCookie: '' }],
]) {
  f = globalThis.__f = escenario()
  intentos = 0
  r = await pedirCallback(args)
  ok(r.redirect === `${SITIO}/vendedor/perfil?mp=error&motivo=state_invalido`, `${nombre}: vuelve al panel con el error de state`)
  ok(intentos === 0 && f.upserts.length === 0 && f.mails.length === 0, `${nombre}: no canjea el código, no guarda nada, no manda mail`)
  ok(r.cookies.borradas.includes('mp_oauth_state'), `${nombre}: igual borra la cookie`)
}
globalThis.fetch = contarCanjes

f = globalThis.__f = escenario()
const salida = await rutas.empezar()
const url = new URL(salida.redirect)
const cookie = salida.cookies.puestas[0]
ok(url.origin + url.pathname === 'https://auth.mercadopago.com.ar/authorization', 'empezar manda a la autorización de MercadoPago')
ok(/^[0-9a-f]{48}$/.test(url.searchParams.get('state')), 'con un state de 48 caracteres al azar')
ok(cookie && cookie.nombre === 'mp_oauth_state' && cookie.valor === url.searchParams.get('state'), 'y la misma cookie en el navegador')
ok(cookie.opciones.httpOnly === true && cookie.opciones.sameSite === 'lax' && cookie.opciones.path === '/api/mercadopago/oauth' && cookie.opciones.maxAge === 600, 'cookie httpOnly, sameSite lax, solo para las rutas del OAuth y de 10 minutos')
const otra = await rutas.empezar()
ok(new URL(otra.redirect).searchParams.get('state') !== url.searchParams.get('state'), 'cada conexión tiene un state distinto')
f = globalThis.__f = escenario()
r = await pedirCallback({ enUrl: url.searchParams.get('state'), enCookie: cookie.valor })
ok(r.redirect.includes('mp=exito'), 'y el state que genera empezar es el que acepta el callback')

console.log('\n6. El webhook avisa cuando ninguna cuenta puede verificar un pago')
const aviso = { type: 'payment', action: 'payment.updated', data: { id: '123' }, user_id: '111', live_mode: true }
const pedirWebhook = () => rutas.webhook({ json: async () => aviso, headers: { get: () => null } })
f = globalThis.__f = escenario({ pagoLegible: false })
r = await pedirWebhook()
ok(r.status === 200 && r.body.recibido === true, 'responde 200 (MercadoPago no reintenta)')
ok(f.mails.length === 1 && f.mails[0].para === 'notificaciones@bahiashops.com.ar' && /no se pudo verificar/.test(f.mails[0].asunto), 'mail interno: aviso de pago que no se pudo verificar')
ok(/123/.test(f.mails[0].texto) && /payment.updated/.test(f.mails[0].texto) && /111/.test(f.mails[0].texto), 'con el id del pago, el tipo de aviso y la cuenta que cobró')
f = globalThis.__f = escenario({ cuentasParaWebhook: [] })
r = await pedirWebhook()
ok(r.status === 200 && f.mails.length === 1 && /no se pudo verificar/.test(f.mails[0].asunto), 'sin ninguna cuenta conectada también avisa')
f = globalThis.__f = escenario({ pagoLegible: true })
r = await pedirWebhook()
ok(r.status === 200 && f.mails.length === 0, 'si algún token SÍ puede ver el pago, no hay mail de "sin verificar"')

console.log('\n7. El panel recibe la cuenta, nunca los tokens')
f = globalThis.__f = escenario({ previa: { mp_user_id: '777', mp_nickname: 'Ludomestica' } })
r = await rutas.cuenta()
ok(r.status === 200 && r.body.conectada === true && r.body.id === '777' && r.body.nickname === 'Ludomestica', 'devuelve el nombre y el número de la cuenta')
ok(r.body.conectado_en === '2026-09-01T10:00:00Z' && r.body.dias_restantes >= 39 && r.body.dias_restantes <= 40, 'y desde cuándo está conectada y cuántos días le quedan al permiso')
ok(!JSON.stringify(r.body).includes(TOKEN_VIEJO) && !/token/i.test(Object.keys(r.body).join(' ')), 'ninguna clave ni valor de token en la respuesta')
ok(r.body.pendientes === 0, 'sin pedidos pendientes: pendientes = 0 (cartel sin pedidos)')
f = globalThis.__f = escenario({ previa: { mp_user_id: '777', mp_nickname: 'Ludomestica' }, pedidos: [linkVivo(1), cuponVigente(2), linkVencido(3), pagado(4)] })
r = await rutas.cuenta()
ok(r.body.pendientes === 2, 'con pendientes: cuenta los que se cancelarían (2; el vencido y el pagado no)')
ok(f.cancelaciones.length === 0, 'contar no cancela nada')
f = globalThis.__f = escenario({ previa: { mp_user_id: '777', mp_nickname: 'Ludomestica' }, pedidosFalla: true })
r = await rutas.cuenta()
ok(r.status === 200 && r.body.conectada === true && r.body.pendientes === null, 'si no se pueden contar: pendientes = null (el cartel avisa sin el número)')
f = globalThis.__f = escenario({ previa: null })
r = await rutas.cuenta()
ok(r.status === 200 && r.body.conectada === false, 'sin cuenta: conectada = false')

console.log(fallas === 0 ? '\nTODO OK' : `\n${fallas} FALLAS`)
process.exit(fallas ? 1 : 0)
