// Los planes de las tiendas (migraciones 046 y 047), del lado del servidor:
// cómo se lee el plan que devuelve la base, qué dice el contador, cuál es el
// plan siguiente y cómo se lee el error del tope.
//
// Lo que vale de verdad lo decide la base (privado.plan_efectivo,
// privado.tope_lleno, privado.tope_superado y privado.guardar_producto):
// estas funciones solo leen lo que devuelve. No tocan la base.
//
// Desde la 047 cuentan todos los productos guardados de la tienda (también
// los pausados y los rechazados): usados es ese número.
//
//   npm run probar:planes

// Desde cuántos productos libres el contador avisa que queda poco.
export const FALTAN_PARA_CERCA = 2

// El plan tal como lo devuelve rpc_plan_de_tienda, con los nombres que usan
// las rutas. Sin el precio: el precio especial es una condición del admin.
export function planDesdeLaBase(fila) {
  const f = fila && typeof fila === 'object' ? fila : {}
  const entero = (v) => (v === null || v === undefined || v === '' || !Number.isFinite(Number(v)) ? null : Number(v))
  return {
    clave: f.plan ?? null,
    nombre: f.nombre ?? null,
    especial: f.especial === true,
    sinTope: f.sin_tope === true,
    tope: f.sin_tope === true ? null : entero(f.tope_productos),
    usados: entero(f.usados) ?? 0,
    fotosPorProducto: entero(f.fotos_por_producto),
    carritos: f.carritos_abandonados === true,
  }
}

// Qué dice el contador «usados de tope»:
//   'sin_tope'    sin límite de productos
//   'normal'      hay lugar de sobra
//   'cerca'       quedan FALTAN_PARA_CERCA o menos
//   'en_el_tope'  no entra ninguno más
//   'por_encima'  tiene más que el tope (se bajó el tope; no se pausó nada)
export function estadoDelContador({ tope, usados, sinTope } = {}) {
  if (sinTope || tope === null || tope === undefined) return 'sin_tope'
  const u = Number(usados) || 0
  if (u > tope) return 'por_encima'
  if (u === tope) return 'en_el_tope'
  if (tope - u <= FALTAN_PARA_CERCA) return 'cerca'
  return 'normal'
}

// El plan que sigue al actual, para el cartel del tope: el primero disponible
// de orden mayor. null si la tienda tiene condiciones especiales (las arregla
// el admin) o si no hay otro.
//   planes  filas de public.planes
export function planSiguiente(planes, claveActual, { especial = false } = {}) {
  if (especial || !Array.isArray(planes)) return null
  const actual = planes.find((p) => p?.clave === claveActual)
  if (!actual) return null
  const siguiente = planes
    .filter((p) => p?.disponible === true && Number(p.orden) > Number(actual.orden))
    .sort((a, b) => Number(a.orden) - Number(b.orden))[0]
  if (!siguiente) return null
  return {
    clave: siguiente.clave,
    nombre: siguiente.nombre,
    tope: siguiente.tope_productos,
    fotosPorProducto: siguiente.fotos_por_producto,
    carritos: siguiente.carritos_abandonados === true,
    precio: siguiente.precio_mensual,
  }
}

// El nombre del primer plan disponible que trae los carritos abandonados,
// para el cartelito de la pestaña de pedidos. null si no hay ninguno.
export function planConCarritos(planes) {
  if (!Array.isArray(planes)) return null
  const conCarritos = planes
    .filter((p) => p?.disponible === true && p.carritos_abandonados === true)
    .sort((a, b) => Number(a.orden) - Number(b.orden))[0]
  return conCarritos?.nombre ?? null
}

// El error del tope que lanza privado.guardar_producto (SQLSTATE BS409, el
// mensaje 'tope_productos', 'tope_superado' o 'tope_fotos', y { tope, usados }
// en el detalle). Devuelve { motivo, tope, usados, accion } o null si no es
// ese error. Si el detalle no llegó o no se entiende, tope y usados van null:
// el tope igual valió.
// guardar_producto solo lanza 'tope_superado' al reenviar un rechazado (por
// eso accion: 'reenviar'); al reactivar, el motivo llega de
// cambiar_estado_producto y la ruta pasa accion: 'activar'.
export function errorDeTope(error) {
  if (error?.code !== 'BS409') return null
  const motivo = ['tope_productos', 'tope_superado', 'tope_fotos'].includes(error.message) ? error.message : 'tope_productos'
  let detalle = {}
  try {
    detalle = typeof error.details === 'string' ? JSON.parse(error.details) : (error.details || {})
  } catch { /* sin detalle: el mensaje va sin los números */ }
  const numero = (v) => (Number.isInteger(Number(v)) && v !== null && v !== '' ? Number(v) : null)
  const leido = { motivo, tope: numero(detalle?.tope), usados: numero(detalle?.usados) }
  return motivo === 'tope_superado' ? { ...leido, accion: 'reenviar' } : leido
}

// El texto del 409, para mostrar tal cual (hoy, en el alert() de la pantalla).
//   'tope_productos'  cargar uno nuevo con el tope lleno (cuentan todos los
//                     guardados, también los pausados)
//   'tope_superado'   activar un pausado o reenviar un rechazado con más
//                     guardados que el tope (accion: 'activar' | 'reenviar')
//   'tope_fotos'      más fotos de las que acepta el producto
export function textoDeTope({ motivo, tope, usados, accion = 'activar' } = {}) {
  if (motivo === 'tope_fotos') {
    return tope
      ? `Este producto puede tener hasta ${tope} fotos con tu plan. Sacá alguna para poder guardarlo.`
      : 'Este producto tiene más fotos de las que permite tu plan. Sacá alguna para poder guardarlo.'
  }
  if (motivo === 'tope_superado') {
    const verbo = accion === 'reenviar' ? 'reenviar' : 'activar'
    if (tope && usados) return `Tenés ${usados} productos y tu plan guarda ${tope}. Para ${verbo} este, eliminá productos hasta tener ${tope}.`
    if (tope) return `Tenés más productos de los ${tope} que guarda tu plan. Para ${verbo} este, eliminá productos hasta tener ${tope}.`
    return `Tenés más productos de los que guarda tu plan. Para ${verbo} este, eliminá productos hasta llegar al tope.`
  }
  const inicio = tope ? `Llegaste a los ${tope} productos de tu plan.` : 'Llegaste al tope de productos de tu plan.'
  return `${inicio} Cuentan todos, también los pausados: para cargar otro, eliminá uno.`
}

// El cuerpo del 409 de las rutas: { error, motivo, tope, usados }, con el
// texto armado. Recibe { motivo, tope, usados, accion } (lo de
// validarProducto, guardarProducto o cambiar_estado_producto).
export function cuerpoDeTope({ motivo, tope = null, usados = null, accion }) {
  return { error: textoDeTope({ motivo, tope, usados, accion }), motivo, tope, usados }
}

// ── La página pública /vender ──

// Un precio en pesos como lo muestra /vender: '$0', '$10.000'.
function textoPrecio(pesos) {
  return `$${Number(pesos).toLocaleString('es-AR', { maximumFractionDigits: 0 })}`
}

const enteroPositivo = (v) => Number.isInteger(v) && v > 0

// Los planes como los muestra /vender, desde las filas de public.planes (lo
// que lee anon). El Gratis y el Básico tienen que estar completos y
// disponibles: si falta alguno, o falta un dato, devuelve null y la página
// muestra la sección sin números (nunca un precio o un tope inventado).
//
// El Pro: si no se puede elegir o no tiene precio, «Próximamente». Si no hay
// fila, también.
export function planesParaLaVenta(filas) {
  if (!Array.isArray(filas)) return null
  const fila = (clave) => filas.find((p) => p?.clave === clave)

  const completo = (p) =>
    p && p.disponible === true && Number.isInteger(p.precio_mensual) && p.precio_mensual >= 0 &&
    enteroPositivo(p.tope_productos) && enteroPositivo(p.fotos_por_producto)
  const vendible = (p) => ({
    nombre: p.nombre,
    precio: textoPrecio(p.precio_mensual),
    tope: p.tope_productos,
    fotos: p.fotos_por_producto,
    carritos: p.carritos_abandonados === true,
  })

  const gratis = fila('gratis')
  const basico = fila('basico')
  if (!completo(gratis) || !completo(basico)) return null

  const pro = fila('pro')
  const proElegible = !!pro && pro.disponible === true && Number.isInteger(pro.precio_mensual)
  return {
    gratis: vendible(gratis),
    basico: vendible(basico),
    pro: proElegible
      ? { nombre: pro.nombre, proximamente: false, precio: textoPrecio(pro.precio_mensual),
          tope: enteroPositivo(pro.tope_productos) ? pro.tope_productos : null,
          fotos: enteroPositivo(pro.fotos_por_producto) ? pro.fotos_por_producto : null,
          carritos: pro.carritos_abandonados === true }
      : { nombre: pro?.nombre || 'Pro', proximamente: true },
  }
}
