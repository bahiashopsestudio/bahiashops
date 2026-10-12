// Prueba la pestaña de carritos abandonados: qué pedido es un carrito
// abandonado (y cuál no), que en el panel caiga en su pestaña, y el mail de
// "Recordarle" con su pie legal (retiro o bloqueo de los datos, Ley 25.326).
//
//   npm run probar:carritos

import { esCarritoAbandonado, pestanaEnElPanel } from '../src/lib/pedidos.js'

let fallas = 0
const ok = (c, m) => { if (!c) { fallas++; console.log('  ✗ FALLA:', m) } else console.log('  ✓', m) }

const ahora = Date.parse('2026-10-10T15:00:00Z')
const HORA = 3600 * 1000
const iso = (ms) => new Date(ms).toISOString()
const p = (extra) => ({ estado: 'pendiente', mp_payment_id: null, vence_en: iso(ahora - HORA), efectivo_vence_en: null, cancelado_motivo: null, ...extra })

console.log('1. Es un carrito abandonado')
ok(esCarritoAbandonado(p({}), ahora), 'pendiente sin pago con el link vencido')
ok(esCarritoAbandonado(p({ estado: 'cancelado', cancelado_motivo: 'pago_vencido' }), ahora), 'cancelado por pago_vencido')
ok(esCarritoAbandonado(p({ estado: 'cancelado', cancelado_motivo: 'pago_vencido', mp_payment_id: '501', efectivo_vence_en: iso(ahora - 48 * HORA) }), ahora), 'un cupón en efectivo que venció y ya se canceló')
ok(esCarritoAbandonado(p({ mp_payment_id: '501', efectivo_vence_en: iso(ahora - HORA) }), ahora), 'un cupón vencido que la base todavía tiene pendiente')

console.log('\n2. NO es un carrito abandonado')
for (const estado of ['pagado', 'preparando', 'franja', 'por_salir', 'despachado', 'reembolsado']) ok(!esCarritoAbandonado(p({ estado }), ahora), estado)
ok(!esCarritoAbandonado(p({ mp_payment_id: '501', efectivo_vence_en: iso(ahora + HORA) }), ahora), 'pendiente con el cupón vigente (es una venta)')
ok(!esCarritoAbandonado(p({ vence_en: iso(ahora + HORA) }), ahora), 'pendiente con el link todavía vivo (puede estar pagando)')
ok(!esCarritoAbandonado(p({ mp_payment_id: '502' }), ahora), 'pendiente con un pago en proceso sin cupón (tarjeta acreditándose)')
ok(!esCarritoAbandonado(p({ estado: 'rechazado' }), ahora), 'rechazado')
ok(esCarritoAbandonado(p({ estado: 'cancelado', cancelado_motivo: 'cuenta_mp_cambiada' }), ahora), 'cancelado porque la tienda cambió o desconectó MercadoPago (cuenta_mp_cambiada)')
ok(esCarritoAbandonado(p({ estado: 'cancelado', cancelado_motivo: 'cuenta_mp_cambiada', vence_en: iso(ahora + HORA) }), ahora), 'cuenta_mp_cambiada aunque el link todavía no hubiera vencido')
for (const motivo of [null, 'cuenta_eliminada', 'tienda_cerrada']) ok(!esCarritoAbandonado(p({ estado: 'cancelado', cancelado_motivo: motivo }), ahora), `cancelado (${motivo})`)
ok(!esCarritoAbandonado(null, ahora) && !esCarritoAbandonado(undefined, ahora), 'sin pedido: false')

console.log('\n3. En el panel')
ok(pestanaEnElPanel({ ...p({}), pestana: 'carritos' }, ahora) === 'carritos', 'un carrito pendiente cae en Carritos abandonados')
ok(pestanaEnElPanel({ ...p({ estado: 'cancelado', cancelado_motivo: 'pago_vencido' }), pestana: 'carritos' }, ahora) === 'carritos', 'un carrito cancelado cae en Carritos abandonados')
ok(pestanaEnElPanel({ ...p({}), pestana: 'inventada' }, ahora) === null, 'una pestaña desconocida: null')

console.log('\n4. El mail de recordatorio')
// mailsCarritos.js importa con el alias '@/lib/...' de Next: se resuelve acá a
// mano con un loader, sin levantar nada.
const { register } = await import('node:module')
register('data:text/javascript,' + encodeURIComponent(`
  export async function resolve(especificador, contexto, siguiente) {
    if (especificador.startsWith('@/')) {
      return siguiente(new URL('../src/' + especificador.slice(2) + '.js', ${JSON.stringify(import.meta.url)}).href, contexto)
    }
    return siguiente(especificador, contexto)
  }
`))
const { armarMailRecordatorio } = await import('../src/lib/mailsCarritos.js')

const mail = armarMailRecordatorio({
  tienda: 'Tienda <Prueba> & Co',
  slugTienda: 'tienda-prueba',
  apodo: 'rosa',
  items: [
    { nombre: 'Remera oversize', variante: 'Talle M', cantidad: 2, precio: 7250 },
    { nombre: 'Gorra trucker', variante: null, cantidad: 1, precio: 8900 },
  ],
})
ok(mail.asunto === 'Tu carrito en Tienda <Prueba> & Co te espera', 'el asunto nombra a la tienda')
ok(/^<!DOCTYPE html>|<html/i.test(mail.html) && mail.html.includes('</html>'), 'el HTML es un documento completo')
ok(mail.html.includes('Tienda &lt;Prueba&gt; &amp; Co') && !mail.html.includes('<Prueba>'), 'el nombre de la tienda va escapado')
ok(!mail.html.includes('&amp;lt;'), 'sin doble escape')
ok(mail.html.includes('https://bahiashops.com.ar/tienda/tienda-prueba'), 'el botón lleva a la tienda')
ok(mail.html.includes('2 × Remera oversize · Talle M') && mail.html.includes('$ 14.500') && mail.html.includes('$ 8.900'), 'los productos y sus montos')
ok(mail.texto.includes('Hola rosa.') && mail.texto.includes('Volver a la tienda: https://bahiashops.com.ar/tienda/tienda-prueba'), 'el texto plano tiene el saludo y el link')

console.log('\n5. El pie legal (retiro o bloqueo de los datos)')
for (const [nombre, contenido] of [['HTML', mail.html], ['texto', mail.texto]]) {
  ok(/retiro o bloqueo/.test(contenido), `${nombre}: menciona el retiro o bloqueo de los datos`)
  ok(contenido.includes('hola@bahiashops.com.ar'), `${nombre}: dice a dónde escribir`)
  ok(contenido.includes('iniciaste una compra en Bahía Shops'), `${nombre}: dice por qué le llegó`)
}

const sinItems = armarMailRecordatorio({ tienda: 'T', slugTienda: 't', apodo: null, items: [] })
ok(!sinItems.html.includes('LO QUE HABÍAS ELEGIDO') && sinItems.texto.startsWith('Tu carrito en T te espera\n\nHola. '), 'sin productos ni apodo: sin la tarjeta y con un "Hola." solo')

console.log(fallas ? `\n${fallas} falla(s).` : '\nTodo bien.')
process.exit(fallas ? 1 : 0)
