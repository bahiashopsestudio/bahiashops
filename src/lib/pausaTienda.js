// Pausar la tienda: las reglas que comparten la ruta (/api/vendedor/pausa) y
// la pantalla (Mi negocio). Funciones puras: funcionan en el navegador y en
// el servidor.

import { revisarPublicacion } from '@/lib/moderacion'

export const MAX_MENSAJE_PAUSA = 200

// Cualquier link (moderacion.js solo frena los de redes y WhatsApp, a propósito
// para los productos). El mensaje de pausa es lo único que queda a la vista de
// una tienda pausada: que no sea una puerta para vender por afuera.
const RE_LINK_CUALQUIERA = /https?:\/\/|www\.|\b[a-z0-9-]+\.(?:com|ar|net|org|io|shop|store|site|online|app|me|link)\b/i

// Los estados de un pedido que la tienda todavía tiene que entregar (para el
// cartel de "¿Pausar tu tienda?"). Pausar no los toca: siguen su curso.
// 'despachado' no cuenta: ya salió de la tienda.
export const ESTADOS_PARA_ENTREGAR = ['pagado', 'preparando', 'franja', 'por_salir', 'listo', 'acordado']

// El mensaje que el vendedor deja al público. Opcional: vacío es null. Hasta
// 200 caracteres y, como lo ve cualquiera, sin datos de contacto ni lenguaje
// ofensivo (la misma revisión que los productos: src/lib/moderacion.js).
//
// Devuelve { ok: true, mensaje } (string o null) o { ok: false, error }.
export function validarMensajePausa(texto) {
  if (texto === undefined || texto === null) return { ok: true, mensaje: null }
  if (typeof texto !== 'string') return { ok: false, error: 'El mensaje no es válido.' }
  const mensaje = texto.replace(/\s+/g, ' ').trim()
  if (!mensaje) return { ok: true, mensaje: null }
  if (mensaje.length > MAX_MENSAJE_PAUSA) {
    return { ok: false, error: `El mensaje puede tener hasta ${MAX_MENSAJE_PAUSA} caracteres.` }
  }
  if (revisarPublicacion(mensaje).nivel === 'bloqueo' || RE_LINK_CUALQUIERA.test(mensaje)) {
    return { ok: false, error: 'El mensaje no puede tener teléfonos, mails, links ni palabras ofensivas.' }
  }
  return { ok: true, mensaje }
}

// "4 de octubre" (o "4 de octubre de 2025" si no es de este año), en hora de
// Argentina.
export function fechaDePausa(iso, ahoraMs = Date.now()) {
  const ms = Date.parse(iso)
  if (!Number.isFinite(ms)) return null
  const opciones = { day: 'numeric', month: 'long', timeZone: 'America/Argentina/Buenos_Aires' }
  const anio = (t) => new Date(t).toLocaleDateString('es-AR', { year: 'numeric', timeZone: 'America/Argentina/Buenos_Aires' })
  if (anio(ms) !== anio(ahoraMs)) opciones.year = 'numeric'
  return new Date(ms).toLocaleDateString('es-AR', opciones)
}

// ¿La conexión con MercadoPago necesita reconectarse? Solo si hay una cuenta
// y su permiso ya venció. Sin cuenta, el panel ya muestra "Conectar".
export function mpNecesitaReconectar(cuentaMp, ahoraMs = Date.now()) {
  if (!cuentaMp) return false
  const vence = Date.parse(cuentaMp.token_expira_en)
  return Number.isFinite(vence) && vence <= ahoraMs
}
