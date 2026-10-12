// Prueba que /api/vendedor/pedidos NO manda al navegador los datos de contacto
// de quien compra (nombre, apellido, teléfono, dirección) si el pedido no se
// pagó, y que sí los manda si se pagó (también si se reembolsó). Corre la ruta
// de verdad contra una base de mentira: no toca Supabase ni ningún pedido real.
//
//   npm run probar:datos-pedido
//
// La base de mentira devuelve SOLO las columnas que la consulta pide (como
// PostgREST), así que la prueba también comprueba qué se le pide a la base: la
// primera lectura no puede pedir ningún dato de contacto, y la segunda solo
// puede pedir los pedidos pagados.

import { register } from 'node:module'

const raiz = new URL('../', import.meta.url)
const loader = `
const src = ${JSON.stringify(new URL('src/', raiz).href)}
const falsos = {
  'next/server': 'export const NextResponse = { json: (body, init) => ({ body, status: (init && init.status) || 200 }) }',
  '@/lib/supabase/server': 'export async function createClient() { return globalThis.__falso.sesion }',
  '@/lib/supabase/admin': 'export function getServiceRoleClient() { return globalThis.__falso.admin }',
}
export function resolve(esp, ctx, sig) {
  if (falsos[esp]) return { url: 'data:text/javascript,' + encodeURIComponent(falsos[esp]), shortCircuit: true }
  if (esp.startsWith('@/')) { const r = src + esp.slice(2); return sig(r.endsWith('.js') ? r : r + '.js', ctx) }
  return sig(esp, ctx)
}`
register('data:text/javascript,' + encodeURIComponent(loader))

let fallas = 0
const ok = (c, m) => { if (!c) { fallas++; console.log('  ✗ FALLA:', m) } else console.log('  ✓', m) }

// ── La base de mentira ──
const TIENDA = 7
const CONTACTO = { comprador_nombre: 'Marcela', comprador_apellido: 'Quiroga', comprador_telefono: '2915551234' }
const SECRETOS = ['Marcela', 'Quiroga', '2915551234', 'Brown', '2915559999', 'Alsina', '-38.7001', 'timbre azul']

const estados = ['pendiente', 'rechazado', 'cancelado', 'estado_inventado', 'pagado', 'preparando', 'franja', 'por_salir', 'despachado', 'reembolsado']
const pedidos = estados.map((estado, i) => ({
  id: 100 + i, vendedor_id: TIENDA, estado, comprador_id: `u-${i}`, creado_en: '2026-10-06T10:00:00Z',
  metodo_envio: 'envio_tienda', total: 1000, cancelado_motivo: null, vence_en: null,
  ...CONTACTO,
  direccion_copia: { calle: 'Brown', numero: '123', lat: -38.7001, lng: -62.2, referencia: 'timbre azul' },
  direccion: { calle: 'Alsina', numero: '45', piso_depto: null, telefono: '2915559999', barrio_id: 3 },
  items: [{ id: 1, nombre: 'Taza', variante: null, cantidad: 1, precio: 1000, foto_url: null }],
}))
// Un pago en efectivo en proceso con el cupón vigente: una venta en curso. Se
// ve, pero sin datos.
const DIA = 24 * 3600 * 1000
pedidos.push({ ...pedidos[0], id: 200, estado: 'pendiente', mp_payment_id: '501', efectivo_vence_en: new Date(Date.now() + 2 * DIA).toISOString(), comprador_id: 'u-0' })
// Un cupón que venció sin pagarse NO es una venta: es un carrito abandonado.
// Viaja solo a la pestaña de carritos, sin datos de contacto, tanto mientras la
// base todavía lo tiene pendiente (hay un margen de unas horas antes de
// cancelarlo) como una vez cancelado por vencido.
pedidos.push({ ...pedidos[0], id: 201, estado: 'pendiente', mp_payment_id: '502', efectivo_vence_en: new Date(Date.now() - 3600 * 1000).toISOString(), comprador_id: 'u-0' })
pedidos.push({ ...pedidos[0], id: 202, estado: 'cancelado', cancelado_motivo: 'pago_vencido', mp_payment_id: '503', efectivo_vence_en: new Date(Date.now() - 2 * DIA).toISOString(), comprador_id: 'u-0' })
// Un pedido de otra tienda: no tiene que aparecer.
pedidos.push({ ...pedidos[4], id: 999, vendedor_id: 99, estado: 'pagado' })

const datos = {
  vendedores: [{ id: TIENDA, usuario_id: 'dueno', nombre_negocio: 'Tienda de prueba' }],
  pedidos,
  usuarios: estados.map((_, i) => ({ id: `u-${i}`, nombre_usuario: `Zorro ${i}`, cerrada_en: null })),
}

// Las columnas de primer nivel que pide un select: "id, estado, items:pedido_items ( ... )".
function columnasPedidas(select) {
  const partes = []
  let actual = '', nivel = 0
  for (const c of select) {
    if (c === '(') nivel++
    if (c === ')') nivel--
    if (c === ',' && nivel === 0) { partes.push(actual); actual = '' } else actual += c
  }
  partes.push(actual)
  return partes.map((p) => p.trim()).filter(Boolean).map((p) => {
    const m = p.match(/^(\w+):\w+\s*\(/)
    return m ? m[1] : p
  })
}

function falso() {
  const consultas = []
  const admin = {
    rpc: async () => ({ error: null }),
    from(tabla) {
      const filtros = []
      let columnas = []
      const filas = () => (datos[tabla] || []).filter((r) => filtros.every((f) => f(r))).map((r) => {
        const salida = {}
        for (const c of columnas) if (c in r) salida[c] = r[c]
        return salida
      })
      const q = {
        select(s) { columnas = columnasPedidas(s); consultas.push({ tabla, select: s, columnas, filtros: filtros }); return q },
        eq(c, v) { filtros.push((r) => r[c] === v); consultas.at(-1).eq = [...(consultas.at(-1).eq || []), [c, v]]; return q },
        in(c, vs) { filtros.push((r) => vs.includes(r[c])); consultas.at(-1).in = [c, vs]; return q },
        order() { return q },
        maybeSingle: async () => ({ data: filas()[0] ?? null, error: null }),
        then(res) { return res({ data: filas(), error: null }) },
      }
      return q
    },
  }
  return { admin, sesion: { auth: { getUser: async () => ({ data: { user: { id: 'dueno' } } }) } }, consultas }
}

const { GET } = await import('../src/app/api/vendedor/pedidos/route.js')

async function llamar() {
  const f = falso()
  globalThis.__falso = f
  const r = await GET()
  return { ...r, consultas: f.consultas }
}

console.log('1. La respuesta, pedido por pedido')
const r = await llamar()
ok(r.status === 200 && Array.isArray(r.body.pedidos), 'responde 200 con la lista')
// Una venta existe solo cuando se paga: de los demás, solo viaja como venta el
// pago en efectivo en proceso. Los cupones vencidos van como carritos
// abandonados (pestana 'carritos').
const VISIBLES_SIN_PAGO = [200]
const CARRITOS = [201, 202]
const NO_VENTAS = ['pendiente', 'rechazado', 'cancelado', 'estado_inventado']
const ventas = r.body.pedidos.filter((p) => p.pestana !== 'carritos')
ok(ventas.length === 6 + VISIBLES_SIN_PAGO.length, 'como ventas viajan solo los 6 estados pagados y el pago en efectivo en proceso')
for (const estado of NO_VENTAS) {
  ok(!ventas.some((p) => p.estado === estado && p.id !== 200), `${estado}: sin pago no es una venta`)
}
ok(!JSON.stringify(r.body).includes('mp_payment_id'), 'el id del pago de MercadoPago no viaja')
ok(JSON.stringify(r.body.pedidos.filter((p) => p.pestana === 'carritos').map((p) => p.id).sort()) === JSON.stringify(CARRITOS),
  'los dos cupones vencidos (pendiente y ya cancelado) viajan como carritos abandonados, y nada más')
ok(!r.body.pedidos.some((p) => ['pendiente', 'cancelado'].includes(p.estado) && p.vence_en === null && !p.efectivo_vence_en),
  'un pendiente o cancelado sin vencimiento ni cupón no es un carrito abandonado: no viaja')
for (const id of CARRITOS) {
  const c = r.body.pedidos.find((p) => p.id === id)
  const filtrados = SECRETOS.filter((s) => JSON.stringify(c).includes(s))
  ok(c && filtrados.length === 0 && c.datos_de_contacto === 'ocultos' && c.comprador_nombre === null && c.direccion === null,
    `carrito ${id}: ningún dato de contacto${filtrados.length ? ' (se filtró: ' + filtrados.join(', ') + ')' : ''}`)
  ok(c && !!c.comprador_apodo && !('comprador_id' in c), `carrito ${id}: viaja el apodo, no el comprador_id`)
}
ok(r.body.pedidos.some((p) => p.id === 200), 'el cupón vigente sí viaja')
ok(!r.body.pedidos.some((p) => p.id === 999), 'el pedido de otra tienda no aparece')

const PAGADOS = ['pagado', 'preparando', 'franja', 'por_salir', 'despachado', 'reembolsado']
for (const estado of [...PAGADOS, 'efectivo']) {
  const p = estado === 'efectivo' ? r.body.pedidos.find((x) => x.id === 200) : r.body.pedidos.find((x) => x.estado === estado)
  const texto = JSON.stringify(p)
  if (PAGADOS.includes(estado)) {
    ok(p.datos_de_contacto === 'visibles' && p.comprador_nombre === 'Marcela' && p.comprador_apellido === 'Quiroga' && p.comprador_telefono === '2915551234'
      && p.direccion_copia?.calle === 'Brown' && p.direccion?.telefono === '2915559999',
    `${estado}: se pagó -> nombre, apellido, teléfono y dirección SÍ viajan`)
  } else {
    const filtrados = SECRETOS.filter((s) => texto.includes(s))
    ok(filtrados.length === 0, `${estado}: NO se pagó -> ninguno de los datos viaja${filtrados.length ? ' (se filtró: ' + filtrados.join(', ') + ')' : ''}`)
    ok(p.datos_de_contacto === 'ocultos' && p.comprador_nombre === null && p.comprador_telefono === null && p.direccion_copia === null && p.direccion === null,
      `${estado}: los campos de contacto vienen en null y marcados como ocultos`)
  }
  ok(!!p.comprador_apodo, `${estado}: el apodo siempre viaja`)
  ok(!('comprador_id' in p), `${estado}: el comprador_id no sale`)
}

console.log('\n2. Qué se le pide a la base')
const lecturas = r.consultas.filter((c) => c.tabla === 'pedidos')
ok(lecturas.length === 2, 'dos lecturas de pedidos: la general y la de contacto')
const [general, contacto] = lecturas
const PERSONALES = ['comprador_nombre', 'comprador_apellido', 'comprador_telefono', 'direccion_copia', 'direccion']
ok(!PERSONALES.some((c) => general.columnas.includes(c)), 'la lectura general NO pide ningún dato de contacto')
ok(/comprador_id/.test(general.select) && !/telefono|direcciones/.test(general.select), 'ni el teléfono ni la dirección embebida, en ningún nivel')
const idsPedidos = contacto.in?.[1] || []
ok(JSON.stringify([...idsPedidos].sort()) === JSON.stringify(pedidos.filter((p) => PAGADOS.includes(p.estado) && p.vendedor_id === TIENDA).map((p) => p.id).sort()),
  'la lectura de contacto es SOLO por los pedidos pagados (incluido el reembolsado), nunca por el pago en efectivo en proceso')
ok(contacto.eq?.some(([c, v]) => c === 'vendedor_id' && v === TIENDA), 'y también filtrada por la tienda')

console.log('\n3. Sin ningún pedido pagado no hay segunda lectura')
{
  const original = datos.pedidos.splice(0, datos.pedidos.length, ...pedidos.filter((p) => ['pendiente', 'rechazado', 'cancelado'].includes(p.estado) && p.vendedor_id === TIENDA))
  const solo = await llamar()
  ok(solo.consultas.filter((c) => c.tabla === 'pedidos').length === 1, 'una sola lectura: nunca se piden datos de contacto')
  ok(SECRETOS.every((s) => !JSON.stringify(solo.body).includes(s)), 'y la respuesta entera no tiene ninguno de los datos')
  datos.pedidos.splice(0, datos.pedidos.length, ...original)
}

console.log('\n4. Si falla la lectura de contacto, no se muestra una lista a medias')
{
  const f = falso()
  const desde = f.admin.from
  f.admin.from = (t) => {
    const q = desde(t)
    const alSeleccionar = q.select
    q.select = (s) => {
      const siguiente = alSeleccionar(s)
      if (t === 'pedidos' && /comprador_nombre/.test(s)) siguiente.then = (res) => res({ data: null, error: { message: 'falla de mentira' } })
      return siguiente
    }
    return q
  }
  globalThis.__falso = f
  const mal = await GET()
  ok(mal.status === 500, 'responde 500')
}

console.log('\n5. Si la tienda tiene MercadoPago conectado (para "Recordarle")')
{
  datos.mercadopago_cuentas = [{ vendedor_id: TIENDA, access_token: 'NO_DEBE_SALIR' }]
  let con = await llamar()
  ok(con.status === 200 && con.body.mp_conectado === true, 'con la fila en mercadopago_cuentas: mp_conectado = true')
  ok(!JSON.stringify(con.body).includes('NO_DEBE_SALIR'), 'sin ningún token en la respuesta')
  datos.mercadopago_cuentas = [{ vendedor_id: 99 }]
  con = await llamar()
  ok(con.status === 200 && con.body.mp_conectado === false, 'sin fila de esta tienda (aunque otra tenga): mp_conectado = false')
  ok(con.body.pedidos.some((p) => p.pestana === 'carritos'), 'y los carritos llegan igual')
  delete datos.mercadopago_cuentas
}

console.log('\n6. La ruta de recordar también lo verifica')
{
  const { POST } = await import('../src/app/api/vendedor/pedidos/recordar/route.js')
  const recordar = (pedidoId) => { globalThis.__falso = falso(); return POST({ json: async () => ({ pedidoId }) }) }
  datos.mercadopago_cuentas = [{ vendedor_id: 99 }]
  let rr = await recordar(202)
  ok(rr.status === 400 && rr.body.codigo === 'SIN_MP' && rr.body.error === 'Conectá tu cuenta de MercadoPago para poder recordarle.', 'sin MercadoPago: 400 con "Conectá tu cuenta de MercadoPago para poder recordarle." y no manda nada')
  datos.mercadopago_cuentas = [{ vendedor_id: TIENDA }]
  rr = await recordar(202)
  // Pasa la verificación y sigue: acá frena porque en la base de mentira quien
  // compró no tiene mail.
  ok(rr.status === 409 && rr.body.codigo !== 'SIN_MP' && /contactar/.test(rr.body.error), 'con MercadoPago: pasa la verificación y sigue como siempre')
  rr = await recordar(104)
  ok(rr.status === 409 && /no es un carrito/.test(rr.body.error), 'un pedido que no es carrito sigue dando su propio error')
  delete datos.mercadopago_cuentas
}

console.log('\n7. El cartel del panel')
{
  const { readFileSync } = await import('node:fs')
  const pantalla = readFileSync(new URL('../src/app/vendedor/pedidos/page.jsx', import.meta.url), 'utf8')
  ok(pantalla.includes('No tenés ninguna cuenta de MercadoPago conectada. Conectá tu cuenta de MercadoPago para poder recordarle al comprador que haga su compra.'), 'el cartel dice el texto pedido')
  ok(/<Link href="\/vendedor\/perfil"[\s\S]{0,200}Conectar MercadoPago/.test(pantalla), 'con un botón a /vendedor/perfil')
  ok(/if \(mpConectado === false\) \{\s*setSinMpModal\(true\);\s*return;/.test(pantalla), 'sin MercadoPago, "Recordarle" abre el cartel y no llama a la ruta')
  ok(/datos\.codigo === 'SIN_MP'/.test(pantalla), 'y si el servidor lo frena (SIN_MP), también lo muestra')
}

console.log(fallas === 0 ? '\nTODO OK' : `\n${fallas} FALLAS`)
process.exit(fallas ? 1 : 0)
