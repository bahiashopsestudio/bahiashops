// Alta de un producto de la tienda de quien tiene la sesión.
//
//   POST  { nombre, descripcion, marca, precio, precio_anterior,
//           tiempo_preparacion, categoria_id, subcategoria_id,
//           subcategoria_personalizada, categoria_secundaria_id,
//           subcategoria_secundaria_id, subcategoria_secundaria_personalizada,
//           genero: [], propiedad_1_nombre, variantes: [], fotos: [url],
//           sellos: [id] }
//         -> { ok, id, estado }
//
// Por qué por el servidor (migración 033): el navegador ya no escribe en
// productos ni en sus fotos, variantes y sellos. Acá corre la moderación
// (un bloqueo devuelve 422 con lo que encontró, para el mismo cartel de la
// pantalla), el producto nace en 'en_revision' y solo el servidor escribe
// estado, moderacion_avisos, destacado, destacado_hasta, motivo_rechazo y
// creado_en. Las fotos ya están subidas a Storage (productos/<tienda>/): se
// acepta solo una URL de esa carpeta.
//
// El plan de la tienda (migraciones 046 y 047; cuentan todos los productos
// guardados, también los pausados): con el tope de productos lleno, o con
// más fotos de las del plan, responde 409 con { error, motivo: 'tope_productos'
// | 'tope_fotos', tope, usados }. Las fotos se cuentan acá y en la base; el
// tope de productos, solo en la base (con la tienda bloqueada).
//
// La edición, la pausa y el borrado están en [id]/route.js.

import { NextResponse } from 'next/server'
import { tiendaDeLaSesion } from '@/lib/tiendaDeLaSesion'
import { validarProducto, moderarProducto } from '@/lib/productos'
import { guardarProducto } from '@/lib/guardarProducto'
import { planDeLaTienda } from '@/lib/planDeLaTienda'
import { cuerpoDeTope } from '@/lib/planes'

export async function POST(request) {
  const { respuesta, vendedor, admin } = await tiendaDeLaSesion('productos/alta')
  if (respuesta) return respuesta

  const { plan } = await planDeLaTienda(admin, vendedor.id, 'productos/alta')
  if (!plan) return NextResponse.json({ error: 'No pudimos guardar el producto. Probá de nuevo en un momento.' }, { status: 500 })

  const cuerpo = await request.json().catch(() => null)
  const validado = validarProducto(cuerpo, {
    vendedorId: vendedor.id,
    baseSupabase: process.env.NEXT_PUBLIC_SUPABASE_URL,
    topeFotos: plan.fotosPorProducto,
  })
  if (!validado.ok) {
    return NextResponse.json(validado.motivo ? cuerpoDeTope(validado) : { error: validado.error }, { status: validado.motivo ? 409 : 400 })
  }

  const moderacion = moderarProducto(validado.datos)
  if (moderacion.nivel === 'bloqueo') {
    return NextResponse.json({ error: 'La publicación tiene algo que no se puede publicar.', moderacion }, { status: 422 })
  }

  const r = await guardarProducto(admin, { vendedorId: vendedor.id, validado, avisos: moderacion.avisos })
  if (!r.ok) return NextResponse.json(r.motivo ? cuerpoDeTope(r) : { error: r.error }, { status: r.status })

  return NextResponse.json({ ok: true, id: r.id, estado: r.estado })
}
