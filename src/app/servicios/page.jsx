import ServiciosContent from './ServiciosContent'

// Servicios todavía no existe: esta página la anuncia y anota a quienes
// quieren sumarse. Fuera de Google hasta que haya servicios (noindex, y no va
// en el sitemap); no se bloquea en robots.js para que Google pueda leer el
// noindex.
export const metadata = {
  title: 'Servicios — Bahía Shops',
  description: 'Lo estamos desarrollando: muy pronto vas a encontrar acá oficios, profesionales y personas que ofrecen sus servicios en Bahía.',
  alternates: { canonical: '/servicios' },
  robots: { index: false, follow: true },
}

export default function ServiciosPage() {
  return <ServiciosContent />
}
