// Fuera de los buscadores: es una pantalla de la cuenta de cada persona. El
// perfil ya lo marca como noindex y esa metadata se hereda; esto lo deja
// explícito para esta página y le pone su título.

export const metadata = {
  title: 'Eliminar mi cuenta · Bahía Shops',
  robots: { index: false, follow: false },
}

export default function EliminarCuentaLayout({ children }) {
  return children
}
