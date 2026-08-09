'use client'

import dynamic from 'next/dynamic'
import Link from 'next/link'

const MapaHome = dynamic(() => import('@/components/MapaHome'), {
  ssr: false,
  loading: () => (
    <div className="bg-[#4f4c05] h-full w-full flex items-center justify-center">
      <span className="text-white/30 text-sm font-light">Cargando mapa...</span>
    </div>
  ),
})

export default function MapaDestacado({ vendedores = [] }) {
  return (
    <section style={{ background: '#595604', padding: '72px 0' }}>
      <div
        className="max-w-6xl mx-auto flex flex-col lg:flex-row lg:items-center gap-9 px-4 md:px-8"
      >
        {/* ── Texto ── */}
        <div className="w-full lg:flex-1">
          <h2
            style={{
              fontFamily: 'Fraunces, serif',
              fontWeight: 500,
              fontSize: '26px',
              color: '#ffffff',
              letterSpacing: '-0.02em',
              lineHeight: 1.15,
              marginBottom: '12px',
            }}
          >
            Una ciudad: miles de cosas por descubrir
          </h2>

          <p
            style={{
              fontFamily: 'Poppins, sans-serif',
              fontWeight: 300,
              fontSize: '13.5px',
              color: 'rgba(255,255,255,0.8)',
              lineHeight: 1.65,
              marginBottom: '20px',
            }}
          >
            Reunimos negocios y emprendimientos de Bahía Blanca en un solo lugar para que puedas
            descubrir qué hay cerca, encontrar lo que buscás y comprar de forma local.
          </p>

          <Link
            href="/vendedor/nuevo"
            className="inline-block bg-white text-[#0a0a0a] border border-white hover:bg-transparent hover:text-white transition-colors cursor-pointer"
            style={{
              fontFamily: "'Inter', sans-serif",
              fontSize: '13px',
              fontWeight: 500,
              borderRadius: '4px',
              padding: '12px 24px',
            }}
          >
            Registrate gratis y aparecé en el mapa
          </Link>

          <p
            style={{
              fontFamily: 'Poppins, sans-serif',
              fontWeight: 300,
              fontSize: '13.5px',
              color: 'rgba(255,255,255,0.8)',
              lineHeight: 1.65,
              marginTop: '16px',
            }}
          >
            Lo que buscás puede estar mucho más cerca de lo que pensás.
          </p>

          <p
            style={{
              fontFamily: "'Inter', sans-serif",
              fontWeight: 300,
              fontSize: '13px',
              color: 'rgba(255,255,255,0.55)',
              marginTop: '8px',
            }}
          >
            ¿Querés explorar más?{' '}
            <Link
              href="/mapa"
              style={{
                fontFamily: "'Inter', sans-serif",
                fontWeight: 400,
                color: 'rgba(255,255,255,0.8)',
                textDecoration: 'underline',
                textUnderlineOffset: '3px',
              }}
            >
              Ver el mapa completo
            </Link>
          </p>
        </div>

        {/* ── Mapa ── */}
        <div className="w-full lg:flex-1">
          <div style={{ aspectRatio: '1 / 0.85', borderRadius: '8px', overflow: 'hidden' }}>
            <MapaHome vendedores={vendedores} />
          </div>

          <div className="flex gap-5 justify-center" style={{ marginTop: '16px' }}>
            <div className="flex items-center gap-2">
              <div style={{ width: '8px', height: '8px', borderRadius: '50%', background: '#ff1010', flexShrink: 0 }} />
              <span
                style={{
                  fontFamily: "'Inter', sans-serif",
                  fontWeight: 300,
                  fontSize: '12px',
                  color: 'rgba(255,255,255,0.65)',
                }}
              >
                Local comercial
              </span>
            </div>
            <div className="flex items-center gap-2">
              <div style={{ width: '8px', height: '8px', borderRadius: '50%', background: '#9cc3ea', flexShrink: 0 }} />
              <span
                style={{
                  fontFamily: "'Inter', sans-serif",
                  fontWeight: 300,
                  fontSize: '12px',
                  color: 'rgba(255,255,255,0.65)',
                }}
              >
                Showroom/Desde casa
              </span>
            </div>
          </div>
        </div>
      </div>
    </section>
  )
}
