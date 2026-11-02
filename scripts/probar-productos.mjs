// Prueba el guardado, la pausa, el borrado y la moderación de productos por el
// servidor, con las rutas REALES y una base de mentira:
//
//   · lib/productos: qué datos y qué fotos se aceptan;
//   · /api/vendedor/productos (alta) y /api/vendedor/productos/[id] (editar,
//     pausar o reactivar, borrar): la tienda sale de la sesión, la moderación
//     corre acá, el navegador no elige estado, destacado ni avisos;
//   · el plan (migración 046): el tope de fotos se cuenta acá, y el error del
//     tope de la base (BS409) sale como 409 con { error, motivo, tope, usados };
//   · /api/admin/productos/[id]/moderacion.
//
// Lo que hace la base de verdad (las funciones guardar_producto y
// cambiar_estado_producto, los topes, los permisos y RLS) se prueba con
// npm run probar:033 y npm run probar:046.
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
    lecturasPlan: 0,
    fotosPlan: 4,       // fotos por producto del plan (el Gratis)
    sinPlan: false,     // rpc_plan_de_tienda falla
    topeLleno: false,   // rpc_cambiar_estado_producto: el tope de productos está lleno
    errorGuardar: null, // el error que devuelve rpc_guardar_producto
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
        not(c, o, v) { filtros.push((r) => (r[c] ?? null) !== v); return q },
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
      if (nombre === 'rpc_plan_de_tienda') {
        e.lecturasPlan++
        if (e.sinPlan) return { data: null, error: { code: 'XX000', message: 'falla' } }
        return { data: { plan: 'gratis', nombre: 'Gratis', especial: false, sin_tope: false, tope_productos: 10,
          fotos_por_producto: e.fotosPlan, carritos_abandonados: false, usados: 3 }, error: null }
      }
      e.rpc.push({ nombre, args })
      if (e.falla.rpc) return { data: null, error: { code: e.falla.rpc, message: 'falla' } }
      if (nombre === 'rpc_cambiar_estado_producto') {
        const p = e.tablas.productos.find((x) => x.id === args.p_producto_id && x.vendedor_id === args.p_vendedor_id)
        if (!p) return { data: { ok: false, motivo: 'no_existe' }, error: null }
        const puede = (args.p_destino === 'pausado' && p.estado === 'activo')
          || (args.p_destino === 'activo' && ['pausado', 'agotado'].includes(p.estado))
        if (!puede) return { data: { ok: false, motivo: 'estado', estado: p.estado }, error: null }
        if (args.p_destino === 'activo' && p.estado === 'pausado' && e.topeLleno) {
          return { data: { ok: false, motivo: 'tope_productos', tope: 10, usados: 10 }, error: null }
        }
        p.estado = args.p_destino
        return { data: { ok: true, estado: p.estado }, error: null }
      }
      if (nombre === 'rpc_guardar_producto' && e.errorGuardar) return { data: null, error: e.errorGuardar }
      if (nombre === 'rpc_rechazar_producto') {
        if (e.sinRechazo) return { data: null, error: { code: 'PGRST202', message: 'Could not find the function' } }
        const p = e.tablas.productos.find((x) => x.id === args.p_producto_id)
        if (!p) return { data: { resultado: 'no_existe' }, error: null }
        if (!['en_revision', 'activo', 'pausado', 'agotado'].includes(p.estado)) return { data: { resultado: 'no_se_puede' }, error: null }
        Object.assign(p, { estado: 'rechazado', motivo_rechazo: args.p_motivo.trim(), revision_posterior_desde: null })
        return { data: { resultado: 'rechazado', denuncias_resueltas: 2 }, error: null }
      }
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

const { validarProducto, esFotoDeLaTienda, origenesPermitidos, textoMotivoRechazo } = await import('../src/lib/productos.js')
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
ok(!val(CUERPO({ fotos: [] })).ok, 'sin fotos: rechazado')
const muchas = (n) => Array.from({ length: n }, (_, i) => FOTO(`f${i}`))
ok(val(CUERPO({ fotos: muchas(20) })).ok && !val(CUERPO({ fotos: muchas(21) })).ok && !val(CUERPO({ fotos: muchas(21) })).motivo,
  'sin topeFotos: hasta 20 (el techo técnico); 21, rechazado sin motivo de plan')
const deMas = val(CUERPO({ fotos: muchas(5) }), { topeFotos: 4 })
ok(!deMas.ok && deMas.motivo === 'tope_fotos' && deMas.tope === 4 && deMas.usados === 5, 'con topeFotos 4: 5 fotos, rechazado con motivo tope_fotos, tope 4 y usados 5')
ok(deMas.error === 'Este producto puede tener hasta 4 fotos con tu plan. Sacá alguna para poder guardarlo.', `y el texto se entiende solo: «${deMas.error}»`)
ok(val(CUERPO({ fotos: muchas(4) }), { topeFotos: 4 }).ok, 'con topeFotos 4: 4 fotos, aceptado')
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
ok(origenesPermitidos('activo').join() === 'pausado,agotado' && origenesPermitidos('pausado').join() === 'activo'
  && origenesPermitidos('en_revision') === null && origenesPermitidos('agotado') === null && origenesPermitidos('toString') === null, 'las transiciones del vendedor')

ok(textoMotivoRechazo('Fotos borrosas — mejorá la luz') === 'Fotos borrosas — mejorá la luz', 'el motivo de rechazo se muestra tal como está guardado')
ok(textoMotivoRechazo(null) === textoMotivoRechazo('  ') && /^No pudimos publicarlo\./.test(textoMotivoRechazo(null)), 'sin motivo (productos viejos): el texto genérico')

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

console.log('\n3. El plan en el alta (migración 046)')
nuevo()
r = await alta.POST(pedir(CUERPO({ fotos: [1, 2, 3, 4, 5].map((n) => FOTO(`p${n}`)) })))
ok(r.status === 409 && r.body.motivo === 'tope_fotos' && r.body.tope === 4 && r.body.usados === 5, 'Gratis con 5 fotos: 409 tope_fotos, tope 4, usados 5')
ok(f.rpc.length === 0, 'y no llega a guardar (las fotos se cuentan antes)')
r = await alta.POST(pedir(CUERPO({ fotos: [1, 2, 3, 4].map((n) => FOTO(`p${n}`)) })))
ok(r.status === 200, 'con 4 fotos: guarda')
nuevo({ errorGuardar: { code: 'BS409', message: 'tope_productos', details: '{"tope": 10, "usados": 10}' } })
r = await alta.POST(pedir(CUERPO()))
ok(r.status === 409 && r.body.motivo === 'tope_productos' && r.body.tope === 10 && r.body.usados === 10, 'la base dice tope lleno (BS409): 409 tope_productos, tope 10, usados 10')
ok(r.body.error === 'Llegaste al tope de 10 productos de tu plan. Para sumar otro, pausá o eliminá alguno de los que tenés publicados o en revisión.',
  `con un texto que se entiende solo: «${r.body.error}»`)
nuevo({ errorGuardar: { code: 'BS409', message: 'tope_productos', details: null } })
r = await alta.POST(pedir(CUERPO()))
ok(r.status === 409 && r.body.motivo === 'tope_productos' && r.body.tope === null && /^Llegaste al tope de productos de tu plan\./.test(r.body.error),
  'sin el detalle: 409 igual, sin los números')
nuevo({ errorGuardar: { code: 'BS409', message: 'tope_fotos', details: '{"tope": 4, "usados": 6}' } })
r = await alta.POST(pedir(CUERPO()))
ok(r.status === 409 && r.body.motivo === 'tope_fotos' && r.body.tope === 4 && r.body.usados === 6, 'la base dice tope de fotos: 409 tope_fotos')
nuevo({ errorGuardar: { code: 'PGRST202', message: 'Could not find the function' } })
r = await alta.POST(pedir(CUERPO()))
ok(r.status === 500 && f.inserts.length === 0, 'sin la función de la base: 500, y no guarda paso a paso (ya no hay respaldo)')
nuevo({ sinPlan: true })
r = await alta.POST(pedir(CUERPO()))
ok(r.status === 500 && f.rpc.length === 0 && /No pudimos guardar/.test(r.body.error), 'si no se puede leer el plan: 500 con mensaje, y no guarda')

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

console.log('\n5. El plan al editar (migración 046)')
// El producto 10 tiene 2 fotos. Con un plan de 1 foto por producto, se le
// aceptan las 2 que ya tenía, pero no una tercera.
const VIEJA = 'https://x.supabase.co/storage/v1/object/public/productos/viejo/b.webp'
nuevo({ fotosPlan: 1 })
r = await uno.PUT(pedir(CUERPO({ fotos: [FOTO('a'), VIEJA] })), ruta(10))
ok(r.status === 200, 'con más fotos que el plan: guarda las que ya tenía')
r = await uno.PUT(pedir(CUERPO({ fotos: [FOTO('a'), VIEJA, FOTO('nueva')] })), ruta(10))
ok(r.status === 409 && r.body.motivo === 'tope_fotos' && r.body.tope === 2 && r.body.usados === 3, 'pero no una más: 409 tope_fotos con tope 2 (las que tenía)')
nuevo({ fotosPlan: 4 })
r = await uno.PUT(pedir(CUERPO({ fotos: [FOTO('a'), VIEJA, FOTO('n1'), FOTO('n2')] })), ruta(10))
ok(r.status === 200, 'con el plan de 4: hasta 4')
r = await uno.PUT(pedir(CUERPO({ fotos: [FOTO('a'), VIEJA, FOTO('n1'), FOTO('n2'), FOTO('n3')] })), ruta(10))
ok(r.status === 409 && r.body.tope === 4, 'una quinta: 409 con tope 4')
nuevo({ errorGuardar: { code: 'BS409', message: 'tope_productos', details: '{"tope": 10, "usados": 10}' } })
r = await uno.PUT(pedir(CUERPO()), ruta(12))
ok(r.status === 409 && r.body.motivo === 'tope_productos' && r.body.usados === 10, 'reenviar un rechazado con el tope lleno (la base lo frena): 409 tope_productos')
nuevo({ sinPlan: true })
r = await uno.PUT(pedir(CUERPO()), ruta(10))
ok(r.status === 500 && f.rpc.length === 0, 'si no se puede leer el plan: 500, y no guarda')

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
ok(f.rpc.every((x) => x.nombre === 'rpc_cambiar_estado_producto' && x.args.p_vendedor_id === 1) && f.updates.length === 0,
  'todo va por rpc_cambiar_estado_producto, con la tienda de la sesión (ya no hay UPDATE suelto)')
nuevo({ topeLleno: true })
r = await cambiar(13, 'activo')
ok(r.status === 409 && r.body.motivo === 'tope_productos' && r.body.tope === 10 && r.body.usados === 10 && prod(13).estado === 'pausado',
  'reactivar un pausado con el tope lleno: 409 tope_productos, y sigue pausado')
ok(/^Llegaste al tope de 10 productos de tu plan\./.test(r.body.error), 'con el texto del tope (lo muestra el alert de hoy)')
r = await cambiar(14, 'activo')
ok(r.status === 200 && prod(14).estado === 'activo', 'agotado -> activo con el tope lleno: pasa (ya contaba)')
r = await cambiar(10, 'pausado')
ok(r.status === 200 && prod(10).estado === 'pausado', 'pausar con el tope lleno: pasa')
nuevo({ falla: { rpc: 'XX000' } })
r = await cambiar(10, 'pausado')
ok(r.status === 500 && prod(10).estado === 'activo', 'si la base falla: 500, no cambia')

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
r = await moderar(11, { accion: 'aprobar' })
ok(r.status === 409 && prod(11).estado === 'activo', 'aprobar uno que ya no está en la cola: 409')
nuevo({ esAdmin: true })
r = await moderar(11, { accion: 'rechazar', motivo: '  ' })
ok(r.status === 400 && prod(11).estado === 'en_revision', 'rechazar sin motivo: 400')
r = await moderar(11, { accion: 'rechazar', motivo: ' Fotos borrosas — mejorá la luz ' })
ok(r.status === 200 && prod(11).estado === 'rechazado' && prod(11).motivo_rechazo === 'Fotos borrosas — mejorá la luz', 'rechazar: guarda el motivo')
ok(f.rpc.at(-1)?.nombre === 'rpc_rechazar_producto' && f.rpc.at(-1).args.p_admin_id === 'admin-1', 'rechazar va por rpc_rechazar_producto, con quién lo rechazó')
r = await moderar(11, { accion: 'rechazar', motivo: 'Otra vez' })
ok(r.status === 409, 'rechazar uno ya rechazado: 409')
r = await moderar(10, { accion: 'rechazar', motivo: 'Tiene datos de contacto' })
ok(r.status === 200 && prod(10).estado === 'rechazado' && r.body.denuncias_resueltas === 2, 'rechazar uno publicado (desde Denuncias o Revisar después): OK, y resuelve sus denuncias')
r = await moderar(999, { accion: 'rechazar', motivo: 'x' })
ok(r.status === 404, 'rechazar uno que no existe: 404')
nuevo({ esAdmin: true, sinRechazo: true })
r = await moderar(10, { accion: 'rechazar', motivo: 'x' })
ok(r.status === 409 && prod(10).estado === 'activo', 'sin la 035: no rechaza uno publicado')
r = await moderar(11, { accion: 'rechazar', motivo: 'Fotos' })
ok(r.status === 200 && prod(11).estado === 'rechazado' && prod(11).motivo_rechazo === 'Fotos', 'sin la 035: rechaza los de la cola, como antes')
nuevo({ esAdmin: true })
prod(10).revision_posterior_desde = '2026-10-10T10:00:00Z'
r = await moderar(10, { accion: 'dar_por_revisado' })
ok(r.status === 200 && prod(10).revision_posterior_desde === null && prod(10).estado === 'activo', 'dar por revisado: limpia la marca, el producto sigue publicado')
r = await moderar(10, { accion: 'dar_por_revisado' })
ok(r.status === 409, 'dar por revisado uno sin marca: 409')
r = await moderar(10, { accion: 'destacar' })
ok(r.status === 400, 'otra acción: 400')

console.log(fallas === 0 ? '\nTODO OK' : `\n${fallas} FALLAS`)
process.exit(fallas ? 1 : 0)
