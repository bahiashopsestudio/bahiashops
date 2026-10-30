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

import { fechaLarga } from '@/lib/fechas'

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

// ── Cómo se escriben una comisión y sus fechas (panel y admin) ──

// 250 -> '2,5%', 100 -> '1%', 0 -> '0%'.
export function textoPorcentaje(bp) {
  return `${(Number(bp) / 100).toLocaleString('es-AR', { maximumFractionDigits: 2 })}%`
}

function centavos(valor) {
  const n = Number(valor)
  return Number.isFinite(n) ? Math.round(n * 100) : 0
}

// Lo que un pedido hubiera pagado al 5% menos lo que pagó, en pesos. La misma
// cuenta que calcularPedido al 5%: en enteros, medio centavo para arriba.
export function ahorroAlCinco(subtotal, comision) {
  const alCinco = Math.floor((centavos(subtotal) * COMISION_BASE_BP + 5000) / 10000)
  return (alCinco - centavos(comision)) / 100
}

const ZONA = 'America/Argentina/Buenos_Aires'

// «Vence el 31/12» vale todo ese día: se guarda el día siguiente a las 00:00
// de Argentina. '2026-12-31' -> '2027-01-01T00:00:00-03:00'. null si el día no
// existe. Argentina no tiene horario de verano desde 2009: el -03:00 es fijo.
export function venceEnDesdeDia(dia) {
  const partes = /^(\d{4})-(\d{2})-(\d{2})$/.exec(typeof dia === 'string' ? dia : '')
  if (!partes) return null
  const [anio, mes, numero] = partes.slice(1).map(Number)
  const elegido = new Date(Date.UTC(anio, mes - 1, numero))
  if (elegido.getUTCMonth() !== mes - 1 || elegido.getUTCDate() !== numero) return null
  const siguiente = new Date(Date.UTC(anio, mes - 1, numero + 1))
  return `${siguiente.toISOString().slice(0, 10)}T00:00:00-03:00`
}

// Hoy en Argentina, 'YYYY-MM-DD' (como lo usa <input type="date">).
export function hoyEnArgentina(ahoraMs = Date.now()) {
  return new Intl.DateTimeFormat('en-CA', { timeZone: ZONA }).format(new Date(ahoraMs))
}

// "31 de diciembre", con el año solo si no es el año en curso en Argentina:
// "31 de diciembre de 2027". '' si la fecha no se puede leer.
export function fechaDeComision(valor, ahoraMs = Date.now()) {
  const texto = fechaLarga(valor)
  if (!texto) return ''
  const anio = hoyEnArgentina(valor instanceof Date ? valor.getTime() : Date.parse(valor)).slice(0, 4)
  return anio === hoyEnArgentina(ahoraMs).slice(0, 4) ? texto : `${texto} de ${anio}`
}

// El último día que vale un vence_en: el anterior al instante guardado.
export function ultimoDiaQueVale(venceEn, ahoraMs = Date.now()) {
  return fechaDeComision(new Date(Date.parse(venceEn) - 1), ahoraMs)
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
