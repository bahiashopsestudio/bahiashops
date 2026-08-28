// La página de esta ruta es un componente de cliente y no puede exportar
// metadata. La canónica vive acá: el path es relativo al metadataBase del
// layout raíz, así que se sirve como https://bahiashops.com.ar/producto/…

export async function generateMetadata({ params }) {
  const { id } = await params
  return {
    alternates: { canonical: `/producto/${encodeURIComponent(id)}` },
  }
}

export default function ProductoLayout({ children }) {
  return children
}
