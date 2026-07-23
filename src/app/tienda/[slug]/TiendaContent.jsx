'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import Navbar from '@/components/Navbar'
import MenuTakeover from '@/components/MenuTakeover'
import { createClient } from '@/lib/supabase/client'

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
  'moda', 'belleza-y-cuidado-personal', 'gastronomia',
  'hogar-deco-y-jardin', 'diseno-y-artesanias', 'tecnologia',
  'salud-y-bienestar', 'arte-e-ilustracion',
]


// ═══════════════════════════════════════════════════════════
// COMPONENTE PRINCIPAL
// ═══════════════════════════════════════════════════════════

export default function TiendaContent({ vendedor, productos }) {
  const supabase = createClient()
  const [siguiendo, setSiguiendo] = useState(false)
  const [copiadoVisible, setCopiadoVisible] = useState(false)
  const [menuOpen, setMenuOpen] = useState(false)
  const [categorias, setCategorias] = useState([])

  const instagramHandle = vendedor.instagram?.replace('@', '')

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

  useEffect(() => {
    try {
      const seguidos = JSON.parse(localStorage.getItem('vendedores_seguidos') || '[]')
      setSiguiendo(seguidos.includes(vendedor.id))
    } catch {}
  }, [vendedor.id])

  function toggleSeguir() {
    try {
      const seguidos = JSON.parse(localStorage.getItem('vendedores_seguidos') || '[]')
      let nuevos
      if (siguiendo) {
        nuevos = seguidos.filter(id => id !== vendedor.id)
      } else {
        nuevos = [...seguidos, vendedor.id]
      }
      localStorage.setItem('vendedores_seguidos', JSON.stringify(nuevos))
      setSiguiendo(!siguiendo)
    } catch {}
  }

  async function compartir() {
    const url = window.location.href
    try {
      if (navigator.share) {
        await navigator.share({ title: vendedor.nombre_negocio, url })
      } else {
        await navigator.clipboard.writeText(url)
        setCopiadoVisible(true)
        setTimeout(() => setCopiadoVisible(false), 2000)
      }
    } catch {}
  }

  const menuCats = MENU_CATEGORIAS
    .map(slug => categorias.find(c => c.slug === slug))
    .filter(Boolean)

  return (
    <>
      <link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Inter:wght@200;300;400;500;600;700;800;900&display=swap" />

      <div className="min-h-screen bg-white" style={{ fontFamily: "'Inter', sans-serif" }}>

        {menuOpen && (
          <MenuTakeover categorias={menuCats} onClose={() => setMenuOpen(false)} />
        )}

        <Navbar onToggleMenu={() => setMenuOpen(!menuOpen)} variant="solid" />

        {/* ── Portada con botones flotantes ── */}
        <div className="relative h-56 md:h-80 overflow-hidden mt-14">
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

          <div className="absolute top-4 right-4 flex items-center gap-2">
            <button
              onClick={compartir}
              className="w-10 h-10 flex items-center justify-center rounded-full bg-black/30 backdrop-blur-md text-white hover:bg-black/50 transition cursor-pointer relative"
              aria-label="Compartir"
            >
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M7.217 10.907a2.25 2.25 0 1 0 0 2.186m0-2.186c.18.324.283.696.283 1.093s-.103.77-.283 1.093m0-2.186 9.566-5.314m-9.566 7.5 9.566 5.314m0 0a2.25 2.25 0 1 0 3.935 2.186 2.25 2.25 0 0 0-3.935-2.186Zm0-12.814a2.25 2.25 0 1 0 3.933-2.185 2.25 2.25 0 0 0-3.933 2.185Z" />
              </svg>
              {copiadoVisible && (
                <span className="absolute -bottom-9 left-1/2 -translate-x-1/2 bg-[#0a0a0a] text-white text-[10px] px-2.5 py-1 rounded-full whitespace-nowrap shadow-lg">
                  Enlace copiado
                </span>
              )}
            </button>

            <button
              onClick={toggleSeguir}
              className={`px-4 py-2 rounded-full text-sm font-medium transition-all cursor-pointer backdrop-blur-md ${
                siguiendo
                  ? 'bg-white text-[#0a0a0a] shadow-sm'
                  : 'bg-black/30 text-white border border-white/30 hover:bg-black/50'
              }`}
            >
              {siguiendo ? '✓ Siguiendo' : 'Seguir'}
            </button>
          </div>
        </div>


        {/* ── Vendor identity ── */}
        <div className="max-w-6xl mx-auto px-6">
          <div className="relative -mt-14 flex items-end gap-5 mb-6 pt-4">
            <div className="w-28 h-28 rounded-2xl bg-white border-4 border-white overflow-hidden shadow-sm shrink-0">
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
            </div>
          </div>


          {/* ── Productos ── */}
          <section className="mb-10">
            <div className="flex items-center justify-between mb-6">
              <h2 className="text-xl font-black text-[#0a0a0a] tracking-tight">
                Productos{productos.length > 0 ? ` (${productos.length})` : ''}
              </h2>
            </div>

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


          {/* ── Tarjetas de info ── */}
          <div className="grid md:grid-cols-2 gap-4 mb-8">

            <div className="bg-[#F5F2EC] rounded-2xl p-6">
              <h3 className="text-lg font-black text-[#0a0a0a] tracking-tight mb-3">Sobre {vendedor.nombre_negocio}</h3>
              <p className="text-sm text-[#0a0a0a]/50 leading-relaxed font-light">
                {vendedor.descripcion_corta}
              </p>
              {vendedor.descripcion_larga && (
                <p className="text-sm text-[#0a0a0a]/40 leading-relaxed font-light mt-2">
                  {vendedor.descripcion_larga}
                </p>
              )}

              <div className="flex flex-col gap-3 mt-5 pt-4 border-t border-[#0a0a0a]/5">
                {instagramHandle && (
                  <a
                    href={`https://instagram.com/${instagramHandle}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center justify-between text-sm text-[#0a0a0a]/40 hover:text-[#0a0a0a] transition group font-light"
                  >
                    <span className="flex items-center gap-2.5">
                      <svg className="w-4 h-4 text-[#0a0a0a]/25 group-hover:text-[#0a0a0a] transition" fill="currentColor" viewBox="0 0 24 24">
                        <path d="M12 2.163c3.204 0 3.584.012 4.85.07 3.252.148 4.771 1.691 4.919 4.919.058 1.265.069 1.645.069 4.849 0 3.205-.012 3.584-.069 4.849-.149 3.225-1.664 4.771-4.919 4.919-1.266.058-1.644.07-4.85.07-3.204 0-3.584-.012-4.849-.07-3.26-.149-4.771-1.699-4.919-4.92-.058-1.265-.07-1.644-.07-4.849 0-3.204.013-3.583.07-4.849.149-3.227 1.664-4.771 4.919-4.919 1.266-.057 1.645-.069 4.849-.069zM12 0C8.741 0 8.333.014 7.053.072 2.695.272.273 2.69.073 7.052.014 8.333 0 8.741 0 12c0 3.259.014 3.668.072 4.948.2 4.358 2.618 6.78 6.98 6.98C8.333 23.986 8.741 24 12 24c3.259 0 3.668-.014 4.948-.072 4.354-.2 6.782-2.618 6.979-6.98.059-1.28.073-1.689.073-4.948 0-3.259-.014-3.667-.072-4.947-.196-4.354-2.617-6.78-6.979-6.98C15.668.014 15.259 0 12 0zm0 5.838a6.162 6.162 0 100 12.324 6.162 6.162 0 000-12.324zM12 16a4 4 0 110-8 4 4 0 010 8zm6.406-11.845a1.44 1.44 0 100 2.881 1.44 1.44 0 000-2.881z"/>
                      </svg>
                      @{instagramHandle}
                    </span>
                    <svg className="w-4 h-4 text-[#0a0a0a]/15" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M13.5 6H5.25A2.25 2.25 0 0 0 3 8.25v10.5A2.25 2.25 0 0 0 5.25 21h10.5A2.25 2.25 0 0 0 18 18.75V10.5m-10.5 6L21 3m0 0h-5.25M21 3v5.25" />
                    </svg>
                  </a>
                )}
                {vendedor.recibe_publico && vendedor.direccion && (
                  <div className="flex items-center gap-2.5 text-sm text-[#0a0a0a]/40 font-light">
                    <svg className="w-4 h-4 text-[#0a0a0a]/25 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M15 10.5a3 3 0 1 1-6 0 3 3 0 0 1 6 0Z" />
                      <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 10.5c0 7.142-7.5 11.25-7.5 11.25S4.5 17.642 4.5 10.5a7.5 7.5 0 1 1 15 0Z" />
                    </svg>
                    <span>{vendedor.direccion}</span>
                  </div>
                )}
                {vendedor.horarios_texto_libre && (
                  <div className="flex items-center gap-2.5 text-sm text-[#0a0a0a]/40 font-light">
                    <svg className="w-4 h-4 text-[#0a0a0a]/25 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M12 6v6h4.5m4.5 0a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z" />
                    </svg>
                    <span>{vendedor.horarios_texto_libre}</span>
                  </div>
                )}
              </div>
            </div>

            <div className="bg-[#F5F2EC] rounded-2xl p-6 flex flex-col">
              <h3 className="text-lg font-black text-[#0a0a0a] tracking-tight mb-4">Políticas</h3>
              <div className="flex flex-col flex-1">
                <Link
                  href="/privacidad"
                  className="flex items-center justify-between py-3 border-b border-[#0a0a0a]/5 text-sm text-[#0a0a0a]/40 hover:text-[#0a0a0a] transition group font-light"
                >
                  <span>Política de privacidad</span>
                  <svg className="w-4 h-4 text-[#0a0a0a]/15" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="m8.25 4.5 7.5 7.5-7.5 7.5" />
                  </svg>
                </Link>
                <Link
                  href="/terminos"
                  className="flex items-center justify-between py-3 border-b border-[#0a0a0a]/5 text-sm text-[#0a0a0a]/40 hover:text-[#0a0a0a] transition group font-light"
                >
                  <span>Política de devoluciones</span>
                  <svg className="w-4 h-4 text-[#0a0a0a]/15" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="m8.25 4.5 7.5 7.5-7.5 7.5" />
                  </svg>
                </Link>
                <Link
                  href="/terminos"
                  className="flex items-center justify-between py-3 text-sm text-[#0a0a0a]/40 hover:text-[#0a0a0a] transition group font-light"
                >
                  <span>Política de envío</span>
                  <svg className="w-4 h-4 text-[#0a0a0a]/15" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="m8.25 4.5 7.5 7.5-7.5 7.5" />
                  </svg>
                </Link>
              </div>
            </div>
          </div>

          {/* ── Reseñas placeholder ── */}
          <div className="bg-[#F5F2EC] rounded-2xl p-6 mb-10">
            <div className="flex items-center justify-between">
              <h3 className="text-lg font-black text-[#0a0a0a] tracking-tight">Reseñas</h3>
              <span className="text-[10px] text-[#0a0a0a]/30 font-light px-2.5 py-1 rounded-full bg-[#0a0a0a]/5 tracking-wide">Próximamente</span>
            </div>
            <div className="flex items-center gap-1 mt-3">
              {[1, 2, 3, 4, 5].map(star => (
                <svg key={star} className="w-5 h-5 text-[#0a0a0a]/10" fill="currentColor" viewBox="0 0 24 24">
                  <path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z" />
                </svg>
              ))}
              <span className="text-xs text-[#0a0a0a]/20 ml-1 font-light">Sin reseñas aún</span>
            </div>
            <p className="text-sm text-[#0a0a0a]/30 mt-3 font-light">
              Las reseñas estarán disponibles próximamente. Los compradores podrán dejar su opinión después de cada compra.
            </p>
          </div>
        </div>

        {/* ── Footer ── */}
        <footer className="bg-[#0a0a0a] text-white/25 text-xs pt-8 pb-24 px-6">
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
      </div>
    </>
  )
}
