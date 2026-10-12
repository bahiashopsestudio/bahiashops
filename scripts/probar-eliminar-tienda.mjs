// Prueba, con las rutas REALES contra una base REAL (PGlite, con las
// migraciones 016, 007, 030 y 031 de verdad), cerrar una tienda al eliminar la
// cuenta y borrar una tienda de prueba desde el admin:
//
//   · tienda activa -> no se puede eliminar la cuenta (TIENDA_ACTIVA);
//   · se pausa (/api/vendedor/pausa) y se elimina la cuenta (/api/cuenta/cerrar):
//     con pedidos, la tienda queda cerrada; sin pedidos, se borra;
//   · Storage: logo y portada se borran; de las fotos de productos quedan solo
//     las de los productos que se vendieron;
//   · el mail final menciona la tienda;
//   · el admin elimina una cuenta con tienda pausada, y borra una tienda de
//     prueba con pedidos (DELETE /api/admin/vendedores/[id]).
//
//   npm run probar:eliminar-tienda
//
// No toca Supabase, Storage, MercadoPago ni Resend: la base es PGlite, y el
// cliente de Supabase es un adaptador mínimo (select, update, filtros y rpc)
// que arma SQL de verdad.

import { register } from 'node:module'
import { baseDeTiendas } from './base-tiendas-prueba.mjs'

process.env.RESEND_API_KEY = 'clave-de-mentira'

const raiz = new URL('../', import.meta.url)
const loader = `
const src = ${JSON.stringify(new URL('src/', raiz).href)}
const falsos = {
  'next/server': 'export const NextResponse = { json: (body, init) => ({ body, status: (init && init.status) || 200 }) }',
  'next/headers': 'export async function cookies() { return { getAll: () => [], delete() {} } }',
  '@/lib/supabase/server': 'export async function createClient() { return globalThis.__f.sesion }',
  '@/lib/supabase/admin': 'export function getServiceRoleClient() { return globalThis.__f.admin } export async function verificarAdmin() { return globalThis.__f.adminUser }',
  '@/lib/mercadopago/tokens': 'export async function getValidAccessToken() { return "TOKEN" } export async function getCuentaValida() { return { accessToken: "TOKEN", mpUserId: "1" } }',
}
export function resolve(esp, ctx, sig) {
  if (falsos[esp]) return { url: 'data:text/javascript,' + encodeURIComponent(falsos[esp]), shortCircuit: true }
  if (esp.startsWith('@/')) { const r = src + esp.slice(2); return sig(r.endsWith('.js') ? r : r + '.js', ctx) }
  return sig(esp, ctx)
}`
register('data:text/javascript,' + encodeURIComponent(loader))

let fallas = 0
const ok = (c, m) => { if (!c) { fallas++; console.log('  ✗ FALLA:', m) } else console.log('  ✓', m) }
const log = console.log
console.log = (...a) => { if (typeof a[0] === 'string' && /^\n?(\s*[✓✗]|\d+\.|TODO OK|\d+ FALLAS)/.test(a[0])) log(...a) }
console.warn = () => {}
console.error = () => {}

const { db, q, n } = await baseDeTiendas()

// ── El cliente de Supabase, sobre PGlite ──
function cliente() {
  return {
    rpc: async (nombre, args = {}) => {
      const valores = Object.values(args)
      try {
        const filas = await q(`select public.${nombre}(${valores.map((_, i) => `$${i + 1}`).join(', ')}) as r`, valores)
        return { data: filas[0].r, error: null }
      } catch (e) { return { data: null, error: { message: e.message } } }
    },
    from(tabla) {
      let op = 'select', cols = '*', opciones = {}, payload = null, orden = ''
      const filtros = [], valores = []
      const p = (v) => { valores.push(v); return `$${valores.length}` }
      const b = {
        select(c, o) { cols = c || '*'; if (o) opciones = o; return b },
        update(x) { op = 'update'; payload = x; return b },
        eq(c, v) { filtros.push(`${c} = ${p(v)}`); return b },
        is(c, v) { filtros.push(v === null ? `${c} is null` : `${c} is ${v}`); return b },
        in(c, vs) { filtros.push(`${c} = any(${p(vs)})`); return b },
        not(c, o, v) {
          if (o === 'is') filtros.push(`${c} is not null`)
          else if (o === 'in') filtros.push(`not (${c} = any(${p(String(v).replace(/[()]/g, '').split(','))}))`)
          return b
        },
        order(c) { orden = ` order by ${c}`; return b },
        limit() { return b },
      }
      const correr = async () => {
        const donde = filtros.length ? ` where ${filtros.join(' and ')}` : ''
        try {
          if (op === 'update') {
            const sets = Object.keys(payload).map((k) => `${k} = ${p(payload[k])}`).join(', ')
            return { data: await q(`update public.${tabla} set ${sets}${donde} returning ${cols}`, valores), error: null }
          }
          if (opciones.head) return { data: null, count: Number((await q(`select count(*) as n from public.${tabla}${donde}`, valores))[0].n), error: null }
          return { data: await q(`select ${cols} from public.${tabla}${donde}${orden}`, valores), error: null }
        } catch (e) { return { data: null, error: { message: e.message } } }
      }
      b.maybeSingle = async () => { const r = await correr(); return { ...r, data: r.data ? r.data[0] ?? null : null } }
      b.single = b.maybeSingle
      b.then = (res, rej) => correr().then(res, rej)
      return b
    },
    storage: {
      from: (bucket) => ({
        list: async (carpeta, { limit = 100, offset = 0 } = {}) => {
          const nombres = [...(storage[bucket] || [])].filter((r) => r.startsWith(carpeta + '/')).map((r) => r.slice(carpeta.length + 1)).filter((r) => !r.includes('/'))
          return { data: nombres.slice(offset, offset + limit).map((name) => ({ name, id: 'x' })), error: null }
        },
        remove: async (rutas) => { for (const r of rutas) storage[bucket]?.delete(r); borradosStorage.push(...rutas.map((r) => `${bucket}/${r}`)); return { data: [], error: null } },
      }),
    },
  }
}

let storage = {}
let borradosStorage = []
const mails = []
globalThis.fetch = async (url, init = {}) => {
  if (String(url).includes('api.resend.com')) {
    const c = JSON.parse(init.body)
    mails.push({ para: c.to, asunto: c.subject, html: c.html, texto: c.text })
    return { ok: true, status: 200, json: async () => ({ id: 'm' }), text: async () => '' }
  }
  throw new Error('llamada inesperada a ' + url + ' (no se le pregunta nada a MercadoPago)')
}

let seq = 0
const uid = () => `00000000-0000-0000-0000-${String(++seq).padStart(12, '0')}`
async function cuenta(email, nombre = 'Ana') {
  const id = uid()
  await db.query(`insert into auth.users (id, email) values ($1, $2)`, [id, email])
  await db.query(`insert into public.usuarios (id, email, nombre, apellido) values ($1, $2, $3, 'Pérez')`, [id, email, nombre])
  return id
}
const URL_FOTO = (ruta) => `https://proyecto.supabase.co/storage/v1/object/public/productos/${ruta}?v=1`
async function tiendaConTodo(usuario, nombre) {
  const t = (await q(`insert into public.vendedores (usuario_id, nombre_negocio, slug, instagram, logo_url, portada_url)
    values ($1, $2, $3, '@tienda', 'l', 'p') returning id`, [usuario, nombre, `slug-${seq}`]))[0].id
  await db.query(`insert into public.mercadopago_cuentas (vendedor_id, access_token, token_expira_en) values ($1, 'T', now() + interval '90 days')`, [t])
  const vendido = (await q(`insert into public.productos (vendedor_id, nombre) values ($1, 'Taza') returning id`, [t]))[0].id
  const sinVender = (await q(`insert into public.productos (vendedor_id, nombre) values ($1, 'Plato') returning id`, [t]))[0].id
  await db.query(`insert into public.producto_media (producto_id, url) values ($1, $2), ($3, $4)`, [vendido, URL_FOTO(`${t}/vendido.webp`), sinVender, URL_FOTO(`${t}/sin-vender.webp`)])
  await db.query(`insert into public.producto_variantes (producto_id, imagen_url) values ($1, $2)`, [vendido, URL_FOTO(`${t}/variante-vendida.webp`)])
  storage.logos ??= new Set(); storage.portadas ??= new Set(); storage.productos ??= new Set()
  storage.logos.add(`${t}/logo.webp`)
  storage.portadas.add(`${t}/portada.webp`)
  for (const f of ['vendido.webp', 'variante-vendida.webp', 'sin-vender.webp', 'huerfano-viejo.webp']) storage.productos.add(`${t}/${f}`)
  return { t, vendido, sinVender }
}
async function pedido(comprador, vendedor, estado, producto = null) {
  const id = (await q(`insert into public.pedidos (comprador_id, vendedor_id, estado, vendedor_nombre) values ($1, $2, $3, 'La tienda') returning id`, [comprador, vendedor, estado]))[0].id
  await db.query(`insert into public.pedido_items (pedido_id, producto_id, nombre) values ($1, $2, 'Taza')`, [id, producto])
  return id
}
function sesionDe(id, email) {
  globalThis.__f = {
    admin: cliente(),
    adminUser: null,
    sesion: { auth: { getUser: async () => ({ data: { user: { id, email } } }), signOut: async () => ({}) } },
  }
}
const pedir = (cuerpo) => ({ json: async () => cuerpo })
const enStorage = (bucket, t) => [...(storage[bucket] || [])].filter((r) => r.startsWith(`${t}/`)).sort()

const cerrarRuta = await import('../src/app/api/cuenta/cerrar/route.js')
const pausaRuta = await import('../src/app/api/vendedor/pausa/route.js')
const adminCerrar = (await import('../src/app/api/admin/cuentas/[id]/cerrar/route.js')).POST
const adminTienda = (await import('../src/app/api/admin/vendedores/[id]/route.js')).DELETE

const comprador = await cuenta('cliente@mail.com', 'Beto')

console.log('1. Flujo completo: tienda con pedidos -> pausar -> eliminar la cuenta -> tienda cerrada')
{
  const duena = await cuenta('duena@mail.com', 'Rosa')
  const { t, vendido, sinVender } = await tiendaConTodo(duena, 'Ludoméstica')
  await pedido(comprador, t, 'despachado', vendido)
  const pend = await pedido(comprador, t, 'pendiente', vendido)
  sesionDe(duena, 'duena@mail.com')

  let r = await cerrarRuta.GET()
  ok(r.status === 200 && !r.body.puede && r.body.motivos.includes('TIENDA_ACTIVA'), 'con la tienda activa: no se puede (TIENDA_ACTIVA)')
  ok(r.body.tienda?.nombre === 'Ludoméstica' && r.body.tienda.estado === 'activa', 'y dice qué tienda')

  r = await pausaRuta.POST(pedir({ mensaje: 'Cerramos' }))
  ok(r.status === 200 && r.body.pausada, 'la pausa (ruta real de la etapa 2)')

  r = await cerrarRuta.GET()
  ok(r.status === 200 && r.body.puede && r.body.tienda?.estado === 'pausada', 'pausada y sin ventas en curso: se puede, y avisa que la tienda es pausada')

  mails.length = 0
  r = await cerrarRuta.POST(pedir({ confirmacion: 'ELIMINAR' }))
  ok(r.status === 200 && r.body.ok, 'POST: eliminada')
  const v = (await q(`select * from public.vendedores where id = $1`, [t]))[0]
  ok(v && v.cerrada_en && v.pausada_en === null && v.instagram === null && v.logo_url === null && v.slug, 'la tienda quedó cerrada, con sus datos borrados y el slug guardado')
  ok((await q(`select cancelado_motivo from public.pedidos where id = $1`, [pend]))[0].cancelado_motivo === 'tienda_cerrada', 'el pedido pendiente: cancelado con tienda_cerrada')
  ok(await n(`select count(*) n from public.productos where id = $1`, [sinVender]) === 0 && await n(`select count(*) n from public.productos where id = $1`, [vendido]) === 1, 'se borró el producto sin vender; el vendido queda')
  ok(enStorage('logos', t).length === 0 && enStorage('portadas', t).length === 0, 'Storage: logo y portada borrados')
  ok(enStorage('productos', t).join(',') === `${t}/variante-vendida.webp,${t}/vendido.webp`, 'Storage: de productos quedan solo las fotos del producto vendido (y su variante)')
  ok(borradosStorage.includes(`productos/${t}/huerfano-viejo.webp`) && borradosStorage.includes(`productos/${t}/sin-vender.webp`), 'el huérfano viejo y la foto del producto borrado se fueron')
  const mail = mails.find((m) => m.para === 'duena@mail.com')
  ok(!!mail && mail.texto.includes('Tu tienda Ludoméstica fue cerrada permanentemente.'), 'el mail final dice "Tu tienda Ludoméstica fue cerrada permanentemente." (con el nombre de antes)')
  ok(mail.texto.includes('Hola Rosa:'), 'y saluda por el nombre')
  ok((await q(`select cerrada_en from public.usuarios where id = $1`, [duena]))[0].cerrada_en, 'la cuenta quedó eliminada (cáscara: la tienda cerrada la necesita)')
}

console.log('\n2. Tienda pausada sin pedidos -> se borra entera')
{
  const duena = await cuenta('sola@mail.com', 'Sol')
  const { t } = await tiendaConTodo(duena, 'Cerámica')
  sesionDe(duena, 'sola@mail.com')
  await pausaRuta.POST(pedir({}))
  mails.length = 0
  const r = await cerrarRuta.POST(pedir({ confirmacion: 'eliminar' }))
  ok(r.status === 200 && r.body.ok, 'POST: eliminada')
  ok(await n(`select count(*) n from public.vendedores where id = $1`, [t]) === 0 && await n(`select count(*) n from public.productos where vendedor_id = $1`, [t]) === 0, 'la tienda y sus productos no están')
  ok(enStorage('logos', t).length + enStorage('portadas', t).length + enStorage('productos', t).length === 0, 'Storage: no queda nada de la tienda')
  ok(await n(`select count(*) n from auth.users where id = $1`, [duena]) === 0, 'la cuenta se borró entera')
  ok(mails.some((m) => m.texto.includes('Tu tienda Cerámica fue cerrada permanentemente.')), 'el mail menciona la tienda')
}

console.log('\n3. Sin tienda: el mail no habla de tiendas')
{
  const u = await cuenta('sin@mail.com')
  sesionDe(u, 'sin@mail.com')
  mails.length = 0
  const r = await cerrarRuta.POST(pedir({ confirmacion: 'ELIMINAR' }))
  ok(r.status === 200 && mails.length === 1 && !/tienda/i.test(mails[0].texto.split('\n\n')[1] || ''), 'eliminada, y el mail no menciona ninguna tienda')
}

console.log('\n4. Venta en curso: no se puede')
{
  const duena = await cuenta('vendiendo@mail.com')
  const { t, vendido } = await tiendaConTodo(duena, 'Con ventas')
  await pedido(comprador, t, 'preparando', vendido)
  sesionDe(duena, 'vendiendo@mail.com')
  await pausaRuta.POST(pedir({}))
  const r = await cerrarRuta.POST(pedir({ confirmacion: 'ELIMINAR' }))
  ok(r.status === 409 && r.body.motivos.includes('VENTA_EN_CURSO'), 'POST: 409 VENTA_EN_CURSO')
  ok((await q(`select cerrada_en, pausada_en from public.vendedores where id = $1`, [t]))[0].pausada_en, 'y la tienda sigue pausada, sin cerrar')
}

console.log('\n5. Admin: eliminar una cuenta con tienda pausada')
{
  const duena = await cuenta('admin-elimina@mail.com')
  const { t, vendido } = await tiendaConTodo(duena, 'De prueba admin')
  await pedido(comprador, t, 'despachado', vendido)
  sesionDe(duena, 'admin-elimina@mail.com')
  await pausaRuta.POST(pedir({}))
  globalThis.__f.adminUser = { id: comprador }
  mails.length = 0
  const r = await adminCerrar({}, { params: Promise.resolve({ id: duena }) })
  ok(r.status === 200 && r.body.ok && r.body.tienda?.accion === 'cerrada' && r.body.tienda.id === t, 'responde ok, con la tienda cerrada')
  ok(enStorage('logos', t).length === 0, 'Storage limpio también desde el admin')
  ok(mails.length === 0, 'el admin no le manda mail a la persona')
}

console.log('\n6. Admin: borrar una tienda de prueba con pedidos (DELETE /api/admin/vendedores/[id])')
{
  const duena = await cuenta('prueba@mail.com')
  const { t, vendido } = await tiendaConTodo(duena, 'Tienda 14 de mentira')
  const ped = await pedido(comprador, t, 'pagado', vendido)
  sesionDe(duena, 'prueba@mail.com')

  let r = await adminTienda({}, { params: Promise.resolve({ id: String(t) }) })
  ok(r.status === 403 && (await n(`select count(*) n from public.vendedores where id = $1`, [t])) === 1, 'sin ser admin: 403 y no borra nada')

  globalThis.__f.adminUser = { id: comprador }
  r = await adminTienda({}, { params: Promise.resolve({ id: String(t) }) })
  ok(r.status === 200 && r.body.ok && r.body.nombre === 'Tienda 14 de mentira' && r.body.pedidos_borrados === 1, 'admin: ok, devuelve el nombre y cuántos pedidos borró')
  ok(await n(`select count(*) n from public.vendedores where id = $1`, [t]) === 0, 'la tienda no está')
  ok(await n(`select count(*) n from public.pedidos where id = $1`, [ped]) === 0 && await n(`select count(*) n from public.pedido_items where pedido_id = $1`, [ped]) === 0, 'ni sus pedidos ni sus ítems')
  ok(enStorage('logos', t).length + enStorage('portadas', t).length + enStorage('productos', t).length === 0, 'Storage: todo borrado')
  ok(await n(`select count(*) n from public.usuarios where id = $1 and cerrada_en is null`, [duena]) === 1, 'la cuenta de la dueña sigue intacta')

  r = await adminTienda({}, { params: Promise.resolve({ id: String(t) }) })
  ok(r.status === 404, 'otra vez: 404 (ya no existe)')
  r = await adminTienda({}, { params: Promise.resolve({ id: 'abc' }) })
  ok(r.status === 400, 'un id que no es número: 400')
}

console.log(fallas === 0 ? '\nTODO OK' : `\n${fallas} FALLAS`)
process.exit(fallas ? 1 : 0)
