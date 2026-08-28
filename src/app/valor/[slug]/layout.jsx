// La página de esta ruta es un componente de cliente y no puede exportar
// metadata. La canónica vive acá: el path es relativo al metadataBase del
// layout raíz, así que se sirve como https://bahiashops.com.ar/valor/…

export async function generateMetadata({ params }) {
  const { slug } = await params
  return {
    alternates: { canonical: `/valor/${encodeURIComponent(slug)}` },
  }
}

export default function ValorLayout({ children }) {
  return children
}
