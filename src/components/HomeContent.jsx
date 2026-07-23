'use client'

import { useState, useRef, useEffect } from 'react'
import Link from 'next/link'
import Navbar from '@/components/Navbar'
import Buscador from '@/components/Buscador'
import BotonFavorito from '@/components/BotonFavorito'
import dynamic from 'next/dynamic'

// Leaflet no soporta SSR — lo cargamos solo en el cliente
const MapaHome = dynamic(() => import('@/components/MapaHome'), {
  ssr: false,
  loading: () => (
    <div className="bg-[#ECEAE3] rounded-2xl h-[320px] md:h-[400px] flex items-center justify-center">
      <span className="text-[#0a0a0a]/15 text-sm font-light">Cargando mapa...</span>
    </div>
  ),
})

// ═══════════════════════════════════════════════════════════
// CONFIGURACIÓN
// ═══════════════════════════════════════════════════════════

const MENU_CATEGORIAS = [
  'moda',
  'belleza-y-cuidado-personal',
  'gastronomia',
  'hogar-deco-y-jardin',
  'diseno-y-artesanias',
  'tecnologia',
  'salud-y-bienestar',
  'arte-e-ilustracion',
]

const VALORES = [
  { tipo: 'imagen', src: '/images/foto-valores-3.jpg' },
  { tipo: 'texto', titulo: 'Local', descripcion: 'Apoyar a quienes están haciendo cosas valiosas y ofrecen una alternativa de compra real y en tu ciudad.' },
  { tipo: 'imagen', src: '/images/foto-valores-2.jpg' },
  { tipo: 'texto', titulo: 'Humanos', descripcion: 'Conectá con quienes venden productos únicos, preparados con dedicación y cerca tuyo.' },
  { tipo: 'imagen', src: '/images/foto-valores-1.jpg' },
  { tipo: 'texto', titulo: 'Transparente', descripcion: 'Detrás de cada producto hay una historia.' },
  { tipo: 'imagen', src: '/images/foto-valores-4.jpg' },
  { tipo: 'texto', titulo: 'Accesible', descripcion: 'Sin locales caros, sin intermediarios.' },
]

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

export default function HomeContent({ categorias, recientes, elegidos, vendedoresMapa = [] }) {
  const [menuOpen, setMenuOpen] = useState(false)

  const menuCats = MENU_CATEGORIAS
    .map(slug => categorias.find(c => c.slug === slug))
    .filter(Boolean)

  useEffect(() => {
    if (menuOpen) {
      document.body.style.overflow = 'hidden'
    } else {
      document.body.style.overflow = ''
    }
    return () => { document.body.style.overflow = '' }
  }, [menuOpen])

  return (
    <>
      {/* Inter font — todos los pesos */}
      <link
        rel="stylesheet"
        href="https://fonts.googleapis.com/css2?family=Inter:wght@200;300;400;500;600;700;800;900&display=swap"
      />

      <div className="min-h-screen bg-[#F5F2EC]" style={{ fontFamily: "'Inter', sans-serif" }}>

        {menuOpen && (
          <MenuTakeover
            categorias={menuCats}
            onClose={() => setMenuOpen(false)}
          />
        )}

        <Navbar onToggleMenu={() => setMenuOpen(!menuOpen)} />

        <main className="flex-1 min-w-0">

          {/* ═══ HERO ═══ */}
          <section className="relative h-screen overflow-hidden">
            <div
              className="absolute inset-0 bg-cover bg-center"
              style={{ backgroundImage: "url('/images/herohome.jpg')" }}
            />
            <div className="absolute inset-0 bg-black/50" />

            <div className="relative z-10 flex flex-col items-center justify-center h-full px-6 text-center">
              <h1 className="text-white text-4xl md:text-6xl font-black tracking-tight leading-[1.05]">
                Lo que buscás
                <br />
                está en tu ciudad.
              </h1>
              <p className="text-white/40 text-sm md:text-base font-light mt-4 tracking-wide">
                Marketplace local de Bahía Blanca
              </p>

              <div className="mt-8 w-full max-w-md mx-auto">
                <Buscador
                  placeholder="Buscá productos, tiendas..."
                  mostrarFlecha
                />
              </div>

              <div className="absolute bottom-8 animate-bounce">
                <svg className="w-6 h-6 text-white/30" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="m19.5 8.25-7.5 7.5-7.5-7.5" />
                </svg>
              </div>
            </div>
          </section>


          {/* ═══ MAPA ═══ */}
          <MapaSection vendedores={vendedoresMapa} />


          {/* ═══ VALORES ═══ */}
          <ValoresCarrusel />


          {/* ═══ RECIÉN LLEGADOS ═══ */}
          <RecienLlegados productos={recientes} />


          {/* ═══ CTA ANIMADO ═══ */}
          <CtaAnimado />


          {/* ═══ ELEGIDOS ═══ */}
          {elegidos.length > 0 && (
            <section className="pt-10 pb-10 md:pt-12 md:pb-12 px-4 md:px-8">
              <div className="max-w-6xl mx-auto">
                <h2 className="text-xl md:text-2xl font-black text-[#0a0a0a] tracking-tight">
                  Elegidos de la semana
                </h2>
                <div className="columns-2 md:columns-3 gap-4 space-y-4 mt-6">
                  {elegidos.map((prod, i) => {
                    const zigzag = ['tall', 'short', 'short', 'tall', 'tall', 'short']
                    const imageUrl = getImageUrl(prod.media)
                    return (
                      <div key={prod.id} className="break-inside-avoid relative">
                        <Link href={`/producto/${prod.id}`} className="block group">
                          <div
                            className={`bg-[#ECEAE3] rounded-xl overflow-hidden flex items-center justify-center ${
                              zigzag[i % 6] === 'tall' ? 'aspect-[3/4]' : 'aspect-square'
                            }`}
                          >
                            {imageUrl ? (
                              <img src={imageUrl} alt={prod.nombre} className="w-full h-full object-cover" />
                            ) : (
                              <span className="text-[#0a0a0a]/20 text-xs font-light">foto</span>
                            )}
                          </div>
                          <div className="px-0.5 mt-2">
                            <p className="text-sm font-medium text-[#0a0a0a] group-hover:text-[#0a0a0a]/50 transition">{prod.nombre}</p>
                            <p className="text-xs text-[#0a0a0a]/30 font-light">{prod.vendedor?.nombre_negocio}</p>
                            <p className="text-sm font-semibold text-[#0a0a0a] mt-1">
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
              </div>
            </section>
          )}


          {/* ═══ COLECCIÓN CURADA ═══ */}
          <ColeccionCurada coleccion={COLECCION} />


          {/* ═══ CTA FINAL ═══ */}
          <section className="bg-[#0a0a0a] text-white py-20 md:py-28 px-4 md:px-8">
            <div className="max-w-2xl mx-auto text-center">
              <h2 className="text-2xl md:text-4xl font-black tracking-tight mb-4">
                ¿Querés vender en Bahía Shops?
              </h2>
              <p className="text-white/40 text-base md:text-lg mb-8 leading-relaxed font-light">
                Sin locales caros, sin intermediarios. Registrá tu emprendimiento,
                subí tus productos y empezá a vender hoy.
              </p>
              <Link
                href="/vendedor/registro"
                className="inline-block bg-[#e60000] text-white px-8 py-3.5 rounded-full text-sm font-medium hover:bg-[#cc0000] transition"
              >
                Empezá a vender
              </Link>
            </div>
          </section>


          {/* ── Footer — pb-20 para que el buscador flotante no tape ── */}
          <footer className="bg-[#0a0a0a] text-white/25 text-xs py-8 pb-20 lg:pb-8 px-6">
            <div className="max-w-5xl mx-auto flex flex-col md:flex-row justify-between items-center gap-4">
              <div className="font-light">© 2026 Bahía Shops — Bahía Blanca, Argentina</div>
              <div className="flex gap-6 font-light">
                <a href="/privacidad" className="hover:text-white/60 transition">Privacidad</a>
                <a href="/terminos" className="hover:text-white/60 transition">Términos</a>
                <a href="https://instagram.com/bahiashops" target="_blank" rel="noopener noreferrer" className="hover:text-white/60 transition">Instagram</a>
                <a href="https://tiktok.com/@bahiashops" target="_blank" rel="noopener noreferrer" className="hover:text-white/60 transition">TikTok</a>
              </div>
            </div>
          </footer>

        </main>
      </div>
    </>
  )
}


// ═══════════════════════════════════════════════════════════
// MENÚ FULL-SCREEN TAKEOVER
// ═══════════════════════════════════════════════════════════

function MenuTakeover({ categorias, onClose }) {
  return (
    <div className="fixed inset-0 z-[60] bg-[#E5DFD3] flex flex-col" style={{ fontFamily: "'Inter', sans-serif" }}>
      <div className="flex justify-between items-center px-6 md:px-10 pt-6">
        <span className="text-xs font-extrabold tracking-[3px] uppercase text-[#0a0a0a]">
          Bahía Shops
        </span>
        <button
          onClick={onClose}
          className="text-xs font-light text-[#0a0a0a]/40 flex items-center gap-2 cursor-pointer hover:text-[#0a0a0a] transition"
        >
          Cerrar
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M6 18 18 6M6 6l12 12" />
          </svg>
        </button>
      </div>

      <div className="flex-1 flex flex-col justify-center px-8 md:px-16 gap-1 md:gap-2 overflow-y-auto">
        {categorias.map((cat) => (
          <Link
            key={cat.slug}
            href={`/categoria/${cat.slug}`}
            onClick={onClose}
            className="text-2xl md:text-4xl font-extralight text-[#0a0a0a] tracking-tight leading-snug hover:text-[#0a0a0a]/30 transition-colors"
          >
            {cat.nombre}
          </Link>
        ))}
        <Link
          href="/sobre-nosotros"
          onClick={onClose}
          className="text-2xl md:text-4xl font-extralight text-[#0a0a0a]/25 tracking-tight leading-snug hover:text-[#0a0a0a] transition-colors mt-2"
        >
          Ver todas →
        </Link>
      </div>

      <div className="flex justify-between items-end px-6 md:px-10 pb-6">
        <div className="flex gap-4 text-[10px] font-light text-[#0a0a0a]/30 tracking-wide">
          <a href="https://instagram.com/bahiashops" target="_blank" rel="noopener noreferrer" className="hover:text-[#0a0a0a] transition">Instagram</a>
          <a href="https://tiktok.com/@bahiashops" target="_blank" rel="noopener noreferrer" className="hover:text-[#0a0a0a] transition">TikTok</a>
          <a href="https://facebook.com/bahiashops" target="_blank" rel="noopener noreferrer" className="hover:text-[#0a0a0a] transition">Facebook</a>
        </div>
        <span className="text-[10px] font-light text-[#0a0a0a]/30 tracking-wide">
          bahiashops.com.ar
        </span>
      </div>
    </div>
  )
}


// ═══════════════════════════════════════════════════════════
// SECCIÓN MAPA
// ═══════════════════════════════════════════════════════════

function MapaSection({ vendedores = [] }) {
  return (
    <section className="py-12 md:py-20 px-4 md:px-8">
      <div className="max-w-5xl mx-auto">
        {/* Label alineado a la izquierda */}
        <p className="text-[9px] font-medium tracking-[3px] uppercase text-[#0a0a0a]/25 mb-4">
          Cerca tuyo
        </p>

        {/* Título y subtítulo centrados */}
        <div className="text-center">
          <h2 className="text-3xl md:text-5xl font-black text-[#0a0a0a] tracking-tight leading-[1.05] mb-3">
            Encontrá quién vende
            <br />
            en tu barrio.
          </h2>
          <p className="text-sm md:text-base font-light text-[#0a0a0a]/40 leading-relaxed max-w-lg mx-auto mb-8">
            Cada punto es un vendedor real de Bahía Blanca. Algunos tienen local
            a la calle, otros trabajan desde sus casas — pero todos están en tu ciudad.
          </p>
        </div>

        {/* Mapa real con Leaflet */}
        <MapaHome vendedores={vendedores} />

        {/* Leyenda */}
        <div className="flex gap-5 mt-4 justify-center">
          <div className="flex items-center gap-2">
            <div className="w-[8px] h-[8px] rounded-full bg-[#e60000] shrink-0" />
            <span className="text-[11px] font-light text-[#0a0a0a]/35">Local con dirección</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-[8px] h-[8px] rounded-full bg-[#9cc3ea] shrink-0" />
            <span className="text-[11px] font-light text-[#0a0a0a]/35">Trabaja desde casa</span>
          </div>
        </div>

        {/* CTA */}
        <div className="mt-8 text-center">
          <Link
            href="/vendedor/registro"
            className="inline-block bg-[#0a0a0a] text-[#F5F2EC] px-7 py-3 rounded-full text-sm font-medium hover:bg-[#2a2a2a] transition"
          >
            Sumar mi negocio
          </Link>
        </div>
      </div>
    </section>
  )
}


// ═══════════════════════════════════════════════════════════
// CTA ANIMADO
// ═══════════════════════════════════════════════════════════

function CtaAnimado() {
  const sectionRef = useRef(null)
  const [visible, setVisible] = useState(false)
  const [counts, setCounts] = useState({ vendedores: 0, productos: 0, barrios: 0 })
  const hasAnimated = useRef(false)

  useEffect(() => {
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting && !hasAnimated.current) {
          hasAnimated.current = true
          setVisible(true)
          animateCount('vendedores', 11, 1200)
          animateCount('productos', 48, 1400)
          animateCount('barrios', 6, 800)
        }
      },
      { threshold: 0.3 }
    )

    if (sectionRef.current) observer.observe(sectionRef.current)
    return () => observer.disconnect()
  }, [])

  function animateCount(key, target, duration) {
    const start = Date.now()
    function step() {
      const elapsed = Date.now() - start
      const progress = Math.min(elapsed / duration, 1)
      const eased = 1 - Math.pow(1 - progress, 3)
      setCounts(prev => ({ ...prev, [key]: Math.round(eased * target) }))
      if (progress < 1) requestAnimationFrame(step)
    }
    requestAnimationFrame(step)
  }

  const words = ['¿Tenés', 'un', 'emprendimiento?']

  return (
    <section
      ref={sectionRef}
      className="py-20 md:py-28 px-4 md:px-8 text-center"
    >
      <div className="max-w-3xl mx-auto">
        <div className="text-3xl md:text-5xl font-black text-[#0a0a0a] tracking-tight leading-[1.1]">
          {words.map((word, i) => (
            <span
              key={i}
              className="inline-block transition-all duration-500"
              style={{
                opacity: visible ? 1 : 0,
                transform: visible ? 'translateY(0)' : 'translateY(16px)',
                transitionDelay: `${i * 120}ms`,
              }}
            >
              {word}{' '}
            </span>
          ))}
          <br />
          <span
            className="inline-block transition-all duration-500"
            style={{
              opacity: visible ? 1 : 0,
              transform: visible ? 'translateY(0)' : 'translateY(16px)',
              transitionDelay: `${words.length * 120}ms`,
            }}
          >
            Sumate.
          </span>
        </div>

        <p
          className="text-sm md:text-base font-light text-[#0a0a0a]/40 mt-5 leading-relaxed transition-all duration-500"
          style={{
            opacity: visible ? 1 : 0,
            transform: visible ? 'translateY(0)' : 'translateY(12px)',
            transitionDelay: '600ms',
          }}
        >
          <Link href="/vendedor/registro" className="text-[#0a0a0a] font-medium underline underline-offset-2">
            Registrá tu negocio
          </Link>
          , subí tus productos y empezá a vender. Así de simple.
        </p>

        <div
          className="mt-7 transition-all duration-500"
          style={{
            opacity: visible ? 1 : 0,
            transform: visible ? 'translateY(0)' : 'translateY(12px)',
            transitionDelay: '750ms',
          }}
        >
          <Link
            href="/vendedor/registro"
            className="inline-block bg-[#e60000] text-white px-7 py-3 rounded-full text-sm font-medium hover:bg-[#cc0000] transition"
          >
            Empezar a vender
          </Link>
        </div>

        <div
          className="flex justify-center gap-12 md:gap-16 mt-12 transition-all duration-500"
          style={{
            opacity: visible ? 1 : 0,
            transitionDelay: '900ms',
          }}
        >
          <div className="text-center">
            <div className="text-3xl md:text-4xl font-black text-[#0a0a0a] tracking-tight">
              {counts.vendedores}
            </div>
            <div className="text-[10px] font-light text-[#0a0a0a]/30 mt-1 tracking-wide">
              vendedores
            </div>
          </div>
          <div className="text-center">
            <div className="text-3xl md:text-4xl font-black text-[#0a0a0a] tracking-tight">
              {counts.productos}
            </div>
            <div className="text-[10px] font-light text-[#0a0a0a]/30 mt-1 tracking-wide">
              productos
            </div>
          </div>
          <div className="text-center">
            <div className="text-3xl md:text-4xl font-black text-[#0a0a0a] tracking-tight">
              {counts.barrios}
            </div>
            <div className="text-[10px] font-light text-[#0a0a0a]/30 mt-1 tracking-wide">
              barrios
            </div>
          </div>
        </div>
      </div>
    </section>
  )
}


// ═══════════════════════════════════════════════════════════
// SUBCOMPONENTES
// ═══════════════════════════════════════════════════════════

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
    <section className="pt-8 pb-6 md:pt-10 md:pb-8 px-4 md:px-8">
      <div className="max-w-6xl mx-auto">
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-xl md:text-2xl font-black text-[#0a0a0a] tracking-tight">
            Recién llegados
          </h2>
          {productos.length > 3 && (
            <div className="flex gap-2">
              <button
                onClick={() => scroll(-1)}
                className={`w-7 h-7 flex items-center justify-center cursor-pointer transition-all bg-[#0a0a0a] rounded-full ${canScrollLeft ? 'opacity-100' : 'opacity-0 pointer-events-none'}`}
                aria-label="Anterior"
              >
                <svg className="w-4 h-4 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 19.5 8.25 12l7.5-7.5" />
                </svg>
              </button>
              <button
                onClick={() => scroll(1)}
                className={`w-7 h-7 flex items-center justify-center cursor-pointer transition-all bg-[#0a0a0a] rounded-full ${canScrollRight ? 'opacity-100' : 'opacity-0 pointer-events-none'}`}
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
          {productos.map((prod) => {
            const imageUrl = getImageUrl(prod.media)
            return (
              <div key={prod.id} className="shrink-0 w-48 md:w-56 snap-start relative">
                <Link href={`/producto/${prod.id}`} className="block group">
                  <div className="aspect-square bg-[#ECEAE3] rounded-xl overflow-hidden flex items-center justify-center">
                    {imageUrl ? (
                      <img src={imageUrl} alt={prod.nombre} className="w-full h-full object-cover" />
                    ) : (
                      <span className="text-[#0a0a0a]/20 text-xs font-light">foto</span>
                    )}
                  </div>
                  <div className="mt-2.5">
                    <p className="text-sm font-medium text-[#0a0a0a] group-hover:text-[#0a0a0a]/50 transition truncate">{prod.nombre}</p>
                    <p className="text-xs text-[#0a0a0a]/30 mt-0.5 font-light">{prod.vendedor?.nombre_negocio}</p>
                    <p className="text-sm font-semibold text-[#0a0a0a] mt-1">
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

          {productos.length < 4 && (
            <Link href="/vendedor/registro" className="shrink-0 w-48 md:w-56 snap-start">
              <div className="aspect-square bg-white rounded-xl overflow-hidden flex flex-col items-center justify-center border-2 border-dashed border-[#0a0a0a]/10 hover:border-[#0a0a0a]/30 transition group p-4">
                <svg className="w-8 h-8 text-[#0a0a0a]/15 group-hover:text-[#0a0a0a]/40 transition mb-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M13.5 21v-7.5a.75.75 0 0 1 .75-.75h3a.75.75 0 0 1 .75.75V21m-4.5 0H2.36m11.14 0H18m0 0h3.64m-1.39 0V9.349M3.75 21V9.349m0 0a3.001 3.001 0 0 0 3.75-.615A2.993 2.993 0 0 0 9.75 9.75c.896 0 1.7-.393 2.25-1.016a2.993 2.993 0 0 0 2.25 1.016c.896 0 1.7-.393 2.25-1.015a3.001 3.001 0 0 0 3.75.614m-16.5 0a3.004 3.004 0 0 1-.621-4.72l1.189-1.19A1.5 1.5 0 0 1 5.378 3h13.243a1.5 1.5 0 0 1 1.06.44l1.19 1.189a3 3 0 0 1-.621 4.72M6.75 18h3.75a.75.75 0 0 0 .75-.75V13.5a.75.75 0 0 0-.75-.75H6.75a.75.75 0 0 0-.75.75v3.75c0 .414.336.75.75.75Z" />
                </svg>
                <p className="text-sm font-medium text-[#0a0a0a]/25 group-hover:text-[#0a0a0a]/50 transition text-center">
                  ¿Vendés en Bahía?
                </p>
                <p className="text-xs text-[#0a0a0a]/15 mt-1 text-center font-light">
                  Sumá tus productos
                </p>
              </div>
            </Link>
          )}
        </div>
      </div>
    </section>
  )
}


function ColeccionCurada({ coleccion }) {
  const scrollRef = useRef(null)

  function scroll(direction) {
    scrollRef.current?.scrollBy({ left: direction * 260, behavior: 'smooth' })
  }

  return (
    <section
      className="rounded-2xl mx-4 md:mx-8 py-10 md:py-8 px-6 md:px-10 mb-8 overflow-hidden"
      style={{ backgroundColor: coleccion.color, color: '#000' }}
    >
      <div className="flex items-center justify-between mb-2">
        <div>
          <h2 className="text-xl md:text-2xl font-black tracking-tight">{coleccion.titulo}</h2>
          <p className="text-sm opacity-50 mt-1 font-light">{coleccion.descripcion}</p>
        </div>
        <div className="hidden md:flex gap-2">
          <button
            onClick={() => scroll(-1)}
            className="w-9 h-9 rounded-full bg-black/10 hover:bg-black/20 flex items-center justify-center transition cursor-pointer"
            aria-label="Anterior"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 19.5 8.25 12l7.5-7.5" />
            </svg>
          </button>
          <button
            onClick={() => scroll(1)}
            className="w-9 h-9 rounded-full bg-black/10 hover:bg-black/20 flex items-center justify-center transition cursor-pointer"
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
        className="flex gap-4 overflow-x-auto mt-6 pb-2 snap-x snap-mandatory"
        style={{ scrollbarWidth: 'none', msOverflowStyle: 'none' }}
      >
        {coleccion.productos.map((prod) => (
          <Link
            key={prod.id}
            href={`/producto/${prod.id}`}
            className="shrink-0 w-48 md:w-56 snap-start group"
          >
            <div className="aspect-square bg-white/30 rounded-xl overflow-hidden flex items-center justify-center">
              <span className="opacity-30 text-xs font-light">foto</span>
            </div>
            <div className="mt-2.5">
              <p className="text-sm font-medium group-hover:opacity-70 transition truncate">{prod.nombre}</p>
              <p className="text-xs opacity-40 mt-0.5 font-light">{prod.vendedor}</p>
              <p className="text-sm font-semibold mt-1">${prod.precio.toLocaleString('es-AR')}</p>
            </div>
          </Link>
        ))}
      </div>
    </section>
  )
}


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
    <section className="py-6 md:py-10 px-4 md:px-8">
      <div className="max-w-6xl mx-auto">
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-xl md:text-2xl font-black text-[#0a0a0a] tracking-tight">
            Lo que nos mueve
          </h2>
          <div className="flex gap-2">
            <button
              onClick={() => scroll(-1)}
              className={`w-7 h-7 flex items-center justify-center cursor-pointer transition-all bg-[#0a0a0a] rounded-full ${canScrollLeft ? 'opacity-100' : 'opacity-0 pointer-events-none'}`}
              aria-label="Anterior"
            >
              <svg className="w-4 h-4 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 19.5 8.25 12l7.5-7.5" />
              </svg>
            </button>
            <button
              onClick={() => scroll(1)}
              className={`w-7 h-7 flex items-center justify-center cursor-pointer transition-all bg-[#0a0a0a] rounded-full ${canScrollRight ? 'opacity-100' : 'opacity-0 pointer-events-none'}`}
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
                className="shrink-0 w-60 md:w-72 bg-white rounded-xl p-6 snap-start"
              >
                <h3 className="text-lg font-black text-[#0a0a0a] mb-2 tracking-tight">{item.titulo}</h3>
                <p className="text-sm text-[#0a0a0a]/40 leading-relaxed font-light">{item.descripcion}</p>
              </div>
            ) : (
              <div
                key={i}
                className="shrink-0 w-44 md:w-56 rounded-xl overflow-hidden snap-start bg-[#ECEAE3]"
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
      </div>
    </section>
  )
}
