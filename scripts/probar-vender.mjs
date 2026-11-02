// Prueba planesParaLaVenta (src/lib/planes.js): qué muestra la página
// /vender con lo que lee de public.planes, y cuándo sale sin números.
//
//   npm run probar:vender
//
// No toca Supabase ni ninguna base.

import { planesParaLaVenta } from '../src/lib/planes.js'

let fallas = 0
const ok = (c, m) => { if (!c) { fallas++; console.log('  ✗ FALLA:', m) } else console.log('  ✓', m) }

const HOY = [
  { clave: 'gratis', nombre: 'Gratis', orden: 1, precio_mensual: 0, tope_productos: 10, fotos_por_producto: 4, carritos_abandonados: false, disponible: true },
  { clave: 'basico', nombre: 'Básico', orden: 2, precio_mensual: 10000, tope_productos: 25, fotos_por_producto: 8, carritos_abandonados: true, disponible: true },
  { clave: 'pro', nombre: 'Pro', orden: 3, precio_mensual: null, tope_productos: null, fotos_por_producto: null, carritos_abandonados: false, disponible: false },
]
const con = (clave, cambios) => HOY.map((p) => (p.clave === clave ? { ...p, ...cambios } : p))

console.log('1. Los planes de hoy')
let v = planesParaLaVenta(HOY)
ok(v.gratis.precio === '$0' && v.gratis.tope === 10 && v.gratis.fotos === 4 && v.gratis.carritos === false, 'Gratis: $0, 10 productos, 4 fotos, sin carritos')
ok(v.basico.precio === '$10.000' && v.basico.tope === 25 && v.basico.fotos === 8 && v.basico.carritos === true, 'Básico: $10.000, 25 productos, 8 fotos, con carritos')
ok(v.pro.proximamente === true && v.pro.nombre === 'Pro' && !('precio' in v.pro), 'Pro: Próximamente, sin precio')
ok(planesParaLaVenta([...HOY].reverse()).basico.tope === 25, 'el orden de las filas no importa')

console.log('2. Un cambio en la tabla se ve en la página')
v = planesParaLaVenta(con('basico', { precio_mensual: 12500, tope_productos: 30, fotos_por_producto: 9 }))
ok(v.basico.precio === '$12.500' && v.basico.tope === 30 && v.basico.fotos === 9, 'Básico a $12.500 con 30 productos y 9 fotos')
v = planesParaLaVenta(con('gratis', { tope_productos: 12, carritos_abandonados: true }))
ok(v.gratis.tope === 12 && v.gratis.carritos === true, 'Gratis con 12 productos y carritos')
v = planesParaLaVenta(con('basico', { nombre: 'Emprendedor' }))
ok(v.basico.nombre === 'Emprendedor', 'el nombre también sale de la tabla')
v = planesParaLaVenta(con('basico', { precio_mensual: 1234567 }))
ok(v.basico.precio === '$1.234.567', 'punto de miles')

console.log('3. El Pro')
v = planesParaLaVenta(con('pro', { disponible: true, precio_mensual: 25000, tope_productos: 200, fotos_por_producto: 12, carritos_abandonados: true }))
ok(v.pro.proximamente === false && v.pro.precio === '$25.000' && v.pro.tope === 200 && v.pro.fotos === 12 && v.pro.carritos, 'disponible con precio: se puede elegir')
v = planesParaLaVenta(con('pro', { disponible: true, precio_mensual: null }))
ok(v.pro.proximamente === true, 'disponible sin precio: Próximamente')
v = planesParaLaVenta(con('pro', { disponible: false, precio_mensual: 25000 }))
ok(v.pro.proximamente === true, 'con precio pero no disponible: Próximamente')
v = planesParaLaVenta(HOY.filter((p) => p.clave !== 'pro'))
ok(v.pro.proximamente === true && v.pro.nombre === 'Pro', 'sin fila del Pro: Próximamente igual')

console.log('4. Sin números (la página no inventa valores)')
ok(planesParaLaVenta(null) === null, 'la lectura falló (null)')
ok(planesParaLaVenta(undefined) === null, 'undefined')
ok(planesParaLaVenta([]) === null, 'tabla vacía')
ok(planesParaLaVenta(HOY.filter((p) => p.clave !== 'basico')) === null, 'sin Básico')
ok(planesParaLaVenta(HOY.filter((p) => p.clave !== 'gratis')) === null, 'sin Gratis')
ok(planesParaLaVenta(con('basico', { disponible: false })) === null, 'Básico no disponible')
ok(planesParaLaVenta(con('basico', { precio_mensual: null })) === null, 'Básico sin precio')
ok(planesParaLaVenta(con('gratis', { tope_productos: null })) === null, 'Gratis sin tope')
ok(planesParaLaVenta(con('basico', { fotos_por_producto: 0 })) === null, 'Básico con 0 fotos')
ok(planesParaLaVenta(con('basico', { tope_productos: '25' })) === null, 'un tope que no es número')
ok(planesParaLaVenta([null, ...HOY]).basico.tope === 25, 'una fila null en la lista no rompe')

console.log(fallas ? `\n${fallas} FALLA(S)` : '\nTODO OK')
process.exit(fallas ? 1 : 0)
