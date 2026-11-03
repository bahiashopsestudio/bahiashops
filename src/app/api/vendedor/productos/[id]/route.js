// Un producto de la tienda de quien tiene la sesión.
//
//   PUT     editarlo (el mismo cuerpo que el alta) -> { ok, id, estado, revision_posterior }
//   PATCH   { estado } pausar o reactivar          -> { ok, estado }
//   DELETE  eliminarlo, con ventas o sin ellas      -> { ok }
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
// (rpc_cambiar_estado_producto, migraciones 046 y 047), con la tienda y el
// producto bloqueados: verifica el estado actual y, al reactivar un pausado,
// que la tienda no tenga más productos guardados que el tope.
//
// El plan (migraciones 046 y 047): responde 409 con { error, motivo, tope,
// usados } si reenviar un rechazado o reactivar un pausado encuentra la
// tienda por encima del tope ('tope_superado'), o si trae más fotos de las
// que acepta ('tope_fotos'). Al editar se aceptan las fotos del plan o las
// que el producto ya tenía, lo que sea mayor.
//
// Eliminar (migración 047): lo hace la base (rpc_eliminar_producto), también
// con ventas: los pedidos se quedan con su nombre, variante, precio y foto.

import { NextResponse } from 'next/server'
import { tiendaDeLaSesion } from '@/lib/tiendaDeLaSesion'
import { validarProducto, moderarProducto, origenesPermitidos } from '@/lib/productos'
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

// Las rutas de Storage que se pueden borrar: las de `urls` que están en la
// carpeta de la tienda, salvo las de `quedan` y las que usa un pedido
// (pedido_items.foto_url: el historial y los mails la siguen mostrando).
function rutasParaBorrar({ vendedorId, urls, quedan = [], enPedidos = [] }) {
  const ruta = (url) => rutaEnBucket(url, 'productos')
  const noSeBorran = new Set([...quedan, ...enPedidos].map(ruta).filter(Boolean))
  return [...new Set(urls.map(ruta))].filter((r) => r && r.startsWith(`${vendedorId}/`) && !noSeBorran.has(r))
}

// Es limpieza: si falla, queda en el log.
async function borrarDeStorage(admin, rutas, contexto, productoId) {
  if (rutas.length === 0) return
  const { error } = await admin.storage.from('productos').remove(rutas)
  if (error) console.error(`[productos/${contexto}/storage]`, productoId, error.message)
}

// Al editar: las fotos que el producto tenía y ya no tiene se borran de
// Storage (antes lo hacía la pantalla, y si fallaba no se enteraba nadie). Las
// de las variantes también: guardarProducto rehace las variantes sin foto.
// Solo las de la carpeta de la tienda, y nunca una que use un pedido. Si no se
// puede leer qué usan los pedidos, no se borra nada. El producto ya quedó
// guardado.
async function borrarFotosQueSeSacaron(admin, { vendedorId, productoId, antes, ahora }) {
  if (rutasParaBorrar({ vendedorId, urls: antes, quedan: ahora }).length === 0) return

  const { data: items, error } = await admin.from('pedido_items').select('foto_url').eq('producto_id', productoId)
  if (error) {
    console.error('[productos/editar/fotos-en-pedidos]', productoId, error.message)
    return
  }
  const enPedidos = (items || []).map((item) => item.foto_url)
  await borrarDeStorage(admin, rutasParaBorrar({ vendedorId, urls: antes, quedan: ahora, enPedidos }), 'editar', productoId)
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
  if (data.motivo === 'tope_superado') return NextResponse.json(cuerpoDeTope({ ...data, accion: 'activar' }), { status: 409 })
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

  // La base verifica que sea de la tienda, suelta los pedidos (se quedan con
  // su foto del producto) y borra el producto con todo lo que lo apunta.
  const { data, error } = await admin.rpc('rpc_eliminar_producto', { p_vendedor_id: vendedor.id, p_producto_id: id })
  if (error || !data) {
    console.error('[productos/borrar]', id, error?.code, error?.message || 'sin datos')
    return NextResponse.json({ error: 'Hubo un error al eliminar. Intentá de nuevo.' }, { status: 500 })
  }
  if (!data.ok) return NextResponse.json({ error: NO_ENCONTRADO }, { status: 404 })

  // Los archivos: los de la carpeta de la tienda, menos los que usa algún
  // pedido. El producto ya está eliminado.
  await borrarDeStorage(admin, rutasParaBorrar({
    vendedorId: vendedor.id,
    urls: Array.isArray(data.fotos) ? data.fotos : [],
    enPedidos: Array.isArray(data.fotos_en_pedidos) ? data.fotos_en_pedidos : [],
  }), 'borrar', id)

  return NextResponse.json({ ok: true })
}
