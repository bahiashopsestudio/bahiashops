'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'
import Navbar from '@/components/Navbar'
import MenuTakeover from '@/components/MenuTakeover'

const MENU_CATEGORIAS = ['moda','belleza-y-bienestar','joyeria-y-accesorios','hogar-y-deco','artes-y-oficios','bebes-y-maternidad','juegos-y-juguetes','mascotas','libros','deporte','vintage']

function getFoto(media) {
  if (!media?.length) return null
  const principal = media.find((m) => m.es_principal)
  if (principal) return principal.url
  const sorted = [...media].sort((a, b) => a.orden - b.orden)
  return sorted[0]?.url || null
}

function oscurecer(hex, factor = 0.85) {
  const h = (hex || '#f1f29f').replace('#', '')
  const r = Math.round(parseInt(h.slice(0, 2), 16) * factor)
  const g = Math.round(parseInt(h.slice(2, 4), 16) * factor)
  const b = Math.round(parseInt(h.slice(4, 6), 16) * factor)
  return `rgb(${r},${g},${b})`
}

function PinIcon() {
  return (
    <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} style={{ flexShrink: 0 }}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M15 10.5a3 3 0 1 1-6 0 3 3 0 0 1 6 0Z" />
      <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 10.5c0 7.142-7.5 11.25-7.5 11.25S4.5 17.642 4.5 10.5a7.5 7.5 0 1 1 15 0Z" />
    </svg>
  )
}

function TarjetaProducto({ producto, barrioNombre }) {
  const foto = getFoto(producto.media)
  return (
    <Link
      href={`/producto/${producto.id}`}
      className="block group"
      style={{ transition: 'transform 200ms ease' }}
      onMouseEnter={(e) => { e.currentTarget.style.transform = 'translateY(-2px)' }}
      onMouseLeave={(e) => { e.currentTarget.style.transform = 'translateY(0)' }}
    >
      <div
        className="overflow-hidden"
        style={{ width: '100%', aspectRatio: '4 / 5', borderRadius: '6px', background: '#f0ede8' }}
      >
        {foto && (
          <img
            src={foto}
            alt={producto.nombre}
            className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
          />
        )}
      </div>
      <p style={{ fontFamily: "'Inter', sans-serif", fontWeight: 400, fontSize: '13px', color: '#0a0a0a', marginTop: '10px' }}>
        {producto.nombre}
      </p>
      {barrioNombre && (
        <p
          className="flex items-center"
          style={{ fontFamily: "'Inter', sans-serif", fontWeight: 300, fontSize: '11px', color: 'rgba(10,10,10,0.4)', marginTop: '3px', gap: '4px' }}
        >
          <PinIcon />
          {barrioNombre}
        </p>
      )}
      <p style={{ fontFamily: "'Inter', sans-serif", fontWeight: 400, fontSize: '14px', color: '#0a0a0a', marginTop: '4px' }}>
        ${Number(producto.precio).toLocaleString('es-AR')}
      </p>
    </Link>
  )
}

function BloqueDestacado({ tesoro, barrioNombre, invertido }) {
  const producto = tesoro.producto
  const foto = getFoto(producto.media)
  const colorFondo = tesoro.color_fondo || '#f1f29f'

  return (
    <div className="max-w-[1100px] mx-auto px-5 md:px-12" style={{ marginBottom: '32px' }}>
      <div
        className={`grid grid-cols-1 ${invertido ? 'lg:grid-cols-[1fr_1.1fr]' : 'lg:grid-cols-[1.1fr_1fr]'}`}
        style={{ borderRadius: '10px', overflow: 'hidden' }}
      >
        {/* Imagen */}
        <div
          className={invertido ? 'lg:order-2' : 'lg:order-1'}
          style={{
            minHeight: '240px',
            background: oscurecer(colorFondo),
          }}
        >
          {foto && (
            <img
              src={foto}
              alt={producto.nombre}
              style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block', minHeight: 'inherit' }}
              className="lg:min-h-[380px]"
            />
          )}
        </div>

        {/* Contenido */}
        <div
          className={`flex flex-col justify-center px-6 py-8 md:px-11 md:py-12 ${invertido ? 'lg:order-1' : 'lg:order-2'}`}
          style={{ backgroundColor: colorFondo }}
        >
          <p style={{ fontFamily: 'Fraunces, serif', fontWeight: 500, fontSize: '22px', color: '#0a0a0a', lineHeight: 1.3 }}>
            {producto.nombre}
          </p>
          {producto.vendedor && (
            <p style={{ fontFamily: "'Inter', sans-serif", fontWeight: 300, fontSize: '12px', color: 'rgba(10,10,10,0.45)', marginTop: '6px' }}>
              por {producto.vendedor.nombre_negocio}{barrioNombre ? ` · ${barrioNombre}` : ''}
            </p>
          )}
          <p style={{ fontFamily: "'Inter', sans-serif", fontWeight: 400, fontSize: '16px', color: '#0a0a0a', marginTop: '10px', marginBottom: '24px' }}>
            ${Number(producto.precio).toLocaleString('es-AR')}
          </p>

          {tesoro.quote && (
            <div style={{ borderLeft: '2px solid rgba(10,10,10,0.12)', paddingLeft: '18px', marginBottom: '24px' }}>
              <p style={{ fontFamily: 'Fraunces, serif', fontStyle: 'italic', fontWeight: 400, fontSize: '15px', color: 'rgba(10,10,10,0.6)', lineHeight: 1.55 }}>
                &ldquo;{tesoro.quote}&rdquo;
              </p>
              {tesoro.quote_autor && (
                <p style={{ fontFamily: "'Inter', sans-serif", fontWeight: 400, fontSize: '11px', color: 'rgba(10,10,10,0.35)', marginTop: '8px' }}>
                  — {tesoro.quote_autor}
                </p>
              )}
            </div>
          )}

          <Link
            href={`/producto/${producto.id}`}
            className="inline-flex items-center gap-2 self-start transition-colors"
            style={{
              fontFamily: "'Inter', sans-serif",
              fontSize: '12px',
              fontWeight: 400,
              color: '#ffffff',
              backgroundColor: '#0a0a0a',
              padding: '10px 20px',
              borderRadius: '4px',
            }}
            onMouseEnter={(e) => { e.currentTarget.style.backgroundColor = '#333' }}
            onMouseLeave={(e) => { e.currentTarget.style.backgroundColor = '#0a0a0a' }}
          >
            Ver producto →
          </Link>
        </div>
      </div>
    </div>
  )
}

export default function TesorosPage() {
  const [categorias, setCategorias] = useState([])
  const [menuOpen, setMenuOpen] = useState(false)
  const [tesoros, setTesoros] = useState([])
  const [barriosMap, setBarriosMap] = useState({})
  const [cargando, setCargando] = useState(true)

  const menuCats = MENU_CATEGORIAS.map((s) => categorias.find((c) => c.slug === s)).filter(Boolean)

  useEffect(() => {
    document.body.style.overflow = menuOpen ? 'hidden' : ''
    return () => { document.body.style.overflow = '' }
  }, [menuOpen])

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

    async function cargarBarrios() {
      const { data } = await supabase.from('barrios').select('id, nombre')
      if (data) {
        const mapa = {}
        data.forEach((b) => { mapa[b.id] = b.nombre })
        setBarriosMap(mapa)
      }
    }

    async function cargarTesoros() {
      try {
        const { data, error } = await supabase
          .from('tesoros')
          .select(`
            id, destacado, color_fondo, quote, quote_autor, orden,
            producto:productos (
              id, nombre, precio,
              vendedor:vendedores ( nombre_negocio, barrio_id ),
              media:producto_media ( url, es_principal, orden )
            )
          `)
          .eq('activo', true)
          .order('orden')

        if (!error && data) {
          setTesoros(data.filter((t) => t.producto))
        }
      } catch {
        // Tabla inexistente u otro error: la página muestra el estado vacío
      } finally {
        setCargando(false)
      }
    }

    cargarCategorias()
    cargarBarrios()
    cargarTesoros()
  }, [])

  const destacados = tesoros.filter((t) => t.destacado)
  const todos = tesoros

  const primerChunk = todos.slice(0, 8)
  const resto = todos.slice(8)
  const hayMas = todos.length > 8

  return (
    <>
      <link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Inter:wght@200;300;400;500;600;700;800;900&display=swap" />
      <link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Fraunces:opsz,wght@9..144,100..900&family=Poppins:wght@300;400;500&display=swap" />

      <div className="min-h-screen bg-[#faf9f7]" style={{ fontFamily: "'Inter', sans-serif" }}>
        {menuOpen && <MenuTakeover categorias={menuCats} onClose={() => setMenuOpen(false)} />}
        <Navbar onToggleMenu={() => setMenuOpen(!menuOpen)} variant="solid" />

        <div className="pt-20">
          {/* ── Header editorial ── */}
          <div className="max-w-[1100px] mx-auto px-5 pt-12 pb-8 md:px-12 md:pt-[72px] md:pb-12">
            <p style={{ fontFamily: "'Inter', sans-serif", fontSize: '10px', textTransform: 'uppercase', letterSpacing: '2px', color: 'rgba(10,10,10,0.3)', marginBottom: '14px' }}>
              Tesoros de Bahía
            </p>
            <h1 className="text-[28px] md:text-[38px]" style={{ fontFamily: 'Fraunces, serif', fontWeight: 500, color: '#0a0a0a', lineHeight: 1.2, maxWidth: '560px' }}>
              Lo más lindo que hacemos en esta ciudad
            </h1>
            <p style={{ fontFamily: 'Poppins, sans-serif', fontWeight: 300, fontSize: '15px', color: 'rgba(10,10,10,0.5)', lineHeight: 1.6, maxWidth: '480px', marginTop: '18px' }}>
              Una selección personal de objetos que nos emocionan. Elegidos uno por uno, hechos por gente de acá.
            </p>
          </div>

          {!cargando && todos.length === 0 && (
            <div className="flex flex-col items-center text-center" style={{ padding: '80px 20px 120px' }}>
              <p style={{ fontFamily: 'Fraunces, serif', fontWeight: 500, fontSize: '22px', color: '#0a0a0a' }}>
                Estamos preparando algo lindo
              </p>
              <p style={{ fontFamily: 'Poppins, sans-serif', fontWeight: 300, fontSize: '14px', color: 'rgba(10,10,10,0.5)', marginTop: '8px' }}>
                Pronto vas a encontrar acá los objetos más bellos de Bahía.
              </p>
            </div>
          )}

          {todos.length > 0 && (
            <>
              {/* ── Primer bloque destacado ── */}
              {destacados[0] && (
                <BloqueDestacado
                  tesoro={destacados[0]}
                  barrioNombre={destacados[0].producto.vendedor?.barrio_id ? barriosMap[destacados[0].producto.vendedor.barrio_id] : null}
                  invertido={false}
                />
              )}

              {/* ── Grilla: primeros 8 ── */}
              <div className="max-w-[1100px] mx-auto px-5 pt-12 pb-8 md:px-12 md:pt-12 md:pb-8">
                <div className="flex items-center justify-between" style={{ marginBottom: '24px' }}>
                  <p style={{ fontFamily: 'Fraunces, serif', fontWeight: 500, fontSize: '22px', color: '#0a0a0a' }}>
                    Todos los tesoros
                  </p>
                  <p style={{ fontFamily: "'Inter', sans-serif", fontWeight: 300, fontSize: '12px', color: 'rgba(10,10,10,0.35)' }}>
                    {todos.length} objetos
                  </p>
                </div>
                <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4" style={{ gap: '14px' }}>
                  {primerChunk.map((t) => (
                    <TarjetaProducto
                      key={t.id}
                      producto={t.producto}
                      barrioNombre={t.producto.vendedor?.barrio_id ? barriosMap[t.producto.vendedor.barrio_id] : null}
                    />
                  ))}
                </div>
              </div>

              {(destacados[1] || hayMas) && (
                <div className="max-w-[1100px] mx-auto px-5 md:px-12">
                  <hr style={{ border: 'none', borderTop: '1px solid rgba(10,10,10,0.06)', margin: '8px 0 32px' }} />
                </div>
              )}

              {/* ── Segundo bloque destacado (invertido) ── */}
              {destacados[1] && (
                <BloqueDestacado
                  tesoro={destacados[1]}
                  barrioNombre={destacados[1].producto.vendedor?.barrio_id ? barriosMap[destacados[1].producto.vendedor.barrio_id] : null}
                  invertido={true}
                />
              )}

              {/* ── Grilla: resto ── */}
              {resto.length > 0 && (
                <div className="max-w-[1100px] mx-auto px-5 pt-4 md:px-12" style={{ paddingBottom: '100px' }}>
                  <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4" style={{ gap: '14px' }}>
                    {resto.map((t) => (
                      <TarjetaProducto
                        key={t.id}
                        producto={t.producto}
                        barrioNombre={t.producto.vendedor?.barrio_id ? barriosMap[t.producto.vendedor.barrio_id] : null}
                      />
                    ))}
                  </div>
                </div>
              )}

              {resto.length === 0 && <div style={{ paddingBottom: '100px' }} />}
            </>
          )}
        </div>
      </div>
    </>
  )
}
