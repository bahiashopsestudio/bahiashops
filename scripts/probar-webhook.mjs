// Prueba, con la ruta REAL del webhook de MercadoPago y una base y un
// MercadoPago de mentira, qué pasa con cada pago que llega:
//
//   · un cupón en efectivo recién generado deja el pedido pendiente, con el pago
//     y la fecha hasta la que vale (la del pago, como instante absoluto);
//   · un pago aprobado sobre un pedido que el vencimiento canceló lo REVIVE: una
//     venta existe cuando se paga;
//   · un segundo pago aprobado sobre un pedido ya pagado NO lo toca: queda en
//     pagos_dobles y avisa una sola vez;
//   · los pedidos cancelados por otra razón siguen sin admitir pagos;
//   · un cupón que MercadoPago cancela por vencido vence el pedido;
//   · los pagos a la cuenta de la plataforma (suscripciones del plan, 048) van
//     por su camino y no mandan el aviso de «pago sin resolver»; un aviso de
//     suscripción se sincroniza con la API.
//
//   npm run probar:webhook
//
// No toca MercadoPago, Resend ni Supabase.

import { register } from 'node:module'

delete process.env.MP_WEBHOOK_SECRET
process.env.RESEND_API_KEY = 'clave-de-mentira'

const raiz = new URL('../', import.meta.url)
const loader = `
const src = ${JSON.stringify(new URL('src/', raiz).href)}
const falsos = {
  'next/server': 'export const NextResponse = { json: (body, init) => ({ body, status: (init && init.status) || 200 }) }',
  '@supabase/supabase-js': 'export function createClient() { return globalThis.__f.admin }',
  '@/lib/mailsPedidos': 'export const avisarPago = (a) => globalThis.__f.avisarPago(a); export const avisarPagoTardio = (a) => globalThis.__f.avisarPagoTardio(a); export const avisarPagoSinResolver = (a) => globalThis.__f.avisarPagoSinResolver(a); export const avisarPagoDoble = (a) => globalThis.__f.avisarPagoDoble(a)',
}
export function resolve(esp, ctx, sig) {
  if (falsos[esp]) return { url: 'data:text/javascript,' + encodeURIComponent(falsos[esp]), shortCircuit: true }
  if (esp.startsWith('@/')) { const r = src + esp.slice(2); return sig(r.endsWith('.js') ? r : r + '.js', ctx) }
  if (esp.startsWith('./') && !esp.endsWith('.js')) return sig(esp + '.js', ctx)
  return sig(esp, ctx)
}`
register('data:text/javascript,' + encodeURIComponent(loader))

let fallas = 0
const ok = (c, m) => { if (!c) { fallas++; console.log('  ✗ FALLA:', m) } else console.log('  ✓', m) }

const SILENCIO = process.env.VER_LOGS ? null : () => {}
if (SILENCIO) { console.log = SILENCIO; console.warn = SILENCIO; console.error = SILENCIO }
const mostrar = (...a) => process.stdout.write(a.join(' ') + '\n')
const okv = (c, m) => { if (!c) { fallas++; mostrar('  ✗ FALLA:', m) } else mostrar('  ✓', m) }
const titulo = (t) => mostrar(t)

// ── La base de mentira: filas en memoria con eq / in / neq / or / not ──
function partirOr(texto) {
  const partes = []
  let nivel = 0
  let actual = ''
  for (const c of texto) {
    if (c === '(') nivel++
    if (c === ')') nivel--
    if (c === ',' && nivel === 0) { partes.push(actual); actual = '' } else actual += c
  }
  if (actual) partes.push(actual)
  return partes
}
function condicionOr(parte) {
  const [columna, operador, ...resto] = parte.split('.')
  const valor = resto.join('.')
  if (operador === 'is' && valor === 'null') return (r) => r[columna] === null || r[columna] === undefined
  if (operador === 'eq') return (r) => String(r[columna]) === valor
  if (operador === 'in') {
    const lista = valor.replace(/^\(|\)$/g, '').split(',')
    return (r) => lista.includes(String(r[columna]))
  }
  throw new Error('or no soportado: ' + parte)
}

function crearBase(inicial) {
  const tablas = {
    pedidos: inicial.pedidos.map((p) => ({ aviso_vendedor_en: null, aviso_comprador_en: null, efectivo_vence_en: null, cancelado_motivo: null, mp_payment_id: null, creado_en: '2026-10-09T15:00:00.000Z', vendedor_id: 15, total: 1000, ...p })),
    pagos_dobles: [],
    mercadopago_cuentas: [{ vendedor_id: 15, access_token: 'TOKEN-15', mp_user_id: '111' }],
    vendedor_suscripciones: [],
    suscripcion_diferencias: [],
  }
  const escrituras = []
  const rpcs = []
  const base = {
    tablas, escrituras, rpcs,
    antesDeActualizar: null,
    respuestaRpc: { ok: true },
    async rpc(nombre, args) { rpcs.push({ nombre, args }); return { data: base.respuestaRpc, error: null } },
    from(nombre) {
      let op = 'select'
      let payload = null
      const filtros = []
      let columnas = null
      const q = {
        select(c) { if (op === 'select') columnas = String(c).split(',').map((x) => x.trim()); else columnas = String(c).split(',').map((x) => x.trim()); return q },
        eq(c, v) { filtros.push((r) => String(r[c]) === String(v)); return q },
        neq(c, v) { filtros.push((r) => String(r[c]) !== String(v)); return q },
        in(c, vs) { filtros.push((r) => vs.map(String).includes(String(r[c]))); return q },
        or(texto) { const conds = partirOr(texto).map(condicionOr); filtros.push((r) => conds.some((f) => f(r))); return q },
        not() { return q },
        update(p) { op = 'update'; payload = p; return q },
        insert(p) { op = 'insert'; payload = p; return q },
      }
      const proyectar = (fila) => {
        if (!fila || !columnas || columnas.includes('*')) return fila
        const salida = {}
        for (const c of columnas) if (c in fila) salida[c] = fila[c]
        return salida
      }
      const filas = () => tablas[nombre].filter((r) => filtros.every((f) => f(r)))
      const resolver = () => {
        if (op === 'insert') {
          if (nombre === 'pagos_dobles' && tablas.pagos_dobles.some((r) => r.pedido_id === payload.pedido_id && r.pago_id === payload.pago_id)) {
            return { data: null, error: { code: '23505', message: 'duplicate key' } }
          }
          tablas[nombre].push({ ...payload })
          escrituras.push({ tabla: nombre, op: 'insert', payload })
          return { data: null, error: null }
        }
        if (op === 'update') {
          if (base.antesDeActualizar) { const h = base.antesDeActualizar; base.antesDeActualizar = null; h(tablas) }
          const objetivo = filas()
          for (const r of objetivo) Object.assign(r, payload)
          if (objetivo.length > 0) escrituras.push({ tabla: nombre, op: 'update', payload })
          return { data: objetivo.length ? proyectar(objetivo[0]) : null, error: null }
        }
        return { data: proyectar(filas()[0] || null), error: null }
      }
      q.maybeSingle = async () => resolver()
      q.single = async () => resolver()
      q.then = (res) => res(op === 'select' ? { data: filas().map(proyectar), error: null } : resolver())
      return q
    },
  }
  return base
}

let f
function escenario(pedidos, pagos, opciones = {}) {
  const e = {
    admin: crearBase({ pedidos }),
    pagos,
    avisos: { pago: [], tardio: [], sinResolver: [], doble: [] },
    mailDobleOk: true,
    ...opciones,
  }
  e.avisarPago = async (a) => { e.avisos.pago.push(a.pedidoId); return {} }
  e.avisarPagoTardio = async (a) => { e.avisos.tardio.push(a.pedidoId); return {} }
  e.avisarPagoSinResolver = async (a) => { e.avisos.sinResolver.push(a.pagoId); return {} }
  e.avisarPagoDoble = async (a) => { e.avisos.doble.push({ pedidoId: a.pedidoId, pagoNuevo: a.pagoNuevo.id }); return { enviado: e.mailDobleOk } }
  return e
}

globalThis.fetch = async (url, init = {}) => {
  const m = String(url).match(/\/v1\/payments\/(.+)$/)
  if (m) {
    const pago = f.pagos[decodeURIComponent(m[1])]
    // Un pago a la plataforma solo lo ve su token.
    const conToken = (init.headers?.Authorization || '') === 'Bearer TOKEN-PLAT'
    if (pago && (!pago.dePlataforma || conToken || pago.loVeLaTienda)) return { ok: true, status: 200, json: async () => pago }
    return { ok: false, status: 404, json: async () => ({}) }
  }
  const pre = String(url).match(/\/preapproval\/([^/?]+)$/)
  if (pre && init.method === 'PUT') { (f.puts ||= []).push({ id: pre[1], cuerpo: JSON.parse(init.body) }); return { ok: true, status: 200, json: async () => ({}) } }
  if (pre && f.preapprovals?.[pre[1]]) return { ok: true, status: 200, json: async () => f.preapprovals[pre[1]] }
  if (/\/authorized_payments\/search/.test(String(url))) return { ok: true, status: 200, json: async () => ({ results: f.cobros || [] }) }
  throw new Error('llamada inesperada: ' + url)
}

const { POST: webhook } = await import('../src/app/api/mercadopago/webhook/route.js')
const { validarPago } = await import('../src/lib/validarPago.js')
const { armarMailPagoDoble } = await import('../src/lib/mailsPedidos.js')

const avisar = (id) => webhook({ json: async () => ({ type: 'payment', action: 'payment.updated', data: { id: String(id) }, user_id: '111', live_mode: true }), headers: { get: () => null } })
const pedido = (id) => f.admin.tablas.pedidos.find((p) => p.id === id)

const pagoBase = { currency_id: 'ARS', collector_id: 111, transaction_amount: 1000, external_reference: '1' }
const cupon = (id, extra = {}) => ({ ...pagoBase, id, status: 'pending', status_detail: 'pending_waiting_payment', payment_type_id: 'ticket', date_of_expiration: '2026-10-12T22:59:59.000-04:00', ...extra })
const aprobado = (id, extra = {}) => ({ ...pagoBase, id, status: 'approved', status_detail: 'accredited', payment_type_id: 'credit_card', ...extra })

titulo('1. Un cupón en efectivo recién generado')
f = globalThis.__f = escenario([{ id: 1, estado: 'pendiente' }], { 501: cupon(501) })
await avisar(501)
okv(pedido(1).estado === 'pendiente' && pedido(1).mp_payment_id === '501', 'el pedido sigue pendiente, con el pago guardado')
okv(pedido(1).efectivo_vence_en === '2026-10-13T02:59:59.000Z', 'efectivo_vence_en es el instante absoluto del pago (22:59:59 de -04:00 = 23:59:59 de Argentina)')
okv(f.avisos.pago.length === 0, 'no se avisa de ninguna venta: todavía no se pagó')

await avisar(501)
okv(f.admin.escrituras.length === 1, 'el mismo aviso otra vez no vuelve a escribir')

f = globalThis.__f = escenario([{ id: 1, estado: 'pendiente', creado_en: '2026-10-09T15:00:00.000Z' }], { 502: cupon(502, { date_of_expiration: undefined }) })
await avisar(502)
okv(pedido(1).efectivo_vence_en === new Date(Date.parse('2026-10-13T02:59:59.000Z')).toISOString(), 'sin date_of_expiration: respaldo = final del día argentino de la creación + 3 días (12/10 23:59:59)')

titulo('\n2. El cupón se paga')
f = globalThis.__f = escenario([{ id: 1, estado: 'pendiente', mp_payment_id: '501', efectivo_vence_en: '2026-10-13T02:59:59.000Z' }], { 501: aprobado(501, { payment_type_id: 'ticket' }) })
await avisar(501)
okv(pedido(1).estado === 'pagado' && pedido(1).mp_payment_id === '501', 'pasa a pagado con el mismo pago')
okv(f.avisos.pago.length === 1 && f.avisos.pago[0] === 1, 'avisa la venta al vendedor y al comprador, una vez')
okv(f.avisos.doble.length === 0, 'no es un pago doble: es el mismo pago')

titulo('\n3. Un pago aprobado revive un pedido que el vencimiento canceló')
f = globalThis.__f = escenario([{ id: 1, estado: 'cancelado', cancelado_motivo: 'pago_vencido' }], { 601: aprobado(601) })
await avisar(601)
okv(pedido(1).estado === 'pagado' && pedido(1).mp_payment_id === '601' && pedido(1).cancelado_motivo === null, 'cancelado / pago_vencido -> pagado, sin motivo de cancelación')
okv(f.avisos.pago.length === 1 && f.avisos.tardio.length === 0, 'se avisa como una venta normal (no como "pago sobre pedido cancelado")')

f = globalThis.__f = escenario([{ id: 1, estado: 'cancelado', cancelado_motivo: 'pago_vencido', mp_payment_id: '700', efectivo_vence_en: '2026-10-08T00:00:00.000Z' }], { 700: aprobado(700, { payment_type_id: 'ticket' }) })
await avisar(700)
okv(pedido(1).estado === 'pagado', 'un cupón que se acredita después de que el pedido se canceló por vencido también lo revive')

f = globalThis.__f = escenario([{ id: 1, estado: 'cancelado', cancelado_motivo: 'pago_vencido', mp_payment_id: '700' }], { 701: aprobado(701) })
await avisar(701)
okv(pedido(1).estado === 'pagado' && pedido(1).mp_payment_id === '701', 'un pago distinto del cupón vencido también lo revive')

const futuro = new Date(Date.now() + 2 * 86400000).toISOString()
f = globalThis.__f = escenario([{ id: 1, estado: 'cancelado', cancelado_motivo: 'pago_vencido' }], { 602: cupon(602, { date_of_expiration: futuro }) })
await avisar(602)
okv(pedido(1).estado === 'pendiente' && pedido(1).efectivo_vence_en === futuro && pedido(1).cancelado_motivo === null, 'un cupón vigente sobre un pedido vencido lo deja pendiente con su fecha')

f = globalThis.__f = escenario([{ id: 1, estado: 'cancelado', cancelado_motivo: 'pago_vencido' }], { 603: cupon(603, { date_of_expiration: '2026-10-01T23:59:59.000-03:00' }) })
await avisar(603)
okv(pedido(1).estado === 'cancelado', 'un cupón que ya venció no lo revive')

f = globalThis.__f = escenario([{ id: 1, estado: 'cancelado', cancelado_motivo: 'pago_vencido' }], { 604: { ...pagoBase, id: 604, status: 'rejected', payment_type_id: 'credit_card' } })
await avisar(604)
okv(pedido(1).estado === 'cancelado' && f.admin.escrituras.length === 0, 'un pago rechazado no toca nada')

f = globalThis.__f = escenario([{ id: 1, estado: 'cancelado', cancelado_motivo: 'pago_vencido', total: 5000 }], { 605: aprobado(605) })
await avisar(605)
okv(pedido(1).estado === 'cancelado', 'con un monto que no coincide NO revive (las verificaciones valen igual)')

f = globalThis.__f = escenario([{ id: 1, estado: 'cancelado', cancelado_motivo: 'pago_vencido' }], { 606: aprobado(606, { collector_id: 999 }) })
await avisar(606)
okv(pedido(1).estado === 'cancelado', 'con otro cobrador NO revive')

titulo('\n4. Los cancelados por otra razón siguen sin admitir pagos')
for (const motivo of ['cuenta_eliminada', 'tienda_cerrada', 'cuenta_mp_cambiada']) {
  f = globalThis.__f = escenario([{ id: 1, estado: 'cancelado', cancelado_motivo: motivo }], { 801: aprobado(801) })
  await avisar(801)
  okv(pedido(1).estado === 'cancelado' && f.avisos.tardio.length === 1 && f.avisos.pago.length === 0, `cancelado por ${motivo}: no se revive; avisa para coordinar el reembolso`)
}

titulo('\n5. Pago doble')
f = globalThis.__f = escenario([{ id: 1, estado: 'pagado', mp_payment_id: '901' }], { 902: aprobado(902) })
await avisar(902)
okv(pedido(1).estado === 'pagado' && pedido(1).mp_payment_id === '901', 'el pedido NO se modifica')
okv(f.admin.escrituras.filter((e) => e.tabla === 'pedidos').length === 0, 'no se escribe nada en pedidos')
okv(f.admin.tablas.pagos_dobles.length === 1 && f.admin.tablas.pagos_dobles[0].pago_id === '902', 'queda registrado en pagos_dobles')
okv(f.avisos.doble.length === 1 && f.avisos.doble[0].pedidoId === 1 && f.avisos.doble[0].pagoNuevo === 902, 'un mail interno con el pedido y el pago nuevo')
await avisar(902)
okv(f.avisos.doble.length === 1, 'el mismo pago otra vez (reintento de MercadoPago) no avisa de nuevo')

f = globalThis.__f = escenario([{ id: 1, estado: 'pagado', mp_payment_id: '901' }], { 902: aprobado(902) }, { mailDobleOk: false })
await avisar(902)
okv(f.admin.tablas.pagos_dobles.length === 0, 'si el mail no sale, no queda registrado')
f.mailDobleOk = true
await avisar(902)
okv(f.avisos.doble.length === 2 && f.admin.tablas.pagos_dobles.length === 1, 'y el próximo aviso de MercadoPago lo reintenta y lo registra')

f = globalThis.__f = escenario([{ id: 1, estado: 'preparando', mp_payment_id: '901' }], { 903: { ...pagoBase, id: 903, status: 'pending', payment_type_id: 'ticket' } })
await avisar(903)
okv(f.avisos.doble.length === 0 && f.admin.tablas.pagos_dobles.length === 0, 'un pago pendiente (no aprobado) sobre un pedido ya pagado no es un pago doble')

f = globalThis.__f = escenario([{ id: 1, estado: 'pendiente', mp_payment_id: '910', efectivo_vence_en: futuro }], { 911: aprobado(911), 910: aprobado(910, { payment_type_id: 'ticket' }) })
await avisar(911)
okv(pedido(1).estado === 'pagado' && pedido(1).mp_payment_id === '911', 'una tarjeta aprobada reemplaza al cupón pendiente: el pedido se paga')
await avisar(910)
okv(pedido(1).mp_payment_id === '911' && f.admin.tablas.pagos_dobles.length === 1 && f.avisos.doble[0].pagoNuevo === 910, 'y si después se paga también el cupón, queda como pago doble')

f = globalThis.__f = escenario([{ id: 1, estado: 'pendiente' }], { 920: aprobado(920), 921: aprobado(921) })
f.admin.antesDeActualizar = (tablas) => { Object.assign(tablas.pedidos[0], { estado: 'pagado', mp_payment_id: '921' }) }
await avisar(920)
okv(pedido(1).mp_payment_id === '921' && f.admin.tablas.pagos_dobles.length === 1 && f.avisos.doble[0].pagoNuevo === 920, 'carrera: otro pago aprobado le ganó de mano entre la lectura y la escritura -> pago doble, sin pisar')

f = globalThis.__f = escenario([{ id: 1, estado: 'pendiente' }], { 930: aprobado(930) })
f.admin.antesDeActualizar = (tablas) => { Object.assign(tablas.pedidos[0], { estado: 'cancelado', cancelado_motivo: 'pago_vencido' }) }
await avisar(930)
okv(pedido(1).estado === 'pagado' && pedido(1).mp_payment_id === '930', 'carrera: el vencimiento cancela el pedido justo antes de escribir -> el pago lo revive')

titulo('\n6. Un cupón que nadie pagó')
f = globalThis.__f = escenario([{ id: 1, estado: 'pendiente', mp_payment_id: '1001', efectivo_vence_en: '2026-10-13T02:59:59.000Z' }], { 1001: { ...pagoBase, id: 1001, status: 'cancelled', status_detail: 'expired', payment_type_id: 'ticket' } })
await avisar(1001)
okv(pedido(1).estado === 'cancelado' && pedido(1).cancelado_motivo === 'pago_vencido', 'MercadoPago lo cancela por vencido -> el pedido queda cancelado / pago_vencido')

f = globalThis.__f = escenario([{ id: 1, estado: 'pendiente', mp_payment_id: '1002' }], { 1002: { ...pagoBase, id: 1002, status: 'rejected', payment_type_id: 'credit_card' } })
await avisar(1002)
okv(pedido(1).estado === 'rechazado', 'un rechazo común sigue siendo rechazado (no vencido)')

f = globalThis.__f = escenario([{ id: 1, estado: 'pendiente', mp_payment_id: '1003', efectivo_vence_en: futuro }], { 1004: { ...pagoBase, id: 1004, status: 'in_process', status_detail: 'pending_review_manual', payment_type_id: 'credit_card' } })
await avisar(1004)
okv(pedido(1).estado === 'pendiente' && pedido(1).mp_payment_id === '1004' && pedido(1).efectivo_vence_en === null, 'un pago en proceso que no es un cupón reemplaza al cupón y borra su fecha')

titulo('\n7. Lo que no cambia')
f = globalThis.__f = escenario([{ id: 1, estado: 'pendiente' }], { 1101: aprobado(1101) })
await avisar(1101)
okv(pedido(1).estado === 'pagado' && f.avisos.pago.length === 1, 'pedido pendiente + pago aprobado: pagado y se avisa')
f = globalThis.__f = escenario([{ id: 1, estado: 'pagado', mp_payment_id: '1101' }], { 1101: { ...aprobado(1101), status: 'refunded' } })
await avisar(1101)
okv(pedido(1).estado === 'reembolsado', 'un reembolso del pago guardado sigue funcionando')

titulo('\n8. validarPago, la regla sola')
const cuenta = { vendedor_id: 15, mp_user_id: '111' }
const ped = (extra) => ({ id: 1, vendedor_id: 15, total: 1000, estado: 'cancelado', cancelado_motivo: 'pago_vencido', mp_payment_id: null, ...extra })
okv(validarPago(aprobado(1), ped(), cuenta, 15).revive === true, 'aprobado sobre cancelado / pago_vencido: ok y revive')
okv(validarPago(aprobado(1), ped({ cancelado_motivo: 'cuenta_eliminada' }), cuenta, 15).motivo === 'pedido cancelado', 'sobre cancelado por otra razón: pedido cancelado')
okv(validarPago({ ...aprobado(1), status: 'rejected' }, ped(), cuenta, 15).motivo === 'pedido vencido', 'rechazado sobre cancelado / pago_vencido: pedido vencido (no se aplica)')
okv(validarPago(aprobado(2), ped({ estado: 'pagado', cancelado_motivo: null, mp_payment_id: '1' }), cuenta, 15).motivo === 'ya tenía otro pago', 'otro pago sobre un pedido pagado: ya tenía otro pago')
okv(validarPago(aprobado(2), ped({ estado: 'pendiente', cancelado_motivo: null, mp_payment_id: '1' }), cuenta, 15).ok === true, 'otro pago sobre un pedido pendiente lo reemplaza')

titulo('\n9. El mail del pago doble')
const mail = armarMailPagoDoble({ pedidoId: 41, tienda: 'Ludoméstica', monto: 38500, pagoGuardado: '901', pagoNuevo: '902' })
okv(/Pago doble/.test(mail.asunto) && /#41/.test(mail.texto) && /901/.test(mail.texto) && /902/.test(mail.texto), 'lleva el pedido y los dos ids de pago')
okv(/devolver el segundo pago a mano/.test(mail.texto), 'dice qué hacer: devolver el segundo pago a mano desde MercadoPago')
okv(!/@/.test(mail.texto), 'no lleva ninguna dirección de mail ni dato de una persona')

titulo('\n10. Pagos a la cuenta de la plataforma (suscripciones del plan)')
process.env.MP_ACCESS_TOKEN_PLATAFORMA = 'TOKEN-PLAT'
process.env.MP_USER_ID_PLATAFORMA = '999'
const SUS = { id: 7, vendedor_id: 15, external_reference: 'bs-sus-abc', mp_preapproval_id: 'pre1', estado: 'pending', monto: 10000 }
const cobroDePlataforma = (id, extra = {}) => ({
  id, dePlataforma: true, status: 'approved', currency_id: 'ARS', collector_id: 999, transaction_amount: 10000,
  external_reference: 'bs-sus-abc', date_approved: '2026-11-04T12:26:59.000-04:00',
  point_of_interaction: { type: 'SUBSCRIPTIONS', transaction_data: { subscription_id: 'pre1' } }, ...extra,
})
const avisarComo = (id, userId) => webhook({ json: async () => ({ type: 'payment', action: 'payment.created', data: { id: String(id) }, ...(userId ? { user_id: userId } : {}) }), headers: { get: () => null } })
const conSuscripcion = (e) => { e.admin.tablas.vendedor_suscripciones.push({ ...SUS }); return e }

f = globalThis.__f = conSuscripcion(escenario([{ id: 1, estado: 'pendiente' }], { 2001: cobroDePlataforma(2001) }))
let resp = await avisarComo(2001, '999')
const cobroRegistrado = f.admin.rpcs.find((r) => r.nombre === 'rpc_registrar_cobro_suscripcion')
okv(resp.status === 200 && cobroRegistrado?.args.p_suscripcion_id === 7 && cobroRegistrado.args.p_mp_pago_id === '2001' && cobroRegistrado.args.p_estado_pago === 'approved',
  'con la pista de la plataforma: se registra como cobro de la suscripción')
okv(f.avisos.sinResolver.length === 0 && pedido(1).estado === 'pendiente', 'sin «pago sin resolver» y sin tocar ningún pedido')

f = globalThis.__f = conSuscripcion(escenario([{ id: 1, estado: 'pendiente' }], { 2002: cobroDePlataforma(2002) }))
await avisarComo(2002, null)
okv(f.admin.rpcs.some((r) => r.nombre === 'rpc_registrar_cobro_suscripcion') && f.avisos.sinResolver.length === 0,
  'sin pista: ningún token de tienda lo ve, lo ve el de la plataforma, y no sale el aviso')

f = globalThis.__f = escenario([{ id: 1, estado: 'pendiente' }], { 2003: cobroDePlataforma(2003, { external_reference: 'otra-cosa' }) })
await avisarComo(2003, '999')
okv(f.avisos.sinResolver.length === 1 && f.admin.rpcs.length === 0, 'un pago de la plataforma que no es de una suscripción: sigue como siempre (aviso de pago sin resolver)')

f = globalThis.__f = escenario([{ id: 1, estado: 'pendiente' }], { 1201: aprobado(1201) })
await avisarComo(1201, '999')
okv(pedido(1).estado === 'pagado', 'una venta con la pista de la plataforma se aplica como venta')

f = globalThis.__f = conSuscripcion(escenario([], {}, { preapprovals: { pre1: { id: 'pre1', status: 'authorized', collector_id: 999, external_reference: 'bs-sus-abc',
  next_payment_date: '2026-12-04T12:26:58.000-04:00', auto_recurring: { transaction_amount: 10000, currency_id: 'ARS' } } } }))
resp = await webhook({ json: async () => ({ type: 'subscription_preapproval', action: 'updated', data: { id: 'pre1' } }), headers: { get: () => null } })
const susActual = f.admin.tablas.vendedor_suscripciones[0]
okv(resp.status === 200 && susActual.estado === 'authorized' && susActual.proximo_cobro_en === '2026-12-04T16:26:58.000Z',
  'aviso de suscripción: lee la suscripción en la API y guarda su estado y el próximo cobro')

f = globalThis.__f = conSuscripcion(escenario([], {}, { preapprovals: { pre1: { id: 'pre1', status: 'authorized', collector_id: 555, external_reference: 'bs-sus-abc' } } }))
await webhook({ json: async () => ({ type: 'subscription_preapproval', data: { id: 'pre1' } }), headers: { get: () => null } })
okv(f.admin.tablas.vendedor_suscripciones[0].estado === 'pending', 'si la suscripción la cobra otra cuenta, no se toca')

f = globalThis.__f = conSuscripcion(escenario([], {}, { preapprovals: { pre1: { id: 'pre1', status: 'cancelled', collector_id: 999, external_reference: 'bs-sus-abc',
  auto_recurring: { transaction_amount: 10000, currency_id: 'ARS' } } } }))
resp = await webhook({ url: 'https://bahiashops.com.ar/api/mercadopago/webhook?topic=preapproval&id=pre1',
  json: async () => { throw new SyntaxError('sin cuerpo') }, headers: { get: () => null } })
okv(resp.status === 200 && f.admin.tablas.vendedor_suscripciones[0].estado === 'cancelled',
  'formato viejo (?topic=preapproval&id=…, sin cuerpo): se procesa igual')

// La prueba real (04/11): el cobro devuelto no avisó (los pagos de una
// suscripción no tienen notification_url). Al sincronizar, el estado sale del pago.
f = globalThis.__f = conSuscripcion(escenario([], { 2004: cobroDePlataforma(2004, { status: 'refunded' }) }, {
  preapprovals: { pre1: { id: 'pre1', status: 'cancelled', collector_id: 999, external_reference: 'bs-sus-abc', auto_recurring: { transaction_amount: 800, currency_id: 'ARS' } } },
  cobros: [{ id: 70, preapproval_id: 'pre1', status: 'processed', external_reference: 'bs-sus-abc', transaction_amount: 500,
    debit_date: '2026-11-04T14:12:25.000-04:00', payment: { id: 2004, status: 'approved' } }],
}))
await webhook({ json: async () => ({ type: 'subscription_preapproval', data: { id: 'pre1' } }), headers: { get: () => null } })
const cobroDevuelto = f.admin.rpcs.find((r) => r.nombre === 'rpc_registrar_cobro_suscripcion')
okv(cobroDevuelto?.args.p_mp_cobro_id === '70' && cobroDevuelto.args.p_estado_pago === 'refunded',
  'una cancelada con su cobro devuelto: se registra refunded (lo dice el pago, aunque el cobro diga approved)')
// Una diferencia devuelta con la suscripción activa: vuelve al monto anterior.
f = globalThis.__f = escenario([], { 2005: cobroDePlataforma(2005, { status: 'refunded', external_reference: 'bs-dif-1', transaction_amount: 300 }) })
f.admin.tablas.vendedor_suscripciones.push({ ...SUS, estado: 'authorized', monto: 800 })
f.admin.tablas.suscripcion_diferencias.push({ id: 1, suscripcion_id: 7, external_reference: 'bs-dif-1', precio_nuevo: 800, monto_anterior: 500,
  monto: 300, estado: 'pagada', mp_pago_id: '2005', monto_mp_actualizado_en: '2026-11-04T18:18:48Z', intentos_monto_mp: 0 })
f.admin.respuestaRpc = { ok: true, estado: 'devuelta' }
await avisarComo(2005, '999')
okv(f.puts?.[0]?.id === 'pre1' && f.puts[0].cuerpo.auto_recurring?.transaction_amount === 500,
  'diferencia devuelta con la suscripción activa: el monto vuelve a $500 en Mercado Pago')
okv(f.admin.tablas.vendedor_suscripciones[0].monto === 500 && f.admin.tablas.suscripcion_diferencias[0].monto_mp_actualizado_en === null,
  'y queda anotado (monto $500, nada pendiente en Mercado Pago)')

f = globalThis.__f = escenario([], { 2006: cobroDePlataforma(2006, { status: 'refunded', external_reference: 'bs-dif-1', transaction_amount: 300 }) })
f.admin.tablas.vendedor_suscripciones.push({ ...SUS, estado: 'cancelled', monto: 800 })
f.admin.tablas.suscripcion_diferencias.push({ id: 1, suscripcion_id: 7, external_reference: 'bs-dif-1', precio_nuevo: 800, monto_anterior: 500,
  monto: 300, estado: 'pagada', mp_pago_id: '2006', monto_mp_actualizado_en: '2026-11-04T18:18:48Z', intentos_monto_mp: 0 })
f.admin.respuestaRpc = { ok: true, estado: 'devuelta' }
await avisarComo(2006, '999')
okv(!f.puts && f.admin.tablas.suscripcion_diferencias[0].monto_mp_actualizado_en === null,
  'con la suscripción cancelada: no se llama a Mercado Pago, solo se anota')
titulo('\n10b. El formato viejo (IPN) y los pagos de la plataforma fuera del camino de las ventas')
// La prueba real (05/11): el aviso viejo del pago de una diferencia
// (?id=…&topic=payment, sin user_id) lo leyó un token de tienda y entró al
// camino de las ventas («external_reference inválido»).
const DIF = { id: 1, suscripcion_id: 7, vendedor_id: 15, external_reference: 'bs-dif-16d1792e', precio_nuevo: 20000, monto_anterior: 10000,
  monto: 6700, estado: 'pendiente', mp_pago_id: null, monto_mp_actualizado_en: null, intentos_monto_mp: 0 }
const avisoViejo = (id, topic = 'payment', cuerpo = undefined) => webhook({
  url: `https://bahiashops.com.ar/api/mercadopago/webhook?id=${id}&topic=${topic}`,
  json: async () => { if (cuerpo === undefined) throw new SyntaxError('sin cuerpo'); return cuerpo },
  headers: { get: () => null },
})
const conDiferencia = (pagos) => {
  const e = escenario([{ id: 1, estado: 'pendiente' }], pagos)
  e.admin.tablas.vendedor_suscripciones.push({ ...SUS, estado: 'authorized', monto: 10000 })
  e.admin.tablas.suscripcion_diferencias.push({ ...DIF })
  e.admin.respuestaRpc = { ok: true, estado: 'pagada' }
  return e
}
const pagoDif = (id, extra = {}) => cobroDePlataforma(id, { external_reference: 'bs-dif-16d1792e', transaction_amount: 6700, point_of_interaction: { type: 'CHECKOUT' }, ...extra })

f = globalThis.__f = conDiferencia({ 3001: pagoDif(3001, { loVeLaTienda: true }) })
resp = await avisoViejo(3001)
okv(resp.status === 200 && f.admin.rpcs.some((r) => r.nombre === 'rpc_registrar_pago_diferencia'),
  'aviso viejo de una diferencia que también ve un token de tienda: va al camino de la plataforma')
okv(pedido(1).estado === 'pendiente' && !f.admin.escrituras.some((e) => e.tabla === 'pedidos') && f.avisos.sinResolver.length === 0 && f.avisos.pago.length === 0,
  'y no toca pedidos ni manda mails')

f = globalThis.__f = conDiferencia({ 3002: pagoDif(3002, { loVeLaTienda: true }) })
await avisarComo(3002, '111')
okv(f.admin.rpcs.some((r) => r.nombre === 'rpc_registrar_pago_diferencia') && !f.admin.escrituras.some((e) => e.tabla === 'pedidos'),
  'formato nuevo con la pista de la tienda (la cuenta de la plataforma conectada como tienda): igual, por la plataforma')

f = globalThis.__f = conSuscripcion(escenario([{ id: 1, estado: 'pendiente' }], { 3003: cobroDePlataforma(3003, { loVeLaTienda: true }) }))
await avisoViejo(3003)
okv(f.admin.rpcs.some((r) => r.nombre === 'rpc_registrar_cobro_suscripcion') && !f.admin.escrituras.some((e) => e.tabla === 'pedidos'),
  'lo mismo con un cobro de suscripción (bs-sus-)')

f = globalThis.__f = escenario([{ id: 1, estado: 'pendiente' }], { 1301: aprobado(1301) })
await avisoViejo(1301)
okv(pedido(1).estado === 'pagado' && f.avisos.pago.length === 1, 'una venta en formato viejo se sigue aplicando')

f = globalThis.__f = escenario([{ id: 1, estado: 'pendiente' }], {})
await avisoViejo(9999)
okv(f.avisos.sinResolver.length === 0, 'formato viejo con un pago que nadie ve: sin mail de «pago sin resolver» (no está firmado)')
f = globalThis.__f = escenario([{ id: 1, estado: 'pendiente' }], {})
await avisarComo(9999, '111')
okv(f.avisos.sinResolver.length === 1, 'el mismo pago en formato nuevo: sí sale el mail')

f = globalThis.__f = escenario([{ id: 1, estado: 'pendiente' }], {})
resp = await avisoViejo(45833871595, 'merchant_order', { resource: 'https://api.mercadolibre.com/merchant_orders/45833871595', topic: 'merchant_order' })
okv(resp.status === 200 && f.admin.escrituras.length === 0 && f.avisos.sinResolver.length === 0 && f.admin.rpcs.length === 0,
  'merchant_order (también de la plataforma): 200 y no se procesa (los pagos llegan en sus propios avisos)')

// Modo estricto: el nuevo se valida, el viejo no se puede validar y se procesa igual.
process.env.MP_WEBHOOK_SECRET = 'clave-de-prueba'
process.env.MP_FIRMA_ESTRICTA = '1'
f = globalThis.__f = escenario([{ id: 1, estado: 'pendiente' }], { 1302: aprobado(1302) })
await avisarComo(1302, '111')
okv(pedido(1).estado === 'pendiente', 'estricto: un aviso nuevo sin firma válida se rechaza')
f = globalThis.__f = escenario([{ id: 1, estado: 'pendiente' }], { 1303: aprobado(1303) })
await webhook({
  url: 'https://bahiashops.com.ar/api/mercadopago/webhook?id=1303&topic=payment',
  json: async () => ({ resource: '1303', topic: 'payment' }),
  headers: { get: (h) => ({ 'x-signature': 'ts=1,v1=abc', 'x-request-id': 'r1' })[h] ?? null },
})
okv(pedido(1).estado === 'pagado', 'estricto: un aviso viejo (con una firma que no se puede validar) se procesa igual')
f = globalThis.__f = escenario([{ id: 1, estado: 'pendiente' }], {})
await avisoViejo(9998)
okv(f.avisos.sinResolver.length === 0, 'estricto: el viejo con un pago desconocido no manda mails')
delete process.env.MP_WEBHOOK_SECRET
delete process.env.MP_FIRMA_ESTRICTA

delete process.env.MP_ACCESS_TOKEN_PLATAFORMA
delete process.env.MP_USER_ID_PLATAFORMA

mostrar(fallas === 0 ? '\nTODO OK' : `\n${fallas} FALLAS`)
process.exit(fallas ? 1 : 0)
