// Terminar antes de tiempo la comisión especial de una tienda (migración 042).
//
//   PATCH { terminar: true } -> { ok: true }
//
// Solo si es de esa tienda y sigue vigente; si no, 404. El admin que la
// termina sale de la sesión.

import { NextResponse } from 'next/server'
import { getServiceRoleClient, verificarAdmin } from '@/lib/supabase/admin'

function idDeLaRuta(valor) {
  const id = Number(valor)
  return Number.isInteger(id) && id > 0 ? id : null
}

export async function PATCH(request, { params }) {
  const adminUser = await verificarAdmin()
  if (!adminUser) return NextResponse.json({ error: 'No autorizado.' }, { status: 403 })

  const { id, comisionId } = await params
  const vendedorId = idDeLaRuta(id)
  const idComision = idDeLaRuta(comisionId)
  if (!vendedorId || !idComision) return NextResponse.json({ error: 'No encontramos esa comisión.' }, { status: 404 })

  let body
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'No pudimos leer los datos.' }, { status: 400 })
  }
  if (body?.terminar !== true) return NextResponse.json({ error: 'Lo único que se puede hacer es terminarla.' }, { status: 400 })

  const admin = getServiceRoleClient()
  const { data, error } = await admin.rpc('rpc_terminar_comision_especial', {
    p_vendedor_id: vendedorId,
    p_comision_id: idComision,
    p_admin: adminUser.id,
  })
  if (error || !data || typeof data !== 'object') {
    console.error('[admin-comisiones/terminar]', vendedorId, idComision, error?.message || 'respuesta vacía')
    return NextResponse.json({ error: 'No se pudo terminar la comisión.' }, { status: 500 })
  }
  if (data.ok !== true) {
    return NextResponse.json({ error: 'No encontramos esa comisión vigente en esta tienda.' }, { status: 404 })
  }

  console.log(`Comisión especial terminada (admin ${adminUser.id}): tienda ${vendedorId}, comisión ${idComision}.`)
  return NextResponse.json({ ok: true })
}
