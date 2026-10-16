// Moderar un producto de la cola (/admin/moderacion).
//
//   POST { accion: 'aprobar' }                -> en_revision pasa a activo
//   POST { accion: 'rechazar', motivo }       -> en_revision pasa a rechazado
//
// Antes lo hacía la página desde el navegador; desde la migración 033 el
// navegador no puede escribir en productos (ni siquiera un admin), así que va
// por acá: verificarAdmin + service_role. El WHERE repite 'en_revision': un
// producto que ya se moderó (o que el vendedor sacó de la cola) da 409.

import { NextResponse } from 'next/server'
import { getServiceRoleClient, verificarAdmin } from '@/lib/supabase/admin'

const MAX_MOTIVO = 1000

export async function POST(request, { params }) {
  const adminUser = await verificarAdmin()
  if (!adminUser) return NextResponse.json({ error: 'No autorizado.' }, { status: 403 })

  const id = Number((await params).id)
  if (!Number.isInteger(id) || id <= 0) return NextResponse.json({ error: 'Producto inválido.' }, { status: 400 })

  const cuerpo = await request.json().catch(() => null)
  let cambios
  if (cuerpo?.accion === 'aprobar') {
    cambios = { estado: 'activo', motivo_rechazo: null }
  } else if (cuerpo?.accion === 'rechazar') {
    const motivo = typeof cuerpo.motivo === 'string' ? cuerpo.motivo.trim() : ''
    if (!motivo) return NextResponse.json({ error: 'Elegí un motivo para que el vendedor sepa qué corregir.' }, { status: 400 })
    if (motivo.length > MAX_MOTIVO) return NextResponse.json({ error: 'El motivo es demasiado largo.' }, { status: 400 })
    cambios = { estado: 'rechazado', motivo_rechazo: motivo }
  } else {
    return NextResponse.json({ error: 'Acción inválida.' }, { status: 400 })
  }

  const admin = getServiceRoleClient()
  const { data, error } = await admin
    .from('productos')
    .update({ ...cambios, actualizado_en: new Date().toISOString() })
    .eq('id', id)
    .eq('estado', 'en_revision')
    .select('id, estado')
    .maybeSingle()
  if (error) {
    console.error('[admin-moderacion/actualizar]', id, error.message)
    return NextResponse.json({ error: 'No se pudo guardar la moderación.' }, { status: 500 })
  }
  if (!data) {
    return NextResponse.json({ error: 'Este producto ya no está en la cola de revisión.' }, { status: 409 })
  }

  console.log(`Moderación: producto ${id} ${data.estado} por ${adminUser.id}.`)
  return NextResponse.json({ ok: true, estado: data.estado })
}
