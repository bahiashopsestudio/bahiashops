// Prueba el respaldo del vaciado del carrito: al cargarlo con sesión se cruza
// contra los pedidos recientes y sale lo que ya se compró; y el checkout avisa
// si ya hay una compra en curso de la misma tienda. Funciones puras y un
// Supabase de mentira.
//
//   npm run probar:compra-reciente

import {
  esCompraEnCurso, compraEnCursoDeLaTienda, sinLoYaComprado, comprasRecientes, VENTANA_COMPRA_RECIENTE_MS,
} from '../src/lib/compraReciente.js'

let fallas = 0
const ok = (c, m) => { if (!c) { fallas++; console.log('  ✗ FALLA:', m) } else console.log('  ✓', m) }

const HORA = 60 * 60 * 1000
const AHORA = Date.parse('2026-10-14T15:00:00Z')
const hace = (h) => new Date(AHORA - h * HORA).toISOString()
const dentroDe = (h) => new Date(AHORA + h * HORA).toISOString()

// Productos agregados hace 5 horas (antes de las compras de abajo).
const item = (productoId, horas = 5) => ({ productoId, cantidad: 1, precio: 100, agregadoEn: AHORA - horas * HORA })
const tiendaA = { vendedorId: 15, vendedorNombre: 'Tienda A', items: [item(1), item(2)] }
const tiendaB = { vendedorId: 22, vendedorNombre: 'Tienda B', items: [item(9)] }

const pagado = (vendedor_id, horas = 1) => ({ id: 100, vendedor_id, estado: 'pagado', creado_en: hace(horas), mp_payment_id: '555' })
const cuponPendiente = (vendedor_id) => ({
  id: 101, vendedor_id, estado: 'pendiente', creado_en: hace(1), vence_en: dentroDe(1),
  efectivo_vence_en: dentroDe(48), mp_payment_id: '777',
})
const pendienteSinPago = (vendedor_id) => ({ id: 102, vendedor_id, estado: 'pendiente', creado_en: hace(1), vence_en: dentroDe(1), mp_payment_id: null })

console.log('1. Carrito con tienda A, pedido pagado reciente de A')
let r = sinLoYaComprado([tiendaA], [pagado(15)], AHORA)
ok(r.length === 0, 'la tienda A sale del carrito')

console.log('\n2. Carrito con A y B, pedido solo de A')
r = sinLoYaComprado([tiendaA, tiendaB], [pagado(15)], AHORA)
ok(r.length === 1 && r[0] === tiendaB, 'B queda, idéntica')

console.log('\n3. Pedido vencido (más de 72 horas)')
const viejo = pagado(15, VENTANA_COMPRA_RECIENTE_MS / HORA + 1)
const conItemsMasViejos = { ...tiendaA, items: [item(1, 100)] }
r = sinLoYaComprado([conItemsMasViejos], [viejo], AHORA)
ok(r.length === 1 && r[0] === conItemsMasViejos, 'no se limpia')

console.log('\n4. Sin sesión')
const consultas = []
const supabaseSinSesion = {
  auth: { getUser: async () => ({ data: { user: null } }) },
  from: (t) => { consultas.push(t); throw new Error('no tendría que consultar') },
}
const sinSesion = await comprasRecientes(supabaseSinSesion, AHORA)
ok(sinSesion === null, 'devuelve null (no se puede cruzar)')
ok(consultas.length === 0, 'no consulta la tabla de pedidos')

console.log('\n5. Con sesión: consulta solo los propios de la ventana')
const filtros = []
const consulta = {
  select: () => consulta,
  eq: (c, v) => { filtros.push([c, v]); return consulta },
  gte: (c, v) => { filtros.push([c, v]); return Promise.resolve({ data: [pagado(15)], error: null }) },
}
const supabaseConSesion = { auth: { getUser: async () => ({ data: { user: { id: 'u1' } } }) }, from: () => consulta }
const recientes = await comprasRecientes(supabaseConSesion, AHORA)
ok(recientes?.length === 1, 'devuelve los pedidos')
ok(filtros.some(([c, v]) => c === 'comprador_id' && v === 'u1'), 'filtra por quien compra')
ok(filtros.some(([c, v]) => c === 'creado_en' && v === hace(72)), 'desde hace 72 horas')
const conError = { ...supabaseConSesion, from: () => ({ select: () => ({ eq: () => ({ gte: async () => ({ data: null, error: { message: 'x' } }) }) }) }) }
ok(await comprasRecientes(conError, AHORA) === null, 'si la consulta falla, null: el carrito queda como está')

console.log('\n6. Checkout: compra en curso de la misma tienda')
ok(compraEnCursoDeLaTienda([cuponPendiente(15)], 15, AHORA)?.id === 101, 'cupón en efectivo pendiente → aviso')
ok(compraEnCursoDeLaTienda([pagado(15)], '15', AHORA)?.id === 100, 'pagado → aviso (el id como texto también)')
ok(compraEnCursoDeLaTienda([{ ...pagado(15), estado: 'preparando' }], 15, AHORA) !== null, 'ya en preparación → aviso')

console.log('\n7. Checkout: sin pedido previo')
ok(compraEnCursoDeLaTienda([], 15, AHORA) === null, 'sin pedidos → sin aviso')
ok(compraEnCursoDeLaTienda(null, 15, AHORA) === null, 'sin datos (falló la consulta) → sin aviso')
ok(compraEnCursoDeLaTienda([pagado(22)], 15, AHORA) === null, 'compra de otra tienda → sin aviso')

console.log('\n8. Lo que NO cuenta como compra')
ok(!esCompraEnCurso(pendienteSinPago(15), AHORA), 'pendiente sin pago (volvió de MercadoPago sin pagar)')
ok(sinLoYaComprado([tiendaA], [pendienteSinPago(15)], AHORA).length === 1, '…y no le vacía el carrito')
ok(!esCompraEnCurso({ ...pagado(15), estado: 'reembolsado' }, AHORA), 'reembolsado')
ok(!esCompraEnCurso({ ...pagado(15), estado: 'rechazado' }, AHORA), 'rechazado')
ok(!esCompraEnCurso({ ...pagado(15), estado: 'cancelado', cancelado_motivo: 'pago_vencido' }, AHORA), 'cancelado')
ok(!esCompraEnCurso({ ...cuponPendiente(15), efectivo_vence_en: hace(1) }, AHORA), 'cupón vencido sin pagar')
ok(!esCompraEnCurso({ ...pagado(15), creado_en: null }, AHORA), 'sin fecha de creación')

console.log('\n9. Lo que se agregó después de la compra se queda')
const mezcla = { ...tiendaA, items: [item(1, 5), item(3, 0.5)] }
r = sinLoYaComprado([mezcla], [pagado(15, 1)], AHORA)
ok(r.length === 1 && r[0].items.length === 1 && r[0].items[0].productoId === 3, 'sale el de antes, queda el de después')
const sinFecha = { ...tiendaA, items: [{ productoId: 1, cantidad: 1, precio: 100 }] }
ok(sinLoYaComprado([sinFecha], [pagado(15)], AHORA).length === 0, 'un producto sin fecha (carrito viejo) cuenta como de antes')

console.log('\n10. Otros casos')
const carrito = [tiendaA, tiendaB]
ok(sinLoYaComprado(carrito, [], AHORA) === carrito, 'sin compras: el mismo array (no re-renderiza)')
ok(sinLoYaComprado(carrito, [pagado(99)], AHORA) === carrito, 'compra de una tienda que no está: el mismo array')
ok(sinLoYaComprado(null, [pagado(15)], AHORA).length === 0, 'sin carrito: lista vacía, no se rompe')
ok(sinLoYaComprado([null, tiendaB], [pagado(15)], AHORA).length === 2, 'un local corrupto no rompe la lista')
const guardado = JSON.stringify(carrito)
sinLoYaComprado(carrito, [pagado(15)], AHORA)
ok(JSON.stringify(carrito) === guardado, 'no modifica el original')
const dosVeces = sinLoYaComprado(sinLoYaComprado(carrito, [pagado(15)], AHORA), [pagado(15)], AHORA)
ok(dosVeces.length === 1 && dosVeces[0] === tiendaB, 'cruzar dos veces (recargar) es lo mismo')

console.log(fallas === 0 ? '\nTODO OK' : `\n${fallas} FALLAS`)
process.exit(fallas ? 1 : 0)
