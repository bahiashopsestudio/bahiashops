// El link propio de la tienda y lo que vendió por él, para el panel (Mi
// negocio). La tienda sale de la sesión, nunca del pedido.
//
//   GET -> { link, ventasPorLink, vendidoPorLink, ahorro, especial }
//
//   link            /tienda/<slug>?de=tienda (src/lib/marcaLink.js)
//   ventasPorLink   pedidos que llegaron por el link y se pagaron
//   vendidoPorLink  la suma de sus productos (sin el envío)
//   ahorro          lo que hubiera pagado al 5% menos lo que pagó, en esos
//                   pedidos (incluye lo que bajó una especial)
//   especial        { porcentaje, venceEn } de la comisión especial vigente, o
//                   null. Sin el motivo: es una nota interna del admin.
//
// Cuenta como venta un pedido pagado, sin cancelados ni reembolsados
// (ESTADOS_PARA_RECLAMAR, src/lib/pedidos.js). Los montos van en pesos, con
// centavos.

import { NextResponse } from 'next/server'
import { tiendaDeLaSesion } from '@/lib/tiendaDeLaSesion'
import { ESTADOS_PARA_RECLAMAR } from '@/lib/pedidos'
import { COMISION_BASE_BP, especialVigente } from '@/lib/comision'
import { linkPropio } from '@/lib/marcaLink'

const ERROR = 'No pudimos cargar tu link. Probá de nuevo en un rato.'

function centavos(valor) {
  const n = Number(valor)
  return Number.isFinite(n) ? Math.round(n * 100) : 0
}

export async function GET() {
  const { respuesta, vendedor, admin } = await tiendaDeLaSesion('link-propio')
  if (respuesta) return respuesta

  const [tienda, pedidos, especiales] = await Promise.all([
    admin.from('vendedores').select('slug').eq('id', vendedor.id).maybeSingle(),
    admin
      .from('pedidos')
      .select('subtotal_productos, comision_plataforma')
      .eq('vendedor_id', vendedor.id)
      .eq('origen', 'link_tienda')
      .in('estado', ESTADOS_PARA_RECLAMAR),
    admin
      .from('vendedor_comisiones')
      .select('comision_bp, desde, vence_en, terminada_en')
      .eq('vendedor_id', vendedor.id)
      .is('terminada_en', null),
  ])

  const fallo = tienda.error || pedidos.error || especiales.error
  if (fallo) {
    console.error('[link-propio]', vendedor.id, fallo.message)
    return NextResponse.json({ error: ERROR }, { status: 500 })
  }
  if (!tienda.data?.slug) return NextResponse.json({ error: ERROR }, { status: 500 })

  let vendido = 0
  let ahorro = 0
  for (const p of pedidos.data || []) {
    const subtotal = centavos(p.subtotal_productos)
    vendido += subtotal
    // Lo mismo que calcularPedido al 5%: en enteros, medio centavo para arriba.
    const alCinco = Math.floor((subtotal * COMISION_BASE_BP + 5000) / 10000)
    ahorro += alCinco - centavos(p.comision_plataforma)
  }

  const vigente = especialVigente(especiales.data, Date.now())

  return NextResponse.json({
    link: linkPropio({ slug: tienda.data.slug }),
    ventasPorLink: (pedidos.data || []).length,
    vendidoPorLink: vendido / 100,
    ahorro: ahorro / 100,
    especial: vigente ? { porcentaje: vigente.comision_bp / 100, venceEn: vigente.vence_en } : null,
  })
}
