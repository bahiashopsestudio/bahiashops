// Abrir una categoría desde las pantallas del vendedor.
//
// Antes cada pantalla hacía el UPDATE directo a la tabla y la base lo
// rechazaba por permisos, sin que nadie se enterara. Ahora pasa por
// /api/categorias/activar, que corre en el servidor y verifica que la
// categoría sea de quien la pide.
//
// Nunca lanza: quien llama ya guardó lo suyo y no queremos deshacerlo por
// esto. Devuelve el resultado para que la pantalla pueda mostrarlo.

// { ok: true, activada } si salió bien — 'activada' es false cuando ya estaba
// abierta y no hubo nada que hacer.
// { ok: false, error } si falló, con un texto que se le puede mostrar a la
// persona.
export async function activarCategoria(categoriaId) {
  const id = Number(categoriaId)
  if (!Number.isInteger(id) || id <= 0) {
    return { ok: false, error: 'Categoría inválida.' }
  }

  try {
    const res = await fetch('/api/categorias/activar', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ categoria_id: id }),
    })
    const datos = await res.json().catch(() => ({}))

    if (!res.ok) {
      console.error('No se pudo activar la categoría', id, res.status, datos.error)
      return { ok: false, error: datos.error || 'No se pudo activar la categoría.' }
    }

    return { ok: true, activada: !!datos.activada }
  } catch (err) {
    console.error('Error de red al activar la categoría', id, err)
    return { ok: false, error: 'No pudimos conectarnos para actualizar tu categoría.' }
  }
}

// Abre varias y devuelve el primer problema, o null si salieron todas. Las
// pantallas de producto abren hasta dos (principal y secundaria).
export async function activarCategorias(ids) {
  const unicos = [...new Set((ids || []).map(Number).filter((n) => Number.isInteger(n) && n > 0))]

  for (const id of unicos) {
    const r = await activarCategoria(id)
    if (!r.ok) return r.error
  }
  return null
}

// El texto que ve la persona cuando la apertura falla. No la asusta con algo
// que ya quedó guardado, pero tampoco lo esconde.
export const AVISO_CATEGORIA =
  'Guardamos todo bien, pero no pudimos abrir tu categoría en el menú del sitio. ' +
  'Escribinos si en un rato no la ves y lo resolvemos.'
