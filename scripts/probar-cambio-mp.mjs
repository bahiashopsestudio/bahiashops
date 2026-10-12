// Prueba las piezas puras del cambio seguro de cuenta de MercadoPago:
//
//   · qué pedidos se cancelan al cambiar o desconectar la cuenta (los
//     pendientes que todavía se pueden pagar; los vencidos no);
//   · el mail a quien compró cuando su pedido se canceló por el cambio (con y
//     sin productos, con el pie de retiro o bloqueo de datos, escapado);
//   · los mails al vendedor (conectar, cambiar, desconectar), con y sin pedidos
//     cancelados.
//
// Las rutas (callback, desconexión, panel) se prueban con npm run probar:cuenta-mp.
//
//   npm run probar:cambio-mp
//
// No toca MercadoPago, Resend ni Supabase.

import { register } from 'node:module'

const raiz = new URL('../', import.meta.url)
const alias = `
const src = ${JSON.stringify(new URL('src/', raiz).href)}
export function resolve(especificador, contexto, siguiente) {
  if (especificador.startsWith('@/')) {
    const ruta = src + especificador.slice(2)
    return siguiente(/\\.[a-z]+$/.test(ruta) ? ruta : ruta + '.js', contexto)
  }
  return siguiente(especificador, contexto)
}
`
register('data:text/javascript,' + encodeURIComponent(alias))

const { pedidosACancelarPorCuentaMp, MOTIVO_CUENTA_MP_CAMBIADA } = await import('../src/lib/mercadopago/cuenta.js')
const { armarMailCuentaCambiada, armarMailCuentaMp } = await import('../src/lib/mailsCuentaMp.js')

let fallas = 0
const ok = (c, m) => { if (!c) { fallas++; console.log('  ✗ FALLA:', m) } else console.log('  ✓', m) }

const AHORA = Date.parse('2026-10-11T15:00:00Z')
const HORA = 3600 * 1000
const iso = (ms) => new Date(ms).toISOString()

console.log('1. Qué pedidos se cancelan')
ok(MOTIVO_CUENTA_MP_CAMBIADA === 'cuenta_mp_cambiada', 'el motivo es cuenta_mp_cambiada (el que ya acepta la base desde la 024)')

const pedidos = [
  { id: 1, estado: 'pendiente', vence_en: iso(AHORA + HORA), mp_payment_id: null, mp_user_id_cobro: '111' }, // link vivo
  { id: 2, estado: 'pendiente', vence_en: iso(AHORA - HORA), mp_payment_id: null, mp_user_id_cobro: '111' }, // link vencido
  { id: 3, estado: 'pendiente', vence_en: iso(AHORA - 30 * HORA), efectivo_vence_en: iso(AHORA + 40 * HORA), mp_payment_id: '501', mp_user_id_cobro: '111' }, // cupón vigente
  { id: 4, estado: 'pendiente', vence_en: iso(AHORA - 80 * HORA), efectivo_vence_en: iso(AHORA - HORA), mp_payment_id: '502', mp_user_id_cobro: '111' }, // cupón vencido
  { id: 5, estado: 'pendiente', vence_en: iso(AHORA - HORA), mp_payment_id: '503', mp_user_id_cobro: '111' }, // tarjeta en proceso
  { id: 6, estado: 'pagado', vence_en: iso(AHORA + HORA), mp_payment_id: '504', mp_user_id_cobro: '111' },
  { id: 7, estado: 'cancelado', cancelado_motivo: 'pago_vencido', mp_user_id_cobro: '111' },
  { id: 8, estado: 'pendiente', vence_en: iso(AHORA + HORA), mp_payment_id: 'null', mp_user_id_cobro: '777' }, // ya cobra la cuenta nueva
  { id: 9, estado: 'pendiente', vence_en: null, mp_payment_id: '', mp_user_id_cobro: null }, // viejo, sin fecha ni cuenta
]
const ids = (lista) => lista.map((p) => p.id).join(',')

let r = pedidosACancelarPorCuentaMp(pedidos, { ahoraMs: AHORA })
ok(ids(r) === '1,3,5,8,9', `al desconectar: los pendientes que todavía se pueden pagar (link vivo, cupón vigente, pago en proceso) → ${ids(r)}`)
ok(!r.some((p) => p.id === 2 || p.id === 4), 'los vencidos no: los cancela el vencimiento de siempre, con pago_vencido')
ok(!r.some((p) => p.id === 6 || p.id === 7), 'ni los pagados ni los ya cancelados')

r = pedidosACancelarPorCuentaMp(pedidos, { conservar: '777', ahoraMs: AHORA })
ok(ids(r) === '1,3,5,9', 'al cambiar a la cuenta 777: los que cobra la 777 se dejan en paz')
r = pedidosACancelarPorCuentaMp(pedidos, { conservar: ' 777 ', ahoraMs: AHORA })
ok(ids(r) === '1,3,5,9', 'el id de la cuenta se compara sin espacios')

ok(pedidosACancelarPorCuentaMp([], { ahoraMs: AHORA }).length === 0, 'sin pedidos: no hay nada que cancelar (cartel sin pedidos)')
ok(pedidosACancelarPorCuentaMp(null).length === 0, 'null: tampoco')
ok(pedidosACancelarPorCuentaMp([pedidos[1], pedidos[3], pedidos[5]], { ahoraMs: AHORA }).length === 0, 'solo vencidos y pagados: 0 (cartel sin pedidos)')
ok(pedidosACancelarPorCuentaMp([pedidos[0]], { ahoraMs: AHORA }).length === 1, 'un link vivo: 1 (cartel con pedidos)')

console.log('\n2. Mail a quien compró')
const items = [
  { nombre: 'Taza esmaltada', variante: 'Azul', cantidad: 2, precio: 6500 },
  { nombre: 'Plato playo', variante: null, cantidad: 1, precio: 9800 },
]
let m = armarMailCuentaCambiada({ pedidoId: 1042, tienda: 'Cerámica del Puerto', slugTienda: 'ceramica-del-puerto', apodo: 'Nutria Curiosa', items, costoEnvio: 2500, total: 25300 })
ok(m.asunto === 'Tu pedido en Cerámica del Puerto fue cancelado', `asunto: "${m.asunto}"`)
ok(m.html.startsWith('<!DOCTYPE html>') && m.html.includes('</html>'), 'HTML completo, con la plantilla')
ok(m.html.includes('Pedido #1042') && m.texto.includes('PEDIDO #1042'), 'línea azul con el número de pedido')
ok(m.html.includes('Tu pedido fue cancelado') && m.texto.includes('Tu pedido fue cancelado'), 'título')
ok(m.texto.includes('Hola Nutria Curiosa. Tu pedido en Cerámica del Puerto fue cancelado porque la tienda cambió su configuración de pagos. El link de pago ya no es válido.'), 'saludo con apodo y el motivo')
ok(m.html.includes('<strong style="font-weight:500;">Cerámica del Puerto</strong>'), 'la tienda va en negrita')
ok(m.html.includes('LO QUE HABÍAS PEDIDO') && m.texto.includes('LO QUE HABÍAS PEDIDO'), 'tarjeta "LO QUE HABÍAS PEDIDO"')
ok(m.html.includes('2 × Taza esmaltada · Azul') && m.html.includes('$ 13.000'), 'cada producto con cantidad, variante y subtotal')
ok(m.texto.includes('1 × Plato playo: $ 9.800') && m.texto.includes('Envío: $ 2.500') && m.texto.includes('Total: $ 25.300'), 'texto plano con productos, envío y total')
ok(m.texto.includes('Si te interesa volver a comprar, podés visitar la tienda y hacer un pedido nuevo cuando tenga los pagos habilitados.'), 'párrafo para volver a comprar')
ok(m.html.includes('Ver la tienda') && m.html.includes('https://bahiashops.com.ar/tienda/ceramica-del-puerto'), 'botón "Ver la tienda" al link de la tienda')
ok(m.texto.includes('Ver la tienda: https://bahiashops.com.ar/tienda/ceramica-del-puerto'), 'y el link en el texto plano')

console.log('\n3. El pie legal')
ok(m.html.includes('retiro o bloqueo de tus datos') && m.html.includes('href="mailto:hola@bahiashops.com.ar"'), 'HTML: retiro o bloqueo, con el mailto a hola@')
ok(m.html.includes('font-size:13px') && m.html.includes('Recibiste este mail porque hiciste un pedido en Bahía Shops'), 'gris, 13px, "Recibiste este mail porque hiciste un pedido…"')
ok(m.texto.includes('retiro o bloqueo de tus datos escribiendo a hola@bahiashops.com.ar. Bahía Blanca, Argentina.'), 'texto plano: el mismo pie')
ok(!/<[a-z]/i.test(m.texto), 'el texto plano no tiene HTML')

m = armarMailCuentaCambiada({ pedidoId: 7, tienda: 'Cerámica del Puerto', slugTienda: 'ceramica-del-puerto', apodo: null, items: [], total: 1000 })
ok(!m.html.includes('LO QUE HABÍAS PEDIDO') && !m.texto.includes('LO QUE HABÍAS PEDIDO'), 'sin productos: sin la tarjeta')
ok(m.texto.includes('Hola. Tu pedido en'), 'sin apodo: "Hola."')
ok(m.html.includes('retiro o bloqueo de tus datos'), 'el pie va igual')
m = armarMailCuentaCambiada({ pedidoId: 8, tienda: 'X', slugTienda: null, items: undefined })
ok(m.html.includes('href="https://bahiashops.com.ar"') && !m.html.includes('/tienda/'), 'sin slug: el botón va al sitio')

console.log('\n4. Escapado')
const TIENDA_MALA = '<b>Lo de "Pepa" & Co</b>'
m = armarMailCuentaCambiada({
  pedidoId: 9, tienda: TIENDA_MALA, slugTienda: 'pepa"><script>', apodo: 'Zorro <script>',
  items: [{ nombre: 'Mate "imperial" <XL>', variante: 'Rojo & negro', cantidad: 1, precio: 14500 }], total: 14500,
})
ok(!m.html.includes('<b>Lo de') && m.html.includes('&lt;b&gt;Lo de &quot;Pepa&quot; &amp; Co&lt;/b&gt;'), 'el nombre de la tienda se escapa en el cuerpo')
ok(m.html.includes('<title>Tu pedido en &lt;b&gt;Lo de &quot;Pepa&quot; &amp; Co&lt;/b&gt; fue cancelado</title>'), 'y en el título del HTML')
ok(!m.html.includes('<script>') && m.html.includes('Zorro &lt;script&gt;'), 'el apodo se escapa')
ok(m.html.includes('Mate &quot;imperial&quot; &lt;XL&gt; · Rojo &amp; negro'), 'los productos se escapan')
ok(m.html.includes('/tienda/pepa%22%3E%3Cscript%3E'), 'el slug va codificado en el link')
ok(m.asunto === `Tu pedido en ${TIENDA_MALA} fue cancelado` && m.texto.includes(TIENDA_MALA), 'el asunto y el texto plano van tal cual (no son HTML)')

console.log('\n5. Mails al vendedor')
const cuenta = { id: '777', nickname: 'Ludomestica' }
m = armarMailCuentaMp({ tipo: 'primera', tienda: 'Ludoméstica', cuenta })
ok(m.asunto === 'Conectaste MercadoPago a Ludoméstica', `conectar: "${m.asunto}"`)
ok(m.texto.includes('Vinculaste la cuenta de MercadoPago Ludomestica (N° 777) a Ludoméstica. Desde ahora los pagos de tus ventas van a esa cuenta.'), 'dice qué cuenta se vinculó')
ok(!/cancel/i.test(m.texto), 'sin pedidos cancelados, no los menciona')
m = armarMailCuentaMp({ tipo: 'misma', tienda: 'Ludoméstica', cuenta })
ok(m.asunto === 'Conectaste MercadoPago a Ludoméstica', 'volver a conectar la misma: el mismo mail')
m = armarMailCuentaMp({ tipo: 'primera', tienda: 'Ludoméstica', cuenta: { id: '777', nickname: null } })
ok(m.texto.includes('Vinculaste la cuenta de MercadoPago N° 777 a'), 'sin nombre de cuenta: el número')

m = armarMailCuentaMp({ tipo: 'cambio', tienda: 'Ludoméstica', cuenta, anterior: { id: '111', nickname: 'Vieja' }, cancelados: 3 })
ok(m.asunto === 'Cambiaste la cuenta de MercadoPago de Ludoméstica', `cambiar: "${m.asunto}"`)
ok(m.texto.includes('Cambiaste la cuenta de MercadoPago de Ludoméstica. La cuenta anterior fue desconectada y la nueva es Ludomestica (N° 777).'), 'dice cuál es la nueva')
ok(m.texto.includes('Se cancelaron 3 pedidos pendientes de pago y los compradores recibieron un aviso.'), 'con 3 cancelados, lo dice')
ok(m.html.includes('<strong style="font-weight:500;">3 pedidos</strong>'), '"3 pedidos" en negrita')

m = armarMailCuentaMp({ tipo: 'desconexion', tienda: 'Ludoméstica', cancelados: 1 })
ok(m.asunto === 'Desconectaste MercadoPago de Ludoméstica', `desconectar: "${m.asunto}"`)
ok(m.texto.includes('Desconectaste tu cuenta de MercadoPago de Ludoméstica en Bahía Shops. Tus productos siguen publicados pero nadie va a poder pagarlos hasta que vincules una cuenta de nuevo.'), 'el párrafo de desconexión')
ok(m.texto.includes('Se canceló 1 pedido pendiente de pago y quien compró recibió un aviso.') && !m.texto.includes('Se cancelaron 1'), 'con 1 cancelado: en singular')
m = armarMailCuentaMp({ tipo: 'desconexion', tienda: 'Ludoméstica', cancelados: 0 })
ok(!/cancel/i.test(m.texto), 'sin cancelados, no los menciona')
ok(!/2 horas|efectivo en proceso|se acreditan igual/.test(m.texto), 'ya no habla de las 2 horas ni de pagos en efectivo que se acreditan igual')

for (const tipo of ['primera', 'cambio', 'desconexion']) {
  m = armarMailCuentaMp({ tipo, tienda: 'Ludoméstica', cuenta })
  ok(m.texto.includes('Si no fuiste vos, desconectá la cuenta desde tu panel y escribinos a hola@bahiashops.com.ar.') &&
     m.html.includes('Ir a mi panel') && m.html.includes('https://bahiashops.com.ar/vendedor/perfil'), `${tipo}: "si no fuiste vos" y "Ir a mi panel"`)
}
m = armarMailCuentaMp({ tipo: 'cambio', tienda: TIENDA_MALA, cuenta: { id: '1', nickname: '<i>x</i>' } })
ok(!m.html.includes('<b>Lo de') && !m.html.includes('<i>x</i>') && m.html.includes('&lt;i&gt;x&lt;/i&gt;'), 'vendedor: la tienda y el nombre de la cuenta se escapan')

console.log(fallas === 0 ? '\nTODO OK' : `\n${fallas} FALLAS`)
process.exit(fallas ? 1 : 0)
