// Prueba que, al pagar, del carrito (localStorage, clave bahiashops_carrito)
// sale SOLO lo de la tienda que se pagó. Son funciones puras.
//
//   npm run probar:carrito

import { sinElLocal } from '../src/lib/carrito.js'

let fallas = 0
const ok = (c, m) => { if (!c) { fallas++; console.log('  ✗ FALLA:', m) } else console.log('  ✓', m) }

const carrito = [
  { vendedorId: 15, vendedorNombre: 'Ludoméstica', items: [{ productoId: 1, cantidad: 2, precio: 14000 }] },
  { vendedorId: 22, vendedorNombre: 'Otra tienda', items: [{ productoId: 9, cantidad: 1, precio: 5000 }, { productoId: 10, cantidad: 3, precio: 700 }] },
  { vendedorId: 31, vendedorNombre: 'Una más', items: [{ productoId: 12, cantidad: 1, precio: 100 }] },
]
const guardado = JSON.stringify(carrito)

console.log('1. Se paga la tienda 15')
let despues = sinElLocal(JSON.parse(guardado), 15)
ok(despues.length === 2 && !despues.some((l) => l.vendedorId === 15), 'sale el local de la tienda 15')
ok(JSON.stringify(despues) === JSON.stringify(carrito.slice(1)), 'los de las otras tiendas quedan idénticos, con todos sus productos')
ok(JSON.stringify(carrito) === guardado, 'sin modificar el original')

console.log('\n2. Otros casos')
ok(sinElLocal(carrito, '22').length === 2 && !sinElLocal(carrito, '22').some((l) => l.vendedorId === 22), 'el id como texto ("22") también saca la tienda 22')
ok(sinElLocal(carrito, 999).length === 3, 'una tienda que no está: no cambia nada')
ok(sinElLocal([], 15).length === 0, 'carrito vacío: sigue vacío')
ok(sinElLocal(null, 15).length === 0 && sinElLocal(undefined, 15).length === 0, 'sin carrito: lista vacía, no se rompe')
ok(sinElLocal([null, { vendedorId: 15, items: [] }, { vendedorId: 22, items: [] }], 15).length === 2, 'un local corrupto no rompe la lista')
const dosVeces = sinElLocal(sinElLocal(carrito, 15), 15)
ok(dosVeces.length === 2, 'pagar dos veces la misma tienda (recargar la página de éxito) es lo mismo')

console.log(fallas === 0 ? '\nTODO OK' : `\n${fallas} FALLAS`)
process.exit(fallas ? 1 : 0)
