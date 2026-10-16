// Denuncias de productos: los motivos, qué se acepta y cómo se resumen.
//
// Lo usan el cuadro de la ficha (ModalDenuncia), /api/denuncias (que guarda) y
// /api/admin/denuncias (que lista). La regla entera (producto propio, una
// pendiente por persona, el límite diario) la decide la base: migración 035,
// privado.registrar_denuncia.

// Los mismos valores que el CHECK denuncias_motivo_valido.
export const MOTIVOS_DENUNCIA = [
  { valor: 'contacto', texto: 'Tiene datos de contacto (teléfono, mail, redes)' },
  { valor: 'fotos', texto: 'Las fotos no corresponden o son inapropiadas' },
  { valor: 'prohibido', texto: 'Es un producto prohibido o peligroso' },
  { valor: 'enganoso', texto: 'El precio o la descripción engañan' },
  { valor: 'estafa', texto: 'Parece una estafa' },
  { valor: 'otro', texto: 'Otro motivo' },
]

export const MAX_COMENTARIO_DENUNCIA = 1000
export const LIMITE_DENUNCIAS_POR_DIA = 10

export function textoMotivoDenuncia(valor) {
  return MOTIVOS_DENUNCIA.find((m) => m.valor === valor)?.texto || 'Otro motivo'
}

// Lo que manda el cuadro. Devuelve { ok, productoId, motivo, comentario } o
// { ok: false, error }.
export function validarDenuncia(cuerpo) {
  const c = cuerpo && typeof cuerpo === 'object' ? cuerpo : {}
  const productoId = Number(c.producto_id)
  if (!Number.isInteger(productoId) || productoId <= 0) return { ok: false, error: 'Producto inválido.' }
  if (!MOTIVOS_DENUNCIA.some((m) => m.valor === c.motivo)) return { ok: false, error: 'Elegí qué pasa con este producto.' }
  if (c.comentario !== undefined && c.comentario !== null && typeof c.comentario !== 'string') {
    return { ok: false, error: 'El comentario no es válido.' }
  }
  const comentario = (c.comentario || '').trim()
  if (comentario.length > MAX_COMENTARIO_DENUNCIA) {
    return { ok: false, error: `El comentario puede tener hasta ${MAX_COMENTARIO_DENUNCIA} caracteres.` }
  }
  return { ok: true, productoId, motivo: c.motivo, comentario: comentario || null }
}

// Los motivos de las denuncias de un producto, del más repetido al menos.
// [{ motivo, texto, cantidad }]
export function resumirMotivos(denuncias) {
  const cuenta = new Map()
  for (const d of denuncias || []) cuenta.set(d.motivo, (cuenta.get(d.motivo) || 0) + 1)
  const orden = MOTIVOS_DENUNCIA.map((m) => m.valor)
  return [...cuenta.entries()]
    .map(([motivo, cantidad]) => ({ motivo, texto: textoMotivoDenuncia(motivo), cantidad }))
    .sort((a, b) => b.cantidad - a.cantidad || orden.indexOf(a.motivo) - orden.indexOf(b.motivo))
}

// "hace un momento", "hace 5 minutos", "hace 3 horas", "hace 2 días".
export function haceCuanto(fecha, ahora = Date.now()) {
  const ms = ahora - new Date(fecha).getTime()
  if (!Number.isFinite(ms)) return ''
  const minutos = Math.floor(ms / 60000)
  if (minutos < 1) return 'hace un momento'
  if (minutos < 60) return minutos === 1 ? 'hace 1 minuto' : `hace ${minutos} minutos`
  const horas = Math.floor(minutos / 60)
  if (horas < 24) return horas === 1 ? 'hace 1 hora' : `hace ${horas} horas`
  const dias = Math.floor(horas / 24)
  return dias === 1 ? 'hace 1 día' : `hace ${dias} días`
}
