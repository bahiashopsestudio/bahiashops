'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import Buscador from '@/components/Buscador'
import { createClient } from '@/lib/supabase/client'
import { useCarrito } from '@/context/CarritoContext'
import LogoAnimado from '@/components/LogoAnimado'

export const SELLOS = [
  { nombre: 'Hecho en Bahía', slug: 'hecho-en-bahia' },
  { nombre: 'Productos únicos', slug: 'productos-unicos' },
  { nombre: 'Hecho a mano', slug: 'hecho-a-mano' },
  { nombre: 'De mujeres emprendedoras', slug: 'de-mujeres-emprendedoras' },
  { nombre: 'Eco-friendly', slug: 'eco-friendly' },
  { nombre: 'Vegano', slug: 'vegano' },
  { nombre: 'Producción responsable', slug: 'produccion-responsable' },
  { nombre: 'Segunda oportunidad', slug: 'segunda-oportunidad' },
  { nombre: 'Delivery en bicicleta', slug: 'delivery-en-bicicleta' },
]

const COLORES_CAPSULAS = ['#f1f29f', '#d4e8f0', '#f0e0d0', '#e8d4f0', '#d0f0e0', '#f0d4d4']

// variant:
//   "transparent" (default) — home: blanco puro sobre transparente, pasa a blanco+negro al scrollear
//   "solid" — páginas con fondo blanco: siempre negro sobre blanco, buscador visible desde el inicio

export default function Navbar({ onToggleMenu, variant = 'transparent' }) {
  const { cantidadTotal } = useCarrito()
  const [scrolled, setScrolled] = useState(false)
  const [pasoHero, setPasoHero] = useState(false)
  const [categoriasAbiertas, setCategoriasAbiertas] = useState(false)
  const [todasCategorias, setTodasCategorias] = useState([])
  const [todasCapsulas, setTodasCapsulas] = useState([])

  const isSolid = variant === 'solid'

  useEffect(() => {
    const supabase = createClient()
    async function cargarCategorias() {
      const { data } = await supabase
        .from('categorias')
        .select('id, nombre, slug')
        .eq('activa', true)
        .order('orden')
      if (data) setTodasCategorias(data)
    }
    async function cargarCapsulas() {
      try {
        const { data, error } = await supabase
          .from('colecciones')
          .select('id, nombre, descripcion, slug')
          .eq('activa', true)
          .order('orden')
        if (!error && data) setTodasCapsulas(data)
      } catch {
        // Tabla inexistente u otro error: la columna de cápsulas simplemente no se muestra
      }
    }
    cargarCategorias()
    cargarCapsulas()
  }, [])

  useEffect(() => {
    document.body.style.overflow = categoriasAbiertas ? 'hidden' : ''
    return () => { document.body.style.overflow = '' }
  }, [categoriasAbiertas])

  useEffect(() => {
    function umbral() {
      // Umbral chico: cuando el hero empieza a salir de pantalla — dispara
      // el buscador flotante (aparece con el primer scroll).
      return Math.max(100, Math.min(150, window.innerHeight * 0.15))
    }

    function handleScroll() {
      setScrolled(window.scrollY > umbral())
      // El navbar recién pasa a fondo blanco cuando el hero (100vh) terminó de salir de pantalla.
      setPasoHero(window.scrollY > window.innerHeight)
    }

    handleScroll()
    window.addEventListener('scroll', handleScroll, { passive: true })
    window.addEventListener('resize', handleScroll)
    return () => {
      window.removeEventListener('scroll', handleScroll)
      window.removeEventListener('resize', handleScroll)
    }
  }, [])

  // Estados derivados
  const showDark = isSolid || pasoHero

  const linkColor = showDark ? 'rgba(10,10,10,0.6)' : 'rgba(255,255,255,1)'
  const iconColorClass = showDark
    ? 'text-[#0a0a0a] hover:text-[#0a0a0a]/60'
    : 'text-white hover:text-white/70'

  return (
    <>
      {/* ── NAV DESKTOP ── */}
      <nav
        className={`fixed top-0 left-0 right-0 z-[900] hidden lg:block transition-all duration-300 ${
          showDark ? 'bg-white' : 'bg-transparent'
        }`}
        style={{ fontFamily: "'Inter', sans-serif" }}
      >
        <div className="max-w-7xl mx-auto px-6 h-20 flex items-center">

          {/* Zona 1: Logo */}
          <Link href="/" className="shrink-0 ml-4" aria-label="Bahía Shops">
            <LogoAnimado className="h-15 w-auto" color={showDark ? '#0a0a0a' : '#ffffff'} />
          </Link>

          {/* Zona 2: Navegación principal */}
          <div className="flex items-center gap-5 ml-12">
            <button
              onClick={() => setCategoriasAbiertas((v) => !v)}
              className="inline-flex items-center gap-1.5 transition-colors cursor-pointer"
              style={{
                fontFamily: "'Inter', sans-serif",
                fontWeight: 500,
                fontSize: '13px',
                borderRadius: '999px',
                padding: '7px 14px',
                backgroundColor: showDark ? 'rgba(10,10,10,0.06)' : 'rgba(255,255,255,0.16)',
                color: showDark ? '#0a0a0a' : '#ffffff',
              }}
              onMouseEnter={(e) => { e.currentTarget.style.backgroundColor = showDark ? 'rgba(10,10,10,0.1)' : 'rgba(255,255,255,0.26)' }}
              onMouseLeave={(e) => { e.currentTarget.style.backgroundColor = showDark ? 'rgba(10,10,10,0.06)' : 'rgba(255,255,255,0.16)' }}
            >
              Categorías
              {categoriasAbiertas ? (
                <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 18 18 6M6 6l12 12" />
                </svg>
              ) : (
                <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="m19.5 8.25-7.5 7.5-7.5-7.5" />
                </svg>
              )}
            </button>
            <Link href="/tesoros" className="text-[13px] font-light transition-colors" style={{ color: linkColor }}>
              Descubrí tesoros
            </Link>
            <Link href="/mapa" className="text-[13px] font-light transition-colors" style={{ color: linkColor }}>
              Mapa
            </Link>
          </div>

          {/* Zona 3: Secciones */}
          <div className="flex items-center gap-5 ml-auto mr-6">
            <Link href="/sobre-nosotros" className="text-[13px] font-light transition-colors" style={{ color: linkColor }}>
              Quiénes somos
            </Link>
          </div>

          {/* Zona 4: Iconos + Menú */}
          <div className="flex items-center gap-3 shrink-0">
            <Link href="/favoritos" className={`${iconColorClass} transition-colors`} aria-label="Favoritos">
              <svg className="w-[18px] h-[18px]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M21 8.25c0-2.485-2.099-4.5-4.688-4.5-1.935 0-3.597 1.126-4.312 2.733-.715-1.607-2.377-2.733-4.313-2.733C5.1 3.75 3 5.765 3 8.25c0 7.22 9 12 9 12s9-4.78 9-12Z" />
              </svg>
            </Link>
            <Link href="/carrito" className={`relative ${iconColorClass} transition-colors`} aria-label="Carrito">
              <svg className="w-[18px] h-[18px]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 10.5V6a3.75 3.75 0 1 0-7.5 0v4.5m11.356-1.993 1.263 12c.07.665-.45 1.243-1.119 1.243H4.25a1.125 1.125 0 0 1-1.12-1.243l1.264-12A1.125 1.125 0 0 1 5.513 7.5h12.974c.576 0 1.059.435 1.119 1.007Z" />
              </svg>
              {cantidadTotal > 0 && (
                <span className="absolute -top-1.5 -right-1.5 bg-[#cc152b] text-white text-[8px] font-bold w-3.5 h-3.5 rounded-full flex items-center justify-center">
                  {cantidadTotal}
                </span>
              )}
            </Link>
            <Link href="/perfil" className={`${iconColorClass} transition-colors`} aria-label="Perfil">
              <svg className="w-[18px] h-[18px]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 6a3.75 3.75 0 1 1-7.5 0 3.75 3.75 0 0 1 7.5 0ZM4.501 20.118a7.5 7.5 0 0 1 14.998 0" />
              </svg>
            </Link>
          </div>
        </div>
      </nav>


      {/* ── MEGA-MENÚ CATEGORÍAS (desktop) — se abre hacia abajo, ocupa toda la pantalla ── */}
      {categoriasAbiertas && (
        <div
          className="fixed top-20 left-0 right-0 bottom-0 z-[940] bg-white overflow-y-auto hidden lg:block"
          style={{ fontFamily: "'Inter', sans-serif" }}
        >
          <div
            className="max-w-6xl mx-auto px-10 py-10"
            style={{
              display: 'grid',
              gridTemplateColumns: todasCapsulas.length > 0 ? '1fr 0.85fr 1.15fr 1.1fr' : '1fr 0.85fr 1.1fr',
              gap: '24px',
            }}
          >
            {/* Columna 1: Categorías */}
            <div>
              <p
                style={{
                  fontSize: '10px',
                  textTransform: 'uppercase',
                  letterSpacing: '1.6px',
                  color: 'rgba(10,10,10,0.28)',
                  fontWeight: 400,
                  marginBottom: '18px',
                }}
              >
                Categorías
              </p>
              <div className="flex flex-col" style={{ gap: '6px' }}>
                {todasCategorias.map((c) => (
                  <Link
                    key={c.id}
                    href={`/categoria/${c.slug}`}
                    onClick={() => setCategoriasAbiertas(false)}
                    className="transition-colors"
                    style={{ fontSize: '13px', fontWeight: 300, color: '#0a0a0a' }}
                    onMouseEnter={(e) => { e.currentTarget.style.color = 'rgba(10,10,10,0.45)' }}
                    onMouseLeave={(e) => { e.currentTarget.style.color = '#0a0a0a' }}
                  >
                    {c.nombre}
                  </Link>
                ))}
              </div>
              <Link
                href="/categorias"
                onClick={() => setCategoriasAbiertas(false)}
                className="inline-block transition-colors"
                style={{ fontSize: '12px', color: 'rgba(10,10,10,0.35)', fontWeight: 400, marginTop: '6px' }}
              >
                Ver todas →
              </Link>
            </div>

            {/* Columna 2: Comprá con tus valores */}
            <div>
              <p
                style={{
                  fontSize: '10px',
                  textTransform: 'uppercase',
                  letterSpacing: '1.6px',
                  color: 'rgba(10,10,10,0.28)',
                  fontWeight: 400,
                  marginBottom: '18px',
                }}
              >
                Comprá con tus valores
              </p>
              <div className="flex flex-col" style={{ gap: '7px' }}>
                {SELLOS.map((s) => (
                  <Link
                    key={s.slug}
                    href={`/explorar?valor=${s.slug}`}
                    onClick={() => setCategoriasAbiertas(false)}
                    className="transition-colors"
                    style={{ fontSize: '13px', fontWeight: 300, color: '#0a0a0a' }}
                    onMouseEnter={(e) => { e.currentTarget.style.color = 'rgba(10,10,10,0.45)' }}
                    onMouseLeave={(e) => { e.currentTarget.style.color = '#0a0a0a' }}
                  >
                    {s.nombre}
                  </Link>
                ))}
              </div>
            </div>

            {/* Columna 3: Cápsulas */}
            {todasCapsulas.length > 0 && (
              <div>
                <p
                  style={{
                    fontSize: '10px',
                    textTransform: 'uppercase',
                    letterSpacing: '1.6px',
                    color: 'rgba(10,10,10,0.28)',
                    fontWeight: 400,
                    marginBottom: '18px',
                  }}
                >
                  Cápsulas
                </p>
                <div className="flex flex-col" style={{ gap: '10px' }}>
                  {todasCapsulas.map((cap, i) => (
                    <Link
                      key={cap.id}
                      href={`/coleccion/${cap.slug}`}
                      onClick={() => setCategoriasAbiertas(false)}
                      className="block transition-opacity"
                      style={{
                        backgroundColor: COLORES_CAPSULAS[i % COLORES_CAPSULAS.length],
                        padding: '14px 16px',
                        borderRadius: '6px',
                      }}
                      onMouseEnter={(e) => { e.currentTarget.style.opacity = '0.8' }}
                      onMouseLeave={(e) => { e.currentTarget.style.opacity = '1' }}
                    >
                      <div style={{ fontSize: '13px', fontWeight: 400, color: '#0a0a0a' }}>
                        {cap.nombre}
                      </div>
                      {cap.descripcion && (
                        <div style={{ fontSize: '11px', fontWeight: 300, color: 'rgba(10,10,10,0.45)', marginTop: '2px' }}>
                          {cap.descripcion}
                        </div>
                      )}
                    </Link>
                  ))}
                </div>
                <p
                  style={{
                    fontSize: '11px',
                    color: 'rgba(10,10,10,0.25)',
                    fontWeight: 300,
                    fontStyle: 'italic',
                    marginTop: '4px',
                  }}
                >
                  Las cápsulas cambian con las estaciones
                </p>
              </div>
            )}

            {/* Columna 4: Tesoros */}
            <Link
              href="/tesoros"
              onClick={() => setCategoriasAbiertas(false)}
              className="transition-transform"
              style={{
                position: 'relative',
                borderRadius: '8px',
                overflow: 'hidden',
                background: 'linear-gradient(155deg, #f5f0e6 0%, #ebe4d4 100%)',
                minHeight: '260px',
                display: 'flex',
                flexDirection: 'column',
                justifyContent: 'flex-end',
                padding: '24px 22px',
              }}
              onMouseEnter={(e) => { e.currentTarget.style.transform = 'scale(1.01)' }}
              onMouseLeave={(e) => { e.currentTarget.style.transform = 'scale(1)' }}
            >
              <span
                style={{
                  position: 'absolute',
                  top: '16px',
                  right: '16px',
                  backgroundColor: '#0a0a0a',
                  color: '#ffffff',
                  fontSize: '8.5px',
                  textTransform: 'uppercase',
                  letterSpacing: '1.2px',
                  padding: '5px 11px',
                  borderRadius: '3px',
                }}
              >
                Curado por Bahía Shops
              </span>
              <p
                style={{
                  fontFamily: "'Fraunces', Georgia, serif",
                  fontSize: '19px',
                  fontWeight: 500,
                  color: '#0a0a0a',
                  lineHeight: 1.25,
                  marginBottom: '8px',
                }}
              >
                Lo más lindo que encontramos en Bahía
              </p>
              <p
                style={{
                  fontFamily: "'Poppins', sans-serif",
                  fontSize: '11px',
                  fontWeight: 300,
                  color: 'rgba(10,10,10,0.5)',
                  marginBottom: '14px',
                }}
              >
                Objetos elegidos uno por uno
              </p>
              <span
                style={{
                  fontSize: '12px',
                  fontWeight: 400,
                  color: '#0a0a0a',
                  textDecoration: 'underline',
                  textUnderlineOffset: '3px',
                }}
              >
                Descubrí Tesoros
              </span>
            </Link>
          </div>
        </div>
      )}


      {/* ── BUSCADOR FLOTANTE (desktop) — aparece con el primer scroll ── */}
      <div className={`fixed bottom-6 left-1/2 -translate-x-1/2 z-[900] transition-all duration-300 hidden lg:block ${scrolled ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-4 pointer-events-none'}`} style={{ fontFamily: "'Inter', sans-serif" }}>
        <div className="bg-white/95 backdrop-blur-md shadow-lg rounded-full px-3 py-2 flex items-center gap-2 w-[460px] relative">
          <Buscador
            placeholder="¿Qué estás buscando?"
            className="flex-1"
            dropdownArriba
            dropdownAnchoPadre
            inputStyle={{ fontFamily: "'Inter', sans-serif", fontWeight: 300 }}
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
            {cantidadTotal > 0 && (
              <span className="absolute -top-1 -right-1 bg-[#cc152b] text-white text-[8px] font-bold w-3.5 h-3.5 rounded-full flex items-center justify-center">
                {cantidadTotal}
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
        className={`fixed top-0 left-0 right-0 z-[900] lg:hidden transition-all duration-300 h-20 ${
          showDark ? 'bg-white' : 'bg-transparent'
        }`}
        style={{ fontFamily: "'Inter', sans-serif" }}
      >
        <div className="flex items-center justify-between h-full px-4">
          <Link href="/" className="shrink-0 ml-2" aria-label="Bahía Shops">
            <LogoAnimado className="h-15 w-auto" color={showDark ? '#0a0a0a' : '#ffffff'} />
          </Link>
          <div className="flex items-center gap-1.5">
            <Link href="/carrito" className={`relative p-2 rounded-full transition-colors ${iconColorClass}`} aria-label="Carrito">
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 10.5V6a3.75 3.75 0 1 0-7.5 0v4.5m11.356-1.993 1.263 12c.07.665-.45 1.243-1.119 1.243H4.25a1.125 1.125 0 0 1-1.12-1.243l1.264-12A1.125 1.125 0 0 1 5.513 7.5h12.974c.576 0 1.059.435 1.119 1.007Z" />
              </svg>
              {cantidadTotal > 0 && (
                <span className="absolute -top-0.5 -right-0.5 bg-[#cc152b] text-white text-[10px] font-bold w-[18px] h-[18px] rounded-full flex items-center justify-center">
                  {cantidadTotal}
                </span>
              )}
            </Link>
            <button className={`p-2 rounded-full transition-colors cursor-pointer ${iconColorClass}`} onClick={onToggleMenu} aria-label="Menú">
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                <path strokeLinecap="round" d="M3.75 6.75h16.5M3.75 12h16.5m-16.5 5.25h16.5" />
              </svg>
            </button>
          </div>
        </div>
      </nav>


      {/* ── BOTTOM BAR MOBILE ── */}
      <div className="fixed bottom-0 left-0 right-0 z-[900] lg:hidden" style={{ fontFamily: "'Inter', sans-serif" }}>
        <div className="backdrop-blur-md shadow-[0_-1px_3px_rgba(10,10,10,0.06)] px-6 py-2 flex justify-around items-center bg-white/95">
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
            {cantidadTotal > 0 && (
              <span className="absolute -top-1 right-1 bg-[#cc152b] text-white text-[9px] font-bold w-4 h-4 rounded-full flex items-center justify-center">
                {cantidadTotal}
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
