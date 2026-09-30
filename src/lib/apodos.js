// Apodos: cómo se ven (inicial y color del avatar) y qué se permite escribir.
//
// Lo usan el navegador (la bienvenida y el perfil, para avisar antes de
// guardar) y /api/cuenta/apodo, que es la que decide.

import { revisarPublicacion, ETIQUETAS_MODERACION } from '@/lib/moderacion'

// Aviso dentro de la página de que el apodo cambió, para que el Navbar
// actualice sus íconos sin recargar. Sólo en el navegador.
export const EVENTO_APODO_CAMBIADO = 'bahia:apodo-cambiado'

export function avisarApodoCambiado(apodo) {
  if (typeof window === 'undefined') return
  window.dispatchEvent(new CustomEvent(EVENTO_APODO_CAMBIADO, { detail: apodo }))
}

export const LARGO_MINIMO_APODO = 3
export const LARGO_MAXIMO_APODO = 30

// Los animales de public.generar_apodo() (migración 011). Tiene que ser la
// misma lista: se usa para que un apodo que dio la propia base no choque con
// la moderación ("Llama" se lee como "llamá" = pedido de contacto).
export const ANIMALES_APODO = [
  'Jirafa', 'Cebra', 'Tortuga', 'Nutria', 'Ardilla', 'Libélula', 'Mariposa',
  'Luciérnaga', 'Garza', 'Abeja', 'Iguana', 'Alpaca', 'Llama', 'Golondrina',
  'Cigüeña', 'Gacela', 'Pantera', 'Orca', 'Vicuña',
  'Zorro', 'Pingüino', 'Koala', 'Delfín', 'Búho', 'Erizo', 'Castor', 'Tucán',
  'Camaleón', 'Pulpo', 'Caracol', 'Colibrí', 'Flamenco', 'Mapache', 'Panda',
  'Tigre', 'Lobo', 'Ciervo', 'Canguro', 'Elefante',
]

// Pasteles para el avatar. El color sale de la primera palabra del apodo (el
// animal), así que el mismo animal tiene siempre el mismo color.
const COLORES_PASTEL = [
  '#f1f29f', '#d4e8f0', '#f0e0d0', '#e8d4f0', '#d0f0e0', '#f0d4d4',
  '#fde2b8', '#cfe3ff', '#e2f0cb', '#ffd6e8', '#d7d0f5', '#c9f0ec',
]

function sinTildes(texto) {
  return texto.normalize('NFD').replace(/[̀-ͯ]/g, '')
}

function primeraPalabra(apodo) {
  return String(apodo ?? '').trim().split(/\s+/)[0] || ''
}

export function inicialDeApodo(apodo) {
  const palabra = primeraPalabra(apodo)
  return palabra ? palabra.charAt(0).toUpperCase() : '?'
}

export function colorDeApodo(apodo) {
  const clave = sinTildes(primeraPalabra(apodo).toLowerCase())
  if (!clave) return '#ecebe7'
  let hash = 0
  for (const letra of clave) hash = (hash * 31 + letra.charCodeAt(0)) >>> 0
  return COLORES_PASTEL[hash % COLORES_PASTEL.length]
}

// Letras (con tildes), números, espacios y . - _ ' — nada que sirva para
// armar un link o un comodín de búsqueda.
const RE_CARACTERES = /^[\p{L}\p{N} .'_-]+$/u
// Links que revisarPublicacion no caza (sólo mira redes puntuales).
const RE_LINK_GENERICO = /(https?:|www\.|\.(com|ar|net|org|io|app|me|link)\b)/i
const RE_ANIMALES = new RegExp(`(^|\\s)(${ANIMALES_APODO.join('|')})(?=\\s|$)`, 'giu')

// Devuelve { ok: true, apodo } (recortado) o { ok: false, motivo }.
export function validarApodo(valor) {
  const apodo = String(valor ?? '').trim().replace(/\s+/g, ' ')

  if (apodo.length < LARGO_MINIMO_APODO || apodo.length > LARGO_MAXIMO_APODO) {
    return { ok: false, motivo: `El apodo tiene que tener entre ${LARGO_MINIMO_APODO} y ${LARGO_MAXIMO_APODO} caracteres.` }
  }
  if (!RE_CARACTERES.test(apodo)) {
    return { ok: false, motivo: "Usá solo letras, números, espacios y . - _ '" }
  }
  if (RE_LINK_GENERICO.test(apodo)) {
    return { ok: false, motivo: 'El apodo no puede tener links.' }
  }

  // Los nombres de animales del generador se sacan antes de moderar: son
  // nuestros, y "Llama" no es un pedido de contacto.
  const aRevisar = apodo.replace(RE_ANIMALES, '$1')
  const revision = revisarPublicacion(aRevisar)
  if (revision.nivel === 'bloqueo') {
    const tipo = revision.bloqueos[0]?.tipo
    const que = ETIQUETAS_MODERACION[tipo] || 'algo que no se permite'
    return { ok: false, motivo: `Ese apodo no se puede usar: tiene ${que}. Sin teléfonos, mails ni links.` }
  }

  return { ok: true, apodo }
}
