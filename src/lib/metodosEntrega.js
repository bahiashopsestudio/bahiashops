// Los métodos de entrega. Es la ÚNICA lista: la leen la pantalla "Cómo
// entregás" (alta y panel), el checkout, el servidor que crea el pedido, la
// cotización del envío, el panel de pedidos, los mails, Mis pedidos, la
// compra exitosa y el admin. Como TRANSICIONES en pedidos.js: si un método
// cambia, cambia acá y en ningún otro lado.
//
// Es un módulo puro: no toca la base ni la red.
//
// Los valores que se guardan (vendedores.metodos_entrega_default y
// pedidos.metodo_envio) son las claves de METODOS. La base los exige con un
// CHECK desde la migración 020. Antes de esa migración pueden quedar nombres
// viejos: ALIAS los traduce al leer, nunca se escriben.

// ── Distancias ──
//
// Todo es línea recta (haversine) entre el punto de la tienda y el de la
// dirección de quien compra. Sin servicios externos. El punto de la tienda es
// vendedores.latitud/longitud: el exacto si muestra su dirección, el centro
// del círculo si no. Lo calcula el servidor (src/lib/zonaEnvio.js), con estas
// mismas funciones al cotizar y al crear el pedido. A quien compra nunca se le
// muestra la distancia.
const RADIO_TIERRA_M = 6371000

// { lat, lng } como números, o null si falta alguno. Ojo: Number(null) es 0,
// así que lo vacío se descarta antes de convertir.
const vacio = (v) => v === null || v === undefined || v === ''
function puntoValido(punto) {
  if (vacio(punto?.lat) || vacio(punto?.lng)) return null
  const lat = Number(punto.lat)
  const lng = Number(punto.lng)
  if (!Number.isFinite(lat) || !Number.isFinite(lng) || Math.abs(lat) > 90 || Math.abs(lng) > 180) return null
  return { lat, lng }
}

export function puntoCompleto(punto) {
  return puntoValido(punto) !== null
}

// Metros en línea recta entre dos puntos { lat, lng }, o null si falta uno.
export function distanciaRectaMetros(a, b) {
  const p = puntoValido(a)
  const q = puntoValido(b)
  if (!p || !q) return null
  const rad = (g) => (g * Math.PI) / 180
  const dLat = rad(q.lat - p.lat)
  const dLng = rad(q.lng - p.lng)
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(p.lat)) * Math.cos(rad(q.lat)) * Math.sin(dLng / 2) ** 2
  return 2 * RADIO_TIERRA_M * Math.asin(Math.min(1, Math.sqrt(h)))
}

// La zona para una distancia, con una lista de zonas ordenada. La última
// puede no tener tope (hastaMetros null). Pasado el tope de la última, null.
function zonaEn(zonas, metros) {
  if (metros === null || metros === undefined || !Number.isFinite(metros) || metros < 0) return null
  return zonas.find((z) => z.hastaMetros === null || metros <= z.hastaMetros)?.zona ?? null
}

// ── Envío de la tienda ──
//
// La distancia en línea recta, multiplicada por FACTOR_CALLES para aproximar
// el recorrido por calles. Llega hasta 20 km (ya multiplicado), sea la ciudad
// que sea: más lejos, no llega (no es una falla, no se registra). A la tienda
// las zonas se le muestran en kilómetros, como las del correo.
export const FACTOR_CALLES = 1.3

export const ZONAS_TIENDA = [
  { zona: 1, clave: 'zona_1', hastaMetros: 1000 },
  { zona: 2, clave: 'zona_2', hastaMetros: 3000 },
  { zona: 3, clave: 'zona_3', hastaMetros: 7000 },
  { zona: 4, clave: 'zona_4', hastaMetros: 20000 },
].map((z, i, todas) => ({
  ...z,
  nombre: i === todas.length - 1
    ? `De ${todas[i - 1].hastaMetros / 1000} a ${z.hastaMetros / 1000} km`
    : `Hasta ${z.hastaMetros / 1000} km`,
  detalle: '',
}))

// La zona (1..4) para una distancia ya aproximada por calles, o null si pasa
// de la última (20 km).
export function zonaPorDistancia(metros) {
  return zonaEn(ZONAS_TIENDA, metros)
}

// La zona del envío de la tienda entre dos puntos: null si falta alguno o si
// queda a más de 20 km por calles. Para saber cuál de las dos, puntoCompleto().
export function zonaEntrePuntos(puntoTienda, puntoComprador) {
  const recta = distanciaRectaMetros(puntoTienda, puntoComprador)
  if (recta === null) return null
  return zonaPorDistancia(recta * FACTOR_CALLES)
}

// ── Correo ──
//
// La zona la calcula el servidor con la distancia en línea recta, SIN el
// factor de calles (en distancias largas no aplica). Quien compra no la
// elige. Los ejemplos son distancias en línea recta desde el centro de Bahía
// Blanca: sirven para que la tienda ponga sus precios.
export const ZONAS_CORREO = [
  { zona: 1, clave: 'correo_1', hastaMetros: 50000, ejemplos: 'Punta Alta, Ingeniero White, General Daniel Cerri, Médanos' },
  { zona: 2, clave: 'correo_2', hastaMetros: 150000, ejemplos: 'Monte Hermoso, Tornquist, Coronel Pringles, Coronel Dorrego' },
  { zona: 3, clave: 'correo_3', hastaMetros: 500000, ejemplos: 'Tres Arroyos, Viedma, Santa Rosa, Tandil, Mar del Plata' },
  { zona: 4, clave: 'correo_4', hastaMetros: null, ejemplos: 'Ciudad de Buenos Aires, Rosario, Córdoba, Mendoza' },
].map((z, i, todas) => ({
  ...z,
  nombre: z.hastaMetros
    ? `Hasta ${z.hastaMetros / 1000} km`
    : `Más de ${todas[i - 1].hastaMetros / 1000} km`,
  detalle: z.ejemplos,
}))

// La zona del correo entre dos puntos, o null si falta alguno.
export function zonaCorreoEntrePuntos(puntoTienda, puntoComprador) {
  return zonaEn(ZONAS_CORREO, distanciaRectaMetros(puntoTienda, puntoComprador))
}

// ── Seguimiento del correo ──
//
// Las empresas que la tienda puede elegir al despachar. Los links llevan a la
// página de seguimiento de cada una; ninguna confirmó que acepte el número en
// el link, así que quien compra copia el número y lo pega ahí.
export const EMPRESAS_ENVIO = {
  correo_argentino: { nombre: 'Correo Argentino', url: 'https://www.correoargentino.com.ar/formularios/e-commerce' },
  andreani: { nombre: 'Andreani', url: 'https://www.andreani.com/' },
  oca: { nombre: 'OCA', url: 'https://www.oca.com.ar/Busquedas/Seguimientos' },
  otra: { nombre: 'Otra', url: null },
}
export const LARGO_SEGUIMIENTO = 60

// { empresa, otra, numero } -> { ok: true, campos } o { ok: false, error }.
// campos son las columnas de pedidos: envio_empresa, envio_empresa_otra,
// envio_seguimiento. Lo usan el panel (para avisar) y el servidor (decide).
export function validarSeguimiento({ empresa, otra, numero }) {
  if (!EMPRESAS_ENVIO[empresa]) return { ok: false, error: 'Elegí la empresa con la que lo despachaste.' }
  const limpio = (v) => (typeof v === 'string' ? v.trim().replace(/s+/g, ' ') : '')
  const n = limpio(numero)
  if (!n) return { ok: false, error: 'Escribí el número de seguimiento.' }
  if (n.length > LARGO_SEGUIMIENTO) return { ok: false, error: 'El número de seguimiento es demasiado largo.' }
  let nombreOtra = null
  if (empresa === 'otra') {
    nombreOtra = limpio(otra)
    if (!nombreOtra) return { ok: false, error: 'Escribí el nombre de la empresa.' }
    if (nombreOtra.length > LARGO_SEGUIMIENTO) return { ok: false, error: 'El nombre de la empresa es demasiado largo.' }
  }
  return { ok: true, campos: { envio_empresa: empresa, envio_empresa_otra: nombreOtra, envio_seguimiento: n } }
}

// El seguimiento guardado en un pedido, para mostrar: { empresa, numero, url }
// o null si no hay.
export function seguimientoDe(pedido) {
  const empresa = EMPRESAS_ENVIO[pedido?.envio_empresa]
  if (!empresa || !pedido?.envio_seguimiento) return null
  return {
    empresa: pedido.envio_empresa === 'otra' ? (pedido.envio_empresa_otra || 'Otra empresa') : empresa.nombre,
    numero: pedido.envio_seguimiento,
    url: empresa.url,
  }
}

// costo:
//   'gratis'       $0, sin vueltas.
//   'por_zona'     la tienda pone un precio por zona; zona sin precio = no
//                  llega ahí. $0 en una zona es "Envío gratis".
//   'a_coordinar'  $0 ahora; el envío se arregla por WhatsApp.
//
// tipoEntrega: cómo llega el pedido. Lo usan los pasos del pedido (preparar,
// franja, sale, despachado) para elegir los textos.
export const METODOS = {
  retiro: {
    id: 'retiro',
    comprador: 'Retiro en el local',
    compradorSinDireccion: 'Retiro',
    detalleComprador: 'Retirás en la dirección de la tienda',
    detalleCompradorSinDireccion: 'Coordinás con la tienda dónde y cuándo',
    vendedor: 'Retiro',
    admin: 'Retiro',
    pideDireccion: false,
    pideTurno: false,
    costo: 'gratis',
    tipoEntrega: 'retiro',
  },
  envio_tienda: {
    id: 'envio_tienda',
    comprador: 'Envío de la tienda',
    detalleComprador: 'La tienda te lo lleva',
    vendedor: 'Envío de la tienda',
    admin: 'Envío de la tienda (por zona)',
    pideDireccion: true,
    pideTurno: true,
    costo: 'por_zona',
    zonas: ZONAS_TIENDA,
    tipoEntrega: 'domicilio',
  },
  correo: {
    id: 'correo',
    comprador: 'Envío por correo',
    detalleComprador: 'A cualquier ciudad',
    vendedor: 'Correo',
    admin: 'Correo (por zona)',
    pideDireccion: true,
    pideTurno: false,
    costo: 'por_zona',
    zonas: ZONAS_CORREO,
    tipoEntrega: 'correo',
  },
  coordinar: {
    id: 'coordinar',
    comprador: 'Coordinar con la tienda',
    detalleComprador: 'Pagás los productos ahora y arreglan la entrega por WhatsApp',
    detalleCompradorRespaldo: 'La tienda todavía no cargó sus formas de entrega: la arreglan por WhatsApp',
    vendedor: 'Coordinar por WhatsApp',
    admin: 'A coordinar',
    pideDireccion: false,
    pideTurno: false,
    costo: 'a_coordinar',
    tipoEntrega: 'coordinar',
  },
}

export const ORDEN_METODOS = ['retiro', 'envio_tienda', 'correo', 'coordinar']

// Lo que ve quien compra cuando no le queda ninguna otra opción.
export const METODO_RESPALDO = 'coordinar'

// Nombres viejos. Se entienden al leer, nunca se escriben.
const ALIAS = {
  acordar: 'coordinar',
  cadeteria: 'envio_tienda',
  envio_propio: 'envio_tienda',
  flash_pedidos: 'envio_tienda',
}

// El id del método, o null si el valor no es ninguno conocido.
export function normalizarMetodo(valor) {
  if (typeof valor !== 'string') return null
  if (METODOS[valor]) return valor
  return ALIAS[valor] || null
}

export function metodoDe(valor) {
  const id = normalizarMetodo(valor)
  return id ? METODOS[id] : null
}

// Un valor desconocido NO pide dirección.
export function metodoPideDireccion(valor) {
  return metodoDe(valor)?.pideDireccion === true
}

// El tipo de entrega, o null si el valor no se conoce.
export function tipoEntregaDe(valor) {
  return metodoDe(valor)?.tipoEntrega || null
}

// Hasta que los pasos del pedido usen tipoEntrega (t4), sus textos y los de
// los mails distinguen cuatro casos: 'retiro', 'envio' (la tienda lo lleva a
// la dirección), 'correo' (lo despacha por correo: no hay franja de entrega
// ni "ya llega") y 'coordinar' (el resto, incluido un valor desconocido).
export function grupoEntrega(valor) {
  const tipo = tipoEntregaDe(valor)
  if (tipo === 'retiro') return 'retiro'
  if (tipo === 'domicilio') return 'envio'
  if (tipo === 'correo') return 'correo'
  return 'coordinar'
}

// Etiqueta para 'comprador', 'vendedor' o 'admin'. Para quien compra, el
// retiro de una tienda que no muestra su dirección se llama "Retiro" a secas.
// Un valor desconocido se muestra tal cual, para que se note.
export function etiquetaMetodo(valor, para = 'comprador', { direccionVisible } = {}) {
  const metodo = metodoDe(valor)
  if (!metodo) return valor ? `Otro (${valor})` : 'Sin método'
  if (para === 'comprador' && metodo.id === 'retiro' && direccionVisible === false) {
    return metodo.compradorSinDireccion
  }
  return metodo[para] || metodo.comprador
}

// La lista de métodos guardada en la tienda, traducida, sin repetidos y en el
// orden de ORDEN_METODOS. Lo desconocido se descarta.
export function metodosGuardados(valores) {
  const ids = new Set((Array.isArray(valores) ? valores : []).map(normalizarMetodo).filter(Boolean))
  return ORDEN_METODOS.filter((id) => ids.has(id))
}

// El precio de una zona en pesos (número >= 0), o null si no hay precio.
export function precioDeZona(costos, clave) {
  const valor = costos?.[clave]
  if (valor === null || valor === undefined || valor === '') return null
  const n = Number(valor)
  if (!Number.isFinite(n) || n < 0) return null
  return n
}

export function zonaDe(metodo, numero) {
  return metodoDe(metodo)?.zonas?.find((z) => z.zona === Number(numero)) || null
}

// Las zonas de un método por zona que tienen precio.
export function zonasConPrecio(metodo, costos) {
  const zonas = metodoDe(metodo)?.zonas || []
  return zonas.filter((z) => precioDeZona(costos, z.clave) !== null)
}

// Los métodos que la tienda dejó listos: los elegidos, y entre los que van
// por zona, sólo los que tienen al menos un precio. No incluye el respaldo.
export function metodosConfigurados(vendedor) {
  const costos = vendedor?.costos_envio_zona || {}
  return metodosGuardados(vendedor?.metodos_entrega_default).filter((id) =>
    METODOS[id].costo !== 'por_zona' || zonasConPrecio(id, costos).length > 0
  )
}

// ¿La tienda ya eligió cómo entrega? Si no, el panel le muestra el aviso.
export function entregaConfigurada(vendedor) {
  return metodosConfigurados(vendedor).length > 0
}

// ¿Tiene el correo tildado y ningún precio de correo? Entonces no se ofrece,
// y el panel se lo avisa.
export function correoSinPrecios(vendedor) {
  return metodosGuardados(vendedor?.metodos_entrega_default).includes('correo') &&
    zonasConPrecio('correo', vendedor?.costos_envio_zona || {}).length === 0
}

// Qué métodos ve quien compra. Es la regla de las dos puntas: el checkout la
// usa para armar la lista y el servidor para validar lo que llega.
//
// zonaTienda y zonaCorreo son lo que se sabe de la dirección de quien compra
// para el envío de la tienda y para el correo (las calcula el servidor):
//   undefined  todavía no se sabe (sin dirección): el método se muestra.
//   null       no llega o no se pudo calcular: el método no está disponible.
//   1..4       la zona: disponible si esa zona tiene precio.
//
// Devuelve { disponibles, noDisponibles, respaldo }:
//   disponibles    los que se pueden elegir, en orden; si no queda ninguno,
//                  [METODO_RESPALDO].
//   noDisponibles  los configurados que para esta dirección no van (se
//                  muestran deshabilitados).
//   respaldo       true si METODO_RESPALDO está porque no quedó nada.
export function metodosParaComprador(vendedor, { zonaTienda, zonaCorreo } = {}) {
  const costos = vendedor?.costos_envio_zona || {}
  const configurados = metodosConfigurados(vendedor)
  const zonaSabida = { envio_tienda: zonaTienda, correo: zonaCorreo }

  const disponibles = []
  const noDisponibles = []
  for (const id of configurados) {
    if (METODOS[id].costo === 'por_zona' && zonaSabida[id] !== undefined) {
      const zona = zonaDe(id, zonaSabida[id])
      if (!zona || precioDeZona(costos, zona.clave) === null) {
        noDisponibles.push(id)
        continue
      }
    }
    disponibles.push(id)
  }

  if (disponibles.length === 0) {
    return { disponibles: [METODO_RESPALDO], noDisponibles, respaldo: true }
  }
  return { disponibles, noDisponibles, respaldo: false }
}

// "Envío gratis", "$ 2.500", o "A coordinar". Para quien compra.
export function textoCostoEnvio(metodo, costo) {
  const m = metodoDe(metodo)
  if (m?.costo === 'a_coordinar') return 'A coordinar'
  const n = Number(costo)
  if (!Number.isFinite(n) || n === 0) return 'Envío gratis'
  return `$${n.toLocaleString('es-AR')}`
}

// Lo que el vendedor guarda desde "Cómo entregás". Valida y limpia; la usan
// la pantalla (para avisar antes de mandar) y el servidor (que es quien decide).
//
// Recibe { metodos, costos, tienePunto } y devuelve
// { ok: true, metodos, costos } o { ok: false, error }.
//   - Al menos un método, elegido a propósito.
//   - Envío de la tienda y correo necesitan el punto de la tienda en el
//     mapa: las zonas se miden desde ahí.
//   - Cada método por zona elegido necesita al menos un precio.
//   - Los precios son enteros de 0 a 10.000.000; vacío = no llega a esa zona.
//   - Se guardan sólo las zonas con precio. Las de un método destildado se
//     conservan (si son válidas): al volver a tildarlo, los precios siguen.
export const PRECIO_MAXIMO = 10_000_000

export function validarEntrega({ metodos, costos, tienePunto }) {
  const entrada = Array.isArray(metodos) ? metodos : []
  if (entrada.some((m) => !METODOS[m])) {
    return { ok: false, error: 'Hay una forma de entrega que no existe.' }
  }
  const elegidos = ORDEN_METODOS.filter((id) => entrada.includes(id))
  if (elegidos.length === 0) {
    return { ok: false, error: 'Elegí al menos una forma de entrega.' }
  }
  for (const id of ['envio_tienda', 'correo']) {
    if (elegidos.includes(id) && !tienePunto) {
      return { ok: false, error: `Para "${METODOS[id].vendedor}" necesitamos tu ubicación: las distancias se miden desde ahí. Completala en Mi ubicación.` }
    }
  }

  const limpios = {}
  for (const id of elegidos) {
    const metodo = METODOS[id]
    if (metodo.costo !== 'por_zona') continue
    let alguno = false
    for (const zona of metodo.zonas) {
      const crudo = costos?.[zona.clave]
      if (crudo === null || crudo === undefined || crudo === '') continue
      const n = Number(crudo)
      if (!Number.isInteger(n) || n < 0 || n > PRECIO_MAXIMO) {
        return { ok: false, error: `El precio de "${metodo.vendedor} · ${zona.nombre}" tiene que ser un número entero de 0 o más.` }
      }
      limpios[zona.clave] = n
      alguno = true
    }
    if (!alguno) {
      return { ok: false, error: `Cargá al menos un precio para "${metodo.vendedor}". Si no llegás a ninguna zona, destildalo.` }
    }
  }

  for (const id of ORDEN_METODOS) {
    const metodo = METODOS[id]
    if (metodo.costo !== 'por_zona' || elegidos.includes(id)) continue
    for (const zona of metodo.zonas) {
      const n = Number(costos?.[zona.clave])
      if (costos?.[zona.clave] !== '' && costos?.[zona.clave] != null &&
          Number.isInteger(n) && n >= 0 && n <= PRECIO_MAXIMO) {
        limpios[zona.clave] = n
      }
    }
  }

  return { ok: true, metodos: elegidos, costos: limpios }
}
