'use client'

import { useState, useRef, useEffect } from 'react'
import Link from 'next/link'
import Navbar from '@/components/Navbar'
import Buscador from '@/components/Buscador'
import BotonFavorito from '@/components/BotonFavorito'

// ═══════════════════════════════════════════════════════════
// CONFIGURACIÓN
// ═══════════════════════════════════════════════════════════

// Categorías curadas para el sidebar — para cambiar cuáles se
// muestran o su color, editar este array (los slugs deben coincidir
// con los de la tabla `categorias` en Supabase)
const SIDEBAR_CONFIG = [
  { slug: 'moda', color: '#fee064' },
  { slug: 'belleza-y-cuidado-personal', color: '#ff8e58' },
  { slug: 'gastronomia', color: '#efa8e0' },
  { slug: 'hogar-deco-y-jardin', color: '#fbfd54' },
  { slug: 'diseno-y-artesanias', color: '#6985f0' },
  { slug: 'tecnologia', color: '#fe6337' },
  { slug: 'salud-y-bienestar', color: '#9cc3ea' },
  { slug: 'arte-e-ilustracion', color: '#028f4a' }, 
]

// Paleta de colores para los pills de "Todas las categorías"
const PILL_COLORS = [
  '#ffb1ed', '#ff8e58', '#8e9afe', '#fbfd54', '#d7fd84',
  '#3cda86', '#8f99fb', '#c8c4f0', '#f5c4b3', '#9fe1cb',
  '#fac775', '#85b7eb', '#ed93b1', '#c0dd97', '#b4b2a9',
]

function getPillColor(slug) {
  const match = SIDEBAR_CONFIG.find(s => s.slug === slug)
  if (match) return match.color
  const hash = slug.split('').reduce((a, c) => a + c.charCodeAt(0), 0)
  return PILL_COLORS[hash % PILL_COLORS.length]
}

// Valores de marca (contenido fijo, no viene de la DB)
const VALORES = [
  { tipo: 'imagen', src: '/images/foto-valores-3.jpg' },
  { tipo: 'texto', titulo: 'Local', descripcion: 'Apoyar a quienes están haciendo cosas valiosas y ofrecen una alternativa de compra real y en tu ciudad.' },
  { tipo: 'imagen', src: '/images/foto-valores-2.jpg' },
  { tipo: 'texto', titulo: 'Humanos', descripcion: 'Conectá con quienes venden productos únicos, preparados con dedicación y cerca tuyo.' },
  { tipo: 'imagen', src: '/images/foto-valores-1.jpg' },
  { tipo: 'texto', titulo: 'Transparente', descripcion: 'Detrás de cada producto hay una historia.' },
  { tipo: 'imagen', src: '/images/foto-valores-4.jpg' },
  { tipo: 'texto', titulo: 'Accesible', descripcion: 'Sin locales caros, sin intermediarios.' },
  { tipo: 'texto', titulo: 'Accesible', descripcion: 'Sin locales caros, sin intermediarios.' },
]

// Colección curada (hardcodeada hasta que exista tabla `colecciones`)
const COLECCION = {
  titulo: 'SPA en casa',
  descripcion: 'Todo lo que necesitás para un momento de relax sin salir.',
  color: '#d4edda',
  productos: [
    { id: 20, nombre: 'Sales de baño relajantes', vendedor: 'Aroma Casa', precio: 3200 },
    { id: 21, nombre: 'Vela de soja eucalipto', vendedor: 'Aroma Casa', precio: 4500 },
    { id: 22, nombre: 'Jabón exfoliante avena', vendedor: 'Natural BB', precio: 2800 },
    { id: 23, nombre: 'Toalla de algodón orgánico', vendedor: 'Hilo Sur', precio: 9500 },
    { id: 24, nombre: 'Aceite esencial lavanda', vendedor: 'Natural BB', precio: 6200 },
  ],
}


// ═══════════════════════════════════════════════════════════
// HELPERS
// ═══════════════════════════════════════════════════════════

/** Busca la URL de la imagen principal del producto */
function getImageUrl(media) {
  if (!media?.length) return null
  const principal = media.find(m => m.es_principal)
  if (principal) return principal.url
  const sorted = [...media].sort((a, b) => a.orden - b.orden)
  return sorted[0]?.url || null
}


// ═══════════════════════════════════════════════════════════
// COMPONENTE PRINCIPAL
// ═══════════════════════════════════════════════════════════

export default function HomeContent({ categorias, recientes, elegidos }) {
  const [menuOpen, setMenuOpen] = useState(false)
  const sidebarRef = useRef(null)
  const [showUpArrow, setShowUpArrow] = useState(false)
  const [showDownArrow, setShowDownArrow] = useState(true)

  // Combinar config del sidebar con datos reales de la DB
  const sidebarCats = SIDEBAR_CONFIG
    .map(config => {
      const dbCat = categorias.find(c => c.slug === config.slug)
      return dbCat ? { ...dbCat, color: config.color } : null
    })
    .filter(Boolean)

  useEffect(() => {
    const sidebar = sidebarRef.current
    if (!sidebar) return
    function handleScroll() {
      setShowUpArrow(sidebar.scrollTop > 20)
      setShowDownArrow(sidebar.scrollHeight - sidebar.scrollTop - sidebar.clientHeight > 20)
    }
    sidebar.addEventListener('scroll', handleScroll)
    return () => sidebar.removeEventListener('scroll', handleScroll)
  }, [])

  {/* ─── Color de fondo (background del index escritorio) ─── */}
  return (
    <div className="min-h-screen bg-[#ffffff]"> 

      {/* ─── SIDEBAR (desktop) — fijo ─── */}
      <aside className="hidden lg:flex flex-col w-52 shrink-0 fixed top-0 left-0 h-screen pl-6 pt-6 pr-3 pb-3 z-40">

        <Link href="/" className="flex justify-center mb-5 shrink-0">
          <img src="/images/logo-bahiashops.png" alt="Bahía Shops" className="h-10 object-contain" />
        </Link>

        {/* Categorías con flechas flotantes */}
        <div className="relative flex-1 min-h-0">
          <button
            onClick={() => sidebarRef.current?.scrollTo({ top: 0, behavior: 'smooth' })}
            className={`absolute top-2 left-1/2 -translate-x-1/2 w-6 h-6 flex items-center justify-center cursor-pointer transition-all bg-black/80 rounded-full z-10 ${showUpArrow ? 'opacity-100' : 'opacity-0 pointer-events-none'}`}
            aria-label="Volver arriba"
          >
            <svg className="w-4 h-4 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="m4.5 15.75 7.5-7.5 7.5 7.5" />
            </svg>
          </button>

          <div
            ref={sidebarRef}
            className="flex flex-col gap-2 overflow-y-auto h-full"
            style={{ scrollbarWidth: 'none', msOverflowStyle: 'none' }}
          >
            {sidebarCats.map((cat, i) => (
              <Link
                key={cat.slug}
                href={`/categoria/${cat.slug}`}
                className="rounded-sidebar-card px-3 py-4 shrink-0 transition-colors block text-black hover:text-white"
                style={{ backgroundColor: cat.color }}
              >
                <div className="flex justify-between items-start mb-2">
                  <span className="text-[11px] font-semibold">{String(i + 1).padStart(2, '0')}</span>
                  <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="m4.5 19.5 15-15m0 0H8.25m11.25 0v11.25" />
                  </svg>
                </div>
                <span className="text-[13px] font-medium leading-tight">{cat.nombre}</span>
              </Link>
            ))}
          </div>

          <button
            onClick={() => sidebarRef.current?.scrollBy({ top: 200, behavior: 'smooth' })}
            className={`absolute bottom-2 left-1/2 -translate-x-1/2 w-6 h-6 flex items-center justify-center cursor-pointer transition-all bg-black rounded-full z-10 ${showDownArrow ? 'opacity-100' : 'opacity-0 pointer-events-none'}`}
            aria-label="Ver más categorías"
          >
            <svg className="w-4 h-4 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="m4.5 8.25 7.5 7.5 7.5-7.5" />
            </svg>
          </button>
        </div>

        {/* Cards fijos al fondo */}
        <div className="flex flex-col gap-1 pt-2 shrink-0">
          <Link
            href="/sobre-nosotros"
            className="bg-[#1a1a1a] text-white rounded-sidebar-card px-3 py-3 text-[13px] font-medium hover:bg-[#2a2a2a] transition block"
          >
            Más sobre Bahía Shops
          </Link>
          <div className="bg-[#1a1a1a] rounded-sidebar-card px-3 py-2 flex gap-2 justify-center">
            <a href="https://instagram.com/bahiashops" target="_blank" rel="noopener noreferrer" className="text-white hover:text-[#8B7EC8] transition" aria-label="Instagram">
              <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24"><path d="M12 2.163c3.204 0 3.584.012 4.85.07 3.252.148 4.771 1.691 4.919 4.919.058 1.265.069 1.645.069 4.849 0 3.205-.012 3.584-.069 4.849-.149 3.225-1.664 4.771-4.919 4.919-1.266.058-1.644.07-4.85.07-3.204 0-3.584-.012-4.849-.07-3.26-.149-4.771-1.699-4.919-4.92-.058-1.265-.07-1.644-.07-4.849 0-3.204.013-3.583.07-4.849.149-3.227 1.664-4.771 4.919-4.919 1.266-.057 1.645-.069 4.849-.069zM12 0C8.741 0 8.333.014 7.053.072 2.695.272.273 2.69.073 7.052.014 8.333 0 8.741 0 12c0 3.259.014 3.668.072 4.948.2 4.358 2.618 6.78 6.98 6.98C8.333 23.986 8.741 24 12 24c3.259 0 3.668-.014 4.948-.072 4.354-.2 6.782-2.618 6.979-6.98.059-1.28.073-1.689.073-4.948 0-3.259-.014-3.667-.072-4.947-.196-4.354-2.617-6.78-6.979-6.98C15.668.014 15.259 0 12 0zm0 5.838a6.162 6.162 0 100 12.324 6.162 6.162 0 000-12.324zM12 16a4 4 0 110-8 4 4 0 010 8zm6.406-11.845a1.44 1.44 0 100 2.881 1.44 1.44 0 000-2.881z"/></svg>
            </a>
            <a href="https://tiktok.com/@bahiashops" target="_blank" rel="noopener noreferrer" className="text-white hover:text-[#8B7EC8] transition" aria-label="TikTok">
              <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24"><path d="M19.59 6.69a4.83 4.83 0 0 1-3.77-4.25V2h-3.45v13.67a2.89 2.89 0 0 1-2.88 2.5 2.89 2.89 0 0 1 0-5.78 2.93 2.93 0 0 1 .88.13V9.4a6.84 6.84 0 0 0-.88-.07A6.33 6.33 0 0 0 3.16 15.65 6.33 6.33 0 0 0 9.49 22a6.33 6.33 0 0 0 6.33-6.33V9.14a8.16 8.16 0 0 0 3.77.98V6.69z"/></svg>
            </a>
            <a href="https://facebook.com/bahiashops" target="_blank" rel="noopener noreferrer" className="text-white hover:text-[#8B7EC8] transition" aria-label="Facebook">
              <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24"><path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z"/></svg>
            </a>
            <a href="mailto:bahiashops.estudio@gmail.com" className="text-white hover:text-[#8B7EC8] transition" aria-label="Email">
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}><path strokeLinecap="round" strokeLinejoin="round" d="M21.75 6.75v10.5a2.25 2.25 0 0 1-2.25 2.25h-15a2.25 2.25 0 0 1-2.25-2.25V6.75m19.5 0A2.25 2.25 0 0 0 19.5 4.5h-15a2.25 2.25 0 0 0-2.25 2.25m19.5 0v.243a2.25 2.25 0 0 1-1.07 1.916l-7.5 4.615a2.25 2.25 0 0 1-2.36 0L3.32 8.91a2.25 2.25 0 0 1-1.07-1.916V6.75"/></svg>
            </a>
          </div>
        </div>
      </aside>

      
      {/* ─── OVERLAY MOBILE del sidebar ─── Color de fondo (background del index celular)─── */}
      {menuOpen && (
        <div className="fixed inset-0 z-40 lg:hidden bg-[#ffffff]">
          <div className="flex items-center justify-between px-4 h-16 border-b border-gray-200/40">
            <span className="text-[17px] font-semibold tracking-tight text-gray-900">bahía shops</span>
            <button
              onClick={() => setMenuOpen(false)}
              className="w-10 h-10 flex items-center justify-center rounded-pill bg-[#1a1a1a] text-white"
              aria-label="Cerrar menú"
            >
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M6 18 18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
          <MobileMenuContent categorias={sidebarCats} onClose={() => setMenuOpen(false)} />
        </div>
      )}

      <Navbar onToggleMenu={() => setMenuOpen(!menuOpen)} />

      {/* ─── COLUMNA PRINCIPAL ─── */}
      <div className="lg:ml-52">
        <main className="flex-1 min-w-0">

          {/* ═══ BLOQUE 1: Hero ═══ */}
          <section className="relative h-[calc(90vh-4rem)] overflow-hidden rounded-hero ml-3 mt-5 mr-6">
            <div
              className="absolute inset-0 bg-cover bg-center"
              style={{ backgroundImage: "url('/images/herohome.jpg')" }}
            />

            <div className="relative z-10 flex flex-col items-center justify-center h-full px-6 text-center">
              <img 
                src="/images/logoblanco-bahiashops.png" 
                alt="bahía shops" 
                className="w-50 h-11 md:w-70 md:h-16 mb-0 md:mb-0 object-contain"
              />
              <h1 className="text-white text-3xl md:text-5xl font-bold tracking-tight mb-4">
              
              </h1>
              <p className="text-white text-base md:text-l max-w-lg leading-relaxed font-normal">
                No hace falta buscar lejos para encontrar algo extraordinario.
                </p>
             <p className="text-white text-base md:text-l max-w-lg leading-relaxed font-normal">
                ¡Lo que necesitás está más cerca de lo que pensás!
                </p>
            

              <div className="mt-8 w-full max-w-md mx-auto">
                <Buscador
                  placeholder="Descubrí lo que hay en tu ciudad"
                  mostrarFlecha
                />
              </div>
              <div className="absolute bottom-8 animate-bounce">
                <svg className="w-6 h-6 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="m19.5 8.25-7.5 7.5-7.5-7.5" />
                </svg>
              </div>
            </div>
          </section>


          {/* ═══ BLOQUE 2: Qué somos + Mapa ═══ */}
            <section className="pt-10 pb-8 md:pt-6 md:pb-0 ml-3 mr-6">
            <div className="flex flex-col md:flex-row gap-4 md:gap-6">
              <div className="flex-1 bg-[#fe6337] rounded-2xl p-8 md:p-10 flex flex-col justify-between border border-gray-100">
                <div>
                  <h2 className="text-2xl md:text-3xl font-bold text-black mb-5">
                    Un marketplace de tu ciudad
                  </h2>
                  <p className="text-black leading-relaxed text-[15px] md:text-base">
                    Bahía Shops conecta a quienes crean, producen y venden en Bahía Blanca
                    con quienes buscan productos únicos y locales. Sin intermediarios,
                    sin algoritmos lejanos. Acá conocés a quien te vende.
                  </p>
                </div>
                <Link
                  href="/sobre-nosotros"
                  className="mt-8 inline-block self-start bg-black text-white px-6 py-3 rounded-full text-sm font-semibold hover:bg-[#2a2a2a] transition"
                >
                  Conocé más
                </Link>
              </div>
              <div className="flex-1 bg-[#e8e5dd] rounded-2xl overflow-hidden border border-gray-200/40 min-h-[300px] flex items-center justify-center">
                <div className="text-center text-gray-400">
                  <svg className="w-10 h-10 mx-auto mb-2" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M15 10.5a3 3 0 1 1-6 0 3 3 0 0 1 6 0Z" />
                    <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 10.5c0 7.142-7.5 11.25-7.5 11.25S4.5 17.642 4.5 10.5a7.5 7.5 0 1 1 15 0Z" />
                  </svg>
                  <span className="text-sm">Mapa de Bahía Blanca</span>
                </div>
              </div>
            </div>
          </section>


          {/* ═══ BLOQUE 3: Valores ("Lo que nos mueve") ═══ */}
          <ValoresCarrusel />

          {/* ═══ BLOQUE 2.5: Banner movedizo ═══ */}
            <section className="py-0 md:py-0 ml-3 mr-6 mt-1 md:mt-0 overflow-hidden bg-[#fe6337] rounded-4xl">
              <div className="relative flex items-center h-14 md:h-16">
                <style>{`
                  @import url('https://fonts.googleapis.com/css2?family=Fraunces:ital,wght@0,300;0,500;1,300&display=swap');
      
                  @keyframes scroll {
                  0% { transform: translateX(0%); }
                  100% { transform: translateX(-50%); }
                  }
      
                  .ticker {
                    animation: scroll 15s linear infinite;
                    white-space: nowrap;
                    display: flex;
                    align-items: center;
                    font-family: 'Fraunces', serif;
                    width: max-content;
                    flex-shrink: 0;
                  }
      
                  .ticker:hover {
                    animation-play-state: paused;
                  }
                `}</style>
    
              <div className="ticker">
                <span className="text-[#ffffff] text-1xl md:text-[20px] font-normal px-6 tracking-wide">
                  ★  &nbsp; &nbsp; &nbsp;
                </span>
                <span className="text-[#ffffff] text-1xl md:text-[20px] font-normal px-6 tracking-wide">
                  ¿Tenés un local o emprendimiento en Bahía? &nbsp; &nbsp; &nbsp;
                </span>
                <span className="text-[#ffffff] text-1xl md:text-[20px] font-normal px-6 tracking-wide">
                  ★  &nbsp; &nbsp; &nbsp;
                </span>
                <span className="text-[#ffffff] text-1xl md:text-[20px] font-normal px-6 tracking-wide">
                  ¡Sumate a BahíaShops! &nbsp; &nbsp; &nbsp;
                </span>
                <span className="text-[#ffffff] text-1xl md:text-[20px] font-normal px-6 tracking-wide">
                  ★  &nbsp; &nbsp; &nbsp;
                </span>

                {/* segunda repetición idéntica, para el loop infinito */}
                <span className="text-[#ffffff] text-1xl md:text-[20px] font-normal px-6 tracking-wide">
                  ¿Tenés un local o emprendimiento en Bahía? &nbsp; &nbsp; &nbsp;
                </span>
                <span className="text-[#ffffff] text-1xl md:text-[20px] font-normal px-6 tracking-wide">
                  ★  &nbsp; &nbsp; &nbsp;
                </span>
                <span className="text-[#ffffff] text-1xl md:text-[20px] font-normal px-6 tracking-wide">
                  ¡Sumate a BahíaShops! &nbsp; &nbsp; &nbsp;
                </span>
                <span className="text-[#ffffff] text-1xl md:text-[20px] font-normal px-6 tracking-wide">
                  ★  &nbsp; &nbsp; &nbsp;
                </span>
              </div>
            </div>
          </section>

          {/* ═══ BLOQUE 4: Recién llegados ═══ */}
          <RecienLlegados productos={recientes} />


          {/* ═══ BLOQUE 5: Franja vendedores ═══ */}
          <section className="bg-[#fe6337] text-white py-8 md:py-8 px-8 md:px-10 ml-3 mr-6 rounded-4xl">
            <div className="flex flex-col md:flex-row items-center justify-between gap-4">
              <div>
                <p className="text-lg md:text-xl font-semibold mt-1">¿Tenés un emprendimiento en Bahía?</p>
                <p className="text-white text-sm mt-1">Sumá tus productos y llegá a más clientes</p>
              </div>
              <Link
                href="/vendedor/registro"
                className="shrink-0 bg-transparent hover:bg-white border-2 border-white text-white hover:text-[#fe6337] px-6 py-3 mt-5 md:mt-5 mb-1 md:mb-5 rounded-pill text-sm font-semibold transition"
              >
                ¡Quiero sumarme!
              </Link>
            </div>
          </section>


          {/* ═══ BLOQUE 6: Elegidos de la semana ═══ */}
          {elegidos.length > 0 && (
            <section className="pt-10 pb-10 md:pt-10 md:pb-12 ml-3 mr-6">
              <h2 className="text-xl md:text-2xl font-bold text-black">
                Elegidos de la semana
              </h2>
              <div className="columns-2 md:columns-3 gap-4 space-y-4">
                {elegidos.map((prod, i) => {
                  const zigzag = ['tall', 'short', 'short', 'tall', 'tall', 'short']
                  const imageUrl = getImageUrl(prod.media)
                  return (
                    <div key={prod.id} className="break-inside-avoid relative">
                      <Link href={`/producto/${prod.id}`} className="block group">
                        <div
                          className={`bg-[#e8e5dd] rounded-product-card overflow-hidden flex items-center justify-center ${
                            zigzag[i % 6] === 'tall' ? 'aspect-[3/4]' : 'aspect-square'
                          }`}
                        >
                          {imageUrl ? (
                            <img src={imageUrl} alt={prod.nombre} className="w-full h-full object-cover" />
                          ) : (
                            <span className="text-gray-400 text-xs">foto</span>
                          )}
                        </div>
                        <div className="px-0.5">
                          <p className="text-sm font-medium text-gray-900 group-hover:text-gray-500 transition">{prod.nombre}</p>
                          <p className="text-xs text-gray-400 ">{prod.vendedor?.nombre_negocio}</p>
                          <p className="text-sm font-semibold text-gray-900 mt-1">
                            ${Number(prod.precio).toLocaleString('es-AR')}
                          </p>
                        </div>
                      </Link>
                      <div className="absolute top-2 right-2">
                        <BotonFavorito
                          productoId={prod.id}
                          className="w-8 h-8 rounded-full bg-white/80 backdrop-blur-sm flex items-center justify-center text-gray-500"
                        />
                      </div>
                    </div>
                  )
                })}
              </div>
            </section>
          )}


          {/* ═══ BLOQUE 7: Colección curada ═══ */}
          <ColeccionCurada coleccion={COLECCION} />


          {/* ═══ BLOQUE 8: CTA final vendedores ═══ */}
          <section className="bg-[#8B7EC8] text-white py-20 md:py-28 px-4 md:px-8 lg:px-12">
            <div className="max-w-2xl mx-auto text-center">
              <h2 className="text-2xl md:text-4xl font-bold mb-4">
                ¿Querés vender en Bahía Shops?
              </h2>
              <p className="text-white/80 text-base md:text-lg mb-8 leading-relaxed">
                Sin locales caros, sin intermediarios. Registrá tu emprendimiento,
                subí tus productos y empezá a vender hoy.
              </p>
              <Link
                href="/vendedor/registro"
                className="inline-block bg-white text-[#8B7EC8] px-8 py-3.5 rounded-pill text-sm font-bold hover:bg-gray-100 transition"
              >
                Empezá a vender
              </Link>
            </div>
          </section>


          {/* ── Footer mínimo ── */}
          <footer className="bg-[#1a1a1a] text-gray-500 text-xs text-center py-6">
            © 2026 Bahía Shops — Bahía Blanca, Argentina
          </footer>

        </main>
      </div>
    </div>
  )
}


// ═══════════════════════════════════════════════════════════
// SUBCOMPONENTES
// ═══════════════════════════════════════════════════════════

/**
 * MobileMenuContent — Menú mobile a pantalla completa
 * Recibe las categorías curadas del sidebar
 */
function MobileMenuContent({ categorias, onClose }) {
  const scrollRef = useRef(null)
  const [showDownArrow, setShowDownArrow] = useState(false)

  useEffect(() => {
    const el = scrollRef.current
    if (!el) return
    function check() {
      setShowDownArrow(el.scrollHeight - el.scrollTop - el.clientHeight > 10)
    }
    check()
    el.addEventListener('scroll', check)
    return () => el.removeEventListener('scroll', check)
  }, [])

  return (
    <div className="relative h-[calc(100vh-4rem)]">
      <div
        ref={scrollRef}
        className="h-full overflow-y-auto px-4 pt-4 pb-24 flex flex-col gap-3"
        style={{ scrollbarWidth: 'none', msOverflowStyle: 'none', WebkitOverflowScrolling: 'touch' }}
      >
        {categorias.map((cat) => (
          <Link
            key={cat.slug}
            href={`/categoria/${cat.slug}`}
            onClick={onClose}
            className="rounded-menu-card px-5 py-5 flex items-center justify-between text-black"
            style={{ backgroundColor: cat.color }}
          >
            <span className="text-[17px] font-semibold">{cat.nombre}</span>
            <svg className="w-5 h-5 opacity-50" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="m4.5 19.5 15-15m0 0H8.25m11.25 0v11.25" />
            </svg>
          </Link>
        ))}

        <Link
          href="/sobre-nosotros"
          onClick={onClose}
          className="bg-[#1a1a1a] text-white rounded-menu-card px-5 py-5 text-[17px] font-semibold mt-2"
        >
          Más sobre Bahía Shops
        </Link>
      </div>

      {showDownArrow && (
        <div className="absolute bottom-6 left-1/2 -translate-x-1/2 animate-bounce pointer-events-none">
          <div className="w-10 h-10 rounded-pill bg-white/80 backdrop-blur shadow-md flex items-center justify-center">
            <svg className="w-5 h-5 text-gray-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="m19.5 8.25-7.5 7.5-7.5-7.5" />
            </svg>
          </div>
        </div>
      )}
    </div>
  )
}

/**
 * Recién Llegados — carrusel horizontal con datos reales
 * Si no hay productos, muestra invitación a vendedores
 */
function RecienLlegados({ productos }) {
  const scrollRef = useRef(null)
  const [canScrollLeft, setCanScrollLeft] = useState(false)
  const [canScrollRight, setCanScrollRight] = useState(true)

  function updateArrows() {
    const el = scrollRef.current
    if (!el) return
    setCanScrollLeft(el.scrollLeft > 2)
    setCanScrollRight(el.scrollLeft < el.scrollWidth - el.clientWidth - 2)
  }

  useEffect(() => {
    const el = scrollRef.current
    if (!el) return
    el.addEventListener('scroll', updateArrows)
    updateArrows()
    return () => el.removeEventListener('scroll', updateArrows)
  }, [])

  function scroll(direction) {
    scrollRef.current?.scrollBy({ left: direction * 280, behavior: 'smooth' })
  }

  return (
    <section className="pt-0 pb-3 md:pt-0 md:pb-3 mt-5 md:mt-8 ml-3 mr-6">
      <div className="flex items-center justify-between mb-8">
        <h2 className="text-xl md:text-2xl font-bold text-black">
          Recién llegados
        </h2>
        {productos.length > 3 && (
          <div className="flex gap-2">
            <button
              onClick={() => scroll(-1)}
              className={`w-6 h-6 flex items-center justify-center cursor-pointer transition-all bg-black/80 rounded-full ${canScrollLeft ? 'opacity-100' : 'opacity-0 pointer-events-none'}`}
              aria-label="Anterior"
            >
              <svg className="w-4 h-4 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 19.5 8.25 12l7.5-7.5" />
              </svg>
            </button>
            <button
              onClick={() => scroll(1)}
              className={`w-6 h-6 flex items-center justify-center cursor-pointer transition-all bg-black/80 rounded-full ${canScrollRight ? 'opacity-100' : 'opacity-0 pointer-events-none'}`}
              aria-label="Siguiente"
            >
              <svg className="w-4 h-4 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="m8.25 4.5 7.5 7.5-7.5 7.5" />
              </svg>
            </button>
          </div>
        )}
      </div>

      <div
        ref={scrollRef}
        className="flex gap-4 overflow-x-auto pb-4 snap-x snap-mandatory"
        style={{ scrollbarWidth: 'none', msOverflowStyle: 'none' }}
      >
        {/* Productos reales */}
        {productos.map((prod) => {
          const imageUrl = getImageUrl(prod.media)
          return (
            <div key={prod.id} className="shrink-0 w-48 md:w-56 snap-start relative">
              <Link
                href={`/producto/${prod.id}`}
                className="block group"
              >
              <div className="aspect-square bg-[#e8e5dd] rounded-product-card overflow-hidden flex items-center justify-center">
                {imageUrl ? (
                  <img src={imageUrl} alt={prod.nombre} className="w-full h-full object-cover" />
                ) : (
                  <span className="text-gray-400 text-xs">foto</span>
                )}
              </div>
              <div className="mt-2.5">
                <p className="text-sm font-medium text-gray-900 group-hover:text-[#8B7EC8] transition truncate">{prod.nombre}</p>
                <p className="text-xs text-gray-400 mt-0.5">{prod.vendedor?.nombre_negocio}</p>
                <p className="text-sm font-semibold text-gray-900 mt-1">
                  ${Number(prod.precio).toLocaleString('es-AR')}
                </p>
              </div>
            </Link>
            <div className="absolute top-2 right-2">
              <BotonFavorito
                productoId={prod.id}
                className="w-8 h-8 rounded-full bg-white/80 backdrop-blur-sm flex items-center justify-center text-gray-500"
              />
            </div>
          </div>
        )
      })}

        {/* Fallback: invitación cuando hay pocos productos */}
        {productos.length < 4 && (
          <Link
            href="/vendedor/registro"
            className="shrink-0 w-48 md:w-56 snap-start"
          >
            <div className="aspect-square bg-white rounded-product-card overflow-hidden flex flex-col items-center justify-center border-2 border-dashed border-gray-200 hover:border-[#8B7EC8] transition group p-4">
              <svg className="w-8 h-8 text-gray-300 group-hover:text-[#8B7EC8] transition mb-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M13.5 21v-7.5a.75.75 0 0 1 .75-.75h3a.75.75 0 0 1 .75.75V21m-4.5 0H2.36m11.14 0H18m0 0h3.64m-1.39 0V9.349M3.75 21V9.349m0 0a3.001 3.001 0 0 0 3.75-.615A2.993 2.993 0 0 0 9.75 9.75c.896 0 1.7-.393 2.25-1.016a2.993 2.993 0 0 0 2.25 1.016c.896 0 1.7-.393 2.25-1.015a3.001 3.001 0 0 0 3.75.614m-16.5 0a3.004 3.004 0 0 1-.621-4.72l1.189-1.19A1.5 1.5 0 0 1 5.378 3h13.243a1.5 1.5 0 0 1 1.06.44l1.19 1.189a3 3 0 0 1-.621 4.72M6.75 18h3.75a.75.75 0 0 0 .75-.75V13.5a.75.75 0 0 0-.75-.75H6.75a.75.75 0 0 0-.75.75v3.75c0 .414.336.75.75.75Z" />
              </svg>
              <p className="text-sm font-medium text-gray-400 group-hover:text-[#8B7EC8] transition text-center">
                ¿Vendés en Bahía?
              </p>
              <p className="text-xs text-gray-300 mt-1 text-center">
                Sumá tus productos
              </p>
            </div>
          </Link>
        )}
      </div>
    </section>
  )
}


/**  * Colección Curada — sección temática (hardcodeada por ahora) 
 */
function ColeccionCurada({ coleccion }) {
  const scrollRef = useRef(null)

  function scroll(direction) {
    scrollRef.current?.scrollBy({ left: direction * 260, behavior: 'smooth' })
  }

  return (
    <section
      className="rounded-collection-block mx-4 md:mx-8 lg:mx-12 py-16 md:py-5 px-4 md:px-8 mb-10 lg:px-12 overflow-hidden"
      style={{ backgroundColor: coleccion.color, color: '#000' }}
    >
      <div className="flex items-center justify-between mb-2">
        <div>
          <h2 className="text-xl md:text-2xl font-bold">{coleccion.titulo}</h2>
          <p className="text-sm opacity-70 mt-1">{coleccion.descripcion}</p>
        </div>
        <div className="hidden md:flex gap-2">
          <button
            onClick={() => scroll(-1)}
            className="w-9 h-9 rounded-pill bg-white/30 hover:bg-white/50 flex items-center justify-center transition cursor-pointer"
            aria-label="Anterior"
          >
            <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 19.5 8.25 12l7.5-7.5" />
            </svg>
          </button>
          <button
            onClick={() => scroll(1)}
            className="w-9 h-9 rounded-pill bg-white/30 hover:bg-white/50 flex items-center justify-center transition cursor-pointer"
            aria-label="Siguiente"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="m8.25 4.5 7.5 7.5-7.5 7.5" />
            </svg>
          </button>
        </div>
      </div>

      <div
        ref={scrollRef}
        className="flex gap-4 overflow-x-auto mt-8 pb-2 snap-x snap-mandatory"
        style={{ scrollbarWidth: 'none', msOverflowStyle: 'none' }}
      >
        {coleccion.productos.map((prod) => (
          <Link
            key={prod.id}
            href={`/producto/${prod.id}`}
            className="shrink-0 w-48 md:w-56 snap-start group"
          >
            <div className="aspect-square bg-white/30 rounded-product-card overflow-hidden flex items-center justify-center">
              <span className="opacity-40 text-xs">foto</span>
            </div>
            <div className="mt-2.5">
              <p className="text-sm font-medium group-hover:opacity-70 transition truncate">{prod.nombre}</p>
              <p className="text-xs opacity-50 mt-0.5">{prod.vendedor}</p>
              <p className="text-sm font-semibold mt-1">${prod.precio.toLocaleString('es-AR')}</p>
            </div>
          </Link>
        ))}
      </div>
    </section>
  )
}


/**
 * Valores Carrusel — "Lo que nos mueve"
 */
function ValoresCarrusel() {
  const scrollRef = useRef(null)
  const [canScrollLeft, setCanScrollLeft] = useState(false)
  const [canScrollRight, setCanScrollRight] = useState(true)

  function updateArrows() {
    const el = scrollRef.current
    if (!el) return
    setCanScrollLeft(el.scrollLeft > 2)
    setCanScrollRight(el.scrollLeft < el.scrollWidth - el.clientWidth - 2)
  }

  useEffect(() => {
    const el = scrollRef.current
    if (!el) return
    el.addEventListener('scroll', updateArrows)
    updateArrows()
    return () => el.removeEventListener('scroll', updateArrows)
  }, [])

  function scroll(direction) {
    scrollRef.current?.scrollBy({ left: direction * 280, behavior: 'smooth' })
  }

  return (
    <section className="py-0 md:py-8 ml-3 mr-6">
      <div className="flex items-center justify-between mb-8">
        <h2 className="text-xl md:text-2xl font-bold text-gray-900 pl-1">
          Lo que nos mueve
        </h2>
        <div className="flex gap-2">
          <button
            onClick={() => scroll(-1)}
            className={`w-6 h-6 flex items-center justify-center cursor-pointer transition-all bg-black/80 rounded-full ${canScrollLeft ? 'opacity-100' : 'opacity-0 pointer-events-none'}`}
            aria-label="Anterior"
          >
            <svg className="w-4 h-4 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 19.5 8.25 12l7.5-7.5" />
            </svg>
          </button>
          <button
            onClick={() => scroll(1)}
            className={`w-6 h-6 flex items-center justify-center cursor-pointer transition-all bg-black/80 rounded-full ${canScrollRight ? 'opacity-100' : 'opacity-0 pointer-events-none'}`}
            aria-label="Siguiente"
          >
            <svg className="w-4 h-4 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="m8.25 4.5 7.5 7.5-7.5 7.5" />
            </svg>
          </button>
        </div>
      </div>

      <div
        ref={scrollRef}
        className="flex gap-4 overflow-x-auto pb-4 snap-x snap-mandatory"
        style={{ scrollbarWidth: 'none', msOverflowStyle: 'none' }}
      >
        {VALORES.map((item, i) =>
          item.tipo === 'texto' ? (
            <div
              key={i}
              className="shrink-0 w-60 md:w-72 bg-white rounded-value-card p-6 snap-start border border-gray-100 mb-4 md:mb-0"
            >
              <h3 className="text-lg font-bold text-gray-900 mb-2">{item.titulo}</h3>
              <p className="text-sm text-gray-500 leading-relaxed">{item.descripcion}</p>
            </div>
          ) : (
            <div
              key={i}
              className="shrink-0 w-44 md:w-56 rounded-value-card overflow-hidden snap-start bg-[#e8e5dd]"
              >
            <img 
              src={item.src} 
              alt="Imagen de marca" 
              className="w-full h-full object-cover min-h-[160px] md:min-h-[200px]"
              />
            </div>
            )
        )}
      </div>
    </section>
  )
}