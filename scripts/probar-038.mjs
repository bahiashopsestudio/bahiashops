// Prueba de la moderación de reseñas, segunda parte: la tienda pide revisión,
// "Por revisar" y "Ocultas" del admin, y eliminar una oculta a los 45 días
// (src/lib/resenas.js y la migración 038, corrida sobre la 037 en una base
// local: PGlite, Postgres real en WebAssembly). No toca Supabase ni ninguna
// base real.
//
//   npm run probar:038

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
const { fechaLarga } = await import('../src/lib/fechas.js')
const { PGlite } = await import('@electric-sql/pglite')

let fallas = 0
const ok = (c, m) => { if (!c) { fallas++; console.log('  ✗ FALLA:', m) } else console.log('  ✓', m) }
const leer = (ruta) => readFileSync(new URL(ruta, raiz), 'utf8').replace(/\r\n/g, '\n')
const DIA = 24 * 60 * 60 * 1000

console.log('1. Pedir revisión (la regla)')
ok(R.MOTIVOS_REVISION.map((m) => m.valor).join() === R.MOTIVOS_OCULTAR.map((m) => m.valor).join(), 'los mismos 4 motivos que ocultar')
ok(R.textoMotivoRevision('sin_compra_real') === 'Es falsa, esta persona nunca me compró', 'dicho como lo diría la tienda')
ok(!R.validarPedidoRevision({ motivo: 'otro' }).ok, 'un motivo fuera de los 4: no')
let v = R.validarPedidoRevision({ motivo: 'insultos', comentario: '   ' })
ok(v.ok && v.comentario === null, 'comentario vacío: sin comentario')
ok(R.validarPedidoRevision({ motivo: 'insultos', comentario: 'a'.repeat(300) }).ok, '300 caracteres: sí')
ok(!R.validarPedidoRevision({ motivo: 'insultos', comentario: 'a'.repeat(301) }).ok, '301: no')
ok(R.estadoRevisionTienda({}) === null, 'sin pedir: nada')
ok(R.estadoRevisionTienda({ revision_pedida_en: '2026-10-01', revision_pendiente_desde: '2026-10-01' }) === 'en_revision', 'pedida y sin resolver: En revisión')
ok(R.estadoRevisionTienda({ revision_pedida_en: '2026-10-01', revision_pendiente_desde: null }) === 'revisada', 'revisada: sigue publicada')

console.log('2. Por qué está en "Por revisar"')
const aviso = [{ tipo: 'telefono_dudoso', texto: '1234' }]
let m = R.motivosPorRevisar({ moderacion_avisos: aviso })
ok(m.filtro && !m.tienda, 'la marcó el filtro')
m = R.motivosPorRevisar({ moderacion_avisos: [], revision_pedida_en: '2026-10-02' })
ok(!m.filtro && m.tienda, 'la pidió la tienda')
m = R.motivosPorRevisar({ moderacion_avisos: aviso, revision_pedida_en: '2026-10-02' })
ok(m.filtro && m.tienda, 'las dos cosas')
m = R.motivosPorRevisar({ moderacion_avisos: aviso, revisada_en: '2026-10-01', revision_pedida_en: '2026-10-02' })
ok(!m.filtro && m.tienda, 'revisada por el filtro y después la pidió la tienda: solo la tienda')

console.log('3. Eliminar (la regla de la pantalla)')
const oculta = { estado: 'oculta_por_moderacion', oculta_en: '2026-09-01T12:00:00Z', eliminada_en: null }
ok(fechaLarga(R.eliminableDesde(oculta)) === '16 de octubre', 'oculta el 1/9: se puede eliminar desde el 16 de octubre')
ok(!R.puedeEliminar(oculta, Date.parse('2026-10-15T12:00:00Z')), 'el 15/10 todavía no')
ok(R.puedeEliminar(oculta, Date.parse('2026-10-16T12:00:00Z')), 'el 16/10 sí')
ok(R.eliminableDesde({ ...oculta, eliminada_en: '2026-10-17' }) === null, 'una eliminada no se vuelve a eliminar')
ok(R.eliminableDesde({ estado: 'publicada' }) === null, 'una publicada no se elimina')

console.log('4. La migración 038 sobre la 037')
const M037 = leer('sql/migrations/037_resenas.sql')
const M038 = leer('sql/migrations/038_revision_resenas.sql')
const db = new PGlite()
const q = async (sql) => (await db.query(sql)).rows
async function falla(sql, codigo, msj) {
  try { await db.exec(sql); ok(false, `${msj} (no falló)`) }
  catch (err) { ok(!codigo || err.code === codigo, `${msj} (${err.code})`) }
}
await db.exec(`
  create role anon; create role authenticated; create role service_role bypassrls;
  create table public.usuarios (id uuid primary key, nombre_usuario text, cerrada_en timestamptz, bienvenida_vista_en timestamptz);
  create table public.vendedores (id integer primary key, usuario_id uuid references public.usuarios);
  create table public.pedidos (id bigint primary key, comprador_id uuid not null references public.usuarios,
    vendedor_id bigint not null references public.vendedores, estado text not null,
    creado_en timestamptz not null default now(), aviso_comprador_en timestamptz, actualizado_en timestamptz);
  grant select on public.usuarios to anon, authenticated;
  insert into usuarios (id, nombre_usuario) values ('00000000-0000-0000-0000-00000000000a', 'Nutria'), ('00000000-0000-0000-0000-00000000000c', 'Dueña');
  insert into vendedores values (10, '00000000-0000-0000-0000-00000000000c');
  insert into pedidos (id, comprador_id, vendedor_id, estado)
    select g, '00000000-0000-0000-0000-00000000000a', 10, 'entregado' from generate_series(1, 7) g;
`)
await db.exec(M037)
await db.exec(`insert into resenas (pedido_id, estrellas, texto, moderacion_avisos, revision_pendiente_desde)
  select g, 5, 'Texto ' || g, '[{"tipo":"telefono_dudoso","texto":"1234"}]', now() from generate_series(1, 7) g`)
const verif = JSON.parse((await db.exec(M038)).at(-1).rows[0].verificacion)
await db.exec(M038)
ok(true, 'corre, y corre dos veces')
ok(Object.values(verif.checks).every(Boolean) && verif.funcion_nueva && verif.disparador, 'los tres CHECK, la función y el disparador')
ok(verif.indices.resenas_por_revisar_publicadas && verif.indices.resenas_ocultas_sin_eliminar
  && !verif.indices.resenas_por_revisar && !verif.indices.resenas_ocultas, 'los índices nuevos, sin los de la 037')
ok(verif.filas_incoherentes === 0 && verif.ocultas_por_revisar === 0, 'sin filas incoherentes ni ocultas por revisar')
ok(verif.permisos_resenas.anon === '' && verif.permisos_resenas.authenticated === '', 'resenas sigue sin permisos para el navegador')

await db.exec(`update resenas set revision_pendiente_desde = null where pedido_id = 1`)
await db.exec(`update resenas set revision_pedida_en = now(), revision_motivo = 'insultos', revision_comentario = 'Me insultó, mi tel 2915550000' where pedido_id = 1`)
ok((await q(`select revision_pendiente_desde is not null as p from resenas where pedido_id = 1`))[0].p, 'pedir revisión la pone en "Por revisar"')
await falla(`update resenas set revision_pedida_en = now(), revision_motivo = 'insultos' where pedido_id = 1`, '22023', 'pedir revisión dos veces da error')
await falla(`update resenas set revision_comentario = 'otro' where pedido_id = 1`, '22023', 'cambiar el comentario después da error')
await falla(`update resenas set revision_motivo = 'insultos' where pedido_id = 2`, '22023', 'motivo sin fecha da error')
await falla(`update resenas set revision_pedida_en = now(), revision_motivo = 'insultos', revision_comentario = repeat('a', 301) where pedido_id = 2`, '23514', 'comentario de 301 da error')

// Ocultar: sale de "Por revisar" aunque quien la oculte no lo limpie.
await db.exec(`update resenas set estado = 'oculta_por_moderacion', oculta_motivo = 'insultos', oculta_en = now() where pedido_id = 1`)
ok((await q(`select revision_pendiente_desde from resenas where pedido_id = 1`))[0].revision_pendiente_desde === null,
  'ocultar pone revision_pendiente_desde en null (la base)')
ok((await q(`select count(*)::int n from resenas where estado = 'publicada' and revision_pendiente_desde is not null`))[0].n === 6,
  '"Por revisar" y su contador: solo publicadas')
await db.exec(`update resenas set estado = 'oculta_por_moderacion', oculta_motivo = 'insultos', oculta_en = now() where pedido_id = 3`)
await falla(`update resenas set revision_pedida_en = now(), revision_motivo = 'insultos' where pedido_id = 3`, '22023', 'pedir revisión de una oculta da error')
ok((await q(`select estado from resenas where pedido_id = 3`))[0].estado === 'oculta_por_moderacion', '(la 3 sigue oculta, para lo que sigue)')

const antes = (await q(`select cantidad, suma from puntajes_tiendas where vendedor_id = 10`))[0]
await falla(`update resenas set eliminada_en = now() where pedido_id = 1`, '22023', 'eliminar antes de los 45 días da error')
await falla(`update resenas set eliminada_en = now() where pedido_id = 4`, '22023', 'eliminar una publicada da error')
await db.exec(`update resenas set oculta_en = oculta_en - interval '46 days' where pedido_id = 1`)
await falla(`update resenas set eliminada_en = now(), oculta_en = now() - interval '90 days' where pedido_id = 3`, '22023', 'no se puede "envejecer" y eliminar en el mismo paso')
await db.exec(`update resenas set eliminada_en = now() where pedido_id = 1`)
const el = (await q(`select texto, moderacion_avisos, revision_comentario, revision_motivo, revision_pedida_en, estrellas, estado, oculta_motivo from resenas where pedido_id = 1`))[0]
ok(el.texto === null && JSON.stringify(el.moderacion_avisos) === '[]', 'eliminar borra el texto y los avisos')
ok(el.revision_comentario === null && el.revision_motivo === 'insultos' && el.revision_pedida_en !== null,
  'y el comentario de la tienda; el motivo y la fecha del pedido quedan')
ok(el.estrellas === 5 && el.estado === 'oculta_por_moderacion' && el.oculta_motivo === 'insultos', 'la fila queda (estrellas, estado, motivo)')
const despues = (await q(`select cantidad, suma from puntajes_tiendas where vendedor_id = 10`))[0]
ok(antes.cantidad === despues.cantidad && antes.suma === despues.suma, 'el puntaje no cambia al eliminar')
await falla(`update resenas set estado = 'publicada', oculta_motivo = null, oculta_en = null, oculta_por = null where pedido_id = 1`, '22023', 'una eliminada no se puede volver a mostrar')
await falla(`update resenas set eliminada_en = null where pedido_id = 1`, '22023', 'ni des-eliminar')
await falla(`insert into resenas (pedido_id, estrellas) values (1, 4)`, '23505', 'quien la escribió no puede reseñar de nuevo ese pedido')
// Lo que ve en Mis pedidos: oculta y sin texto, el mismo mensaje que una oculta.
const mia = (await q(`select estado, texto from resenas where pedido_id = 1`))[0]
ok(mia.estado === 'oculta_por_moderacion' && mia.texto === null, 'en Mis pedidos se ve como oculta, sin el texto')
await db.exec(`update usuarios set cerrada_en = now() where id = '00000000-0000-0000-0000-00000000000a'`)
ok((await q(`select count(*)::int n from resenas where comprador_id is not null`))[0].n === 0, 'cerrar la cuenta sigue andando, también con una eliminada')

await falla(`update resenas set estrellas = 1 where pedido_id = 5`, '22023', 'lo de la 037 sigue frenado: estrellas')
await falla(`update resenas set texto = 'x' where pedido_id = 5`, '22023', 'lo de la 037 sigue frenado: texto')
await db.exec(`update resenas set estado = 'oculta_por_moderacion', oculta_motivo = 'insultos', oculta_en = now() where pedido_id = 5;
  update resenas set estado = 'publicada', oculta_motivo = null, oculta_en = null where pedido_id = 5`)
ok(true, 'ocultar y volver a mostrar una no eliminada sigue andando')
const fin = JSON.parse((await db.exec(M038)).at(-1).rows[0].verificacion)
ok(fin.filas_incoherentes === 0 && fin.ocultas_por_revisar === 0, 'al final, nada incoherente')

console.log(fallas ? `\n${fallas} FALLA(S)` : '\nTODO OK')
process.exit(fallas ? 1 : 0)
