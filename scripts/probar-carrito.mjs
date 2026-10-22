// Prueba que, al pagar, del carrito (localStorage, clave bahiashops_carrito)
// sale SOLO lo de la tienda que se pagó. Son funciones puras.
//
//   npm run probar:carrito
//
// Y que cada talle sea una línea aparte (agregar, cambiar cantidad, quitar),
// los carritos guardados con la forma vieja y las líneas sin talle.

import {
  sinElLocal, claveLinea, agregarLinea, cambiarCantidadLinea, quitarLinea, normalizarCarrito, lineasSinVariante,
  asignarVariante,
} from '../src/lib/carrito.js'
import { pideVariante, nombreVariante } from '../src/lib/variantes.js'

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

console.log('\n3. Cada talle es una línea')
{
  const tienda = { id: 16, nombre: 'Plan Material' }
  const remera = (variante) => ({ productoId: 9, nombre: 'Remera PRUEBA TALLES', precio: 7000, foto: null, variante, cantidad: 1 })
  let c = agregarLinea([], remera('S'), tienda, 1)
  c = agregarLinea(c, remera('M'), tienda, 2)
  ok(c.length === 1 && c[0].items.length === 2, 'S y después M: dos líneas, no 2 × S')
  ok(c[0].items[0].variante === 'S' && c[0].items[0].cantidad === 1 && c[0].items[1].variante === 'M' && c[0].items[1].cantidad === 1,
    'cada una con su talle y una unidad')
  c = agregarLinea(c, remera(' S '), tienda, 3)
  ok(c[0].items.length === 2 && c[0].items[0].cantidad === 2 && c[0].items[0].agregadoEn === 3, 'S otra vez (con espacios): suma a la línea de S')

  const taza = { productoId: 4, nombre: 'Taza PRUEBA TALLES', precio: 3000, foto: null, variante: null, cantidad: 1 }
  let t = agregarLinea([], taza, { id: 15, nombre: 'Ludoméstica' }, 1)
  t = agregarLinea(t, { ...taza, variante: '' }, { id: 15, nombre: 'Ludoméstica' }, 2)
  ok(t[0].items.length === 1 && t[0].items[0].cantidad === 2 && t[0].items[0].variante === null, 'sin variantes: una sola línea, como antes')

  const sinTalle = agregarLinea(c, remera(null), tienda, 4)
  ok(sinTalle[0].items.length === 3, 'sin talle no se mezcla con S ni con M')

  const claveM = claveLinea(remera('M'))
  let d = cambiarCantidadLinea(c, 16, claveM, 5)
  ok(d[0].items[1].cantidad === 5 && d[0].items[0].cantidad === 2, 'cambiar la cantidad de M no toca S')
  d = cambiarCantidadLinea(c, 16, claveM, 0)
  ok(d[0].items[1].cantidad === 1, 'la cantidad no baja de 1')
  d = quitarLinea(c, 16, claveLinea(remera('S')))
  ok(d[0].items.length === 1 && d[0].items[0].variante === 'M', 'quitar S deja M')
  d = quitarLinea(d, 16, claveM)
  ok(d.length === 0, 'quitar la última línea saca el local')
  ok(c[0].items.length === 2 && c[0].items[0].cantidad === 2, 'sin modificar el original')
  ok(claveLinea({ productoId: '9', variante: 'S' }) === claveLinea({ productoId: 9, variante: ' S' }), 'el id como texto y los espacios no cambian la línea')
}

console.log('\n4. Carritos guardados con la forma vieja')
{
  const viejo = JSON.parse(JSON.stringify([
    { vendedorId: 16, vendedorNombre: 'Plan Material', items: [{ productoId: 9, nombre: 'Remera', precio: 7000, variante: 'S', cantidad: 2 }] },
    { vendedorId: 15, vendedorNombre: 'Ludoméstica', items: [{ productoId: 4, nombre: 'Taza', precio: 3000, cantidad: 1 }] },
  ]))
  const n = normalizarCarrito(viejo)
  ok(n.length === 2 && n[0].items[0].variante === 'S' && n[1].items[0].variante === null, 'se lee igual; sin variante queda null')
  const sumado = agregarLinea(n, { productoId: 9, nombre: 'Remera', precio: 7000, variante: 'M', cantidad: 1 }, { id: 16, nombre: 'Plan Material' }, 5)
  ok(sumado[0].items.length === 2, 'agregar M a un carrito viejo con S: dos líneas')
  ok(normalizarCarrito(null).length === 0 && normalizarCarrito({}).length === 0, 'lo que no es una lista: carrito vacío')
  ok(normalizarCarrito([null, { vendedorId: 1 }]).length === 0, 'locales rotos: se descartan')
}

console.log('\n5. Líneas sin talle de un producto que lo pide')
{
  const items = [
    { productoId: 9, variante: null, cantidad: 1 },
    { productoId: 9, variante: 'S', cantidad: 1 },
    { productoId: 4, variante: null, cantidad: 1 },
  ]
  const piden = new Map([[9, 'talle']])
  const faltan = lineasSinVariante(items, piden)
  ok(faltan.length === 1 && faltan[0].productoId === 9 && faltan[0].variante === null, 'solo la remera sin talle; la taza sin variantes no')
  ok(lineasSinVariante(items, null).length === 0, 'si no se pudo averiguar: no se acusa a ninguna')

  ok(pideVariante({ tiene_variantes: true }, [{ id: 1 }]) === true, 'con tiene_variantes y talles cargados: pide talle')
  ok(pideVariante({ tiene_variantes: true }, []) === false, 'con tiene_variantes y ninguno cargado: se compra sin elegir')
  ok(pideVariante({ tiene_variantes: false }, [{ id: 1 }]) === false, 'sin tiene_variantes: no pide')
  ok(nombreVariante({ propiedad_1_nombre: 'Talle' }) === 'talle' && nombreVariante({}) === 'opción', 'cómo se llama lo que falta')
}

console.log('\n6. Elegir el talle de una línea sin talle')
{
  const remera = (variante, cantidad, agregadoEn) => ({ productoId: 9, nombre: 'Remera PRUEBA TALLES', precio: 7000, variante, cantidad, agregadoEn })
  const otraTienda = { vendedorId: 15, vendedorNombre: 'Ludoméstica', items: [{ productoId: 4, variante: null, cantidad: 1 }] }
  const carrito = [
    { vendedorId: 18, vendedorNombre: 'Bahía Shops', items: [remera('S', 2, 10), remera('M', 1, 11), remera(null, 1, 5)] },
    otraTienda,
  ]
  const guardado = JSON.stringify(carrito)
  const sinTalle = claveLinea(remera(null))

  // Ya hay una línea con ese talle: se le suma y la sin talle desaparece.
  let r = asignarVariante(carrito, 18, sinTalle, 'M')
  ok(r[0].items.length === 2, 'elegir M con una línea de M: quedan dos líneas, no tres')
  ok(r[0].items[0].variante === 'S' && r[0].items[0].cantidad === 2, 'S × 2 no cambia')
  ok(r[0].items[1].variante === 'M' && r[0].items[1].cantidad === 2, 'M pasa a × 2 (1 + 1 de la línea sin talle)')
  ok(r[0].items[1].agregadoEn === 11, 'con la fecha más nueva de las dos')
  ok(lineasSinVariante(r[0].items, new Map([[9, {}]])).length === 0, 'ya no queda ninguna línea sin talle')

  // No hay línea con ese talle: la sin talle pasa a tenerlo, con su cantidad.
  r = asignarVariante(carrito, 18, sinTalle, ' L ')
  ok(r[0].items.length === 3, 'elegir L sin línea de L: siguen tres líneas')
  ok(r[0].items[2].variante === 'L' && r[0].items[2].cantidad === 1 && r[0].items[2].agregadoEn === 5, 'la sin talle pasa a L × 1, en el mismo lugar')

  ok(r[1] === otraTienda, 'la otra tienda no se toca')
  ok(asignarVariante(carrito, 18, sinTalle, '')[0] === carrito[0], 'un talle vacío no cambia nada')
  ok(asignarVariante(carrito, 18, 'nada|', 'M')[0] === carrito[0], 'una línea que no está: no cambia nada')
  ok(asignarVariante(carrito, 15, sinTalle, 'M')[0] === carrito[0], 'la clave en otra tienda: no toca la de esta')
  ok(JSON.stringify(carrito) === guardado, 'sin modificar el original')
}

console.log(fallas === 0 ? '\nTODO OK' : `\n${fallas} FALLAS`)
process.exit(fallas ? 1 : 0)
