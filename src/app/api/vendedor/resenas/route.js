// Las reseñas de la tienda de quien tiene la sesión, para /vendedor/resenas.
//
//   GET          -> { tienda, puntaje: { cantidad, promedio }, nuevasSemana,
//                     ocultadasPedidas, sinResponder, resenas, hayMas }
//   GET ?desde=N -> la página siguiente (solo resenas y hayMas)
//
// La tienda sale de la sesión. Solo las publicadas: las que ocultó la
// moderación no se muestran (una oculta por datos personales tendría justo
// esos datos). Cada reseña lleva su pedido, para el link al panel, y en qué
// está su pedido de revisión (estado_revision). ocultadasPedidas: cuántas
// se ocultaron después de que la tienda pidió revisarlas (sin el texto).
// sinResponder: publicadas sin respuesta (una respuesta oculta cuenta como
// respondida). Pedir revisión: ./[id]/revision. Responder: ./[id]/respuesta.

import { NextResponse } from 'next/server'
import { tiendaDeLaSesion } from '@/lib/tiendaDeLaSesion'
import { resenasPublicadas } from '@/lib/resenasServidor'
import { puntajeDe } from '@/lib/resenas'

const NO_SE_PUDO = 'No pudimos cargar tus reseñas. Probá de nuevo en un rato.'
const SEMANA_MS = 7 * 24 * 60 * 60 * 1000

export async function GET(request) {
  const { respuesta, vendedor, admin } = await tiendaDeLaSesion('vendedor/resenas')
  if (respuesta) return respuesta

  const desde = Number(new URL(request.url).searchParams.get('desde') || 0)
  if (!Number.isInteger(desde) || desde < 0) return NextResponse.json({ error: 'Página inválida.' }, { status: 400 })

  const lista = await resenasPublicadas(admin, vendedor.id, { desde, conPedido: true })
  if (lista.error) {
    console.error('[vendedor/resenas/lista]', vendedor.id, lista.error.message)
    return NextResponse.json({ error: NO_SE_PUDO }, { status: 500 })
  }
  if (desde > 0) return NextResponse.json({ resenas: lista.resenas, hayMas: lista.hayMas })

  const [tienda, puntaje, nuevas, ocultadas, respondidas] = await Promise.all([
    admin.from('vendedores').select('nombre_negocio').eq('id', vendedor.id).maybeSingle(),
    admin.from('puntajes_tiendas').select('cantidad, promedio').eq('vendedor_id', vendedor.id).maybeSingle(),
    admin.from('resenas').select('id', { count: 'exact', head: true })
      .eq('vendedor_id', vendedor.id)
      .eq('estado', 'publicada')
      .gte('creado_en', new Date(Date.now() - SEMANA_MS).toISOString()),
    admin.from('resenas').select('id', { count: 'exact', head: true })
      .eq('vendedor_id', vendedor.id)
      .eq('estado', 'oculta_por_moderacion')
      .not('revision_pedida_en', 'is', null),
    // Las respuestas a reseñas publicadas.
    admin.from('respuestas_resena').select('resena_id, resena:resenas!inner ( estado )', { count: 'exact', head: true })
      .eq('vendedor_id', vendedor.id)
      .eq('resena.estado', 'publicada'),
  ])
  const fallo = tienda.error || puntaje.error || nuevas.error || ocultadas.error || respondidas.error
  if (fallo) {
    console.error('[vendedor/resenas/resumen]', vendedor.id, fallo.message)
    return NextResponse.json({ error: NO_SE_PUDO }, { status: 500 })
  }

  return NextResponse.json({
    tienda: tienda.data?.nombre_negocio || '',
    puntaje: puntajeDe(puntaje.data),
    nuevasSemana: nuevas.count || 0,
    ocultadasPedidas: ocultadas.count || 0,
    sinResponder: Math.max(0, puntajeDe(puntaje.data).cantidad - (respondidas.count || 0)),
    resenas: lista.resenas,
    hayMas: lista.hayMas,
  })
}
