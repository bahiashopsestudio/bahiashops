// Variantes de un producto (talle, color...): cuándo una compra tiene que
// elegir una. Funciones puras: las usan la ficha, el inicio, el carrito, el
// checkout y el servidor (src/lib/precioPedido.js), con el mismo criterio.

// ¿Hay que elegir una variante para comprar este producto? Sí cuando el
// producto dice que tiene variantes Y tiene alguna cargada. Con
// tiene_variantes y ninguna cargada se compra sin elegir: si no, no habría
// forma de comprarlo. Es el criterio con el que el servidor devuelve
// FALTA_VARIANTE.
//
//   producto   { tiene_variantes }
//   variantes  las filas de producto_variantes de ESE producto (solo se cuentan)
export function pideVariante(producto, variantes) {
  return Boolean(producto?.tiene_variantes) && Array.isArray(variantes) && variantes.length > 0
}

// Cómo se llama lo que hay que elegir, para los textos: "talle", "color". Sin
// nombre cargado, "opción".
export function nombreVariante(producto) {
  const nombre = typeof producto?.propiedad_1_nombre === 'string' ? producto.propiedad_1_nombre.trim() : ''
  return nombre ? nombre.toLowerCase() : 'opción'
}
