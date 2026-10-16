// Prueba las denuncias de productos con las rutas REALES y una base de
// mentira (la regla de la base, privado.registrar_denuncia, se prueba con
// npm run probar:035):
//
//   · POST /api/denuncias: pide sesión, valida motivo y comentario, traduce lo
//     que decide la base (creada, ya_existia, propio, no_disponible, limite) y
//     manda el mail SOLO con la primera denuncia de un producto, escapado y
//     sin decir quién denunció;
//   · GET /api/admin/denuncias: solo admin, agrupadas por producto, motivos
//     del más repetido al menos, comentarios, sin quién denunció, sin tiendas
//     cerradas; ?conteo=1; si la base falla, 500;
//   · POST /api/admin/denuncias/[productoId]: descartar.
//
//   npm run probar:denuncias
//
// No toca Supabase ni Resend.

import { register } from 'node:module'

process.env.RESEND_API_KEY = 'clave-de-mentira'

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
console.error = () => {}

function escenario(opciones = {}) {
  const e = {
    usuario: 'u-ana',
    esAdmin: false,
    resultado: { resultado: 'creada', id: 1, primera: true },
    errorRpc: null,
    fallaLista: false,
    rpc: [], mails: [], updates: [],
    tablas: {
      productos: [{ id: 10, nombre: 'Taza <b>rara</b>', vendedores: { nombre_negocio: 'Ludo & Cía' } }],
      vendedores: [
        { id: 1, nombre_negocio: 'Ludoméstica', barrio_id: 5, pausada_en: null, bloqueado: false, cerrada_en: null },
        { id: 2, nombre_negocio: 'Plan Material', barrio_id: null, pausada_en: '2026-10-10', bloqueado: false, cerrada_en: null },
        { id: 3, nombre_negocio: 'Cerrada', barrio_id: null, pausada_en: null, bloqueado: false, cerrada_en: '2026-10-11' },
      ],
      barrios: [{ id: 5, nombre: 'Centro' }],
      // Denuncias pendientes (vienen de la base de la más reciente a la más vieja).
      denuncias: [
        { id: 1, producto_id: 10, usuario_id: 'u-1', motivo: 'contacto', comentario: 'Hay un teléfono en la foto 2', creada_en: '2026-10-15T10:00:00Z', estado: 'pendiente' },
        { id: 2, producto_id: 11, usuario_id: 'u-2', motivo: 'estafa', comentario: null, creada_en: '2026-10-14T10:00:00Z', estado: 'pendiente' },
        { id: 3, producto_id: 10, usuario_id: 'u-3', motivo: 'estafa', comentario: null, creada_en: '2026-10-13T10:00:00Z', estado: 'pendiente' },
        { id: 4, producto_id: 10, usuario_id: 'u-4', motivo: 'contacto', comentario: '<script>x</script>', creada_en: '2026-10-12T10:00:00Z', estado: 'pendiente' },
        { id: 5, producto_id: 12, usuario_id: 'u-5', motivo: 'fotos', comentario: null, creada_en: '2026-10-16T10:00:00Z', estado: 'pendiente' },
        { id: 6, producto_id: 10, usuario_id: 'u-6', motivo: 'otro', comentario: null, creada_en: '2026-10-01T10:00:00Z', estado: 'descartada' },
      ],
      productosLista: {
        10: { id: 10, nombre: 'Taza', descripcion: 'Cerámica', precio: 1000, estado: 'activo', vendedor_id: 1, producto_media: [{ url: 'b.webp', orden: 1 }, { url: 'a.webp', orden: 0 }], producto_variantes: [], categorias: { nombre: 'Hogar', slug: 'hogar' } },
        11: { id: 11, nombre: 'Mate', descripcion: 'Calabaza', precio: 2000, estado: 'activo', vendedor_id: 2, producto_media: [], producto_variantes: [], categorias: null },
        12: { id: 12, nombre: 'Vaso', descripcion: 'Vidrio', precio: 3000, estado: 'activo', vendedor_id: 3, producto_media: [], producto_variantes: [], categorias: null },
      },
    },
    ...opciones,
  }
  const t = e.tablas
  e.admin = {
    async rpc(nombre, args) {
      e.rpc.push({ nombre, args })
      if (e.errorRpc) return { data: null, error: e.errorRpc }
      return { data: e.resultado, error: null }
    },
    from(nombre) {
      const filtros = []
      let op = 'select'
      let payload = null
      const q = {
        select() { return q },
        eq(c, v) { filtros.push((r) => r[c] === v); return q },
        in(c, vs) { filtros.push((r) => vs.includes(r[c])); return q },
        order() { return q },
        update(p) { op = 'update'; payload = p; return q },
      }
      const filas = () => {
        if (nombre === 'denuncias_productos') {
          return t.denuncias.filter((r) => filtros.every((f) => f(r))).map((d) => {
            const p = t.productosLista[d.producto_id]
            return { ...d, productos: p ? { ...p, vendedores: { ...t.vendedores.find((v) => v.id === p.vendedor_id) } } : null }
          })
        }
        return (t[nombre] || []).filter((r) => filtros.every((f) => f(r)))
      }
      const resolver = () => {
        if (e.fallaLista && nombre === 'denuncias_productos') return { data: null, error: { message: 'se cayó' } }
        if (op === 'update') {
          const tocadas = t.denuncias.filter((r) => filtros.every((f) => f(r)))
          for (const r of tocadas) Object.assign(r, payload)
          e.updates.push({ payload, filas: tocadas.length })
          return { data: tocadas.map((r) => ({ id: r.id })), error: null }
        }
        return { data: filas(), error: null }
      }
      q.maybeSingle = async () => { const r = resolver(); return { ...r, data: r.data?.[0] ?? null } }
      q.then = (res, rej) => Promise.resolve(resolver()).then(res, rej)
      return q
    },
  }
  e.sesion = { auth: { getUser: async () => ({ data: { user: e.usuario ? { id: e.usuario, email: 'ana@mail.com' } : null } }) } }
  return e
}

globalThis.fetch = async (url, init = {}) => {
  if (String(url).includes('api.resend.com')) {
    const c = JSON.parse(init.body)
    f.mails.push({ para: c.to, desde: c.from, asunto: c.subject, html: c.html, texto: c.text })
    return { ok: true, status: 200, json: async () => ({ id: 'm' }), text: async () => '' }
  }
  throw new Error('llamada inesperada: ' + url)
}

let f
const nuevo = (o) => (f = globalThis.__f = escenario(o))
const pedir = (cuerpo) => ({ json: async () => cuerpo })
const pedirUrl = (query = '') => ({ url: `https://bahiashops.com.ar/api/admin/denuncias${query}` })

const { POST: denunciar } = await import('../src/app/api/denuncias/route.js')
const lista = await import('../src/app/api/admin/denuncias/route.js')
const { POST: descartar } = await import('../src/app/api/admin/denuncias/[productoId]/route.js')
const { validarDenuncia, resumirMotivos, haceCuanto } = await import('../src/lib/denuncias.js')

console.log('1. Qué se acepta')
ok(validarDenuncia({ producto_id: 10, motivo: 'contacto' }).ok, 'producto y motivo')
ok(!validarDenuncia({ producto_id: 10, motivo: 'spam' }).ok && !validarDenuncia({ producto_id: 10 }).ok, 'un motivo que no es de los seis, o ninguno: rechazado')
ok(!validarDenuncia({ producto_id: 'x', motivo: 'otro' }).ok && !validarDenuncia(null).ok, 'sin producto válido: rechazado')
ok(!validarDenuncia({ producto_id: 10, motivo: 'otro', comentario: 'x'.repeat(1001) }).ok, 'un comentario de más de 1000: rechazado')
ok(validarDenuncia({ producto_id: 10, motivo: 'otro', comentario: 'x'.repeat(1000) }).ok, 'de 1000: aceptado')
ok(validarDenuncia({ producto_id: 10, motivo: 'otro', comentario: '   ' }).comentario === null, 'en blanco: null')
ok(!validarDenuncia({ producto_id: 10, motivo: 'otro', comentario: { a: 1 } }).ok, 'un comentario que no es texto: rechazado')
ok(resumirMotivos([{ motivo: 'estafa' }, { motivo: 'contacto' }, { motivo: 'contacto' }]).map((m) => `${m.motivo}${m.cantidad}`).join() === 'contacto2,estafa1', 'los motivos, del más repetido al menos')
const ahora = Date.parse('2026-10-16T12:00:00Z')
ok(haceCuanto('2026-10-16T11:59:40Z', ahora) === 'hace un momento' && haceCuanto('2026-10-16T09:00:00Z', ahora) === 'hace 3 horas'
  && haceCuanto('2026-10-15T12:00:00Z', ahora) === 'hace 1 día' && haceCuanto('2026-10-12T12:00:00Z', ahora) === 'hace 4 días', 'hace cuánto')

console.log('\n2. Denunciar')
nuevo({ usuario: null })
let r = await denunciar(pedir({ producto_id: 10, motivo: 'contacto' }))
ok(r.status === 401 && f.rpc.length === 0, 'sin sesión: 401')
nuevo()
r = await denunciar(pedir({ producto_id: 10, motivo: 'nada' }))
ok(r.status === 400 && f.rpc.length === 0, 'motivo inválido: 400, no llega a la base')
r = await denunciar(pedir({ producto_id: 10, motivo: 'contacto', comentario: 'x'.repeat(1001) }))
ok(r.status === 400 && f.rpc.length === 0, 'comentario largo: 400')
nuevo()
r = await denunciar(pedir({ producto_id: 10, motivo: 'contacto', comentario: '  <img src=x onerror=alert(1)> en la foto  ', usuario_id: 'otra-persona' }))
ok(r.status === 200 && r.body.resultado === 'creada', 'creada')
const a = f.rpc[0].args
ok(f.rpc[0].nombre === 'rpc_registrar_denuncia' && a.p_usuario_id === 'u-ana' && a.p_producto_id === 10 && a.p_motivo === 'contacto', 'la persona sale de la sesión (no del cuerpo)')
ok(a.p_comentario === '<img src=x onerror=alert(1)> en la foto', 'el comentario se guarda como texto')
ok(f.mails.length === 1 && f.mails[0].para === 'notificaciones@bahiashops.com.ar', 'la primera denuncia del producto: un mail a notificaciones@')
const m = f.mails[0]
ok(m.html.includes('Taza &lt;b&gt;rara&lt;/b&gt;') && m.html.includes('Ludo &amp; Cía') && !m.html.includes('<img src=x'), 'con el producto, la tienda y el comentario escapados')
ok(m.html.includes('Tiene datos de contacto') && m.html.includes('/admin/denuncias'), 'el motivo y el link a /admin/denuncias')
ok(!m.html.includes('ana@mail.com') && !m.html.includes('u-ana') && !m.texto.includes('ana@mail.com'), 'sin decir quién denunció')
nuevo({ resultado: { resultado: 'creada', id: 2, primera: false } })
r = await denunciar(pedir({ producto_id: 10, motivo: 'estafa' }))
ok(r.status === 200 && f.mails.length === 0, 'una denuncia más del mismo producto: sin mail')
nuevo({ resultado: { resultado: 'ya_existia' } })
r = await denunciar(pedir({ producto_id: 10, motivo: 'estafa' }))
ok(r.status === 200 && r.body.resultado === 'ya_existia' && f.mails.length === 0, 'ya había denunciado: ya_existia ("Ya nos avisaste"), sin mail')
nuevo({ resultado: { resultado: 'propio' } })
r = await denunciar(pedir({ producto_id: 10, motivo: 'estafa' }))
ok(r.status === 403 && /tu tienda/.test(r.body.error), 'su propio producto: 403')
nuevo({ resultado: { resultado: 'no_disponible' } })
r = await denunciar(pedir({ producto_id: 10, motivo: 'estafa' }))
ok(r.status === 404, 'un producto que no está publicado: 404')
nuevo({ resultado: { resultado: 'limite' } })
r = await denunciar(pedir({ producto_id: 10, motivo: 'estafa' }))
ok(r.status === 429 && /10 denuncias por día/.test(r.body.error), 'pasó el límite del día: 429')
nuevo({ errorRpc: { code: 'XX000', message: 'se cayó' } })
r = await denunciar(pedir({ producto_id: 10, motivo: 'estafa' }))
ok(r.status === 500 && f.mails.length === 0, 'si la base falla: 500')
nuevo()
globalThis.fetch = async () => { throw new Error('Resend caído') }
r = await denunciar(pedir({ producto_id: 10, motivo: 'estafa' }))
ok(r.status === 200, 'si el mail falla, la denuncia queda igual (200)')
globalThis.fetch = async (url, init = {}) => { f.mails.push(JSON.parse(init.body)); return { ok: true, status: 200, text: async () => '' } }

console.log('\n3. La lista del admin')
nuevo()
r = await lista.GET(pedirUrl())
ok(r.status === 403, 'sin ser admin: 403')
nuevo({ esAdmin: true })
r = await lista.GET(pedirUrl())
ok(r.status === 200 && r.body.productos.map((p) => p.id).join() === '10,11', 'una tarjeta por producto, por la denuncia más reciente (la tienda cerrada no aparece)')
const taza = r.body.productos[0]
ok(taza.denuncias === 3, 'cuenta solo las pendientes (3; la descartada no)')
ok(taza.motivos.map((x) => `${x.motivo}×${x.cantidad}`).join() === 'contacto×2,estafa×1', 'los motivos con su cuenta, del más repetido al menos')
ok(taza.comentarios.join('|') === 'Hay un teléfono en la foto 2|<script>x</script>', 'los comentarios (como texto: la página no interpreta HTML)')
ok(taza.primera_en === '2026-10-12T10:00:00Z' && taza.ultima_en === '2026-10-15T10:00:00Z', 'la primera y la última denuncia')
ok(taza.vendedor.barrio === 'Centro' && taza.fotos.join() === 'a.webp,b.webp' && taza.categoria?.nombre === 'Hogar', 'tienda con barrio, fotos en orden y categoría')
ok(r.body.productos[1].vendedor.pausada === true, 'la tienda pausada, marcada')
ok(!JSON.stringify(r.body).includes('u-1') && !JSON.stringify(r.body).includes('usuario_id'), 'no dice quién denunció')
r = await lista.GET(pedirUrl('?conteo=1'))
ok(r.status === 200 && r.body.total === 2 && !('productos' in r.body), '?conteo=1: 2 productos con denuncias pendientes')
nuevo({ esAdmin: true, fallaLista: true })
r = await lista.GET(pedirUrl())
ok(r.status === 500 && !!r.body.error, 'si la base falla: 500 con un mensaje (no una lista vacía)')

console.log('\n4. Descartar')
const ruta = (id) => ({ params: Promise.resolve({ productoId: String(id) }) })
nuevo()
r = await descartar(pedir({ accion: 'descartar' }), ruta(10))
ok(r.status === 403, 'sin ser admin: 403')
nuevo({ esAdmin: true })
r = await descartar(pedir({ accion: 'borrar' }), ruta(10))
ok(r.status === 400, 'otra acción: 400')
r = await descartar(pedir({ accion: 'descartar' }), ruta(10))
const resueltas = f.tablas.denuncias.filter((d) => d.producto_id === 10 && d.estado === 'descartada' && d.resuelta_por === 'admin-1')
ok(r.status === 200 && r.body.descartadas === 3 && resueltas.length === 3, 'resuelve las 3 pendientes como descartadas, con quién')
ok(f.tablas.denuncias.find((d) => d.id === 2).estado === 'pendiente', 'las de otro producto no se tocan')
r = await descartar(pedir({ accion: 'descartar' }), ruta(10))
ok(r.status === 409, 'otra vez: 409 (ya no hay pendientes)')

console.log(fallas === 0 ? '\nTODO OK' : `\n${fallas} FALLAS`)
process.exit(fallas ? 1 : 0)
