// El carrito vive en el navegador (localStorage, clave bahiashops_carrito) como
// una lista de LOCALES: [{ vendedorId, vendedorNombre, items: [...] }]. Una
// compra es de UNA tienda, así que cuando se paga solo se saca el local de esa
// tienda: lo que la persona tenía en el carrito de otras tiendas se queda.
//
// Es una función pura para poder probarla sin navegador.

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
