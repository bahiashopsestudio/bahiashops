// Prueba de los pasos por forma de entrega (src/lib/pedidos.js), los textos de
// Mis pedidos, el mail de «listo para retirar» y la migración 036 contra una
// base local (PGlite: Postgres real en WebAssembly). No toca Supabase ni
// ninguna base real.
//
//   npm run probar:036

import { register } from 'node:module'
import { readFileSync } from 'node:fs'

const raiz = new URL('../', import.meta.url)
// Node no conoce el alias '@/' de jsconfig.json: se resuelve a src/.
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

const P = await import('../src/lib/pedidos.js')
const { armarMailListo, armarMailDespacho } = await import('../src/lib/mailsPedidos.js')
const { ESTADOS_PARA_ENTREGAR } = await import('../src/lib/pausaTienda.js')
const { chipMetodo } = await import('../src/lib/metodosEntrega.js')
const { baseDeTiendas } = await import('./base-tiendas-prueba.mjs')

let fallas = 0
const ok = (c, m) => { if (!c) { fallas++; console.log('  ✗ FALLA:', m) } else console.log('  ✓', m) }
const leer = (ruta) => readFileSync(new URL(ruta, raiz), 'utf8').replace(/\r\n/g, '\n')

const METODO = { retiro: 'retiro', envio: 'envio_tienda', correo: 'correo', coordinar: 'coordinar' }
const ped = (forma, estado, extra = {}) => ({ id: 31, vendedor_id: 7, metodo_envio: METODO[forma], estado, ...extra })

console.log('1. Cada forma recorre su secuencia, de a un paso, y termina en entregado')
const esperadas = {
  retiro: 'pagado preparando listo entregado',
  envio: 'pagado preparando franja despachado entregado',
  correo: 'pagado preparando despachado entregado',
  coordinar: 'pagado preparando acordado entregado',
}
for (const [forma, texto] of Object.entries(esperadas)) {
  const recorrido = ['pagado']
  let paso = 'pagado'
  while ((paso = P.siguientePaso(ped(forma, paso)))) recorrido.push(paso)
  ok(recorrido.join(' ') === texto && P.SECUENCIAS[forma].join(' ') === texto, `${forma}: ${recorrido.join(' → ')}`)
}
ok(P.formaDeEntrega('acordar') === 'coordinar' && P.formaDeEntrega('flash_pedidos') === 'envio' && P.formaDeEntrega(null) === 'coordinar',
  'los nombres viejos y un valor desconocido caen en su forma (desconocido: coordinar)')
ok(!Object.values(P.SECUENCIAS).some((s) => s.includes('por_salir')), 'por_salir no está en ninguna secuencia')

console.log('\n2. Pedidos viejos')
ok(P.siguientePaso(ped('envio', 'por_salir')) === 'despachado', 'envío en por_salir → despachado')
ok(P.siguientePaso(ped('envio', 'despachado')) === 'entregado', '… y después → entregado')
ok(P.siguientePaso(ped('correo', 'por_salir')) === 'despachado', 'correo en por_salir → despachado')
ok(P.siguientePaso(ped('correo', 'franja')) === 'entregado', 'correo en franja (ya no la tiene) → entregado')
ok(P.siguientePaso(ped('retiro', 'despachado')) === 'entregado', 'retiro en despachado (los 7 de hoy) → entregado')
ok(P.siguientePaso(ped('retiro', 'por_salir')) === 'entregado', 'retiro en por_salir → entregado')
ok(P.siguientePaso(ped('coordinar', 'franja')) === 'entregado', 'coordinar en franja → entregado')
ok(P.pasosDe(ped('retiro', 'despachado')).join(' ') === 'pagado preparando franja por_salir despachado entregado',
  'la barra de un retiro viejo despachado: los pasos viejos y entregado')
ok(P.pasosDe(ped('envio', 'por_salir')).join(' ') === 'pagado preparando franja por_salir despachado entregado',
  'la barra de un envío en por_salir')
ok(P.pasosDe(ped('envio', 'pendiente')).length === 0 && P.pasosDe(ped('envio', 'reembolsado')).length === 0, 'pendiente y reembolsado: sin barra')
ok(P.NOMBRE_PASO.por_salir === 'Por salir', 'nombre visible: «Por salir»')

console.log('\n3. validarAvance (lo que usa el servidor)')
const va = (pedido, destino) => P.validarAvance({ pedido, vendedorId: 7, destino })
ok(va(ped('retiro', 'preparando'), 'listo').ok, 'retiro: preparando → listo')
ok(va(ped('coordinar', 'preparando'), 'acordado').ok, 'coordinar: preparando → acordado')
ok(va(ped('correo', 'preparando'), 'despachado').ok, 'correo: preparando → despachado (sin franja)')
ok(va(ped('envio', 'franja'), 'despachado').ok, 'envío: franja → despachado')
ok(va(ped('retiro', 'listo'), 'entregado').ok, 'retiro: listo → entregado')
ok(va(ped('retiro', 'preparando'), 'franja').motivo === 'transicion_invalida', 'retiro no tiene franja')
ok(va(ped('correo', 'preparando'), 'franja').motivo === 'transicion_invalida', 'correo ya no tiene franja')
ok(va(ped('envio', 'pagado'), 'entregado').motivo === 'transicion_invalida', 'no se saltean pasos')
ok(va(ped('envio', 'despachado'), 'franja').motivo === 'transicion_invalida', 'no se vuelve atrás')
ok(va(ped('envio', 'preparando'), 'pagado').motivo === 'estado_de_pago', 'un estado de pago: 403')
ok(va(ped('envio', 'despachado'), 'reembolsado').motivo === 'estado_de_pago', 'reembolsado lo escribe el cobro')
ok(va({ ...ped('retiro', 'listo'), vendedor_id: 8 }, 'entregado').motivo === 'ajeno', 'un pedido ajeno: 404')
ok(va(ped('retiro', 'entregado'), 'entregado').motivo === 'sin_avance', 'entregado es el final')
ok(va(ped('retiro', 'reembolsado'), 'entregado').motivo === 'reembolsado', 'reembolsado no avanza')
ok(va(ped('retiro', 'pendiente'), 'preparando').motivo === 'sin_avance', 'un pendiente no avanza')
ok(va(ped('retiro', 'inventado'), 'entregado').motivo === 'sin_avance', 'un estado desconocido: falla cerrado')
ok(va(ped('envio', 'preparando'), null).motivo === 'sin_destino', 'sin destino: 400')

console.log('\n4. Listas de estados')
for (const e of ['listo', 'acordado', 'entregado']) ok(P.ESTADOS_CON_PAGO.includes(e), `ESTADOS_CON_PAGO tiene ${e}`)
ok(P.esVentaVisible({ estado: 'entregado' }), 'un entregado se ve en Mis pedidos')
ok(P.pedidoParaLaTienda({ estado: 'entregado', comprador_nombre: 'Ana' }).comprador_nombre === 'Ana', 'la tienda ve los datos de un entregado')
ok(!P.ESTADOS_PARA_RECLAMAR.includes('reembolsado') && P.ESTADOS_PARA_RECLAMAR.includes('entregado') && P.ESTADOS_PARA_RECLAMAR.includes('pagado'),
  'Reclamar: de pagado a entregado, no reembolsado')
ok(!P.ESTADOS_PARA_RECLAMAR.includes('pendiente') && !P.ESTADOS_PARA_RECLAMAR.includes('cancelado'), 'Reclamar: ni pendiente ni cancelado')
ok(JSON.stringify(ESTADOS_PARA_ENTREGAR) === JSON.stringify(['pagado', 'preparando', 'franja', 'por_salir', 'listo', 'acordado']),
  'pausar la tienda: listo y acordado cuentan; despachado no')
const ahora = Date.parse('2026-10-16T15:00:00Z')
for (const e of ['pagado', 'preparando', 'franja', 'por_salir', 'despachado', 'listo', 'acordado']) {
  ok(P.pestanaDePedido({ estado: e }, ahora) === 'nuevos', `pestaña: ${e} → Nuevos pedidos`)
}
ok(P.pestanaDePedido({ estado: 'entregado' }, ahora) === 'entregados', 'pestaña: entregado → Entregados')
ok(P.pestanaDePedido({ estado: 'reembolsado' }, ahora) === 'entregados', 'pestaña: reembolsado → Entregados (aparte)')
ok(P.pestanaDePedido({ estado: 'pendiente', mp_payment_id: '1', efectivo_vence_en: new Date(ahora + 3600e3).toISOString() }, ahora) === 'nuevos',
  'pago en efectivo pendiente vigente → Nuevos pedidos')

// El CHECK de la 036 y los estados del código tienen que ser los mismos.
const M036 = leer('sql/migrations/036_pasos_de_entrega.sql')
const delCheck = M036.match(/add constraint pedidos_estado_valido\s+check \(estado in \(([\s\S]*?)\)\)/)?.[1]
const enElCheck = new Set([...(delCheck || '').matchAll(/'(\w+)'/g)].map((m) => m[1]))
const delCodigo = new Set([...P.ESTADOS_DE_PAGO, P.ESTADO_REEMBOLSADO, ...Object.values(P.SECUENCIAS).flat(), 'por_salir'])
ok(enElCheck.size === 12 && [...delCodigo].every((e) => enElCheck.has(e)) && [...enElCheck].every((e) => delCodigo.has(e)),
  `el CHECK de la 036 tiene exactamente los estados del código (${[...enElCheck].join(', ')})`)

console.log('\n5. Línea de estado de Mis pedidos (textos exactos)')
const linea = (forma, estado, extra) => P.lineaDeEstado(ped(forma, estado, extra))?.texto
const textos = [
  ['retiro', 'pagado', 'La tienda ya tiene tu pedido.'], ['retiro', 'preparando', 'Lo están preparando.'],
  ['retiro', 'listo', 'Ya podés pasar a buscarlo.'], ['retiro', 'entregado', 'Lo retiraste.'],
  ['envio', 'pagado', 'La tienda ya tiene tu pedido.'], ['envio', 'preparando', 'Lo están preparando.'],
  ['envio', 'despachado', 'Va en camino.'], ['envio', 'entregado', 'Entregado.'],
  ['correo', 'preparando', 'Lo están preparando.'], ['correo', 'despachado', 'Lo despacharon por correo.'], ['correo', 'entregado', 'Entregado.'],
  ['coordinar', 'pagado', 'La tienda ya tiene tu pedido.'],
  ['coordinar', 'preparando', 'Lo están preparando. Te van a escribir para acordar la entrega.'],
  ['coordinar', 'acordado', 'Ya acordaron la entrega.'], ['coordinar', 'entregado', 'Entregado.'],
  ['envio', 'por_salir', 'Sale en un rato.'],
]
for (const [forma, estado, texto] of textos) ok(linea(forma, estado) === texto, `${forma} · ${estado}: «${texto}»`)
ok(linea('envio', 'franja', { franja_horaria: 'Mañana' }) === 'Llega a la mañana.', 'envío · franja Mañana: «Llega a la mañana.»')
ok(linea('envio', 'franja', { franja_horaria: 'Tarde' }) === 'Llega a la tarde.', 'envío · franja Tarde: «Llega a la tarde.»')
ok(linea('envio', 'franja', { franja_horaria: 'Noche' }) === 'Llega a la noche.', 'envío · franja Noche: «Llega a la noche.»')
ok(P.lineaDeEstado(ped('retiro', 'entregado')).tono === 'entregado' && P.lineaDeEstado(ped('retiro', 'listo')).tono === 'curso', 'verde entregado, azul en curso')
ok(P.lineaDeEstado(ped('retiro', 'reembolsado')).tono === 'cancelado', 'reembolsado: rojo')
ok(P.lineaDeEstado(ped('retiro', 'pendiente')) === null, 'pendiente: sin línea (tiene sus textos del cupón)')

console.log('\n6. «Compraste…» (en hora de Argentina)')
const hoy = Date.parse('2026-10-16T12:00:00-03:00')
ok(P.textoCompraste('2026-10-16T00:30:00-03:00', hoy) === 'Compraste hoy', 'hoy')
ok(P.textoCompraste('2026-10-15T23:50:00-03:00', hoy) === 'Compraste ayer', 'ayer (23:50 de ayer)')
ok(P.textoCompraste('2026-10-11T10:00:00-03:00', hoy) === 'Compraste hace 5 días', 'hace 5 días')
ok(P.textoCompraste('2026-10-16T02:30:00Z', hoy) === 'Compraste ayer', 'las 23:30 en Argentina son ayer aunque en UTC sea hoy')
ok(P.textoCompraste('basura', hoy) === null, 'fecha ilegible: null')

console.log('\n7. El mensaje de «Reclamar»')
const it = (nombre) => ({ nombre })
ok(P.mensajeReclamo({ id: 31, items: [it('Taza esmaltada'), it('Plato playo'), it('Mate'), it('Bombilla')] }) ===
  'Hola, te escribo por mi pedido #31 en Bahía Shops (Taza esmaltada, Plato playo y 2 más).', 'cuatro productos: «… y 2 más»')
ok(P.resumenProductos([it('Taza')]) === 'Taza' && P.resumenProductos([it('Taza'), it('Plato')]) === 'Taza y Plato', 'uno y dos productos')
ok(P.mensajeReclamo({ id: 9, items: [] }) === 'Hola, te escribo por mi pedido #9 en Bahía Shops.', 'sin productos: sin paréntesis')

console.log('\n8. Chips de forma de entrega')
const chips = { retiro: ['Retiro', '#fdeee3', '#9a4a17'], envio_tienda: ['Envío local', '#e8eeff', '#2f4fd6'],
  correo: ['Correo', '#f3ebfa', '#6d3f99'], coordinar: ['Coordinar', '#e9f3ee', '#2e6b4f'] }
for (const [m, [texto, fondo, color]] of Object.entries(chips)) {
  const c = chipMetodo(m)
  ok(c?.texto === texto && c.fondo === fondo && c.color === color, `${m}: ${texto} ${fondo} ${color}`)
}

console.log('\n9. Mail «listo para retirar»')
const datos = {
  pedidoId: 31, tienda: '<b>Lo de "Pepa" & Co</b>', nombre: 'Ana <i>', telefono: '2915123456',
  items: [{ nombre: 'Mate <XL>', variante: null, cantidad: 1, precio: 14500 }], costoEnvio: 0, total: 14500,
}
const listo = armarMailListo(datos)
ok(listo.asunto === 'Tu pedido en <b>Lo de "Pepa" & Co</b> está listo para retirar', 'asunto')
ok(!/<b>Lo de|<i>|<XL>/.test(listo.html) && listo.html.includes('&lt;b&gt;Lo de'), 'todo lo que viene de la base, escapado')
ok(listo.html.includes('https://bahiashops.com.ar/mail/titulo-listo.png') && listo.html.includes('alt="¡Tu pedido está listo!"'), 'título en imagen con su alt')
ok(/PEDIDO #31/.test(listo.texto) && listo.html.includes('Pedido #31'), 'línea azul PEDIDO #31')
ok(listo.texto.includes('LO QUE COMPRASTE') && listo.texto.includes('QUÉ PASA AHORA'), 'las dos tarjetas')
ok(listo.texto.includes('te va a escribir por WhatsApp al +54 9 291 512-3456 para coordinar cuándo pasás a buscarlo.'), 'qué pasa ahora, con el teléfono')
ok(listo.texto.includes('ya tiene listo tu pedido.') && listo.texto.startsWith('PEDIDO #31'), 'párrafo')
ok(listo.texto.includes('Ver mis pedidos: https://bahiashops.com.ar/mis-pedidos'), 'botón Ver mis pedidos')
ok(listo.texto.includes('Si tenés algún problema con tu compra, respondé este mail.'), 'el pie del mail de compra')
ok(!armarMailListo({ ...datos, telefono: null }).texto.includes(' al '), 'sin teléfono: sin «al …»')
const despacho = armarMailDespacho({ pedido: { id: 5, metodo_envio: 'envio_tienda', subtotal_productos: 1, costo_envio: 0, total: 1 }, nombreVendedor: 'X', direccion: '', franja: 'Tarde' })
ok(despacho.html.includes('/mail/titulo-despacho.png') && despacho.html.includes('alt="¡Tu pedido va en camino!"') && despacho.texto.startsWith('PEDIDO #5'),
  'despacho en el formato nuevo')

console.log('\n10. El panel: textos de WhatsApp')
const panel = leer('src/app/vendedor/pedidos/page.jsx')
for (const t of ['¡Te avisamos cuando esté listo para retirar!', '¡Te avisamos cuando lo despachemos por correo!',
  '¡Te avisamos en qué franja llega!', 'Te escribimos para acordar la entrega.']) ok(panel.includes(t), `«${t}»`)
// El mensaje de "listo", tal cual está en el panel, armado con datos de prueba.
const plantillaListo = panel.match(/listo: \{[\s\S]*?mensajeWA: \(p, franja, nombre\) =>\n\s*(`[^`]*` \+\n\s*`[^`]*`),/)?.[1]
const mensajeListo = plantillaListo
  ? new Function('p', 'nombre', `return ${plantillaListo}`)({ id: 31 }, 'Ludoméstica')
  : ''
ok(mensajeListo === '¡Hola! Te escribimos de Ludoméstica. También te llegó un mail de Bahía Shops con el detalle de tu pedido.\n' +
  'Tu pedido #31 ya está listo para retirar. ¿Cuándo te queda cómodo pasar?', 'mensaje de listo: dos renglones, textos exactos')
ok(!/ {2}|\n | \n/.test(mensajeListo), 'mensaje de listo: sin doble espacio ni espacios junto al salto')
const { linkWhatsApp } = await import('../src/lib/telefono.js')
const linkListo = linkWhatsApp('2915123456', mensajeListo)
ok(linkListo.includes('pedido.%0ATu%20pedido%20%2331') && !linkListo.includes('%20%20') && !linkListo.includes('%20%0A') && !linkListo.includes('%0A%20'),
  'el salto llega al link como %0A, sin espacios de más')
ok(!/comprador_nombre/.test(panel.match(/function apodoDe[\s\S]*?\n\}/)?.[0] || 'comprador_nombre') && !panel.includes('nombreParaConfirmar'),
  'la confirmación usa el apodo, no el nombre real')
ok(panel.includes('¿{apodoDe(p, { alEmpezar: true })} ya lo tiene?') &&
  panel.includes('✓ Entregado · {apodoDe(p, { alEmpezar: true })} ya puede dejarte una reseña') &&
  panel.includes('pasa a «Entregados» y {apodoDe(p)} puede dejarte una reseña.'),
  'confirmación y «✓ Entregado»: mismo criterio (Quien compró al empezar, quien compró en medio)')
const apodoDe = new Function(`return ${panel.match(/function apodoDe[\s\S]*?\n\}/)[0]}`)()
ok(apodoDe({ comprador_apodo: 'Nutria Curiosa' }, { alEmpezar: true }) === 'Nutria Curiosa' &&
  apodoDe({ comprador_apodo: 'Nutria Curiosa', comprador_eliminado: true }, { alEmpezar: true }) === 'Quien compró' &&
  apodoDe({ comprador_apodo: null }) === 'quien compró', 'apodo; sin apodo o cuenta eliminada: Quien compró / quien compró')
ok(panel.includes('Tu pedido #${p.id} ya está listo para retirar. ¿Cuándo te queda cómodo pasar?') &&
  /listo: \{[\s\S]*?ayuda: \(\) => 'Le llega el mail y se abre WhatsApp',\n\s*whatsapp: true,/.test(panel),
  'avisar que está listo: mail y WhatsApp, con su texto gris')
const misPedidos = leer('src/app/mis-pedidos/page.jsx')
ok(/pedido\.estado === ESTADO_ENTREGADO && fechaDia\(pedido\.entregado_at\) &&/.test(misPedidos) && misPedidos.includes('Entregado el {fechaDia(pedido.entregado_at)}'),
  'Mis pedidos: «Entregado el …» solo con entregado_at')
ok(!/por_salir:\s*\{/.test(panel) && !panel.includes('Avisar que sale'), 'no queda el paso «Avisar que sale» (por_salir)')
ok(!panel.includes('TRANSICIONES') && !panel.includes('grupoEntrega'), 'el panel no tiene su propia máquina de estados')

console.log('\n11. La migración 036 en una base local')
const { db, q } = await baseDeTiendas()
await db.exec(M036.split(/\n-- =+\n-- Verificación/)[0])
await db.exec(M036.split(/\n-- =+\n-- Verificación/)[0])
console.log('  (corrida dos veces sin errores)')
const cols = await q(`select column_name, data_type from information_schema.columns where table_name = 'pedidos' and column_name in ('entregado_at', 'aviso_listo_en') order by 1`)
ok(cols.length === 2 && cols.every((c) => c.data_type === 'timestamp with time zone'), 'entregado_at y aviso_listo_en, timestamptz')
await db.exec(`insert into auth.users (id, email) values ('00000000-0000-0000-0000-000000000001', 'ana@mail.com'), ('00000000-0000-0000-0000-000000000002', 'tienda@mail.com')`)
await db.exec(`insert into public.usuarios (id, email, nombre, apellido) values ('00000000-0000-0000-0000-000000000001', 'ana@mail.com', 'Ana', 'Pérez'), ('00000000-0000-0000-0000-000000000002', 'tienda@mail.com', 'Rosa', 'Gómez')`)
const tienda = (await q(`insert into public.vendedores (usuario_id, nombre_negocio, slug) values ('00000000-0000-0000-0000-000000000002', 'T', 't') returning id`))[0].id
const comprar = async (estado) => (await q(`insert into public.pedidos (comprador_id, vendedor_id, estado) values ('00000000-0000-0000-0000-000000000001', $1, $2) returning id`, [tienda, estado]))[0].id
let rechazo = null
try { await comprar('inventado') } catch (e) { rechazo = e.message }
ok(/pedidos_estado_valido/.test(rechazo || ''), 'el CHECK rechaza un estado inventado')
const id = await comprar('entregado')
const evaluar = async (u) => (await q(`select public.rpc_evaluar_eliminar_cuenta($1) as r`, [u]))[0].r
ok(!(await evaluar('00000000-0000-0000-0000-000000000001')).motivos.includes('PEDIDO_ACTIVO'), 'un entregado no impide eliminar la cuenta')
for (const estado of ['listo', 'acordado']) {
  await db.query(`update public.pedidos set estado = $2 where id = $1`, [id, estado])
  ok((await evaluar('00000000-0000-0000-0000-000000000001')).motivos.includes('PEDIDO_ACTIVO'), `${estado}: cuenta como en curso`)
}
await db.query(`update public.pedidos set estado = 'despachado' where id = $1`, [id])
ok(!(await evaluar('00000000-0000-0000-0000-000000000001')).motivos.includes('PEDIDO_ACTIVO'), 'despachado sigue contando como terminado')
// La tienda pausada con una venta: listo es venta en curso, entregado no.
await db.query(`update public.vendedores set pausada_en = now() where id = $1`, [tienda])
await db.query(`update public.pedidos set estado = 'listo' where id = $1`, [id])
ok((await evaluar('00000000-0000-0000-0000-000000000002')).motivos.includes('VENTA_EN_CURSO'), 'tienda pausada con un listo: VENTA_EN_CURSO')
await db.query(`update public.pedidos set estado = 'entregado' where id = $1`, [id])
ok(!(await evaluar('00000000-0000-0000-0000-000000000002')).motivos.includes('VENTA_EN_CURSO'), 'tienda pausada con un entregado: no')
const afuera = await q(M036.match(/select estado, count\(\*\)[\s\S]*?group by estado/)[0])
ok(afuera.length === 0, 'la consulta del final (pedidos afuera del CHECK) da cero filas')

console.log(fallas === 0 ? '\nTODO OK' : `\n${fallas} FALLAS`)
process.exit(fallas ? 1 : 0)
