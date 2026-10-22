// ¿Este producto todavía se puede comprar?
//
// Un producto del carrito puede dejar de estar disponible sin que el
// comprador haga nada: el vendedor lo pausó o lo borró, su tienda se
// despublicó, o se la bloqueó. El carrito vive en localStorage y no se entera
// de nada de eso, así que hay que preguntarle a la base antes de cobrar.
//
// Mismo criterio que las páginas públicas: si el producto no aparecería en el
// sitio, tampoco se puede comprar.

import { soloProductosPublicados } from '@/lib/vendedoresPublicos'
import { pideVariante, nombreVariante } from '@/lib/variantes'

// Devuelve un Set con los ids que SIGUEN disponibles, o null si no se pudo
// averiguar. null no es "no disponible": ante un error de red no le vamos a
// decir a nadie que su compra se cayó. La palabra final la tiene el servidor,
// en /api/pedidos/crear.
export async function idsDisponibles(supabase, productoIds) {
  const ids = [...new Set((productoIds || []).map(Number).filter(Boolean))]
  if (ids.length === 0) return new Set()

  const { data, error } = await soloProductosPublicados(
    supabase
      .from('productos')
      .select('id, vendedor:vendedores!inner(estado_validacion, bloqueado)')
      .in('id', ids)
      .eq('estado', 'activo')
  )

  if (error) return null
  return new Set((data || []).map((p) => p.id))
}

// De esos productos, los que piden elegir una variante (src/lib/variantes.js):
// un Map de id a { nombre, valores }: cómo se llama lo que hay que elegir
// ("talle") y las opciones cargadas, en el orden en que la tienda las cargó
// (para elegirlas ahí mismo en el carrito). null si no se pudo averiguar: no
// acusamos a nadie de nada; el servidor lo vuelve a mirar.
export async function productosQuePidenVariante(supabase, productoIds) {
  const ids = [...new Set((productoIds || []).map(Number).filter(Boolean))]
  if (ids.length === 0) return new Map()

  const { data, error } = await supabase
    .from('productos')
    .select('id, tiene_variantes, propiedad_1_nombre, variantes:producto_variantes(id, propiedad_1_valor)')
    .in('id', ids)
    .eq('tiene_variantes', true)

  if (error) return null
  return new Map(
    (data || [])
      .filter((p) => pideVariante(p, p.variantes))
      .map((p) => [p.id, {
        nombre: nombreVariante(p),
        valores: [...p.variantes].sort((a, b) => a.id - b.id).map((v) => v.propiedad_1_valor),
      }])
  )
}

// Los items de un local del carrito que ya no se pueden comprar.
// Con disponibles === null devuelve lista vacía: no sabemos, no acusamos.
export function itemsNoDisponibles(items, disponibles) {
  if (!disponibles) return []
  return (items || []).filter((it) => !disponibles.has(Number(it.productoId)))
}
