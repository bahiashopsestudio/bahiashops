// Prueba dónde ve quien compró la dirección de retiro, ahora que la página de
// la tienda no la muestra:
//
//   · direccionDeRetiro (src/lib/metodosEntrega.js): "Colón 123, Centro", o
//     null si la tienda no la muestra o no la cargó;
//   · la ruta REAL /api/pedidos/[id]/retiro (Mis pedidos), con una base de
//     mentira: solo a quien compró, solo un pedido de Retiro pagado;
//   · los mails de compra y de «listo para retirar», armados y enviados de
//     punta a punta (avisarPago, avisarListo) con una base y un Resend de
//     mentira; el aviso de venta a la tienda no la lleva.
//
//   npm run probar:retiro
//
// No toca Supabase, MercadoPago ni Resend.

import { register } from 'node:module'

const raiz = new URL('../', import.meta.url)
const loader = `
const src = ${JSON.stringify(new URL('src/', raiz).href)}
const falsos = {
  'next/server': 'export const NextResponse = { json: (body, init) => ({ body, status: (init && init.status) || 200, headers: (init && init.headers) || {} }) }',
  '@/lib/supabase/server': 'export async function createClient() { return globalThis.__f.sesion }',
  '@/lib/supabase/admin': 'export function getServiceRoleClient() { return globalThis.__f.admin }',
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
const consolaError = console.error
console.warn = () => {}
console.error = () => {}
void consolaError

const { direccionDeRetiro, RETIRO_POR_WHATSAPP } = await import('../src/lib/metodosEntrega.js')
const { armarMailCompra, armarMailVenta, armarMailListo, avisarPago, avisarListo } = await import('../src/lib/mailsPedidos.js')
const { GET: retiro } = await import('../src/app/api/pedidos/[id]/retiro/route.js')

const TIENDA_VISIBLE = { direccion_visible: true, direccion: 'Colón 123', cerrada_en: null, barrio: { nombre: 'Centro' } }

// ── Base de mentira ──
// Cada tabla responde lo que diga el escenario. Se anotan los select pedidos
// y los update (el reclamo de "una sola vez" de los mails).
let f
function escenario(opciones = {}) {
  const e = {
    usuario: { id: 'u-1' },
    pedido: { id: 41, comprador_id: 'u-1', vendedor_id: 15, estado: 'listo', metodo_envio: 'retiro' },
    vendedor: { ...TIENDA_VISIBLE },
    selects: [], updates: [], mails: [],
    ...opciones,
  }
  const tabla = (nombre) => {
    let resultado = null
    const q = {
      select(cols) { e.selects.push({ nombre, cols }); return q },
      update(valores) { e.updates.push({ nombre, valores }); resultado = { id: e.pedido.id }; return q },
      eq() { return q }, is() { return q }, in() { return q },
      maybeSingle: async () => {
        if (resultado) return { data: resultado, error: null }
        if (nombre === 'pedidos') return { data: e.pedido, error: null }
        if (nombre === 'vendedores') return { data: e.vendedor, error: null }
        if (nombre === 'usuarios') return { data: { email: 'compradora@correo.test', cerrada_en: null }, error: null }
        return { data: null, error: null }
      },
      then: (res) => res(nombre === 'usuarios'
        ? { data: [{ id: 'u-1', email: 'compradora@correo.test', nombre_usuario: 'Zorzal', cerrada_en: null }, { id: 'u-tienda', email: 'tienda@correo.test', cerrada_en: null }], error: null }
        : { data: [], error: null }),
    }
    return q
  }
  e.admin = { from: tabla }
  e.sesion = { auth: { getUser: async () => ({ data: { user: e.usuario } }) } }
  return e
}

process.env.RESEND_API_KEY = 'clave-de-mentira'
globalThis.fetch = async (url, init = {}) => {
  if (String(url) === 'https://api.resend.com/emails') {
    f.mails.push(JSON.parse(init.body))
    return { ok: true, status: 200, json: async () => ({ id: 'resend-1' }), text: async () => '' }
  }
  throw new Error('llamada inesperada: ' + url)
}

const pedir = (id = '41') => retiro({}, { params: Promise.resolve({ id }) })

console.log('1. direccionDeRetiro')
ok(direccionDeRetiro(TIENDA_VISIBLE) === 'Colón 123, Centro', 'visible, con barrio: "Colón 123, Centro"')
ok(direccionDeRetiro({ ...TIENDA_VISIBLE, barrio: null }) === 'Colón 123', 'visible, sin barrio: solo la dirección')
ok(direccionDeRetiro({ ...TIENDA_VISIBLE, direccion: '   ' }) === null, 'visible pero sin dirección cargada: null')
ok(direccionDeRetiro({ ...TIENDA_VISIBLE, direccion_visible: false }) === null, 'no visible: null, aunque tenga dirección')
ok(direccionDeRetiro(null) === null, 'sin tienda: null')

console.log('\n2. La ruta de Mis pedidos: solo a quien compró, solo Retiro pagado')
f = globalThis.__f = escenario()
let r = await pedir()
ok(r.status === 200 && r.body.estado === 'ok' && r.body.direccion === 'Colón 123, Centro', 'pedido propio, de Retiro y pagado: la dirección con el barrio')
ok(r.headers['Cache-Control'] === 'no-store', 'sin caché')
ok(!/telefono|email/.test(f.selects.find((s) => s.nombre === 'vendedores')?.cols || ''), 'de la tienda no lee ni el teléfono ni el mail')

f = globalThis.__f = escenario({ vendedor: { ...TIENDA_VISIBLE, direccion_visible: false, direccion: null } })
r = await pedir()
ok(r.status === 200 && r.body.estado === 'por_whatsapp' && !('direccion' in r.body), 'la tienda no la muestra: «por WhatsApp», sin dirección')

f = globalThis.__f = escenario({ vendedor: { ...TIENDA_VISIBLE, direccion: '' } })
r = await pedir()
ok(r.body.estado === 'por_whatsapp', 'visible pero sin dirección cargada: «por WhatsApp»')

f = globalThis.__f = escenario({ vendedor: { ...TIENDA_VISIBLE, cerrada_en: '2026-10-01' } })
r = await pedir()
ok(r.body.estado === 'cerrada' && !('direccion' in r.body), 'tienda cerrada: «cerrada», sin dirección')
f = globalThis.__f = escenario({ vendedor: null })
r = await pedir()
ok(r.body.estado === 'cerrada', 'tienda borrada: «cerrada»')

f = globalThis.__f = escenario({ usuario: null })
r = await pedir()
ok(r.status === 401 && !r.body.direccion, 'sin sesión: 401')

f = globalThis.__f = escenario({ usuario: { id: 'u-otra' } })
r = await pedir()
ok(r.status === 404 && !r.body.direccion, 'pedido ajeno: 404, igual que uno inexistente')
f = globalThis.__f = escenario({ pedido: null })
r = await pedir()
ok(r.status === 404, 'pedido inexistente: 404')
r = await pedir('abc')
ok(r.status === 404, 'id que no es un número: 404')

for (const estado of ['pendiente', 'rechazado', 'cancelado', 'reembolsado']) {
  f = globalThis.__f = escenario({ pedido: { id: 41, comprador_id: 'u-1', vendedor_id: 15, estado, metodo_envio: 'retiro' } })
  r = await pedir()
  ok(r.status === 409 && !r.body.direccion, `pedido «${estado}»: 409, sin dirección`)
}
for (const estado of ['pagado', 'preparando', 'listo', 'entregado']) {
  f = globalThis.__f = escenario({ pedido: { id: 41, comprador_id: 'u-1', vendedor_id: 15, estado, metodo_envio: 'retiro' } })
  r = await pedir()
  ok(r.body.estado === 'ok', `pedido «${estado}»: la dirección`)
}
for (const metodo of ['envio_tienda', 'correo', 'coordinar']) {
  f = globalThis.__f = escenario({ pedido: { id: 41, comprador_id: 'u-1', vendedor_id: 15, estado: 'pagado', metodo_envio: metodo } })
  r = await pedir()
  ok(r.status === 409 && !r.body.direccion, `pedido de «${metodo}»: 409, sin dirección`)
}

console.log('\n3. Los mails, armados')
const base = {
  pedidoId: 1042, tienda: 'Ludoméstica', metodoEnvio: 'retiro', nombre: 'Lucía', apellido: 'Fernández',
  telefono: '2915551234', items: [{ id: 1, nombre: 'Ludo', variante: null, cantidad: 1, precio: 14000 }],
  costoEnvio: 0, total: 14000, comision: 700, direccion: null, turno: null,
}
let m = armarMailCompra({ ...base, direccionVisible: true, direccionRetiro: 'Colón 123, Centro' })
ok(m.html.includes('Lo retirás en') && m.html.includes('Colón 123, Centro') && m.texto.includes('Lo retirás en Colón 123, Centro.'), 'compra, visible: «Lo retirás en Colón 123, Centro.» (HTML y texto)')
m = armarMailCompra({ ...base, direccionVisible: false, direccionRetiro: null })
ok(m.texto.includes(RETIRO_POR_WHATSAPP) && !m.texto.includes('Lo retirás en'), 'compra, no visible: «La tienda te va a pasar la dirección por WhatsApp.»')
ok(m.texto.includes('para coordinar cuándo lo retirás.') && !m.texto.includes('dónde y cuándo'), 'compra, no visible: «para coordinar cuándo lo retirás» (el dónde lo dice la línea de abajo)')
m = armarMailCompra({ ...base, metodoEnvio: 'envio_tienda', direccionRetiro: 'Colón 123, Centro', direccion: { calle: 'Alsina', numero: '235' } })
ok(!m.texto.includes('Lo retirás') && !m.texto.includes(RETIRO_POR_WHATSAPP), 'compra de envío: sin línea de retiro')
m = armarMailCompra({ ...base, direccionVisible: true, direccionRetiro: '<b>Colón</b> & 123' })
ok(m.html.includes('&lt;b&gt;Colón&lt;/b&gt; &amp; 123') && !m.html.includes('<b>Colón'), 'la dirección va escapada en el HTML')
m = armarMailVenta({ ...base, direccionVisible: true, direccionRetiro: 'Colón 123, Centro' })
ok(!m.texto.includes('Colón 123') && !m.html.includes('Colón 123'), 'el aviso de venta a la tienda no la lleva')

m = armarMailListo({ ...base, direccionRetiro: 'Colón 123, Centro' })
ok(m.html.includes('Colón 123, Centro') && m.texto.includes('Lo retirás en Colón 123, Centro.'), 'listo, visible: «Lo retirás en Colón 123, Centro.»')
m = armarMailListo({ ...base, direccionRetiro: null })
ok(m.texto.includes(RETIRO_POR_WHATSAPP) && !m.texto.includes('Lo retirás en'), 'listo, no visible: «La tienda te va a pasar la dirección por WhatsApp.»')

console.log('\n4. Los mails, de punta a punta (avisarPago, avisarListo)')
const pedidoPago = {
  id: 41, estado: 'pagado', vendedor_id: 15, comprador_id: 'u-1', metodo_envio: 'retiro', zona_envio: null, turno_preferido: null,
  total: 14000, costo_envio: 0, comision_plataforma: 700, comprador_nombre: 'Lucía', comprador_apellido: 'Fernández',
  comprador_telefono: '2915551234', direccion_copia: null, items: base.items,
}
const tiendaPago = { nombre_negocio: 'Ludoméstica', usuario_id: 'u-tienda', ...TIENDA_VISIBLE }
f = globalThis.__f = escenario({ pedido: pedidoPago, vendedor: tiendaPago })
await avisarPago({ admin: f.admin, pedidoId: 41 })
const aCompradora = f.mails.find((x) => x.to === 'compradora@correo.test')
const aTienda = f.mails.find((x) => x.to === 'tienda@correo.test')
ok(/direccion\b/.test(f.selects.find((s) => s.nombre === 'vendedores')?.cols || ''), 'avisarPago lee la dirección de la tienda')
ok(aCompradora && aCompradora.text.includes('Lo retirás en Colón 123, Centro.'), 'mail de compra: con la dirección')
ok(aTienda && !aTienda.text.includes('Colón 123'), 'aviso de venta: sin la dirección de la tienda')

f = globalThis.__f = escenario({ pedido: pedidoPago, vendedor: { ...tiendaPago, direccion_visible: false, direccion: null } })
await avisarPago({ admin: f.admin, pedidoId: 41 })
ok(f.mails.find((x) => x.to === 'compradora@correo.test')?.text.includes(RETIRO_POR_WHATSAPP), 'mail de compra, tienda sin dirección visible: «por WhatsApp»')

const pedidoListo = { ...pedidoPago, estado: 'listo', vendedor_nombre: 'Ludoméstica', vendedor: { nombre_negocio: 'Ludoméstica', ...TIENDA_VISIBLE } }
f = globalThis.__f = escenario({ pedido: pedidoListo })
let rl = await avisarListo({ admin: f.admin, pedidoId: 41 })
ok(rl.enviado && f.mails[0]?.text.includes('Lo retirás en Colón 123, Centro.'), 'mail de listo: con la dirección')
f = globalThis.__f = escenario({ pedido: { ...pedidoListo, vendedor: { nombre_negocio: 'Ludoméstica', direccion_visible: false, direccion: null, barrio: null } } })
rl = await avisarListo({ admin: f.admin, pedidoId: 41 })
ok(rl.enviado && f.mails[0]?.text.includes(RETIRO_POR_WHATSAPP), 'mail de listo, tienda sin dirección visible: «por WhatsApp»')

console.log(fallas === 0 ? '\nTODO OK' : `\n${fallas} FALLAS`)
process.exit(fallas ? 1 : 0)
