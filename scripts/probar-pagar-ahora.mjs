// Prueba «Pagar ahora» de Mis pedidos con la ruta REAL y una base y un
// MercadoPago de mentira:
//
//   · solo con un cupón en efectivo vigente, y solo para quien hizo el pedido;
//   · cada vez que se aprieta se arma una preferencia NUEVA, con los mismos
//     productos y el mismo total, de 2 horas y nunca más allá del cupón;
//   · sin medios en efectivo (no se puede generar un segundo cupón);
//   · qué compras ve el comprador en Mis pedidos (ventas y pagos en efectivo en
//     proceso; los carritos abandonados no).
//
//   npm run probar:pagar-ahora
//
// No toca MercadoPago ni Supabase.

import { register } from 'node:module'

process.env.NODE_ENV = 'production'

const raiz = new URL('../', import.meta.url)
const loader = `
const src = ${JSON.stringify(new URL('src/', raiz).href)}
const falsos = {
  'next/server': 'export const NextResponse = { json: (body, init) => ({ body, status: (init && init.status) || 200 }) }',
  '@/lib/supabase/server': 'export async function createClient() { return globalThis.__f.sesion }',
  '@/lib/supabase/admin': 'export function getServiceRoleClient() { return globalThis.__f.admin }',
  '@/lib/mercadopago/tokens': 'export async function getCuentaValida() { if (globalThis.__f.sinToken) throw new Error("sin token"); return { accessToken: "TOKEN-DE-LA-TIENDA", mpUserId: "111" } }',
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
const silencio = () => {}
const logOriginal = console.log
console.warn = silencio; console.error = silencio
if (!process.env.VER_LOGS) console.log = silencio
const mostrar = (...a) => process.stdout.write(a.join(' ') + '\n')
const okv = (c, m) => { if (!c) { fallas++; mostrar('  ✗ FALLA:', m) } else mostrar('  ✓', m) }
void logOriginal; void ok

const HORA = 3600 * 1000
const DIA = 24 * HORA
const ahoraMs = Date.now()
const iso = (ms) => new Date(ms).toISOString()

const PEDIDO = {
  id: 41, comprador_id: 'u-1', vendedor_id: 15, estado: 'pendiente', cancelado_motivo: null,
  total: 38500, costo_envio: 2500, comision_plataforma: 1925,
  mp_payment_id: '501', efectivo_vence_en: iso(ahoraMs + 2 * DIA), mp_user_id_cobro: '111',
  comprador_nombre: 'Rosario', comprador_apellido: 'Fuhr', comprador_telefono: '2915551234',
}
const ITEMS = [
  { producto_id: 7, nombre: 'Juego de ludo clásico', variante: null, precio: 14000, cantidad: 2, foto_url: 'https://fotos.test/ludo.jpg' },
  { producto_id: 8, nombre: 'Dados de madera', variante: 'Grandes', precio: 8000, cantidad: 1, foto_url: null },
]

let f
function escenario(opciones = {}) {
  const e = {
    pedido: { ...PEDIDO }, items: ITEMS.map((i) => ({ ...i })),
    vendedor: { id: 15, bloqueado: false, estado_validacion: 'aprobado' },
    cuenta: { mp_user_id: '111' },
    usuario: { id: 'u-1', email: 'compradora@correo.test' },
    sinToken: false,
    mp: { status: 200, cuerpo: null },
    posts: [], puts: [],
    ...opciones,
  }
  const tabla = (nombre) => {
    const q = {
      select() { return q }, eq() { return q },
      maybeSingle: async () => {
        if (nombre === 'pedidos') return { data: e.pedido, error: null }
        if (nombre === 'vendedores') return { data: e.vendedor, error: null }
        if (nombre === 'mercadopago_cuentas') return { data: e.cuenta, error: null }
        return { data: null, error: null }
      },
      then: (res) => res(nombre === 'pedido_items' ? { data: e.items, error: null } : { data: [], error: null }),
    }
    return q
  }
  e.admin = { from: tabla }
  e.sesion = { auth: { getUser: async () => ({ data: { user: e.usuario } }) } }
  return e
}

globalThis.fetch = async (url, init = {}) => {
  const u = String(url)
  const json = (status, cuerpo) => ({ ok: status >= 200 && status < 300, status, json: async () => cuerpo })
  if (u.endsWith('/checkout/preferences') && init.method === 'POST') {
    const cuerpo = JSON.parse(init.body)
    f.posts.push({ cuerpo, auth: init.headers.Authorization })
    if (f.mp.cuerpo) return json(f.mp.status, f.mp.cuerpo)
    return json(201, {
      id: `pref-${f.posts.length}`, init_point: `https://www.mercadopago.com.ar/checkout/v1/redirect?pref_id=pref-${f.posts.length}`,
      expires: true, expiration_date_to: cuerpo.expiration_date_to, date_of_expiration: cuerpo.date_of_expiration,
    })
  }
  if (u.includes('/checkout/preferences/') && init.method === 'PUT') { f.puts.push(u); return json(200, {}) }
  throw new Error('llamada inesperada: ' + u)
}

const { POST: pagarAhora } = await import('../src/app/api/pedidos/[id]/pagar-ahora/route.js')
const { esVentaVisible } = await import('../src/lib/pedidos.js')
const { evaluarPagarAhora } = await import('../src/lib/pagarAhora.js')
const pedir = (id = '41') => pagarAhora({}, { params: Promise.resolve({ id }) })

mostrar('1. Un cupón vigente: se arma un link nuevo')
f = globalThis.__f = escenario()
let r = await pedir()
okv(r.status === 200 && /^https:\/\/www\.mercadopago\.com\.ar\//.test(r.body.url), 'responde con el init_point de MercadoPago (producción)')
const pref = f.posts[0].cuerpo
okv(f.posts.length === 1 && f.posts[0].auth === 'Bearer TOKEN-DE-LA-TIENDA', 'una preferencia nueva, con el token de la tienda')
okv(pref.external_reference === '41', 'del mismo pedido (external_reference = 41)')
okv(pref.items.length === 3 && pref.items[0].title === 'Juego de ludo clásico' && pref.items[1].title === 'Dados de madera (Grandes)' && pref.items[2].title === 'Envío', 'los mismos productos, con su variante, y el envío')
okv(pref.items.reduce((a, i) => a + i.unit_price * i.quantity, 0) === 38500, 'que suman el total del pedido (38.500)')
okv(pref.marketplace_fee === 1925, 'con la misma comisión')
okv(pref.items[0].picture_url === 'https://fotos.test/ludo.jpg' && !('picture_url' in pref.items[1]), 'la foto va solo si hay')
okv(JSON.stringify(pref.payment_methods) === JSON.stringify({ excluded_payment_types: [{ id: 'ticket' }, { id: 'atm' }] }), 'sin medios en efectivo: no se puede generar un segundo cupón')
const hasta = Date.parse(pref.expiration_date_to)
okv(pref.expires === true && Math.abs(hasta - (ahoraMs + 2 * HORA)) < 5000, 'el link dura 2 horas')
okv(pref.payer.email === 'compradora@correo.test' && pref.payer.name === 'Rosario' && pref.payer.phone.number === '2915551234', 'con los datos de quien compra')
okv(pref.notification_url.endsWith('/api/mercadopago/webhook') && pref.back_urls.success.includes('pedido=41'), 'avisa al mismo webhook y vuelve al mismo pedido')

r = await pedir()
okv(f.posts.length === 2 && r.body.url.endsWith('pref-2'), 'cada vez que se aprieta se arma OTRA preferencia')

mostrar('\n2. Nunca más allá del cupón')
f = globalThis.__f = escenario({ pedido: { ...PEDIDO, efectivo_vence_en: iso(ahoraMs + 30 * 60 * 1000) } })
r = await pedir()
okv(r.status === 200 && Math.abs(Date.parse(f.posts[0].cuerpo.expiration_date_to) - (ahoraMs + 30 * 60 * 1000)) < 5000, 'si al cupón le quedan 30 minutos, el link dura 30 minutos')

mostrar('\n3. Cuándo NO se puede')
const casos = [
  ['sin sesión', { usuario: null }, 401, null],
  ['un pedido ajeno responde como uno que no existe', { pedido: { ...PEDIDO, comprador_id: 'otra-persona' } }, 404, 'NO_EXISTE'],
  ['el pedido no existe', { pedido: null }, 404, 'NO_EXISTE'],
  ['ya pagado', { pedido: { ...PEDIDO, estado: 'pagado' } }, 409, 'NO_PAGABLE'],
  ['rechazado', { pedido: { ...PEDIDO, estado: 'rechazado' } }, 409, 'NO_PAGABLE'],
  ['cancelado por vencido', { pedido: { ...PEDIDO, estado: 'cancelado', cancelado_motivo: 'pago_vencido' } }, 410, 'VENCIDO'],
  ['pendiente sin ningún pago (un carrito, no una venta)', { pedido: { ...PEDIDO, mp_payment_id: null, efectivo_vence_en: null } }, 409, 'SIN_CUPON'],
  ['pago en proceso pero sin cupón (una tarjeta acreditándose)', { pedido: { ...PEDIDO, efectivo_vence_en: null } }, 409, 'SIN_CUPON'],
  ['el cupón ya venció', { pedido: { ...PEDIDO, efectivo_vence_en: iso(ahoraMs - 1000) } }, 410, 'VENCIDO'],
  ['tienda bloqueada', { vendedor: { id: 15, bloqueado: true, estado_validacion: 'aprobado' } }, 409, 'TIENDA_NO_DISPONIBLE'],
  ['tienda sin aprobar', { vendedor: { id: 15, bloqueado: false, estado_validacion: 'pendiente' } }, 409, 'TIENDA_NO_DISPONIBLE'],
  ['tienda inexistente', { vendedor: null }, 409, 'TIENDA_NO_DISPONIBLE'],
  ['tienda sin MercadoPago', { cuenta: null }, 409, 'TIENDA_SIN_MP'],
  ['la tienda cambió de cuenta de MercadoPago', { cuenta: { mp_user_id: '222' } }, 409, 'CUENTA_CAMBIADA'],
]
for (const [nombre, opciones, status, codigo] of casos) {
  f = globalThis.__f = escenario(opciones)
  if (opciones.usuario === null) f.sesion = { auth: { getUser: async () => ({ data: { user: null } }) } }
  r = await pedir()
  okv(r.status === status && (codigo === null || r.body.codigo === codigo) && f.posts.length === 0, `${nombre}: ${status}${codigo ? ' ' + codigo : ''}, sin llamar a MercadoPago`)
}
f = globalThis.__f = escenario()
r = await pedir('abc')
okv(r.status === 404 && f.posts.length === 0, 'un id que no es un número: 404')
f = globalThis.__f = escenario({ pedido: { ...PEDIDO, mp_user_id_cobro: null } })
r = await pedir()
okv(r.status === 200, 'un pedido que no guardó la cuenta de cobro igual puede (la cuenta de la tienda es la actual)')

mostrar('\n4. Si algo falla')
f = globalThis.__f = escenario({ items: [{ ...ITEMS[0] }] })
r = await pedir()
okv(r.status === 409 && f.posts.length === 0, 'si los productos guardados no suman el total, no se arma nada')
f = globalThis.__f = escenario({ sinToken: true })
r = await pedir()
okv(r.status === 409 && f.posts.length === 0, 'sin token de la tienda: no se puede')
f = globalThis.__f = escenario({ mp: { status: 400, cuerpo: { message: 'no' } } })
r = await pedir()
okv(r.status === 502 && !('url' in r.body), 'si MercadoPago rechaza, no se entrega ningún link')
f = globalThis.__f = escenario({ mp: { status: 201, cuerpo: { id: 'pref-x', init_point: 'https://mp.test/x', expires: false } } })
r = await pedir()
okv(r.status === 502 && f.puts.length >= 1, 'si MercadoPago crea el link SIN vencimiento, no se entrega y se intenta vencer')
f = globalThis.__f = escenario({ mp: { status: 201, cuerpo: { id: 'pref-y', init_point: 'http://inseguro.test/y', expires: true, expiration_date_to: 'x' } } })
r = await pedir()
okv(r.status === 502, 'un link que no es https no se entrega')

mostrar('\n5. La regla sola')
const ev = (extra = {}) => evaluarPagarAhora({ pedido: PEDIDO, vendedor: { bloqueado: false, estado_validacion: 'aprobado' }, cuentaMp: { mp_user_id: '111' }, usuarioId: 'u-1', ahoraMs, ...extra })
okv(ev().ok === true && ev().venceLinkMs - ahoraMs === 2 * HORA, 'caso feliz: 2 horas')
okv(ev({ usuarioId: null }).codigo === 'NO_EXISTE', 'sin usuario: no existe')

mostrar('\n5b. Adónde avisa MercadoPago (túnel solo fuera de producción)')
f = globalThis.__f = escenario()
r = await pedir()
okv(f.posts[0].cuerpo.notification_url === 'https://bahiashops.com.ar/api/mercadopago/webhook' && f.posts[0].cuerpo.back_urls.success.startsWith('https://bahiashops.com.ar/compra/exito'), 'en producción: el sitio publicado')
process.env.URL_PUBLICA_DESARROLLO = 'https://algo-raro.trycloudflare.com'
f = globalThis.__f = escenario()
r = await pedir()
okv(f.posts[0].cuerpo.notification_url === 'https://bahiashops.com.ar/api/mercadopago/webhook', 'en producción, aunque la variable esté cargada: el sitio publicado')
process.env.NODE_ENV = 'development'
f = globalThis.__f = escenario()
r = await pedir()
okv(f.posts[0].cuerpo.notification_url === 'https://algo-raro.trycloudflare.com/api/mercadopago/webhook', 'en desarrollo con el túnel: el aviso va al túnel')
okv(['success', 'failure', 'pending'].every((k) => f.posts[0].cuerpo.back_urls[k].startsWith('https://algo-raro.trycloudflare.com/compra/')), 'y la vuelta después de pagar también')
process.env.NODE_ENV = 'production'
delete process.env.URL_PUBLICA_DESARROLLO

mostrar('\n6. Qué compras ve el comprador en Mis pedidos')
const v = (extra) => esVentaVisible({ estado: 'pendiente', mp_payment_id: null, efectivo_vence_en: null, cancelado_motivo: null, ...extra })
for (const estado of ['pagado', 'preparando', 'franja', 'por_salir', 'despachado', 'reembolsado']) okv(v({ estado }) === true, `venta ${estado}: se ve`)
okv(v({ mp_payment_id: '501', efectivo_vence_en: iso(ahoraMs + DIA) }) === true, 'pago en efectivo pendiente: se ve')
okv(v({}) === false, 'pendiente sin pago (carrito abandonado): no se ve')
okv(v({ mp_payment_id: '502' }) === false, 'pendiente con un pago sin cupón: no se ve')
okv(v({ estado: 'rechazado' }) === false, 'rechazado: no se ve')
okv(v({ estado: 'cancelado', cancelado_motivo: 'pago_vencido' }) === false, 'cancelado por vencido sin cupón (carrito abandonado): no se ve')
okv(v({ estado: 'cancelado', cancelado_motivo: 'pago_vencido', mp_payment_id: '501', efectivo_vence_en: iso(ahoraMs - DIA) }) === true, 'cupón que venció sin pagarse: se ve, para que sepa qué pasó')
okv(v({ estado: 'cancelado', cancelado_motivo: 'cuenta_eliminada' }) === false, 'cancelado por otra razón: no se ve')

mostrar(fallas === 0 ? '\nTODO OK' : `\n${fallas} FALLAS`)
process.exit(fallas ? 1 : 0)
