// Los planes (migración 046), para el admin.
//
//   GET    -> { planes: [...] }  los tres, por orden, con cuándo se editó cada uno
//   PATCH  { clave, precio_mensual, tope_productos, fotos_por_producto,
//            carritos_abandonados, disponible } -> { ok, plan }
//
// Las reglas: validarPlanAdmin (src/lib/planes.js) y, de respaldo, las de la
// tabla y sus disparadores (un plan asignado a una tienda no puede quedar sin
// tope ni fotos). El Pro no se edita todavía. El admin que guarda sale de la
// sesión, nunca del body.
//
// Al guardar, /vender se vuelve a armar en la próxima visita
// (revalidatePath): el cambio se ve ahí sin esperar los 5 minutos de su
// revalidate. El panel de cada tienda lee el plan en cada visita.

import { NextResponse } from 'next/server'
import { revalidatePath } from 'next/cache'
import { getServiceRoleClient, verificarAdmin } from '@/lib/supabase/admin'
import { validarPlanAdmin } from '@/lib/planes'

const COLUMNAS = 'clave, nombre, orden, precio_mensual, tope_productos, fotos_por_producto, carritos_abandonados, disponible, actualizado_en, actualizado_por'

export async function GET() {
  const adminUser = await verificarAdmin()
  if (!adminUser) return NextResponse.json({ error: 'No autorizado.' }, { status: 403 })

  const admin = getServiceRoleClient()
  const { data, error } = await admin.from('planes').select(COLUMNAS).order('orden')
  if (error) {
    console.error('[admin-planes/listar]', error.message)
    return NextResponse.json({ error: 'No pudimos cargar los planes.' }, { status: 500 })
  }
  return NextResponse.json({ planes: data || [] })
}

export async function PATCH(request) {
  const adminUser = await verificarAdmin()
  if (!adminUser) return NextResponse.json({ error: 'No autorizado.' }, { status: 403 })

  const cuerpo = await request.json().catch(() => null)
  const clave = typeof cuerpo?.clave === 'string' ? cuerpo.clave : null
  if (!clave) return NextResponse.json({ error: 'Falta el plan.' }, { status: 400 })

  const admin = getServiceRoleClient()
  const { data: actual, error: errorLeer } = await admin.from('planes').select(COLUMNAS).eq('clave', clave).maybeSingle()
  if (errorLeer) {
    console.error('[admin-planes/leer]', clave, errorLeer.message)
    return NextResponse.json({ error: 'No pudimos guardar el plan. Probá de nuevo.' }, { status: 500 })
  }
  if (!actual) return NextResponse.json({ error: 'No encontramos ese plan.' }, { status: 404 })

  const validado = validarPlanAdmin(cuerpo, actual)
  if (!validado.ok) return NextResponse.json({ error: validado.error }, { status: 400 })

  const { data, error } = await admin
    .from('planes')
    .update({ ...validado.cambios, actualizado_en: new Date().toISOString(), actualizado_por: adminUser.id })
    .eq('clave', clave)
    .select(COLUMNAS)
    .maybeSingle()
  if (error) {
    // 23514: una regla de la tabla o el disparador del plan asignado (su
    // mensaje, en castellano, dice qué pasó).
    if (error.code === '23514') {
      const asignado = /asignado/i.test(error.message || '')
      return NextResponse.json({
        error: asignado ? error.message : 'Esos valores no se pueden guardar: revisá el precio, el tope y las fotos.',
      }, { status: 400 })
    }
    console.error('[admin-planes/guardar]', clave, error.code, error.message)
    return NextResponse.json({ error: 'No pudimos guardar el plan. Probá de nuevo.' }, { status: 500 })
  }

  revalidatePath('/vender')
  return NextResponse.json({ ok: true, plan: data })
}
