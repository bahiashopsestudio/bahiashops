'use client'

import { useState, useRef, useEffect } from 'react'
import Link from 'next/link'
import { useCarrito } from '@/context/CarritoContext'
import Navbar from '@/components/Navbar'
import BotonFavorito from '@/components/BotonFavorito'
import MenuTakeover from '@/components/MenuTakeover'
import ProductosDestacados from '@/components/ProductosDestacados'
import MapaDestacado from '@/components/MapaDestacado'
import BarraScrollCustom from '@/components/BarraScrollCustom'
import SomosBahia from '@/components/SomosBahia'
import ValoresCompra from '@/components/ValoresCompra'
import ColeccionesDestacadas from '@/components/ColeccionesDestacadas'
import { useDragScroll } from '@/hooks/useDragScroll'


// ═══════════════════════════════════════════════════════════
// CONFIGURACIÓN
// ═══════════════════════════════════════════════════════════

const MENU_CATEGORIAS = [
  'moda',
  'belleza-y-bienestar',
  'joyeria-y-accesorios',
  'hogar-y-deco',
  'artes-y-oficios',
  'bebes-y-maternidad',
  'juegos-y-juguetes',
  'mascotas',
  'libros',
  'deporte',
  'vintage',
]

const VALORES = [
  { tipo: 'imagen', src: '/images/foto-valores-3.jpg' },
  { tipo: 'texto', titulo: 'Local', descripcion: 'Creemos en lo que pasa cerca. En los emprendimientos que nacen en Bahía, en quienes producen, crean y venden desde acá. Creemos en la posibilidad de descubrir todo eso sin tener que pensar en encontrarlo lejos.' },
  { tipo: 'imagen', src: '/images/foto-valores-2.jpg' },
  { tipo: 'texto', titulo: 'Cercanía', descripcion: 'Creamos un espacio para acercar personas, emprendimientos y productos. Porque detrás de cada tienda, de cada emprendimiento, hay alguien con una idea, un proyecto y algo propio para ofrecer.' },
  { tipo: 'imagen', src: '/images/foto-valores-1.jpg' },
  { tipo: 'texto', titulo: 'Simpleza', descripcion: 'Comprar de forma local no debería ser complicado. Queremos hacer más fácil encontrar, conocer y elegir productos de emprendimientos de la ciudad, desde un mismo lugar.' },
  { tipo: 'imagen', src: '/images/foto-valores-4.jpg' },
  { tipo: 'texto', titulo: 'Comunidad', descripcion: 'Bahía Shops crece cuando crecen sus tiendas. Buscamos construir una red que visibilice el trabajo local, genere nuevas oportunidades y fortalezca el ecosistema emprendedor de Bahía Blanca.' },
]

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

export default function HomeContent({ categorias, recientes, elegidos, vendedoresMapa = [], destacados = [], colecciones = [] }) {
  const [menuOpen, setMenuOpen] = useState(false)
  const { agregar } = useCarrito()

  const menuCats = MENU_CATEGORIAS
    .map(slug => categorias.find(c => c.slug === slug))
    .filter(Boolean)

  function agregarElegidoAlCarrito(prod) {
    agregar(
      {
        productoId: prod.id,
        nombre: prod.nombre,
        precio: Number(prod.precio),
        foto: getImageUrl(prod.media),
        variante: null,
        cantidad: 1,
      },
      {
        id: prod.vendedor?.id,
        nombre: prod.vendedor?.nombre_negocio || 'Local',
      }
    )
  }

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
      <link
        rel="stylesheet"
        href="https://fonts.googleapis.com/css2?family=Inter:wght@200;300;400;500;600;700;800;900&display=swap"
      />
      <link
        rel="stylesheet"
        href="https://fonts.googleapis.com/css2?family=Fraunces:opsz,wght@9..144,100..900&family=Poppins:wght@300;400;500&display=swap"
      />

      <div className="min-h-screen bg-[#faf9f7]" style={{ fontFamily: "'Inter', sans-serif" }}>

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
            <video
              autoPlay
              muted
              loop
              playsInline
              className="absolute inset-0 w-full h-full object-cover"
              src="/images/hero-bahia-shops.mp4"
            />
            <div
              className="absolute inset-0"
              style={{
                background:
                  'linear-gradient(to right, rgba(0,0,0,0.45) 0%, rgba(0,0,0,0.25) 50%, rgba(0,0,0,0.05) 100%)',
              }}
            />
            <div
              className="relative z-10 h-full flex flex-col justify-center items-start max-w-[480px] md:max-w-[580px] py-14 px-5 md:px-12"
            >
              <h1
                className="text-[28px] md:text-[42px]"
                style={{
                  fontFamily: 'Fraunces, serif',
                  fontWeight: 500,
                  color: '#fff',
                  letterSpacing: '-0.02em',
                  lineHeight: 1.12,
                  marginBottom: '16px',
                }}
              >
                Lo que buscás{' '}
                <br />
                ya está en nuestra ciudad
              </h1>

              <p
                style={{
                  fontFamily: 'Poppins, sans-serif',
                  fontWeight: 300,
                  fontSize: '15px',
                  color: 'rgba(255,255,255,0.9)',
                  lineHeight: 1.6,
                  maxWidth: '390px',
                  marginBottom: '12px',
                }}
              >
                Bahía Blanca está lleno de proyectos y personas por conocer.
              </p>

              <p
                style={{
                  fontFamily: 'Poppins, sans-serif',
                  fontWeight: 300,
                  fontSize: '15px',
                  color: 'rgba(255,255,255,0.9)',
                  lineHeight: 1.6,
                  maxWidth: '390px',
                  marginBottom: '28px',
                }}
              >
                ¡Bienvenidos a Bahía Shops! Un espacio para descubrir, comprar y conectar con negocios de nuestra ciudad.
              </p>

              <Link
                href="/vendedor/nuevo"
                className="inline-block"
                style={{
                  fontFamily: 'Inter, sans-serif',
                  fontWeight: 500,
                  fontSize: '14px',
                  background: '#fff',
                  color: '#0a0a0a',
                  padding: '14px 28px',
                  borderRadius: '4px',
                  marginBottom: '20px',
                }}
              >
                ¡Registrate gratis para vender!
              </Link>

              <p
                className="md:whitespace-nowrap"
                style={{
                  fontFamily: 'Inter, sans-serif',
                  fontWeight: 300,
                  fontSize: '13px',
                  color: 'rgba(255,255,255,0.7)',
                }}
              >
                ¿Querés encontrar productos en Bahía?{' '}
                <Link
                  href="/registro"
                  style={{
                    fontFamily: 'Inter, sans-serif',
                    fontWeight: 400,
                    color: 'rgba(255,255,255,0.85)',
                    textDecoration: 'underline',
                    textUnderlineOffset: '3px',
                  }}
                >
                  Registrate para comprar
                </Link>
              </p>
            </div>
          </section>


          {/* ═══ RECIÉN LLEGADOS ═══ */}
          <RecienLlegados productos={recientes} />


          {/* ═══ MAPA ═══ */}
          <MapaDestacado vendedores={vendedoresMapa} />


          {/* ═══ VALORES ═══ */}
          <ValoresCarrusel />


          {/* ═══ CTA VENDER ═══ */}
          <CtaVender />


          {/* ═══ PRODUCTOS DESTACADOS ═══ */}
          <ProductosDestacados categorias={categorias} productos={destacados} />


          {/* ═══ COLECCIONES ═══ */}
          <ColeccionesDestacadas colecciones={colecciones} />


          {/* ═══ SOMOS BAHÍA ═══ */}
          <SomosBahia />


          {/* ═══ ELEGIDOS ═══ */}
          {elegidos.length > 0 && (
            <section className="pt-10 pb-10 md:pt-12 md:pb-12 px-4 md:px-8">
              <div className="max-w-6xl mx-auto">
                <h2
                  style={{
                    fontFamily: 'Fraunces, serif',
                    fontWeight: 500,
                    fontSize: '28px',
                    color: '#0a0a0a',
                    letterSpacing: '-0.02em',
                  }}
                >
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
                            <p
                              className="whitespace-nowrap overflow-hidden text-ellipsis"
                              style={{ fontFamily: "'Inter', sans-serif", fontWeight: 400, fontSize: '13.5px', color: '#0a0a0a' }}
                            >
                              {prod.nombre}
                            </p>
                            <p
                              style={{ fontFamily: "'Inter', sans-serif", fontWeight: 300, fontSize: '12px', color: '#aaa', marginTop: '2px' }}
                            >
                              {prod.barrioNombre || ''}
                            </p>
                            <p
                              style={{ fontFamily: "'Inter', sans-serif", fontWeight: 500, fontSize: '14px', color: '#0a0a0a', marginTop: '4px' }}
                            >
                              ${Number(prod.precio).toLocaleString('es-AR')}
                            </p>
                          </div>
                        </Link>
                        <button
                          type="button"
                          onClick={() => agregarElegidoAlCarrito(prod)}
                          className="w-full bg-[#0a0a0a] text-white border border-[#0a0a0a] hover:bg-transparent hover:text-[#0a0a0a] transition-colors cursor-pointer"
                          style={{
                            fontFamily: "'Inter', sans-serif",
                            fontSize: '12px',
                            fontWeight: 500,
                            borderRadius: '4px',
                            padding: '8px 16px',
                            marginTop: '10px',
                          }}
                        >
                          Agregar al carrito
                        </button>
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


          {/* ═══ VALORES DE COMPRA ═══ */}
          <ValoresCompra />
        </main>
      </div>
    </>
  )
}


// ═══════════════════════════════════════════════════════════
// CTA ANIMADO
// ═══════════════════════════════════════════════════════════

function CtaVender() {
  return (
    <section style={{ background: '#41252a', padding: '48px 24px' }}>
      <div
        className="max-w-7xl mx-auto grid grid-cols-1 lg:grid-cols-[1fr_1.3fr_1fr] items-center"
        style={{ gap: '40px' }}
      >
        <div className="hidden lg:block" style={{ aspectRatio: '3 / 4', overflow: 'hidden' }}>
          <img
            src="/images/male-producer-his-shop-with-different-goodies.jpg"
            alt=""
            className="w-full h-full object-cover"
          />
        </div>

        <div className="text-center">
          <h2
            className="text-[26px] md:text-[34px]"
            style={{
              fontFamily: 'Fraunces, serif',
              fontWeight: 500,
              color: '#ffffff',
              letterSpacing: '-0.02em',
              lineHeight: 1.2,
              marginBottom: '16px',
            }}
          >
            Para cualquier proyecto en la ciudad
          </h2>

          <p
            className="mx-auto"
            style={{
              fontFamily: 'Poppins, sans-serif',
              fontWeight: 300,
              fontSize: '14px',
              color: 'rgba(255,255,255,0.85)',
              lineHeight: 1.65,
              maxWidth: '400px',
              marginBottom: '28px',
            }}
          >
            No importa si vendés ropa o artículos para mascotas: en Bahía Shops mostramos todos
            los productos que nuestros vecinos necesitan cerca suyo.
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
            Sumate gratis para vender
          </Link>
        </div>

        <div className="hidden lg:block" style={{ aspectRatio: '3 / 4', overflow: 'hidden' }}>
          <img
            src="/images/woman-looking-different-goodies-local-producer.jpg"
            alt=""
            className="w-full h-full object-cover"
          />
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

  return (
    <section className="pt-8 pb-6 md:pt-10 md:pb-8 px-4 md:px-8">
      <div className="max-w-6xl mx-auto">
        <h2
          style={{
            fontFamily: 'Fraunces, serif',
            fontWeight: 500,
            fontSize: '28px',
            color: '#0a0a0a',
            letterSpacing: '-0.02em',
            marginBottom: '8px',
          }}
        >
          Recién llegados
        </h2>
        <p
          style={{
            fontFamily: 'Poppins, sans-serif',
            fontWeight: 300,
            fontSize: '14px',
            color: '#888',
            marginBottom: '24px',
          }}
        >
          Nuevos productos, nuevos emprendimientos y mucho para descubrir. ¡Bienvenidos!
        </p>

        <div
          ref={scrollRef}
          className="no-scrollbar flex gap-4 overflow-x-auto pb-4 snap-x snap-mandatory"
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
                    <p
                      className="whitespace-nowrap overflow-hidden text-ellipsis"
                      style={{ fontFamily: "'Inter', sans-serif", fontWeight: 400, fontSize: '13.5px', color: '#0a0a0a' }}
                    >
                      {prod.nombre}
                    </p>
                    <p
                      style={{ fontFamily: "'Inter', sans-serif", fontWeight: 300, fontSize: '12px', color: '#aaa', marginTop: '2px' }}
                    >
                      {prod.vendedor?.nombre_negocio}
                    </p>
                    <p
                      style={{ fontFamily: "'Inter', sans-serif", fontWeight: 500, fontSize: '14px', color: '#0a0a0a', marginTop: '4px' }}
                    >
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
            <Link href="/vendedor/nuevo" className="shrink-0 w-48 md:w-56 snap-start">
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

        <BarraScrollCustom scrollRef={scrollRef} deps={[productos.length]} style={{ marginTop: '20px' }} />
      </div>
    </section>
  )
}


function ValoresCarrusel() {
  const scrollRef = useRef(null)
  useDragScroll(scrollRef)

  return (
    <section className="py-5 md:py-7 px-4 md:px-8">
      <div className="max-w-6xl mx-auto">
        <h2
          style={{
            fontFamily: 'Fraunces, serif',
            fontWeight: 500,
            fontSize: '28px',
            color: '#0a0a0a',
            letterSpacing: '-0.02em',
            marginTop: '24px',
            marginBottom: '8px',
          }}
        >
          Lo que nos mueve
        </h2>
        <p
          style={{
            fontFamily: 'Poppins, sans-serif',
            fontWeight: 300,
            fontSize: '14px',
            color: '#888',
            marginBottom: '36px',
          }}
        >
          Buscamos conectar personas, impulsar emprendimientos y hacer crecer lo local.
        </p>

        <div
          ref={scrollRef}
          className="no-scrollbar flex gap-4 overflow-x-auto pb-4 snap-x snap-mandatory"
          style={{ scrollbarWidth: 'none', msOverflowStyle: 'none', cursor: 'grab' }}
        >
          {VALORES.map((item, i) =>
            item.tipo === 'texto' ? (
              <div
                key={i}
                className="shrink-0 w-60 md:w-72 bg-white rounded-xl p-6 snap-start"
              >
                <h3
                  style={{
                    fontFamily: 'Fraunces, serif',
                    fontWeight: 500,
                    fontSize: '18px',
                    color: '#0a0a0a',
                    letterSpacing: '-0.02em',
                    marginBottom: '8px',
                  }}
                >
                  {item.titulo}
                </h3>
                <p
                  style={{
                    fontFamily: 'Poppins, sans-serif',
                    fontWeight: 300,
                    fontSize: '13.5px',
                    color: '#888',
                    lineHeight: 1.65,
                  }}
                >
                  {item.descripcion}
                </p>
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

        <BarraScrollCustom scrollRef={scrollRef} style={{ marginTop: '20px' }} />
      </div>
    </section>
  )
}