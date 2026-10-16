// Descartar las denuncias pendientes de un producto (/admin/denuncias).
//
//   POST { accion: 'descartar' } -> { ok, descartadas }
//
// El producto no cambia: sigue publicado. Las denuncias quedan como
// 'descartada', con la fecha y quién las resolvió. Para rechazar el producto
// está /api/admin/productos/[id]/moderacion (que también las resuelve).

import { NextResponse } from 'next/server'
import { getServiceRoleClient, verificarAdmin } from '@/lib/supabase/admin'

export async function POST(request, { params }) {
  const adminUser = await verificarAdmin()
  if (!adminUser) return NextResponse.json({ error: 'No autorizado.' }, { status: 403 })

  const productoId = Number((await params).productoId)
  if (!Number.isInteger(productoId) || productoId <= 0) return NextResponse.json({ error: 'Producto inválido.' }, { status: 400 })

  const cuerpo = await request.json().catch(() => null)
  if (cuerpo?.accion !== 'descartar') return NextResponse.json({ error: 'Acción inválida.' }, { status: 400 })

  const admin = getServiceRoleClient()
  const { data, error } = await admin
    .from('denuncias_productos')
    .update({ estado: 'descartada', resuelta_en: new Date().toISOString(), resuelta_por: adminUser.id })
    .eq('producto_id', productoId)
    .eq('estado', 'pendiente')
    .select('id')
  if (error) {
    console.error('[admin-denuncias/descartar]', productoId, error.message)
    return NextResponse.json({ error: 'No se pudieron descartar las denuncias.' }, { status: 500 })
  }
  if (!data || data.length === 0) {
    return NextResponse.json({ error: 'Este producto ya no tiene denuncias pendientes.' }, { status: 409 })
  }

  console.log(`Denuncias: ${data.length} descartada(s) del producto ${productoId} por ${adminUser.id}.`)
  return NextResponse.json({ ok: true, descartadas: data.length })
}
