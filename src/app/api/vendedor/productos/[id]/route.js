// Un producto de la tienda de quien tiene la sesión.
//
//   PUT     editarlo (el mismo cuerpo que el alta) -> { ok, id, estado, revision_posterior }
//   PATCH   { estado } pausar o reactivar          -> { ok, estado }
//   DELETE  borrarlo                               -> { ok }
//
// La tienda sale de la sesión: un producto ajeno da 404, igual que uno que no
// existe. Escribe con service_role (migración 033: el navegador ya no puede).
//
// Qué pasa al editar:
//   · en_revision o rechazado: vuelve a en_revision (otra vuelta de moderación);
//   · activo, pausado o agotado (ya aprobado): corre la moderación acá. Un
//     bloqueo devuelve 422 y no guarda nada. Con avisos ambiguos guarda,
//     mantiene el estado y lo marca para revisión posterior
//     (productos.revision_posterior_desde). Limpio, guarda y mantiene el estado.
//
// Pausar y reactivar: solo activo -> pausado, pausado -> activo y
// agotado -> activo (ver TRANSICIONES en lib/productos). El estado actual se
// verifica en el mismo UPDATE.

import { NextResponse } from 'next/server'
import { tiendaDeLaSesion } from '@/lib/tiendaDeLaSesion'
import { validarProducto, moderarProducto, origenesPermitidos, MENSAJE_CON_PEDIDOS } from '@/lib/productos'
import { guardarProducto } from '@/lib/guardarProducto'
import { rutaEnBucket } from '@/lib/storageTienda'

const NO_ENCONTRADO = 'No encontramos ese producto.'
const NO_SE_PUDO = 'No pudimos guardar el cambio. Probá de nuevo en un momento.'

function idDeLaRuta(valor) {
  const id = Number(valor)
  return Number.isInteger(id) && id > 0 ? id : null
}

// El producto, solo si es de la tienda. Con las URL de sus fotos y variantes.
async function productoDeLaTienda(admin, id, vendedorId, contexto) {
  const { data, error } = await admin
    .from('productos')
    .select('id, estado, producto_media ( url ), producto_variantes ( imagen_url )')
    .eq('id', id)
    .eq('vendedor_id', vendedorId)
    .maybeSingle()
  if (error) {
    console.error(`[productos/${contexto}]`, id, error.message)
    return { respuesta: NextResponse.json({ error: NO_SE_PUDO }, { status: 500 }) }
  }
  if (!data) return { respuesta: NextResponse.json({ error: NO_ENCONTRADO }, { status: 404 }) }
  return { producto: data }
}

export async function PUT(request, { params }) {
  const { respuesta, vendedor, admin } = await tiendaDeLaSesion('productos/editar')
  if (respuesta) return respuesta

  const id = idDeLaRuta((await params).id)
  if (!id) return NextResponse.json({ error: NO_ENCONTRADO }, { status: 404 })

  const { respuesta: sinProducto, producto } = await productoDeLaTienda(admin, id, vendedor.id, 'editar')
  if (sinProducto) return sinProducto

  const cuerpo = await request.json().catch(() => null)
  const validado = validarProducto(cuerpo, {
    vendedorId: vendedor.id,
    baseSupabase: process.env.NEXT_PUBLIC_SUPABASE_URL,
    fotosExistentes: (producto.producto_media || []).map((m) => m.url),
  })
  if (!validado.ok) return NextResponse.json({ error: validado.error }, { status: 400 })

  const moderacion = moderarProducto(validado.datos)
  if (moderacion.nivel === 'bloqueo') {
    return NextResponse.json({ error: 'La publicación tiene algo que no se puede publicar.', moderacion }, { status: 422 })
  }

  const r = await guardarProducto(admin, { vendedorId: vendedor.id, productoId: id, validado, avisos: moderacion.avisos })
  if (!r.ok) return NextResponse.json({ error: r.error }, { status: r.status })

  return NextResponse.json({ ok: true, id: r.id, estado: r.estado, revision_posterior: r.revisionPosterior })
}

export async function PATCH(request, { params }) {
  const { respuesta, vendedor, admin } = await tiendaDeLaSesion('productos/estado')
  if (respuesta) return respuesta

  const id = idDeLaRuta((await params).id)
  if (!id) return NextResponse.json({ error: NO_ENCONTRADO }, { status: 404 })

  const cuerpo = await request.json().catch(() => null)
  const destino = cuerpo?.estado
  const origenes = origenesPermitidos(destino)
  if (!origenes) return NextResponse.json({ error: 'Ese cambio de estado no se puede hacer.' }, { status: 400 })

  const { data, error } = await admin
    .from('productos')
    .update({ estado: destino, actualizado_en: new Date().toISOString() })
    .eq('id', id)
    .eq('vendedor_id', vendedor.id)
    .in('estado', origenes)
    .select('id, estado')
    .maybeSingle()
  if (error) {
    console.error('[productos/estado]', id, error.message)
    return NextResponse.json({ error: NO_SE_PUDO }, { status: 500 })
  }
  if (data) return NextResponse.json({ ok: true, estado: data.estado })

  // No cambió nada: o no es suyo, o está en un estado desde el que no se puede.
  const { respuesta: sinProducto, producto } = await productoDeLaTienda(admin, id, vendedor.id, 'estado')
  if (sinProducto) return sinProducto
  return NextResponse.json(
    { error: 'Este producto no se puede pausar ni reactivar en su estado actual.', estado: producto.estado },
    { status: 409 },
  )
}

export async function DELETE(_request, { params }) {
  const { respuesta, vendedor, admin } = await tiendaDeLaSesion('productos/borrar')
  if (respuesta) return respuesta

  const id = idDeLaRuta((await params).id)
  if (!id) return NextResponse.json({ error: NO_ENCONTRADO }, { status: 404 })

  const { respuesta: sinProducto, producto } = await productoDeLaTienda(admin, id, vendedor.id, 'borrar')
  if (sinProducto) return sinProducto

  // Fotos, variantes, sellos, favoritos, colecciones y tesoros van en cascada.
  // Lo único que lo frena son los pedidos (pedido_items, sin cascada).
  const { error } = await admin.from('productos').delete().eq('id', id).eq('vendedor_id', vendedor.id)
  if (error) {
    if (error.code === '23503') return NextResponse.json({ error: MENSAJE_CON_PEDIDOS }, { status: 409 })
    console.error('[productos/borrar]', id, error.message)
    return NextResponse.json({ error: 'Hubo un error al eliminar. Intentá de nuevo.' }, { status: 500 })
  }

  // Los archivos, solo los de la carpeta de la tienda. Es limpieza: si falla,
  // el producto ya está borrado y queda en el log.
  const rutas = [
    ...(producto.producto_media || []).map((m) => m.url),
    ...(producto.producto_variantes || []).map((v) => v.imagen_url),
  ]
    .map((url) => rutaEnBucket(url, 'productos'))
    .filter((ruta) => ruta && ruta.startsWith(`${vendedor.id}/`))
  if (rutas.length > 0) {
    const { error: errorStorage } = await admin.storage.from('productos').remove(rutas)
    if (errorStorage) console.error('[productos/borrar/storage]', id, errorStorage.message)
  }

  return NextResponse.json({ ok: true })
}
