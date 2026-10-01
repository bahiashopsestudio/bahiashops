// Prueba la consulta a MercadoPago de "Eliminar mi cuenta" con respuestas de
// mentira (no toca MercadoPago ni Supabase): que ante cualquier respuesta con
// una forma inesperada se trate como "MercadoPago no responde" y no se elimine
// nada, y que un pago en camino frene la eliminación.
//
//   node scripts/probar-eliminar-cuenta.mjs

import { register } from 'node:module'
const raiz = new URL('../', import.meta.url)
const alias = `
const src = ${JSON.stringify(new URL('src/', raiz).href)}
export function resolve(esp, ctx, sig) {
  if (esp.startsWith('@/')) { const r = src + esp.slice(2); return sig(r.endsWith('.js') ? r : r + '.js', ctx) }
  if (esp.startsWith('./') && !esp.endsWith('.js')) return sig(esp + '.js', ctx)
  return sig(esp, ctx)
}`
register('data:text/javascript,' + encodeURIComponent(alias))
const { evaluarCuenta } = await import('../src/lib/eliminarCuenta.js')

let fallas = 0
const ok = (c, m) => { if (!c) { fallas++; console.log('  ✗', m) } else console.log('  ✓', m) }

// Un cliente de Supabase de mentira, encadenable.
function admin({ evaluar, tablas = {} }) {
  return {
    rpc: async () => evaluar,
    from(tabla) {
      const fila = tablas[tabla] ?? []
      const q = { _fila: fila }
      for (const m of ['select', 'eq', 'not', 'in', 'order', 'limit']) q[m] = () => q
      q.single = async () => ({ data: tabla === 'mercadopago_cuentas' ? { access_token: 'T', refresh_token: 'R', token_expira_en: '2099-01-01' } : null, error: null })
      q.maybeSingle = async () => ({ data: Array.isArray(fila) ? fila[0] ?? null : fila, error: null })
      q.then = (res) => res({ data: fila, error: null })
      return q
    },
  }
}
const base = (abandonados) => ({ data: { existe: true, cerrada: false, es_admin: false, es_validador: false, tiendas: 0, pedidos_activos: 0, pagos_en_curso: 0, pedidos_total: abandonados.length, motivos: [], abandonados }, error: null })
const aband = [{ id: 7, vendedor_id: 3, mp_preference_id: 'p-7' }]
const tablas = { vendedores: [], pedidos: [], usuarios: [{ nombre_usuario: 'Zorro Sereno' }] }
const conFetch = (respuesta) => { globalThis.fetch = async () => respuesta(); }
const json = (status, cuerpo) => () => ({ ok: status >= 200 && status < 300, status, json: async () => cuerpo })

console.log('Búsqueda de pagos a la defensiva')
conFetch(json(200, { paging: {}, results: [] }))
let r = await evaluarCuenta(admin({ evaluar: base(aband), tablas }), 'u')
ok(r.ok && r.puede, 'sin pagos: se puede eliminar')

conFetch(json(200, { results: [{ id: 1, status: 'approved' }] }))
r = await evaluarCuenta(admin({ evaluar: base(aband), tablas }), 'u')
ok(r.ok && !r.puede && r.motivos.includes('PAGO_EN_CURSO'), 'un pago aprobado que la base no vio: PAGO_EN_CURSO')

conFetch(json(200, { results: [{ id: 1, status: 'in_process' }] }))
r = await evaluarCuenta(admin({ evaluar: base(aband), tablas }), 'u')
ok(r.ok && r.motivos.includes('PAGO_EN_CURSO'), 'un pago en proceso: PAGO_EN_CURSO')

conFetch(json(200, { results: [{ id: 1, status: 'rejected' }, { id: 2, status: 'cancelled' }] }))
r = await evaluarCuenta(admin({ evaluar: base(aband), tablas }), 'u')
ok(r.ok && r.puede, 'solo pagos rechazados o cancelados: se puede')

for (const [nombre, f] of [
  ['MercadoPago responde 500', json(500, {})],
  ['MercadoPago responde 401', json(401, {})],
  ['results no es una lista', json(200, { results: { a: 1 } })],
  ['sin results', json(200, {})],
  ['un pago sin status', json(200, { results: [{ id: 1 }] })],
  ['cuerpo null', json(200, null)],
  ['no es JSON', () => ({ ok: true, status: 200, json: async () => { throw new Error('x') } })],
  ['la red falla', () => { throw new Error('ECONNRESET') }],
]) {
  conFetch(f)
  r = await evaluarCuenta(admin({ evaluar: base(aband), tablas }), 'u')
  ok(r.ok === false && r.error === 'mp_no_responde', `${nombre}: se trata como "MercadoPago no responde"`)
}

console.log('Sin pedidos abandonados no se llama a MercadoPago')
let llamadas = 0
globalThis.fetch = async () => { llamadas++; return json(200, { results: [] })() }
r = await evaluarCuenta(admin({ evaluar: base([]), tablas }), 'u')
ok(r.ok && r.puede && llamadas === 0, 'no hace falta consultar')

console.log('La base impide: se respeta')
const imp = base([]); imp.data.motivos = ['TIENDA']; imp.data.tiendas = 1
r = await evaluarCuenta(admin({ evaluar: imp, tablas: { ...tablas, vendedores: [{ nombre_negocio: 'Mi Tienda' }] } }), 'u')
ok(r.ok && !r.puede && r.motivos[0] === 'TIENDA' && r.tienda?.nombre === 'Mi Tienda', 'TIENDA con el nombre del negocio')

console.log(fallas ? `${fallas} FALLAS` : 'TODO OK')
process.exit(fallas ? 1 : 0)
