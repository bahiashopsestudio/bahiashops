import VenderContent from './VenderContent'
import { leerPlanesPublicos } from '@/lib/leerPlanesPublicos'
import { planesParaLaVenta } from '@/lib/planes'
import { COMISION_BASE_BP, COMISION_LINK_BP, textoPorcentaje } from '@/lib/comision'

// /vender: la página para emprendimientos y comercios (tanda F2).
//
// Los precios y topes de los planes salen de public.planes: un cambio en la
// tabla se ve acá en 5 minutos como mucho, sin tocar el texto. Si la lectura
// falla, la sección de planes sale sin números (nunca un valor inventado) y el
// resto de la página igual. Los porcentajes de la comisión son los mismos que
// usa el cobro (src/lib/comision.js).
//
// La imagen para compartir es opengraph-image.png, en esta misma carpeta.
export const revalidate = 300

export const metadata = {
  title: 'Vendé en Bahía Shops | Tu negocio, en el mapa de Bahía Blanca',
  description: 'Sumá tu tienda gratis. Cobrás con Mercado Pago, aparecés en el mapa y en tu barrio, y pagás una comisión solo cuando vendés.',
  alternates: { canonical: '/vender' },
  openGraph: {
    title: 'Tu negocio, en el mapa de Bahía Blanca',
    description: 'Sumá tu tienda gratis a Bahía Shops. Pagás solo cuando vendés.',
    url: '/vender',
    siteName: 'Bahía Shops',
    locale: 'es_AR',
    type: 'website',
  },
}

export default async function VenderPage() {
  const { planes } = await leerPlanesPublicos()

  return (
    <VenderContent
      planes={planesParaLaVenta(planes)}
      comision={{
        base: textoPorcentaje(COMISION_BASE_BP),
        link: textoPorcentaje(COMISION_LINK_BP),
        linkEsLaMitad: COMISION_LINK_BP * 2 === COMISION_BASE_BP,
      }}
    />
  )
}
