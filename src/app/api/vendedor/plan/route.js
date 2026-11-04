// El plan de la tienda de quien tiene la sesión (migración 046), para el panel
// (Mi negocio, Mis productos, Nuevo producto y Editar). La tienda sale de la
// sesión, nunca del pedido.
//
//   GET -> { plan: { clave, nombre }, tope, usados, fotosPorProducto,
//            carritos, especial, sinTope, contador, siguiente }
//
//   tope        productos que puede tener (null = sin tope)
//   usados      los que cuentan: todos los guardados, también los pausados y
//               los rechazados (migración 047)
//   contador    'sin_tope' | 'normal' | 'cerca' | 'en_el_tope' | 'por_encima'
//               (estadoDelContador, src/lib/planes.js)
//   especial    tiene condiciones especiales del admin. Sin el motivo ni el
//               precio: son notas del admin.
//   siguiente   { clave, nombre, tope, fotosPorProducto, carritos, precio }
//               del plan que sigue, para el cartel del tope; null si tiene
//               condiciones especiales o no hay otro.
//   origen      'gratis' | 'especial' | 'suscripcion' (048)
//   suscripciones  si la tienda puede suscribirse (SUSCRIPCIONES_TIENDAS):
//               el panel pide entonces /api/vendedor/suscripcion.
//   precioMensual  lo que paga por mes, solo si el plan sale de una
//               suscripción (origen 'suscripcion'); si no, null.
//   especialPendiente  { precio, tope, sinTope } de un plan a medida que
//               espera el pago (el cartel lo ofrece), o null.
//
// Si no se puede leer la lista de planes, sale igual con siguiente: null (el
// cartel se muestra sin la comparación).

import { NextResponse } from 'next/server'
import { tiendaDeLaSesion } from '@/lib/tiendaDeLaSesion'
import { planDeLaTienda } from '@/lib/planDeLaTienda'
import { estadoDelContador, planSiguiente } from '@/lib/planes'
import { suscripcionesHabilitadas } from '@/lib/suscripciones'
import { topeDelPlanAMedida } from '@/lib/suscripcionesServidor'

const ERROR = 'No pudimos cargar tu plan. Probá de nuevo en un rato.'

export async function GET() {
  const { respuesta, vendedor, admin } = await tiendaDeLaSesion('plan')
  if (respuesta) return respuesta

  const [{ plan }, planes] = await Promise.all([
    planDeLaTienda(admin, vendedor.id, 'plan'),
    admin
      .from('planes')
      .select('clave, nombre, orden, precio_mensual, tope_productos, fotos_por_producto, carritos_abandonados, disponible')
      .order('orden'),
  ])
  if (!plan) return NextResponse.json({ error: ERROR }, { status: 500 })
  if (planes.error) console.error('[plan/planes]', vendedor.id, planes.error.message)

  // El tope del plan a medida que espera el pago, para el cartel. Si no se
  // puede leer, el cartel sale sin el número.
  let especialPendiente = null
  if (plan.especialPendiente) {
    const aMedida = await topeDelPlanAMedida(admin, vendedor.id, planes.data || [])
    especialPendiente = { precio: plan.especialPendiente.precio, tope: aMedida?.tope ?? null, sinTope: aMedida?.sinTope === true }
  }

  return NextResponse.json({
    plan: { clave: plan.clave, nombre: plan.nombre },
    tope: plan.tope,
    usados: plan.usados,
    fotosPorProducto: plan.fotosPorProducto,
    carritos: plan.carritos,
    especial: plan.especial,
    sinTope: plan.sinTope,
    contador: estadoDelContador(plan),
    siguiente: planes.error ? null : planSiguiente(planes.data, plan.clave, { especial: plan.especial }),
    origen: plan.origen,
    suscripciones: suscripcionesHabilitadas(vendedor.id),
    precioMensual: plan.origen === 'suscripcion' ? plan.precioMensual : null,
    especialPendiente,
  })
}
