'use client'

// La ficha de una tienda pausada por su dueño: nombre, logo y el mensaje que
// dejó para el público. Nada más: ni productos, ni horarios, ni dirección, ni
// mapa, ni formas de entrega, ni contacto, ni "Seguir". La página no se indexa
// (generateMetadata en page.jsx).
//
// Sin mensaje, el cartel dice solo "Esta tienda no está recibiendo pedidos.":
// sirve igual para una pausa que para un cierre definitivo.

import { useState, useEffect } from 'react'
import Link from 'next/link'
import Navbar from '@/components/Navbar'
import MenuTakeover from '@/components/MenuTakeover'
import { createClient } from '@/lib/supabase/client'

const MENU_CATEGORIAS = [
  'moda', 'belleza-y-bienestar', 'joyeria-y-accesorios',
  'hogar-y-deco', 'artes-y-oficios', 'bebes-y-maternidad',
  'juegos-y-juguetes', 'mascotas', 'libros',
  'deporte', 'vintage',
]

export default function TiendaPausada({ nombre, logoUrl, portadaUrl, mensaje }) {
  const supabase = createClient()
  const [menuOpen, setMenuOpen] = useState(false)
  const [categorias, setCategorias] = useState([])

  useEffect(() => {
    document.body.style.overflow = menuOpen ? 'hidden' : ''
    return () => { document.body.style.overflow = '' }
  }, [menuOpen])

  useEffect(() => {
    async function cargarCats() {
      const { data } = await supabase.from('categorias').select('id, nombre, slug').eq('activa', true).order('orden')
      if (data) setCategorias(data)
    }
    cargarCats()
  }, [])

  const menuCats = MENU_CATEGORIAS.map((slug) => categorias.find((c) => c.slug === slug)).filter(Boolean)
  const texto = String(mensaje ?? '').trim()

  return (
    <>
      <link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Inter:wght@200;300;400;500;600;700;800;900&display=swap" />
      <link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Fraunces:opsz,wght@9..144,100..900&family=Poppins:wght@300;400;500&display=swap" />

      <div className="min-h-screen bg-white" style={{ fontFamily: "'Inter', sans-serif" }}>
        {menuOpen && <MenuTakeover categorias={menuCats} onClose={() => setMenuOpen(false)} />}
        <Navbar onToggleMenu={() => setMenuOpen(!menuOpen)} variant="solid" />

        {/* ── Portada (solo la imagen) ── */}
        <div className="relative h-40 md:h-56 overflow-hidden mt-20">
          {portadaUrl ? (
            <img src={portadaUrl} alt={`Portada de ${nombre}`} className="w-full h-full object-cover" />
          ) : (
            <div className="absolute inset-0 bg-gradient-to-br from-[#0a0a0a] via-[#1a1a1a] to-[#333]" />
          )}
          <div className="absolute inset-0 bg-gradient-to-t from-black/30 to-transparent" />
          <div className="absolute top-4 left-4">
            <button
              onClick={() => window.history.back()}
              className="w-10 h-10 flex items-center justify-center rounded-full bg-[#F5F2EC] text-[#0a0a0a] hover:bg-[#e8e5dd] transition cursor-pointer shadow-sm"
              aria-label="Volver"
            >
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 19.5 8.25 12l7.5-7.5" />
              </svg>
            </button>
          </div>
        </div>

        <div className="max-w-xl mx-auto px-4 md:px-6 pb-24">
          {/* ── Nombre y logo ── */}
          <div className="relative -mt-12 flex items-end gap-4 pt-[10px]">
            <div className="w-24 h-24 md:w-28 md:h-28 rounded-2xl bg-white border-4 border-white overflow-hidden shadow-sm shrink-0">
              {logoUrl ? (
                <img src={logoUrl} alt={nombre} className="w-full h-full object-cover" />
              ) : (
                <div className="w-full h-full flex items-center justify-center text-white text-xl font-bold bg-[#0a0a0a]">
                  {String(nombre || '?').charAt(0)}
                </div>
              )}
            </div>
            <h1 className="pb-1 text-2xl md:text-3xl font-black text-[#0a0a0a] tracking-tight leading-tight m-0">
              {nombre}
            </h1>
          </div>

          {/* ── El cartel ── */}
          <div className="mt-8 rounded-2xl bg-[#F5F2EC] px-6 py-7 text-center">
            <div className="w-11 h-11 rounded-full bg-white mx-auto mb-3 flex items-center justify-center text-lg" aria-hidden="true">⏸</div>
            <h2 className="m-0 text-[20px]" style={{ fontFamily: 'Fraunces, serif', fontWeight: 500, color: '#0a0a0a' }}>
              Esta tienda no está recibiendo pedidos.
            </h2>
            {texto && (
              <p className="mt-3 mb-0 text-[14px] leading-relaxed text-[#0a0a0a]/65 break-words" style={{ fontFamily: 'Poppins, sans-serif', fontWeight: 300 }}>
                “{texto}”
              </p>
            )}
            <Link
              href="/"
              className="inline-block mt-5 no-underline"
              style={{ fontFamily: "'Inter', sans-serif", fontWeight: 500, fontSize: '14px', backgroundColor: '#0a0a0a', color: '#ffffff', borderRadius: '4px', padding: '13px 22px' }}
            >
              Explorar otras tiendas
            </Link>
          </div>
        </div>
      </div>
    </>
  )
}
