// Prueba la parte de JavaScript de "Eliminar mi cuenta" (src/lib/eliminarCuenta.js)
// con una base de mentira (no toca MercadoPago ni Supabase):
//
//   · ya NO se le pregunta nada a MercadoPago (antes se buscaban pagos de los
//     pedidos abandonados; desde la 031 la base los cancela directamente);
//   · los motivos de la base se respetan y se ordenan (TIENDA_ACTIVA,
//     VENTA_EN_CURSO, PEDIDO_ACTIVO, PAGO_EN_CURSO, ES_ADMIN);
//   · la tienda que devuelve la evaluación (nombre y estado);
//   · al eliminar, si se cerró o borró una tienda, se limpia su Storage.
//
// El flujo entero contra una base real está en probar:eliminar-tienda.
//
//   npm run probar:cuenta

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
const { evaluarCuenta, eliminarCuenta, resumenDeEvaluacion } = await import('../src/lib/eliminarCuenta.js')

let fallas = 0
const ok = (c, m) => { if (!c) { fallas++; console.log('  ✗', m) } else console.log('  ✓', m) }
console.log = ((log) => (...a) => { if (typeof a[0] === 'string' && /^(\s*[✓✗]|[A-ZÁÉ]|TODO|\d+ FALLAS)/.test(a[0]) && !/^Eliminar cuenta|^Storage/.test(a[0])) log(...a) })(console.log)
console.error = () => {}

// MercadoPago no se toca: cualquier llamada de red es una falla.
let llamadasDeRed = 0
globalThis.fetch = async () => { llamadasDeRed++; throw new Error('no debería llamar a la red') }

// Un cliente de Supabase de mentira, encadenable.
function admin({ evaluar, cerrar = null, tablas = {} }) {
  const borrados = []
  return {
    borrados,
    rpc: async (nombre) => (nombre === 'rpc_cerrar_cuenta' ? cerrar : evaluar),
    from(tabla) {
      const fila = tablas[tabla] ?? []
      const q = {}
      for (const m of ['select', 'eq', 'not', 'in', 'is', 'order', 'limit']) q[m] = () => q
      q.maybeSingle = async () => ({ data: Array.isArray(fila) ? fila[0] ?? null : fila, error: null })
      q.then = (res) => res({ data: fila, error: null })
      return q
    },
    storage: {
      from: (bucket) => ({
        list: async (carpeta) => ({ data: [{ name: 'a.webp', id: '1' }], error: null }),
        remove: async (rutas) => { borrados.push(...rutas.map((r) => `${bucket}/${r}`)); return { error: null } },
      }),
    },
  }
}
const base = (extra = {}) => ({ data: { existe: true, cerrada: false, es_admin: false, es_validador: false, tiendas: 0, tienda: null, ventas_tienda_en_curso: 0, pedidos_activos: 0, pagos_en_curso: 0, pedidos_total: 2, motivos: [], abandonados: [{ id: 7, vendedor_id: 3, mp_preference_id: 'p-7' }], ...extra }, error: null })
const tablas = { pedidos: [], usuarios: [{ nombre_usuario: 'Zorro Sereno' }] }

console.log('Evaluar: sin MercadoPago')
let r = await evaluarCuenta(admin({ evaluar: base(), tablas }), 'u')
ok(r.ok && r.puede && r.apodo === 'Zorro Sereno', 'con pedidos abandonados: se puede, sin consultar nada')
ok(llamadasDeRed === 0, 'ninguna llamada a MercadoPago')
ok(!('abandonados' in resumenDeEvaluacion(r)), 'el resumen no expone los pedidos abandonados')

console.log('Evaluar: los motivos de la base')
r = await evaluarCuenta(admin({ evaluar: base({ motivos: ['TIENDA_ACTIVA'], tiendas: 1, tienda: { id: 4, nombre: 'Mi Tienda', estado: 'activa' } }), tablas }), 'u')
ok(r.ok && !r.puede && r.motivos[0] === 'TIENDA_ACTIVA' && r.tienda?.nombre === 'Mi Tienda' && r.tienda.estado === 'activa', 'TIENDA_ACTIVA, con el nombre de la tienda')
ok(!('id' in r.tienda), 'de la tienda viaja el nombre y el estado, no el id')
r = await evaluarCuenta(admin({ evaluar: base({ motivos: ['PAGO_EN_CURSO', 'ES_ADMIN', 'VENTA_EN_CURSO', 'PEDIDO_ACTIVO'], ventas_tienda_en_curso: 2 }), tablas }), 'u')
ok(r.motivos.join(',') === 'VENTA_EN_CURSO,PEDIDO_ACTIVO,PAGO_EN_CURSO,ES_ADMIN', 'en el orden de la pantalla')
ok(r.numeros.ventas_tienda_en_curso === 2, 'con cuántas ventas en curso (para el admin)')
r = await evaluarCuenta(admin({ evaluar: base({ tienda: { id: 4, nombre: 'Pausadita', estado: 'pausada' } }), tablas }), 'u')
ok(r.puede && r.tienda?.estado === 'pausada', 'una tienda pausada sin ventas: se puede, y la pantalla sabe que la cierra')
r = await evaluarCuenta({ rpc: async () => ({ data: null, error: { message: 'x' } }) }, 'u')
ok(r.ok === false && r.error === 'error', 'si la base falla: error (no "MercadoPago no responde")')

console.log('Eliminar')
let a = admin({ cerrar: { data: { ok: true, resultado: 'anonimizada', emails: ['x@y.z'], nombre: 'Ana', tienda: { id: 9, nombre: 'Ludo', accion: 'cerrada' } }, error: null }, tablas: { productos: [] } })
r = await eliminarCuenta(a, 'u')
ok(r.ok && r.resultado === 'anonimizada' && r.tienda?.accion === 'cerrada' && r.tienda.nombre === 'Ludo', 'devuelve la tienda cerrada, con su nombre (para el mail)')
ok(a.borrados.includes('logos/9/a.webp') && a.borrados.includes('portadas/9/a.webp') && a.borrados.includes('productos/9/a.webp'), 'y limpia su Storage (sin productos que queden: todo)')
a = admin({ cerrar: { data: { ok: true, resultado: 'borrada', emails: [], nombre: null, tienda: null }, error: null } })
r = await eliminarCuenta(a, 'u')
ok(r.ok && r.tienda === null && a.borrados.length === 0, 'sin tienda: no toca Storage')
a = admin({ cerrar: { data: { ok: false, motivos: ['VENTA_EN_CURSO'] }, error: null }, evaluar: base({ motivos: ['VENTA_EN_CURSO'] }), tablas })
r = await eliminarCuenta(a, 'u')
ok(!r.ok && r.status === 409 && r.evaluacion.motivos.includes('VENTA_EN_CURSO'), 'si la base lo impide: 409 con los motivos')
ok(llamadasDeRed === 0, 'y en ningún momento se llamó a MercadoPago')

console.log(fallas ? `${fallas} FALLAS` : 'TODO OK')
process.exit(fallas ? 1 : 0)
