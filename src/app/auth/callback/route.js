import { createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'

export async function GET(request) {
  const { searchParams, origin } = new URL(request.url)
  const code = searchParams.get('code')
  const next = searchParams.get('next') ?? '/'

  // Si Google no nos mandó ningún código, lo mostramos.
  if (!code) {
    return NextResponse.json({
      paso: 'No llegó ningún código de Google',
      parametros_recibidos: Object.fromEntries(searchParams),
    }, { status: 400 })
  }

  const supabase = await createClient()
  const { error } = await supabase.auth.exchangeCodeForSession(code)

  // Si el intercambio falló, mostramos el motivo REAL en vez de esconderlo.
  if (error) {
    return NextResponse.json({
      paso: 'Falló el intercambio de código por sesión',
      mensaje_de_error: error.message,
      detalle: error,
    }, { status: 400 })
  }

  // Si salió bien, entramos normalmente.
  return NextResponse.redirect(`${origin}${next}`)
}