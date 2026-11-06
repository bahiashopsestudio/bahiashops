// El plan de una tienda y sus condiciones especiales (migración 046), para la
// ficha del admin.
//
//   GET     -> { plan, especial, planes }
//              plan      el que rige: { clave, nombre, origen, especial, sinTope,
//                        tope, usados, fotosPorProducto, carritos, precio }
//                        (usados: todos los productos guardados, 047)
//              especial  la condición especial, o null: { plan_clave,
//                        tope_productos, sin_tope, precio_especial, motivo,
//                        creado_en, actualizado_en, porVos }
//              planes    las filas de public.planes (para el formulario y los
//                        atajos)
//   PUT     { plan_clave, tope_productos, sin_tope, precio_especial, motivo }
//           -> { ok }  carga o reemplaza la condición especial
//   DELETE  -> { ok, pausados }  la quita. Con condiciones de $0 (o un plan a
//              medida que no estaba pagando), la tienda vuelve a su plan y, si
//              queda por encima del tope, no se pausa nada. Con un plan a medida
//              pago (050): primero baja el monto de la suscripción al del
//              Básico en Mercado Pago (si no lo acepta, no quita nada) y después
//              pausa lo que pasa del tope que queda (condiciones_quitadas).
//
// Las reglas: validarEspecial (src/lib/planes.js) y, de respaldo, las de la
// tabla y su disparador (solo planes con tope y fotos). El motivo no lo ve la
// tienda. El admin sale de la sesión, nunca del body.

import { NextResponse } from 'next/server'
import { getServiceRoleClient, verificarAdmin } from '@/lib/supabase/admin'
import { validarEspecial } from '@/lib/planes'
import { cambiarMontoMp } from '@/lib/mercadopago/suscripciones'
import { suscripcionViva } from '@/lib/suscripcionesServidor'

const NO_SE_PUDO = 'No pudimos guardar el plan. Probá de nuevo.'

function idDeLaRuta(valor) {
  const id = Number(valor)
  return Number.isInteger(id) && id > 0 ? id : null
}

async function inicio(params) {
  const adminUser = await verificarAdmin()
  if (!adminUser) return { respuesta: NextResponse.json({ error: 'No autorizado.' }, { status: 403 }) }
  const vendedorId = idDeLaRuta((await params).id)
  if (!vendedorId) return { respuesta: NextResponse.json({ error: 'La tienda no es válida.' }, { status: 400 }) }
  return { adminUser, vendedorId, admin: getServiceRoleClient() }
}

const PLANES = 'clave, nombre, orden, precio_mensual, tope_productos, fotos_por_producto, carritos_abandonados, disponible'

export async function GET(_request, { params }) {
  const { respuesta, adminUser, vendedorId, admin } = await inicio(params)
  if (respuesta) return respuesta

  const [rige, especial, planes] = await Promise.all([
    admin.rpc('rpc_plan_de_tienda', { p_vendedor_id: vendedorId }),
    admin.from('vendedor_planes')
      .select('plan_clave, tope_productos, sin_tope, precio_especial, motivo, creado_por, creado_en, actualizado_en')
      .eq('vendedor_id', vendedorId)
      .maybeSingle(),
    admin.from('planes').select(PLANES).order('orden'),
  ])
  const error = rige.error || especial.error || planes.error
  if (error || !rige.data) {
    console.error('[admin-plan/leer]', vendedorId, error?.code, error?.message || 'sin datos')
    return NextResponse.json({ error: 'No pudimos cargar el plan de la tienda.' }, { status: 500 })
  }

  const p = rige.data
  const { creado_por: creadoPor, ...restoEspecial } = especial.data || {}
  return NextResponse.json({
    plan: {
      clave: p.plan,
      nombre: p.nombre,
      origen: p.origen,
      especial: p.especial === true,
      sinTope: p.sin_tope === true,
      tope: p.sin_tope === true ? null : p.tope_productos,
      usados: Number(p.usados) || 0,
      fotosPorProducto: p.fotos_por_producto,
      carritos: p.carritos_abandonados === true,
      precio: p.precio_mensual,
    },
    especial: especial.data ? { ...restoEspecial, porVos: creadoPor === adminUser.id } : null,
    planes: planes.data || [],
  })
}

export async function PUT(request, { params }) {
  const { respuesta, adminUser, vendedorId, admin } = await inicio(params)
  if (respuesta) return respuesta

  const cuerpo = await request.json().catch(() => null)
  const { data: planes, error: errorPlanes } = await admin.from('planes').select(PLANES)
  if (errorPlanes) {
    console.error('[admin-plan/planes]', vendedorId, errorPlanes.message)
    return NextResponse.json({ error: NO_SE_PUDO }, { status: 500 })
  }
  const validado = validarEspecial(cuerpo, planes)
  if (!validado.ok) return NextResponse.json({ error: validado.error }, { status: 400 })

  const { data: existe, error: errorExiste } = await admin
    .from('vendedor_planes').select('vendedor_id').eq('vendedor_id', vendedorId).maybeSingle()
  if (errorExiste) {
    console.error('[admin-plan/existe]', vendedorId, errorExiste.message)
    return NextResponse.json({ error: NO_SE_PUDO }, { status: 500 })
  }

  const ahora = new Date().toISOString()
  const { error } = existe
    ? await admin.from('vendedor_planes')
      .update({ ...validado.datos, actualizado_por: adminUser.id, actualizado_en: ahora })
      .eq('vendedor_id', vendedorId)
    : await admin.from('vendedor_planes')
      .insert({ vendedor_id: vendedorId, ...validado.datos, creado_por: adminUser.id })
  if (error) {
    if (error.code === '23503') return NextResponse.json({ error: 'No encontramos esa tienda.' }, { status: 404 })
    if (error.code === '23514') {
      return NextResponse.json({ error: 'Ese plan no tiene tope de productos o fotos por producto: no se puede asignar.' }, { status: 400 })
    }
    console.error('[admin-plan/guardar]', vendedorId, error.code, error.message)
    return NextResponse.json({ error: NO_SE_PUDO }, { status: 500 })
  }
  return NextResponse.json({ ok: true })
}

export async function DELETE(_request, { params }) {
  const { respuesta, adminUser, vendedorId, admin } = await inicio(params)
  if (respuesta) return respuesta

  // ¿Es un plan a medida que la tienda está pagando? (050) Entonces, antes de
  // quitarlo, el monto de su suscripción baja al del Básico en Mercado Pago, y
  // después se pausa lo que pasa del tope que queda.
  const [rige, especial, basico, viva] = await Promise.all([
    admin.rpc('rpc_plan_de_tienda', { p_vendedor_id: vendedorId }),
    admin.from('vendedor_planes').select('plan_clave, tope_productos, sin_tope').eq('vendedor_id', vendedorId).maybeSingle(),
    admin.from('planes').select('precio_mensual, tope_productos').eq('clave', 'basico').maybeSingle(),
    suscripcionViva(admin, vendedorId),
  ])
  const errorLectura = rige.error || especial.error || basico.error || viva.error
  if (errorLectura) {
    console.error('[admin-plan/quitar/leer]', vendedorId, errorLectura.message)
    return NextResponse.json({ error: 'No pudimos quitar las condiciones. Probá de nuevo.' }, { status: 500 })
  }
  const pago = rige.data?.origen === 'especial' && Number(rige.data?.precio_mensual) > 0
  const precioBasico = Number(basico.data?.precio_mensual)
  const sus = viva.fila
  if (pago && sus?.estado === 'authorized' && Number.isInteger(precioBasico) && precioBasico > 0 && Number(sus.monto) > precioBasico) {
    const mp = await cambiarMontoMp(sus.mp_preapproval_id, precioBasico)
    if (!mp.ok) {
      console.error('[admin-plan/quitar/monto]', vendedorId, sus.id, mp.status, mp.error)
      return NextResponse.json({ error: 'Mercado Pago no aceptó bajar el monto de la suscripción al del Básico: no se quitó nada. Probá de nuevo en unos minutos.' }, { status: 502 })
    }
    const { error: errorMonto } = await admin.from('vendedor_suscripciones')
      .update({ monto: precioBasico, actualizada_en: new Date().toISOString() }).eq('id', sus.id)
    if (errorMonto) console.error('[admin-plan/quitar/monto/anotar]', vendedorId, sus.id, errorMonto.message)
    console.log(`[admin-plan] admin ${adminUser.id}: suscripción ${sus.id} de la tienda ${vendedorId} pasó de $${sus.monto} a $${precioBasico}.`)
  }

  const { error } = await admin.from('vendedor_planes').delete().eq('vendedor_id', vendedorId)
  if (error) {
    console.error('[admin-plan/quitar]', vendedorId, error.message)
    return NextResponse.json({ error: 'No pudimos quitar las condiciones. Probá de nuevo.' }, { status: 500 })
  }

  let pausados = 0
  if (pago) {
    const topeAntes = especial.data?.sin_tope ? null : (especial.data?.tope_productos ?? null)
    const { data: ajuste, error: errorAjuste } = await admin.rpc('rpc_ajustar_productos_al_plan', {
      p_vendedor_id: vendedorId, p_motivo: 'condiciones_quitadas', p_tope_antes: topeAntes,
    })
    if (errorAjuste) console.error('[admin-plan/quitar/ajustar]', vendedorId, errorAjuste.message)
    else pausados = Number(ajuste?.pausados) || 0
  }
  return NextResponse.json({ ok: true, pausados })
}
