// La página de esta ruta es un componente de cliente y no puede exportar
// metadata, por eso va acá.
//
// Fuera de los buscadores: es la puerta de la cuenta, no contenido del sitio.
// No lleva canónica — una canónica sobre una página noindex sólo confunde.

export const metadata = {
  title: 'Entrar — Bahía Shops',
  robots: { index: false, follow: false },
}

export default function EntrarLayout({ children }) {
  return children
}
