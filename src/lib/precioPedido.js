// Cuánto cuesta un pedido. El navegador propone, el servidor decide.
//
// Del carrito se acepta SÓLO qué se compra: producto, variante y cantidad.
// Cada peso lo calcula esta función con datos leídos de la base: el precio de
// cada ítem, el subtotal, el costo de envío, el total y la comisión. El nombre
// y la foto que se guardan en el pedido también salen de la base, no del
// navegador: viajan a MercadoPago como título e imagen del ítem.
//
// El precio y el costo de envío que manda el navegador entran sólo para
// comparar: son "lo que la persona vio en pantalla". Si no coinciden con lo
// que dice la base, no se cobra nada y se devuelve el cambio para que lo
// confirme.
//
// Es una función pura: no toca la base ni la red. Quien la llama hace las
// lecturas y le pasa las filas. Así se puede probar entera sin levantar nada.

export const ZONAS_CORREO_VALIDAS = ['correo_1', 'correo_2', 'correo_3', 'correo_4']

export const METODOS_SIN_COSTO = ['retiro', 'acordar']

// Si el método necesita una dirección de entrega. Es la misma regla que aplica
// calcularEnvio: los métodos sin costo no piden dirección. La usan el servidor
// (para no guardar una dirección que el método no usa) y el checkout (para no
// mandarla), así que no hay una segunda lista que se desfase.
export function metodoPideDireccion(metodoEnvio) {
  return !METODOS_SIN_COSTO.includes(metodoEnvio)
}

// Los únicos métodos que el checkout sabe ofrecer.
//
// 'metodos_entrega_default' guarda además otros valores que la pantalla no
// reconoce ('coordinar', 'envio_propio', 'flash_pedidos'), así que el servidor
// tiene que mirar la MISMA lista. Si no, un vendedor con sólo métodos
// desconocidos queda en el medio: la pantalla cae en 'acordar' porque no
// reconoce ninguno, y el servidor lo rechaza porque 'acordar' no está en la
// base. Ese vendedor no podría vender.
export const METODOS_CONOCIDOS = ['retiro', 'cadeteria', 'correo', 'acordar']

// La comisión de la plataforma: 5% sobre los productos, nunca sobre el envío.
export const COMISION_PRODUCTOS = 0.05

// Los precios se comparan en centavos y como números: "100", 100 y 100.00 son
// el mismo precio. Devuelve null si el valor no es un número usable.
function aCentavos(valor) {
  if (valor === null || valor === undefined || valor === '') return null
  const n = Number(valor)
  if (!Number.isFinite(n)) return null
  return Math.round(n * 100)
}

function dePesos(centavos) {
  return Math.round(centavos) / 100
}

function mismoPrecio(a, b) {
  const ca = aCentavos(a)
  const cb = aCentavos(b)
  if (ca === null || cb === null) return false
  return ca === cb
}

// La foto principal del producto, con el mismo criterio que usan las pantallas:
// la marcada como principal y, si no hay, la de menor orden.
function fotoDe(medias, productoId) {
  const suyas = (medias || []).filter((m) => m.producto_id === productoId)
  if (suyas.length === 0) return null
  const principal = suyas.find((m) => m.es_principal)
  if (principal) return principal.url || null
  const ordenadas = [...suyas].sort((a, b) => (a.orden ?? 0) - (b.orden ?? 0))
  return ordenadas[0]?.url || null
}

function rechazo(status, codigo, error, extra = {}) {
  return { ok: false, status, codigo, error, ...extra }
}

// Qué métodos puede elegir quien compra. Tiene que dar exactamente lo mismo
// que arma la pantalla del checkout, o hay vendedores que no pueden vender.
//
// Se filtra contra METODOS_CONOCIDOS, y el correo sólo cuenta si al menos una
// zona tiene precio cargado: sin eso, elegirlo dejaba una lista de zonas vacía.
// Si no queda ninguno, la salida de emergencia es 'acordar' — la misma de los
// dos lados.
export function metodosOfrecidos(vendedor) {
  const metodos = Array.isArray(vendedor?.metodos_entrega_default)
    ? vendedor.metodos_entrega_default
    : []
  const costos = vendedor?.costos_envio_zona || {}

  const ofrecidos = metodos.filter((m) => {
    if (!METODOS_CONOCIDOS.includes(m)) return false
    if (m === 'correo') {
      return ZONAS_CORREO_VALIDAS.some((zona) => aCentavos(costos[zona]) !== null)
    }
    return true
  })

  return ofrecidos.length > 0 ? ofrecidos : ['acordar']
}

// Cuánto sale el envío según el método. Devuelve { costo } o un rechazo.
function calcularEnvio({ vendedor, metodoEnvio, hayDireccion, zonaCadeteria, zonaCorreo }) {
  const permitidos = metodosOfrecidos(vendedor)

  if (!permitidos.includes(metodoEnvio)) {
    return rechazo(400, 'METODO_INVALIDO', 'Ese método de entrega no está disponible para esta tienda.')
  }

  if (!metodoPideDireccion(metodoEnvio)) {
    return { costo: 0 }
  }

  if (!hayDireccion) {
    return rechazo(400, 'FALTA_DIRECCION', 'Para ese método de entrega hace falta una dirección.')
  }

  const costos = vendedor?.costos_envio_zona || {}

  if (metodoEnvio === 'cadeteria') {
    // zonaCadeteria la calcula quien llama, con la función de la base. null
    // significa que no se pudo determinar (dirección sin barrio, por ejemplo).
    if (zonaCadeteria === null || zonaCadeteria === undefined) {
      return rechazo(400, 'SIN_ZONA', 'No pudimos determinar la zona de envío para esa dirección.')
    }
    const costo = aCentavos(costos[`zona_${zonaCadeteria}`])
    if (costo === null) {
      return rechazo(400, 'ZONA_SIN_COSTO', 'Esta tienda no hace envíos por cadetería a esa zona.')
    }
    return { costo: dePesos(costo) }
  }

  if (metodoEnvio === 'correo') {
    // Qué zona de correo es lo elige la persona: no hay dato en la base del
    // que deducirlo. Lo que sí pone el servidor es el precio de esa zona.
    if (!ZONAS_CORREO_VALIDAS.includes(zonaCorreo)) {
      return rechazo(400, 'ZONA_CORREO_INVALIDA', 'Elegí una zona de envío válida.')
    }
    const costo = aCentavos(costos[zonaCorreo])
    if (costo === null) {
      return rechazo(400, 'ZONA_SIN_COSTO', 'Esta tienda no hace envíos por correo a esa zona.')
    }
    return { costo: dePesos(costo) }
  }

  return rechazo(400, 'METODO_INVALIDO', 'Ese método de entrega no está disponible para esta tienda.')
}

export function calcularPedido({
  items,
  productos,
  variantes,
  medias,
  vendedor,
  metodoEnvio,
  hayDireccion,
  zonaCadeteria,
  zonaCorreo,
  costoEnvioVisto,
}) {
  if (!Array.isArray(items) || items.length === 0) {
    return rechazo(400, 'SIN_ITEMS', 'El pedido no tiene productos.')
  }

  const porId = new Map((productos || []).map((p) => [Number(p.id), p]))

  // ── 1. Cada ítem: qué se compra. Todo lo que sea inválido corta acá. ──
  const lineas = []

  for (const item of items) {
    const productoId = Number(item?.productoId)
    if (!Number.isInteger(productoId) || productoId <= 0) {
      return rechazo(400, 'PRODUCTO_INVALIDO', 'Hay un producto inválido en el pedido.')
    }

    const cantidad = item?.cantidad
    if (typeof cantidad !== 'number' || !Number.isSafeInteger(cantidad) || cantidad < 1) {
      return rechazo(400, 'CANTIDAD_INVALIDA', 'La cantidad tiene que ser un número entero de 1 o más.', {
        producto_id: productoId,
      })
    }

    const producto = porId.get(productoId)
    if (!producto) {
      return rechazo(409, 'NO_DISPONIBLE', 'Algunos productos de este pedido ya no están disponibles.', {
        productos_no_disponibles: [productoId],
      })
    }

    // ── Variante ──
    const variante = typeof item?.variante === 'string' ? item.variante.trim() : ''

    if (producto.tiene_variantes) {
      if (!variante) {
        return rechazo(400, 'FALTA_VARIANTE', `Elegí una opción de "${producto.nombre}".`, {
          producto_id: productoId,
        })
      }
      const existe = (variantes || []).some(
        (v) => Number(v.producto_id) === productoId && v.propiedad_1_valor === variante
      )
      if (!existe) {
        return rechazo(400, 'VARIANTE_INVALIDA', `Esa opción de "${producto.nombre}" ya no está disponible.`, {
          producto_id: productoId,
        })
      }
    } else if (variante) {
      return rechazo(400, 'VARIANTE_INVALIDA', `"${producto.nombre}" no tiene opciones para elegir.`, {
        producto_id: productoId,
      })
    }

    const precioBase = aCentavos(producto.precio)
    if (precioBase === null) {
      return rechazo(409, 'NO_DISPONIBLE', 'Algunos productos de este pedido ya no están disponibles.', {
        productos_no_disponibles: [productoId],
      })
    }

    lineas.push({
      productoId,
      // Nombre y foto salen de la base: son los que se guardan en el pedido y
      // los que viajan a MercadoPago.
      nombre: producto.nombre,
      variante: variante || null,
      cantidad,
      precio: dePesos(precioBase),
      foto: fotoDe(medias, productoId),
      // Lo que la persona tenía en pantalla, sólo para comparar.
      precioVisto: item?.precio,
    })
  }

  // ── 2. El envío. También puede cortar. ──
  const envio = calcularEnvio({ vendedor, metodoEnvio, hayDireccion, zonaCadeteria, zonaCorreo })
  if (envio.ok === false) return envio

  // ── 3. ¿Cambió algo desde que lo vio? ──
  // Se juntan todos los cambios en una sola respuesta: precios y envío.
  const cambios = []
  const yaListados = new Set()

  for (const linea of lineas) {
    if (mismoPrecio(linea.precioVisto, linea.precio)) continue
    if (yaListados.has(linea.productoId)) continue
    yaListados.add(linea.productoId)

    const anterior = aCentavos(linea.precioVisto)
    cambios.push({
      producto_id: linea.productoId,
      nombre: linea.nombre,
      // null cuando lo que mandó el navegador no era un número usable.
      precio_anterior: anterior === null ? null : dePesos(anterior),
      precio_nuevo: linea.precio,
    })
  }

  const envioCambio = !mismoPrecio(costoEnvioVisto, envio.costo)
  const vistoEnvio = aCentavos(costoEnvioVisto)

  if (cambios.length > 0 || envioCambio) {
    return rechazo(409, 'PRECIO_CAMBIO', 'Cambiaron los precios de este pedido.', {
      cambios,
      envio: envioCambio
        ? {
            anterior: vistoEnvio === null ? null : dePesos(vistoEnvio),
            nuevo: envio.costo,
          }
        : null,
    })
  }

  // ── 4. La plata, toda calculada acá. ──
  const subtotalCentavos = lineas.reduce(
    (suma, l) => suma + aCentavos(l.precio) * l.cantidad,
    0
  )
  const subtotal = dePesos(subtotalCentavos)
  const total = dePesos(subtotalCentavos + aCentavos(envio.costo))
  const comision = Math.round(subtotal * COMISION_PRODUCTOS)

  return {
    ok: true,
    lineas: lineas.map(({ precioVisto, ...resto }) => resto),
    subtotal,
    costoEnvio: envio.costo,
    total,
    comision,
  }
}
