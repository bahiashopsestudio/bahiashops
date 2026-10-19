// Lecturas de reseñas del lado del servidor, con service_role: la tabla no
// tiene permisos para el navegador (migración 037). Lo que sale de acá es lo
// que se puede mostrar: nunca comprador_id, nunca datos de la cuenta, y el
// pedido solo cuando lo pide el panel de la propia tienda.
//
// El apodo es el de hoy (no una copia): se lee de usuarios por la lista de
// ids, como en el panel de pedidos. Una cuenta cerrada (o una reseña sin
// dueño) sale con apodo null: "Cuenta eliminada".

import { estadoRevisionTienda, respuestaDe, edicionRespuesta } from '@/lib/resenas'

export const RESENAS_POR_PAGINA = 10

// { apodos: Map(id -> apodo | null), error }
export async function apodosDe(admin, ids) {
  const unicos = [...new Set((ids || []).filter(Boolean))]
  const apodos = new Map()
  if (unicos.length === 0) return { apodos, error: null }
  const { data, error } = await admin
    .from('usuarios')
    .select('id, nombre_usuario, cerrada_en')
    .in('id', unicos)
  if (error) return { apodos, error }
  for (const u of data || []) apodos.set(u.id, u.cerrada_en ? null : (u.nombre_usuario || null))
  return { apodos, error: null }
}

// La respuesta tal como se muestra. En público, solo una publicada: {
// texto, creado_en, editada }. En el panel de la tienda, también una oculta,
// con su estado (la tienda la ve marcada) y cuántos días le quedan para
// editarla (0: ya no se puede). Los días los calcula el servidor.
export function diasDeEdicion(respuesta) {
  const e = edicionRespuesta(respuesta)
  return e.puede ? e.diasRestantes : 0
}

export function respuestaParaMostrar(respuesta, { conEstado = false } = {}) {
  if (!respuesta) return null
  if (!conEstado && respuesta.estado !== 'publicada') return null
  return {
    texto: respuesta.texto,
    creado_en: respuesta.creado_en,
    editada: !!respuesta.editada_en,
    ...(conEstado ? { estado: respuesta.estado, dias_edicion: diasDeEdicion(respuesta) } : {}),
  }
}

// Las publicadas de una tienda, la más nueva primero, de a RESENAS_POR_PAGINA.
// Devuelve { resenas, hayMas } o { error } (nunca una lista vacía que
// esconda un error). conPedido: suma pedido_id, en qué está el pedido de
// revisión de la tienda y la respuesta en cualquier estado (solo el panel de
// la propia tienda). Sin conPedido (la página pública), la respuesta va solo
// si está publicada, y sin nada de su moderación.
export async function resenasPublicadas(admin, vendedorId, { desde = 0, conPedido = false } = {}) {
  const inicio = Math.max(0, Number(desde) || 0)
  const { data, error } = await admin
    .from('resenas')
    .select(`id, pedido_id, comprador_id, estrellas, texto, creado_en, revision_pedida_en, revision_pendiente_desde,
      respuesta:respuestas_resena ( texto, estado, creado_en, editada_en )`)
    .eq('vendedor_id', vendedorId)
    .eq('estado', 'publicada')
    .order('creado_en', { ascending: false })
    .order('id', { ascending: false })
    // Una de más, para saber si hay otra página.
    .range(inicio, inicio + RESENAS_POR_PAGINA)
  if (error) return { error }

  const filas = data || []
  const { apodos, error: errorApodos } = await apodosDe(admin, filas.map((r) => r.comprador_id))
  // Sin apodos no se puede firmar: mejor el error que "Cuenta eliminada" en
  // todas.
  if (errorApodos) return { error: errorApodos }

  const resenas = filas.slice(0, RESENAS_POR_PAGINA).map((r) => ({
    id: r.id,
    respuesta: respuestaParaMostrar(respuestaDe(r.respuesta), { conEstado: conPedido }),
    apodo: r.comprador_id ? (apodos.get(r.comprador_id) ?? null) : null,
    estrellas: r.estrellas,
    texto: r.texto,
    creado_en: r.creado_en,
    ...(conPedido ? { pedido_id: r.pedido_id, estado_revision: estadoRevisionTienda(r) } : {}),
  }))
  return { resenas, hayMas: filas.length > RESENAS_POR_PAGINA }
}
