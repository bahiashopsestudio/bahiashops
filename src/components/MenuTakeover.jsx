'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'
import { SELLOS } from '@/components/Navbar'

const NAV_LINKS = [
  { href: '/tesoros', label: 'Descubrí tesoros' },
  { href: '/mapa', label: 'Mapa' },
  { href: '/sobre-nosotros', label: 'Quiénes somos' },
]

function HeaderSeccion({ children }) {
  return (
    <p
      style={{
        fontSize: '10px',
        textTransform: 'uppercase',
        letterSpacing: '1.6px',
        color: 'rgba(10,10,10,0.28)',
        fontWeight: 400,
        marginTop: '28px',
        marginBottom: '4px',
      }}
    >
      {children}
    </p>
  )
}

export default function MenuTakeover({ onClose }) {
  const [categorias, setCategorias] = useState([])
  const [esAdmin, setEsAdmin] = useState(false)

  useEffect(() => {
    const supabase = createClient()

    async function cargarCategorias() {
      const { data } = await supabase
        .from('categorias')
        .select('id, nombre, slug')
        .eq('activa', true)
        .order('orden')
      if (data) setCategorias(data)
    }

    async function verificarAdmin() {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return
      const { data: perfil } = await supabase
        .from('usuarios')
        .select('es_admin')
        .eq('id', user.id)
        .single()
      if (perfil?.es_admin) setEsAdmin(true)
    }

    cargarCategorias()
    verificarAdmin()
  }, [])

  return (
    <div className="fixed inset-0 z-[950] bg-white overflow-y-auto" style={{ fontFamily: "'Inter', sans-serif" }}>
      <div className="sticky top-0 bg-white flex justify-between items-center px-6 pt-6 pb-4">
        <Link href="/" onClick={onClose} className="text-xs font-extrabold tracking-[3px] uppercase text-[#0a0a0a]">
          Bahía Shops
        </Link>
        <button
          onClick={onClose}
          aria-label="Cerrar"
          className="w-8 h-8 flex items-center justify-center text-[#0a0a0a]/50 hover:text-[#0a0a0a] transition cursor-pointer"
        >
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M6 18 18 6M6 6l12 12" />
          </svg>
        </button>
      </div>

      <div className="px-6 pb-16">
        {/* ── Links de navegación ── */}
        <div className="flex flex-col">
          {NAV_LINKS.map((link) => (
            <Link
              key={link.label}
              href={link.href}
              onClick={onClose}
              style={{
                fontFamily: "'Inter', sans-serif",
                fontSize: '15px',
                fontWeight: 300,
                color: '#0a0a0a',
                padding: '12px 0',
              }}
            >
              {link.label}
            </Link>
          ))}
        </div>

        {/* ── Categorías ── */}
        <HeaderSeccion>Categorías</HeaderSeccion>
        <div className="flex flex-col">
          {categorias.map((cat) => (
            <Link
              key={cat.id}
              href={`/categoria/${cat.slug}`}
              onClick={onClose}
              style={{
                fontFamily: "'Inter', sans-serif",
                fontSize: '15px',
                fontWeight: 300,
                color: '#0a0a0a',
                padding: '12px 0',
              }}
            >
              {cat.nombre}
            </Link>
          ))}
        </div>

        {/* ── Comprá con tus valores ── */}
        <HeaderSeccion>Comprá con tus valores</HeaderSeccion>
        <div className="flex flex-col">
          {SELLOS.map((s) => (
            <Link
              key={s.slug}
              href={`/valor/${s.slug}`}
              onClick={onClose}
              style={{
                fontFamily: "'Inter', sans-serif",
                fontSize: '15px',
                fontWeight: 300,
                color: '#0a0a0a',
                padding: '12px 0',
              }}
            >
              {s.nombre}
            </Link>
          ))}
        </div>

        {/* ── Panel de admin ── */}
        {esAdmin && (
          <>
            <div style={{ height: '1px', backgroundColor: 'rgba(10,10,10,0.08)', marginTop: '32px', marginBottom: '20px' }} />
            <Link
              href="/admin"
              onClick={onClose}
              className="flex items-center gap-2"
              style={{ fontFamily: "'Inter', sans-serif", fontSize: '15px', fontWeight: 500, color: '#0a0a0a' }}
            >
              <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M9.594 3.94c.09-.542.56-.94 1.11-.94h2.593c.55 0 1.02.398 1.11.94l.213 1.281c.063.374.313.686.645.87.074.04.147.083.22.127.325.196.72.257 1.075.124l1.217-.456a1.125 1.125 0 0 1 1.37.49l1.296 2.247a1.125 1.125 0 0 1-.26 1.431l-1.003.827c-.293.24-.438.613-.431.992a6.759 6.759 0 0 1 0 .255c-.007.378.138.75.43.99l1.005.828c.424.35.534.954.26 1.43l-1.298 2.247a1.125 1.125 0 0 1-1.369.49l-1.217-.456c-.355-.133-.75-.072-1.076.124a6.57 6.57 0 0 1-.22.128c-.331.183-.581.495-.644.869l-.213 1.281c-.09.543-.56.94-1.11.94h-2.594c-.55 0-1.02-.397-1.11-.94l-.213-1.281c-.062-.374-.312-.686-.644-.87a6.52 6.52 0 0 1-.22-.127c-.325-.196-.72-.257-1.076-.124l-1.216.456a1.125 1.125 0 0 1-1.37-.49l-1.296-2.247a1.125 1.125 0 0 1 .26-1.431l1.004-.827c.292-.24.437-.613.43-.992a6.932 6.932 0 0 1 0-.255c.007-.378-.138-.75-.43-.99l-1.004-.828a1.125 1.125 0 0 1-.26-1.43l1.297-2.247a1.125 1.125 0 0 1 1.369-.49l1.217.456c.355.133.75.072 1.076-.124.072-.044.146-.087.22-.128.332-.183.582-.495.644-.869l.213-1.28Z" />
                <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 1 1-6 0 3 3 0 0 1 6 0Z" />
              </svg>
              Panel de Bahía Shops
            </Link>
          </>
        )}

        {/* ── Redes ── */}
        <div style={{ height: '1px', backgroundColor: 'rgba(10,10,10,0.08)', marginTop: '32px', marginBottom: '20px' }} />
        <div className="flex gap-4 text-[10px] font-light text-[#0a0a0a]/30 tracking-wide">
          <a href="https://instagram.com/bahiashops" target="_blank" rel="noopener noreferrer" className="hover:text-[#0a0a0a] transition">Instagram</a>
          <a href="https://tiktok.com/@bahiashops" target="_blank" rel="noopener noreferrer" className="hover:text-[#0a0a0a] transition">TikTok</a>
          <a href="https://facebook.com/bahiashops" target="_blank" rel="noopener noreferrer" className="hover:text-[#0a0a0a] transition">Facebook</a>
        </div>
      </div>
    </div>
  )
}
