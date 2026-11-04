// El plan de la tienda para las pantallas del panel (Mis productos, Nuevo,
// Editar, Mi negocio), desde el navegador: /api/vendedor/plan.
//
// Devuelve { plan } (lo que manda la ruta: { plan: { clave, nombre }, tope,
// usados, fotosPorProducto, carritos, especial, sinTope, contador, siguiente })
// o { error } con un texto para mostrar. Nunca lanza.

export const ERROR_PLAN = 'No pudimos cargar tu plan. Probá de nuevo en un rato.'

export async function cargarPlan() {
  try {
    const res = await fetch('/api/vendedor/plan')
    const datos = await res.json().catch(() => ({}))
    return res.ok ? { plan: datos } : { error: datos.error || ERROR_PLAN }
  } catch (err) {
    console.error('No se pudo cargar el plan:', err)
    return { error: ERROR_PLAN }
  }
}
