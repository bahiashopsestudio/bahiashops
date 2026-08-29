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
}

// Los estados que sólo escribe el webhook. Están acá para poder dar un error
// que explique por qué, en vez de un "transición inválida" seco.
export const ESTADOS_DE_PAGO = ['pendiente', 'pagado', 'rechazado', 'cancelado']

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
    if (ESTADOS_DE_PAGO.includes(destino)) {
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
