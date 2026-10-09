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
//   · un cupón que MercadoPago cancela por vencido vence el pedido.
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
  }
  const escrituras = []
  const base = {
    tablas, escrituras,
    antesDeActualizar: null,
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
        if (!fila || !columnas) return fila
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

globalThis.fetch = async (url) => {
  const m = String(url).match(/\/v1\/payments\/(.+)$/)
  if (m) {
    const pago = f.pagos[decodeURIComponent(m[1])]
    if (pago) return { ok: true, status: 200, json: async () => pago }
    return { ok: false, status: 404, json: async () => ({}) }
  }
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

mostrar(fallas === 0 ? '\nTODO OK' : `\n${fallas} FALLAS`)
process.exit(fallas ? 1 : 0)
