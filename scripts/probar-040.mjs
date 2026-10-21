// Prueba de la tarea diaria (migración 040): las reglas (src/lib/tareaDiaria.js
// y src/lib/resenas.js), los mails, la migración 040 en una base local
// (PGlite: Postgres real en WebAssembly) y la tarea entera corriendo sobre esa
// base con un cliente que imita a supabase-js: las marcas, los disparadores y
// los checks son los de verdad. La ruta /api/cron/diaria (el secreto y el modo
// prueba) y la renovación de MercadoPago al comprar (getCuentaValida).
// Resend y MercadoPago son de mentira. No toca Supabase ni ninguna base real.
//
//   npm run probar:040

import { register } from 'node:module'
import { readFileSync } from 'node:fs'

const raiz = new URL('../', import.meta.url)
// Node no conoce el alias '@/' de jsconfig.json: se resuelve a src/. La base
// de la ruta es de mentira (globalThis.__f).
const loader = `
const src = ${JSON.stringify(new URL('src/', raiz).href)}
const falsos = {
  'next/server': 'export const NextResponse = { json: (body, init) => ({ body, status: (init && init.status) || 200 }) }',
  '@/lib/supabase/admin': 'export function getServiceRoleClient() { return globalThis.__f.admin }',
}
export function resolve(esp, ctx, sig) {
  if (falsos[esp]) return { url: 'data:text/javascript,' + encodeURIComponent(falsos[esp]), shortCircuit: true }
  if (esp.startsWith('@/')) { const r = src + esp.slice(2); return sig(/\\.[a-z]+$/.test(r) ? r : r + '.js', ctx) }
  // tokens.js importa './config' sin extensión (Next lo resuelve; Node no).
  if (esp.startsWith('.') && !/\\.[a-z]+$/.test(esp) && String(ctx.parentURL).startsWith(src)) return sig(esp + '.js', ctx)
  return sig(esp, ctx)
}`
register('data:text/javascript,' + encodeURIComponent(loader))

process.env.RESEND_API_KEY = 'prueba'
// Las credenciales de la aplicación de MercadoPago (config.js las lee al importar).
process.env.MP_CLIENT_ID = 'id-de-la-app'
process.env.MP_CLIENT_SECRET = 'secreto-de-la-app'
const T = await import('../src/lib/tareaDiaria.js')
const R = await import('../src/lib/resenas.js')
const M = await import('../src/lib/mailsPedidos.js')
const MP = await import('../src/lib/mailsCuentaMp.js')
const { getCuentaValida } = await import('../src/lib/mercadopago/tokens.js')
const { EMAIL_NOTIFICACIONES } = await import('../src/lib/contacto.js')
const { PGlite } = await import('@electric-sql/pglite')

let fallas = 0
const ok = (c, m) => { if (!c) { fallas++; console.log('  ✗ FALLA:', m) } else console.log('  ✓', m) }
const leer = (ruta) => readFileSync(new URL(ruta, raiz), 'utf8').replace(/\r\n/g, '\n')
const DIA = 24 * 60 * 60 * 1000
const AHORA = Date.now()
const hace = (dias) => new Date(AHORA - dias * DIA).toISOString()
const en = (dias) => new Date(AHORA + dias * DIA).toISOString()

// ── 1. Las reglas ────────────────────────────────────────────────────────────
console.log('1. Las reglas del aviso de los 14 días y del recordatorio')
const comprador = { email: 'a@x.com', cerrada_en: null }
const tienda = { nombre_negocio: 'Tienda', cerrada_en: null }
const cand = (pedido, extra = {}) => ({ pedido: { estado: 'pagado', ...pedido }, resena: null, comprador, tienda, ...extra })
const sinCorte = { ahoraMs: AHORA, pagadosDesdeMs: 0 }
const aviso = (p, extra, opts = sinCorte) => T.motivoSinAviso14Dias(cand(p, extra), opts)
ok(aviso({ pagado_en: hace(13.9) }) === 'todavia_no', 'el día 13: todavía no')
ok(aviso({ pagado_en: hace(14.01) }) === null, 'el día 14: sale')
ok(aviso({ pagado_en: hace(21.9) }) === null, 'el día 21: todavía sale')
ok(aviso({ pagado_en: hace(22.01) }) === 'pasado_el_dia_21', 'pasado el día 21: ya no')
ok(aviso({ pagado_en: hace(15), aviso_resena_en: hace(10) }) === 'ya_invitado', 'si ya recibió una invitación («¿Cómo te fue?»): no')
ok(aviso({ pagado_en: hace(15), entregado_at: hace(1), estado: 'entregado' }) === 'entregado', 'entregado: no')
ok(aviso({ pagado_en: hace(15), estado: 'cancelado' }) === 'no_corresponde' && aviso({ pagado_en: hace(15), estado: 'reembolsado' }) === 'no_corresponde',
  'cancelado y reembolsado: no')
ok(aviso({ pagado_en: hace(15) }, { tienda: { cerrada_en: hace(1) } }) === 'tienda_cerrada', 'tienda cerrada: no')
ok(aviso({ pagado_en: hace(15) }, { comprador: { email: 'x@borrada.invalid', cerrada_en: hace(1) } }) === 'cuenta_eliminada'
  && aviso({ pagado_en: hace(15) }, { comprador: { email: 'x@borrada.invalid', cerrada_en: null } }) === 'cuenta_eliminada',
  'cuenta eliminada (cerrada o con mail .invalid): no')
ok(aviso({ pagado_en: hace(15) }, { resena: { pedido_id: 1 } }) === 'ya_reseno', 'ya reseñó: no')
ok(aviso({ pagado_en: hace(15) }, {}, { ahoraMs: AHORA, pagadosDesdeMs: AHORA - 14.5 * DIA }) === 'antes_del_corte'
  && aviso({ pagado_en: hace(14.2) }, {}, { ahoraMs: AHORA, pagadosDesdeMs: AHORA - 14.5 * DIA }) === null,
  'la fecha de corte: antes no, desde ahí sí')
ok(aviso({ pagado_en: hace(15), estado: 'pausada' }) === 'no_corresponde', 'un estado que no se conoce: no')

const rec = (p, extra) => T.motivoSinRecordatorio(cand(p, extra), { ahoraMs: AHORA })
ok(rec({ pagado_en: hace(10), entregado_at: hace(8), estado: 'entregado', aviso_resena_en: hace(8) }) === null, 'recordatorio a los 7 días de la invitación: sale')
ok(rec({ pagado_en: hace(10), entregado_at: hace(6), estado: 'entregado', aviso_resena_en: hace(6.9) }) === 'todavia_no', 'a los 6 días: todavía no')
ok(rec({ pagado_en: hace(22), aviso_resena_en: hace(8) }) === null, 'después del aviso de los 14 días también')
ok(rec({ pagado_en: hace(42), aviso_resena_en: hace(8) }) === 'poca_ventana', 'con menos de 3 días de ventana: no')
ok(rec({ pagado_en: hace(40.9), aviso_resena_en: hace(8) }) === null, 'con 3 días justos: sí')
ok(rec({ pagado_en: hace(10), aviso_resena_en: hace(8), recordatorio_resena_en: hace(1) }) === 'ya_recordado', 'uno solo')
ok(rec({ pagado_en: hace(10), estado: 'entregado', entregado_at: hace(9) }) === 'sin_invitacion', 'sin invitación, sin recordatorio')
ok(rec({ pagado_en: hace(10), aviso_resena_en: hace(8), estado: 'reembolsado' }) === 'no_corresponde', 'reembolsado: no')

ok(T.motivoSinRenovar({ token_expira_en: en(29) }, tienda, AHORA) === null && T.motivoSinRenovar({ token_expira_en: en(31) }, tienda, AHORA) === 'todavia_no'
  && T.motivoSinRenovar({ token_expira_en: hace(2) }, tienda, AHORA) === null && T.motivoSinRenovar({ token_expira_en: en(5) }, { cerrada_en: hace(1) }, AHORA) === 'tienda_cerrada',
  'MercadoPago: se renueva a 30 días o menos (o ya vencido), no en tiendas cerradas')

const corte = Date.parse(T.AVISO_14_DIAS_PAGADOS_DESDE)
ok(T.pagadosDesdeParaAviso({ NODE_ENV: 'development', AVISO_14_DIAS_PAGADOS_DESDE: '2026-01-01' }) === Date.parse('2026-01-01'), 'en desarrollo, la fecha de corte se cambia por variable')
ok(T.pagadosDesdeParaAviso({ NODE_ENV: 'production', AVISO_14_DIAS_PAGADOS_DESDE: '2026-01-01' }) === corte, 'en producción, nunca: es la del código')
ok(T.pagadosDesdeParaAviso({ NODE_ENV: 'development', AVISO_14_DIAS_PAGADOS_DESDE: 'cualquiera' }) === corte, 'una fecha inválida: la del código')

console.log('2. El aviso del panel de la tienda')
ok(R.diasSinMarcarEntregado({ estado: 'preparando', pagado_en: hace(15.5) }, AHORA) === 15, 'pagado hace 15 días, en curso: 15')
ok(R.diasSinMarcarEntregado({ estado: 'despachado', pagado_en: hace(25) }, AHORA) === 25, 'el día 25 también (el panel no tiene tope)')
ok(R.diasSinMarcarEntregado({ estado: 'pagado', pagado_en: hace(13.9) }, AHORA) === null, 'antes del día 14: nada')
ok(R.diasSinMarcarEntregado({ estado: 'entregado', pagado_en: hace(20), entregado_at: hace(1) }, AHORA) === null
  && R.diasSinMarcarEntregado({ estado: 'reembolsado', pagado_en: hace(20) }, AHORA) === null
  && R.diasSinMarcarEntregado({ estado: 'pendiente', pagado_en: null }, AHORA) === null, 'entregado, reembolsado o sin pagar: nada')
ok(R.textoPedidosSinMarcar(0) === null
  && R.textoPedidosSinMarcar(1) === 'Tenés 1 pedido pagado hace más de 14 días sin marcar como entregado.'
  && R.textoPedidosSinMarcar(3) === 'Tenés 3 pedidos pagados hace más de 14 días sin marcar como entregados.', 'la línea gris: 0, 1 y varios')

console.log('3. Los mails')
const a14 = M.armarMailAviso14Dias({ pedidoId: 77, tienda: 'Lo de <Pepa>', nombre: 'Ana' })
ok(a14.asunto === '¿Te llegó tu compra de Lo de <Pepa>?', 'asunto del aviso')
ok(a14.texto.includes('Hola Ana,') && a14.texto.includes('Hace dos semanas pagaste tu pedido #77 en Lo de <Pepa>, y la tienda todavía no lo marcó como entregado.')
  && a14.texto.includes('/mis-pedidos?resena=77') && a14.texto.includes('Tu reseña se firma con tu apodo, no con tu nombre.'), 'texto del aviso')
ok(a14.html.includes('Lo de &lt;Pepa&gt;') && !a14.html.includes('<Pepa>') && a14.html.includes('Ver mi pedido') && a14.html.includes('Pedido #77'), 'html escapado, botón y línea azul')
ok(M.armarMailAviso14Dias({ pedidoId: 1, tienda: 'T', nombre: null }).texto.includes('\nHola,\n'), 'sin nombre: "Hola,"')
const rr = M.armarMailRecordatorioResena({ pedidoId: 78, tienda: 'Tienda', nombre: 'Ana' })
ok(rr.asunto === 'Tu reseña de Tienda, último recordatorio' && rr.texto.includes('Te escribimos una vez más por tu compra en Tienda, por si se te pasó.')
  && rr.texto.includes('Si preferís no dejar reseña, no hay problema: no te vamos a volver a escribir por este pedido.') && rr.html.includes('Dejar mi reseña'),
  'el recordatorio')
const mpT = MP.armarMailRenovacionFallida({ tienda: 'Tienda' })
ok(mpT.asunto === 'Volvé a conectar Mercado Pago en Tienda' && mpT.texto.includes('No pudimos renovar la conexión de tu cuenta de Mercado Pago con Tienda.')
  && mpT.texto.includes('/vendedor/perfil') && mpT.html.includes('Conectar Mercado Pago'), 'el de MercadoPago a la tienda')
const mpI = MP.armarMailRenovacionFallidaInterno({ tienda: 'Tienda', vendedorId: 18, cuenta: '999', venceEn: en(3), error: 'invalid_grant de x@y.com' })
ok(mpI.asunto === '⚠️ No se pudo renovar MP — Tienda' && mpI.texto.includes('Id de la tienda: 18') && mpI.texto.includes('N° 999')
  && mpI.texto.includes('invalid_grant') && !mpI.texto.includes('x@y.com'), 'el interno: tienda, id, cuenta, vencimiento y error (sin mails)')

// ── 4. La migración ──────────────────────────────────────────────────────────
console.log('4. La migración 040')
const db = new PGlite()
const q = async (sql, p) => (await db.query(sql, p)).rows
async function falla(sql, codigo, msj) {
  try { await db.exec(sql); ok(false, `${msj} (no falló)`) }
  catch (err) { ok(!codigo || err.code === codigo, `${msj} (${err.code})`) }
}
await db.exec(`
  create role anon; create role authenticated; create role service_role bypassrls;
  create table public.usuarios (id uuid primary key, email text not null, cerrada_en timestamptz);
  create table public.vendedores (id integer primary key, usuario_id uuid references public.usuarios,
    nombre_negocio text, cerrada_en timestamptz, pausada_en timestamptz, mercadopago_conectado boolean not null default true);
  create table public.pedidos (id bigint primary key, comprador_id uuid not null references public.usuarios,
    vendedor_id integer not null references public.vendedores, estado text not null,
    comprador_nombre text, vendedor_nombre text, pagado_en timestamptz, entregado_at timestamptz,
    aviso_resena_en timestamptz, vence_en timestamptz, efectivo_vence_en timestamptz, mp_payment_id text,
    cancelado_motivo text, creado_en timestamptz not null default now(), actualizado_en timestamptz);
  create table public.resenas (id serial primary key, pedido_id bigint not null unique references public.pedidos);
  create table public.mercadopago_cuentas (vendedor_id integer primary key references public.vendedores,
    access_token text, refresh_token text, token_expira_en timestamptz, mp_user_id text, actualizado_en timestamptz);
  grant select on public.pedidos to authenticated;
  insert into usuarios values ('00000000-0000-0000-0000-00000000000a', 'a@x.com', null),
    ('00000000-0000-0000-0000-00000000000e', 'borrada@x.invalid', now()),
    ('00000000-0000-0000-0000-000000000018', 'duena18@x.com', null),
    ('00000000-0000-0000-0000-000000000009', 'duena9@x.com', null),
    ('00000000-0000-0000-0000-000000000007', 'duena7@x.com', null),
    ('00000000-0000-0000-0000-0000000000ff', 'falla@x.com', null);
  insert into vendedores (id, usuario_id, nombre_negocio, cerrada_en, pausada_en) values
    (18, '00000000-0000-0000-0000-000000000018', 'Bahía Shops', null, null),
    (9, '00000000-0000-0000-0000-000000000009', 'Pausada', null, now()),
    (7, '00000000-0000-0000-0000-000000000007', 'Cerrada', now(), null);
  -- Uno que ya tenía el «¿Cómo te fue?» antes de la 040 (sin via).
  insert into pedidos (id, comprador_id, vendedor_id, estado, pagado_en, entregado_at, aviso_resena_en)
    values (500, '00000000-0000-0000-0000-00000000000a', 18, 'entregado', now() - interval '3 days', now() - interval '2 days', now() - interval '2 days');
`)
const M040 = leer('sql/migrations/040_tarea_diaria.sql')
const verif = JSON.parse((await db.exec(M040)).at(-1).rows[0].verificacion)
await db.exec(M040)
// La función pública que ya existe desde la 022/025 (llama a la de privado).
await db.exec(`create or replace function public.rpc_cancelar_pedidos_vencidos(p_vendedor_id bigint default null)
  returns integer language sql security definer set search_path = public, pg_temp
  as $$ select privado.cancelar_pedidos_vencidos(p_vendedor_id) $$`)
ok(Object.keys(verif.columnas).length === 5, 'corre, y corre dos veces; las cinco columnas')
ok(Object.values(verif.disparadores).every(Boolean) && verif.via_sin_aviso === 0 && verif.aviso_sin_via === 0, 'los disparadores, y via con aviso')
ok(verif.mp_permisos.anon === '' && verif.mp_permisos.authenticated === '', 'mercadopago_cuentas: nada para el navegador')
ok(verif.rpc_vencidos_permisos.service_role && !verif.rpc_vencidos_permisos.anon && !verif.rpc_vencidos_permisos.authenticated, 'rpc_pedidos_vencidos: solo service_role')
ok((await q(`select aviso_resena_via v from pedidos where id = 500`))[0].v === 'entregado', 'el «¿Cómo te fue?» de antes queda como via entregado')
await db.exec(`insert into pedidos (id, comprador_id, vendedor_id, estado, pagado_en) values (501, '00000000-0000-0000-0000-00000000000a', 18, 'pagado', now())`)
await db.exec(`update pedidos set aviso_resena_en = now() where id = 501`)
ok((await q(`select aviso_resena_via v from pedidos where id = 501`))[0].v === 'entregado', 'el código de hoy (sin via) sigue andando: via entregado')
await db.exec(`update pedidos set aviso_resena_en = null where id = 501`)
ok((await q(`select aviso_resena_via v from pedidos where id = 501`))[0].v === null, 'soltar la marca suelta la via')
await falla(`update pedidos set aviso_resena_via = 'otra', aviso_resena_en = now() where id = 501`, '23514', 'una via que no existe: no')
await falla(`update pedidos set recordatorio_resena_en = now() where id = 501`, '23514', 'recordatorio sin invitación: no')
await db.exec(`delete from pedidos where id in (500, 501)`)

await db.exec(`insert into mercadopago_cuentas values (9, 'AT', 'RT', now() + interval '3 days', '1', null)`)
await falla(`update mercadopago_cuentas set aviso_renovacion_en = now() where vendedor_id = 9`, '23514', 'aviso de renovación sin falla: no')
await db.exec(`update mercadopago_cuentas set renovacion_fallida_en = now(), renovacion_error = 'x', aviso_renovacion_en = now() where vendedor_id = 9`)
await db.exec(`update mercadopago_cuentas set actualizado_en = now() where vendedor_id = 9`)
ok((await q(`select renovacion_fallida_en is not null f from mercadopago_cuentas where vendedor_id = 9`))[0].f, 'otro cambio no limpia la marca')
await db.exec(`update mercadopago_cuentas set access_token = 'AT2', refresh_token = 'RT2' where vendedor_id = 9`)
const limpia = (await q(`select renovacion_fallida_en, renovacion_error, aviso_renovacion_en from mercadopago_cuentas where vendedor_id = 9`))[0]
ok(limpia.renovacion_fallida_en === null && limpia.renovacion_error === null && limpia.aviso_renovacion_en === null, 'tokens nuevos (renovó o reconectó): la marca se limpia')
await db.exec(`delete from mercadopago_cuentas`)

// ── Un cliente con la forma de supabase-js, sobre PGlite ──────────────────────
// Cubre lo que usan la tarea, los mails y tokens.js: select (siempre todas las
// columnas; los embebidos no se usan antes de los cortes), update, eq, is,
// not(col, 'is', null), in, lte, lt, gt, gte, order, single, maybeSingle y rpc.
function convertir(fila) {
  const r = {}
  for (const [k, v] of Object.entries(fila)) r[k] = v instanceof Date ? v.toISOString() : typeof v === 'bigint' ? Number(v) : v
  return r
}
function adminSobre(base) {
  const from = (tabla) => {
    const filtros = []
    const params = []
    let op = 'select'
    let valores = null
    let devolver = false
    let orden = ''
    const p = (v) => { params.push(v); return `$${params.length}` }
    const b = {
      select() { if (op === 'update') devolver = true; return b },
      update(v) { op = 'update'; valores = v; return b },
      eq(c, v) { filtros.push(`"${c}" = ${p(v)}`); return b },
      is(c, v) { if (v !== null) throw new Error('is() solo con null'); filtros.push(`"${c}" is null`); return b },
      not(c, o, v) { if (o !== 'is' || v !== null) throw new Error('not() solo is null'); filtros.push(`"${c}" is not null`); return b },
      in(c, vs) { filtros.push(`"${c}"::text = any(${p(vs.map(String))}::text[])`); return b },
      lte(c, v) { filtros.push(`"${c}" <= ${p(v)}`); return b },
      lt(c, v) { filtros.push(`"${c}" < ${p(v)}`); return b },
      gt(c, v) { filtros.push(`"${c}" > ${p(v)}`); return b },
      gte(c, v) { filtros.push(`"${c}" >= ${p(v)}`); return b },
      order(c, { ascending = true } = {}) { orden = ` order by "${c}" ${ascending ? 'asc' : 'desc'}`; return b },
      async correr() {
        const donde = filtros.length ? ` where ${filtros.join(' and ')}` : ''
        let sql
        if (op === 'update') {
          const sets = Object.entries(valores).map(([c, v]) => `"${c}" = ${p(v)}`).join(', ')
          sql = `update public.${tabla} set ${sets}${donde} returning *`
        } else sql = `select * from public.${tabla}${donde}${orden}`
        try {
          const filas = (await base.query(sql, params)).rows.map(convertir)
          return { data: op === 'update' && !devolver ? null : filas, error: null }
        } catch (err) {
          return { data: null, error: { message: err.message, code: err.code } }
        }
      },
      async maybeSingle() { const r = await b.correr(); return r.error ? r : { data: r.data?.[0] ?? null, error: null } },
      async single() {
        const r = await b.correr()
        if (r.error) return r
        return r.data.length === 1 ? { data: r.data[0], error: null } : { data: null, error: { code: 'PGRST116', message: 'no hay fila' } }
      },
      then(bien, mal) { return b.correr().then(bien, mal) },
    }
    return b
  }
  const rpc = async (nombre, args = {}) => {
    const params = []
    const lista = Object.entries(args).map(([k, v]) => (v === null ? `${k} => null` : (params.push(v), `${k} => $${params.length}`))).join(', ')
    try {
      const r = await base.query(`select * from public.${nombre}(${lista})`, params)
      const filas = r.rows.map(convertir)
      if (r.fields.length === 1 && r.fields[0].name === nombre) return { data: filas[0]?.[nombre] ?? null, error: null }
      return { data: filas, error: null }
    } catch (err) {
      return { data: null, error: { message: err.message, code: err.code } }
    }
  }
  return { from, rpc }
}
const admin = adminSobre(db)

// Resend y MercadoPago de mentira.
let mails = []
const resendFalla = new Set()
let mpCaido = false
// Cada pedido de renovación que llega a MercadoPago, tal cual.
const pedidosMp = []
globalThis.fetch = async (url, init) => {
  const cuerpo = JSON.parse(init.body)
  const resp = (status, json) => ({ ok: status < 300, status, json: async () => json, text: async () => JSON.stringify(json) })
  if (String(url).includes('api.resend.com')) {
    if (resendFalla.has(cuerpo.to)) return resp(500, { message: 'Resend caído' })
    mails.push({ para: cuerpo.to, asunto: cuerpo.subject })
    return resp(200, { id: 'm' })
  }
  if (String(url).includes('api.mercadopago.com/oauth/token')) {
    pedidosMp.push(cuerpo)
    if (mpCaido) throw new Error('fetch failed')
    if (String(cuerpo.refresh_token).startsWith('RT-OK')) {
      return resp(200, { access_token: `AT-NUEVO-${cuerpo.refresh_token}`, refresh_token: `RT-OK-NUEVO-${Math.random()}`, expires_in: 15552000 })
    }
    return resp(400, { error: 'invalid_grant', message: 'invalid refresh_token' })
  }
  throw new Error(`fetch inesperado: ${url}`)
}

const A = '00000000-0000-0000-0000-00000000000a'
const E = '00000000-0000-0000-0000-00000000000e'
const F = '00000000-0000-0000-0000-0000000000ff'
let siguiente = 1
async function pedido({ comprador: c = A, tienda: t = 18, estado = 'pagado', pagado = null, entregado = null, invitacion = null, via = null, recordado = null, resena = false, ...resto } = {}) {
  const id = siguiente++
  await db.query(`insert into pedidos (id, comprador_id, vendedor_id, estado, comprador_nombre, vendedor_nombre, pagado_en, entregado_at,
      aviso_resena_en, aviso_resena_via, recordatorio_resena_en, vence_en, efectivo_vence_en, mp_payment_id)
    values ($1, $2, $3, $4, 'Ana', null, $5, $6, $7, $8, $9, $10, $11, $12)`,
  [id, c, t, estado, pagado, entregado, invitacion, via, recordado, resto.vence_en ?? null, resto.efectivo_vence_en ?? null, resto.mp_payment_id ?? null])
  if (resena) await db.query(`insert into resenas (pedido_id) values ($1)`, [id])
  return id
}
const fila = async (id) => (await q(`select * from pedidos where id = $1`, [id])).map(convertir)[0]
const foto = async () => JSON.stringify([await q(`select * from pedidos order by id`), await q(`select * from mercadopago_cuentas order by vendedor_id`)])
const correr = (extra = {}) => T.correrTareaDiaria({ admin, entorno: { NODE_ENV: 'development' }, pausaMs: 0, ...extra })
const listaDe = (r, tarea) => (r[tarea].lista || []).map((x) => x.pedido).sort((a, b) => a - b)

// ── 5. La tarea, sobre la base ───────────────────────────────────────────────
console.log('5. La tarea diaria sobre la base')
// Con la fecha de corte de desarrollo en el 2000, todos los pedidos de prueba
// entran (sin la variable, vale la del código y quedan afuera).
const sinCorteEntorno = { entorno: { NODE_ENV: 'development', AVISO_14_DIAS_PAGADOS_DESDE: '2000-01-01' } }
const p13 = await pedido({ pagado: hace(13.5) })
const p14 = await pedido({ estado: 'preparando', pagado: hace(14.2) })
const pYaComoTeFue = await pedido({ estado: 'entregado', pagado: hace(15), entregado: hace(12), invitacion: hace(12), via: 'entregado', recordado: hace(5) })
const p22 = await pedido({ pagado: hace(22.5) })
const pCancelado = await pedido({ estado: 'cancelado', pagado: hace(15) })
const pReembolsado = await pedido({ estado: 'reembolsado', pagado: hace(15) })
const pCerrada = await pedido({ tienda: 7, pagado: hace(15) })
const pEliminada = await pedido({ comprador: E, pagado: hace(15) })
const pResenado = await pedido({ pagado: hace(15), resena: true })
const pPausada = await pedido({ tienda: 9, pagado: hace(15) })
const r1 = await pedido({ estado: 'entregado', pagado: hace(10), entregado: hace(8), invitacion: hace(8), via: 'entregado' })
const r6 = await pedido({ estado: 'entregado', pagado: hace(10), entregado: hace(6), invitacion: hace(6), via: 'entregado' })
const rPoca = await pedido({ estado: 'preparando', pagado: hace(42.5), invitacion: hace(8), via: '14_dias' })
const rYa = await pedido({ estado: 'entregado', pagado: hace(10), entregado: hace(9), invitacion: hace(9), via: 'entregado', recordado: hace(1) })
const rResenado = await pedido({ estado: 'entregado', pagado: hace(10), entregado: hace(8), invitacion: hace(8), via: 'entregado', resena: true })
const rReembolsado = await pedido({ estado: 'reembolsado', pagado: hace(10), entregado: hace(8), invitacion: hace(8), via: 'entregado' })
const vLink = await pedido({ estado: 'pendiente', vence_en: hace(0.1) })
const vCupon = await pedido({ estado: 'pendiente', efectivo_vence_en: hace(7 / 24) })
const vCuponReciente = await pedido({ estado: 'pendiente', efectivo_vence_en: hace(3 / 24) })
const vEnProceso = await pedido({ estado: 'pendiente', vence_en: hace(0.1), mp_payment_id: '123' })
await db.exec(`insert into mercadopago_cuentas values
  (18, 'AT18', 'RT-OK-18', now() + interval '10 days', '1818', null),
  (9, 'AT9', 'RT-MALO-9', now() + interval '20 days', '0909', null),
  (7, 'AT7', 'RT-OK-7', now() + interval '5 days', '0707', null)`)

let antes = await foto()
let res = await correr({ prueba: true, ...sinCorteEntorno })
ok(mails.length === 0 && (await foto()) === antes, 'modo prueba: no manda ni cambia nada')
ok(JSON.stringify(listaDe(res, 'aviso_14_dias')) === JSON.stringify([p14, pPausada].sort((a, b) => a - b)),
  'modo prueba: el aviso sería para el del día 14 y el de la tienda pausada, y nada más')
ok(JSON.stringify(listaDe(res, 'recordatorio')) === JSON.stringify([r1]), 'modo prueba: el recordatorio, solo para el de hace 8 días con ventana')
ok(res.aviso_14_dias.lista.every((x) => x.para === 'a@x.com' && x.asunto.startsWith('¿Te llegó tu compra de')), 'modo prueba: dice a quién y qué mail')
ok(res.mercadopago.lista.map((c) => c.vendedor_id).sort().join() === '18,9', 'modo prueba: renovaría la 18 y la pausada, no la cerrada')
ok(res.vencidos.a_cancelar === 2 && res.vencidos.lista.map((v) => Number(v.pedido_id)).sort((a, b) => a - b).join() === [vLink, vCupon].join(),
  'modo prueba: lista los vencidos sin cancelarlos')
ok(res.errores.length === 0, 'modo prueba: sin errores')
res = await correr({ prueba: true, entorno: { NODE_ENV: 'production', AVISO_14_DIAS_PAGADOS_DESDE: '2000-01-01' } })
const esperados = [[p14, hace(14.2)], [pPausada, hace(15)]].filter(([, pago]) => Date.parse(pago) >= corte).map(([id]) => id)
ok(res.aviso_14_dias_pagados_desde === new Date(corte).toISOString()
  && JSON.stringify(listaDe(res, 'aviso_14_dias')) === JSON.stringify(esperados.sort((a, b) => a - b)),
  'en producción vale la fecha de corte del código (la variable no cuenta)')

res = await correr(sinCorteEntorno)
const alComprador = mails.filter((m) => m.para === 'a@x.com')
ok(alComprador.filter((m) => m.asunto.startsWith('¿Te llegó')).length === 2 && alComprador.filter((m) => m.asunto.includes('último recordatorio')).length === 1,
  'en serio: dos avisos de 14 días y un recordatorio')
ok(!mails.some((m) => m.para === 'borrada@x.invalid'), 'nada para la cuenta eliminada')
ok((await fila(p14)).aviso_resena_via === '14_dias' && (await fila(pPausada)).aviso_resena_via === '14_dias', 'el aviso queda como la invitación (via 14_dias)')
ok((await fila(r1)).recordatorio_resena_en !== null && (await fila(rPoca)).recordatorio_resena_en === null && (await fila(r6)).recordatorio_resena_en === null,
  'el recordatorio queda marcado; los que no corresponden, no')
for (const id of [p13, p22, pCancelado, pReembolsado, pCerrada, pEliminada, pResenado]) {
  if ((await fila(id)).aviso_resena_en !== null) ok(false, `el pedido ${id} no debía recibir el aviso`)
}
ok((await fila(rReembolsado)).recordatorio_resena_en === null && (await fila(rResenado)).recordatorio_resena_en === null
  && Date.parse((await fila(rYa)).recordatorio_resena_en) < AHORA - 0.5 * DIA,
  'nada para cancelados, reembolsados, tiendas cerradas, cuentas eliminadas ni ya reseñados (ni un segundo recordatorio)')
ok((await fila(vLink)).estado === 'cancelado' && (await fila(vCupon)).estado === 'cancelado'
  && (await fila(vCuponReciente)).estado === 'pendiente' && (await fila(vEnProceso)).estado === 'pendiente', 'cancela los vencidos (y solo esos)')
ok(res.vencidos.cancelados === 2, 'y dice cuántos')

const mp18 = (await q(`select * from mercadopago_cuentas where vendedor_id = 18`)).map(convertir)[0]
ok(mp18.access_token === 'AT-NUEVO-RT-OK-18' && Date.parse(mp18.token_expira_en) > AHORA + 170 * DIA, 'renueva la cuenta de la 18')
ok((await q(`select access_token from mercadopago_cuentas where vendedor_id = 7`))[0].access_token === 'AT7', 'no toca la de la tienda cerrada')
const mp9 = (await q(`select * from mercadopago_cuentas where vendedor_id = 9`)).map(convertir)[0]
ok(mp9 && mp9.access_token === 'AT9' && mp9.renovacion_fallida_en && mp9.aviso_renovacion_en && /invalid_grant/.test(mp9.renovacion_error),
  'renovación fallida: la cuenta queda, marcada y avisada')
ok((await q(`select mercadopago_conectado c from vendedores where id = 9`))[0].c === true, 'y no se desconecta')
ok(mails.filter((m) => m.para === 'duena9@x.com' && m.asunto === 'Volvé a conectar Mercado Pago en Pausada').length === 1
  && mails.filter((m) => m.para === EMAIL_NOTIFICACIONES && m.asunto === '⚠️ No se pudo renovar MP — Pausada').length === 1,
  'un mail a la tienda y uno a notificaciones@')
ok(res.mails_usados === 5 && res.errores.length === 0, 'el resumen cuenta los mails (5) y no tiene errores')

const enviadosAntes = mails.length
antes = await foto()
res = await correr(sinCorteEntorno)
ok(mails.length === enviadosAntes, 'una segunda corrida el mismo día no manda nada')
ok(res.mercadopago.fallidas === 1 && res.mercadopago.ya_avisadas === 1, 'la renovación vuelve a fallar, pero no avisa de nuevo')

// Dos corridas a la vez sobre un pedido nuevo: un solo mail.
const pDoble = await pedido({ pagado: hace(14.5) })
mails = []
await Promise.all([correr(sinCorteEntorno), correr(sinCorteEntorno)])
ok(mails.filter((m) => m.asunto.startsWith('¿Te llegó')).length === 1, 'dos corridas a la vez: el aviso sale una sola vez')

// Marcar entregado después del aviso: el «¿Cómo te fue?» no sale.
await db.query(`update pedidos set estado = 'entregado', entregado_at = now() where id = $1`, [p14])
mails = []
const comoTeFue = await M.avisarResena({ admin, pedidoId: p14 })
ok(!comoTeFue.enviado && comoTeFue.motivo === 'ya_enviado' && mails.length === 0, 'marcar Entregado después del aviso no manda otra invitación')
ok((await fila(p14)).aviso_resena_via === '14_dias', 'y la invitación sigue siendo la del aviso')

// El recordatorio de esa invitación, a los 7 días, una sola vez.
await db.query(`update pedidos set aviso_resena_en = aviso_resena_en - interval '6 days', pagado_en = pagado_en - interval '6 days' where id = $1`, [p14])
res = await correr(sinCorteEntorno)
ok(mails.length === 0, 'a los 6 días del aviso: todavía no hay recordatorio')
await db.query(`update pedidos set aviso_resena_en = aviso_resena_en - interval '1.1 days', pagado_en = pagado_en - interval '1.1 days' where id = $1`, [p14])
res = await correr(sinCorteEntorno)
ok(mails.length === 1 && mails[0].asunto.includes('último recordatorio'), 'a los 7 días del aviso de los 14 días: el recordatorio')
await correr(sinCorteEntorno)
ok(mails.length === 1, 'y nunca más')

// Una invitación sin entregar que se marca entregada DESPUÉS de leer (la condición del reclamo).
const pCarrera = await pedido({ pagado: hace(15) })
mails = []
const carrera = await M.avisarResena14Dias({ admin, pedidoId: pCarrera, tienda: 'T', nombre: 'Ana', para: 'a@x.com' })
ok(carrera.enviado, '(el envío del aviso, directo)')
const pCarrera2 = await pedido({ pagado: hace(15) })
await db.query(`update pedidos set estado = 'entregado', entregado_at = now() where id = $1`, [pCarrera2])
const tarde = await M.avisarResena14Dias({ admin, pedidoId: pCarrera2, tienda: 'T', nombre: 'Ana', para: 'a@x.com' })
ok(!tarde.enviado && (await fila(pCarrera2)).aviso_resena_en === null, 'si lo marcaron entregado entre la lectura y el envío, el aviso no sale')

// Resend falla: la marca se suelta (con la via) y sale al otro día.
const pFalla = await pedido({ comprador: F, pagado: hace(15) })
resendFalla.add('falla@x.com')
await correr(sinCorteEntorno)
let f = await fila(pFalla)
ok(f.aviso_resena_en === null && f.aviso_resena_via === null, 'Resend falla: la marca (y la via) se sueltan')
resendFalla.clear()
mails = []
await correr(sinCorteEntorno)
ok(mails.length === 1 && (await fila(pFalla)).aviso_resena_via === '14_dias', 'y sale en la corrida siguiente')

// El tope: lo que no entra sale en la próxima.
const t1 = await pedido({ pagado: hace(15) })
const t2 = await pedido({ pagado: hace(15.5) })
mails = []
res = await correr({ ...sinCorteEntorno, tope: 1 })
ok(mails.length === 1 && res.aviso_14_dias.para_manana === 1 && (await fila(t2)).aviso_resena_en !== null && (await fila(t1)).aviso_resena_en === null,
  'con tope 1: sale el más viejo, el otro queda para mañana')
await correr({ ...sinCorteEntorno, tope: 1 })
ok(mails.length === 2 && (await fila(t1)).aviso_resena_en !== null, 'y sale en la corrida siguiente')

// Reconectar limpia la marca.
await db.exec(`update mercadopago_cuentas set access_token = 'AT9-NUEVO', refresh_token = 'RT-OK-9' where vendedor_id = 9`)
ok((await q(`select aviso_renovacion_en from mercadopago_cuentas where vendedor_id = 9`))[0].aviso_renovacion_en === null, 'reconectar limpia la marca de aviso')

// ── 6. La renovación al comprar ──────────────────────────────────────────────
console.log('6. La renovación al comprar (getCuentaValida)')
// Sin client_id, MercadoPago responde 400 invalid_client a TODA renovación
// (pasó hasta el 21/10/2026: la prueba con refresh_tokens inválidos no lo veía).
ok(pedidosMp.length > 0 && pedidosMp.every((c) => c.client_id === 'id-de-la-app' && c.client_secret === 'secreto-de-la-app'
  && c.grant_type === 'refresh_token' && typeof c.refresh_token === 'string' && c.refresh_token !== ''),
  'cada pedido de renovación lleva client_id, client_secret, grant_type y el refresh_token')
await db.exec(`delete from mercadopago_cuentas; insert into mercadopago_cuentas values (18, 'VIGENTE', 'RT-MALO', now() + interval '3 days', '1818', null)`)
mails = []
let cuenta = await getCuentaValida(18, admin)
let mp = (await q(`select * from mercadopago_cuentas where vendedor_id = 18`)).map(convertir)[0]
ok(cuenta.accessToken === 'VIGENTE' && mp.renovacion_fallida_en && !mp.aviso_renovacion_en && mails.length === 0,
  'falla pero el token no venció: se usa, queda la marca, sin mail')
ok((await q(`select mercadopago_conectado c from vendedores where id = 18`))[0].c === true, 'y no desconecta')
const primeraFalla = mp.renovacion_fallida_en
await getCuentaValida(18, admin)
ok((await q(`select renovacion_fallida_en from mercadopago_cuentas where vendedor_id = 18`)).map(convertir)[0].renovacion_fallida_en === primeraFalla,
  'una segunda falla no mueve la fecha de la primera')
await db.exec(`update mercadopago_cuentas set refresh_token = 'RT-OK-X' where vendedor_id = 18`)
cuenta = await getCuentaValida(18, admin)
mp = (await q(`select * from mercadopago_cuentas where vendedor_id = 18`)).map(convertir)[0]
ok(cuenta.accessToken === 'AT-NUEVO-RT-OK-X' && mp.renovacion_fallida_en === null, 'renueva bien: token nuevo y la marca se limpia')
await db.exec(`update mercadopago_cuentas set token_expira_en = now() + interval '2 days', refresh_token = 'RT-OK-Y' where vendedor_id = 18`)
mpCaido = true
cuenta = await getCuentaValida(18, admin)
ok(cuenta.accessToken && (await q(`select renovacion_fallida_en from mercadopago_cuentas where vendedor_id = 18`))[0].renovacion_fallida_en === null,
  'MercadoPago no responde y el token sirve: se usa, sin marca (es la red)')
mpCaido = false
await db.exec(`update mercadopago_cuentas set token_expira_en = now() - interval '1 day', refresh_token = 'RT-MALO' where vendedor_id = 18`)
let lanzo = null
try { await getCuentaValida(18, admin) } catch (err) { lanzo = err.message }
ok(lanzo === 'REFRESH_RECHAZADO' && (await q(`select mercadopago_conectado c from vendedores where id = 18`))[0].c === false,
  'ya vencido de verdad y falla: como antes (desconecta y avisa el error)')

// ── 7. La ruta ───────────────────────────────────────────────────────────────
console.log('7. La ruta /api/cron/diaria')
globalThis.__f = { admin }
const ruta = await import('../src/app/api/cron/diaria/route.js')
const pedidoHttp = (url, auth) => ({ url, headers: { get: (h) => (h.toLowerCase() === 'authorization' ? auth ?? null : null) } })
delete process.env.CRON_SECRET
let r = await ruta.GET(pedidoHttp('http://x/api/cron/diaria', 'Bearer algo'))
ok(r.status === 401, 'sin CRON_SECRET cargada: 401')
process.env.CRON_SECRET = 'secreto-de-prueba'
r = await ruta.GET(pedidoHttp('http://x/api/cron/diaria'))
ok(r.status === 401, 'sin el secreto: 401')
r = await ruta.GET(pedidoHttp('http://x/api/cron/diaria', 'Bearer otro-secreto-de-prueb'))
ok(r.status === 401, 'con otro secreto: 401')
await pedido({ pagado: hace(15) })
mails = []
antes = await foto()
const logViejo = console.log
let lineaLog = ''
console.log = (...a) => { if (a[0] === '[tarea-diaria]') lineaLog = a[1]; else logViejo(...a) }
r = await ruta.GET(pedidoHttp('http://x/api/cron/diaria?prueba=1', 'Bearer secreto-de-prueba'))
console.log = logViejo
ok(r.status === 200 && r.body.prueba === true && mails.length === 0 && (await foto()) === antes, 'con el secreto y ?prueba=1: 200, sin mandar ni cambiar nada')
ok(lineaLog && !lineaLog.includes('@'), 'el resumen queda en el log, sin direcciones de mail')

console.log(fallas ? `\n${fallas} FALLA(S)` : '\nTODO OK')
process.exit(fallas ? 1 : 0)
