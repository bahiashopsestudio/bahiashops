'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import Navbar from '@/components/Navbar'
import MenuTakeover from '@/components/MenuTakeover'
import { createClient } from '@/lib/supabase/client'
import { EstrellasFijas } from '@/components/Estrellas'
import ListaResenas from '@/components/ListaResenas'
import { textoPromedio, textoCantidadResenas, MINIMO_PARA_PROMEDIO } from '@/lib/resenas'

// Debajo del nombre: con 5 o más reseñas, las estrellas, el promedio y la
// cantidad (link a la sección); con menos, "Tienda nueva" y la cantidad; sin
// ninguna, solo "Tienda nueva".
function LineaPuntaje({ puntaje }) {
  const { cantidad, promedio } = puntaje
  const enlace = (
    <a href="#resenas" className="text-[#0a0a0a]/55 underline underline-offset-2 hover:text-[#0a0a0a] font-light">
      {textoCantidadResenas(cantidad)}
    </a>
  )
  return (
    <div className="flex flex-wrap items-center gap-2 mt-2 text-[13px]" style={{ fontFamily: "'Inter', sans-serif" }}>
      {promedio !== null ? (
        <>
          <EstrellasFijas valor={promedio} tamano={14} />
          <span className="text-[#0a0a0a]" style={{ fontWeight: 600 }}>{textoPromedio(promedio)}</span>
        </>
      ) : (
        <span className="text-[11px] px-2.5 py-0.5 rounded-full" style={{ fontWeight: 600, backgroundColor: '#e8ecff', color: '#2a3fb8' }}>
          Tienda nueva
        </span>
      )}
      {cantidad > 0 && (
        <>
          <span className="text-[#0a0a0a]/30" aria-hidden="true">·</span>
          {enlace}
        </>
      )}
    </div>
  )
}

// La sección "Reseñas". Sin reseñas no se muestra; si no se pudieron cargar,
// lo dice.
function SeccionResenas({ vendedorId, tienda, puntaje, resenas }) {
  if (puntaje.cantidad === 0) return null
  return (
    <section id="resenas" className="mb-10 scroll-mt-24">
      <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
        <h3 className="text-lg m-0" style={{ fontFamily: 'Fraunces, serif', fontWeight: 500, color: '#0a0a0a' }}>Reseñas</h3>
        <span className="text-xs text-[#0a0a0a]/40 font-light">
          Todas son de compras pagadas en Bahía Shops ·{' '}
          <Link href="/resenas" className="text-[#0a0a0a]/55 underline underline-offset-2 hover:text-[#0a0a0a]">Cómo funcionan</Link>
        </span>
      </div>
      {puntaje.cantidad < MINIMO_PARA_PROMEDIO && (
        <p className="m-0 mt-2 text-sm text-[#0a0a0a]/45 font-light leading-relaxed">
          El puntaje promedio aparece cuando la tienda llega a 5 reseñas. Con menos, un solo número no dice mucho de cómo trabaja.
        </p>
      )}
      <div className="mt-3">
        {resenas.error ? (
          <p className="m-0 text-sm text-[#dc2626] font-light">No pudimos cargar las reseñas. Probá de nuevo en un rato.</p>
        ) : (
          <ListaResenas inicial={resenas.resenas} hayMasInicial={resenas.hayMas} tienda={tienda}
            urlPagina={(desde) => `/api/tiendas/${vendedorId}/resenas?desde=${desde}`} />
        )}
      </div>
    </section>
  )
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

const MENU_CATEGORIAS = [
  'moda', 'belleza-y-bienestar', 'joyeria-y-accesorios',
  'hogar-y-deco', 'artes-y-oficios', 'bebes-y-maternidad',
  'juegos-y-juguetes', 'mascotas', 'libros',
  'deporte', 'vintage',
]


// ═══════════════════════════════════════════════════════════
// COMPONENTE PRINCIPAL
// ═══════════════════════════════════════════════════════════

export default function TiendaContent({ vendedor, productos, puntaje = { cantidad: 0, promedio: null }, resenas = { resenas: [], hayMas: false, error: false } }) {
  const supabase = createClient()
  const [menuOpen, setMenuOpen] = useState(false)
  const [categorias, setCategorias] = useState([])

  useEffect(() => {
    if (menuOpen) {
      document.body.style.overflow = 'hidden'
    } else {
      document.body.style.overflow = ''
    }
    return () => { document.body.style.overflow = '' }
  }, [menuOpen])

  useEffect(() => {
    async function cargarCats() {
      const { data } = await supabase
        .from('categorias')
        .select('id, nombre, slug')
        .eq('activa', true)
        .order('orden')
      if (data) setCategorias(data)
    }
    cargarCats()
  }, [])

  const menuCats = MENU_CATEGORIAS
    .map(slug => categorias.find(c => c.slug === slug))
    .filter(Boolean)

  return (
    <>
      <link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Inter:wght@200;300;400;500;600;700;800;900&display=swap" />
      <link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Fraunces:opsz,wght@9..144,100..900&family=Poppins:wght@300;400;500&display=swap" />

      <div className="min-h-screen bg-white" style={{ fontFamily: "'Inter', sans-serif" }}>

        {menuOpen && (
          <MenuTakeover categorias={menuCats} onClose={() => setMenuOpen(false)} />
        )}

        <Navbar onToggleMenu={() => setMenuOpen(!menuOpen)} variant="solid" />

        {/* ── Portada con el botón Volver ── */}
        <div className="relative h-56 md:h-80 overflow-hidden mt-20">
          {vendedor.portada_url ? (
            <img
              src={vendedor.portada_url}
              alt={`Portada de ${vendedor.nombre_negocio}`}
              className="w-full h-full object-cover"
            />
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


        {/* ── Vendor identity ── */}
        <div className="max-w-6xl mx-auto px-6">
          <div className="relative -mt-12 flex items-end gap-5 mb-14 pt-[10px]">
            <div className="w-32 h-32 md:w-36 md:h-36 rounded-2xl bg-white border-4 border-white overflow-hidden shadow-sm shrink-0">
              {vendedor.logo_url ? (
                <img src={vendedor.logo_url} alt={vendedor.nombre_negocio} className="w-full h-full object-cover" />
              ) : (
                <div className="w-full h-full flex items-center justify-center text-white text-xl font-bold bg-[#0a0a0a]">
                  {vendedor.nombre_negocio.charAt(0)}
                </div>
              )}
            </div>

            <div className="pb-1">
              <h1 className="text-2xl md:text-3xl font-black text-[#0a0a0a] tracking-tight leading-tight">
                {vendedor.nombre_negocio}
              </h1>
              <div className="flex flex-wrap items-center gap-2 mt-1">
                {vendedor.categoria && (
                  <Link
                    href={`/categoria/${vendedor.categoria.slug}`}
                    className="text-xs font-medium px-2.5 py-0.5 rounded-full transition bg-[#0a0a0a]/5 text-[#0a0a0a]/60 hover:text-[#0a0a0a]"
                  >
                    {vendedor.categoria.nombre}
                  </Link>
                )}
                {vendedor.barrio && (
                  <span className="text-xs text-[#0a0a0a]/30 font-light flex items-center gap-1">
                    <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M15 10.5a3 3 0 1 1-6 0 3 3 0 0 1 6 0Z" />
                      <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 10.5c0 7.142-7.5 11.25-7.5 11.25S4.5 17.642 4.5 10.5a7.5 7.5 0 1 1 15 0Z" />
                    </svg>
                    {vendedor.barrio.nombre}
                  </span>
                )}
              </div>
              <LineaPuntaje puntaje={puntaje} />
            </div>
          </div>


          {/* ── Productos ── */}
          <section className="mb-10">
            {productos.length > 0 ? (
              <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4 md:gap-5">
                {productos.map(prod => {
                  const imageUrl = getImageUrl(prod.media)
                  return (
                    <Link key={prod.id} href={`/producto/${prod.id}`} className="group">
                      <div className="aspect-square bg-[#ECEAE3] rounded-xl overflow-hidden">
                        {imageUrl ? (
                          <img
                            src={imageUrl}
                            alt={prod.nombre}
                            className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                          />
                        ) : (
                          <div className="w-full h-full flex items-center justify-center text-[#0a0a0a]/20 text-xs font-light">
                            foto
                          </div>
                        )}
                      </div>
                      <div className="mt-2.5 px-0.5">
                        <p className="text-sm font-medium text-[#0a0a0a] group-hover:text-[#0a0a0a]/50 transition truncate">
                          {prod.nombre}
                        </p>
                        <div className="flex items-center gap-2 mt-1">
                          <p className="text-sm font-semibold text-[#0a0a0a]">
                            ${Number(prod.precio).toLocaleString('es-AR')}
                          </p>
                          {prod.precio_anterior && Number(prod.precio_anterior) > Number(prod.precio) && (
                            <p className="text-xs text-[#0a0a0a]/30 line-through font-light">
                              ${Number(prod.precio_anterior).toLocaleString('es-AR')}
                            </p>
                          )}
                        </div>
                      </div>
                    </Link>
                  )
                })}
              </div>
            ) : (
              <div className="text-center py-16 bg-[#F5F2EC] rounded-2xl">
                <svg className="w-10 h-10 mx-auto mb-3 text-[#0a0a0a]/15" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M20.25 7.5l-.625 10.632a2.25 2.25 0 01-2.247 2.118H6.622a2.25 2.25 0 01-2.247-2.118L3.75 7.5m8.25 3v6.75m0 0l-3-3m3 3 3-3M3.375 7.5h17.25c.621 0 1.125-.504 1.125-1.125v-1.5c0-.621-.504-1.125-1.125-1.125H3.375c-.621 0-1.125.504-1.125 1.125v1.5c0 .621.504 1.125 1.125 1.125Z" />
                </svg>
                <p className="text-[#0a0a0a]/30 text-sm font-light">Este vendedor aún no tiene productos publicados</p>
              </div>
            )}
          </section>


          {/* ── Sobre la tienda ── */}
          <div className="bg-[#F5F2EC] rounded-2xl p-6 mb-8">
            <h3 className="text-lg mb-3" style={{ fontFamily: 'Fraunces, serif', fontWeight: 500, color: '#0a0a0a' }}>Sobre {vendedor.nombre_negocio}</h3>
            <div className="max-w-3xl">
              <p style={{ fontFamily: 'Poppins, sans-serif', fontWeight: 300, fontSize: '13.5px', color: 'rgba(10,10,10,0.5)', lineHeight: 1.65 }}>
                {vendedor.descripcion_corta}
              </p>
              {vendedor.descripcion_larga && (
                <p style={{ fontFamily: 'Poppins, sans-serif', fontWeight: 300, fontSize: '13.5px', color: 'rgba(10,10,10,0.4)', lineHeight: 1.65, marginTop: '8px' }}>
                  {vendedor.descripcion_larga}
                </p>
              )}
            </div>

            {vendedor.horarios_texto_libre && (
              <div className="flex items-center gap-2.5 mt-5 pt-4 border-t border-[#0a0a0a]/5 text-sm text-[#0a0a0a]/40 font-light">
                <svg className="w-4 h-4 text-[#0a0a0a]/25 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 6v6h4.5m4.5 0a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z" />
                </svg>
                <span>{vendedor.horarios_texto_libre}</span>
              </div>
            )}
          </div>

          {/* ── Reseñas ── */}
          <SeccionResenas vendedorId={vendedor.id} tienda={vendedor.nombre_negocio} puntaje={puntaje} resenas={resenas} />
        </div>
      </div>
    </>
  )
}
