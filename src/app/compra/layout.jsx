// Fuera de los buscadores: esto es el resultado de un pago, no contenido
// del sitio. No lleva canónica — no hay nada que valga la pena indexar, y
// una canónica sobre una página noindex sólo confunde.
//
// La metadata se hereda hacia abajo, así que esto vale para todas las
// páginas de esta rama.

export const metadata = {
  robots: { index: false, follow: false },
}

export default function CompraLayout({ children }) {
  return children
}
