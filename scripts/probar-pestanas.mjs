// Prueba en qué pestaña del panel de la tienda cae cada pedido (Nuevos
// pedidos, Entregados) y cuáles no son una venta y por eso ni se mandan. Son
// funciones puras. Y que en el panel el pago en efectivo pendiente se vea solo
// con su etiqueta, sin botones.
//
//   npm run probar:pestanas

import { readFileSync } from 'node:fs'
import { pestanaDePedido, pestanaEnElPanel, validarAvance, siguientePaso } from '../src/lib/pedidos.js'

let fallas = 0
const ok = (c, m) => { if (!c) { fallas++; console.log('  ✗ FALLA:', m) } else console.log('  ✓', m) }

const ahora = Date.parse('2026-10-09T15:00:00Z')
const HORA = 3600 * 1000
const iso = (ms) => new Date(ms).toISOString()
const p = (extra) => ({ estado: 'pendiente', mp_payment_id: null, efectivo_vence_en: null, cancelado_motivo: null, ...extra })

console.log('1. Nuevos pedidos')
for (const estado of ['pagado', 'preparando', 'franja', 'por_salir', 'despachado', 'listo', 'acordado']) {
  ok(pestanaDePedido(p({ estado }), ahora) === 'nuevos', estado)
}
ok(pestanaDePedido(p({ mp_payment_id: '501', efectivo_vence_en: iso(ahora + HORA) }), ahora) === 'nuevos', 'pago en efectivo pendiente con el cupón vigente')

console.log('\n2. Entregados (los reembolsados van ahí, aparte)')
for (const estado of ['entregado', 'reembolsado']) ok(pestanaDePedido(p({ estado }), ahora) === 'entregados', estado)

console.log('\n3. Lo que NO es una venta: no tiene pestaña')
ok(pestanaDePedido(p({ mp_payment_id: '501', efectivo_vence_en: iso(ahora - HORA) }), ahora) === null, 'un cupón vencido que la base todavía tiene pendiente')
ok(pestanaDePedido(p({ mp_payment_id: '501', efectivo_vence_en: iso(ahora) }), ahora) === null, 'un cupón que vence justo ahora')
ok(pestanaDePedido(p({ estado: 'cancelado', cancelado_motivo: 'pago_vencido', mp_payment_id: '501', efectivo_vence_en: iso(ahora - 48 * HORA) }), ahora) === null, 'un cupón vencido ya cancelado por vencido')
ok(pestanaDePedido(p({}), ahora) === null, 'pendiente sin ningún pago (carrito abandonado)')
ok(pestanaDePedido(p({ mp_payment_id: '502' }), ahora) === null, 'pendiente con un pago pero sin cupón')
ok(pestanaDePedido(p({ efectivo_vence_en: iso(ahora + HORA) }), ahora) === null, 'una fecha de cupón sin pago')
ok(pestanaDePedido(p({ estado: 'rechazado' }), ahora) === null, 'rechazado')
for (const motivo of [null, 'pago_vencido', 'cuenta_eliminada', 'tienda_cerrada', 'cuenta_mp_cambiada']) ok(pestanaDePedido(p({ estado: 'cancelado', cancelado_motivo: motivo }), ahora) === null, `cancelado (${motivo})`)
ok(pestanaDePedido(p({ estado: 'estado_inventado' }), ahora) === null, 'un estado desconocido: falla cerrado')
ok(pestanaDePedido(p({ mp_payment_id: '501', efectivo_vence_en: 'basura' }), ahora) === null, 'una fecha de cupón ilegible: no es una venta')
ok(pestanaDePedido(null, ahora) === null && pestanaDePedido(undefined, ahora) === null, 'sin pedido: null')

// La pantalla es un componente de cliente: se lee el código, no se importa.
console.log('\n4. El pago en efectivo pendiente en el panel: solo la etiqueta')
const pantalla = readFileSync(new URL('../src/app/vendedor/pedidos/page.jsx', import.meta.url), 'utf8').replace(/\r\n/g, '\n')
ok(pantalla.includes("if (p.estado === 'pendiente') return 'Pago en efectivo pendiente';"), 'la etiqueta es «Pago en efectivo pendiente»')
ok(/function accionDe\(p\) \{\n[^\n]*\n  if \(p\.estado === 'pendiente'\) return null;/.test(pantalla), 'accionDe: ningún botón para pendiente')
ok((pantalla.match(/onClick=\{onAvanzar\}/g) || []).length === 1 && /\) : accion && !confirmando \? \(/.test(pantalla), 'el único botón de avanzar se dibuja solo si hay acción')
ok(siguientePaso({ estado: 'pendiente', metodo_envio: 'retiro' }) === null, 'el servidor tampoco tiene un paso siguiente para pendiente')
ok(validarAvance({ pedido: { vendedor_id: 7, estado: 'pendiente', metodo_envio: 'retiro' }, vendedorId: 7, destino: 'preparando' }).motivo === 'sin_avance', 'avanzar un pendiente a mano: lo rechaza')

console.log('\n5. El pedido tal como le llega a la pantalla (sin mp_payment_id, con la pestaña del servidor)')
// El caso del pedido #34: el servidor lo clasificaba bien, pero la pantalla
// volvía a calcular con pestanaDePedido sin mp_payment_id y lo descartaba.
const comoLlega = (pedido) => { const { mp_payment_id, ...resto } = pedido; return { ...resto, pestana: pestanaDePedido(pedido, ahora) } }
const efectivo = p({ mp_payment_id: '501', efectivo_vence_en: iso(ahora + HORA) })
ok(pestanaEnElPanel(comoLlega(efectivo), ahora) === 'nuevos', 'pago en efectivo pendiente con el cupón vigente: Nuevos pedidos')
ok(!('mp_payment_id' in comoLlega(efectivo)), 'mp_payment_id no viaja')
ok(pestanaEnElPanel(comoLlega(efectivo), ahora + 2 * HORA) === null, 'el cupón vence con el panel abierto: sale de la lista')
ok(pestanaEnElPanel(comoLlega(p({ estado: 'pagado' })), ahora) === 'nuevos', 'pagado')
ok(pestanaEnElPanel(comoLlega(p({ estado: 'despachado' })), ahora) === 'nuevos', 'despachado (todavía no entregado)')
ok(pestanaEnElPanel(comoLlega(p({ estado: 'entregado' })), ahora) === 'entregados', 'entregado')
ok(pestanaEnElPanel({ estado: 'pagado', pestana: 'carritos' }, ahora) === 'carritos', 'carritos')
ok(pestanaEnElPanel({ estado: 'pagado' }, ahora) === null, 'sin pestaña del servidor: no se muestra')
ok(pestanaEnElPanel({ estado: 'pagado', pestana: 'ventas' }, ahora) === null, 'una pestaña vieja o desconocida: no se muestra')
ok(pestanaEnElPanel(null, ahora) === null, 'sin pedido: null')
ok(!/pestanaDePedido\(/.test(pantalla), 'la pantalla no usa pestanaDePedido (le falta mp_payment_id)')
const ruta = readFileSync(new URL('../src/app/api/vendedor/pedidos/route.js', import.meta.url), 'utf8')
ok(/pestana: pestanaDePedido\(venta, ahoraMs\)/.test(ruta), 'la ruta manda la pestaña calculada con el pedido completo')

console.log(fallas === 0 ? '\nTODO OK' : `\n${fallas} FALLAS`)
process.exit(fallas ? 1 : 0)
