// Prueba el guardado, la pausa, el borrado y la moderación de productos por el
// servidor, con las rutas REALES y una base de mentira:
//
//   · lib/productos: qué datos y qué fotos se aceptan;
//   · /api/vendedor/productos (alta) y /api/vendedor/productos/[id] (editar,
//     pausar o reactivar, borrar): la tienda sale de la sesión, la moderación
//     corre acá, el navegador no elige estado, destacado ni avisos;
//   · el guardado paso a paso, cuando la función de la 033 todavía no existe;
//   · /api/admin/productos/[id]/moderacion.
//
// Lo que hace la base de verdad (la función guardar_producto, los permisos y
// RLS) se prueba con npm run probar:033.
//
//   npm run probar:productos
//
// No toca Supabase.

import { register } from 'node:module'

process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://x.supabase.co'

const raiz = new URL('../', import.meta.url)
const loader = `
const src = ${JSON.stringify(new URL('src/', raiz).href)}
const falsos = {
  'next/server': 'export const NextResponse = { json: (body, init) => ({ body, status: (init && init.status) || 200 }) }',
  '@/lib/supabase/server': 'export async function createClient() { return globalThis.__f.sesion }',
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
console.warn = () => {}
console.error = () => {}

const BASE = process.env.NEXT_PUBLIC_SUPABASE_URL
const FOTO = (n, tienda = 1) => `${BASE}/storage/v1/object/public/productos/${tienda}/${n}.webp`

// ── La base de mentira ──
function escenario(opciones = {}) {
  const e = {
    tablas: {
      vendedores: [{ id: 1, usuario_id: 'u-1' }, { id: 2, usuario_id: 'u-2' }],
      productos: [
        { id: 10, vendedor_id: 1, estado: 'activo', nombre: 'Taza' },
        { id: 11, vendedor_id: 1, estado: 'en_revision', nombre: 'Plato' },
        { id: 12, vendedor_id: 1, estado: 'rechazado', nombre: 'Jarra' },
        { id: 13, vendedor_id: 1, estado: 'pausado', nombre: 'Mate' },
        { id: 14, vendedor_id: 1, estado: 'agotado', nombre: 'Bombilla' },
        { id: 20, vendedor_id: 2, estado: 'activo', nombre: 'Lámpara' },
      ],
      producto_media: [
        { producto_id: 10, url: FOTO('a') },
        { producto_id: 10, url: 'https://x.supabase.co/storage/v1/object/public/productos/viejo/b.webp' },
        { producto_id: 20, url: FOTO('c', 2) },
      ],
      producto_variantes: [{ producto_id: 10, imagen_url: FOTO('v') }, { producto_id: 10, imagen_url: FOTO('ajena', 2) }],
      producto_sellos: [],
      sellos: [{ id: 1 }, { id: 2 }],
    },
    rpc: [], removidos: [], inserts: [], updates: [],
    sinFuncion: false, // la 033 todavía no corrió
    falla: {},          // { tabla: 'insert' | 'delete' | codigo }
    esAdmin: false,
    usuario: 'u-1',
    ...opciones,
  }
  let siguienteId = 100

  e.admin = {
    from(nombre) {
      const filtros = []
      let op = 'select'
      let payload = null
      let columnas = ''
      const filas = () => (e.tablas[nombre] || []).filter((r) => filtros.every((f) => f(r)))
      const q = {
        select(c) { if (c) columnas = c; return q },
        eq(c, v) { filtros.push((r) => r[c] === v); return q },
        in(c, vs) { filtros.push((r) => vs.includes(r[c])); return q },
        is(c, v) { filtros.push((r) => (r[c] ?? null) === v); return q },
        order() { return q },
        insert(p) { op = 'insert'; payload = p; return q },
        update(p) { op = 'update'; payload = p; return q },
        delete() { op = 'delete'; return q },
      }
      const conHijos = (r) => {
        const fila = { ...r }
        if (nombre === 'productos' && columnas.includes('producto_media')) {
          fila.producto_media = e.tablas.producto_media.filter((m) => m.producto_id === r.id)
          fila.producto_variantes = e.tablas.producto_variantes.filter((v) => v.producto_id === r.id)
        }
        return fila
      }
      const resolver = () => {
        const falla = e.falla[nombre]
        if (falla && (falla === op || falla.op === op)) return { data: null, error: { code: falla.code || 'XX000', message: `falla ${nombre} ${op}` } }
        if (op === 'insert') {
          const nuevas = (Array.isArray(payload) ? payload : [payload]).map((p) => ({ id: nombre === 'productos' ? ++siguienteId : undefined, ...p }))
          e.tablas[nombre] = [...(e.tablas[nombre] || []), ...nuevas]
          e.inserts.push({ tabla: nombre, filas: nuevas })
          return { data: nuevas.map((r) => ({ ...r })), error: null }
        }
        if (op === 'update') {
          const tocadas = filas()
          for (const r of tocadas) Object.assign(r, payload)
          e.updates.push({ tabla: nombre, payload, filas: tocadas.length })
          return { data: tocadas.map((r) => ({ ...r })), error: null }
        }
        if (op === 'delete') {
          const borrar = new Set(filas())
          if (nombre === 'productos' && [...borrar].some((r) => r.conPedidos)) {
            return { data: null, error: { code: '23503', message: 'violates foreign key constraint' } }
          }
          e.tablas[nombre] = e.tablas[nombre].filter((r) => !borrar.has(r))
          if (nombre === 'productos') {
            const ids = new Set([...borrar].map((r) => r.id))
            for (const t of ['producto_media', 'producto_variantes', 'producto_sellos']) e.tablas[t] = e.tablas[t].filter((r) => !ids.has(r.producto_id))
          }
          return { data: null, error: null }
        }
        return { data: filas().map(conHijos), error: null }
      }
      q.maybeSingle = async () => { const r = resolver(); return { ...r, data: Array.isArray(r.data) ? r.data[0] ?? null : r.data } }
      q.single = q.maybeSingle
      q.then = (res, rej) => Promise.resolve(resolver()).then(res, rej)
      return q
    },
    async rpc(nombre, args) {
      e.rpc.push({ nombre, args })
      if (e.sinFuncion) return { data: null, error: { code: 'PGRST202', message: 'Could not find the function' } }
      if (e.falla.rpc) return { data: null, error: { code: e.falla.rpc, message: 'falla' } }
      const actual = args.p_producto_id ? e.tablas.productos.find((p) => p.id === args.p_producto_id && p.vendedor_id === args.p_vendedor_id) : null
      if (args.p_producto_id && !actual) return { data: null, error: { code: 'P0002', message: 'No encontramos ese producto.' } }
      const aprobado = actual && ['activo', 'pausado', 'agotado'].includes(actual.estado)
      return { data: { id: args.p_producto_id || 500, estado: aprobado ? actual.estado : 'en_revision', revision_posterior: !!aprobado && args.p_avisos.length > 0 }, error: null }
    },
    storage: { from: (bucket) => ({ remove: async (rutas) => { e.removidos.push(...rutas.map((r) => `${bucket}/${r}`)); return { error: null } } }) },
  }
  e.sesion = { auth: { getUser: async () => ({ data: { user: e.usuario ? { id: e.usuario } : null } }) } }
  return e
}

let f
const nuevo = (o) => (f = globalThis.__f = escenario(o))
const pedir = (cuerpo) => ({ json: async () => cuerpo })
const ruta = (id) => ({ params: Promise.resolve({ id: String(id) }) })
const prod = (id) => f.tablas.productos.find((p) => p.id === id)

const CUERPO = (extra = {}) => ({
  nombre: 'Taza nueva', descripcion: 'Cerámica esmaltada', marca: '', precio: 1500, precio_anterior: null,
  tiempo_preparacion: 'durante_el_dia', categoria_id: 1, subcategoria_id: null, genero: [],
  propiedad_1_nombre: null, variantes: [], fotos: [FOTO('n1')], sellos: [1], ...extra,
})

const { validarProducto, esFotoDeLaTienda, estadoAlGuardar, origenesPermitidos } = await import('../src/lib/productos.js')
const alta = await import('../src/app/api/vendedor/productos/route.js')
const uno = await import('../src/app/api/vendedor/productos/[id]/route.js')
const moderacion = await import('../src/app/api/admin/productos/[id]/moderacion/route.js')

console.log('1. Qué datos y qué fotos se aceptan')
const val = (c, o = {}) => validarProducto(c, { vendedorId: 1, baseSupabase: BASE, ...o })
ok(val(CUERPO()).ok, 'un producto completo')
ok(esFotoDeLaTienda(FOTO('x'), 1, BASE) && !esFotoDeLaTienda(FOTO('x', 2), 1, BASE), 'una foto de la carpeta de la tienda sí; de otra tienda no')
ok(!esFotoDeLaTienda('https://otro.sitio/storage/v1/object/public/productos/1/x.webp', 1, BASE), 'una foto de otro sitio no')
ok(!esFotoDeLaTienda(`${BASE}/storage/v1/object/public/productos/1/../2/x.webp`, 1, BASE) && !esFotoDeLaTienda(`${BASE}/storage/v1/object/public/productos/1/a/b.webp`, 1, BASE), 'ni con ../ ni en una subcarpeta')
ok(val(CUERPO({ fotos: ['https://otro.sitio/x.jpg'] })).error === 'Alguna de las fotos no es válida. Volvé a subirla.', 'una URL externa: rechazada')
ok(val(CUERPO({ fotos: ['https://viejo/x.jpg'] }), { fotosExistentes: ['https://viejo/x.jpg'] }).ok, 'una foto que el producto ya tenía: aceptada aunque sea de otra forma')
ok(!val(CUERPO({ fotos: [] })).ok && !val(CUERPO({ fotos: [1, 2, 3, 4, 5, 6].map((n) => FOTO(n)) })).ok, 'sin fotos o con más de 5: rechazado')
ok(!val(CUERPO({ fotos: [FOTO('a'), FOTO('a')] })).ok, 'una foto repetida: rechazado')
ok(val(CUERPO({ tiempo_preparacion: null })).error === 'Elegí el tiempo de preparación.', 'sin tiempo de preparación: rechazado')
ok(!val(CUERPO({ precio: 0 })).ok && !val(CUERPO({ precio_anterior: 1000 })).ok, 'precio 0, o precio anterior menor: rechazado')
ok(!val(CUERPO({ nombre: '  ' })).ok && !val(CUERPO({ categoria_id: null })).ok, 'sin nombre o sin categoría: rechazado')
ok(!val(CUERPO({ propiedad_1_nombre: 'Talle' })).ok && !val(CUERPO({ variantes: ['S'] })).ok, 'variantes a medias: rechazado')
let v = val(CUERPO({ propiedad_1_nombre: ' Talle ', variantes: ['S', 's', ' M ', ''], genero: ['mujer', 'perro'], sellos: ['2', 2, 'x'] }))
ok(v.ok && v.variantes.join() === 'S,M' && v.datos.propiedad_1_nombre === 'Talle' && v.datos.tiene_variantes, 'variantes: sin repetidas (ni por mayúsculas) ni vacías')
ok(JSON.stringify(v.datos.genero) === '["mujer"]' && v.sellos.join() === '2', 'género y sellos: solo valores válidos')
v = val(CUERPO({ estado: 'activo', destacado: true, destacado_hasta: '2099-01-01', motivo_rechazo: 'x', moderacion_avisos: [], creado_en: '2099-01-01', vendedor_id: 2, id: 5 }))
ok(v.ok && ['estado', 'destacado', 'destacado_hasta', 'motivo_rechazo', 'moderacion_avisos', 'creado_en', 'vendedor_id', 'id'].every((k) => !(k in v.datos)),
  'estado, destacado, destacado_hasta, motivo_rechazo, moderacion_avisos, creado_en, vendedor_id e id del cuerpo se ignoran')
ok(estadoAlGuardar(null) === 'en_revision' && estadoAlGuardar('rechazado') === 'en_revision' && estadoAlGuardar('activo') === 'activo' && estadoAlGuardar('agotado') === 'agotado',
  'la regla de estado al guardar')
ok(origenesPermitidos('activo').join() === 'pausado,agotado' && origenesPermitidos('pausado').join() === 'activo'
  && origenesPermitidos('en_revision') === null && origenesPermitidos('agotado') === null && origenesPermitidos('toString') === null, 'las transiciones del vendedor')

console.log('\n2. Alta')
nuevo({ usuario: null })
let r = await alta.POST(pedir(CUERPO()))
ok(r.status === 401, 'sin sesión: 401')
nuevo({ usuario: 'u-9' })
r = await alta.POST(pedir(CUERPO()))
ok(r.status === 404 && f.rpc.length === 0, 'sin tienda: 404')
nuevo()
r = await alta.POST(pedir(CUERPO({ precio: 0 })))
ok(r.status === 400 && f.rpc.length === 0, 'datos inválidos: 400 y no guarda')
r = await alta.POST(pedir(CUERPO({ descripcion: 'Escribime a ana@gmail.com', moderacion_avisos: [] })))
ok(r.status === 422 && r.body.moderacion?.nivel === 'bloqueo' && r.body.moderacion.bloqueos.length > 0, 'contacto en el texto: 422 con lo que encontró (el mismo cartel)')
ok(f.rpc.length === 0, 'y no guarda nada')
r = await alta.POST(pedir(CUERPO({ descripcion: 'Lo vendo también en instagram', estado: 'activo', destacado: true, moderacion_avisos: [], vendedor_id: 2 })))
ok(r.status === 200 && r.body.estado === 'en_revision', 'un aviso ambiguo: guarda, en revisión')
let a = f.rpc[0].args
ok(f.rpc[0].nombre === 'rpc_guardar_producto' && a.p_vendedor_id === 1 && a.p_producto_id === null, 'llama a la función con la tienda de la sesión (no la del cuerpo)')
ok(a.p_avisos.length === 1 && a.p_avisos[0].tipo === 'mencion_redes', 'los avisos los calcula el servidor (no los que manda el navegador)')
ok(!('estado' in a.p_datos) && !('destacado' in a.p_datos) && !('vendedor_id' in a.p_datos), 'y no le pasa estado, destacado ni vendedor_id del cuerpo')

console.log('\n3. Alta paso a paso (la 033 todavía no corrió)')
nuevo({ sinFuncion: true })
r = await alta.POST(pedir(CUERPO({ fotos: [FOTO('p1'), FOTO('p2')], propiedad_1_nombre: 'Talle', variantes: ['S', 'M'], sellos: [1, 2, 9], estado: 'activo' })))
const creado = f.tablas.productos.find((p) => p.nombre === 'Taza nueva')
ok(r.status === 200 && creado?.estado === 'en_revision' && creado.vendedor_id === 1, 'guarda igual, en revisión, en la tienda de la sesión')
ok(Array.isArray(creado.moderacion_avisos) && creado.moderacion_avisos.length === 0 && !('destacado' in creado), 'con los avisos del servidor y sin destacado')
const fotos = f.tablas.producto_media.filter((m) => m.producto_id === creado.id)
ok(fotos.map((m) => m.orden).join() === '0,1' && fotos[0].es_principal && !fotos[1].es_principal, 'las fotos en orden, la primera principal')
ok(f.tablas.producto_variantes.filter((x) => x.producto_id === creado.id).length === 2, 'las variantes')
ok(f.tablas.producto_sellos.filter((x) => x.producto_id === creado.id).map((s) => s.sello_id).join() === '1,2', 'los sellos que existen')
nuevo({ sinFuncion: true, falla: { producto_variantes: 'insert' } })
r = await alta.POST(pedir(CUERPO({ propiedad_1_nombre: 'Talle', variantes: ['S'] })))
ok(r.status === 500 && !f.tablas.productos.some((p) => p.nombre === 'Taza nueva'), 'si falla una parte, el alta se borra entera')

console.log('\n4. Edición')
nuevo()
r = await uno.PUT(pedir(CUERPO()), ruta(20))
ok(r.status === 404 && f.rpc.length === 0, 'un producto de otra tienda: 404')
r = await uno.PUT(pedir(CUERPO()), ruta('abc'))
ok(r.status === 404, 'un id inválido: 404')
r = await uno.PUT(pedir(CUERPO({ fotos: [FOTO('a'), 'https://x.supabase.co/storage/v1/object/public/productos/viejo/b.webp', FOTO('nueva')] })), ruta(10))
ok(r.status === 200 && f.rpc[0].args.p_producto_id === 10, 'acepta las fotos que el producto ya tenía, más las nuevas de su carpeta')
r = await uno.PUT(pedir(CUERPO({ fotos: [FOTO('c', 2)] })), ruta(10))
ok(r.status === 400, 'una foto de otra tienda que no era suya: 400')
nuevo()
r = await uno.PUT(pedir(CUERPO({ nombre: 'Llamame' })), ruta(10))
ok(r.status === 422 && f.rpc.length === 0, 'un producto aprobado con un bloqueo: 422 y no guarda')
r = await uno.PUT(pedir(CUERPO({ descripcion: 'Cachorro de perro' })), ruta(10))
ok(r.status === 200 && r.body.estado === 'activo' && r.body.revision_posterior === true, 'aprobado con avisos: guarda, sigue activo, marcado para revisión posterior')
r = await uno.PUT(pedir(CUERPO()), ruta(10))
ok(r.status === 200 && r.body.estado === 'activo' && r.body.revision_posterior === false, 'aprobado y limpio: sigue activo, sin marca')
r = await uno.PUT(pedir(CUERPO()), ruta(12))
ok(r.status === 200 && r.body.estado === 'en_revision', 'rechazado: vuelve a revisión')

console.log('\n5. Edición paso a paso (la 033 todavía no corrió)')
for (const [id, esperado] of [[10, 'activo'], [13, 'pausado'], [14, 'agotado'], [11, 'en_revision'], [12, 'en_revision']]) {
  nuevo({ sinFuncion: true })
  r = await uno.PUT(pedir(CUERPO({ nombre: 'Editado', estado: 'activo' })), ruta(id))
  ok(r.status === 200 && prod(id).estado === esperado && prod(id).nombre === 'Editado', `${escenario().tablas.productos.find((p) => p.id === id).estado} -> ${esperado}`)
}
nuevo({ sinFuncion: true })
const original = f.admin.from
f.admin.from = (t) => { const q = original(t); if (t === 'productos') { const u = q.update; q.update = (p) => { prod(11).estado = 'activo'; return u(p) } } return q }
r = await uno.PUT(pedir(CUERPO()), ruta(11))
ok(r.status === 409 && prod(11).estado === 'activo' && prod(11).nombre === 'Plato', 'si el admin lo aprobó en el medio: 409 y no pisa su decisión')

console.log('\n6. Pausar y reactivar')
const cambiar = (id, estado) => uno.PATCH(pedir({ estado }), ruta(id))
nuevo()
r = await cambiar(10, 'pausado')
ok(r.status === 200 && prod(10).estado === 'pausado', 'activo -> pausado')
r = await cambiar(10, 'activo')
ok(r.status === 200 && prod(10).estado === 'activo', 'pausado -> activo')
r = await cambiar(14, 'activo')
ok(r.status === 200 && prod(14).estado === 'activo', 'agotado -> activo')
r = await cambiar(11, 'activo')
ok(r.status === 409 && prod(11).estado === 'en_revision' && r.body.estado === 'en_revision', 'en_revision -> activo: 409, no cambia')
r = await cambiar(12, 'activo')
ok(r.status === 409 && prod(12).estado === 'rechazado', 'rechazado -> activo: 409, no cambia')
r = await cambiar(12, 'pausado')
ok(r.status === 409 && prod(12).estado === 'rechazado', 'rechazado -> pausado: 409')
for (const destino of ['en_revision', 'rechazado', 'agotado', 'cualquiera', undefined]) {
  r = await cambiar(10, destino)
  ok(r.status === 400 && prod(10).estado === 'activo', `pedir '${destino}': 400`)
}
r = await cambiar(20, 'pausado')
ok(r.status === 404 && prod(20).estado === 'activo', 'un producto de otra tienda: 404')

console.log('\n7. Borrar')
nuevo()
r = await uno.DELETE(pedir(null), ruta(10))
ok(r.status === 200 && !prod(10) && f.tablas.producto_media.every((m) => m.producto_id !== 10), 'borra el producto (y en cascada sus fotos)')
ok(f.removidos.sort().join() === ['productos/1/a.webp', 'productos/1/v.webp'].join(), 'y de Storage, solo los archivos de la carpeta de la tienda')
r = await uno.DELETE(pedir(null), ruta(20))
ok(r.status === 404 && !!prod(20), 'un producto de otra tienda: 404, no se borra')
nuevo()
prod(13).conPedidos = true
r = await uno.DELETE(pedir(null), ruta(13))
ok(r.status === 409 && /pedidos asociados/.test(r.body.error) && /pausarlo/.test(r.body.error) && !!prod(13), 'con pedidos: 409 con el cartel de pausarlo')
ok(f.removidos.length === 0, 'y no borra sus fotos')

console.log('\n8. Moderación del admin')
const moderar = (id, cuerpo) => moderacion.POST(pedir(cuerpo), ruta(id))
nuevo()
r = await moderar(11, { accion: 'aprobar' })
ok(r.status === 403 && prod(11).estado === 'en_revision', 'sin ser admin: 403')
nuevo({ esAdmin: true })
r = await moderar(11, { accion: 'aprobar' })
ok(r.status === 200 && prod(11).estado === 'activo' && prod(11).motivo_rechazo === null, 'aprobar: en_revision -> activo')
r = await moderar(11, { accion: 'rechazar', motivo: 'Fotos' })
ok(r.status === 409 && prod(11).estado === 'activo', 'moderar uno que ya no está en la cola: 409')
nuevo({ esAdmin: true })
r = await moderar(11, { accion: 'rechazar', motivo: '  ' })
ok(r.status === 400 && prod(11).estado === 'en_revision', 'rechazar sin motivo: 400')
r = await moderar(11, { accion: 'rechazar', motivo: ' Fotos borrosas — mejorá la luz ' })
ok(r.status === 200 && prod(11).estado === 'rechazado' && prod(11).motivo_rechazo === 'Fotos borrosas — mejorá la luz', 'rechazar: guarda el motivo')
r = await moderar(10, { accion: 'destacar' })
ok(r.status === 400, 'otra acción: 400')

console.log(fallas === 0 ? '\nTODO OK' : `\n${fallas} FALLAS`)
process.exit(fallas ? 1 : 0)
