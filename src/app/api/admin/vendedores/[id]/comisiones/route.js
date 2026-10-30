// La comisión especial de una tienda (migración 042), para el admin.
//
//   GET   -> { comisiones: [...] }  el historial, de la más nueva a la más
//            vieja, cada una con su estado: 'vigente', 'vencida' o 'terminada'
//   POST  { porcentaje, venceEn, motivo } -> { ok, id, terminadas }
//            carga una nueva y termina la vigente, si había
//            (privado.cargar_comision_especial: todo en una transacción).
//
// porcentaje: de 0 a 4,99, con hasta dos decimales (número o texto, con coma
// o punto). Se guarda en puntos básicos (1,5 -> 150). 5 o más no tendría
// efecto: siempre se cobra la más baja entre la especial y la normal
// (src/lib/comision.js).
// venceEn: fecha futura (ISO) o vacío = sin vencimiento. «Vence el 31/12» vale
// todo ese día: el panel manda el día siguiente a las 00:00 de Argentina
// (venceEnDesdeDia, src/lib/comision.js).
// motivo: obligatorio, hasta 300 caracteres. No lo ve la tienda.
//
// El admin que la carga sale de la sesión, nunca del body.

import { NextResponse } from 'next/server'
import { getServiceRoleClient, verificarAdmin } from '@/lib/supabase/admin'
import { porcentajeABp, estadoDeComision, MAX_MOTIVO_ESPECIAL } from '@/lib/comision'

function idDeLaRuta(valor) {
  const id = Number(valor)
  return Number.isInteger(id) && id > 0 ? id : null
}

export async function GET(_request, { params }) {
  const adminUser = await verificarAdmin()
  if (!adminUser) return NextResponse.json({ error: 'No autorizado.' }, { status: 403 })

  const vendedorId = idDeLaRuta((await params).id)
  if (!vendedorId) return NextResponse.json({ error: 'La tienda no es válida.' }, { status: 400 })

  const admin = getServiceRoleClient()
  const { data, error } = await admin
    .from('vendedor_comisiones')
    .select('id, comision_bp, desde, vence_en, terminada_en, terminada_por, motivo, creado_por, creado_en')
    .eq('vendedor_id', vendedorId)
    .order('creado_en', { ascending: false })
  if (error) {
    console.error('[admin-comisiones/listar]', vendedorId, error.message)
    return NextResponse.json({ error: 'No se pudo leer el historial.' }, { status: 500 })
  }

  const ahora = Date.now()
  const comisiones = (data || []).map((c) => ({
    ...c,
    porcentaje: c.comision_bp / 100,
    estado: estadoDeComision(c, ahora),
  }))
  return NextResponse.json({ comisiones })
}

export async function POST(request, { params }) {
  const adminUser = await verificarAdmin()
  if (!adminUser) return NextResponse.json({ error: 'No autorizado.' }, { status: 403 })

  const vendedorId = idDeLaRuta((await params).id)
  if (!vendedorId) return NextResponse.json({ error: 'La tienda no es válida.' }, { status: 400 })

  let body
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'No pudimos leer los datos.' }, { status: 400 })
  }

  const bp = porcentajeABp(body?.porcentaje)
  if (bp === null) {
    return NextResponse.json({ error: 'El porcentaje tiene que ser de 0 a 4,99, con hasta dos decimales.' }, { status: 400 })
  }

  let venceEn = null
  if (body?.venceEn !== undefined && body?.venceEn !== null && body?.venceEn !== '') {
    const ms = typeof body.venceEn === 'string' ? Date.parse(body.venceEn) : NaN
    if (!Number.isFinite(ms)) return NextResponse.json({ error: 'La fecha de vencimiento no es válida.' }, { status: 400 })
    if (ms <= Date.now()) return NextResponse.json({ error: 'La fecha de vencimiento tiene que ser futura.' }, { status: 400 })
    venceEn = new Date(ms).toISOString()
  }

  const motivo = typeof body?.motivo === 'string' ? body.motivo.trim() : ''
  if (!motivo) return NextResponse.json({ error: 'Escribí el motivo.' }, { status: 400 })
  if (motivo.length > MAX_MOTIVO_ESPECIAL) return NextResponse.json({ error: `El motivo puede tener hasta ${MAX_MOTIVO_ESPECIAL} caracteres.` }, { status: 400 })

  const admin = getServiceRoleClient()
  const { data, error } = await admin.rpc('rpc_cargar_comision_especial', {
    p_vendedor_id: vendedorId,
    p_comision_bp: bp,
    p_vence_en: venceEn,
    p_motivo: motivo,
    p_admin: adminUser.id,
  })
  if (error || !data || typeof data !== 'object') {
    console.error('[admin-comisiones/cargar]', vendedorId, error?.message || 'respuesta vacía')
    return NextResponse.json({ error: 'No se pudo cargar la comisión.' }, { status: 500 })
  }
  if (data.ok === false) {
    if (data.motivo === 'no_existe') return NextResponse.json({ error: 'No existe esa tienda.' }, { status: 404 })
    return NextResponse.json({ error: 'La fecha de vencimiento tiene que ser futura.' }, { status: 400 })
  }

  console.log(`Comisión especial (admin ${adminUser.id}): tienda ${vendedorId}, ${bp} bp, vence ${venceEn || 'nunca'}, ${data.terminadas} terminada(s).`)
  return NextResponse.json({ ok: true, id: data.id, terminadas: data.terminadas })
}
