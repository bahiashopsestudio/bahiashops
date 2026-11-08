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
  textoPrecio, notaDelContador, etiquetaDelPlan, textosDelCartel, validarPlanAdmin, avisosDePlan, planesAsignables,
  cantidad, aLos, quedanPublicados, quedaronPublicados, sePausan,
  validarEspecial, atajosEspecial, enteroDelCampo, LINK_PLANES,
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

console.log('\n7. El precio')
ok(textoPrecio(0) === '$0' && textoPrecio(10000) === '$10.000' && textoPrecio(1250000) === '$1.250.000', `textoPrecio: ${textoPrecio(0)}, ${textoPrecio(10000)}, ${textoPrecio(1250000)}`)

// El plan como lo manda /api/vendedor/plan.
const SIG = planSiguiente(PLANES, 'gratis')
const GRATIS = (usados, extra = {}) => ({ plan: { clave: 'gratis', nombre: 'Gratis' }, tope: 10, usados, fotosPorProducto: 4, carritos: false,
  especial: false, sinTope: false, contador: estadoDelContador({ tope: 10, usados }), siguiente: SIG, ...extra })
const MEDIDA = (usados) => ({ plan: { clave: 'basico', nombre: 'Básico' }, tope: 50, usados, fotosPorProducto: 8, carritos: true,
  especial: true, sinTope: false, contador: estadoDelContador({ tope: 50, usados }), siguiente: null })
const PROPIA = { plan: { clave: 'basico', nombre: 'Básico' }, tope: null, usados: 18, fotosPorProducto: 8, carritos: true,
  especial: true, sinTope: true, contador: 'sin_tope', siguiente: null }

console.log('\n8. La nota del contador')
ok(notaDelContador(GRATIS(6)) === null, '6 de 10: sin nota')
ok(notaDelContador(GRATIS(9))?.texto === 'Te queda 1 lugar.', 'faltando 1: «Te queda 1 lugar.»')
ok(notaDelContador(GRATIS(8))?.texto === 'Te quedan 2 lugares.', 'faltando 2: «Te quedan 2 lugares.»')
ok(notaDelContador(GRATIS(10))?.texto === 'Llegaste al tope de tu plan.', 'en el tope')
let n = notaDelContador(GRATIS(11))
ok(n?.texto === 'Tenés 11 productos y tu plan Gratis guarda 10.' && n.link?.texto === 'Conocer el plan Básico' && n.link.href === '/vender#planes'
  && n.despues === 'Si no, eliminá productos hasta bajar a 10.', `por encima en el Gratis: «${n?.texto} [${n?.link?.texto}] ${n?.despues}»`)
ok(!notaDelContador(GRATIS(11, { siguiente: null })).link, 'por encima sin plan siguiente (no se leyeron los planes): sin el link')
n = notaDelContador(MEDIDA(52))
ok(n?.texto === 'Tenés 52 productos y tu plan guarda 50.' && !n.link && n.despues === 'Si no, eliminá productos hasta bajar a 50.',
  `por encima en el plan a medida: «${n?.texto} ${n?.despues}», sin link`)
ok(notaDelContador(PROPIA) === null, 'sin tope: sin nota')
ok(LINK_PLANES === '/vender#planes', 'el link a los planes')

console.log('\n9. La etiqueta del plan')
ok(etiquetaDelPlan(GRATIS(3)) === 'Plan Gratis' && etiquetaDelPlan(MEDIDA(3)) === 'Plan a medida' && etiquetaDelPlan(PROPIA) === null && etiquetaDelPlan(null) === null,
  'Plan Gratis, Plan a medida, y nada sin tope')

console.log('\n10. Los textos del cartel')
let c = textosDelCartel({ motivo: 'productos', datos: GRATIS(10) })
ok(c.eyebrow === 'Tu plan Gratis' && c.titulo === 'Llegaste a los 10 productos de tu plan' && c.intro === 'Con el plan Básico mostrás más, por $10.000 por mes:',
  `en el tope del Gratis: «${c.eyebrow} / ${c.titulo} / ${c.intro}»`)
ok(JSON.stringify(c.chips) === JSON.stringify(['Hasta 25 productos', 'Hasta 8 fotos por producto', 'Carritos abandonados']), `los chips: ${c.chips.join(' · ')}`)
ok(c.cierre === 'Cuentan todos tus productos, también los pausados. Para cargar otro ahora, eliminá uno.' && c.boton?.texto === 'Conocer el plan Básico'
  && c.boton.href === '/vender#planes' && !c.contacto, 'el cierre y el botón al Básico')
c = textosDelCartel({ motivo: 'productos', datos: GRATIS(10, { siguiente: null }) })
ok(c.intro === null && c.chips.length === 0 && c.boton === null && c.titulo === 'Llegaste a los 10 productos de tu plan', 'sin plan siguiente: sin comparación ni botón')
c = textosDelCartel({ motivo: 'productos', datos: MEDIDA(50) })
ok(c.eyebrow === 'Tu plan a medida' && c.titulo === 'Llegaste a los 50 productos de tu plan' && c.boton === null && c.contacto === true && c.intro === null
  && c.cierre === 'Cuentan todos tus productos, también los pausados. Para cargar otro, eliminá uno.', 'plan a medida en el tope: sin el Básico, con «Escribinos»')
c = textosDelCartel({ motivo: 'superado', accion: 'activar', datos: GRATIS(11) })
ok(c.titulo === 'Para activar este producto, hacé lugar' && c.cierre === 'Tenés 11 productos y tu plan guarda 10. Para activar este, eliminá productos hasta tener 10.',
  `activar por encima: «${c.titulo} / ${c.cierre}»`)
ok(!/paus/i.test(c.cierre) && !/paus/i.test(c.titulo), 'no dice «pausá»')
c = textosDelCartel({ motivo: 'superado', accion: 'reenviar', datos: GRATIS(12), tope: 10, usados: 12 })
ok(c.titulo === 'Para reenviar este producto, hacé lugar' && c.cierre === 'Tenés 12 productos y tu plan guarda 10. Para reenviar este, eliminá productos hasta tener 10.',
  `reenviar por encima: «${c.titulo} / ${c.cierre}»`)
c = textosDelCartel({ motivo: 'superado', accion: 'activar', datos: MEDIDA(52) })
ok(c.contacto && c.boton === null && c.cierre.startsWith('Tenés 52 productos y tu plan guarda 50.'), 'activar por encima en el plan a medida: sin el Básico, con «Escribinos»')
c = textosDelCartel({ motivo: 'fotos', datos: GRATIS(3) })
ok(c.titulo === 'Llegaste a las 4 fotos de tu plan' && c.intro === 'Con el plan Básico podés subir hasta 8 fotos por producto.' && c.boton?.texto === 'Conocer el plan Básico',
  `fotos en el Gratis: «${c.titulo} / ${c.intro}»`)
c = textosDelCartel({ motivo: 'fotos', datos: MEDIDA(3) })
ok(c.titulo === 'Llegaste a las 8 fotos de tu plan' && c.intro === null && c.boton === null && c.contacto, 'fotos en el plan a medida: sin el Básico, con «Escribinos»')

// Cargar uno nuevo por encima del tope (le bajaron el tope o le quitaron una especial).
c = textosDelCartel({ motivo: 'productos', datos: GRATIS(10, { tope: 9, contador: 'por_encima' }) })
ok(c.titulo === 'Tenés 10 productos y tu plan guarda 9' && c.cierre === 'Cuentan todos tus productos, también los pausados. Para cargar otro, eliminá productos hasta tener 8.',
  `cargar por encima: «${c.titulo} / ${c.cierre}»`)
ok(c.boton?.texto === 'Conocer el plan Básico' && c.chips.length === 3, 'en el Gratis, con el Básico')
c = textosDelCartel({ motivo: 'productos', datos: GRATIS(10), tope: 9, usados: 11 })
ok(c.titulo === 'Tenés 11 productos y tu plan guarda 9' && c.cierre.endsWith('hasta tener 8.'), 'con los números del 409')
c = textosDelCartel({ motivo: 'productos', datos: GRATIS(9, { tope: 9, contador: 'en_el_tope' }) })
ok(c.titulo === 'Llegaste a los 9 productos de tu plan', 'en el tope justo: como antes')
c = textosDelCartel({ motivo: 'productos', datos: MEDIDA(52) })
ok(c.titulo === 'Tenés 52 productos y tu plan guarda 50' && c.cierre.endsWith('hasta tener 49.') && c.contacto && !c.boton, 'plan a medida por encima: con «Escribinos», sin el Básico')

// Con condiciones especiales nunca se ofrece el Básico, aunque llegue un plan siguiente.
const MEDIDA_CON_SIG = { ...MEDIDA(10), tope: 9, siguiente: SIG }
for (const [motivo, accion] of [['productos'], ['superado', 'activar'], ['superado', 'reenviar'], ['fotos']]) {
  c = textosDelCartel({ motivo, accion, datos: MEDIDA_CON_SIG })
  ok(c.intro === null && c.chips.length === 0 && c.boton === null && c.contacto === true && c.eyebrow === 'Tu plan a medida',
    `plan a medida, ${motivo}${accion ? ' ' + accion : ''}: sin comparación ni «Conocer el plan Básico», con «Escribinos»`)
}

console.log('\n10b. El cartel con las suscripciones (F3.2)')
for (const [motivo, accion] of [['productos'], ['superado', 'activar'], ['fotos']]) {
  c = textosDelCartel({ motivo, accion, datos: GRATIS(motivo === 'fotos' ? 3 : 10, { suscripciones: true }) })
  ok(c.boton?.texto === 'Pasarme al Básico' && c.boton.modal === true && !c.boton.href && c.secundario?.texto === 'Ver los planes' && c.secundario.href === '/vender#planes',
    `en el Gratis, ${motivo}: «Pasarme al Básico» abre el alta, y «Ver los planes»`)
}
c = textosDelCartel({ motivo: 'productos', datos: GRATIS(10, { suscripciones: false }) })
ok(c.boton?.texto === 'Conocer el plan Básico' && c.boton.href === '/vender#planes' && !c.secundario, 'con las suscripciones cerradas: como antes')
const PENDIENTE = GRATIS(10, { suscripciones: true, origen: 'gratis', especialPendiente: { precio: 20000, tope: 50, sinTope: false } })
for (const [motivo, accion] of [['productos'], ['superado', 'activar'], ['fotos']]) {
  c = textosDelCartel({ motivo, accion, datos: PENDIENTE })
  ok(c.titulo === 'Tu plan a medida te está esperando' && c.intro === 'Te armamos 50 productos por $20.000 por mes. Mientras no se active, rige el plan Gratis: 10 productos.'
    && c.boton?.texto === 'Suscribirme por $20.000 por mes' && c.boton.modal === true && !c.contacto,
    `plan a medida sin pagar, ${motivo}: «${c.titulo} / ${c.intro} [${c.boton?.texto}]»`)
}
c = textosDelCartel({ motivo: 'productos', datos: { ...PENDIENTE, origen: 'suscripcion', plan: { clave: 'basico', nombre: 'Básico' }, tope: 25 } })
ok(c.titulo === 'Tu plan a medida te está esperando' && c.boton?.href === '/vendedor/perfil' && !c.boton.modal && /rige el plan Básico: 25 productos/.test(c.intro),
  'plan a medida y ya paga el Básico: lo manda a Mi negocio (la diferencia)')
c = textosDelCartel({ motivo: 'productos', datos: { ...MEDIDA(50), suscripciones: true } })
ok(c.contacto && !c.boton, 'plan a medida activo: sigue «Escribinos»')

console.log('\n10c. Volvió al Gratis (050)')
const VUELTA = (extra = {}) => GRATIS(25, { tope: 10, contador: 'por_encima', suscripciones: true, caida: { motivo: 'falta_de_pago', nombre: 'Básico', aMedida: false, pausados: 15 }, ...extra })
n = notaDelContador(VUELTA())
ok(n.texto === 'Tu plan volvió al Gratis. Para reactivar tu plan Básico' && n.link?.texto === 'hacé click acá' && n.link.modal === true && n.despues === 'Si no, eliminá productos hasta bajar a 10.',
  `el contador: «${n.texto} [${n.link?.texto}]. ${n.despues}»`)
n = notaDelContador(VUELTA({ caida: { motivo: 'falta_de_pago', nombre: 'Básico', aMedida: true, pausados: 32 } }))
ok(n.texto === 'Tu plan volvió al Gratis. Para reactivar tu plan a medida', 'en el plan a medida, «tu plan a medida»')
ok(notaDelContador(VUELTA({ caida: { motivo: 'condiciones_quitadas', nombre: 'Básico', aMedida: true } })).texto.startsWith('Tenés 25 productos'),
  'con condiciones quitadas, el texto de siempre')
ok(notaDelContador(VUELTA({ suscripciones: false })).link?.href === '/vender#planes', 'con las suscripciones cerradas, el de siempre')
for (const [motivo, accion] of [['productos'], ['superado', 'activar'], ['fotos']]) {
  c = textosDelCartel({ motivo, accion, datos: VUELTA() })
  ok(c.cierre?.antes === 'Tu plan volvió al Gratis. Para reactivar tu plan Básico ' && c.cierre.link.modal === true
    && (motivo === 'fotos' ? c.cierre.despues === '.' : c.cierre.despues === '. Si no, eliminá productos hasta bajar a 10.') && !c.boton && !c.contacto,
    `el cartel, ${motivo}: el mismo texto, con el link que abre el alta`)
}
p = planDesdeLaBase({ plan: 'gratis', caida: { motivo: 'baja', nombre: 'Básico', a_medida: false, pausados: 3 }, pausados_por_plan: 3 })
ok(p.caida?.motivo === 'baja' && p.caida.pausados === 3 && p.pausadosPorPlan === 3 && planDesdeLaBase({ plan: 'gratis' }).caida === null, 'planDesdeLaBase trae la caída')

console.log('\n10d. Singular y plural')
ok(sePausan(1) === 'se pausa 1 producto' && sePausan(15) === 'se pausan 15 productos', 'se pausa 1 / se pausan 15 (el verbo también)')
ok(cantidad(1, 'producto', 'productos') === '1 producto' && cantidad(25, 'producto', 'productos') === '25 productos' && cantidad(0, 'foto', 'fotos') === '0 fotos', 'cantidad: 1 y varios')
ok(aLos(10, 'producto', 'productos') === 'a los 10 productos' && aLos(1, 'producto', 'productos') === 'al único producto'
  && aLos(1, 'foto', 'fotos', { femenino: true }) === 'a la única foto' && aLos(4, 'foto', 'fotos', { femenino: true }) === 'a las 4 fotos', 'a los / al único, a las / a la única')
ok(quedanPublicados(1) === 'queda publicado tu primer producto' && quedanPublicados(10) === 'quedan publicados tus 10 primeros productos'
  && quedaronPublicados(1) === 'quedó publicado tu primer producto' && quedaronPublicados(10) === 'quedaron publicados tus 10 primeros'
  && quedanPublicados(25, { tercera: true }) === 'quedan publicados sus 25 primeros productos' && quedanPublicados(1, { tercera: true }) === 'queda publicado su primer producto', '«tu primer producto» con 1, y «sus» para el admin')
const UNO = { ...GRATIS(1, { tope: 1, contador: 'en_el_tope', fotosPorProducto: 1 }), siguiente: { ...SIG, tope: 1, fotosPorProducto: 1 } }
c = textosDelCartel({ motivo: 'productos', datos: UNO })
ok(c.titulo === 'Llegaste al único producto de tu plan' && c.chips.includes('Hasta 1 producto') && c.chips.includes('Hasta 1 foto por producto'), `el cartel con topes de 1: «${c.titulo}» · ${c.chips.join(' · ')}`)
c = textosDelCartel({ motivo: 'fotos', datos: UNO })
ok(c.titulo === 'Llegaste a la única foto de tu plan', `fotos con 1: «${c.titulo}»`)
ok(textoDeTope({ motivo: 'tope_fotos', tope: 1 }).startsWith('Este producto puede tener hasta 1 foto con tu plan') && textoDeTope({ motivo: 'tope_productos', tope: 1 }).startsWith('Llegaste al único producto de tu plan.'),
  'los textos del 409 con 1')

console.log('\n11. Los campos del admin')
ok(enteroDelCampo('10.000') === 10000 && enteroDelCampo(' 25 ') === 25 && enteroDelCampo(8) === 8 && enteroDelCampo('') === null && enteroDelCampo(null) === null,
  "'10.000', ' 25 ', 8, '' y null")
ok(Number.isNaN(enteroDelCampo('1,5')) && Number.isNaN(enteroDelCampo('-3')) && Number.isNaN(enteroDelCampo('abc')) && Number.isNaN(enteroDelCampo(2.5)), "'1,5', '-3', 'abc' y 2.5: no")

console.log('\n12. Validar un plan (/admin/planes)')
const FILA = (clave) => PLANES.find((x) => x.clave === clave)
let v = validarPlanAdmin({ precio_mensual: '12.000', tope_productos: '30', fotos_por_producto: 8, carritos_abandonados: true, disponible: true }, FILA('basico'))
ok(v.ok && JSON.stringify(v.cambios) === JSON.stringify({ precio_mensual: 12000, tope_productos: 30, fotos_por_producto: 8, carritos_abandonados: true, disponible: true }),
  'el Básico con precio y tope nuevos')
v = validarPlanAdmin({ precio_mensual: 5000, tope_productos: 12, fotos_por_producto: 4, carritos_abandonados: false, disponible: false }, FILA('gratis'))
ok(v.ok && v.cambios.precio_mensual === 0 && v.cambios.disponible === true, 'el Gratis: siempre $0 y elegible, aunque manden otra cosa')
ok(!validarPlanAdmin({ precio_mensual: 1 }, FILA('pro')).ok, 'el Pro no se edita')
ok(!validarPlanAdmin({}, null).ok, 'un plan que no existe: no')
const BASE_OK = { precio_mensual: 10000, tope_productos: 25, fotos_por_producto: 8, carritos_abandonados: true, disponible: true }
for (const [campo, valor, que] of [['precio_mensual', '', 'precio vacío'], ['precio_mensual', '10,5', 'precio con centavos'], ['tope_productos', 0, 'tope 0'],
  ['tope_productos', 10001, 'tope 10.001'], ['fotos_por_producto', 21, '21 fotos'], ['fotos_por_producto', '', 'fotos vacías'],
  ['carritos_abandonados', 'si', 'carritos que no es sí/no'], ['disponible', undefined, 'sin «se puede elegir»']]) {
  v = validarPlanAdmin({ ...BASE_OK, [campo]: valor }, FILA('basico'))
  ok(!v.ok && typeof v.error === 'string', `${que}: no («${v.error}»)`)
}

console.log('\n13. Los avisos al cambiar un plan')
let a = avisosDePlan(FILA('basico'), { tope_productos: '20', fotos_por_producto: 8, carritos_abandonados: true })
ok(a.length === 1 && a[0] === 'Bajaste el tope de 25 a 20. Afecta solo lo que se cargue después: nada se pausa.', `bajar el tope: «${a[0]}»`)
a = avisosDePlan(FILA('basico'), { tope_productos: 25, fotos_por_producto: 6, carritos_abandonados: false })
ok(a.length === 2 && a[0].startsWith('Bajaste las fotos de 8 a 6.') && a[1].startsWith('Sacaste los carritos abandonados'), 'bajar las fotos y sacar los carritos: dos avisos')
ok(avisosDePlan(FILA('basico'), { tope_productos: 30, fotos_por_producto: 10, carritos_abandonados: true }).length === 0, 'subir: sin avisos')

console.log('\n14. Las condiciones especiales (la ficha)')
ok(JSON.stringify(planesAsignables(PLANES).map((x) => x.clave)) === '["gratis","basico"]', 'se pueden asignar el Gratis y el Básico (el Pro no tiene topes)')
let e = validarEspecial({ plan_clave: 'basico', tope_productos: '50', sin_tope: false, precio_especial: '20.000', motivo: '  Pidió más lugar.  ' }, PLANES)
ok(e.ok && JSON.stringify(e.datos) === JSON.stringify({ plan_clave: 'basico', tope_productos: 50, sin_tope: false, precio_especial: 20000, motivo: 'Pidió más lugar.' }),
  'un plan a medida: Básico, 50, $20.000')
e = validarEspecial({ plan_clave: 'basico', tope_productos: '50', sin_tope: true, precio_especial: 0, motivo: 'Tienda propia.' }, PLANES)
ok(e.ok && e.datos.tope_productos === null && e.datos.sin_tope && e.datos.precio_especial === 0, 'sin tope: el tope que vino se ignora')
e = validarEspecial({ plan_clave: 'basico', tope_productos: '', precio_especial: '', motivo: 'x' }, PLANES)
ok(e.ok && e.datos.tope_productos === null && e.datos.precio_especial === null, 'tope y precio vacíos: los del plan')
for (const [cuerpo, que] of [[{ plan_clave: 'pro', motivo: 'x' }, 'el Pro'], [{ plan_clave: 'basico', motivo: '   ' }, 'sin motivo'],
  [{ plan_clave: 'basico', motivo: 'x'.repeat(301) }, 'motivo de 301'], [{ plan_clave: 'basico', tope_productos: 0, motivo: 'x' }, 'tope 0'],
  [{ plan_clave: 'basico', precio_especial: '-1', motivo: 'x' }, 'precio negativo'], [{ plan_clave: 'otro', motivo: 'x' }, 'un plan que no existe']]) {
  e = validarEspecial(cuerpo, PLANES)
  ok(!e.ok && typeof e.error === 'string', `${que}: no («${e.error}»)`)
}

console.log('\n15. Los atajos (salen del Básico)')
let at = atajosEspecial(PLANES)
ok(JSON.stringify(at.map((x) => x.etiqueta)) === JSON.stringify(['Bloque de 50 · $20.000', 'Bloque de 75 · $30.000', 'Tienda propia']), `con el Básico de hoy: ${at.map((x) => x.etiqueta).join(' | ')}`)
ok(at[0].tope_productos === 50 && at[0].precio_especial === 20000 && !at[0].sin_tope && at[2].sin_tope && at[2].precio_especial === 0 && at[2].tope_productos === null,
  'los valores que llenan')
at = atajosEspecial(PLANES.map((x) => (x.clave === 'basico' ? { ...x, tope_productos: 30, precio_mensual: 12000 } : x)))
ok(at[0].etiqueta === 'Bloque de 60 · $24.000' && at[1].etiqueta === 'Bloque de 90 · $36.000', 'si cambia el Básico, cambian solos')
ok(atajosEspecial(PLANES.filter((x) => x.clave !== 'basico')).length === 0 && atajosEspecial(null).length === 0, 'sin el Básico: ninguno')

console.log(fallas === 0 ? '\nTODO OK' : `\n${fallas} FALLAS`)
process.exit(fallas ? 1 : 0)
