'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'
import Navbar from '@/components/Navbar'
import MenuTakeover from '@/components/MenuTakeover'
import VolverAtras from '@/components/VolverAtras'
import ModalContacto from '@/components/ModalContacto'

export default function CategoriasPage() {
  const [categorias, setCategorias] = useState([])
  const [cargando, setCargando] = useState(true)
  const [menuOpen, setMenuOpen] = useState(false)
  const [contactoAbierto, setContactoAbierto] = useState(false)

  useEffect(() => {
    document.body.style.overflow = menuOpen ? 'hidden' : ''
    return () => { document.body.style.overflow = '' }
  }, [menuOpen])

  useEffect(() => {
    async function cargar() {
      const supabase = createClient()
      const { data } = await supabase
        .from('categorias')
        .select('id, nombre, slug')
        .order('orden')
      if (data) setCategorias(data)
      setCargando(false)
    }
    cargar()
  }, [])

  return (
    <>
      <link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Inter:wght@200;300;400;500;600;700;800;900&display=swap" />
      <link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Fraunces:opsz,wght@9..144,100..900&family=Poppins:wght@300;400;500&display=swap" />

      <div className="min-h-screen bg-white" style={{ fontFamily: "'Inter', sans-serif" }}>
        {menuOpen && <MenuTakeover onClose={() => setMenuOpen(false)} />}
        <Navbar onToggleMenu={() => setMenuOpen(!menuOpen)} variant="solid" />

        <div className="pt-20 pb-24 px-4 md:px-8">
          <div className="max-w-5xl mx-auto">
            <VolverAtras href="/" texto="Volver al inicio" />

            <p style={{ fontFamily: "'Inter', sans-serif", fontSize: '10px', textTransform: 'uppercase', letterSpacing: '2px', color: 'rgba(10,10,10,0.3)', marginBottom: '10px' }}>
              Explorá
            </p>
            <h1 className="text-[26px] md:text-[34px]" style={{ fontFamily: 'Fraunces, serif', fontWeight: 500, color: '#0a0a0a', marginBottom: '8px' }}>
              Categorías
            </h1>
            <p style={{ fontFamily: 'Poppins, sans-serif', fontWeight: 300, fontSize: '14px', color: 'rgba(10,10,10,0.45)', marginBottom: '32px' }}>
              Descubrí todo lo que tiene Bahía Blanca para ofrecerte, organizado por rubro.
            </p>

            {cargando ? (
              <p style={{ fontFamily: "'Inter', sans-serif", fontSize: '13px', fontWeight: 300, color: 'rgba(10,10,10,0.35)' }}>
                Cargando...
              </p>
            ) : (
              <div className="grid grid-cols-2 md:grid-cols-3" style={{ gap: '12px' }}>
                {categorias.map((c) => (
                  <Link
                    key={c.id}
                    href={`/categoria/${c.slug}`}
                    className="flex items-center justify-between group"
                    style={{
                      fontFamily: "'Inter', sans-serif",
                      fontSize: '14px',
                      fontWeight: 500,
                      color: '#0a0a0a',
                      border: '1px solid rgba(10,10,10,0.08)',
                      borderRadius: '8px',
                      padding: '18px 20px',
                      transition: 'border-color 200ms ease, background-color 200ms ease',
                    }}
                    onMouseEnter={(e) => { e.currentTarget.style.borderColor = 'rgba(10,10,10,0.25)'; e.currentTarget.style.backgroundColor = 'rgba(10,10,10,0.02)' }}
                    onMouseLeave={(e) => { e.currentTarget.style.borderColor = 'rgba(10,10,10,0.08)'; e.currentTarget.style.backgroundColor = 'transparent' }}
                  >
                    {c.nombre}
                    <svg className="w-4 h-4 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5} style={{ color: 'rgba(10,10,10,0.25)' }}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M17.25 8.25 21 12m0 0-3.75 3.75M21 12H3" />
                    </svg>
                  </Link>
                ))}
              </div>
            )}

            <button
              type="button"
              onClick={() => setContactoAbierto(true)}
              className="inline-block bg-[#0a0a0a] text-white border border-[#0a0a0a] hover:bg-white hover:text-[#0a0a0a] transition-colors cursor-pointer"
              style={{ fontFamily: "'Inter', sans-serif", fontWeight: 500, fontSize: '13px', borderRadius: '4px', padding: '12px 24px', marginTop: '32px' }}
            >
              ¿No ves tu categoría?
            </button>
          </div>
        </div>
      </div>

      <ModalContacto
        abierto={contactoAbierto}
        onClose={() => setContactoAbierto(false)}
        mensajeInicial="No encontré mi categoría en el listado: "
      />
    </>
  )
}
