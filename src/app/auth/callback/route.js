import { createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'
import { rutaInterna } from '@/lib/rutas'

export async function GET(request) {
  const { searchParams, origin } = new URL(request.url)
  const code = searchParams.get('code')
  // Nunca confiar en el next que llega por la URL: puede venir de un link
  // armado por un tercero, no del login nuestro.
  const next = rutaInterna(searchParams.get('next'))

  if (code) {
    const supabase = await createClient()
    const { error } = await supabase.auth.exchangeCodeForSession(code)

    if (!error) {
      return NextResponse.redirect(new URL(next, origin))
    }
  }

  return NextResponse.redirect(new URL('/login?error=auth', origin))
}
