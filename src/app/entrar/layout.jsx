// La página de esta ruta es un componente de cliente y no puede exportar
// metadata. La canónica vive acá: el path es relativo al metadataBase del
// layout raíz, así que se sirve como https://bahiashops.com.ar/entrar

export const metadata = {
  title: 'Entrar — Bahía Shops',
  alternates: { canonical: '/entrar' },
}

export default function EntrarLayout({ children }) {
  return children
}
