// "Ver más reseñas" de la página pública de una tienda.
//
//   GET ?desde=10  -> { resenas: [{ id, apodo, estrellas, texto, creado_en }], hayMas }
//
// Pública: no pide sesión. Lee con service_role (resenas no tiene permisos
// para el navegador), así que la regla de qué tienda se muestra se aplica a
// mano: publicada, no bloqueada, no pausada, no cerrada (la ficha de una
// pausada no muestra reseñas). No devuelve el pedido ni quién la escribió:
// solo el apodo de hoy.

import { NextResponse } from 'next/server'
import { getServiceRoleClient } from '@/lib/supabase/admin'
import { soloVendedoresPublicados } from '@/lib/vendedoresPublicos'
import { resenasPublicadas } from '@/lib/resenasServidor'

export async function GET(request, { params }) {
  const vendedorId = Number((await params).id)
  if (!Number.isInteger(vendedorId) || vendedorId <= 0) {
    return NextResponse.json({ error: 'Tienda inválida.' }, { status: 400 })
  }
  const desde = Number(new URL(request.url).searchParams.get('desde') || 0)
  if (!Number.isInteger(desde) || desde < 0 || desde > 10000) {
    return NextResponse.json({ error: 'Página inválida.' }, { status: 400 })
  }

  const admin = getServiceRoleClient()
  const { data: tienda, error: errorTienda } = await soloVendedoresPublicados(
    admin.from('vendedores').select('id').eq('id', vendedorId)
  ).maybeSingle()
  if (errorTienda) {
    console.error('[tiendas/resenas/tienda]', vendedorId, errorTienda.message)
    return NextResponse.json({ error: 'No pudimos cargar las reseñas.' }, { status: 500 })
  }
  if (!tienda) return NextResponse.json({ error: 'No encontramos esa tienda.' }, { status: 404 })

  const lista = await resenasPublicadas(admin, vendedorId, { desde })
  if (lista.error) {
    console.error('[tiendas/resenas/lista]', vendedorId, lista.error.message)
    return NextResponse.json({ error: 'No pudimos cargar las reseñas.' }, { status: 500 })
  }
  return NextResponse.json({ resenas: lista.resenas, hayMas: lista.hayMas })
}
