// Lo que la tienda elige ver en Mi negocio (migración 043).
//
//   PATCH { cartelPublicadaCerrado: true } | { linkMinimizado: boolean } -> { ok: true }
//
// El cartel de "publicada" se cierra para siempre: no hay forma de reabrirlo.
//
// La tienda sale de la sesión. Escribe con service_role a propósito: desde el
// navegador, cualquier UPDATE de vendedores devuelve a revisión una tienda en
// 'necesita_cambios' (disparador de la migración 006), y minimizar el link no
// es cambiar la tienda.

import { NextResponse } from 'next/server'
import { tiendaDeLaSesion } from '@/lib/tiendaDeLaSesion'

const NO_VALIDO = 'No pudimos leer el cambio.'

// Del cuerpo a las columnas, o null si trae cualquier otra cosa.
function cambiosDe(body) {
  if (!body || typeof body !== 'object' || Array.isArray(body)) return null
  const claves = Object.keys(body)
  if (claves.length === 0) return null

  const cambios = {}
  for (const clave of claves) {
    if (clave === 'cartelPublicadaCerrado' && body[clave] === true) {
      cambios.cartel_publicada_cerrado = true
    } else if (clave === 'linkMinimizado' && typeof body[clave] === 'boolean') {
      cambios.link_propio_minimizado = body[clave]
    } else {
      return null
    }
  }
  return cambios
}

export async function PATCH(request) {
  const { respuesta, vendedor, admin } = await tiendaDeLaSesion('preferencias')
  if (respuesta) return respuesta

  let body
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: NO_VALIDO }, { status: 400 })
  }

  const cambios = cambiosDe(body)
  if (!cambios) return NextResponse.json({ error: NO_VALIDO }, { status: 400 })

  const { error } = await admin.from('vendedores').update(cambios).eq('id', vendedor.id)
  if (error) {
    console.error('[preferencias]', vendedor.id, error.message)
    return NextResponse.json({ error: 'No pudimos guardar el cambio. Probá de nuevo en un momento.' }, { status: 500 })
  }
  return NextResponse.json({ ok: true })
}
