// Prueba, con las rutas REALES y una base y un MercadoPago de mentira, qué pasa
// cuando una tienda conecta, cambia o desconecta su cuenta de MercadoPago:
//
//   · se guarda cómo se llama la cuenta y desde cuándo está conectada (nunca el
//     mail de la cuenta de MercadoPago);
//   · si la cuenta es DISTINTA, los pedidos sin pagar se cancelan y sus links se
//     vencen con el token de la cuenta VIEJA (nunca con el de la nueva);
//   · el vendedor recibe un mail, a la dirección de su cuenta, sin tokens;
//   · si un link no se puede vencer, avisa un mail interno;
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
  'next/server': 'export const NextResponse = { json: (body, init) => ({ body, status: (init && init.status) || 200 }), redirect: (url) => ({ redirect: String(url) }) }',
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

let f // el escenario de cada prueba

function escenario(opciones = {}) {
  const e = {
    secuencia: [], // lo que pasó, en orden
    upserts: [], deletes: [], flags: [], rpcs: [], puts: [], mails: [],
    previa: null, // { mp_user_id, mp_nickname } o null
    errorPrevia: false,
    tokenViejoDisponible: true,
    rpc: { cancelados: [], en_proceso: 0 },
    rpcError: null,
    prefsQueFallan: new Set(),
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
    const q = {
      select(c) { if (op === 'select') columnas = String(c).split(',').map((x) => x.trim()); return q },
      eq() { return q },
      in() { return q },
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
        return { data: { id: 15, nombre_negocio: 'Ludoméstica' }, error: null }
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
        return { data: proyectar(e.previa ? { ...e.previa, conectado_en: '2026-09-01T10:00:00Z', token_expira_en: new Date(Date.now() + 40 * 86400000).toISOString(), access_token: 'NO_DEBE_SALIR' } : null), error: null }
      }
      if (nombre === 'pedidos') return { data: null, error: null }
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
  if (u.includes('/v1/payments/')) {
    return f.pagoLegible
      ? json(200, { id: 123, status: 'approved', external_reference: '9999', transaction_amount: 10, currency_id: 'ARS', collector_id: 111 })
      : json(404, { message: 'Payment not found' })
  }
  if (u.includes('api.resend.com')) {
    const cuerpo = JSON.parse(init.body)
    f.mails.push({ para: cuerpo.to, asunto: cuerpo.subject, html: cuerpo.html, texto: cuerpo.text })
    return json(200, { id: 'm' })
  }
  throw new Error('llamada inesperada: ' + u)
}

const rutas = {
  callback: (await import('../src/app/api/mercadopago/oauth/callback/route.js')).GET,
  desconectar: (await import('../src/app/api/mercadopago/oauth/disconnect/route.js')).POST,
  webhook: (await import('../src/app/api/mercadopago/webhook/route.js')).POST,
  cuenta: (await import('../src/app/api/mercadopago/cuenta/route.js')).GET,
}

const SITIO = 'https://sitio.test'
const pedirCallback = () => rutas.callback({ url: `${SITIO}/api/mercadopago/oauth/callback?code=codigo-de-mentira` })
const todoElTexto = (e) => e.mails.map((m) => `${m.asunto} ${m.html} ${m.texto}`).join(' ')
const mailAlVendedor = (e) => e.mails.find((m) => m.para === EMAIL_VENDEDOR)
const mailInterno = (e) => e.mails.find((m) => m.para !== EMAIL_VENDEDOR)

console.log('1. Primera conexión')
f = globalThis.__f = escenario()
let r = await pedirCallback()
ok(r.redirect === `${SITIO}/vendedor/perfil?mp=exito`, 'vuelve al panel con mp=exito (sin "cancelados")')
ok(f.upserts.length === 1 && f.upserts[0].mp_user_id === '777' && f.upserts[0].mp_nickname === 'Ludomestica', 'guarda el id y el nombre de la cuenta')
ok(!!f.upserts[0].conectado_en && Math.abs(Date.parse(f.upserts[0].conectado_en) - Date.now()) < 5000, 'guarda desde cuándo está conectada, en conectado_en (la columna que ya existía)')
ok(!('conectada_en' in f.upserts[0]), 'y no escribe ninguna columna conectada_en')
ok(!JSON.stringify(f.upserts[0]).includes(MAIL_DE_MP), 'nunca guarda el mail de la cuenta de MercadoPago')
ok(f.rpcs.length === 0 && f.puts.length === 0, 'no cancela ni vence nada: no había otra cuenta')
ok(f.mails.length === 1 && mailAlVendedor(f) && /Conectaste/.test(mailAlVendedor(f).asunto), 'un mail al vendedor, a la dirección de su cuenta: "Conectaste…"')
ok(/Ludomestica/.test(mailAlVendedor(f).texto) && /N° 777/.test(mailAlVendedor(f).texto), 'dice cómo se llama la cuenta y su número')
ok(!todoElTexto(f).includes(TOKEN_NUEVO) && !todoElTexto(f).includes(MAIL_DE_MP) && !todoElTexto(f).includes('REFRESH'), 'el mail no lleva tokens ni el mail de la cuenta de MercadoPago')

console.log('\n2. Reconexión a la MISMA cuenta')
f = globalThis.__f = escenario({ previa: { mp_user_id: '777', mp_nickname: 'Ludomestica' }, rpc: { cancelados: [{ id: 5, mp_preference_id: '777-a' }], en_proceso: 0 } })
r = await pedirCallback()
ok(r.redirect === `${SITIO}/vendedor/perfil?mp=exito`, 'vuelve con mp=exito')
ok(f.rpcs.length === 0 && f.puts.length === 0, 'NO cancela ni vence nada (la cuenta no cambió)')
ok(f.mails.length === 1 && /Volviste a conectar/.test(mailAlVendedor(f).asunto), 'mail "Volviste a conectar…"')
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
  rpc: { cancelados: [{ id: 5, mp_preference_id: '111-aaa' }, { id: 6, mp_preference_id: '111-bbb' }, { id: 7, mp_preference_id: null }], en_proceso: 1 },
})
r = await pedirCallback()
ok(r.redirect === `${SITIO}/vendedor/perfil?mp=exito&cancelados=3`, 'vuelve con mp=exito y cancelados=3')
ok(f.rpcs.length === 1 && f.rpcs[0].nombre === 'rpc_cancelar_pedidos_de_tienda', 'llama a la función de cancelar de la base, una vez')
ok(JSON.stringify(f.rpcs[0].args) === JSON.stringify({ p_vendedor_id: 15, p_motivo: 'cuenta_mp_cambiada', p_cuenta_a_conservar: '777' }), 'de esta tienda, con el motivo cuenta_mp_cambiada y conservando la cuenta nueva (777)')
ok(f.puts.map((p) => p.id).sort().join() === '111-aaa,111-bbb', 'vence el link de cada pedido cancelado que tiene preferencia (no el que no la tiene)')
ok(f.puts.every((p) => p.auth === `Bearer ${TOKEN_VIEJO}`), 'con el token de la cuenta VIEJA')
ok(!JSON.stringify(f.puts).includes(TOKEN_NUEVO), 'y nunca con el de la cuenta nueva')
const orden = f.secuencia.join(' > ')
ok(orden.indexOf('leer_token') < orden.indexOf('upsert'), 'el token viejo se lee ANTES de pisar la cuenta')
ok(orden.indexOf('upsert') < orden.indexOf('rpc') && orden.indexOf('rpc') < orden.indexOf('put:'), 'orden: guardar la cuenta nueva, cancelar en la base, vencer los links')
ok(f.upserts[0].mp_user_id === '777' && f.upserts[0].mp_nickname === 'Ludomestica', 'la cuenta nueva quedó guardada')
ok(!!f.upserts[0].conectado_en && Math.abs(Date.parse(f.upserts[0].conectado_en) - Date.now()) < 5000, 'conectado_en se renueva: dice desde cuándo está conectada la cuenta NUEVA, no la de la primera conexión')
const mail = mailAlVendedor(f)
ok(!!mail && /Cambiaste la cuenta/.test(mail.asunto), 'mail "Cambiaste la cuenta…" al vendedor')
ok(/CuentaVieja/.test(mail.texto) && /Ludomestica/.test(mail.texto), 'nombra las dos cuentas')
ok(/Cancelamos 3 pedidos/.test(mail.texto) && /1 pago en proceso/.test(mail.texto), 'dice cuántos pedidos se cancelaron y que hay 1 pago en proceso')
ok(!todoElTexto(f).includes(TOKEN_VIEJO) && !todoElTexto(f).includes(TOKEN_NUEVO) && !todoElTexto(f).includes(MAIL_DE_MP), 'el mail no lleva tokens ni el mail de la cuenta de MercadoPago')
ok(f.mails.length === 1, 'solo ese mail: todos los links se pudieron vencer, no hace falta avisar nada interno')

console.log('\n4. Cambio de cuenta y MercadoPago no deja vencer un link')
f = globalThis.__f = escenario({
  previa: { mp_user_id: '111', mp_nickname: 'CuentaVieja' },
  rpc: { cancelados: [{ id: 5, mp_preference_id: '111-aaa' }, { id: 6, mp_preference_id: '111-bbb' }], en_proceso: 0 },
  prefsQueFallan: new Set(['111-bbb']),
})
r = await pedirCallback()
ok(r.redirect.includes('mp=exito&cancelados=2'), 'la conexión sale bien igual')
const interno = mailInterno(f)
ok(!!interno && interno.para === 'notificaciones@bahiashops.com.ar' && /Links de pago sin vencer/.test(interno.asunto), 'mail interno a notificaciones: links sin vencer')
ok(/Pedido #6/.test(interno.texto) && !/Pedido #5/.test(interno.texto), 'lista solo el pedido cuyo link no se pudo vencer (#6)')

console.log('\n5. Cambio de cuenta sin token de la cuenta vieja')
f = globalThis.__f = escenario({
  previa: { mp_user_id: '111', mp_nickname: null },
  tokenViejoDisponible: false,
  rpc: { cancelados: [{ id: 5, mp_preference_id: '111-aaa' }], en_proceso: 0 },
})
r = await pedirCallback()
ok(f.rpcs.length === 1 && r.redirect.includes('cancelados=1'), 'los pedidos se cancelan igual en la base')
ok(f.puts.length === 0, 'no se intenta vencer nada sin token')
ok(!!mailInterno(f) && /Pedido #5/.test(mailInterno(f).texto), 'y se avisa por mail interno que el link quedó sin vencer')

console.log('\n6. Fallas')
f = globalThis.__f = escenario({ errorPrevia: true })
r = await pedirCallback()
ok(r.redirect.includes('mp=error') && r.redirect.includes('no_guardado'), 'si no se puede leer la cuenta anterior, no se guarda nada y se pide reintentar')
ok(f.upserts.length === 0 && f.mails.length === 0, 'ni se pisa la cuenta ni se manda mail')
f = globalThis.__f = escenario({ previa: { mp_user_id: '111', mp_nickname: 'CuentaVieja' }, rpcError: 'la base no responde' })
r = await pedirCallback()
ok(r.redirect.startsWith(`${SITIO}/vendedor/perfil?mp=exito`) && f.upserts.length === 1, 'si falla cancelar los pedidos, la conexión queda hecha igual')
ok(f.mails.length === 1 && /Cambiaste la cuenta/.test(mailAlVendedor(f).asunto) && /No había pedidos sin pagar/.test(mailAlVendedor(f).texto), 'y el mail sale igual')

console.log('\n7. Desconectar')
f = globalThis.__f = escenario({
  previa: { mp_user_id: '777', mp_nickname: 'Ludomestica' },
  rpc: { cancelados: [{ id: 8, mp_preference_id: '777-zzz' }], en_proceso: 2 },
})
r = await rutas.desconectar()
ok(r.status === 200 && r.body.ok === true && r.body.pedidosCancelados === 1, 'responde ok y cuántos pedidos canceló')
ok(JSON.stringify(f.rpcs[0].args) === JSON.stringify({ p_vendedor_id: 15, p_motivo: 'cuenta_mp_cambiada', p_cuenta_a_conservar: null }), 'cancela TODOS los pendientes sin pago de la tienda (sin cuenta a conservar)')
ok(f.puts.length === 1 && f.puts[0].auth === `Bearer ${TOKEN_VIEJO}`, 'vence su link con el token de la cuenta')
const o = f.secuencia.join(' > ')
ok(o.indexOf('rpc') < o.indexOf('delete') && o.indexOf('put:') < o.indexOf('delete'), 'todo eso pasa ANTES de borrar los tokens')
ok(f.deletes.length === 1 && f.flags[0]?.mercadopago_conectado === false, 'borra la cuenta y apaga el flag')
ok(f.mails.length === 1 && /Desconectaste/.test(mailAlVendedor(f).asunto) && /2 pagos en proceso/.test(mailAlVendedor(f).texto), 'mail "Desconectaste…" con los pagos en proceso')
ok(!todoElTexto(f).includes(TOKEN_VIEJO), 'sin tokens en el mail')

f = globalThis.__f = escenario({ previa: null })
r = await rutas.desconectar()
ok(r.status === 200 && r.body.habiaConexion === false && f.rpcs.length === 0 && f.mails.length === 0, 'desconectar sin ninguna cuenta: no cancela nada ni manda mail')

f = globalThis.__f = escenario({ previa: { mp_user_id: '777', mp_nickname: 'Ludomestica' }, rpcError: 'la base no responde' })
r = await rutas.desconectar()
ok(r.status === 200 && f.deletes.length === 1, 'si falla la limpieza de pedidos, la desconexión se hace igual (es lo que la persona pidió)')

console.log('\n8. El webhook avisa cuando ninguna cuenta puede verificar un pago')
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

console.log('\n9. El panel recibe la cuenta, nunca los tokens')
f = globalThis.__f = escenario({ previa: { mp_user_id: '777', mp_nickname: 'Ludomestica' } })
r = await rutas.cuenta()
ok(r.status === 200 && r.body.conectada === true && r.body.id === '777' && r.body.nickname === 'Ludomestica', 'devuelve el nombre y el número de la cuenta')
ok(r.body.conectado_en === '2026-09-01T10:00:00Z' && r.body.dias_restantes >= 39 && r.body.dias_restantes <= 40, 'y desde cuándo está conectada y cuántos días le quedan al permiso')
ok(!JSON.stringify(r.body).includes('NO_DEBE_SALIR') && !/token/i.test(Object.keys(r.body).join(' ')), 'ninguna clave ni valor de token en la respuesta')
f = globalThis.__f = escenario({ previa: null })
r = await rutas.cuenta()
ok(r.status === 200 && r.body.conectada === false, 'sin cuenta: conectada = false')

console.log(fallas === 0 ? '\nTODO OK' : `\n${fallas} FALLAS`)
process.exit(fallas ? 1 : 0)
