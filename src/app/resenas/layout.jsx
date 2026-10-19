// La página de esta ruta es un componente de cliente y no puede exportar
// metadata. La canónica vive acá: el path es relativo al metadataBase del
// layout raíz, así que se sirve como https://bahiashops.com.ar/resenas

export const metadata = {
  title: 'Cómo funcionan las reseñas — Bahía Shops',
  description: 'Quién puede dejar una reseña, qué se puede poner, cómo aparece y qué revisamos en Bahía Shops.',
  alternates: { canonical: '/resenas' },
}

export default function ResenasLayout({ children }) {
  return children
}
