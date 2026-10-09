// Confirma un enlace de los mails de Supabase Auth (registro, recuperar
// contraseña, cambio de email, invitación) del lado del servidor, con
// verifyOtp y el token_hash del mail. No necesita nada del navegador donde se
// pidió: funciona en cualquier navegador o dispositivo (la app de Gmail del
// celular, por ejemplo). Lo llama el botón de /auth/confirmar.
//
// Valida, en este orden: que el formulario venga de este mismo sitio, que el
// type y el token tengan forma válida, y el destino (nunca afuera del sitio).
// La regla está en src/lib/confirmacionAuth.js.

import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { destinoDespuesDeEntrar } from '@/lib/destinoIngreso'
import { leerConfirmacion, destinoFijo, origenPermitido, esVencido } from '@/lib/confirmacionAuth'
import { origenPublico } from '@/lib/sitio'

export async function POST(request) {
  // El de request.url; detrás del túnel de desarrollo, el del túnel (sitio.js).
  const origen = origenPublico(request)

  // 303: después de un POST, el navegador sigue con un GET.
  const aError = (motivo, tipo) => {
    const url = new URL('/auth/confirmar', origen)
    url.searchParams.set('error', motivo)
    if (tipo) url.searchParams.set('type', tipo)
    return NextResponse.redirect(url, 303)
  }

  if (!origenPermitido(request.headers.get('origin'), origen)) {
    console.warn('Confirmar enlace: el formulario vino de otro origen.')
    return aError('origen')
  }

  let formulario
  try {
    formulario = await request.formData()
  } catch {
    return aError('invalido')
  }
  const leido = (clave) => {
    const valor = formulario.get(clave)
    return typeof valor === 'string' ? valor : undefined
  }

  const pedido = leerConfirmacion({
    token_hash: leido('token_hash'),
    type: leido('type'),
    next: leido('next'),
    redirect_to: leido('redirect_to'),
  }, origen)
  if (!pedido.ok) return aError('invalido')

  const supabase = await createClient()
  const { data, error } = await supabase.auth.verifyOtp({ type: pedido.tipo, token_hash: pedido.tokenHash })

  if (error) {
    console.warn(`Confirmar enlace (${pedido.tipo}): Supabase lo rechazó —`, error.code || '', error.message)
    return aError(esVencido(error) ? 'vencido' : 'invalido', pedido.tipo)
  }

  const destino = destinoFijo(pedido.tipo) ?? await destinoDespuesDeEntrar(supabase, data?.user, pedido.next)
  return NextResponse.redirect(new URL(destino, origen), 303)
}
