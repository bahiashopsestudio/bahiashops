// La página de esta ruta es un componente de cliente y no puede exportar
// metadata, por eso va acá.
//
// Fuera de los buscadores: es un paso de la cuenta, no contenido del sitio.
// No lleva canónica — una canónica sobre una página noindex sólo confunde.

export const metadata = {
  robots: { index: false, follow: false },
}

export default function RecuperarLayout({ children }) {
  return children
}
