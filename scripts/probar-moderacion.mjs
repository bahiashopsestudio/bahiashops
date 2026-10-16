// Prueba la cola de moderación (GET /api/admin/moderacion) con la ruta REAL y
// una base de mentira con service_role:
//
//   · sin ser admin: 403;
//   · trae las fotos (en orden), variantes, sellos, categoría y avisos de un
//     producto en revisión de una tienda ajena (lo que el navegador del admin
//     no puede leer por RLS);
//   · incluye los de tiendas pausadas o bloqueadas, marcados; no los de una
//     tienda cerrada;
//   · ?conteo=1 devuelve el mismo número, y cuántos hay para revisar después;
//   · ?vista=revisar: los ya aprobados marcados (migración 033), con el
//     fragmento del texto que encontró el filtro;
//   · si la base falla: 500 con un mensaje (no una cola vacía).
//
//   npm run probar:moderacion
//
// No toca Supabase.

import { register } from 'node:module'

const raiz = new URL('../', import.meta.url)
const loader = `
const src = ${JSON.stringify(new URL('src/', raiz).href)}
const falsos = {
  'next/server': 'export const NextResponse = { json: (body, init) => ({ body, status: (init && init.status) || 200 }) }',
  '@/lib/supabase/admin': 'export function getServiceRoleClient() { return globalThis.__f.admin } export async function verificarAdmin() { return globalThis.__f.esAdmin ? { id: "admin-1" } : null }',
}
export function resolve(esp, ctx, sig) {
  if (falsos[esp]) return { url: 'data:text/javascript,' + encodeURIComponent(falsos[esp]), shortCircuit: true }
  if (esp.startsWith('@/')) { const r = src + esp.slice(2); return sig(r.endsWith('.js') ? r : r + '.js', ctx) }
  return sig(esp, ctx)
}`
register('data:text/javascript,' + encodeURIComponent(loader))

let fallas = 0
const ok = (c, m) => { if (!c) { fallas++; console.log('  ✗ FALLA:', m) } else console.log('  ✓', m) }
console.log = ((log) => (...a) => { if (typeof a[0] === 'string' && /^ {2}[✓✗]|^\n?\d+\.|TODO OK|FALLAS/.test(a[0])) log(...a) })(console.log)
console.error = () => {}

// La tienda 1 es de otra persona (no del admin). La 2 está pausada, la 3
// bloqueada y la 4 cerrada.
function escenario(opciones = {}) {
  const e = {
    tablas: {
      vendedores: [
        { id: 1, nombre_negocio: 'Ludoméstica', pausada_en: null, bloqueado: false, cerrada_en: null },
        { id: 2, nombre_negocio: 'Plan Material', pausada_en: '2026-10-10T10:00:00Z', bloqueado: false, cerrada_en: null },
        { id: 3, nombre_negocio: 'Bloqueada', pausada_en: null, bloqueado: true, cerrada_en: null },
        { id: 4, nombre_negocio: 'Cerrada', pausada_en: null, bloqueado: false, cerrada_en: '2026-10-11T10:00:00Z' },
      ],
      productos: [
        { id: 10, vendedor_id: 1, estado: 'en_revision', nombre: 'Taza', descripcion: 'Cerámica', precio: 1000, categoria_id: 1,
          moderacion_avisos: [{ tipo: 'mencion_redes', texto: 'instagram' }], creado_en: '2026-10-01' },
        { id: 11, vendedor_id: 2, estado: 'en_revision', nombre: 'Mate', descripcion: 'Calabaza', precio: 2000, categoria_id: 1, moderacion_avisos: [], creado_en: '2026-10-02' },
        { id: 12, vendedor_id: 3, estado: 'en_revision', nombre: 'Jarra', descripcion: 'Vidrio', precio: 3000, categoria_id: 1, moderacion_avisos: null, creado_en: '2026-10-03' },
        { id: 13, vendedor_id: 4, estado: 'en_revision', nombre: 'Vaso', descripcion: 'Vidrio', precio: 4000, categoria_id: 1, moderacion_avisos: [], creado_en: '2026-10-04' },
        { id: 14, vendedor_id: 1, estado: 'activo', nombre: 'Plato', descripcion: 'Hondo', precio: 5000, categoria_id: 1, moderacion_avisos: [], creado_en: '2026-10-05' },
        // Ya aprobados, editados con algo dudoso (revisar después).
        { id: 20, vendedor_id: 1, estado: 'activo', nombre: 'Cucha', descripcion: 'Para tu CACHORRO, también la vendo en Instagram.', precio: 6000, categoria_id: 1,
          moderacion_avisos: [{ tipo: 'venta_animales', texto: 'cachorro' }, { tipo: 'mencion_redes', texto: 'instagram' }],
          revision_posterior_desde: '2026-10-08T10:00:00Z', actualizado_en: '2026-10-09T10:00:00Z', creado_en: '2026-09-01' },
        { id: 21, vendedor_id: 2, estado: 'pausado', nombre: 'Mesa', descripcion: 'Roble', precio: 7000, categoria_id: 1,
          moderacion_avisos: [{ tipo: 'telefono_dudoso', texto: '12345678' }],
          revision_posterior_desde: '2026-10-07T10:00:00Z', actualizado_en: '2026-10-07T10:00:00Z', creado_en: '2026-09-02' },
        { id: 22, vendedor_id: 4, estado: 'activo', nombre: 'Silla', descripcion: 'x', precio: 8000, categoria_id: 1,
          moderacion_avisos: [], revision_posterior_desde: '2026-10-06T10:00:00Z', creado_en: '2026-09-03' },
      ],
      producto_media: [
        { producto_id: 10, url: 'segunda.webp', orden: 1 }, { producto_id: 10, url: 'principal.webp', orden: 0 },
        { producto_id: 11, url: 'mate.webp', orden: 0 },
      ],
      producto_variantes: [{ producto_id: 10, propiedad_1_valor: 'S' }, { producto_id: 10, propiedad_1_valor: 'M' }],
      producto_sellos: [{ producto_id: 10, sello_id: 1 }, { producto_id: 10, sello_id: 3 }],
      sellos: [{ id: 1, nombre: 'Hecho en Bahía' }, { id: 3, nombre: 'Hecho a mano' }],
      categorias: [{ id: 1, nombre: 'Hogar', slug: 'hogar' }],
    },
    esAdmin: true,
    falla: false,
    consultas: [],
    ...opciones,
  }
  const t = e.tablas
  e.admin = {
    from(nombre) {
      const filtros = []
      let columnas = ''
      let orden = null
      const q = {
        select(c) { columnas = c; return q },
        eq(c, v) { filtros.push((r) => r[c] === v); return q },
        not(c, o, v) { filtros.push((r) => (r[c] ?? null) !== v); return q },
        order(c, { ascending } = {}) { orden = { c, ascending }; return q },
      }
      const embeber = (p) => {
        const fila = { ...p }
        if (columnas.includes('vendedores')) fila.vendedores = { ...t.vendedores.find((v) => v.id === p.vendedor_id) }
        if (columnas.includes('producto_media')) fila.producto_media = t.producto_media.filter((m) => m.producto_id === p.id)
        if (columnas.includes('producto_variantes')) fila.producto_variantes = t.producto_variantes.filter((m) => m.producto_id === p.id)
        if (columnas.includes('producto_sellos')) {
          fila.producto_sellos = t.producto_sellos.filter((s) => s.producto_id === p.id).map((s) => ({ sellos: t.sellos.find((x) => x.id === s.sello_id) }))
        }
        if (columnas.includes('categorias')) fila.categorias = t.categorias.find((c) => c.id === p.categoria_id) || null
        return fila
      }
      q.then = (res, rej) => {
        e.consultas.push({ tabla: nombre, columnas })
        if (e.falla) return Promise.resolve({ data: null, error: { message: 'se cayó' } }).then(res, rej)
        const filas = (t[nombre] || []).filter((r) => filtros.every((f) => f(r))).map(embeber)
        if (orden) filas.sort((a, b) => (a[orden.c] < b[orden.c] ? -1 : a[orden.c] > b[orden.c] ? 1 : 0) * (orden.ascending ? 1 : -1))
        return Promise.resolve({ data: filas, error: null }).then(res, rej)
      }
      return q
    },
  }
  return e
}

const nuevo = (o) => (globalThis.__f = escenario(o))
const pedir = (query = '') => ({ url: `https://bahiashops.com.ar/api/admin/moderacion${query}` })
const { GET } = await import('../src/app/api/admin/moderacion/route.js')
const { fragmentosDeAvisos } = await import('../src/lib/fragmentosModeracion.js')

console.log('1. Quién puede')
let f = nuevo({ esAdmin: false })
let r = await GET(pedir())
ok(r.status === 403 && f.consultas.length === 0, 'sin ser admin: 403, y no consulta nada')
r = await GET(pedir('?conteo=1'))
ok(r.status === 403, 'el conteo tampoco')

console.log('\n2. La cola')
f = nuevo()
r = await GET(pedir())
ok(r.status === 200, 'admin: 200')
const ids = r.body.productos.map((p) => p.id)
ok(ids.join() === '10,11,12', 'trae los productos en revisión (no el activo, ni el de la tienda cerrada)')
ok(r.body.total === 3, 'total: 3')
const taza = r.body.productos.find((p) => p.id === 10)
ok(taza.fotos.join() === 'principal.webp,segunda.webp', 'las fotos de un producto en revisión de una tienda ajena, en orden')
ok(taza.variantes.join() === 'S,M', 'sus variantes')
ok(taza.sellos.join() === 'Hecho en Bahía,Hecho a mano', 'sus sellos')
ok(taza.categoria?.nombre === 'Hogar' && taza.moderacion_avisos[0]?.tipo === 'mencion_redes', 'la categoría y los avisos')
ok(taza.vendedor?.nombre_negocio === 'Ludoméstica' && !taza.vendedor.pausada && !taza.vendedor.bloqueado, 'la tienda, sin etiquetas')
const mate = r.body.productos.find((p) => p.id === 11)
ok(mate.vendedor?.pausada === true && mate.fotos.join() === 'mate.webp', 'un producto de una tienda pausada aparece, marcado y con su foto')
const jarra = r.body.productos.find((p) => p.id === 12)
ok(jarra.vendedor?.bloqueado === true && Array.isArray(jarra.moderacion_avisos) && jarra.fotos.length === 0, 'uno de una tienda bloqueada aparece, marcado (avisos null -> [])')
ok(!JSON.stringify(r.body).includes('cerrada_en') && !JSON.stringify(r.body).includes('pausada_en'), 'no expone las fechas de la tienda, solo las marcas')

console.log('\n3. El conteo del panel')
f = nuevo()
r = await GET(pedir('?conteo=1'))
ok(r.status === 200 && r.body.total === 3 && !('productos' in r.body), '?conteo=1: el mismo número que la cola (incluye pausadas y bloqueadas)')
ok(r.body.revisar_despues === 2, 'y cuántos para revisar después (2: el de la tienda cerrada no)')
ok(!f.consultas[0].columnas.includes('producto_media'), 'sin traer fotos ni variantes')

console.log('\n4. Revisar después')
f = nuevo()
r = await GET(pedir('?vista=revisar'))
ok(r.status === 200 && r.body.productos.map((p) => p.id).join() === '21,20', 'los ya aprobados con marca, del más viejo al más nuevo (sin la tienda cerrada)')
const cucha = r.body.productos.find((p) => p.id === 20)
ok(cucha.estado === 'activo' && cucha.actualizado_en === '2026-10-09T10:00:00Z' && cucha.revision_posterior_desde === '2026-10-08T10:00:00Z', 'con su estado y las fechas')
ok(cucha.fragmentos.length === 2 && cucha.fragmentos[0].resaltado === 'CACHORRO' && cucha.fragmentos[0].campo === 'descripcion', 'el fragmento resaltado, tal como está escrito (mayúsculas)')
ok(cucha.fragmentos[1].resaltado === 'Instagram' && cucha.fragmentos[1].antes.endsWith('también la vendo en ') && cucha.fragmentos[1].despues === '.', 'con su contexto')
const mesa = r.body.productos.find((p) => p.id === 21)
ok(mesa.vendedor.pausada && mesa.fragmentos[0].campo === null, 'si no lo encuentra en el texto: solo la etiqueta (campo null)')

console.log('\n5. El fragmento')
let fr = fragmentosDeAvisos({ nombre: 'Gatito', descripcion: 'Vendo PERRITOS de raza' }, [{ tipo: 'venta_animales', texto: 'gatito' }])
ok(fr[0].campo === 'nombre' && fr[0].resaltado === 'Gatito', 'busca también en el nombre')
fr = fragmentosDeAvisos({ nombre: 'X', descripcion: 'Un pájaro cantor' }, [{ tipo: 'venta_animales', texto: 'pajaro' }])
ok(fr[0].resaltado === 'pájaro' && fr[0].antes === 'Un ' && fr[0].despues === ' cantor', 'sin distinguir tildes: resalta el original con tilde')
fr = fragmentosDeAvisos({ nombre: 'X', descripcion: 'a'.repeat(100) + 'instagram' + 'b'.repeat(100) }, [{ tipo: 'mencion_redes', texto: 'instagram' }])
ok(fr[0].antes.startsWith('…') && fr[0].antes.length === 61 && fr[0].despues.endsWith('…') && fr[0].despues.length === 61, 'recorta el contexto a 60 caracteres, con puntos suspensivos')
ok(fragmentosDeAvisos({ nombre: 'X' }, null).length === 0 && fragmentosDeAvisos({ nombre: 'X' }, [{ tipo: 'x' }]).length === 0, 'sin avisos (o sin texto): nada')

console.log('\n6. Si la base falla')
nuevo({ falla: true })
r = await GET(pedir())
ok(r.status === 500 && r.body.error === 'No se pudo cargar la cola de moderación.', '500 con un mensaje (el panel lo muestra, no una cola vacía)')
r = await GET(pedir('?conteo=1'))
ok(r.status === 500, 'el conteo también')
r = await GET(pedir('?vista=revisar'))
ok(r.status === 500 && !!r.body.error, 'y revisar después')

console.log(fallas === 0 ? '\nTODO OK' : `\n${fallas} FALLAS`)
process.exit(fallas ? 1 : 0)
