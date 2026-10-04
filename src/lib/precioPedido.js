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

import {
  METODOS, normalizarMetodo, metodosParaComprador, zonaDe, precioDeZona,
} from '@/lib/metodosEntrega'

// Qué métodos hay, cuáles piden dirección y cuáles se ofrecen a quien compra
// lo dice src/lib/metodosEntrega.js. Acá sólo se ponen los precios.

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

// Cuánto sale el envío según el método. Devuelve { metodo, costo, zona } o un
// rechazo. 'metodo' es el id de la lista (un nombre viejo que mande una
// pestaña abierta desde antes llega traducido); 'zona' es el número de zona
// cobrado (envío de la tienda o correo), o null.
//
// zonaTienda y zonaCorreo las calcula quien llama, con zonasPara
// (src/lib/zonaEnvio.js), para la dirección verificada de quien compra.
// Nunca vienen del navegador:
//   undefined  no hay dirección (o la tienda no ofrece ese método): no se sabe.
//   null       no llega (el envío de la tienda, a más de 20 km) o falta el
//              punto de la tienda o el de la dirección.
//   1..4       la zona.
// Con un método por zona, una zona null o sin precio es un rechazo. Con el
// respaldo, sirven para comprobar que de verdad no quedó otra opción para
// esa dirección.
//
// codigoPostalOk: el correo necesita el código postal de la dirección.
export function calcularEnvio({ vendedor, metodoEnvio, hayDireccion, zonaTienda, zonaCorreo, codigoPostalOk }) {
  const metodo = normalizarMetodo(metodoEnvio)
  const { disponibles } = metodosParaComprador(vendedor, { zonaTienda, zonaCorreo })
  const definicion = metodo ? METODOS[metodo] : null
  const zonaSabida = metodo === 'correo' ? zonaCorreo : zonaTienda

  if (definicion?.costo === 'por_zona') {
    if (!hayDireccion) {
      return rechazo(400, 'FALTA_DIRECCION', 'Para ese método de entrega hace falta una dirección.')
    }
    if (zonaSabida === undefined) {
      return rechazo(400, 'SIN_ZONA', 'No pudimos calcular el envío a esa dirección. Elegí otra dirección u otra forma de entrega.')
    }
  }

  if (!metodo || !disponibles.includes(metodo)) {
    if (definicion?.costo === 'por_zona') {
      return rechazo(400, 'ZONA_SIN_COSTO', metodo === 'correo'
        ? 'Esta tienda no envía por correo a esa dirección.'
        : 'Esta tienda no llega a esa dirección.')
    }
    return rechazo(400, 'METODO_INVALIDO', 'Ese método de entrega no está disponible para esta tienda.')
  }

  if (definicion.costo !== 'por_zona') {
    return { metodo, costo: 0, zona: null }
  }

  if (metodo === 'correo' && codigoPostalOk !== true) {
    return rechazo(400, 'FALTA_CODIGO_POSTAL', 'Para enviar por correo hace falta el código postal de la dirección.')
  }

  // La zona es la que calculó el servidor; ya se comprobó que tiene precio.
  const zona = zonaDe(metodo, zonaSabida)
  const precio = precioDeZona(vendedor?.costos_envio_zona || {}, zona.clave)
  return { metodo, costo: dePesos(aCentavos(precio)), zona: zona.zona }
}

export function calcularPedido({
  items,
  productos,
  variantes,
  medias,
  vendedor,
  metodoEnvio,
  hayDireccion,
  zonaTienda,
  zonaCorreo,
  codigoPostalOk,
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
  const envio = calcularEnvio({ vendedor, metodoEnvio, hayDireccion, zonaTienda, zonaCorreo, codigoPostalOk })
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
    metodo: envio.metodo,
    zonaEnvio: envio.zona,
    costoEnvio: envio.costo,
    total,
    comision,
  }
}
