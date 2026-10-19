// Prueba de las reseñas (tanda A): la regla de cuándo se puede reseñar
// (src/lib/resenas.js), la validación y el filtro de moderación, los textos
// del puntaje, el límite del apodo, el mail de «¿Cómo te fue?» y la migración
// 037 contra una base local (PGlite: Postgres real en WebAssembly). No toca
// Supabase ni ninguna base real.
//
//   npm run probar:037

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

const R = await import('../src/lib/resenas.js')
const { cambioDeApodo } = await import('../src/lib/apodos.js')
const { fechaCorta, fechaLarga } = await import('../src/lib/fechas.js')
const { armarMailResena } = await import('../src/lib/mailsPedidos.js')
const { PGlite } = await import('@electric-sql/pglite')

let fallas = 0
const ok = (c, m) => { if (!c) { fallas++; console.log('  ✗ FALLA:', m) } else console.log('  ✓', m) }
const leer = (ruta) => readFileSync(new URL(ruta, raiz), 'utf8').replace(/\r\n/g, '\n')

const DIA = 24 * 60 * 60 * 1000
const T0 = Date.parse('2026-10-01T12:00:00Z')
const ped = (estado, extra = {}) => ({ id: 31, estado, pagado_en: new Date(T0).toISOString(), entregado_at: null, ...extra })
const en = (dias) => T0 + dias * DIA

console.log('1. Cuándo se puede reseñar')
ok(R.estadoDeResena({ pedido: ped('preparando'), ahoraMs: en(5) }).estado === 'todavia_no', 'pagado hace 5 días, sin entregar: todavía no')
let e = R.estadoDeResena({ pedido: ped('preparando'), ahoraMs: en(14) })
ok(e.estado === 'puede' && e.via === '14_dias' && e.diasRestantes === 30, 'a los 14 días del pago se habilita (vía 14 días, 30 días)')
ok(R.estadoDeResena({ pedido: ped('despachado'), ahoraMs: en(43.5) }).diasRestantes === 1, 'el último día: queda 1')
ok(R.estadoDeResena({ pedido: ped('despachado'), ahoraMs: en(44.01) }).estado === 'vencida', 'sin entregar, después del día 44: vencida')
e = R.estadoDeResena({ pedido: ped('entregado', { entregado_at: new Date(en(3)).toISOString() }), ahoraMs: en(4) })
ok(e.estado === 'puede' && e.via === 'entregado', 'entregado el día 3: se puede ya, vía entregado')
// Siempre la ventana que termine más tarde: entregado el día 3 cierra el 33,
// pero la de los 14 días va hasta el 44.
ok(R.estadoDeResena({ pedido: ped('entregado', { entregado_at: new Date(en(3)).toISOString() }), ahoraMs: en(40) }).estado === 'puede',
  'entregado rápido (día 3): igual tiene hasta el día 44')
ok(R.estadoDeResena({ pedido: ped('entregado', { entregado_at: new Date(en(3)).toISOString() }), ahoraMs: en(44.5) }).estado === 'vencida',
  'y después del 44, vencida')
// Marcado muy tarde: 30 días desde entregado_at, aunque la de 14 ya cerró.
e = R.estadoDeResena({ pedido: ped('entregado', { entregado_at: new Date(en(60)).toISOString() }), ahoraMs: en(61) })
ok(e.estado === 'puede' && e.diasRestantes === 29, 'entregado el día 60: se puede hasta el 90')
ok(R.estadoDeResena({ pedido: ped('entregado', { entregado_at: new Date(en(20)).toISOString() }), ahoraMs: en(49) }).estado === 'puede',
  'habilitada por los 14 días y entregada el 20: vale hasta el 50')
for (const estado of ['pendiente', 'rechazado', 'cancelado', 'reembolsado']) {
  ok(R.estadoDeResena({ pedido: ped(estado), ahoraMs: en(20) }).estado === 'no_corresponde', `${estado}: no corresponde`)
}
ok(R.estadoDeResena({ pedido: ped('reembolsado'), resena: { id: 1 }, ahoraMs: en(20) }).estado === 'hecha', 'reembolsado DESPUÉS de reseñar: la reseña queda')
ok(R.estadoDeResena({ pedido: ped('pagado', { pagado_en: null }), ahoraMs: en(20) }).estado === 'todavia_no', 'sin fechas: todavía no (falla cerrado)')
ok(R.textoDiasRestantes(1) === 'Te queda 1 día para dejarla.' && R.textoDiasRestantes(12) === 'Te quedan 12 días para dejarla.', 'singular y plural de los días')

console.log('2. Lo que se publica')
ok(R.validarResena({ pedido_id: 5, estrellas: 0 }).ok === false, '0 estrellas: no')
ok(R.validarResena({ pedido_id: 5, estrellas: 6 }).ok === false, '6 estrellas: no')
ok(R.validarResena({ pedido_id: 5, estrellas: 4.5 }).ok === false, '4,5 estrellas: no')
let v = R.validarResena({ pedido_id: '5', estrellas: 4, texto: '   ' })
ok(v.ok && v.texto === null && v.pedidoId === 5, 'solo espacios: sin texto')
v = R.validarResena({ pedido_id: 5, estrellas: 5, texto: '  Muy bien  \n' })
ok(v.ok && v.texto === 'Muy bien', 'el texto se guarda sin espacios sueltos')
ok(R.validarResena({ pedido_id: 5, estrellas: 5, texto: 'a'.repeat(500) }).ok, '500 caracteres: sí')
ok(!R.validarResena({ pedido_id: 5, estrellas: 5, texto: 'a'.repeat(501) }).ok, '501: no')
ok(R.largoTexto('🙂🙂') === 2, 'un emoji cuenta uno (como char_length)')
ok(R.validarResena({ pedido_id: 5, estrellas: 5, texto: { a: 1 } }).ok === false, 'un texto que no es texto: no')

console.log('3. El filtro, para reseñas')
const m = (t) => R.moderarTextoResena(t)
ok(m('Todo perfecto, muy buena atención').nivel === 'limpio', 'una reseña normal pasa limpia')
ok(m('escribime a ana@gmail.com').nivel === 'bloqueo', 'un mail bloquea')
ok(m('mi cel 291 512 3456').nivel === 'bloqueo', 'un teléfono bloquea')
ok(m('seguinos en @tiendita').nivel === 'bloqueo', 'un usuario de red bloquea')
ok(m('www.otra-tienda.com').nivel === 'bloqueo', 'un link bloquea')
ok(m('Me respondieron rapidísimo por WhatsApp').nivel === 'aviso', 'contar que te escribieron por WhatsApp no bloquea: queda para revisar')
ok(m('El precio era a consultar y estuvo bien').nivel === 'limpio', 'precio "a consultar" no cuenta')
ok(m('Le encantó a mi perro').nivel === 'limpio', 'mencionar una mascota no cuenta')
ok(m('').nivel === 'limpio' && m(null).nivel === 'limpio', 'sin texto: limpio')

console.log('4. El puntaje')
ok(R.textoPuntajeTarjeta(null) === 'Tienda nueva', 'sin fila: Tienda nueva')
ok(R.textoPuntajeTarjeta({ cantidad: 4, promedio: null }) === 'Tienda nueva', 'con 4: Tienda nueva')
ok(R.textoPuntajeTarjeta({ cantidad: 32, promedio: '4.6' }) === '4,6 ★ (32)', 'con 32: 4,6 ★ (32)')
ok(R.textoPuntajeTarjeta([{ cantidad: 5, promedio: 5 }]) === '5,0 ★ (5)', 'lista de una fila y promedio entero')
ok(R.textoPuntajeCorto({ cantidad: 32, promedio: 4.6 }) === '4,6 ★', 'ficha: 4,6 ★')
ok(R.puntajeDe({ cantidad: 3, promedio: 4.2 }).promedio === null, 'aunque llegue un promedio con menos de 5, no se muestra')
ok(R.textoCantidadResenas(1) === '1 reseña' && R.textoCantidadResenas(3) === '3 reseñas', '1 reseña / 3 reseñas')

console.log('5. Fechas y apodo')
ok(fechaCorta('2026-10-15T15:00:00Z') === '15 de oct', '"15 de oct"')
ok(fechaCorta('2026-10-16T02:00:00Z') === '15 de oct', 'en hora de Argentina (las 23 del 15)')
ok(fechaLarga('2026-09-03T12:00:00Z') === '3 de septiembre', '"3 de septiembre"')
ok(cambioDeApodo(null).puede, 'nunca lo cambió: puede')
const l = cambioDeApodo('2026-10-01T12:00:00Z', Date.parse('2026-10-20T12:00:00Z'))
ok(!l.puede && fechaLarga(l.desde) === '31 de octubre', 'lo cambió el 1/10: desde el 31 de octubre')
ok(cambioDeApodo('2026-10-01T12:00:00Z', Date.parse('2026-10-31T12:00:00Z')).puede, 'a los 30 días, puede')

console.log('6. El mail de «¿Cómo te fue?»')
const mail = armarMailResena({
  pedidoId: 1047, tienda: 'Cerámica del Puerto', nombre: 'Lucía',
  items: [{ nombre: 'Taza', variante: 'Azul', cantidad: 2, precio: 6500 }], costoEnvio: 0, total: 13000,
})
ok(mail.asunto === '¿Cómo te fue comprando en Cerámica del Puerto?', 'asunto')
ok(mail.html.includes('/mail/titulo-resena.png') && mail.html.includes('alt="¿Cómo te fue?"'), 'título en imagen, con su alt')
ok(mail.html.includes('/mis-pedidos?resena=1047') && mail.texto.includes('/mis-pedidos?resena=1047'), 'el botón lleva al formulario del pedido')
ok(mail.texto.includes('Hola Lucía: tu pedido en Cerámica del Puerto figura como entregado.'), 'el saludo')
ok(mail.texto.includes('LO QUE COMPRASTE'), 'la tarjeta de lo comprado')
ok(!mail.texto.includes('¿No te llegó el pedido?'), 'sin "¿No te llegó el pedido?" (lo cubre el pie)')
ok(mail.texto.includes('Si tenés algún problema con tu compra, respondé este mail.'), 'el pie de los mails de compra')
const escapado = armarMailResena({ pedidoId: 9, tienda: '<b>Pepa</b>', nombre: null, items: [], costoEnvio: 0, total: 0 })
ok(!escapado.html.includes('<b>Pepa</b>') && escapado.texto.startsWith('PEDIDO #9') && escapado.texto.includes('Tu pedido en <b>Pepa</b>'),
  'sin nombre y con HTML en la tienda: escapado')
ok(readFileSync(new URL('public/mail/titulo-resena.png', raiz)).subarray(1, 4).toString() === 'PNG', 'la imagen del título existe')

console.log('7. La migración 037 en una base local')
const M037 = leer('sql/migrations/037_resenas.sql')
const db = new PGlite()
async function falla(sql, codigo, msj) {
  try { await db.exec(sql); ok(false, `${msj} (no falló)`) }
  catch (err) { ok(!codigo || err.code === codigo, `${msj} (${err.code})`) }
}
const q = async (sql) => (await db.query(sql)).rows
await db.exec(`
  create role anon; create role authenticated; create role service_role bypassrls;
  create table public.usuarios (id uuid primary key, nombre_usuario text, cerrada_en timestamptz, bienvenida_vista_en timestamptz);
  create table public.vendedores (id integer generated by default as identity primary key, usuario_id uuid references public.usuarios);
  create table public.pedidos (id bigint generated by default as identity primary key,
    comprador_id uuid not null references public.usuarios, vendedor_id bigint not null references public.vendedores,
    estado text not null default 'pendiente', creado_en timestamptz not null default now(),
    aviso_comprador_en timestamptz, actualizado_en timestamptz);
  alter table public.usuarios enable row level security;
  alter table public.pedidos enable row level security;
  alter table public.vendedores enable row level security;
  grant select on public.usuarios to anon, authenticated;
  grant select (nombre_usuario) on public.usuarios to anon;
  grant select on public.pedidos to authenticated;
  insert into public.usuarios (id, nombre_usuario) values
    ('00000000-0000-0000-0000-00000000000a', 'Nutria Curiosa'),
    ('00000000-0000-0000-0000-00000000000b', 'Zorro Sabio'),
    ('00000000-0000-0000-0000-00000000000c', 'Dueña');
  insert into public.vendedores (id, usuario_id) values (7, '00000000-0000-0000-0000-00000000000c'), (8, '00000000-0000-0000-0000-00000000000c');
  insert into public.pedidos (id, comprador_id, vendedor_id, estado, creado_en, aviso_comprador_en) values
    (1, '00000000-0000-0000-0000-00000000000a', 7, 'entregado', '2026-09-21', '2026-09-30'),
    (2, '00000000-0000-0000-0000-00000000000a', 7, 'cancelado', '2026-09-22', null),
    (3, '00000000-0000-0000-0000-00000000000a', 7, 'pagado', '2026-10-16', null),
    (4, '00000000-0000-0000-0000-00000000000a', 7, 'pendiente', '2026-10-17', null);
`)
const verif = JSON.parse((await db.exec(M037)).at(-1).rows[0].verificacion)
await db.exec(M037)
ok(true, 'corre, y corre dos veces')
ok(Object.keys(verif.rls).length === 5 && Object.values(verif.rls).every(Boolean), 'RLS activa en las cinco tablas')
ok(verif.tipos['resenas.vendedor_id'] === 'integer' && verif.tipos['puntajes_tiendas.vendedor_id'] === 'integer' && verif.tipos['resenas.pedido_id'] === 'bigint',
  'tipos: integer hacia vendedores, bigint hacia pedidos')
ok(verif.permisos_resenas.anon === '' && verif.permisos_resenas.authenticated === '', 'resenas sin permisos para el navegador')
ok(verif.permisos_puntajes.anon === 'SELECT' && verif.permisos_puntajes.authenticated === 'SELECT', 'puntajes: solo SELECT')
ok(Object.values(verif.disparadores).every(Boolean), 'los cinco disparadores')
ok(verif.pagados_sin_pagado_en === 0 && verif.no_pagados_con_pagado_en === 0, 'pagado_en de los pedidos viejos')
ok(verif.usuarios_anon_select === false && verif.usuarios_anon_alguna_columna === false && verif.usuarios_authenticated_select === true,
  'anon sin usuarios (ni la columna suelta); authenticated igual')

let p = await q(`select id, pagado_en from pedidos order by id`)
ok(new Date(p[0].pagado_en).toISOString().startsWith('2026-09-30'), 'viejo con aviso: aviso_comprador_en')
ok(new Date(p[2].pagado_en).toISOString().startsWith('2026-10-16'), 'viejo sin aviso: creado_en')
await db.exec(`update pedidos set estado = 'pagado' where id = 4`)
ok((await q(`select pagado_en from pedidos where id = 4`))[0].pagado_en !== null, 'pendiente -> pagado: el disparador lo completa')
const antes = (await q(`select pagado_en from pedidos where id = 3`))[0].pagado_en
await db.exec(`update pedidos set estado = 'preparando' where id = 3`)
ok(+(await q(`select pagado_en from pedidos where id = 3`))[0].pagado_en === +antes, 'otro paso no lo pisa')

await db.exec(`insert into resenas (pedido_id, comprador_id, estrellas, texto) values (1, '00000000-0000-0000-0000-00000000000a', 4, 'Muy bien')`)
ok(Number((await q(`select vendedor_id from resenas`))[0].vendedor_id) === 7, 'la tienda sale del pedido')
await falla(`insert into resenas (pedido_id, estrellas) values (1, 5)`, '23505', 'dos reseñas del mismo pedido: una sola')
await falla(`insert into resenas (pedido_id, comprador_id, estrellas) values (3, '00000000-0000-0000-0000-00000000000b', 5)`, '22023', 'otra persona no reseña tu pedido')
await falla(`insert into resenas (pedido_id, estrellas, texto) values (3, 5, ' hola')`, '23514', 'texto con espacio suelto')
await falla(`update resenas set texto = 'otro'`, '22023', 'no se edita')
await falla(`update resenas set estado = 'oculta_por_moderacion'`, '23514', 'oculta sin motivo: no')
ok((await q(`select promedio from puntajes_tiendas where vendedor_id = 7`))[0].promedio === null, 'una reseña: sin promedio')
await db.exec(`
  insert into pedidos (id, comprador_id, vendedor_id, estado) values
    (10, '00000000-0000-0000-0000-00000000000b', 7, 'entregado'), (11, '00000000-0000-0000-0000-00000000000b', 7, 'entregado'),
    (12, '00000000-0000-0000-0000-00000000000b', 7, 'entregado'), (13, '00000000-0000-0000-0000-00000000000b', 7, 'entregado');
  insert into resenas (pedido_id, estrellas) values (10, 5), (11, 5), (12, 4), (13, 5);
`)
let pt = (await q(`select cantidad, promedio::text from puntajes_tiendas where vendedor_id = 7`))[0]
ok(pt.cantidad === 5 && pt.promedio === '4.6', `cinco reseñas: promedio ${pt.promedio}`)
await db.exec(`update resenas set estado = 'oculta_por_moderacion', oculta_motivo = 'insultos', oculta_en = now() where pedido_id = 13`)
pt = (await q(`select cantidad, promedio from puntajes_tiendas where vendedor_id = 7`))[0]
ok(pt.cantidad === 4 && pt.promedio === null, 'ocultar resta y vuelve a "Tienda nueva"')
await db.exec(`update resenas set estado = 'publicada', oculta_motivo = null, oculta_en = null where pedido_id = 13`)
ok((await q(`select cantidad from puntajes_tiendas where vendedor_id = 7`))[0].cantidad === 5, 'volver a mostrar suma')

await db.exec(`update usuarios set cerrada_en = now(), nombre_usuario = null where id = '00000000-0000-0000-0000-00000000000a'`)
ok((await q(`select comprador_id from resenas where pedido_id = 1`))[0].comprador_id === null, 'cuenta eliminada: la reseña queda sin dueño')
ok((await q(`select cantidad from puntajes_tiendas where vendedor_id = 7`))[0].cantidad === 5, 'y sigue contando')

await db.exec(`set role anon`)
ok((await q(`select count(*)::int as n from puntajes_tiendas`))[0].n === 1, 'anon lee los puntajes')
await falla(`select * from resenas`, '42501', 'anon no lee resenas')
await falla(`select nombre_usuario from usuarios`, '42501', 'anon no lee usuarios')
await db.exec(`reset role; set role authenticated`)
await falla(`insert into resenas (pedido_id, estrellas) values (4, 5)`, '42501', 'el navegador no inserta reseñas')
await db.exec(`reset role`)

await db.exec(`delete from pedidos where vendedor_id = 7; delete from vendedores where id = 7`)
ok((await q(`select count(*)::int as n from resenas`))[0].n === 0 && (await q(`select count(*)::int as n from puntajes_tiendas`))[0].n === 0,
  'borrar una tienda de prueba (pedidos y tienda) se lleva sus reseñas y su puntaje')
const fin = JSON.parse((await db.exec(M037)).at(-1).rows[0].verificacion)
ok(fin.puntajes_descuadrados === 0, 'los puntajes cuadran con las reseñas')

const db2 = new PGlite()
await db2.exec(`create role anon; create role authenticated; create role service_role bypassrls;
  create table public.usuarios (id uuid primary key, cerrada_en timestamptz);
  create table public.vendedores (id bigint primary key);
  create table public.pedidos (id bigint primary key);`)
try { await db2.exec(M037); ok(false, 'con vendedores.id bigint tendría que frenar') }
catch (err) { ok(err.code === 'P0001', 'con otros tipos, el freno de la sección 0 para todo') }
await db2.exec('rollback')
ok((await db2.query(`select to_regclass('public.resenas') as t`)).rows[0].t === null, 'y no deja nada')

console.log(fallas ? `\n${fallas} FALLA(S)` : '\nTODO OK')
process.exit(fallas ? 1 : 0)
