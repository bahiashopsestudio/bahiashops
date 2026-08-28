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

// Los items de un local del carrito que ya no se pueden comprar.
// Con disponibles === null devuelve lista vacía: no sabemos, no acusamos.
export function itemsNoDisponibles(items, disponibles) {
  if (!disponibles) return []
  return (items || []).filter((it) => !disponibles.has(Number(it.productoId)))
}
