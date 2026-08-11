'use client'

import { useEffect, useState } from 'react'
import dynamic from 'next/dynamic'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'
import Navbar from '@/components/Navbar'
import MenuTakeover from '@/components/MenuTakeover'

const MapaVendedoresLeaflet = dynamic(() => import('./MapaVendedoresLeaflet'), {
  ssr: false,
  loading: () => (
    <div className="bg-[#F5F2EC] h-full w-full flex items-center justify-center">
      <span className="text-[#0a0a0a]/15 text-sm font-light">Cargando mapa...</span>
    </div>
  ),
})

const MENU_CATEGORIAS = ['moda','belleza-y-bienestar','joyeria-y-accesorios','hogar-y-deco','artes-y-oficios','bebes-y-maternidad','juegos-y-juguetes','mascotas','libros','deporte','vintage']

export default function MapaContent({ vendedores = [], categorias = [] }) {
  const supabase = createClient()
  const [barriosMap, setBarriosMap] = useState({})
  const [menuOpen, setMenuOpen] = useState(false)

  const menuCats = MENU_CATEGORIAS.map(s => categorias.find(c => c.slug === s)).filter(Boolean)

  useEffect(() => {
    if (menuOpen) { document.body.style.overflow = 'hidden' } else { document.body.style.overflow = '' }
    return () => { document.body.style.overflow = '' }
  }, [menuOpen])

  useEffect(() => {
    async function cargarBarrios() {
      const { data, error } = await supabase.from('barrios').select('id, nombre')
      if (error) { console.error('Error cargando barrios:', error); return }
      if (data) {
        const mapa = {}
        data.forEach((b) => { mapa[b.id] = b.nombre })
        setBarriosMap(mapa)
      }
    }
    cargarBarrios()
  }, [])

  const locales = vendedores.filter(v => v.recibe_publico)
  const casas = vendedores.filter(v => !v.recibe_publico)

  return (
    <>
      <link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Inter:wght@200;300;400;500;600;700;800;900&display=swap" />
      <link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Fraunces:opsz,wght@9..144,100..900&family=Poppins:wght@300;400;500&display=swap" />

      <div className="min-h-screen bg-white" style={{ fontFamily: "'Inter', sans-serif" }}>
        {menuOpen && <MenuTakeover categorias={menuCats} onClose={() => setMenuOpen(false)} />}
        <Navbar onToggleMenu={() => setMenuOpen(!menuOpen)} variant="solid" />

        <div className="pt-14 flex flex-col lg:flex-row lg:h-[620px]">

          {/* ── Bloque de texto ── */}
          <div
            className="w-full lg:w-1/2 flex items-center shrink-0"
            style={{ background: '#3a0823' }}
          >
            <div className="px-6 md:px-16 py-14 lg:py-0 max-w-xl">
              <p
                style={{
                  fontFamily: 'Poppins, sans-serif',
                  fontWeight: 500,
                  fontSize: '12px',
                  color: 'rgba(255,255,255,0.65)',
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
                  color: '#ffffff',
                  letterSpacing: '-0.02em',
                  lineHeight: 1.25,
                  marginBottom: '24px',
                }}
              >
                Encontrá a distintos vendedores por barrio. Encontrá lo que necesitás cerca tuyo.
              </h1>
              <p
                style={{
                  fontFamily: "'Inter', sans-serif",
                  fontWeight: 500,
                  fontSize: '14px',
                  color: 'rgba(255,255,255,0.9)',
                  marginBottom: '32px',
                }}
              >
                {vendedores.length} emprendedores en Bahía Blanca — tocá un pin para ver más
              </p>

              <Link
                href="/vendedor/nuevo"
                className="inline-block bg-white text-[#0a0a0a] border border-white no-underline hover:bg-transparent hover:text-white transition-colors"
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
          <div className="w-full lg:w-1/2 h-[420px] lg:h-full">
            <MapaVendedoresLeaflet vendedores={vendedores} barriosMap={barriosMap} />
          </div>
        </div>

        {/* ── Leyenda ── */}
        <div className="max-w-6xl mx-auto px-4 md:px-8 py-6 flex gap-5">
          <div className="flex items-center gap-2">
            <div className="w-[8px] h-[8px] rounded-full bg-[#ff1010] shrink-0" />
            <span className="text-[11px] font-light text-[#0a0a0a]/35">Local con dirección ({locales.length})</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-[8px] h-[8px] rounded-full bg-[#9cc3ea] shrink-0" />
            <span className="text-[11px] font-light text-[#0a0a0a]/35">Trabaja desde casa ({casas.length})</span>
          </div>
        </div>
      </div>
    </>
  )
}
