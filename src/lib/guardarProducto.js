// Guardar un producto entero (el producto, sus fotos, variantes y sellos) con
// service_role. Lo usa /api/vendedor/productos.
//
// Va por public.rpc_guardar_producto (migración 033): todo en una sola
// transacción, y la base decide el estado con el producto bloqueado. Si la
// función todavía no existe (el código se publica antes que la migración),
// guarda paso a paso como lo hacía el navegador, con la misma regla de estado
// y sin marcar "revisión posterior" (la 033 recupera esa marca al correrse).
//
// Devuelve { ok: true, id, estado, revisionPosterior } o
//          { ok: false, status, error } (un texto para mostrar).

import { estadoAlGuardar } from '@/lib/productos'

const NO_SE_PUDO = 'No pudimos guardar el producto. Probá de nuevo en un momento.'

// PostgREST no encuentra la función (PGRST202) o Postgres no la conoce.
const faltaLaFuncion = (error) => error?.code === 'PGRST202' || error?.code === '42883'

function errorDeLaBase(error, contexto) {
  console.error(`[guardar-producto/${contexto}]`, error?.code, error?.message)
  if (error?.code === 'P0002') return { ok: false, status: 404, error: 'No encontramos ese producto.' }
  if (error?.code === '23503' || error?.code === '23514') {
    return { ok: false, status: 400, error: 'Revisá los datos del producto: alguno no es válido.' }
  }
  return { ok: false, status: 500, error: NO_SE_PUDO }
}

//   productoId  null para el alta
//   validado    lo que devolvió validarProducto
//   avisos      los avisos de la moderación (el bloqueo ya se frenó antes)
export async function guardarProducto(admin, { vendedorId, productoId = null, validado, avisos = [] }) {
  const { data, error } = await admin.rpc('rpc_guardar_producto', {
    p_vendedor_id: vendedorId,
    p_producto_id: productoId,
    p_datos: validado.datos,
    p_fotos: validado.fotos,
    p_variantes: validado.variantes,
    p_sellos: validado.sellos,
    p_avisos: avisos,
  })
  if (!error) {
    return { ok: true, id: data.id, estado: data.estado, revisionPosterior: !!data.revision_posterior }
  }
  if (!faltaLaFuncion(error)) return errorDeLaBase(error, 'rpc')

  console.warn('[guardar-producto] rpc_guardar_producto no existe todavía: guardo paso a paso.')
  return guardarPasoAPaso(admin, { vendedorId, productoId, validado, avisos })
}

async function guardarPasoAPaso(admin, { vendedorId, productoId, validado, avisos }) {
  let id = productoId
  let estado

  if (id === null) {
    const { data, error } = await admin
      .from('productos')
      .insert({ ...validado.datos, vendedor_id: vendedorId, estado: 'en_revision', moderacion_avisos: avisos })
      .select('id, estado')
      .single()
    if (error) return errorDeLaBase(error, 'alta')
    id = data.id
    estado = data.estado
  } else {
    const { data: actual, error: errorLectura } = await admin
      .from('productos')
      .select('id, estado')
      .eq('id', id)
      .eq('vendedor_id', vendedorId)
      .maybeSingle()
    if (errorLectura) return errorDeLaBase(errorLectura, 'leer')
    if (!actual) return { ok: false, status: 404, error: 'No encontramos ese producto.' }

    estado = estadoAlGuardar(actual.estado)
    // El WHERE repite el estado leído: si el admin lo aprobó o lo rechazó en
    // el medio, no se pisa su decisión.
    const { data: guardado, error } = await admin
      .from('productos')
      .update({ ...validado.datos, estado, moderacion_avisos: avisos, actualizado_en: new Date().toISOString() })
      .eq('id', id)
      .eq('vendedor_id', vendedorId)
      .eq('estado', actual.estado)
      .select('id')
      .maybeSingle()
    if (error) return errorDeLaBase(error, 'editar')
    if (!guardado) return { ok: false, status: 409, error: 'El producto cambió mientras lo editabas. Recargá la página y probá de nuevo.' }
  }

  const pasos = [
    ['producto_media', validado.fotos.map((url, i) => ({ producto_id: id, url, tipo: 'foto', orden: i, es_principal: i === 0 }))],
    ['producto_variantes', validado.datos.tiene_variantes ? validado.variantes.map((v) => ({ producto_id: id, propiedad_1_valor: v })) : []],
  ]

  // Los sellos que no existen se ignoran, como en la función de la base.
  let sellos = []
  if (validado.sellos.length > 0) {
    const { data, error } = await admin.from('sellos').select('id').in('id', validado.sellos)
    if (error) return errorDeLaBase(error, 'sellos')
    sellos = (data || []).map((s) => s.id)
  }
  pasos.push(['producto_sellos', sellos.map((selloId) => ({ producto_id: id, sello_id: selloId }))])

  for (const [tabla, filas] of pasos) {
    const { error: errorBorrar } = await admin.from(tabla).delete().eq('producto_id', id)
    if (errorBorrar) return deshacerAlta(admin, productoId, id, errorBorrar, tabla)
    if (filas.length > 0) {
      const { error: errorInsertar } = await admin.from(tabla).insert(filas)
      if (errorInsertar) return deshacerAlta(admin, productoId, id, errorInsertar, tabla)
    }
  }

  return { ok: true, id, estado, revisionPosterior: false }
}

// Un alta que quedó a medias se borra entera (las fotos, variantes y sellos
// van en cascada). Una edición a medias no se puede deshacer sin transacción:
// queda lo que se llegó a guardar, y el error se muestra.
async function deshacerAlta(admin, productoId, id, error, contexto) {
  if (productoId === null) {
    const { error: errorBorrar } = await admin.from('productos').delete().eq('id', id)
    if (errorBorrar) console.error('[guardar-producto/deshacer-alta]', id, errorBorrar.message)
  }
  return errorDeLaBase(error, contexto)
}
