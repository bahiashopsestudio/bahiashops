'use client'

// El bloque del mapa en la home: título, bajada, el mapa grande con su
// leyenda y la invitación a sumarse, todo centrado. El texto va en el
// contenedor de siempre de la home; el mapa, en uno más ancho (hasta 1400 px),
// con el mismo margen lateral.
//
// En la home el mapa usa cooperativeGestures: la página se scrollea pasando
// por encima, y el zoom va con Ctrl + rueda o con dos dedos. En /mapa no.

import dynamic from 'next/dynamic'
import Link from 'next/link'
import LeyendaMapa from '@/components/LeyendaMapa'
import { PIELES } from '@/lib/mapaEstilo'
import { usePielMapa } from '@/lib/pielMapa'

// Sin fondo propio: mientras carga se ve el color de tierra de la piel.
const MapaVendedores = dynamic(() => import('@/components/MapaVendedores'), {
  ssr: false,
  loading: () => (
    <div className="h-full w-full flex items-center justify-center">
      <span className="text-white/60 text-sm font-light">Cargando mapa...</span>
    </div>
  ),
})

const TINTA = '#0a0a0a'

// En la home el mapa arranca más alejado que en /mapa: casi toda la ciudad,
// con la Plaza Rivadavia un poco por debajo del centro.
const VISTA_HOME = { center: [-62.2626, -38.7099], zoom: 12 }

const textoChico = {
  fontFamily: 'Poppins, sans-serif',
  fontWeight: 300,
  fontSize: '13.5px',
  color: TINTA,
  lineHeight: 1.65,
}

export default function MapaDestacado({ vendedores = [] }) {
  const [piel, cambiarPiel] = usePielMapa()

  return (
    <section style={{ background: '#f4e9e1', padding: '96px 0 72px' }}>
      {/* ── Título y bajada ── */}
      <div className="max-w-6xl mx-auto px-4 md:px-8 text-center">
        <h2
          className="text-[26px] md:text-[36px]"
          style={{
            fontFamily: 'Fraunces, serif',
            fontWeight: 500,
            color: TINTA,
            letterSpacing: '-0.02em',
            lineHeight: 1.15,
            marginBottom: '20px',
          }}
        >
          Una ciudad: miles de cosas por descubrir
        </h2>

        <p
          style={{
            fontFamily: 'Poppins, sans-serif',
            fontWeight: 300,
            fontSize: '16px',
            color: TINTA,
            lineHeight: 1.6,
            maxWidth: '60ch',
            margin: '0 auto',
          }}
        >
          Reunimos negocios y emprendimientos de Bahía Blanca en un solo lugar para que puedas
          descubrir qué hay cerca, encontrar lo que buscás y comprar de forma local.
        </p>
      </div>

      {/* ── Mapa y leyenda ── */}
      <div className="max-w-[1400px] mx-auto px-4 md:px-8" style={{ marginTop: '48px' }}>
        <div
          className="h-[70svh] min-h-[420px]"
          style={{ borderRadius: '8px', overflow: 'hidden', background: PIELES[piel].land }}
        >
          <MapaVendedores vendedores={vendedores} piel={piel} onCambiarPiel={cambiarPiel} cooperativo vista={VISTA_HOME} />
        </div>

        <LeyendaMapa
          piel={piel}
          textoExacta="Dirección exacta"
          textoZona="Zona aproximada"
          className="flex gap-5 justify-center mt-4"
          estiloTexto={{
            fontFamily: "'Inter', sans-serif",
            fontWeight: 300,
            fontSize: '12px',
            color: TINTA,
          }}
        />
      </div>

      {/* ── Invitación ── */}
      <div className="max-w-6xl mx-auto px-4 md:px-8 text-center" style={{ marginTop: '32px' }}>
        <p style={{ ...textoChico, margin: 0 }}>
          Lo que buscás puede estar mucho más cerca de lo que pensás.
        </p>

        <Link
          href="/vendedor/nuevo"
          className="inline-block bg-[#015444] text-white border border-[#015444] hover:bg-transparent hover:text-[#015444] transition-colors cursor-pointer"
          style={{
            fontFamily: "'Inter', sans-serif",
            fontSize: '13px',
            fontWeight: 500,
            borderRadius: '4px',
            padding: '12px 24px',
            marginTop: '16px',
          }}
        >
          Registrate gratis y aparecé en el mapa
        </Link>

        <p
          style={{
            fontFamily: "'Inter', sans-serif",
            fontWeight: 300,
            fontSize: '13px',
            color: TINTA,
            margin: '16px 0 0',
          }}
        >
          ¿Querés explorar más?{' '}
          <Link
            href="/mapa"
            style={{
              fontFamily: "'Inter', sans-serif",
              fontWeight: 400,
              color: TINTA,
              textDecoration: 'underline',
              textUnderlineOffset: '3px',
            }}
          >
            Ver el mapa completo
          </Link>
        </p>
      </div>
    </section>
  )
}
