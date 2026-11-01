// Las reglas de los dos formularios públicos que guarda el servidor desde la
// migración 032: el de contacto (/api/contacto) y el de interesados en vender
// alimentos (/api/leads). Funciones puras.
//
// Lo que llega es JSON de quien sea: puede no ser un texto, venir vacío o ser
// enorme. Cada validación devuelve { ok: true, ...campos limpios } o
// { ok: false, error } con un texto para mostrar.

export const MAX_TEXTO = 2000
export const MAX_EMAIL = 254
export const MAX_WHATSAPP = 30
export const MAX_CIUDAD = 120

// Un mail con forma razonable: algo@algo.algo, sin espacios ni comillas ni
// signos de etiqueta. No pretende ser RFC 5322: alcanza para rechazar basura y
// para que el email no pueda colar saltos de línea en un encabezado.
const RE_EMAIL = /^[^\s@"'<>(),;:\\]+@[^\s@"'<>(),;:\\]+\.[^\s@"'<>(),;:\\]+$/

function comoTexto(valor) {
  if (valor === null || valor === undefined) return ''
  if (typeof valor !== 'string' && typeof valor !== 'number') return ''
  return String(valor).trim()
}

export function emailValido(email) {
  const texto = comoTexto(email)
  return texto.length > 0 && texto.length <= MAX_EMAIL && RE_EMAIL.test(texto)
}

// Contacto: { email, mensaje }, los dos obligatorios.
export function validarContacto(cuerpo) {
  const email = comoTexto(cuerpo?.email)
  const mensaje = comoTexto(cuerpo?.mensaje)
  if (!email || !mensaje) return { ok: false, error: 'Completá el email y el mensaje.' }
  if (!emailValido(email)) return { ok: false, error: 'Revisá el email: no parece válido.' }
  if (mensaje.length > MAX_TEXTO) return { ok: false, error: `El mensaje puede tener hasta ${MAX_TEXTO} caracteres.` }
  return { ok: true, email, mensaje }
}

// La ciudad que anota quien todavía no puede abrir su tienda: se guarda como la
// escribe, recortada. Los caracteres de control no son parte de ningún nombre.
const CONTROL = new RegExp('[\\u0000-\\u001f\\u007f\\u2028\\u2029]')
export function validarCiudadPedida(cuerpo) {
  if (typeof cuerpo?.ciudad !== 'string') return { ok: false, error: 'Escribí tu ciudad y provincia.' }
  const ciudad = cuerpo.ciudad.trim()
  if (!ciudad) return { ok: false, error: 'Escribí tu ciudad y provincia.' }
  if (ciudad.length > MAX_CIUDAD) return { ok: false, error: `Puede tener hasta ${MAX_CIUDAD} caracteres.` }
  if (CONTROL.test(ciudad)) return { ok: false, error: 'Revisá lo que escribiste: tiene caracteres que no van.' }
  return { ok: true, ciudad }
}

// Interesados en vender alimentos: { nombre, queHace } obligatorios;
// { whatsapp, email } opcionales.
export function validarLead(cuerpo) {
  const nombre = comoTexto(cuerpo?.nombre)
  const queHace = comoTexto(cuerpo?.queHace)
  const whatsapp = comoTexto(cuerpo?.whatsapp)
  const email = comoTexto(cuerpo?.email)
  if (!nombre || !queHace) return { ok: false, error: 'Nombre y actividad son obligatorios.' }
  if (nombre.length > MAX_TEXTO || queHace.length > MAX_TEXTO) {
    return { ok: false, error: `Cada campo puede tener hasta ${MAX_TEXTO} caracteres.` }
  }
  if (whatsapp && (whatsapp.length > MAX_WHATSAPP || !/^\+?[\d\s()-]+$/.test(whatsapp))) {
    return { ok: false, error: 'Revisá el WhatsApp: no parece un número.' }
  }
  if (email && !emailValido(email)) return { ok: false, error: 'Revisá el email: no parece válido.' }
  return { ok: true, nombre, queHace, whatsapp: whatsapp || null, email: email || null }
}
