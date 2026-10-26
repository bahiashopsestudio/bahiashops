// Qué comisión cobra la plataforma en un pedido. Funciones puras: no tocan la
// base ni la red. Las usa /api/pedidos/crear y las prueba
// scripts/probar-comision.mjs.
//
// Los porcentajes van en puntos básicos enteros: 500 = 5%, 250 = 2,5%. Así se
// guardan en el pedido (pedidos.comision_bp, migración 041) y así los usa
// calcularPedido (src/lib/precioPedido.js), que hace la cuenta en centavos.
//
// La regla:
//   1. 5% si quien compra llegó solo.
//   2. 2,5% si llegó por el link propio de la tienda (?de=tienda): una marca
//      en su navegador (src/lib/marcaLink.js) que dura 48 horas desde que lo
//      tocó y vale solo para esa tienda.
//   3. Si la tienda tiene una comisión especial vigente (vendedor_comisiones,
//      migración 042) y es MÁS BAJA que la que corresponde, esa. Una promo
//      nunca perjudica a la tienda. Si empatan, queda el motivo anterior.
//
// El origen es 'link_tienda' aunque termine aplicando la especial: el panel y
// los avisos cuentan las ventas por link.
//
// La comisión la paga la tienda, no quien compra: nadie gana nada falsificando
// la marca. Por eso no va firmada.

export const COMISION_BASE_BP = 500
export const COMISION_LINK_BP = 250

// Cuánto dura la marca desde que se tocó el link.
export const VIGENCIA_MARCA_MS = 48 * 60 * 60 * 1000
// Un reloj del navegador un poco adelantado no la invalida.
export const TOLERANCIA_RELOJ_MS = 5 * 60 * 1000

function ms(valor) {
  if (valor === null || valor === undefined || valor === '') return null
  const n = typeof valor === 'number' ? valor : Date.parse(valor)
  return Number.isFinite(n) ? n : null
}

// ¿La marca del link (en milisegundos, como la guarda el navegador) sigue
// valiendo? Entre ahora − 48 h y ahora + 5 min. Cualquier otra cosa (texto,
// negativo, con decimales) no vale.
export function marcaVigente(tocadoEnMs, ahoraMs) {
  if (typeof tocadoEnMs !== 'number' || !Number.isSafeInteger(tocadoEnMs) || tocadoEnMs <= 0) return false
  return tocadoEnMs >= ahoraMs - VIGENCIA_MARCA_MS && tocadoEnMs <= ahoraMs + TOLERANCIA_RELOJ_MS
}

// La especial vigente de una tienda, o null. Recibe las filas de
// vendedor_comisiones ({ comision_bp, desde, vence_en, terminada_en }).
// Vigente: no terminada, ya empezó y no venció (vence_en null = sin
// vencimiento). Si por un choque hubiera dos, la más baja.
export function especialVigente(filas, ahoraMs) {
  let elegida = null
  for (const f of filas || []) {
    if (!f || !Number.isInteger(f.comision_bp)) continue
    if (f.terminada_en) continue
    const desde = ms(f.desde)
    if (desde === null || desde > ahoraMs) continue
    const vence = ms(f.vence_en)
    if (f.vence_en && (vence === null || vence <= ahoraMs)) continue
    if (!elegida || f.comision_bp < elegida.comision_bp) elegida = f
  }
  return elegida
}

// ── La especial que carga el admin (/api/admin/vendedores/[id]/comisiones) ──

// El CHECK vendedor_comisiones_motivo_check (migración 042).
export const MAX_MOTIVO_ESPECIAL = 300

// El porcentaje que escribe el admin ('1,5', 1.5, '0') en puntos básicos, o
// null si no es de 0 a 4,99 con hasta dos decimales. 5% o más no tendría
// efecto: siempre gana la más baja.
export function porcentajeABp(valor) {
  const texto = typeof valor === 'number' ? String(valor)
    : typeof valor === 'string' ? valor.trim().replace(',', '.')
    : ''
  if (!/^\d+(\.\d{1,2})?$/.test(texto)) return null
  const bp = Math.round(Number(texto) * 100)
  return bp >= 0 && bp < COMISION_BASE_BP ? bp : null
}

// Para el historial del admin: 'vigente', 'vencida' o 'terminada'.
export function estadoDeComision(fila, ahoraMs) {
  if (fila.terminada_en) return 'terminada'
  const vence = ms(fila.vence_en)
  if (fila.vence_en && (vence === null || vence <= ahoraMs)) return 'vencida'
  return 'vigente'
}

// La comisión de un pedido.
//
//   linkTocadoEn  la marca que mandó el checkout para ESA tienda (ms) o null
//   especiales    las filas de vendedor_comisiones de la tienda
//
// Devuelve { bp, motivo, origen, linkTocadoEn } con linkTocadoEn en ms (solo
// si el origen es el link; si no, null).
export function elegirComision({ linkTocadoEn = null, especiales = [], ahoraMs }) {
  let bp = COMISION_BASE_BP
  let motivo = 'base'
  let origen = 'directo'
  let tocado = null

  if (marcaVigente(linkTocadoEn, ahoraMs)) {
    bp = COMISION_LINK_BP
    motivo = 'link'
    origen = 'link_tienda'
    tocado = linkTocadoEn
  }

  const especial = especialVigente(especiales, ahoraMs)
  if (especial && especial.comision_bp < bp) {
    bp = especial.comision_bp
    motivo = 'especial'
  }

  return { bp, motivo, origen, linkTocadoEn: tocado }
}
