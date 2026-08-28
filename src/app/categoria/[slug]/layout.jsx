// La página de esta ruta es un componente de cliente y no puede exportar
// metadata. La canónica vive acá: el path es relativo al metadataBase del
// layout raíz, así que se sirve como https://bahiashops.com.ar/categoria/…
//
// Los filtros de la barra (?sub=, ?genero=, ?sellos=) no entran en la
// canónica a propósito: son recortes de la misma categoría, y la dirección
// oficial de todos es la categoría sin filtrar.

export async function generateMetadata({ params }) {
  const { slug } = await params
  return {
    alternates: { canonical: `/categoria/${encodeURIComponent(slug)}` },
  }
}

export default function CategoriaLayout({ children }) {
  return children
}
