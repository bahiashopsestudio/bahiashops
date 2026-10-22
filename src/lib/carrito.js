// El carrito vive en el navegador (localStorage, clave bahiashops_carrito) como
// una lista de LOCALES: [{ vendedorId, vendedorNombre, items: [...] }]. Una
// compra es de UNA tienda, así que cuando se paga solo se saca el local de esa
// tienda: lo que la persona tenía en el carrito de otras tiendas se queda.
//
// Cada ítem es una LÍNEA: { productoId, nombre, precio, foto, variante,
// cantidad, agregadoEn }. Dos talles del mismo producto son dos líneas.
//
// Son funciones puras para poder probarlas sin navegador: npm run probar:carrito

// Guarda el carrito. Si quedó vacío, borra la clave: un carrito vacío no deja
// rastro en el navegador (por ejemplo, después de cerrar sesión).
export function guardarCarrito(almacen, clave, locales) {
  try {
    if (!Array.isArray(locales) || locales.length === 0) almacen.removeItem(clave)
    else almacen.setItem(clave, JSON.stringify(locales))
  } catch { /* sin almacenamiento: el carrito vive solo en memoria */ }
}

export function sinElLocal(locales, vendedorId) {
  if (!Array.isArray(locales)) return []
  return locales.filter((l) => String(l?.vendedorId) !== String(vendedorId))
}

// La variante tal como se compara: el texto recortado, o null si no hay.
export function normalizarVariante(variante) {
  const texto = typeof variante === 'string' ? variante.trim() : ''
  return texto || null
}

// Qué hace que dos ítems sean la misma línea: el producto y el TEXTO de la
// variante, que es lo que valida el servidor y lo que queda guardado en el
// pedido. No el id de la variante: cambia cada vez que la tienda edita el
// producto (migración 033 borra y vuelve a cargar las variantes). Un producto
// sin variantes tiene una sola línea.
export function claveLinea(item) {
  return `${Number(item?.productoId)}|${normalizarVariante(item?.variante) ?? ''}`
}

// El carrito leído del navegador. Los guardados antes de las líneas ya tienen
// 'variante' (o no la tienen, y es null): la clave sale de ahí, no hay que
// reescribir nada. Lo que no es una lista queda vacío.
export function normalizarCarrito(locales) {
  if (!Array.isArray(locales)) return []
  return locales
    .filter((l) => l && Array.isArray(l.items))
    .map((l) => ({ ...l, items: l.items.map((it) => ({ ...it, variante: normalizarVariante(it?.variante) })) }))
}

// Agrega a la línea que corresponde (mismo producto y misma variante) o abre
// una nueva. El local de la tienda se crea si no estaba; los otros no se tocan.
export function agregarLinea(locales, producto, vendedor, agregadoEn) {
  const copia = (locales || []).map((l) => ({ ...l, items: [...l.items] }))
  let local = copia.find((l) => l.vendedorId === vendedor.id)

  if (!local) {
    local = { vendedorId: vendedor.id, vendedorNombre: vendedor.nombre, items: [] }
    copia.push(local)
  }

  const nuevo = { ...producto, variante: normalizarVariante(producto.variante) }
  const clave = claveLinea(nuevo)
  const i = local.items.findIndex((it) => claveLinea(it) === clave)
  if (i >= 0) {
    local.items[i] = { ...local.items[i], cantidad: local.items[i].cantidad + nuevo.cantidad, agregadoEn }
  } else {
    local.items.push({ ...nuevo, agregadoEn })
  }
  return copia
}

// Cambia la cantidad de UNA línea (mínimo 1).
export function cambiarCantidadLinea(locales, vendedorId, clave, cantidad) {
  return (locales || []).map((l) =>
    l.vendedorId !== vendedorId
      ? l
      : { ...l, items: l.items.map((it) => (claveLinea(it) === clave ? { ...it, cantidad: Math.max(1, cantidad) } : it)) }
  )
}

// Quita UNA línea. Si un local se queda sin productos, desaparece del carrito.
export function quitarLinea(locales, vendedorId, clave) {
  return (locales || [])
    .map((l) => (l.vendedorId !== vendedorId ? l : { ...l, items: l.items.filter((it) => claveLinea(it) !== clave) }))
    .filter((l) => l.items.length > 0)
}

// Le pone variante a UNA línea (la que no la tenía, en el carrito). Si ya hay
// una línea de ese producto con esa variante, se le suma la cantidad y la
// línea elegida desaparece; si no, la línea pasa a tener esa variante con su
// misma cantidad, en el mismo lugar.
export function asignarVariante(locales, vendedorId, clave, variante) {
  const elegida = normalizarVariante(variante)
  return (locales || []).map((l) => {
    if (l.vendedorId !== vendedorId) return l
    const origen = l.items.find((it) => claveLinea(it) === clave)
    if (!origen || !elegida) return l

    const claveNueva = claveLinea({ ...origen, variante: elegida })
    if (claveNueva === clave) return l
    const destino = l.items.find((it) => claveLinea(it) === claveNueva)

    if (!destino) {
      return { ...l, items: l.items.map((it) => (it === origen ? { ...it, variante: elegida } : it)) }
    }
    // La más nueva de las dos fechas: el cruce contra las compras
    // (compraReciente.js) no tiene que sacar lo que se eligió después.
    const agregadoEn = Math.max(Number(origen.agregadoEn) || 0, Number(destino.agregadoEn) || 0) || destino.agregadoEn
    return {
      ...l,
      items: l.items
        .filter((it) => it !== origen)
        .map((it) => (it === destino ? { ...it, cantidad: it.cantidad + origen.cantidad, agregadoEn } : it)),
    }
  })
}

// Las líneas sin variante de productos que la piden (carritos viejos, o un
// producto al que la tienda le cargó talles después). 'piden' es un Map o un
// Set con los ids de esos productos (src/lib/disponibilidad.js).
export function lineasSinVariante(items, piden) {
  if (!piden) return []
  return (items || []).filter((it) => piden.has(Number(it?.productoId)) && !normalizarVariante(it?.variante))
}
