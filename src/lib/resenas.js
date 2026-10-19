// Reseñas a las tiendas: la regla de cuándo se puede reseñar, la validación
// de lo que se publica, el filtro de moderación y los textos del puntaje.
// Funciones puras, sin base ni red: las usan el servidor (la ruta que
// publica, el mail de «¿Cómo te fue?»), las pantallas y las pruebas
// (scripts/probar-037.mjs). La base (migración 037) solo garantiza lo que no
// puede romperse nunca: una reseña por pedido, las estrellas, el largo del
// texto, que no se edite.

import { ESTADOS_PARA_RECLAMAR } from './pedidos.js'
import { revisarPublicacion } from './moderacion.js'

const DIA_MS = 24 * 60 * 60 * 1000

// Sin "Entregado", se habilita a los 14 días del pago.
export const DIAS_SIN_ENTREGA = 14
// Cada ventana dura 30 días.
export const DIAS_VENTANA = 30
export const LARGO_MAXIMO_TEXTO_RESENA = 500
// El promedio se muestra desde las 5 reseñas (la base lo deja en null antes).
export const MINIMO_PARA_PROMEDIO = 5

// Los pedidos que se pueden reseñar: los pagados, de 'pagado' a 'entregado'.
// No pendiente, rechazado, cancelado ni reembolsado (una reseña ya hecha
// queda aunque después se reembolse).
export const ESTADOS_PARA_RESENAR = ESTADOS_PARA_RECLAMAR

// "Muy mala" para 1 estrella ... "Excelente" para 5.
export const ETIQUETAS_ESTRELLAS = ['Muy mala', 'Mala', 'Regular', 'Buena', 'Excelente']

export function etiquetaEstrellas(estrellas) {
  return ETIQUETAS_ESTRELLAS[Number(estrellas) - 1] || ''
}

// Por qué Rosario oculta una reseña. Una reseña negativa no es motivo.
export const MOTIVOS_OCULTAR = [
  { valor: 'insultos', texto: 'Insultos o agresiones' },
  { valor: 'datos_personales', texto: 'Contiene datos personales' },
  { valor: 'no_es_esta_compra', texto: 'No es sobre esta compra' },
  { valor: 'sin_compra_real', texto: 'No hubo una compra real' },
]

export function textoMotivoOcultar(valor) {
  return MOTIVOS_OCULTAR.find((m) => m.valor === valor)?.texto || 'Otro motivo'
}

// ── La tienda pide revisar una reseña (migración 038) ────────────────────────
//
// Los mismos cuatro motivos de la política, dichos como los diría la tienda.
// Una sola vez por reseña, solo sobre una publicada; mientras se revisa, sigue
// visible. Sin mails.
export const MOTIVOS_REVISION = [
  { valor: 'insultos', texto: 'Insultos o agresiones' },
  { valor: 'datos_personales', texto: 'Contiene datos personales' },
  { valor: 'no_es_esta_compra', texto: 'No es sobre esta compra' },
  { valor: 'sin_compra_real', texto: 'Es falsa, esta persona nunca me compró' },
]
export const LARGO_MAXIMO_COMENTARIO_REVISION = 300

export function textoMotivoRevision(valor) {
  return MOTIVOS_REVISION.find((m) => m.valor === valor)?.texto || 'Otro motivo'
}

// Devuelve { ok: true, motivo, comentario } o { ok: false, error }.
export function validarPedidoRevision(cuerpo) {
  const motivo = cuerpo?.motivo
  if (!MOTIVOS_REVISION.some((m) => m.valor === motivo)) {
    return { ok: false, error: 'Elegí por qué querés que la revisemos.' }
  }
  if (cuerpo?.comentario !== undefined && cuerpo?.comentario !== null && typeof cuerpo.comentario !== 'string') {
    return { ok: false, error: 'No pudimos leer el comentario.' }
  }
  const comentario = limpiarTexto(cuerpo?.comentario)
  if (comentario && largoTexto(comentario) > LARGO_MAXIMO_COMENTARIO_REVISION) {
    return { ok: false, error: `El comentario puede tener hasta ${LARGO_MAXIMO_COMENTARIO_REVISION} caracteres.` }
  }
  return { ok: true, motivo, comentario }
}

// Lo que ve la tienda en una reseña publicada: null (no la pidió revisar),
// 'en_revision' (la pidió y sigue pendiente) o 'revisada' (la revisamos y
// sigue publicada). Una que se ocultó después no llega a la tienda.
export function estadoRevisionTienda(resena) {
  if (!resena?.revision_pedida_en) return null
  return resena.revision_pendiente_desde ? 'en_revision' : 'revisada'
}

// Por qué está una reseña en "Por revisar" (/admin/denuncias): la marcó el
// filtro (y nadie la miró todavía), y/o la tienda pidió revisarla después de
// la última revisión.
export function motivosPorRevisar(resena) {
  const revisadaMs = Date.parse(resena?.revisada_en)
  const pedidaMs = Date.parse(resena?.revision_pedida_en)
  const avisos = Array.isArray(resena?.moderacion_avisos) ? resena.moderacion_avisos : []
  return {
    filtro: avisos.length > 0 && !Number.isFinite(revisadaMs),
    tienda: Number.isFinite(pedidaMs) && (!Number.isFinite(revisadaMs) || pedidaMs > revisadaMs),
  }
}

// ── Eliminar una oculta (migración 038) ──────────────────────────────────────
//
// A los 45 días de oculta: se borra el texto para siempre y la fila queda
// (el UNIQUE de pedido_id impide volver a reseñar ese pedido). La base lo
// vuelve a comprobar.
export const DIAS_PARA_ELIMINAR = 45

// Desde cuándo se puede eliminar (Date), o null si no está oculta o ya se
// eliminó.
export function eliminableDesde(resena) {
  if (resena?.estado !== 'oculta_por_moderacion' || resena?.eliminada_en) return null
  const oculta = Date.parse(resena.oculta_en)
  if (!Number.isFinite(oculta)) return null
  return new Date(oculta + DIAS_PARA_ELIMINAR * DIA_MS)
}

export function puedeEliminar(resena, ahoraMs = Date.now()) {
  const desde = eliminableDesde(resena)
  return !!desde && ahoraMs >= desde.getTime()
}

// ── La regla ──────────────────────────────────────────────────────────────────
//
// Dos ventanas de 30 días, y vale la unión (siempre la que termine más tarde):
//   · desde que la tienda lo marcó "Entregado" (entregado_at), hasta 30 días
//     después, aunque lo haya marcado muy tarde;
//   · desde los 14 días de pagado_en, hasta el día 44.
// Como entregado_at, si existe, ya pasó, las dos ventanas nunca dejan un hueco
// por delante: se puede reseñar entre la que empieza primero y la que termina
// última.

function ms(valor) {
  const n = Date.parse(valor)
  return Number.isFinite(n) ? n : null
}

// { desde, hasta } en milisegundos, o null si el pedido no tiene ninguna de
// las dos fechas.
export function ventanaDeResena(pedido) {
  const entrega = ms(pedido?.entregado_at)
  const pago = ms(pedido?.pagado_en)
  const ventanas = []
  if (entrega !== null) ventanas.push([entrega, entrega + DIAS_VENTANA * DIA_MS])
  if (pago !== null) ventanas.push([pago + DIAS_SIN_ENTREGA * DIA_MS, pago + (DIAS_SIN_ENTREGA + DIAS_VENTANA) * DIA_MS])
  if (ventanas.length === 0) return null
  return {
    desde: Math.min(...ventanas.map(([d]) => d)),
    hasta: Math.max(...ventanas.map(([, h]) => h)),
  }
}

// En qué está la reseña de un pedido, para quien lo compró:
//   { estado: 'hecha' }                      ya tiene reseña (resena)
//   { estado: 'puede', via, hasta, diasRestantes }
//        via: 'entregado' (la tienda lo marcó) o '14_dias' (no lo marcó, pero
//        pasaron 14 días desde el pago)
//   { estado: 'todavia_no' }                 pagado, pero falta para habilitarse
//   { estado: 'vencida' }                    pasó la ventana sin reseña
//   { estado: 'no_corresponde' }             no es una compra que se reseñe
// Que el pedido sea de quien pregunta lo comprueba quien llama.
export function estadoDeResena({ pedido, resena = null, ahoraMs = Date.now() }) {
  if (resena) return { estado: 'hecha' }
  if (!pedido || !ESTADOS_PARA_RESENAR.includes(pedido.estado)) return { estado: 'no_corresponde' }
  const ventana = ventanaDeResena(pedido)
  if (!ventana || ahoraMs < ventana.desde) return { estado: 'todavia_no' }
  if (ahoraMs > ventana.hasta) return { estado: 'vencida' }
  return {
    estado: 'puede',
    via: ms(pedido.entregado_at) !== null ? 'entregado' : '14_dias',
    hasta: ventana.hasta,
    diasRestantes: Math.max(1, Math.ceil((ventana.hasta - ahoraMs) / DIA_MS)),
  }
}

// "Te quedan 12 días para dejarla." / "Te queda 1 día para dejarla."
export function textoDiasRestantes(dias) {
  return dias === 1 ? 'Te queda 1 día para dejarla.' : `Te quedan ${dias} días para dejarla.`
}

// El error que da el servidor cuando la regla no deja publicar.
export const ERROR_DE_ESTADO = {
  todavia_no: 'Todavía no podés dejar la reseña de este pedido: se habilita cuando la tienda lo marque como entregado.',
  vencida: 'Ya pasaron los 30 días para dejar una reseña de este pedido.',
  no_corresponde: 'Este pedido no se puede reseñar.',
}

// ── Lo que se publica ─────────────────────────────────────────────────────────

// Largo en caracteres, como lo cuenta la base (char_length): un emoji es uno.
export function largoTexto(texto) {
  return Array.from(String(texto ?? '')).length
}

// El texto tal como se guarda: sin espacios sueltos al principio ni al final,
// y null si queda vacío.
export function limpiarTexto(texto) {
  const limpio = String(texto ?? '').trim()
  return limpio === '' ? null : limpio
}

// Devuelve { ok: true, pedidoId, estrellas, texto } o { ok: false, error }.
export function validarResena(cuerpo) {
  const pedidoId = Number(cuerpo?.pedido_id)
  if (!Number.isInteger(pedidoId) || pedidoId <= 0) return { ok: false, error: 'Falta el pedido.' }
  const estrellas = Number(cuerpo?.estrellas)
  if (!Number.isInteger(estrellas) || estrellas < 1 || estrellas > 5) {
    return { ok: false, error: 'Elegí de 1 a 5 estrellas.' }
  }
  if (cuerpo?.texto !== undefined && cuerpo?.texto !== null && typeof cuerpo.texto !== 'string') {
    return { ok: false, error: 'No pudimos leer el comentario.' }
  }
  const texto = limpiarTexto(cuerpo?.texto)
  if (texto && largoTexto(texto) > LARGO_MAXIMO_TEXTO_RESENA) {
    return { ok: false, error: `El comentario puede tener hasta ${LARGO_MAXIMO_TEXTO_RESENA} caracteres.` }
  }
  return { ok: true, pedidoId, estrellas, texto }
}

// ── El filtro de moderación, para reseñas ────────────────────────────────────
//
// El mismo revisarPublicacion de los productos, con otra lectura:
//   · bloquean los datos de contacto (mail, link, usuario de red, teléfono,
//     también escrito en palabras o con los dígitos separados) y el lenguaje
//     ofensivo: no se publica, y se muestra el mismo cartel que en productos.
//   · "pedido de contacto" (contacto_intencion) NO bloquea: en una reseña es
//     normal contar "me respondieron por WhatsApp". Queda como dudoso.
//   · lo dudoso (posible teléfono, mención de una red, pedido de contacto) se
//     publica igual y queda marcado para mirar en /admin/denuncias.
//   · no cuentan: precio "a consultar" y venta de animales (son de productos).
const BLOQUEAN_RESENA = new Set([
  'contacto_mail', 'contacto_link', 'contacto_arroba', 'contacto_numeros_en_letras',
  'contacto_digitos_espaciados', 'contacto_telefono', 'lenguaje_ofensivo',
])
const NO_CUENTAN_EN_RESENA = new Set(['precio_evadido', 'venta_animales'])
// revisarPublicacion solo caza links de algunas redes: cualquier otro link
// también es un dato de contacto (el mismo patrón que el mensaje de pausa,
// src/lib/pausaTienda.js).
const RE_LINK_CUALQUIERA = /https?:\/\/\S+|www\.\S+|\b[a-z0-9-]+\.(?:com|ar|net|org|io|shop|store|site|online|app|me|link)\b\S*/i

// Devuelve { nivel: 'bloqueo' | 'aviso' | 'limpio', bloqueos, avisos }, con la
// misma forma que revisarPublicacion.
export function moderarTextoResena(texto) {
  const revision = revisarPublicacion(texto || '')
  const todos = [...revision.bloqueos, ...revision.avisos].filter((h) => !NO_CUENTAN_EN_RESENA.has(h.tipo))
  const link = String(texto || '').match(RE_LINK_CUALQUIERA)
  if (link && !todos.some((h) => h.tipo === 'contacto_link')) todos.push({ tipo: 'contacto_link', texto: link[0] })
  const bloqueos = todos.filter((h) => BLOQUEAN_RESENA.has(h.tipo))
  const avisos = todos.filter((h) => !BLOQUEAN_RESENA.has(h.tipo))
  const nivel = bloqueos.length ? 'bloqueo' : avisos.length ? 'aviso' : 'limpio'
  return { nivel, bloqueos, avisos }
}

// ── La respuesta de la tienda (migración 039) ────────────────────────────────
//
// Una por reseña, de la tienda dueña, sobre una reseña publicada. Se edita
// durante 7 días desde que se publicó; después queda fija. La base lo vuelve
// a comprobar todo (respuestas_resena).
export const LARGO_MAXIMO_RESPUESTA = 500
export const DIAS_EDICION_RESPUESTA = 7

// Devuelve { ok: true, texto } o { ok: false, error }.
export function validarRespuesta(cuerpo) {
  if (typeof cuerpo?.texto !== 'string') return { ok: false, error: 'Escribí tu respuesta.' }
  const texto = limpiarTexto(cuerpo.texto)
  if (!texto) return { ok: false, error: 'Escribí tu respuesta.' }
  if (largoTexto(texto) > LARGO_MAXIMO_RESPUESTA) {
    return { ok: false, error: `La respuesta puede tener hasta ${LARGO_MAXIMO_RESPUESTA} caracteres.` }
  }
  return { ok: true, texto }
}

// ¿Se puede editar todavía? { puede: true, diasRestantes } o { puede: false }.
// Una oculta no se edita.
export function edicionRespuesta(respuesta, ahoraMs = Date.now()) {
  if (!respuesta || respuesta.estado !== 'publicada') return { puede: false }
  const creada = Date.parse(respuesta.creado_en)
  if (!Number.isFinite(creada)) return { puede: false }
  const hasta = creada + DIAS_EDICION_RESPUESTA * DIA_MS
  if (ahoraMs > hasta) return { puede: false }
  return { puede: true, diasRestantes: Math.max(1, Math.ceil((hasta - ahoraMs) / DIA_MS)) }
}

// "Te quedan 5 días" / "Te queda 1 día"
export function textoDiasEdicion(dias) {
  return dias === 1 ? 'Te queda 1 día' : `Te quedan ${dias} días`
}

// "Tenés 3 reseñas sin responder." / "Tenés 1 reseña sin responder." /
// "Respondiste todas tus reseñas."
export function textoSinResponder(n) {
  if (n === 0) return 'Respondiste todas tus reseñas.'
  return n === 1 ? 'Tenés 1 reseña sin responder.' : `Tenés ${n} reseñas sin responder.`
}

// La respuesta embebida (respuesta:respuestas_resena(...)): un objeto, null,
// o una lista de una fila según cómo la devuelva la API.
export function respuestaDe(fila) {
  const r = Array.isArray(fila) ? fila[0] : fila
  return r && typeof r === 'object' ? r : null
}

// El filtro de las respuestas: el de las reseñas, más estricto con el
// contacto. Una tienda que pone su contacto en una respuesta está esquivando
// la plataforma, así que también bloquean el pedido de contacto ("WhatsApp",
// "escribime", "llamame") y la mención de una red (Instagram, TikTok,
// Facebook, Telegram), aunque sea inocente: el cartel dice qué sacar. Lo
// dudoso (un posible teléfono) se publica y queda para revisar.
const BLOQUEAN_RESPUESTA = new Set([...BLOQUEAN_RESENA, 'contacto_intencion', 'mencion_redes'])

export function moderarTextoRespuesta(texto) {
  const revision = moderarTextoResena(texto)
  const todos = [...revision.bloqueos, ...revision.avisos]
  const bloqueos = todos.filter((h) => BLOQUEAN_RESPUESTA.has(h.tipo))
  const avisos = todos.filter((h) => !BLOQUEAN_RESPUESTA.has(h.tipo))
  const nivel = bloqueos.length ? 'bloqueo' : avisos.length ? 'aviso' : 'limpio'
  return { nivel, bloqueos, avisos }
}

// ── El puntaje ────────────────────────────────────────────────────────────────

// El puntaje embebido (puntaje:puntajes_tiendas(cantidad, promedio)): un
// objeto, null si la tienda no tiene reseñas, o una lista de una fila según
// cómo lo devuelva la API. Siempre { cantidad, promedio } (promedio número o
// null; null con menos de 5).
export function puntajeDe(fila) {
  const p = Array.isArray(fila) ? fila[0] : fila
  const cantidad = Math.max(0, Number(p?.cantidad) || 0)
  const promedio = p?.promedio === null || p?.promedio === undefined ? null : Number(p.promedio)
  return {
    cantidad,
    promedio: cantidad >= MINIMO_PARA_PROMEDIO && Number.isFinite(promedio) ? promedio : null,
  }
}

// "4,6"
export function textoPromedio(promedio) {
  return Number(promedio).toFixed(1).replace('.', ',')
}

// "1 reseña" / "32 reseñas"
export function textoCantidadResenas(cantidad) {
  return cantidad === 1 ? '1 reseña' : `${cantidad} reseñas`
}

// Para las tarjetas: "4,6 ★ (32)" o "Tienda nueva".
export function textoPuntajeTarjeta(puntaje) {
  const { cantidad, promedio } = puntajeDe(puntaje)
  return promedio === null ? 'Tienda nueva' : `${textoPromedio(promedio)} ★ (${cantidad})`
}

// Para la ficha de producto: "4,6 ★" o "Tienda nueva".
export function textoPuntajeCorto(puntaje) {
  const { promedio } = puntajeDe(puntaje)
  return promedio === null ? 'Tienda nueva' : `${textoPromedio(promedio)} ★`
}

// Una reseña como se muestra (página de la tienda, panel, admin): sin apodo
// es una cuenta eliminada.
export const FIRMA_CUENTA_ELIMINADA = 'Cuenta eliminada'
