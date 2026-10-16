// La máquina de estados de un pedido. Vive acá, en funciones puras, para que
// la regla se pueda leer de un vistazo y probar sin levantar nada. Es la ÚNICA
// definición de los pasos de entrega: la leen el panel de la tienda, Mis
// pedidos, los mails y la ruta que avanza un pedido.
//
// Quién escribe qué:
//
//   pendiente, pagado, rechazado, cancelado,   -> SOLO el webhook de MercadoPago
//   reembolsado
//   preparando, listo, franja, despachado,     -> SOLO la tienda, y sólo
//   acordado, entregado                           avanzando de a un paso
//
// La tienda no puede tocar los estados de pago ni con la mejor intención: no
// aparecen como destino en SECUENCIAS, así que no hay forma de llegar a ellos
// por esta puerta. La base exige los doce estados con un CHECK (migración 036).

import { tipoEntregaDe } from './metodosEntrega.js'
import { esPagoEnEfectivoPendiente, pedidoVencido } from './vencimientoPago.js'

// ── Pasos de entrega ──────────────────────────────────────────────────────────

// La forma de entrega de un pedido, para elegir sus pasos y sus textos:
// 'retiro', 'envio' (la tienda lo lleva a la dirección), 'correo' o
// 'coordinar' (el resto, incluido un valor desconocido).
export function formaDeEntrega(metodoEnvio) {
  const tipo = tipoEntregaDe(metodoEnvio)
  if (tipo === 'retiro') return 'retiro'
  if (tipo === 'domicilio') return 'envio'
  if (tipo === 'correo') return 'correo'
  return 'coordinar'
}

// Los pasos de cada forma de entrega, en orden. Todas terminan en 'entregado',
// que marca la tienda.
export const SECUENCIAS = {
  retiro: ['pagado', 'preparando', 'listo', 'entregado'],
  envio: ['pagado', 'preparando', 'franja', 'despachado', 'entregado'],
  correo: ['pagado', 'preparando', 'despachado', 'entregado'],
  coordinar: ['pagado', 'preparando', 'acordado', 'entregado'],
}

export const ESTADO_ENTREGADO = 'entregado'

// Los pasos de antes de las secuencias por forma de entrega: todos los pedidos
// iban por acá. Un pedido viejo puede haber quedado en uno que su forma ya no
// tiene: 'por_salir' (que no existe en ninguna) o, por ejemplo, un retiro en
// 'despachado'.
const PASOS_VIEJOS = ['pagado', 'preparando', 'franja', 'por_salir', 'despachado']

// Cómo se llama cada paso en el panel y en Mis pedidos.
export const NOMBRE_PASO = {
  pagado: 'Pagado',
  preparando: 'Preparando',
  listo: 'Listo para retirar',
  franja: 'Franja avisada',
  despachado: 'Despachado',
  acordado: 'Acordado',
  entregado: 'Entregado',
  // Solo pedidos viejos.
  por_salir: 'Por salir',
}

// El paso al que puede ir este pedido, o null si no hay ninguno (estado final,
// de pago, o desconocido: falla cerrado).
//
// Un pedido viejo, en un paso que su forma ya no tiene: 'por_salir' va a
// 'despachado' si su forma despacha (envío, correo) y si no a 'entregado';
// cualquier otro paso viejo va directo a 'entregado'.
export function siguientePaso(pedido) {
  const estado = pedido?.estado
  const secuencia = SECUENCIAS[formaDeEntrega(pedido?.metodo_envio)]
  const i = secuencia.indexOf(estado)
  if (i >= 0) return secuencia[i + 1] || null
  if (estado === 'por_salir') return secuencia.includes('despachado') ? 'despachado' : ESTADO_ENTREGADO
  if (PASOS_VIEJOS.includes(estado)) return ESTADO_ENTREGADO
  return null
}

// Los pasos para dibujar la barra de este pedido. Un pedido viejo, fuera de su
// secuencia, muestra los pasos viejos por los que pasó y después lo que le
// queda de la secuencia nueva. Un estado que no es un paso (pendiente,
// reembolsado, cancelado...) no tiene barra: [].
export function pasosDe(pedido) {
  const estado = pedido?.estado
  const secuencia = SECUENCIAS[formaDeEntrega(pedido?.metodo_envio)]
  if (secuencia.includes(estado)) return secuencia
  if (!PASOS_VIEJOS.includes(estado)) return []
  const siguiente = siguientePaso(pedido)
  const hechos = PASOS_VIEJOS.slice(0, PASOS_VIEJOS.indexOf(estado) + 1)
  return [...hechos, ...secuencia.slice(secuencia.indexOf(siguiente))]
}

// Los estados que sólo escribe el webhook. Están acá para poder dar un error
// que explique por qué, en vez de un "transición inválida" seco.
export const ESTADOS_DE_PAGO = ['pendiente', 'pagado', 'rechazado', 'cancelado']

// El pago guardado en el pedido volvió como refunded o charged_back. También
// lo escribe sólo el webhook, pero va aparte de ESTADOS_DE_PAGO: esos son los
// estados en los que un pedido todavía admite un pago, y a un pedido
// reembolsado no le entra ninguno.
export const ESTADO_REEMBOLSADO = 'reembolsado'

// El único estado en el que se pide la franja horaria.
export const ESTADO_PIDE_FRANJA = 'franja'

export const FRANJAS_VALIDAS = ['Mañana', 'Tarde', 'Noche']

// ¿Puede este vendedor llevar este pedido a ese estado?
//
// Devuelve { ok: true, siguiente } o { ok: false, motivo, error, status }.
// 'error' es el texto que se le muestra a la persona; 'motivo' es la etiqueta
// para los logs y las pruebas. El pedido tiene que traer metodo_envio: de ahí
// sale su secuencia.
export function validarAvance({ pedido, vendedorId, destino }) {
  if (!pedido) {
    return { ok: false, motivo: 'no_existe', status: 404, error: 'No encontramos ese pedido.' }
  }

  // Lo primero, siempre: ¿es suyo? Antes que cualquier otra cosa, para no
  // filtrar por el mensaje de error si un pedido existe o en qué estado está.
  if (pedido.vendedor_id !== vendedorId) {
    return { ok: false, motivo: 'ajeno', status: 404, error: 'No encontramos ese pedido.' }
  }

  if (pedido.estado === ESTADO_REEMBOLSADO) {
    return {
      ok: false,
      motivo: 'reembolsado',
      status: 409,
      error: 'Este pedido se canceló y el dinero volvió al comprador: no hay que prepararlo ni entregarlo.',
    }
  }

  const siguiente = siguientePaso(pedido)

  if (!siguiente) {
    return {
      ok: false,
      motivo: 'sin_avance',
      status: 409,
      error: pedido.estado === ESTADO_ENTREGADO
        ? 'Este pedido ya está entregado.'
        : `Un pedido en estado "${pedido.estado}" no tiene un paso siguiente.`,
    }
  }

  if (!destino) {
    return { ok: false, motivo: 'sin_destino', status: 400, error: 'Falta indicar a qué estado avanzar.' }
  }

  if (destino !== siguiente) {
    if (ESTADOS_DE_PAGO.includes(destino) || destino === ESTADO_REEMBOLSADO) {
      return {
        ok: false,
        motivo: 'estado_de_pago',
        status: 403,
        error: `El estado "${destino}" lo maneja el cobro, no el vendedor.`,
      }
    }
    return {
      ok: false,
      motivo: 'transicion_invalida',
      status: 409,
      error: `Desde "${pedido.estado}" el único paso siguiente es "${siguiente}", no "${destino}".`,
    }
  }

  return { ok: true, siguiente }
}

// ── Datos de contacto de quien compró ─────────────────────────────────────────
//
// La tienda recibe los datos duros de quien compra (nombre, apellido, teléfono,
// dirección: lo que permite contactar a la persona) recién cuando el pedido se
// pagó. Antes del pago, solo ve el apodo. Es una decisión de producto: quien
// abandona un carrito no tiene por qué quedar en manos de la tienda.
//
// El criterio es "el pedido tuvo un pago aprobado alguna vez", NO el estado de
// hoy: un pedido reembolsado (Cancelado · dinero devuelto) se pagó, y la tienda
// necesita los datos para coordinar la devolución. Se deduce del estado porque
// la máquina de estados no vuelve atrás: desde un estado pagado solo se avanza,
// o se pasa a 'reembolsado' (reembolso o contracargo, que exigen un pago
// aprobado). Un pago en proceso (pendiente con mp_payment_id) NO cuenta, y un
// estado que no se conozca tampoco: falla cerrado.
export const ESTADOS_CON_PAGO = [
  'pagado', 'preparando', 'franja', 'por_salir', 'despachado', 'listo', 'acordado', ESTADO_ENTREGADO,
  ESTADO_REEMBOLSADO,
]

export function pedidoTuvoPago(pedido) {
  return ESTADOS_CON_PAGO.includes(pedido?.estado)
}

// Los pedidos en los que quien compró puede "Reclamar" (escribirle a la tienda
// por WhatsApp): pagados, de 'pagado' a 'entregado'. No un reembolsado.
export const ESTADOS_PARA_RECLAMAR = ESTADOS_CON_PAGO.filter((e) => e !== ESTADO_REEMBOLSADO)

// Lo que "Mis pedidos" le muestra a quien compró: las ventas (pedidos que tuvieron
// un pago) y los pagos en efectivo en proceso, que son ventas en curso. Un
// pedido que nunca se pagó (el link venció, o se rechazó) no es una compra: es
// un carrito abandonado y no aparece. La única excepción es un cupón en efectivo
// que venció sin pagarse: queda a la vista, para que quien lo generó sepa qué
// pasó.
export function esVentaVisible(pedido) {
  if (pedidoTuvoPago(pedido)) return true
  if (esPagoEnEfectivoPendiente(pedido)) return true
  return pedido?.estado === 'cancelado' && pedido.cancelado_motivo === 'pago_vencido' && !!pedido.efectivo_vence_en
}

// En qué pestaña del panel de la tienda va un pedido: 'nuevos' (Nuevos
// pedidos) o 'entregados'. Devuelve null si el pedido NO es una venta de la
// tienda: entonces el servidor ni lo manda (o lo manda como carrito).
//
//   Nuevos pedidos  pagado y todos los pasos hasta antes de entregado; y un
//                   pago en efectivo en proceso con el cupón todavía vigente
//                   (solo la etiqueta, sin botones ni datos de contacto)
//   Entregados      entregado; y reembolsado, que la pantalla muestra aparte,
//                   debajo, como "Cancelados · dinero devuelto"
//
// Un cupón que venció sin pagarse NO es una venta: es un carrito abandonado, y
// la tienda lo va a ver recién en la sección de carritos abandonados. Tampoco
// lo son los pedidos pendientes sin pago, los rechazados ni los demás cancelados.
export function pestanaDePedido(pedido, ahoraMs = Date.now()) {
  const estado = pedido?.estado
  if (estado === ESTADO_ENTREGADO || estado === ESTADO_REEMBOLSADO) return 'entregados'
  if (ESTADOS_CON_PAGO.includes(estado)) return 'nuevos'
  if (esPagoEnEfectivoPendiente(pedido)) {
    const vence = Date.parse(pedido.efectivo_vence_en)
    return Number.isFinite(vence) && vence > ahoraMs ? 'nuevos' : null
  }
  return null
}

// La misma regla, del lado de la pantalla. Lo que le llega a la tienda no trae
// mp_payment_id (no viaja), así que no se puede volver a pasar por
// pestanaDePedido: el servidor manda la pestaña ya calculada (`pestana`) y acá
// solo se revisa que un cupón no haya vencido con el panel abierto.
export function pestanaEnElPanel(pedido, ahoraMs = Date.now()) {
  const pestana = pedido?.pestana
  if (!['nuevos', 'entregados', 'carritos'].includes(pestana)) return null
  // Para carritos no hay chequeo de vencimiento de cupón.
  if (pestana === 'carritos') return 'carritos'
  if (pedido.estado === 'pendiente') {
    const vence = Date.parse(pedido.efectivo_vence_en)
    return Number.isFinite(vence) && vence > ahoraMs ? pestana : null
  }
  return pestana
}

// ¿Es un carrito abandonado? Un pedido que no es una venta (pestanaDePedido da
// null) y que venció sin pagarse (pedidoVencido en vencimientoPago.js): un
// pendiente con el link vencido y sin ningún pago, un cupón en efectivo vencido,
// o uno ya cancelado por pago_vencido. También uno cancelado porque la tienda
// cambió o desconectó su cuenta de MercadoPago (cuenta_mp_cambiada): quien
// compró no llegó a pagar, y la tienda puede recordárselo. NO lo son: un
// pendiente con el link todavía vivo (la persona puede estar pagando en este
// momento), uno con un pago en proceso sin cupón (una tarjeta que se está
// acreditando), los rechazados y los cancelados por otro motivo.
export function esCarritoAbandonado(pedido, ahoraMs = Date.now()) {
  if (!pedido) return false
  if (pestanaDePedido(pedido, ahoraMs) !== null) return false
  // Va acá y no en pedidoVencido: ese no es un vencimiento, y pedidoVencido lo
  // usan también el cambio de cuenta y el vencimiento de los pedidos.
  if (pedido.estado === 'cancelado' && pedido.cancelado_motivo === 'cuenta_mp_cambiada') return true
  return pedidoVencido(pedido, ahoraMs)
}

// Lo que se saca de un pedido antes de mandárselo a la tienda si no se pagó.
// comprador_id nunca viaja (ya lo saca la ruta): sale el apodo, aparte.
const CAMPOS_DE_CONTACTO = ['comprador_nombre', 'comprador_apellido', 'comprador_telefono', 'direccion_copia', 'direccion', 'barrio_nombre']

// Devuelve el pedido tal como puede verlo la tienda: con los datos de contacto
// si se pagó y con esos campos en null si no, más `datos_de_contacto`
// ('visibles' u 'ocultos') para que la pantalla elija el texto. Una copia: no
// toca el original.
export function pedidoParaLaTienda(pedido) {
  const visibles = pedidoTuvoPago(pedido)
  const copia = { ...pedido, datos_de_contacto: visibles ? 'visibles' : 'ocultos' }
  if (!visibles) {
    for (const campo of CAMPOS_DE_CONTACTO) copia[campo] = null
  }
  return copia
}

// ── Textos para quien compró (Mis pedidos) ────────────────────────────────────

const LINEAS_DE_ESTADO = {
  retiro: {
    pagado: 'La tienda ya tiene tu pedido.',
    preparando: 'Lo están preparando.',
    listo: 'Ya podés pasar a buscarlo.',
    entregado: 'Lo retiraste.',
  },
  envio: {
    pagado: 'La tienda ya tiene tu pedido.',
    preparando: 'Lo están preparando.',
    franja: 'Ya te avisaron en qué franja llega.',
    despachado: 'Va en camino.',
    entregado: 'Entregado.',
  },
  correo: {
    pagado: 'La tienda ya tiene tu pedido.',
    preparando: 'Lo están preparando.',
    despachado: 'Lo despacharon por correo.',
    entregado: 'Entregado.',
  },
  coordinar: {
    pagado: 'La tienda ya tiene tu pedido.',
    preparando: 'Lo están preparando. Te van a escribir para acordar la entrega.',
    acordado: 'Ya acordaron la entrega.',
    entregado: 'Entregado.',
  },
}

// Los pasos viejos que la forma del pedido ya no tiene.
const LINEAS_VIEJAS = {
  franja: 'Ya te avisaron en qué franja llega.',
  por_salir: 'Sale en un rato.',
  despachado: 'Va en camino.',
}

// "Llega a la tarde." con la franja guardada (envío de la tienda).
const FRANJA_LLEGA = { 'mañana': 'Llega a la mañana.', 'tarde': 'Llega a la tarde.', 'noche': 'Llega a la noche.' }

// La línea de estado de Mis pedidos: { texto, tono } con tono 'curso' (azul),
// 'entregado' (verde) o 'cancelado' (rojo). null si el estado no es un paso de
// entrega (pendiente, cancelado: esos tienen sus propios textos).
export function lineaDeEstado(pedido) {
  const estado = pedido?.estado
  if (estado === ESTADO_REEMBOLSADO) return { texto: 'Cancelado · dinero devuelto.', tono: 'cancelado' }
  const forma = formaDeEntrega(pedido?.metodo_envio)
  if (forma === 'envio' && estado === 'franja') {
    const llega = FRANJA_LLEGA[String(pedido.franja_horaria ?? '').trim().toLowerCase()]
    if (llega) return { texto: llega, tono: 'curso' }
  }
  const texto = LINEAS_DE_ESTADO[forma][estado] || LINEAS_VIEJAS[estado]
  if (!texto) return null
  return { texto, tono: estado === ESTADO_ENTREGADO ? 'entregado' : 'curso' }
}

// Días de calendario entre dos instantes, en hora de Argentina.
function diaArgentina(ms) {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Argentina/Buenos_Aires' }).format(new Date(ms))
}

// "Compraste hoy", "Compraste ayer", "Compraste hace 5 días". null si la fecha
// no se puede leer.
export function textoCompraste(iso, ahoraMs = Date.now()) {
  const ms = Date.parse(iso)
  if (!Number.isFinite(ms)) return null
  const dias = Math.round((Date.parse(diaArgentina(ahoraMs)) - Date.parse(diaArgentina(ms))) / 86400000)
  if (dias <= 0) return 'Compraste hoy'
  if (dias === 1) return 'Compraste ayer'
  return `Compraste hace ${dias} días`
}

// "Taza esmaltada", "Taza y Plato", "Taza, Plato y Mate", "Taza, Plato y 2
// más": los productos de un pedido, para el mensaje de "Reclamar".
export function resumenProductos(items) {
  const nombres = (Array.isArray(items) ? items : [])
    .map((it) => String(it?.nombre ?? '').trim())
    .filter(Boolean)
  if (nombres.length === 0) return ''
  if (nombres.length === 1) return nombres[0]
  if (nombres.length === 2) return `${nombres[0]} y ${nombres[1]}`
  if (nombres.length === 3) return `${nombres[0]}, ${nombres[1]} y ${nombres[2]}`
  return `${nombres[0]}, ${nombres[1]} y ${nombres.length - 2} más`
}

// El mensaje de "Reclamar", ya armado.
export function mensajeReclamo(pedido) {
  const productos = resumenProductos(pedido?.items)
  return `Hola, te escribo por mi pedido #${pedido?.id} en Bahía Shops${productos ? ` (${productos})` : ''}.`
}
