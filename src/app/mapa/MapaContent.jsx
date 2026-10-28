'use client'

import { useEffect, useState } from 'react'
import dynamic from 'next/dynamic'
import Link from 'next/link'
import Navbar from '@/components/Navbar'
import MenuTakeover from '@/components/MenuTakeover'
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

const FONDO_BLOQUE = '#e9e778'
const TINTA = '#0a0a0a'

// La vista con que arranca el mapa: casi toda la ciudad, con la Plaza
// Rivadavia apenas por encima del centro.
const VISTA_MAPA = { center: [-62.2648, -38.721], zoom: 11.45 }

const MENU_CATEGORIAS = ['moda','belleza-y-bienestar','joyeria-y-accesorios','hogar-y-deco','artes-y-oficios','bebes-y-maternidad','juegos-y-juguetes','mascotas','libros','deporte','vintage']

export default function MapaContent({ vendedores = [], categorias = [] }) {
  const [menuOpen, setMenuOpen] = useState(false)
  const [piel, cambiarPiel] = usePielMapa()

  const menuCats = MENU_CATEGORIAS.map(s => categorias.find(c => c.slug === s)).filter(Boolean)

  useEffect(() => {
    if (menuOpen) { document.body.style.overflow = 'hidden' } else { document.body.style.overflow = '' }
    return () => { document.body.style.overflow = '' }
  }, [menuOpen])

  const exactas = vendedores.filter(v => v.direccion_visible)
  const zonas = vendedores.filter(v => !v.direccion_visible)

  return (
    <>
      <link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Inter:wght@200;300;400;500;600;700;800;900&display=swap" />
      <link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Fraunces:opsz,wght@9..144,100..900&family=Poppins:wght@300;400;500&display=swap" />

      <div className="min-h-screen bg-white" style={{ fontFamily: "'Inter', sans-serif" }}>
        {menuOpen && <MenuTakeover categorias={menuCats} onClose={() => setMenuOpen(false)} />}
        <Navbar onToggleMenu={() => setMenuOpen(!menuOpen)} variant="solid" />

        {/* pt-20: la Navbar mide 80 px; con menos tapaba los controles del mapa */}
        <div className="pt-20 flex flex-col lg:flex-row lg:h-[620px]">

          {/* ── Bloque de texto ── */}
          <div
            className="w-full lg:w-1/2 flex items-center shrink-0"
            style={{ background: FONDO_BLOQUE }}
          >
            <div className="px-6 md:px-16 py-14 lg:py-0 max-w-xl">
              <p
                style={{
                  fontFamily: 'Poppins, sans-serif',
                  fontWeight: 500,
                  fontSize: '12px',
                  color: TINTA,
                  letterSpacing: '0.08em',
                  textTransform: 'uppercase',
                  marginBottom: '20px',
                }}
              >
                Mapa de vendedores
              </p>
              <h1
                className="text-[26px] md:text-[32px]"
                style={{
                  fontFamily: 'Fraunces, serif',
                  fontWeight: 500,
                  color: TINTA,
                  letterSpacing: '-0.02em',
                  lineHeight: 1.25,
                  marginBottom: '24px',
                }}
              >
                Encontrá distintos vendedores por barrio. Encontrá lo que necesitás cerca tuyo.
              </h1>
              <p
                style={{
                  fontFamily: "'Inter', sans-serif",
                  fontWeight: 500,
                  fontSize: '14px',
                  color: TINTA,
                  marginBottom: '32px',
                }}
              >
                {vendedores.length} emprendedores en Bahía Blanca — tocá un pin para ver más
              </p>

              <Link
                href="/vendedor/nuevo"
                className="inline-block bg-[#0a0a0a] text-white border border-[#0a0a0a] no-underline hover:bg-transparent hover:text-[#0a0a0a] transition-colors"
                style={{
                  fontFamily: "'Inter', sans-serif",
                  fontWeight: 500,
                  fontSize: '14px',
                  borderRadius: '4px',
                  padding: '13px 26px',
                }}
              >
                Sumar mi negocio
              </Link>
            </div>
          </div>

          {/* ── Mapa ── */}
          <div className="w-full lg:w-1/2 h-[420px] lg:h-full" style={{ background: PIELES[piel].land }}>
            <MapaVendedores vendedores={vendedores} piel={piel} onCambiarPiel={cambiarPiel} vista={VISTA_MAPA} />
          </div>
        </div>

        {/* ── Leyenda: debajo del mapa, alineada a la derecha en desktop ── */}
        <div className="flex flex-col lg:flex-row">
          <div className="hidden lg:block lg:w-1/2 shrink-0" />
          <LeyendaMapa
            piel={piel}
            textoExacta={`Dirección exacta (${exactas.length})`}
            textoZona={`Zona aproximada (${zonas.length})`}
            className="w-full lg:w-1/2 px-4 md:px-8 lg:px-6 py-6 flex gap-5 justify-center lg:justify-end"
            claseTexto="text-[11px] font-light text-[#0a0a0a]/35"
          />
        </div>
      </div>
    </>
  )
}
