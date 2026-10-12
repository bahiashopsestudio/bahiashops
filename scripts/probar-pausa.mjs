// Prueba pausar y reactivar la tienda, con las rutas REALES y una base y un
// MercadoPago de mentira:
//
//   · /api/vendedor/pausa: pausar (guarda pausada_en y el mensaje, manda el
//     mail), no pausar dos veces, cambiar el mensaje, reactivar (avisa si
//     MercadoPago necesita reconectarse) y el estado;
//   · vendedorVendible: la regla de "esta tienda puede vender";
//   · /api/pedidos/crear, /api/envio/cotizar y «Pagar ahora» rechazan una
//     tienda pausada;
//   · los listados públicos filtran las tiendas pausadas y sus productos;
//   · el mail de pausa.
//
// La base de verdad (RLS y el disparador que rechaza pedidos) se prueba con
// npm run probar:030.
//
//   npm run probar:pausa
//
// No toca MercadoPago, Resend ni Supabase.

import { register } from 'node:module'

process.env.RESEND_API_KEY = 'clave-de-mentira'

const raiz = new URL('../', import.meta.url)
const loader = `
const src = ${JSON.stringify(new URL('src/', raiz).href)}
const falsos = {
  'next/server': 'export const NextResponse = { json: (body, init) => ({ body, status: (init && init.status) || 200 }) }',
  '@/lib/supabase/server': 'export async function createClient() { return globalThis.__f.sesion }',
  '@/lib/supabase/admin': 'export function getServiceRoleClient() { return globalThis.__f.admin }',
  '@supabase/supabase-js': 'export function createClient() { return globalThis.__f.admin }',
  '@/lib/mercadopago/tokens': 'async function getCuentaValida() { const e = globalThis.__f.errorToken; if (e) throw new Error(e); return { accessToken: "TOKEN", mpUserId: "111" } } export { getCuentaValida }; export async function getValidAccessToken(...a) { return (await getCuentaValida(...a)).accessToken }',
}
export function resolve(esp, ctx, sig) {
  if (falsos[esp]) return { url: 'data:text/javascript,' + encodeURIComponent(falsos[esp]), shortCircuit: true }
  if (esp.startsWith('@/')) { const r = src + esp.slice(2); return sig(r.endsWith('.js') ? r : r + '.js', ctx) }
  return sig(esp, ctx)
}`
register('data:text/javascript,' + encodeURIComponent(loader))

let fallas = 0
const ok = (c, m) => { if (!c) { fallas++; console.log('  ✗ FALLA:', m) } else console.log('  ✓', m) }
console.log = ((log) => (...a) => { if (typeof a[0] === 'string' && /^ {2}[✓✗]|^\d+\.|^\n?\d+\.|TODO OK|FALLAS/.test(a[0].trimStart() ? a[0] : '')) log(...a) })(console.log)
console.warn = () => {}
console.error = () => {}

const EMAIL = 'vendedora@correo.test'
const HOY = Date.now()
const DIA = 86400000

// ── La base de mentira ──
function escenario(opciones = {}) {
  const e = {
    tablas: {
      vendedores: [{ id: 1, usuario_id: 'u-1', nombre_negocio: 'Ludoméstica', bloqueado: false, estado_validacion: 'aprobado', pausada_en: null, mensaje_pausa: null, cerrada_en: null, latitud: -38.7, longitud: -62.2, metodos_entrega_default: ['retiro'], costos_envio_zona: null }],
      productos: [
        { id: 10, vendedor_id: 1, estado: 'activo' }, { id: 11, vendedor_id: 1, estado: 'activo' },
        { id: 12, vendedor_id: 1, estado: 'pausado' },
      ],
      pedidos: [
        { id: 100, vendedor_id: 1, estado: 'pagado' }, { id: 101, vendedor_id: 1, estado: 'despachado' },
      ],
      mercadopago_cuentas: [{ vendedor_id: 1, mp_user_id: '111', token_expira_en: new Date(HOY + 90 * DIA).toISOString() }],
      direcciones: [],
    },
    updates: [], mails: [],
    errorToken: null,
    ...opciones,
  }
  if (opciones.vendedor) Object.assign(e.tablas.vendedores[0], opciones.vendedor)
  if (opciones.sinMp) e.tablas.mercadopago_cuentas = []

  e.admin = {
    from(nombre) {
      const filtros = []
      let op = 'select'
      let payload = null
      let opciones = {}
      const filas = () => (e.tablas[nombre] || []).filter((r) => filtros.every((f) => f(r)))
      const q = {
        select(_, opts) { if (opts) opciones = opts; return q },
        eq(c, v) { filtros.push((r) => r[c] === v); return q },
        in(c, vs) { filtros.push((r) => vs.includes(r[c])); return q },
        is(c, v) { filtros.push((r) => (r[c] ?? null) === v); return q },
        not(c, o, v) { filtros.push((r) => (r[c] ?? null) !== v); return q },
        order() { return q },
        update(p) { op = 'update'; payload = p; return q },
      }
      const resolver = () => {
        if (op === 'update') {
          const tocadas = filas()
          for (const r of tocadas) Object.assign(r, payload)
          e.updates.push({ tabla: nombre, payload, filas: tocadas.length })
          return { data: tocadas.map((r) => ({ ...r })), error: null }
        }
        if (opciones.head) return { data: null, count: filas().length, error: null }
        return { data: filas().map((r) => ({ ...r })), error: null }
      }
      q.maybeSingle = async () => { const r = resolver(); return { ...r, data: Array.isArray(r.data) ? r.data[0] ?? null : r.data } }
      q.single = q.maybeSingle
      q.then = (res, rej) => Promise.resolve(resolver()).then(res, rej)
      return q
    },
  }
  e.sesion = { auth: { getUser: async () => ({ data: { user: { id: 'u-1', email: EMAIL } } }) } }
  return e
}

globalThis.fetch = async (url, init = {}) => {
  if (String(url).includes('api.resend.com')) {
    const c = JSON.parse(init.body)
    f.mails.push({ para: c.to, asunto: c.subject, html: c.html, texto: c.text })
    return { ok: true, status: 200, json: async () => ({ id: 'm' }), text: async () => '' }
  }
  throw new Error('llamada inesperada: ' + url)
}

let f
const nuevo = (o) => (f = globalThis.__f = escenario(o))
const pedir = (cuerpo) => ({ json: async () => cuerpo })
const tienda = () => f.tablas.vendedores[0]

const pausa = await import('../src/app/api/vendedor/pausa/route.js')
const { POST: crear } = await import('../src/app/api/pedidos/crear/route.js')
const { POST: cotizar } = await import('../src/app/api/envio/cotizar/route.js')
const { vendedorVendible, MOTIVOS_NO_VENDIBLE } = await import('../src/lib/vendedorVendible.js')
const { evaluarPagarAhora } = await import('../src/lib/pagarAhora.js')
const { validarMensajePausa, fechaDePausa, mpNecesitaReconectar } = await import('../src/lib/pausaTienda.js')
const { armarMailPausa } = await import('../src/lib/mailsPausa.js')
const publicos = await import('../src/lib/vendedoresPublicos.js')

console.log('1. Pausar')
nuevo()
let r = await pausa.POST(pedir({ mensaje: '  Estamos de vacaciones,   volvemos el 15 de febrero.  ' }))
ok(r.status === 200 && r.body.pausada === true, 'responde ok y pausada')
ok(!!tienda().pausada_en && Math.abs(Date.parse(tienda().pausada_en) - Date.now()) < 5000, 'pausada_en se guarda con la hora de ahora')
ok(tienda().mensaje_pausa === 'Estamos de vacaciones, volvemos el 15 de febrero.', 'el mensaje se guarda, sin espacios de más')
ok(f.mails.length === 1 && f.mails[0].para === EMAIL && f.mails[0].asunto === 'Pausaste tu tienda', 'un mail "Pausaste tu tienda" a la dirección de la cuenta')
ok(f.tablas.pedidos.every((p) => ['pagado', 'despachado'].includes(p.estado)), 'no toca ningún pedido')
ok(f.updates.every((u) => u.tabla === 'vendedores'), 'solo escribe en vendedores (ni pedidos ni MercadoPago)')

r = await pausa.POST(pedir({ mensaje: 'otra vez' }))
ok(r.status === 409 && r.body.error === 'Tu tienda ya está pausada.', 'pausar una tienda ya pausada: error 409')
ok(f.mails.length === 1 && tienda().mensaje_pausa.startsWith('Estamos'), 'y no cambia nada ni manda otro mail')

nuevo()
r = await pausa.POST(pedir({}))
ok(r.status === 200 && tienda().mensaje_pausa === null, 'sin mensaje: se pausa igual, con mensaje null')
nuevo()
r = await pausa.POST(pedir({ mensaje: 'x'.repeat(201) }))
ok(r.status === 400 && !tienda().pausada_en, 'un mensaje de 201 caracteres: 400 y no se pausa')
r = await pausa.POST(pedir({ mensaje: 'Escribinos al 2915123456' }))
ok(r.status === 400 && /teléfonos/.test(r.body.error), 'un mensaje con un teléfono: 400')
r = await pausa.POST(pedir({ mensaje: 'Seguinos en www.ludomestica.com' }))
ok(r.status === 400, "con un link: 400")
r = await pausa.POST(pedir({ mensaje: "Volvemos el 15. Gracias por todo, nos vemos pronto." }))
ok(r.status === 200, "un mensaje normal, con puntos y números de fecha: se acepta")
nuevo()
r = await pausa.POST(null)
ok(r.status === 200, 'sin cuerpo: se pausa sin mensaje')

console.log('\n2. Cambiar el mensaje')
nuevo({ vendedor: { pausada_en: new Date(HOY - 3 * DIA).toISOString(), mensaje_pausa: 'Vuelvo pronto' } })
r = await pausa.PATCH(pedir({ mensaje: 'Volvemos en marzo' }))
ok(r.status === 200 && r.body.mensaje_pausa === 'Volvemos en marzo' && tienda().mensaje_pausa === 'Volvemos en marzo', 'estando pausada: OK, se guarda')
ok(Date.parse(tienda().pausada_en) < HOY - 2 * DIA, 'y no cambia desde cuándo está pausada')
r = await pausa.PATCH(pedir({ mensaje: '' }))
ok(r.status === 200 && tienda().mensaje_pausa === null, 'vacío: borra el mensaje')
nuevo()
r = await pausa.PATCH(pedir({ mensaje: 'hola' }))
ok(r.status === 409 && r.body.error === 'Tu tienda no está pausada.' && tienda().mensaje_pausa === null, 'con la tienda activa: 409 y no guarda nada')

console.log('\n3. Reactivar')
nuevo({ vendedor: { pausada_en: new Date(HOY - DIA).toISOString(), mensaje_pausa: 'Vuelvo pronto' } })
r = await pausa.DELETE()
ok(r.status === 200 && r.body.pausada === false && tienda().pausada_en === null && tienda().mensaje_pausa === null, 'quita pausada_en y el mensaje')
ok(r.body.mp_necesita_reconectar === false, 'MercadoPago anda: sin aviso')
ok(f.mails.length === 0, 'no manda mail')
nuevo({ vendedor: { pausada_en: new Date(HOY - DIA).toISOString() }, errorToken: 'REFRESH_RECHAZADO' })
r = await pausa.DELETE()
ok(r.status === 200 && tienda().pausada_en === null && r.body.mp_necesita_reconectar === true, 'el token de MercadoPago venció: reactiva IGUAL y avisa que hay que reconectar')
nuevo({ vendedor: { pausada_en: new Date(HOY - DIA).toISOString() }, errorToken: 'VENDEDOR_SIN_MP', sinMp: true })
r = await pausa.DELETE()
ok(r.status === 200 && r.body.mp_necesita_reconectar === false, 'sin ninguna cuenta: no hay nada que reconectar (el panel ya muestra "Conectar")')
nuevo()
r = await pausa.DELETE()
ok(r.status === 409, 'reactivar una tienda activa: 409')

console.log('\n4. El estado (GET)')
nuevo()
r = await pausa.GET()
ok(r.status === 200 && r.body.pausada === false && r.body.pausada_en === null, 'activa: pausada false')
ok(r.body.productos_visibles === 2, 'cuántos productos dejan de verse (los activos: 2)')
ok(r.body.pedidos_para_entregar === 1, 'cuántos pedidos le quedan por entregar (1: el pagado; el despachado no)')
nuevo({ vendedor: { pausada_en: '2026-10-04T15:00:00Z', mensaje_pausa: 'Vuelvo pronto' } })
f.tablas.mercadopago_cuentas[0].token_expira_en = new Date(HOY - DIA).toISOString()
r = await pausa.GET()
ok(r.body.pausada === true && r.body.pausada_en === '2026-10-04T15:00:00Z' && r.body.mensaje_pausa === 'Vuelvo pronto', 'pausada: desde cuándo y el mensaje')
ok(r.body.mp_necesita_reconectar === true, 'con el permiso de MercadoPago vencido: avisa')
ok(!JSON.stringify(r.body).includes('TOKEN'), 'sin tokens en la respuesta')
globalThis.__f.sesion = { auth: { getUser: async () => ({ data: { user: null } }) } }
r = await pausa.GET()
ok(r.status === 401, 'sin sesión: 401')

console.log('\n5. vendedorVendible')
const activa = { id: 1, bloqueado: false, estado_validacion: 'aprobado', pausada_en: null, cerrada_en: null }
const cuenta = { vendedor_id: 1 }
ok(vendedorVendible(activa, cuenta).vendible === true && vendedorVendible(activa, cuenta).motivo === null, 'activa y con MercadoPago: vendible')
ok(vendedorVendible({ ...activa, pausada_en: '2026-10-04T15:00:00Z' }, cuenta).motivo === MOTIVOS_NO_VENDIBLE.PAUSADA, 'pausada: no vendible (PAUSADA)')
ok(vendedorVendible({ ...activa, cerrada_en: '2026-10-04T15:00:00Z' }, cuenta).motivo === 'CERRADA', 'cerrada: CERRADA')
ok(vendedorVendible(activa, null).motivo === 'SIN_MP', 'sin fila en mercadopago_cuentas: SIN_MP')
ok(vendedorVendible({ ...activa, bloqueado: true }, cuenta).motivo === 'BLOQUEADA', 'bloqueada: BLOQUEADA')
ok(vendedorVendible({ ...activa, estado_validacion: 'pendiente' }, cuenta).motivo === 'NO_PUBLICADA', 'sin publicar: NO_PUBLICADA')
ok(vendedorVendible(null, cuenta).motivo === 'NO_EXISTE', 'inexistente: NO_EXISTE')
ok(vendedorVendible({ ...activa, pausada_en: 'x', cerrada_en: 'y' }, null).motivo === 'CERRADA', 'cerrada y pausada y sin MP: sale el más grave (CERRADA)')

console.log('\n6. Las compras a una tienda pausada')
const compra = { vendedorId: 1, items: [{ productoId: 10, cantidad: 1, precio: 100 }], metodoEnvio: 'retiro' }
nuevo({ vendedor: { pausada_en: new Date().toISOString() } })
r = await crear(pedir(compra))
ok(r.status === 409 && r.body.error === 'Esta tienda no está recibiendo pedidos.' && r.body.codigo === 'NO_DISPONIBLE', 'crear pedido: 409, "Esta tienda no está recibiendo pedidos." (NO_DISPONIBLE, para la pantalla del checkout)')
ok(r.body.productos_no_disponibles?.join(',') === '10', 'con los productos que ya no se pueden comprar')
ok(!f.updates.length, 'y no escribe nada')
nuevo({ vendedor: { bloqueado: true } })
r = await crear(pedir(compra))
ok(r.status === 409 && r.body.error === 'Algunos productos de este pedido ya no están disponibles.', 'bloqueada: sigue sin decir por qué')
nuevo({ sinMp: true })
r = await crear(pedir(compra))
ok(r.status === 400 && r.body.error === 'Este vendedor no tiene MercadoPago conectado.', 'sin MercadoPago: el mensaje de siempre')
nuevo({ vendedor: { pausada_en: new Date().toISOString() } })
r = await cotizar(pedir({ vendedorId: 1, direccionId: 5 }))
ok(r.status === 404 && r.body.error === 'Esta tienda no está recibiendo pedidos.', 'cotizar el envío: 404 con el mismo mensaje')
nuevo()
r = await cotizar(pedir({ vendedorId: 1, direccionId: 5 }))
ok(r.body?.error !== 'Esta tienda no está recibiendo pedidos.', 'activa: cotizar sigue de largo')
const pedidoConCupon = { comprador_id: 'c', estado: 'pendiente', mp_payment_id: '501', efectivo_vence_en: new Date(HOY + 2 * DIA).toISOString(), mp_user_id_cobro: '111' }
let v = evaluarPagarAhora({ pedido: pedidoConCupon, vendedor: { ...activa, pausada_en: 'x' }, cuentaMp: { mp_user_id: '111' }, usuarioId: 'c' })
ok(!v.ok && v.codigo === 'TIENDA_NO_DISPONIBLE' && /no está recibiendo pedidos/.test(v.error), '«Pagar ahora» con la tienda pausada: no arma un link nuevo')
v = evaluarPagarAhora({ pedido: pedidoConCupon, vendedor: activa, cuentaMp: { mp_user_id: '111' }, usuarioId: 'c' })
ok(v.ok, '«Pagar ahora» con la tienda activa: sigue andando')

console.log('\n7. Reactivar vuelve a dejar comprar')
nuevo({ vendedor: { pausada_en: new Date().toISOString() } })
await pausa.DELETE()
r = await crear(pedir(compra))
ok(r.body?.error !== 'Esta tienda no está recibiendo pedidos.', 'después de reactivar, crear pedido pasa la verificación de la tienda')

console.log('\n8. Los listados públicos')
const registro = () => { const llamadas = []; const q = new Proxy({}, { get: (_, m) => (...a) => { llamadas.push([m, ...a]); return q } }); return { q, llamadas } }
let reg = registro()
publicos.soloVendedoresPublicados(reg.q)
ok(reg.llamadas.some(([m, c, v]) => m === 'is' && c === 'pausada_en' && v === null) && reg.llamadas.some(([m, c]) => m === 'is' && c === 'cerrada_en'), 'listados de tiendas (inicio, mapa, búsqueda): sin pausadas ni cerradas')
reg = registro()
publicos.soloProductosPublicados(reg.q)
ok(reg.llamadas.some(([m, c, v]) => m === 'is' && c === 'vendedor.pausada_en' && v === null) && reg.llamadas.some(([m, c]) => m === 'is' && c === 'vendedor.cerrada_en'), 'listados de productos: sin los de tiendas pausadas ni cerradas')
reg = registro()
publicos.soloVendedoresConFicha(reg.q)
ok(!reg.llamadas.some(([, c]) => c === 'pausada_en') && reg.llamadas.some(([m, c]) => m === 'is' && c === 'cerrada_en'), 'la ficha: la pausada sí (con el cartel), la cerrada no')
ok(publicos.vendedorPublicado({ bloqueado: false, estado_validacion: 'aprobado', pausada_en: null, cerrada_en: null }) === true, 'vendedorPublicado: activa sí')
ok(publicos.vendedorPublicado({ bloqueado: false, estado_validacion: 'aprobado', pausada_en: '2026-10-04', cerrada_en: null }) === false, 'pausada no')
ok(publicos.CAMPOS_VISIBILIDAD.includes('pausada_en') && publicos.CAMPOS_VISIBILIDAD.includes('cerrada_en'), 'CAMPOS_VISIBILIDAD pide las columnas')

console.log('\n9. El mail')
let m = armarMailPausa({ tienda: 'Ludoméstica', mensaje: 'Volvemos en marzo' })
ok(m.asunto === 'Pausaste tu tienda', `asunto: "${m.asunto}"`)
ok(m.texto.includes('Tu tienda Ludoméstica dejó de verse y no va a recibir pedidos nuevos. Tus productos y tus datos están guardados.'), 'el cuerpo pedido')
ok(m.html.includes('Reactivar mi tienda') && m.html.includes('https://bahiashops.com.ar/vendedor/perfil') && m.html.includes('background-color:#4164fe'), 'botón azul "Reactivar mi tienda" a /vendedor/perfil')
ok(m.html.includes('Fraunces') && m.html.includes('Poppins') && m.html.includes('#faf9f7'), 'estilo de Bahía Shops (Fraunces, Poppins, fondo #faf9f7)')
ok(!/si no fuiste vos/i.test(m.texto) && !/respond/i.test(m.texto), 'sin "si no fuiste vos, respondé este mail"')
ok(m.texto.includes('Bahía Blanca, Argentina'), 'con el pie de Bahía Shops')
ok(m.texto.includes('Volvemos en marzo'), 'con el mensaje que dejó')
m = armarMailPausa({ tienda: '<b>Lo de "Pepa" & Co</b>', mensaje: '<script>x</script>' })
ok(!m.html.includes('<b>Lo de') && !m.html.includes('<script>') && m.html.includes('&lt;b&gt;Lo de &quot;Pepa&quot; &amp; Co&lt;/b&gt;'), 'escapa el nombre y el mensaje')
m = armarMailPausa({ tienda: 'Ludoméstica' })
ok(!m.texto.includes('va a ver tu mensaje'), 'sin mensaje: no lo menciona')

console.log('\n10. Las piezas sueltas')
ok(validarMensajePausa('').mensaje === null && validarMensajePausa(undefined).ok, 'mensaje vacío o ausente: null')
ok(validarMensajePausa('x'.repeat(200)).ok && !validarMensajePausa('x'.repeat(201)).ok, 'hasta 200 caracteres')
ok(!validarMensajePausa(42).ok, 'algo que no es texto: no')
ok(fechaDePausa('2026-10-04T15:00:00Z', Date.parse('2026-10-12T12:00:00Z')) === '4 de octubre', 'la fecha: "4 de octubre"')
ok(fechaDePausa('2025-12-31T15:00:00Z', Date.parse('2026-10-12T12:00:00Z')) === '31 de diciembre de 2025', 'de otro año: con el año')
ok(mpNecesitaReconectar(null) === false && mpNecesitaReconectar({ token_expira_en: new Date(HOY - 1000).toISOString() }) === true, 'reconectar: solo con una cuenta vencida')

console.log(fallas === 0 ? '\nTODO OK' : `\n${fallas} FALLAS`)
process.exit(fallas ? 1 : 0)
