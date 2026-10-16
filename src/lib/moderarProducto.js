// Desde las pantallas del admin: aprobar, rechazar o dar por revisado un
// producto (/api/admin/productos/[id]/moderacion). Devuelve null si salió
// bien, o el texto del error para mostrar.
export async function moderarProducto(id, cuerpo) {
  try {
    const res = await fetch(`/api/admin/productos/${id}/moderacion`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(cuerpo),
    })
    if (res.ok) return null
    const datos = await res.json().catch(() => ({}))
    return datos.error || 'Error inesperado.'
  } catch {
    return 'No pudimos conectarnos.'
  }
}

// Lee una lista del admin. Devuelve { datos } o { error } (nunca una lista
// vacía cuando falló: el panel muestra el error).
export async function leerDelAdmin(url, errorPorDefecto) {
  try {
    const res = await fetch(url)
    const datos = await res.json().catch(() => ({}))
    if (!res.ok) return { error: datos.error || errorPorDefecto }
    return { datos }
  } catch {
    return { error: 'No pudimos conectarnos.' }
  }
}
