// Prueba las funciones puras de los planes (src/lib/planes.js, migraciones
// 046 y 047):
// cómo se lee el plan que devuelve la base, qué dice el contador, cuál es el
// plan siguiente, qué plan trae los carritos y cómo se lee el error del tope
// (BS409) con su texto.
//
//   npm run probar:planes
//
// No toca Supabase ni ninguna base.

import {
  planDesdeLaBase, estadoDelContador, planSiguiente, planConCarritos, errorDeTope, textoDeTope, cuerpoDeTope, FALTAN_PARA_CERCA,
} from '../src/lib/planes.js'

let fallas = 0
const ok = (c, m) => { if (!c) { fallas++; console.log('  ✗ FALLA:', m) } else console.log('  ✓', m) }

const PLANES = [
  { clave: 'pro', nombre: 'Pro', orden: 3, precio_mensual: null, tope_productos: null, fotos_por_producto: null, carritos_abandonados: false, disponible: false },
  { clave: 'gratis', nombre: 'Gratis', orden: 1, precio_mensual: 0, tope_productos: 10, fotos_por_producto: 4, carritos_abandonados: false, disponible: true },
  { clave: 'basico', nombre: 'Básico', orden: 2, precio_mensual: 10000, tope_productos: 25, fotos_por_producto: 8, carritos_abandonados: true, disponible: true },
]

console.log('1. El plan que devuelve la base')
let p = planDesdeLaBase({ plan: 'gratis', nombre: 'Gratis', origen: 'gratis', especial: false, sin_tope: false,
  tope_productos: 10, fotos_por_producto: 4, carritos_abandonados: false, precio_mensual: 0, usados: '8' })
ok(p.clave === 'gratis' && p.tope === 10 && p.usados === 8 && p.fotosPorProducto === 4 && !p.carritos && !p.especial && !p.sinTope, 'el Gratis, con usados como número')
ok(!('precio' in p) && !('precio_mensual' in p), 'sin el precio (el especial es del admin)')
p = planDesdeLaBase({ plan: 'basico', nombre: 'Básico', especial: true, sin_tope: true, tope_productos: null, fotos_por_producto: 8, carritos_abandonados: true, usados: 40 })
ok(p.sinTope && p.tope === null && p.especial && p.carritos && p.usados === 40, 'la tienda propia: sin tope, especial, con carritos')
p = planDesdeLaBase(null)
ok(p.clave === null && p.usados === 0 && p.tope === null && !p.carritos, 'sin datos: todo vacío, sin carritos')

console.log('\n2. El contador')
ok(estadoDelContador({ tope: 10, usados: 0 }) === 'normal', '0 de 10: normal')
ok(estadoDelContador({ tope: 10, usados: 10 - FALTAN_PARA_CERCA - 1 }) === 'normal', `faltan ${FALTAN_PARA_CERCA + 1}: normal`)
ok(estadoDelContador({ tope: 10, usados: 10 - FALTAN_PARA_CERCA }) === 'cerca', `faltan ${FALTAN_PARA_CERCA}: cerca`)
ok(estadoDelContador({ tope: 10, usados: 9 }) === 'cerca', '9 de 10: cerca')
ok(estadoDelContador({ tope: 10, usados: 10 }) === 'en_el_tope', '10 de 10: en el tope')
ok(estadoDelContador({ tope: 10, usados: 12 }) === 'por_encima', '12 de 10 (se bajó el tope): por encima')
ok(estadoDelContador({ tope: null, usados: 50 }) === 'sin_tope' && estadoDelContador({ tope: 10, usados: 50, sinTope: true }) === 'sin_tope', 'sin tope')
ok(estadoDelContador({ tope: 1, usados: 0 }) === 'cerca', 'tope 1 y ninguno: cerca')

console.log('\n3. El plan siguiente')
let s = planSiguiente(PLANES, 'gratis')
ok(s?.clave === 'basico' && s.tope === 25 && s.fotosPorProducto === 8 && s.carritos && s.precio === 10000, 'del Gratis: el Básico, con sus datos')
ok(planSiguiente(PLANES, 'basico') === null, 'del Básico: ninguno (el Pro no está disponible)')
ok(planSiguiente(PLANES, 'gratis', { especial: true }) === null, 'con condiciones especiales: ninguno')
ok(planSiguiente(PLANES, 'otro') === null && planSiguiente(null, 'gratis') === null, 'un plan desconocido o sin lista: ninguno')
s = planSiguiente(PLANES.map((x) => (x.clave === 'pro' ? { ...x, disponible: true, precio_mensual: 1, tope_productos: 99, fotos_por_producto: 9 } : x)), 'basico')
ok(s?.clave === 'pro', 'si el Pro se habilita, es el siguiente del Básico')

console.log('\n4. Qué plan trae los carritos')
ok(planConCarritos(PLANES) === 'Básico', 'el Básico')
ok(planConCarritos(PLANES.map((x) => ({ ...x, carritos_abandonados: false }))) === null && planConCarritos(null) === null, 'ninguno, o sin lista: null')

console.log('\n5. El error del tope (BS409)')
let t = errorDeTope({ code: 'BS409', message: 'tope_productos', details: '{"tope": 10, "usados": 10}' })
ok(t?.motivo === 'tope_productos' && t.tope === 10 && t.usados === 10, 'tope de productos, con los números del detalle')
t = errorDeTope({ code: 'BS409', message: 'tope_fotos', details: '{"tope": 4, "usados": 5}' })
ok(t?.motivo === 'tope_fotos' && t.tope === 4 && t.usados === 5, 'tope de fotos')
t = errorDeTope({ code: 'BS409', message: 'tope_productos', details: { tope: 25, usados: 25 } })
ok(t?.tope === 25, 'el detalle ya como objeto')
t = errorDeTope({ code: 'BS409', message: 'tope_productos', details: 'no es json' })
ok(t?.motivo === 'tope_productos' && t.tope === null && t.usados === null, 'un detalle que no se entiende: sin los números, pero es el tope')
t = errorDeTope({ code: 'BS409', message: 'otra cosa' })
ok(t?.motivo === 'tope_productos', 'un mensaje desconocido con BS409: se toma como tope de productos')
ok(errorDeTope({ code: 'P0002', message: 'No encontramos ese producto.' }) === null && errorDeTope(null) === null, 'otro error: null')
t = errorDeTope({ code: 'BS409', message: 'tope_superado', details: '{"tope": 10, "usados": 11, "cuenta": "guardados"}' })
ok(t?.motivo === 'tope_superado' && t.tope === 10 && t.usados === 11 && t.accion === 'reenviar',
  'tope superado (047): solo lo lanza el reenvío de un rechazado, así que accion: reenviar')
ok(!('accion' in errorDeTope({ code: 'BS409', message: 'tope_productos', details: '{"tope": 10, "usados": 10}' })), 'el del alta, sin accion')

console.log('\n6. Los textos del 409')
ok(textoDeTope({ motivo: 'tope_productos', tope: 10 }) === 'Llegaste a los 10 productos de tu plan. Cuentan todos, también los pausados: para cargar otro, eliminá uno.',
  `productos: «${textoDeTope({ motivo: 'tope_productos', tope: 10 })}»`)
ok(textoDeTope({ motivo: 'tope_productos' }) === 'Llegaste al tope de productos de tu plan. Cuentan todos, también los pausados: para cargar otro, eliminá uno.',
  `productos, sin el número: «${textoDeTope({ motivo: 'tope_productos' })}»`)
ok(!/paus[aá] o elimin/.test(textoDeTope({ motivo: 'tope_productos', tope: 10 })), 'ya no dice «pausá o eliminá»')
ok(textoDeTope({ motivo: 'tope_superado', tope: 10, usados: 11, accion: 'activar' }) === 'Tenés 11 productos y tu plan guarda 10. Para activar este, eliminá productos hasta tener 10.',
  `activar por encima: «${textoDeTope({ motivo: 'tope_superado', tope: 10, usados: 11, accion: 'activar' })}»`)
ok(textoDeTope({ motivo: 'tope_superado', tope: 10, usados: 11, accion: 'reenviar' }) === 'Tenés 11 productos y tu plan guarda 10. Para reenviar este, eliminá productos hasta tener 10.',
  `reenviar por encima: «${textoDeTope({ motivo: 'tope_superado', tope: 10, usados: 11, accion: 'reenviar' })}»`)
ok(textoDeTope({ motivo: 'tope_superado', tope: 10, usados: 11 }).includes('Para activar este'), 'sin accion: activar')
ok(textoDeTope({ motivo: 'tope_superado', tope: 10 }) === 'Tenés más productos de los 10 que guarda tu plan. Para activar este, eliminá productos hasta tener 10.',
  `por encima, sin usados: «${textoDeTope({ motivo: 'tope_superado', tope: 10 })}»`)
ok(textoDeTope({ motivo: 'tope_superado', accion: 'reenviar' }) === 'Tenés más productos de los que guarda tu plan. Para reenviar este, eliminá productos hasta llegar al tope.',
  `por encima, sin números: «${textoDeTope({ motivo: 'tope_superado', accion: 'reenviar' })}»`)
ok(textoDeTope({ motivo: 'tope_fotos', tope: 4 }) === 'Este producto puede tener hasta 4 fotos con tu plan. Sacá alguna para poder guardarlo.',
  `fotos: «${textoDeTope({ motivo: 'tope_fotos', tope: 4 })}»`)
ok(/más fotos de las que permite tu plan/.test(textoDeTope({ motivo: 'tope_fotos' })), 'fotos, sin el número')
const cuerpo = cuerpoDeTope({ motivo: 'tope_productos', tope: 10, usados: 10, otra: 'cosa' })
ok(JSON.stringify(Object.keys(cuerpo)) === '["error","motivo","tope","usados"]' && cuerpo.tope === 10, 'el cuerpo del 409: { error, motivo, tope, usados } y nada más')
const cuerpoReenvio = cuerpoDeTope({ motivo: 'tope_superado', tope: 10, usados: 12, accion: 'reenviar', cuenta: 'guardados' })
ok(cuerpoReenvio.error.includes('Para reenviar este') && !('accion' in cuerpoReenvio) && !('cuenta' in cuerpoReenvio),
  'el de reenviar: el texto con «reenviar», sin accion ni cuenta en el cuerpo')

console.log(fallas === 0 ? '\nTODO OK' : `\n${fallas} FALLAS`)
process.exit(fallas ? 1 : 0)
