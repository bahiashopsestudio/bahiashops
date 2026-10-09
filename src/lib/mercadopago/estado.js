// El parámetro "state" del OAuth de MercadoPago: protege la conexión de una
// cuenta contra un pedido armado por otra persona (CSRF). Al empezar la conexión
// se genera un valor al azar, se guarda en una cookie del navegador y viaja a
// MercadoPago; al volver, el callback exige que lo que MercadoPago devuelve sea
// igual a la cookie. Quien no inició la conexión desde SU navegador no tiene la
// cookie, así que no puede hacer que se guarde una cuenta ajena.

export const COOKIE_ESTADO_MP = 'mp_oauth_state'
export const VIDA_ESTADO_MP_SEGUNDOS = 10 * 60

// 24 bytes al azar, en hexadecimal (48 caracteres).
export function generarEstadoMp() {
  const bytes = new Uint8Array(24)
  crypto.getRandomValues(bytes)
  return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('')
}

// ¿Lo que devolvió MercadoPago es lo que guardamos en la cookie? Sin ninguno de
// los dos, o con valores distintos, no. Comparación en tiempo constante.
export function estadoMpValido(recibido, guardado) {
  if (typeof recibido !== 'string' || typeof guardado !== 'string') return false
  if (recibido.length < 32 || recibido.length !== guardado.length) return false
  let diferencia = 0
  for (let i = 0; i < recibido.length; i++) diferencia |= recibido.charCodeAt(i) ^ guardado.charCodeAt(i)
  return diferencia === 0
}
