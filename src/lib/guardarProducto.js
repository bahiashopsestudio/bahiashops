// Guardar un producto entero (el producto, sus fotos, variantes y sellos) con
// service_role. Lo usa /api/vendedor/productos.
//
// Va por public.rpc_guardar_producto (migraciones 033 y 046): todo en una sola
// transacción, y la base decide el estado con la tienda y el producto
// bloqueados. Ahí se cuenta también el tope del plan: no hay otro camino para
// guardar (el guardado paso a paso de antes salteaba el tope y se sacó).
//
// Devuelve { ok: true, id, estado, revisionPosterior } o
//          { ok: false, status, error } (un texto para mostrar), y si es el
//          tope del plan, además { motivo, tope, usados } (status 409).

import { errorDeTope, textoDeTope } from '@/lib/planes'

const NO_SE_PUDO = 'No pudimos guardar el producto. Probá de nuevo en un momento.'

function errorDeLaBase(error, contexto) {
  const tope = errorDeTope(error)
  if (tope) return { ok: false, status: 409, error: textoDeTope(tope), ...tope }
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
  if (error) return errorDeLaBase(error, 'rpc')
  return { ok: true, id: data.id, estado: data.estado, revisionPosterior: !!data.revision_posterior }
}
