'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import Buscador from '@/components/Buscador'

const CANT_CARRITO = 2

// variant:
//   "transparent" (default) — home: blanco sobre transparente, se transforma en negro sobre crema al scrollear
//   "solid" — páginas con fondo blanco: siempre negro sobre blanco

export default function Navbar({ onToggleMenu, variant = 'transparent' }) {
  const [scrolled, setScrolled] = useState(false)
  const [showPill, setShowPill] = useState(false)

  const isSolid = variant === 'solid'

  useEffect(() => {
    function handleScroll() {
      setScrolled(window.scrollY > 80)
      setShowPill(window.scrollY > 400)
    }
    window.addEventListener('scroll', handleScroll, { passive: true })
    return () => window.removeEventListener('scroll', handleScroll)
  }, [])

  // Colores según estado
  const showDark = isSolid || scrolled
  const logoColor = showDark ? '#0a0a0a' : 'white'
  const linkColor = showDark ? 'rgba(10,10,10,0.45)' : 'rgba(255,255,255,0.5)'
  const linkHover = showDark ? 'rgba(10,10,10,1)' : 'rgba(255,255,255,1)'
  const iconColor = showDark ? 'text-[#0a0a0a]/40 hover:text-[#0a0a0a]' : 'text-white/40 hover:text-white'

  return (
    <>
      {/* ── NAV DESKTOP ── */}
      <nav
        className={`fixed top-0 left-0 right-0 z-50 hidden lg:block transition-all duration-300 ${
          isSolid
            ? 'bg-white border-b border-[#0a0a0a]/5'
            : scrolled
              ? 'bg-[#F5F2EC]/95 backdrop-blur-md border-b border-[#0a0a0a]/5'
              : 'bg-transparent'
        }`}
        style={{ fontFamily: "'Inter', sans-serif" }}
      >
        <div className="max-w-7xl mx-auto px-6 h-14 flex items-center">

          {/* Zona 1: Logo */}
          <Link
            href="/"
            className="text-xs font-extrabold tracking-[3px] uppercase transition-colors shrink-0"
            style={{ color: logoColor }}
          >
            Bahía Shops
          </Link>

          {/* Zona 2: Navegación principal */}
          <div className="flex items-center gap-5 ml-12">
            <Link href="/#mapa" className="text-[13px] font-light transition-colors" style={{ color: linkColor }}>
              Mapa
            </Link>
            <button onClick={onToggleMenu} className="text-[13px] font-light transition-colors cursor-pointer" style={{ color: linkColor }}>
              Categorías
            </button>
            <Link href="/" className="text-[13px] font-light transition-colors" style={{ color: linkColor }}>
              Descubrí
            </Link>
          </div>

          {/* Zona 3: Secciones */}
          <div className="flex items-center gap-5 ml-auto mr-6">
            <Link href="/" className="text-[13px] font-light transition-colors" style={{ color: linkColor }}>
              Historias
            </Link>
            <Link href="/sobre-nosotros" className="text-[13px] font-light transition-colors" style={{ color: linkColor }}>
              Quiénes somos
            </Link>
          </div>

          {/* Zona 4: Iconos + Menú */}
          <div className="flex items-center gap-3 shrink-0">
            <Link href="/favoritos" className={`${iconColor} transition`} aria-label="Favoritos">
              <svg className="w-[18px] h-[18px]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M21 8.25c0-2.485-2.099-4.5-4.688-4.5-1.935 0-3.597 1.126-4.312 2.733-.715-1.607-2.377-2.733-4.313-2.733C5.1 3.75 3 5.765 3 8.25c0 7.22 9 12 9 12s9-4.78 9-12Z" />
              </svg>
            </Link>
            <Link href="/carrito" className={`relative ${iconColor} transition`} aria-label="Carrito">
              <svg className="w-[18px] h-[18px]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 10.5V6a3.75 3.75 0 1 0-7.5 0v4.5m11.356-1.993 1.263 12c.07.665-.45 1.243-1.119 1.243H4.25a1.125 1.125 0 0 1-1.12-1.243l1.264-12A1.125 1.125 0 0 1 5.513 7.5h12.974c.576 0 1.059.435 1.119 1.007Z" />
              </svg>
              {CANT_CARRITO > 0 && (
                <span className="absolute -top-1.5 -right-1.5 bg-[#e60000] text-white text-[8px] font-bold w-3.5 h-3.5 rounded-full flex items-center justify-center">
                  {CANT_CARRITO}
                </span>
              )}
            </Link>
            <Link href="/perfil" className={`${iconColor} transition`} aria-label="Perfil">
              <svg className="w-[18px] h-[18px]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 6a3.75 3.75 0 1 1-7.5 0 3.75 3.75 0 0 1 7.5 0ZM4.501 20.118a7.5 7.5 0 0 1 14.998 0" />
              </svg>
            </Link>
            <button onClick={onToggleMenu} className="ml-1 cursor-pointer transition" style={{ color: showDark ? 'rgba(10,10,10,0.4)' : 'rgba(255,255,255,0.5)' }} aria-label="Menú">
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                <path strokeLinecap="round" d="M3.75 6.75h16.5M3.75 12h16.5m-16.5 5.25h16.5" />
              </svg>
            </button>
          </div>
        </div>
      </nav>


      {/* ── BUSCADOR FLOTANTE (desktop) ── */}
      <div className={`fixed bottom-6 left-1/2 -translate-x-1/2 z-50 transition-all duration-300 hidden lg:block ${showPill ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-4 pointer-events-none'}`} style={{ fontFamily: "'Inter', sans-serif" }}>
        <div className="bg-white/95 backdrop-blur-md shadow-lg rounded-full px-3 py-2 flex items-center gap-2 w-[460px] relative">
          <Buscador
            placeholder="¿Qué estás buscando?"
            className="flex-1"
            dropdownArriba
            dropdownAnchoPadre
          />
          <Link href="/favoritos" className="p-1.5 text-[#0a0a0a]/30 hover:text-[#0a0a0a] transition shrink-0" aria-label="Favoritos">
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M21 8.25c0-2.485-2.099-4.5-4.688-4.5-1.935 0-3.597 1.126-4.312 2.733-.715-1.607-2.377-2.733-4.313-2.733C5.1 3.75 3 5.765 3 8.25c0 7.22 9 12 9 12s9-4.78 9-12Z" />
            </svg>
          </Link>
          <Link href="/carrito" className="relative p-1.5 text-[#0a0a0a]/30 hover:text-[#0a0a0a] transition shrink-0" aria-label="Carrito">
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 10.5V6a3.75 3.75 0 1 0-7.5 0v4.5m11.356-1.993 1.263 12c.07.665-.45 1.243-1.119 1.243H4.25a1.125 1.125 0 0 1-1.12-1.243l1.264-12A1.125 1.125 0 0 1 5.513 7.5h12.974c.576 0 1.059.435 1.119 1.007Z" />
            </svg>
            {CANT_CARRITO > 0 && (
              <span className="absolute -top-1 -right-1 bg-[#e60000] text-white text-[8px] font-bold w-3.5 h-3.5 rounded-full flex items-center justify-center">
                {CANT_CARRITO}
              </span>
            )}
          </Link>
          <Link href="/perfil" className="w-7 h-7 rounded-full bg-[#0a0a0a] text-white flex items-center justify-center text-xs font-medium shrink-0">
            R
          </Link>
        </div>
      </div>


      {/* ── NAV MOBILE (arriba) ── */}
      <nav
        className={`fixed top-0 left-0 right-0 z-50 lg:hidden backdrop-blur-md h-14 ${
          isSolid
            ? 'bg-white border-b border-[#0a0a0a]/5'
            : 'bg-[#F5F2EC]/95 border-b border-[#0a0a0a]/5'
        }`}
        style={{ fontFamily: "'Inter', sans-serif" }}
      >
        <div className="flex items-center justify-between h-full px-4">
          <Link href="/" className="text-xs font-extrabold tracking-[3px] uppercase text-[#0a0a0a]">
            Bahía Shops
          </Link>
          <div className="flex items-center gap-1.5">
            <Link href="/carrito" className="relative p-2 rounded-full hover:bg-[#0a0a0a]/5 transition" aria-label="Carrito">
              <svg className="w-5 h-5 text-[#0a0a0a]/60" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 10.5V6a3.75 3.75 0 1 0-7.5 0v4.5m11.356-1.993 1.263 12c.07.665-.45 1.243-1.119 1.243H4.25a1.125 1.125 0 0 1-1.12-1.243l1.264-12A1.125 1.125 0 0 1 5.513 7.5h12.974c.576 0 1.059.435 1.119 1.007Z" />
              </svg>
              {CANT_CARRITO > 0 && (
                <span className="absolute -top-0.5 -right-0.5 bg-[#e60000] text-white text-[10px] font-bold w-[18px] h-[18px] rounded-full flex items-center justify-center">
                  {CANT_CARRITO}
                </span>
              )}
            </Link>
            <button className="p-2 rounded-full hover:bg-[#0a0a0a]/5 transition" onClick={onToggleMenu} aria-label="Menú">
              <svg className="w-5 h-5 text-[#0a0a0a]/60" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                <path strokeLinecap="round" d="M3.75 6.75h16.5M3.75 12h16.5m-16.5 5.25h16.5" />
              </svg>
            </button>
          </div>
        </div>
      </nav>


      {/* ── BOTTOM BAR MOBILE ── */}
      <div className="fixed bottom-0 left-0 right-0 z-50 lg:hidden" style={{ fontFamily: "'Inter', sans-serif" }}>
        <div className={`backdrop-blur-md border-t border-[#0a0a0a]/5 px-6 py-2 flex justify-around items-center ${
          isSolid ? 'bg-white/95' : 'bg-[#F5F2EC]/95'
        }`}>
          <Link href="/" className="flex flex-col items-center gap-0.5 text-[#0a0a0a]/40 hover:text-[#0a0a0a] transition">
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="m2.25 12 8.954-8.955a1.126 1.126 0 0 1 1.591 0L21.75 12M4.5 9.75v10.125c0 .621.504 1.125 1.125 1.125H9.75v-4.875c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125V21h4.125c.621 0 1.125-.504 1.125-1.125V9.75M8.25 21h8.25" />
            </svg>
            <span className="text-[10px] font-light">Inicio</span>
          </Link>
          <Link href="/buscar" className="flex flex-col items-center gap-0.5 text-[#0a0a0a]/40 hover:text-[#0a0a0a] transition">
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
              <circle cx="11" cy="11" r="8" />
              <path d="m21 21-4.35-4.35" strokeLinecap="round" />
            </svg>
            <span className="text-[10px] font-light">Buscar</span>
          </Link>
          <Link href="/carrito" className="flex flex-col items-center gap-0.5 text-[#0a0a0a]/40 hover:text-[#0a0a0a] transition relative">
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 10.5V6a3.75 3.75 0 1 0-7.5 0v4.5m11.356-1.993 1.263 12c.07.665-.45 1.243-1.119 1.243H4.25a1.125 1.125 0 0 1-1.12-1.243l1.264-12A1.125 1.125 0 0 1 5.513 7.5h12.974c.576 0 1.059.435 1.119 1.007Z" />
            </svg>
            {CANT_CARRITO > 0 && (
              <span className="absolute -top-1 right-1 bg-[#e60000] text-white text-[9px] font-bold w-4 h-4 rounded-full flex items-center justify-center">
                {CANT_CARRITO}
              </span>
            )}
            <span className="text-[10px] font-light">Carrito</span>
          </Link>
          <Link href="/favoritos" className="flex flex-col items-center gap-0.5 text-[#0a0a0a]/40 hover:text-[#0a0a0a] transition">
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M21 8.25c0-2.485-2.099-4.5-4.688-4.5-1.935 0-3.597 1.126-4.312 2.733-.715-1.607-2.377-2.733-4.313-2.733C5.1 3.75 3 5.765 3 8.25c0 7.22 9 12 9 12s9-4.78 9-12Z" />
            </svg>
            <span className="text-[10px] font-light">Favoritos</span>
          </Link>
          <Link href="/perfil" className="flex flex-col items-center gap-0.5 text-[#0a0a0a]/40 hover:text-[#0a0a0a] transition">
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 6a3.75 3.75 0 1 1-7.5 0 3.75 3.75 0 0 1 7.5 0ZM4.501 20.118a7.5 7.5 0 0 1 14.998 0" />
            </svg>
            <span className="text-[10px] font-light">Perfil</span>
          </Link>
        </div>
      </div>
    </>
  )
}