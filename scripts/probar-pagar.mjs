// Prueba la regla de "¿se puede volver a abrir el pago de este pedido?"
// (src/lib/pagarPedido.js) con pedidos de mentira. No toca la base ni
// MercadoPago.
//
//   npm run probar:pagar

import { register } from 'node:module'
const raiz = new URL('../', import.meta.url)
const alias = `
const src = ${JSON.stringify(new URL('src/', raiz).href)}
export function resolve(esp, ctx, sig) {
  if (esp.startsWith('@/')) { const r = src + esp.slice(2); return sig(r.endsWith('.js') ? r : r + '.js', ctx) }
  if (esp.startsWith('./') && !esp.endsWith('.js')) return sig(esp + '.js', ctx)
  return sig(esp, ctx)
}`
register('data:text/javascript,' + encodeURIComponent(alias))
const { evaluarPagoDePedido } = await import('../src/lib/pagarPedido.js')

let fallas = 0
const ok = (c, m) => { if (!c) { fallas++; console.log('  ✗ FALLA:', m) } else console.log('  ✓', m) }

const AHORA = Date.UTC(2026, 9, 5, 15, 0, 0)
const MIN = 60 * 1000
const iso = (ms) => new Date(ms).toISOString()
const YO = 'aaaaaaaa-0000-0000-0000-000000000001'
const OTRO = 'bbbbbbbb-0000-0000-0000-000000000002'
const CUENTA = '161947825'
const LINK ='https://www.mercadopago.com.ar/checkout/v1/redirect?pref_id=123-abc'

const pedido = (extra = {}) => ({
  comprador_id: YO, estado: 'pendiente', cancelado_motivo: null, mp_payment_id: null,
  vence_en: iso(AHORA + 60 * MIN), link_de_pago: LINK, mp_user_id_cobro: CUENTA, ...extra,
})
const tienda = (extra = {}) => ({ bloqueado: false, estado_validacion: 'aprobado', ...extra })
const cuenta = (id = CUENTA) => ({ mp_user_id: id })
const evaluar = (p, v = tienda(), usuarioId = YO, c = cuenta()) => evaluarPagoDePedido({ pedido: p, vendedor: v, cuentaMp: c, usuarioId, ahoraMs: AHORA })

console.log('El caso que sí se puede')
let r = evaluar(pedido())
ok(r.ok && r.url === LINK, 'pendiente, sin pago, dentro del plazo, tienda disponible: devuelve el link guardado')
for (const v of ['', 'null', 'undefined', '  ']) ok(evaluar(pedido({ mp_payment_id: v })).ok, `mp_payment_id "${v}" cuenta como sin pago`)
ok(evaluar(pedido({ link_de_pago: `  ${LINK}  ` })).url === LINK, 'recorta espacios del link')

console.log('\nPedido ajeno o inexistente')
for (const [nombre, p, u] of [
  ['de otra persona', pedido({ comprador_id: OTRO }), YO],
  ['inexistente', null, YO],
  ['sin usuario', pedido(), null],
]) {
  r = evaluar(p, tienda(), u)
  ok(!r.ok && r.status === 404 && r.codigo === 'NO_EXISTE', `${nombre}: 404 NO_EXISTE`)
}
ok(evaluar(pedido({ comprador_id: OTRO })).error === evaluar(null).error, 'ajeno e inexistente responden lo mismo (no se filtra qué pedidos hay)')
ok(evaluar(pedido({ comprador_id: OTRO, link_de_pago: LINK })).url === undefined, 'del pedido ajeno nunca sale el link')

console.log('\nEstados que no se pueden pagar')
for (const estado of ['pagado', 'preparando', 'franja', 'por_salir', 'despachado', 'rechazado', 'reembolsado', 'cancelado']) {
  r = evaluar(pedido({ estado }))
  ok(!r.ok && r.status === 409 && r.codigo === 'NO_PAGABLE', `${estado}: 409 NO_PAGABLE`)
}
r = evaluar(pedido({ estado: 'cancelado', cancelado_motivo: 'pago_vencido' }))
ok(!r.ok && r.status === 410 && r.codigo === 'VENCIDO', 'cancelado por pago_vencido: 410 VENCIDO')
r = evaluar(pedido({ mp_payment_id: '987654' }))
ok(!r.ok && r.status === 409 && r.codigo === 'PAGO_EN_PROCESO', 'pendiente con un pago en proceso: 409 PAGO_EN_PROCESO (no se abre otro link)')

console.log('\nVencimiento')
r = evaluar(pedido({ vence_en: iso(AHORA - MIN) }))
ok(!r.ok && r.status === 410 && r.codigo === 'VENCIDO', 'vence_en pasado: 410 VENCIDO')
r = evaluar(pedido({ vence_en: iso(AHORA) }))
ok(!r.ok && r.codigo === 'VENCIDO', 'justo en el instante: vencido')
r = evaluar(pedido({ vence_en: iso(AHORA + 1000) }))
ok(r.ok, 'un segundo antes: todavía se puede')
r = evaluar(pedido({ vence_en: null }))
ok(!r.ok && r.status === 409 && r.codigo === 'SIN_VENCIMIENTO', 'pedido viejo sin vence_en: 409 SIN_VENCIMIENTO')
r = evaluar(pedido({ vence_en: 'no es una fecha' }))
ok(!r.ok && r.codigo === 'VENCIDO', 'una fecha ilegible se trata como vencida (falla cerrado)')

console.log('\nLa tienda')
for (const [nombre, v] of [
  ['bloqueada', tienda({ bloqueado: true })],
  ['sin aprobar (pendiente)', tienda({ estado_validacion: 'pendiente' })],
  ['con cambios pedidos', tienda({ estado_validacion: 'necesita_cambios' })],
  ['inexistente', null],
]) {
  r = evaluar(pedido(), v)
  ok(!r.ok && r.status === 409 && r.codigo === 'TIENDA_NO_DISPONIBLE', `${nombre}: 409 TIENDA_NO_DISPONIBLE`)
}

console.log('\nLa cuenta de MercadoPago que cobra')
r = evaluar(pedido({ mp_user_id_cobro: 161947825 }))
ok(r.ok, 'la cuenta guardada como número y la conectada como texto son la misma')
r = evaluar(pedido({ mp_user_id_cobro: '  161947825 ' }))
ok(r.ok, 'espacios alrededor del id: se ignoran')
r = evaluar(pedido(), tienda(), YO, cuenta('999999999'))
ok(!r.ok && r.status === 409 && r.codigo === 'CUENTA_CAMBIADA', 'la tienda conectó OTRA cuenta: 409 CUENTA_CAMBIADA (no se ofrece el link de la cuenta vieja)')
ok(!/999999999|161947825/.test(r.error), 'el mensaje no nombra ninguna de las dos cuentas')
for (const v of [null, undefined, '', '  ', 'null', 'undefined']) {
  r = evaluar(pedido({ mp_user_id_cobro: v }))
  ok(!r.ok && r.status === 409 && r.codigo === 'SIN_CUENTA_DE_COBRO', `el pedido no guardó qué cuenta lo cobra (${JSON.stringify(v)}): no se ofrece`)
}
for (const [nombre, c] of [['sin cuenta conectada', null], ['cuenta sin id', cuenta('')], ['cuenta con id "null"', cuenta('null')]]) {
  r = evaluar(pedido(), tienda(), YO, c)
  ok(!r.ok && r.status === 409 && r.codigo === 'TIENDA_SIN_MP', `${nombre}: 409 TIENDA_SIN_MP`)
}
r = evaluar(pedido({ mp_user_id_cobro: null }), tienda(), YO, cuenta('999'))
ok(r.codigo === 'SIN_CUENTA_DE_COBRO', 'sin dato en el pedido manda sobre cualquier cuenta: nunca se deduce')
r = evaluar(pedido({ estado: 'cancelado', cancelado_motivo: 'cuenta_mp_cambiada' }))
ok(!r.ok && r.status === 410 && r.codigo === 'CUENTA_CAMBIADA', 'cancelado por cuenta_mp_cambiada: 410 CUENTA_CAMBIADA')
r = evaluar(pedido({ comprador_id: OTRO }), tienda(), YO, cuenta('999'))
ok(r.codigo === 'NO_EXISTE', 'un pedido ajeno sigue respondiendo "no existe", aunque la cuenta no coincida')

console.log('\nEl link guardado')
for (const [nombre, link] of [['sin link', null], ['vacío', ''], ['http sin s', 'http://www.mercadopago.com.ar/x'], ['no es un link', 'hola'], ['javascript:', 'javascript:alert(1)']]) {
  r = evaluar(pedido({ link_de_pago: link }))
  ok(!r.ok && r.status === 409 && r.codigo === 'SIN_LINK', `${nombre}: 409 SIN_LINK`)
}

console.log(fallas === 0 ? '\nTODO OK' : `\n${fallas} FALLAS`)
process.exit(fallas ? 1 : 0)
