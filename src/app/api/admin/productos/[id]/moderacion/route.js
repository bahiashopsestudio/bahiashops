// Moderar un producto: desde la cola (/admin/moderacion), desde "Revisar
// después" y desde /admin/denuncias.
//
//   POST { accion: 'aprobar' }           -> en_revision pasa a activo
//   POST { accion: 'rechazar', motivo }  -> en revisión O ya publicado (activo,
//                                           pausado o agotado) pasa a rechazado
//   POST { accion: 'dar_por_revisado' }  -> limpia la marca de "Revisar después"
//                                           (el producto sigue igual)
//
// El navegador no puede escribir en productos (migración 033), ni siquiera un
// admin: va por acá, con verificarAdmin + service_role.
//
// Rechazar va por public.rpc_rechazar_producto (migración 035): en una sola
// transacción guarda el motivo (lo ve el vendedor), limpia la marca de
// revisión posterior y resuelve las denuncias pendientes. Si la función
// todavía no existe, rechaza como antes (solo productos en revisión).
//
// Los WHERE repiten el estado de partida: lo que ya se moderó da 409.

import { NextResponse } from 'next/server'
import { getServiceRoleClient, verificarAdmin } from '@/lib/supabase/admin'

const MAX_MOTIVO = 1000
const NO_SE_PUDO = 'No se pudo guardar la moderación.'
const faltaLaFuncion = (error) => error?.code === 'PGRST202' || error?.code === '42883'

export async function POST(request, { params }) {
  const adminUser = await verificarAdmin()
  if (!adminUser) return NextResponse.json({ error: 'No autorizado.' }, { status: 403 })

  const id = Number((await params).id)
  if (!Number.isInteger(id) || id <= 0) return NextResponse.json({ error: 'Producto inválido.' }, { status: 400 })

  const cuerpo = await request.json().catch(() => null)
  const admin = getServiceRoleClient()

  if (cuerpo?.accion === 'aprobar') {
    return actualizar(admin, id, adminUser, { estado: 'activo', motivo_rechazo: null }, (q) => q.eq('estado', 'en_revision'),
      'Este producto ya no está en la cola de revisión.')
  }

  if (cuerpo?.accion === 'dar_por_revisado') {
    return actualizar(admin, id, adminUser, { revision_posterior_desde: null }, (q) => q.not('revision_posterior_desde', 'is', null),
      'Este producto ya no está para revisar.')
  }

  if (cuerpo?.accion === 'rechazar') {
    const motivo = typeof cuerpo.motivo === 'string' ? cuerpo.motivo.trim() : ''
    if (!motivo) return NextResponse.json({ error: 'Elegí un motivo para que el vendedor sepa qué corregir.' }, { status: 400 })
    if (motivo.length > MAX_MOTIVO) return NextResponse.json({ error: 'El motivo es demasiado largo.' }, { status: 400 })

    const { data, error } = await admin.rpc('rpc_rechazar_producto', { p_producto_id: id, p_motivo: motivo, p_admin_id: adminUser.id })
    if (error && faltaLaFuncion(error)) {
      console.warn('[admin-moderacion] rpc_rechazar_producto no existe todavía: rechazo solo en revisión.')
      return actualizar(admin, id, adminUser, { estado: 'rechazado', motivo_rechazo: motivo }, (q) => q.eq('estado', 'en_revision'),
        'Este producto ya no está en la cola de revisión.')
    }
    if (error) {
      console.error('[admin-moderacion/rechazar]', id, error.message)
      return NextResponse.json({ error: NO_SE_PUDO }, { status: 500 })
    }
    if (data?.resultado === 'no_existe') return NextResponse.json({ error: 'No encontramos ese producto.' }, { status: 404 })
    if (data?.resultado !== 'rechazado') return NextResponse.json({ error: 'Este producto ya está rechazado.' }, { status: 409 })

    console.log(`Moderación: producto ${id} rechazado por ${adminUser.id} (${data.denuncias_resueltas || 0} denuncia(s) resuelta(s)).`)
    return NextResponse.json({ ok: true, estado: 'rechazado', denuncias_resueltas: data.denuncias_resueltas || 0 })
  }

  return NextResponse.json({ error: 'Acción inválida.' }, { status: 400 })
}

async function actualizar(admin, id, adminUser, cambios, condicion, yaModerado) {
  const { data, error } = await condicion(
    admin.from('productos').update({ ...cambios, actualizado_en: new Date().toISOString() }).eq('id', id)
  ).select('id, estado').maybeSingle()
  if (error) {
    console.error('[admin-moderacion/actualizar]', id, error.message)
    return NextResponse.json({ error: NO_SE_PUDO }, { status: 500 })
  }
  if (!data) return NextResponse.json({ error: yaModerado }, { status: 409 })

  console.log(`Moderación: producto ${id} (${Object.keys(cambios).join(', ')}) por ${adminUser.id}.`)
  return NextResponse.json({ ok: true, estado: data.estado })
}
