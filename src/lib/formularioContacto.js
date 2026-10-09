// Qué email y qué cuenta lleva el formulario de contacto («Contactanos»).
//
// El formulario cuelga del layout raíz (BotonContacto), así que no se vuelve a
// montar al navegar: si leía la sesión una sola vez, después de cerrar sesión
// seguía mostrando el email de la persona anterior y mandaba el mensaje a nombre
// de su cuenta. Ahora la sesión se lee cada vez que se abre y otra vez al enviar,
// con estas funciones. Nunca lanzan: sin sesión (o si la lectura falla) el
// formulario queda vacío y el mensaje sale sin cuenta.

// { email, usuarioId } de la sesión activa, o vacíos si no hay.
export async function sesionParaContacto(supabase) {
  try {
    const { data } = await supabase.auth.getUser()
    const user = data?.user
    if (!user) return { email: '', usuarioId: null }
    return { email: user.email || '', usuarioId: user.id || null }
  } catch {
    return { email: '', usuarioId: null }
  }
}

// El email que tiene que quedar en el campo al terminar de leer la sesión: si la
// persona ya escribió uno mientras se leía, no se lo pisa.
export function precargarEmail(actual, sesion) {
  return String(actual ?? '').trim() ? actual : (sesion?.email || '')
}
