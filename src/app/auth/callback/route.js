import { createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'
import { rutaInterna } from '@/lib/rutas'
import { destinoDespuesDeEntrar } from '@/lib/destinoIngreso'
import { origenPublico } from '@/lib/sitio'

// Vuelta de Google, de la confirmación del mail y del link de recuperar la
// contraseña. Adónde sigue lo decide destinoDespuesDeEntrar: la primera vez,
// la bienvenida; después, next.
export async function GET(request) {
  const { searchParams } = new URL(request.url)
  // El de request.url; detrás del túnel de desarrollo, el del túnel (sitio.js).
  const origin = origenPublico(request)
  const code = searchParams.get('code')
  // Nunca confiar en el next que llega por la URL: puede venir de un link
  // armado por un tercero, no del login nuestro.
  const next = rutaInterna(searchParams.get('next'))

  if (code) {
    const supabase = await createClient()
    const { data, error } = await supabase.auth.exchangeCodeForSession(code)

    if (!error) {
      const destino = await destinoDespuesDeEntrar(supabase, data?.user, next)
      return NextResponse.redirect(new URL(destino, origin))
    }
  }

  // Se conserva el next: al volver a intentar, la persona sigue donde iba.
  const url = new URL('/entrar', origin)
  url.searchParams.set('error', 'auth')
  if (next !== '/') url.searchParams.set('next', next)
  return NextResponse.redirect(url)
}
