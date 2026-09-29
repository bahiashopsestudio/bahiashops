// Adónde va una persona después de entrar. Es el único lugar que lo decide:
// lo usan /auth/callback (Google, confirmación de mail) y el ingreso con
// contraseña de /entrar.
//
// La primera vez que entra una cuenta nueva pasa por /bienvenida, llevando
// consigo el next. Después, directo a next.
//
// Nunca traba el ingreso: si la lectura de usuarios falla o la fila no está,
// se sigue a next como si nada.

import { rutaInterna } from '@/lib/rutas'

// Flujos que no pueden pasar por la bienvenida: quien recupera la contraseña
// tiene que llegar directo a cambiarla.
const SIN_BIENVENIDA = ['/actualizar-contrasena']

// `supabase` es el cliente de sesión (del servidor o del navegador): la
// persona puede leer su propia fila de usuarios. `next` puede venir crudo de
// la URL: acá se valida.
export async function destinoDespuesDeEntrar(supabase, user, next) {
  const destino = rutaInterna(next)

  if (!user?.id) return destino
  if (SIN_BIENVENIDA.some((ruta) => destino.startsWith(ruta))) return destino

  try {
    const { data, error } = await supabase
      .from('usuarios')
      .select('bienvenida_vista_en')
      .eq('id', user.id)
      .maybeSingle()

    if (error || !data) {
      if (error) console.warn('destinoDespuesDeEntrar: no se pudo leer usuarios', error.message)
      return destino
    }

    if (data.bienvenida_vista_en === null) {
      return `/bienvenida?next=${encodeURIComponent(destino)}`
    }
  } catch (err) {
    console.warn('destinoDespuesDeEntrar: error leyendo usuarios', err?.message)
  }

  return destino
}
