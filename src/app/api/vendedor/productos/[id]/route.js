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
// agotado -> activo (ver TRANSICIONES en lib/productos). Lo hace la base
// (rpc_cambiar_estado_producto, migración 046), con la tienda y el producto
// bloqueados: verifica el estado actual y, al reactivar un pausado, el tope
// de productos del plan.
//
// El plan (migración 046): con el tope lleno, o con más fotos de las que
// acepta, responde 409 con { error, motivo: 'tope_productos' | 'tope_fotos',
// tope, usados }. Al editar se aceptan las fotos del plan o las que el
// producto ya tenía, lo que sea mayor.

import { NextResponse } from 'next/server'
import { tiendaDeLaSesion } from '@/lib/tiendaDeLaSesion'
import { validarProducto, moderarProducto, origenesPermitidos, MENSAJE_CON_PEDIDOS } from '@/lib/productos'
import { guardarProducto } from '@/lib/guardarProducto'
import { planDeLaTienda } from '@/lib/planDeLaTienda'
import { cuerpoDeTope } from '@/lib/planes'
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
    .select('id, estado, producto_media ( url, tipo ), producto_variantes ( imagen_url )')
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

// Al editar: las fotos que el producto tenía y ya no tiene se borran de
// Storage (antes lo hacía la pantalla, y si fallaba no se enteraba nadie). Las
// de las variantes también: guardarProducto rehace las variantes sin foto.
// Solo las de la carpeta de la tienda, y nunca una que use un pedido
// (pedido_items.foto_url: el historial y los mails la siguen mostrando). Si
// no se puede leer qué usan los pedidos, no se borra nada. Es limpieza: el
// producto ya quedó guardado, y si algo falla queda en el log.
async function borrarFotosQueSeSacaron(admin, { vendedorId, productoId, antes, ahora }) {
  const quedan = new Set(ahora.map((url) => rutaEnBucket(url, 'productos')).filter(Boolean))
  const sacadas = new Set(
    antes
      .map((url) => rutaEnBucket(url, 'productos'))
      .filter((ruta) => ruta && ruta.startsWith(`${vendedorId}/`) && !quedan.has(ruta))
  )
  if (sacadas.size === 0) return

  const { data: items, error } = await admin.from('pedido_items').select('foto_url').eq('producto_id', productoId)
  if (error) {
    console.error('[productos/editar/fotos-en-pedidos]', productoId, error.message)
    return
  }
  for (const item of items || []) sacadas.delete(rutaEnBucket(item.foto_url, 'productos'))
  if (sacadas.size === 0) return

  const { error: errorStorage } = await admin.storage.from('productos').remove([...sacadas])
  if (errorStorage) console.error('[productos/editar/storage]', productoId, errorStorage.message)
}

export async function PUT(request, { params }) {
  const { respuesta, vendedor, admin } = await tiendaDeLaSesion('productos/editar')
  if (respuesta) return respuesta

  const id = idDeLaRuta((await params).id)
  if (!id) return NextResponse.json({ error: NO_ENCONTRADO }, { status: 404 })

  const { respuesta: sinProducto, producto } = await productoDeLaTienda(admin, id, vendedor.id, 'editar')
  if (sinProducto) return sinProducto

  const { plan } = await planDeLaTienda(admin, vendedor.id, 'productos/editar')
  if (!plan) return NextResponse.json({ error: NO_SE_PUDO }, { status: 500 })
  const fotosQueTenia = (producto.producto_media || []).filter((m) => (m.tipo ?? 'foto') === 'foto').length

  const cuerpo = await request.json().catch(() => null)
  const validado = validarProducto(cuerpo, {
    vendedorId: vendedor.id,
    baseSupabase: process.env.NEXT_PUBLIC_SUPABASE_URL,
    fotosExistentes: (producto.producto_media || []).map((m) => m.url),
    topeFotos: Math.max(plan.fotosPorProducto, fotosQueTenia),
  })
  if (!validado.ok) {
    return NextResponse.json(validado.motivo ? cuerpoDeTope(validado) : { error: validado.error }, { status: validado.motivo ? 409 : 400 })
  }

  const moderacion = moderarProducto(validado.datos)
  if (moderacion.nivel === 'bloqueo') {
    return NextResponse.json({ error: 'La publicación tiene algo que no se puede publicar.', moderacion }, { status: 422 })
  }

  const r = await guardarProducto(admin, { vendedorId: vendedor.id, productoId: id, validado, avisos: moderacion.avisos })
  if (!r.ok) return NextResponse.json(r.motivo ? cuerpoDeTope(r) : { error: r.error }, { status: r.status })

  await borrarFotosQueSeSacaron(admin, {
    vendedorId: vendedor.id,
    productoId: id,
    antes: [
      ...(producto.producto_media || []).map((m) => m.url),
      ...(producto.producto_variantes || []).map((v) => v.imagen_url),
    ],
    ahora: validado.fotos,
  })

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

  const { data, error } = await admin.rpc('rpc_cambiar_estado_producto', {
    p_vendedor_id: vendedor.id,
    p_producto_id: id,
    p_destino: destino,
  })
  if (error || !data) {
    console.error('[productos/estado]', id, error?.code, error?.message || 'sin datos')
    return NextResponse.json({ error: NO_SE_PUDO }, { status: 500 })
  }
  if (data.ok) return NextResponse.json({ ok: true, estado: data.estado })

  if (data.motivo === 'no_existe') return NextResponse.json({ error: NO_ENCONTRADO }, { status: 404 })
  if (data.motivo === 'tope_productos') return NextResponse.json(cuerpoDeTope(data), { status: 409 })
  if (data.motivo === 'estado') {
    return NextResponse.json(
      { error: 'Este producto no se puede pausar ni reactivar en su estado actual.', estado: data.estado },
      { status: 409 },
    )
  }
  // 'destino' no llega: origenesPermitidos ya lo frenó arriba.
  return NextResponse.json({ error: 'Ese cambio de estado no se puede hacer.' }, { status: 400 })
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
