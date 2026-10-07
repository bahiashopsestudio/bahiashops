// La máquina de estados de un pedido. Vive acá, en una función pura, para que
// la regla se pueda leer de un vistazo y probar sin levantar nada.
//
// Quién escribe qué:
//
//   pendiente, pagado, rechazado, cancelado  -> SOLO el webhook de MercadoPago
//   preparando, franja, por_salir, despachado -> SOLO el vendedor, y sólo
//                                                avanzando de a un paso
//
// El vendedor no puede tocar los estados de pago ni con la mejor intención:
// no aparecen como destino en TRANSICIONES, así que no hay forma de llegar a
// ellos por esta puerta.

// De qué estado se puede pasar a cuál. Un estado que no está como clave es un
// estado desde el que el vendedor no avanza nada.
export const TRANSICIONES = {
  pagado: 'preparando',
  preparando: 'franja',
  franja: 'por_salir',
  por_salir: 'despachado',
  // Estado final: la plata volvió al comprador (reembolso del vendedor o
  // contracargo). Desde acá no se avanza a ningún paso.
  reembolsado: null,
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
// para los logs y las pruebas.
export function validarAvance({ pedido, vendedorId, destino }) {
  if (!pedido) {
    return { ok: false, motivo: 'no_existe', status: 404, error: 'No encontramos ese pedido.' }
  }

  // Lo primero, siempre: ¿es suyo? Antes que cualquier otra cosa, para no
  // filtrar por el mensaje de error si un pedido existe o en qué estado está.
  if (pedido.vendedor_id !== vendedorId) {
    return { ok: false, motivo: 'ajeno', status: 404, error: 'No encontramos ese pedido.' }
  }

  const siguiente = TRANSICIONES[pedido.estado]

  if (pedido.estado === ESTADO_REEMBOLSADO) {
    return {
      ok: false,
      motivo: 'reembolsado',
      status: 409,
      error: 'Este pedido se canceló y el dinero volvió al comprador: no hay que prepararlo ni entregarlo.',
    }
  }

  if (!siguiente) {
    return {
      ok: false,
      motivo: 'sin_avance',
      status: 409,
      error: `Un pedido en estado "${pedido.estado}" no tiene un paso siguiente.`,
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
export const ESTADOS_CON_PAGO = ['pagado', 'preparando', 'franja', 'por_salir', 'despachado', ESTADO_REEMBOLSADO]

export function pedidoTuvoPago(pedido) {
  return ESTADOS_CON_PAGO.includes(pedido?.estado)
}

// Lo que se saca de un pedido antes de mandárselo a la tienda si no se pagó.
// comprador_id nunca viaja (ya lo saca la ruta): sale el apodo, aparte.
const CAMPOS_DE_CONTACTO = ['comprador_nombre', 'comprador_apellido', 'comprador_telefono', 'direccion_copia', 'direccion']

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
