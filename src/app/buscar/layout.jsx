// La página de esta ruta es un componente de cliente y no puede exportar
// metadata, por eso va acá.
//
// Fuera de los buscadores: los resultados de una búsqueda interna no son
// contenido para indexar (robots.js además no deja recorrer /buscar?). No
// lleva canónica — una canónica sobre una página noindex sólo confunde.

export const metadata = {
  robots: { index: false, follow: false },
}

export default function BuscarLayout({ children }) {
  return children
}
