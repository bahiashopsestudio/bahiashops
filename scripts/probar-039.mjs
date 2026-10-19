// Prueba de las respuestas de la tienda a las reseñas: el filtro y las
// reglas (src/lib/resenas.js), la ruta REAL /api/vendedor/resenas/[id]/
// respuesta con una base de mentira, y la migración 039 corrida sobre la 037
// y la 038 en una base local (PGlite: Postgres real en WebAssembly). No toca
// Supabase ni ninguna base real.
//
//   npm run probar:039

import { register } from 'node:module'
import { readFileSync } from 'node:fs'

const raiz = new URL('../', import.meta.url)
// Node no conoce el alias '@/' de jsconfig.json: se resuelve a src/. La
// sesión y la base de las rutas son de mentira (globalThis.__f).
const loader = `
const src = ${JSON.stringify(new URL('src/', raiz).href)}
const falsos = {
  'next/server': 'export const NextResponse = { json: (body, init) => ({ body, status: (init && init.status) || 200 }) }',
  '@/lib/supabase/server': 'export async function createClient() { return globalThis.__f.sesion }',
  '@/lib/supabase/admin': 'export function getServiceRoleClient() { return globalThis.__f.admin } export async function verificarAdmin() { return null }',
}
export function resolve(esp, ctx, sig) {
  if (falsos[esp]) return { url: 'data:text/javascript,' + encodeURIComponent(falsos[esp]), shortCircuit: true }
  if (esp.startsWith('@/')) { const r = src + esp.slice(2); return sig(/\\.[a-z]+$/.test(r) ? r : r + '.js', ctx) }
  return sig(esp, ctx)
}`
register('data:text/javascript,' + encodeURIComponent(loader))

const R = await import('../src/lib/resenas.js')
const { PGlite } = await import('@electric-sql/pglite')

let fallas = 0
const ok = (c, m) => { if (!c) { fallas++; console.log('  ✗ FALLA:', m) } else console.log('  ✓', m) }
const leer = (ruta) => readFileSync(new URL(ruta, raiz), 'utf8').replace(/\r\n/g, '\n')
const DIA = 24 * 60 * 60 * 1000

console.log('1. El filtro de las respuestas (más estricto que el de las reseñas)')
const f = (t) => R.moderarTextoRespuesta(t)
ok(f('Gracias por tu compra, nos alegra que te haya gustado').nivel === 'limpio', 'una respuesta normal pasa')
ok(f('Escribinos al 291 512 3456 y lo vemos').nivel === 'bloqueo', 'un teléfono bloquea')
ok(f('Mandanos un WhatsApp').nivel === 'bloqueo', '"WhatsApp" bloquea')
ok(f('No te contesté por WhatsApp porque estaba de viaje').nivel === 'bloqueo', '"WhatsApp" bloquea aunque la mención sea inocente')
ok(R.moderarTextoResena('No me contestaron por WhatsApp').nivel === 'aviso', '(en una reseña, la misma mención solo queda para revisar)')
ok(f('escribime y lo arreglamos').nivel === 'bloqueo', '"escribime" bloquea')
ok(f('Seguinos en @tiendita').nivel === 'bloqueo', 'una cuenta con @ bloquea')
ok(f('Lo tenés en nuestro Instagram').nivel === 'bloqueo', 'Instagram bloquea')
ok(f('Mirá www.otra-tienda.com').nivel === 'bloqueo', 'un link bloquea')
ok(f('tienda.com.ar').nivel === 'bloqueo', 'un dominio suelto bloquea')
const dudosa = f('El pedido 12345678 salió el lunes')
ok(dudosa.nivel === 'aviso' && dudosa.avisos.some((a) => a.tipo === 'telefono_dudoso'), 'un número dudoso se publica y queda para revisar')

console.log('2. Validación y los 7 días')
ok(!R.validarRespuesta({ texto: '   ' }).ok, 'vacía: no')
ok(R.validarRespuesta({ texto: '  Gracias  ' }).texto === 'Gracias', 'sin espacios sueltos')
ok(R.validarRespuesta({ texto: 'a'.repeat(500) }).ok && !R.validarRespuesta({ texto: 'a'.repeat(501) }).ok, 'hasta 500')
const T0 = Date.parse('2026-10-10T12:00:00Z')
const resp = { estado: 'publicada', creado_en: new Date(T0).toISOString() }
ok(R.edicionRespuesta(resp, T0 + DIA).diasRestantes === 6, 'al día siguiente: quedan 6 días')
ok(R.edicionRespuesta(resp, T0 + 6.5 * DIA).diasRestantes === 1, 'el último: queda 1 día')
ok(!R.edicionRespuesta(resp, T0 + 7.01 * DIA).puede, 'después de los 7 días: ya no')
ok(!R.edicionRespuesta({ ...resp, estado: 'oculta_por_moderacion' }, T0 + DIA).puede, 'una oculta no se edita')
ok(R.textoDiasEdicion(1) === 'Te queda 1 día' && R.textoDiasEdicion(5) === 'Te quedan 5 días', 'singular y plural de los días')
ok(R.textoSinResponder(0) === 'Respondiste todas tus reseñas.' && R.textoSinResponder(1) === 'Tenés 1 reseña sin responder.'
  && R.textoSinResponder(3) === 'Tenés 3 reseñas sin responder.', 'la línea de arriba del panel')

console.log('3. La ruta: ninguna tienda responde en la reseña de otra')
// Una base de mentira, en memoria, con lo justo que usan tiendaDeLaSesion y la ruta.
function baseDeMentira(tablas) {
  const escrituras = []
  function consulta(tabla) {
    const filtros = []
    let op = 'select'
    let valores = null
    const filas = () => (tablas[tabla] || []).filter((f) => filtros.every((c) => c(f)))
    const q = {
      select() { return q },
      eq(c, v) { filtros.push((f) => String(f[c]) === String(v)); return q },
      is(c, v) { filtros.push((f) => (v === null ? f[c] == null : f[c] === v)); return q },
      insert(v) { op = 'insert'; valores = v; return q },
      update(v) { op = 'update'; valores = v; return q },
      async maybeSingle() { return q.resolver() },
      async single() { return q.resolver() },
      async resolver() {
        if (op === 'insert') {
          if ((tablas[tabla] || []).some((f) => f.resena_id === valores.resena_id)) {
            return { data: null, error: { code: '23505', message: 'duplicada' } }
          }
          const fila = { ...valores, estado: 'publicada', creado_en: new Date().toISOString(), editada_en: null }
          ;(tablas[tabla] ||= []).push(fila)
          escrituras.push({ tabla, op, valores })
          return { data: fila, error: null }
        }
        const encontradas = filas()
        if (op === 'update') {
          for (const f of encontradas) Object.assign(f, valores, { editada_en: new Date().toISOString() })
          escrituras.push({ tabla, op, valores })
        }
        return { data: encontradas[0] || null, error: null }
      },
    }
    return q
  }
  return { from: consulta, escrituras }
}
function escenario(usuario) {
  const tablas = {
    vendedores: [{ id: 18, usuario_id: 'u-bahia' }, { id: 7, usuario_id: 'u-otra' }],
    resenas: [
      { id: 100, vendedor_id: 18, estado: 'publicada' },
      { id: 200, vendedor_id: 7, estado: 'publicada' },
      { id: 300, vendedor_id: 18, estado: 'oculta_por_moderacion' },
    ],
    respuestas_resena: [{ resena_id: 200, vendedor_id: 7, texto: 'De la otra tienda', estado: 'publicada', creado_en: new Date().toISOString() }],
  }
  const admin = baseDeMentira(tablas)
  globalThis.__f = {
    sesion: { auth: { getUser: async () => ({ data: { user: usuario ? { id: usuario } : null } }) } },
    admin,
  }
  return { tablas, admin }
}
const ruta = await import('../src/app/api/vendedor/resenas/[id]/respuesta/route.js')
const pedido = (cuerpo) => ({ json: async () => cuerpo })
const params = (id) => ({ params: Promise.resolve({ id: String(id) }) })

let e = escenario('u-bahia')
let res = await ruta.POST(pedido({ texto: 'Gracias por comprarnos' }), params(200))
ok(res.status === 404 && e.admin.escrituras.length === 0, 'responder la reseña de otra tienda: 404, y no escribe nada')
res = await ruta.PATCH(pedido({ texto: 'Le cambio la respuesta' }), params(200))
ok(res.status === 404 && e.admin.escrituras.length === 0, 'editar la respuesta de otra tienda: 404, y no escribe nada')
res = await ruta.POST(pedido({ texto: 'Gracias' }), params(300))
ok(res.status === 409 && e.admin.escrituras.length === 0, 'responder una reseña oculta: 409')
res = await ruta.POST(pedido({ texto: 'Escribime al WhatsApp' }), params(100))
ok(res.status === 422 && res.body.moderacion?.bloqueos?.length > 0 && e.admin.escrituras.length === 0, 'con contacto: 422 con lo que encontró, y no escribe nada')
res = await ruta.POST(pedido({ texto: 'Gracias, el pedido 12345678 ya salió' }), params(100))
ok(res.status === 201 && e.tablas.respuestas_resena.find((r) => r.resena_id === 100)?.revision_pendiente_desde, 'lo dudoso se publica y queda para revisar')
res = await ruta.POST(pedido({ texto: 'Otra respuesta' }), params(100))
ok(res.status === 409, 'una sola respuesta por reseña: la segunda da 409')
res = await ruta.PATCH(pedido({ texto: 'Gracias, ya salió' }), params(100))
ok(res.status === 200 && e.tablas.respuestas_resena.find((r) => r.resena_id === 100).revision_pendiente_desde === null,
  'editarla dentro de los 7 días: sí, y si queda limpia sale de "Por revisar"')
ok(res.body.respuesta?.dias_edicion >= 6 && res.body.respuesta?.editada === true, 'devuelve los días que quedan y que está editada')
e = escenario(null)
res = await ruta.POST(pedido({ texto: 'Hola' }), params(100))
ok(res.status === 401, 'sin sesión: 401')

console.log('4. La migración 039 sobre la 037 y la 038')
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
  insert into usuarios (id) values ('00000000-0000-0000-0000-00000000000a'), ('00000000-0000-0000-0000-00000000000c'), ('00000000-0000-0000-0000-00000000000d');
  insert into vendedores values (18, '00000000-0000-0000-0000-00000000000c'), (7, '00000000-0000-0000-0000-00000000000d');
  insert into pedidos (id, comprador_id, vendedor_id, estado)
    select g, '00000000-0000-0000-0000-00000000000a', 18, 'entregado' from generate_series(1, 6) g;
`)
await db.exec(leer('sql/migrations/037_resenas.sql'))
await db.exec(leer('sql/migrations/038_revision_resenas.sql'))
await db.exec(`insert into resenas (pedido_id, estrellas, texto) select g, 4, 'Reseña ' || g from generate_series(1, 6) g`)
const M039 = leer('sql/migrations/039_respuestas_resenas.sql')
const verif = JSON.parse((await db.exec(M039)).at(-1).rows[0].verificacion)
await db.exec(M039)
ok(verif.tabla && verif.rls, 'corre, y corre dos veces; tabla con RLS')
ok(verif.tipos['respuestas.resena_id'] === 'bigint' && verif.tipos['respuestas.vendedor_id'] === 'integer', 'los tipos de las claves')
ok(verif.permisos.anon === '' && verif.permisos.authenticated === '', 'sin permisos para el navegador')
ok(Object.keys(verif.disparadores).length === 4 && Object.values(verif.disparadores).every(Boolean), 'los cuatro disparadores')

await db.exec(`insert into respuestas_resena (resena_id, texto) values (1, 'Gracias por tu compra')`)
ok(Number((await q(`select vendedor_id from respuestas_resena where resena_id = 1`))[0].vendedor_id) === 18, 'la tienda sale de la reseña')
await falla(`insert into respuestas_resena (resena_id, texto) values (1, 'Otra')`, '23505', 'una sola respuesta por reseña')
await falla(`insert into respuestas_resena (resena_id, vendedor_id, texto) values (2, 7, 'De otra tienda')`, '22023', 'una respuesta de otra tienda: no')
await falla(`insert into respuestas_resena (resena_id, texto) values (2, ' hola')`, '23514', 'sin espacios sueltos')
await db.exec(`insert into respuestas_resena (resena_id, texto, creado_en, editada_en) values (2, 'Vieja', now() - interval '30 days', now())`)
ok((await q(`select creado_en > now() - interval '1 minute' and editada_en is null as r from respuestas_resena where resena_id = 2`))[0].r,
  'no se puede crear "vieja" ni ya editada')

await db.exec(`update respuestas_resena set texto = 'Gracias, ya lo resolvimos' where resena_id = 1`)
ok((await q(`select editada_en is not null as e from respuestas_resena where resena_id = 1`))[0].e, 'editar dentro de los 7 días: sí, y queda "editada"')
await db.exec(`update respuestas_resena set editada_en = null where resena_id = 1`)
ok((await q(`select editada_en is not null as e from respuestas_resena where resena_id = 1`))[0].e, '"editada" no se borra a mano')
await db.exec(`alter table respuestas_resena disable trigger respuestas_no_se_editan;
  update respuestas_resena set creado_en = now() - interval '8 days', editada_en = null where resena_id = 2;
  alter table respuestas_resena enable trigger respuestas_no_se_editan`)
await falla(`update respuestas_resena set texto = 'Tarde' where resena_id = 2`, '22023', 'editar después de los 7 días: no')
await falla(`update respuestas_resena set creado_en = now() where resena_id = 1`, '22023', 'creado_en no se mueve')

const antes = (await q(`select cantidad, suma from puntajes_tiendas where vendedor_id = 18`))[0]
await db.exec(`update respuestas_resena set revision_pendiente_desde = now() where resena_id = 1`)
await db.exec(`update respuestas_resena set estado = 'oculta_por_moderacion', oculta_en = now() where resena_id = 1`)
const oc = (await q(`select r.revision_pendiente_desde, s.estado from respuestas_resena r join resenas s on s.id = r.resena_id where r.resena_id = 1`))[0]
ok(oc.revision_pendiente_desde === null && oc.estado === 'publicada', 'ocultar la respuesta: sale de "Por revisar" y la reseña sigue publicada')
const despues = (await q(`select cantidad, suma from puntajes_tiendas where vendedor_id = 18`))[0]
ok(antes.cantidad === despues.cantidad && antes.suma === despues.suma, 'ocultar la respuesta no cambia el puntaje')
await falla(`update respuestas_resena set texto = 'Cambio' where resena_id = 1`, '22023', 'una respuesta oculta no se edita')
await falla(`delete from respuestas_resena where resena_id = 1`, '22023', 'ni se borra para reemplazarla por otra')
await db.exec(`update respuestas_resena set estado = 'publicada', oculta_en = null where resena_id = 1`)
ok(true, 'volver a mostrar la respuesta')

await db.exec(`update resenas set estado = 'oculta_por_moderacion', oculta_motivo = 'insultos', oculta_en = now() where id = 3`)
await falla(`insert into respuestas_resena (resena_id, texto) values (3, 'Respuesta')`, '22023', 'responder una reseña oculta: no')
await db.exec(`insert into respuestas_resena (resena_id, texto) values (4, 'Respondo')`)
await db.exec(`update resenas set estado = 'oculta_por_moderacion', oculta_motivo = 'insultos', oculta_en = now() where id = 4`)
ok((await q(`select count(*)::int n from respuestas_resena where resena_id = 4`))[0].n === 1, 'ocultar la reseña deja la respuesta (no se muestra; vuelve con ella)')
await falla(`update respuestas_resena set texto = 'Edito' where resena_id = 4`, '22023', 'con la reseña oculta, la respuesta no se edita')
await db.exec(`update resenas set oculta_en = oculta_en - interval '46 days' where id = 4`)
await db.exec(`update resenas set eliminada_en = now() where id = 4`)
ok((await q(`select count(*)::int n from respuestas_resena where resena_id = 4`))[0].n === 0, 'eliminar la reseña borra la respuesta (y su texto)')
await falla(`insert into respuestas_resena (resena_id, texto) values (4, 'Otra vez')`, '22023', 'y no se puede volver a responder')

await db.exec(`insert into respuestas_resena (resena_id, texto) values (5, 'Para la cascada')`)
await db.exec(`delete from pedidos where vendedor_id = 18; delete from vendedores where id = 18`)
ok((await q(`select count(*)::int n from respuestas_resena`))[0].n === 0, 'borrar una tienda de prueba (como la 031) se lleva sus respuestas')
const fin = JSON.parse((await db.exec(M039)).at(-1).rows[0].verificacion)
ok(fin.respuestas_en_eliminadas === 0, 'ninguna respuesta en una reseña eliminada')

console.log(fallas ? `\n${fallas} FALLA(S)` : '\nTODO OK')
process.exit(fallas ? 1 : 0)
