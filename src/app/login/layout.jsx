// La página de esta ruta es un componente de cliente y no puede exportar
// metadata. La canónica vive acá: el path es relativo al metadataBase del
// layout raíz, así que se sirve como https://bahiashops.com.ar/login

export const metadata = {
  alternates: { canonical: '/login' },
}

export default function LoginLayout({ children }) {
  return children
}
