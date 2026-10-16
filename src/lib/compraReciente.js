// El carrito vive en el navegador (src/lib/carrito.js) y se vacía al volver de
// MercadoPago (/compra/exito y /compra/pendiente). Si la persona no vuelve
// (cerró la pestaña, pagó desde otro dispositivo, se le venció la sesión), el
// carrito queda lleno y puede comprar lo mismo dos veces. Esto es el respaldo:
// al cargar el carrito con sesión se cruza contra los pedidos propios recientes
// y sale lo que ya se compró. Y el checkout avisa si ya hay una compra en curso
// en esa tienda.
//
// Funciones puras (salvo comprasRecientes, que recibe el cliente de Supabase)
// para poder probarlas sin navegador: npm run probar:compra-reciente

import { ESTADOS_CON_PAGO, ESTADO_REEMBOLSADO } from './pedidos.js'
import { PLAZO_CUPON_DIAS, pedidoTienePago, pedidoVencido } from './vencimientoPago.js'

// Hasta cuánto para atrás se mira: el plazo más largo para pagar (el cupón en
// efectivo). Una compra más vieja ya no es "la que quedó en el carrito".
export const VENTANA_COMPRA_RECIENTE_MS = PLAZO_CUPON_DIAS * 24 * 60 * 60 * 1000

// Lo que hace falta leer de cada pedido.
export const CAMPOS_COMPRA_RECIENTE = 'id, vendedor_id, estado, creado_en, vence_en, efectivo_vence_en, mp_payment_id, cancelado_motivo'

// ¿Este pedido es una compra hecha (o en curso) en la ventana?
//   · Tuvo un pago aprobado (pagado y los pasos que siguen): sí. Reembolsado no:
//     la plata volvió y la persona puede querer comprarlo de nuevo.
//   · Pendiente CON un pago en proceso (cupón en efectivo, tarjeta que se
//     acredita) que no venció: sí, es una venta en curso.
//   · Pendiente SIN pago: no. Es alguien que fue a MercadoPago y volvió sin
//     pagar; vaciarle el carrito sería perderle lo que eligió.
//   · Rechazado, cancelado: no.
export function esCompraEnCurso(pedido, ahoraMs = Date.now()) {
  if (!pedido) return false
  const creado = Date.parse(pedido.creado_en)
  if (!Number.isFinite(creado) || ahoraMs - creado > VENTANA_COMPRA_RECIENTE_MS) return false
  if (pedido.estado !== ESTADO_REEMBOLSADO && ESTADOS_CON_PAGO.includes(pedido.estado)) return true
  return pedido.estado === 'pendiente' && pedidoTienePago(pedido) && !pedidoVencido(pedido, ahoraMs)
}

// La compra en curso más reciente de esa tienda, o null.
export function compraEnCursoDeLaTienda(pedidos, vendedorId, ahoraMs = Date.now()) {
  if (!Array.isArray(pedidos)) return null
  let ultima = null
  for (const p of pedidos) {
    if (String(p?.vendedor_id) !== String(vendedorId) || !esCompraEnCurso(p, ahoraMs)) continue
    if (!ultima || Date.parse(p.creado_en) > Date.parse(ultima.creado_en)) ultima = p
  }
  return ultima
}

// Saca del carrito lo que ya se compró: de cada tienda con una compra en curso,
// los productos que estaban en el carrito ANTES de esa compra. Lo que se agregó
// después es una compra nueva y se queda. Un producto sin fecha (carritos
// guardados antes de que existiera agregadoEn) cuenta como viejo. Si una tienda
// queda sin productos, sale. Las demás tiendas no se tocan.
//
// Devuelve el mismo array si no hay nada que sacar (para no re-renderizar).
export function sinLoYaComprado(locales, pedidos, ahoraMs = Date.now()) {
  if (!Array.isArray(locales)) return []
  let cambio = false
  const resultado = []
  for (const local of locales) {
    const compra = local ? compraEnCursoDeLaTienda(pedidos, local.vendedorId, ahoraMs) : null
    if (!compra) { resultado.push(local); continue }
    const compradoEn = Date.parse(compra.creado_en)
    const items = (local.items || []).filter((it) => Number(it?.agregadoEn) > compradoEn)
    if (items.length === (local.items || []).length) { resultado.push(local); continue }
    cambio = true
    if (items.length > 0) resultado.push({ ...local, items })
  }
  return cambio ? resultado : locales
}

// Los pedidos propios de la ventana. Sin sesión no consulta nada y devuelve
// null (no se puede cruzar). Con error también null: el carrito queda como está.
export async function comprasRecientes(supabase, ahoraMs = Date.now()) {
  try {
    const { data: { user } = {} } = await supabase.auth.getUser()
    if (!user) return null
    const desde = new Date(ahoraMs - VENTANA_COMPRA_RECIENTE_MS).toISOString()
    const { data, error } = await supabase
      .from('pedidos')
      .select(CAMPOS_COMPRA_RECIENTE)
      .eq('comprador_id', user.id)
      .gte('creado_en', desde)
    if (error) { console.error('No se pudieron leer las compras recientes', error); return null }
    return data || []
  } catch (e) {
    console.error('No se pudieron leer las compras recientes', e)
    return null
  }
}
