'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'

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

export default function TiendaContent({ vendedor, productos }) {
  const [siguiendo, setSiguiendo] = useState(false)
  const [copiadoVisible, setCopiadoVisible] = useState(false)
  const [showPill, setShowPill] = useState(false)

  const instagramHandle = vendedor.instagram?.replace('@', '')

  // Pill aparece al scrollear (mismo patrón que el index)
  useEffect(() => {
    function handleScroll() {
      setShowPill(window.scrollY > 300)
    }
    window.addEventListener('scroll', handleScroll, { passive: true })
    return () => window.removeEventListener('scroll', handleScroll)
  }, [])

  // Seguir — localStorage hasta que exista tabla
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

  return (
    <div className="min-h-screen bg-[#f6f4ef]">

      {/* ── Pill flotante abajo (igual que index) ── */}
      <div className={`fixed bottom-6 left-1/2 -translate-x-1/2 z-50 transition-all duration-300 hidden lg:block ${showPill ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-4 pointer-events-none'}`}>
        <div className="bg-white/95 backdrop-blur-md shadow-lg rounded-pill px-4 py-2.5 flex items-center gap-3 w-[420px]">
          <svg className="w-4 h-4 text-gray-400 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <circle cx="11" cy="11" r="8" />
            <path d="m21 21-4.35-4.35" strokeLinecap="round" />
          </svg>
          <input
            type="text"
            placeholder="¿Qué estás buscando?"
            className="flex-1 bg-transparent text-sm text-gray-700 placeholder:text-gray-400 focus:outline-none"
          />
          <Link href="/favoritos" className="p-1.5 text-gray-500 hover:text-[#8B7EC8] transition" aria-label="Favoritos">
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M21 8.25c0-2.485-2.099-4.5-4.688-4.5-1.935 0-3.597 1.126-4.312 2.733-.715-1.607-2.377-2.733-4.313-2.733C5.1 3.75 3 5.765 3 8.25c0 7.22 9 12 9 12s9-4.78 9-12Z" />
            </svg>
          </Link>
          <Link href="/carrito" className="relative p-1.5 text-gray-500 hover:text-[#8B7EC8] transition" aria-label="Carrito">
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 10.5V6a3.75 3.75 0 1 0-7.5 0v4.5m11.356-1.993 1.263 12c.07.665-.45 1.243-1.119 1.243H4.25a1.125 1.125 0 0 1-1.12-1.243l1.264-12A1.125 1.125 0 0 1 5.513 7.5h12.974c.576 0 1.059.435 1.119 1.007Z" />
            </svg>
          </Link>
          <div className="w-7 h-7 rounded-full bg-[#8B7EC8] text-white flex items-center justify-center text-xs font-semibold shrink-0 cursor-pointer">
            R
          </div>
        </div>
      </div>


      {/* ── Portada con botones flotantes ── */}
      <div className="relative h-56 md:h-80 overflow-hidden">
        {vendedor.portada_url ? (
          <img
            src={vendedor.portada_url}
            alt={`Portada de ${vendedor.nombre_negocio}`}
            className="w-full h-full object-cover"
          />
        ) : (
          <div className="absolute inset-0 bg-gradient-to-br from-[#8B7EC8] via-[#a599d6] to-[#c8c4f0]" />
        )}
        <div className="absolute inset-0 bg-gradient-to-t from-black/30 to-transparent" />

        {/* Botones flotantes sobre la portada */}
        <div className="absolute top-4 left-4">
          <button
            onClick={() => window.history.back()}
            className="w-10 h-10 flex items-center justify-center rounded-full bg-black/30 backdrop-blur-md text-white hover:bg-black/50 transition cursor-pointer"
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
              <span className="absolute -bottom-9 left-1/2 -translate-x-1/2 bg-gray-800 text-white text-[10px] px-2.5 py-1 rounded-full whitespace-nowrap shadow-lg">
                Enlace copiado
              </span>
            )}
          </button>

          <button
            onClick={toggleSeguir}
            className={`px-4 py-2 rounded-full text-sm font-semibold transition-all cursor-pointer backdrop-blur-md ${
              siguiendo
                ? 'bg-white text-gray-900 shadow-sm'
                : 'bg-black/30 text-white border border-white/30 hover:bg-black/50'
            }`}
          >
            {siguiendo ? '✓ Siguiendo' : 'Seguir'}
          </button>
        </div>
      </div>


      {/* ── Vendor identity ── */}
      <div className="max-w-6xl mx-auto px-6">
        <div className="relative -mt-10 flex items-end gap-4 mb-6">
          {/* Logo */}
          <div className="w-20 h-20 rounded-2xl bg-white border-4 border-[#f6f4ef] overflow-hidden shadow-sm shrink-0">
            {vendedor.logo_url ? (
              <img src={vendedor.logo_url} alt={vendedor.nombre_negocio} className="w-full h-full object-cover" />
            ) : (
              <div className="w-full h-full flex items-center justify-center text-white text-xl font-bold" style={{ backgroundColor: '#8B7EC8' }}>
                {vendedor.nombre_negocio.charAt(0)}
              </div>
            )}
          </div>

          {/* Nombre + meta */}
          <div className="pb-1">
            <h1 className="text-2xl md:text-3xl font-bold text-gray-900 leading-tight">
              {vendedor.nombre_negocio}
            </h1>
            <div className="flex flex-wrap items-center gap-2 mt-1">
              {vendedor.categoria && (
                <Link
                  href={`/categoria/${vendedor.categoria.slug}`}
                  className="text-xs font-medium px-2.5 py-0.5 rounded-full transition"
                  style={{ backgroundColor: 'rgba(139, 126, 200, 0.1)', color: '#8B7EC8' }}
                >
                  {vendedor.categoria.nombre}
                </Link>
              )}
              {vendedor.barrio && (
                <span className="text-xs text-gray-400 flex items-center gap-1">
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
            <h2 className="text-xl font-bold text-gray-900">
              Productos{productos.length > 0 ? ` (${productos.length})` : ''}
            </h2>
          </div>

          {productos.length > 0 ? (
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4 md:gap-5">
              {productos.map(prod => {
                const imageUrl = getImageUrl(prod.media)
                return (
                  <Link key={prod.id} href={`/producto/${prod.id}`} className="group">
                    <div className="aspect-square bg-[#e8e5dd] rounded-2xl overflow-hidden">
                      {imageUrl ? (
                        <img
                          src={imageUrl}
                          alt={prod.nombre}
                          className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                        />
                      ) : (
                        <div className="w-full h-full flex items-center justify-center text-gray-400 text-xs">
                          foto
                        </div>
                      )}
                    </div>
                    <div className="mt-2.5 px-0.5">
                      <p className="text-sm font-medium text-gray-900 group-hover:text-[#8B7EC8] transition truncate">
                        {prod.nombre}
                      </p>
                      <div className="flex items-center gap-2 mt-1">
                        <p className="text-sm font-semibold text-gray-900">
                          ${Number(prod.precio).toLocaleString('es-AR')}
                        </p>
                        {prod.precio_anterior && Number(prod.precio_anterior) > Number(prod.precio) && (
                          <p className="text-xs text-gray-400 line-through">
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
            <div className="text-center py-16 bg-white rounded-2xl border border-gray-100">
              <svg className="w-10 h-10 mx-auto mb-3 text-gray-300" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M20.25 7.5l-.625 10.632a2.25 2.25 0 01-2.247 2.118H6.622a2.25 2.25 0 01-2.247-2.118L3.75 7.5m8.25 3v6.75m0 0l-3-3m3 3 3-3M3.375 7.5h17.25c.621 0 1.125-.504 1.125-1.125v-1.5c0-.621-.504-1.125-1.125-1.125H3.375c-.621 0-1.125.504-1.125 1.125v1.5c0 .621.504 1.125 1.125 1.125Z" />
              </svg>
              <p className="text-gray-400 text-sm">Este vendedor aún no tiene productos publicados</p>
            </div>
          )}
        </section>


        {/* ═══════════════════════════════════════════════════ */}
        {/* TARJETAS DE INFO                                    */}
        {/* ═══════════════════════════════════════════════════ */}
        <div className="grid md:grid-cols-2 gap-4 mb-8">

          {/* ── Tarjeta: Sobre este vendedor ── */}
          <div className="bg-white rounded-2xl border border-gray-100 p-6">
            <h3 className="text-lg font-bold text-gray-900 mb-3">Sobre {vendedor.nombre_negocio}</h3>
            <p className="text-sm text-gray-600 leading-relaxed">
              {vendedor.descripcion_corta}
            </p>
            {vendedor.descripcion_larga && (
              <p className="text-sm text-gray-500 leading-relaxed mt-2">
                {vendedor.descripcion_larga}
              </p>
            )}

            <div className="flex flex-col gap-3 mt-5 pt-4 border-t border-gray-100">
              {instagramHandle && (
                <a
                  href={`https://instagram.com/${instagramHandle}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center justify-between text-sm text-gray-600 hover:text-[#8B7EC8] transition group"
                >
                  <span className="flex items-center gap-2.5">
                    <svg className="w-4 h-4 text-gray-400 group-hover:text-[#8B7EC8] transition" fill="currentColor" viewBox="0 0 24 24">
                      <path d="M12 2.163c3.204 0 3.584.012 4.85.07 3.252.148 4.771 1.691 4.919 4.919.058 1.265.069 1.645.069 4.849 0 3.205-.012 3.584-.069 4.849-.149 3.225-1.664 4.771-4.919 4.919-1.266.058-1.644.07-4.85.07-3.204 0-3.584-.012-4.849-.07-3.26-.149-4.771-1.699-4.919-4.92-.058-1.265-.07-1.644-.07-4.849 0-3.204.013-3.583.07-4.849.149-3.227 1.664-4.771 4.919-4.919 1.266-.057 1.645-.069 4.849-.069zM12 0C8.741 0 8.333.014 7.053.072 2.695.272.273 2.69.073 7.052.014 8.333 0 8.741 0 12c0 3.259.014 3.668.072 4.948.2 4.358 2.618 6.78 6.98 6.98C8.333 23.986 8.741 24 12 24c3.259 0 3.668-.014 4.948-.072 4.354-.2 6.782-2.618 6.979-6.98.059-1.28.073-1.689.073-4.948 0-3.259-.014-3.667-.072-4.947-.196-4.354-2.617-6.78-6.979-6.98C15.668.014 15.259 0 12 0zm0 5.838a6.162 6.162 0 100 12.324 6.162 6.162 0 000-12.324zM12 16a4 4 0 110-8 4 4 0 010 8zm6.406-11.845a1.44 1.44 0 100 2.881 1.44 1.44 0 000-2.881z"/>
                    </svg>
                    @{instagramHandle}
                  </span>
                  <svg className="w-4 h-4 text-gray-300" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M13.5 6H5.25A2.25 2.25 0 0 0 3 8.25v10.5A2.25 2.25 0 0 0 5.25 21h10.5A2.25 2.25 0 0 0 18 18.75V10.5m-10.5 6L21 3m0 0h-5.25M21 3v5.25" />
                  </svg>
                </a>
              )}
              {vendedor.recibe_publico && vendedor.direccion && (
                <div className="flex items-center gap-2.5 text-sm text-gray-600">
                  <svg className="w-4 h-4 text-gray-400 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M15 10.5a3 3 0 1 1-6 0 3 3 0 0 1 6 0Z" />
                    <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 10.5c0 7.142-7.5 11.25-7.5 11.25S4.5 17.642 4.5 10.5a7.5 7.5 0 1 1 15 0Z" />
                  </svg>
                  <span>{vendedor.direccion}</span>
                </div>
              )}
              {vendedor.horarios_texto_libre && (
                <div className="flex items-center gap-2.5 text-sm text-gray-600">
                  <svg className="w-4 h-4 text-gray-400 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M12 6v6h4.5m4.5 0a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z" />
                  </svg>
                  <span>{vendedor.horarios_texto_libre}</span>
                </div>
              )}
            </div>
          </div>


          {/* ── Tarjeta: Políticas ── */}
          <div className="bg-white rounded-2xl border border-gray-100 p-6 flex flex-col">
            <h3 className="text-lg font-bold text-gray-900 mb-4">Políticas</h3>
            <div className="flex flex-col flex-1">
              <Link
                href="/politicas/privacidad"
                className="flex items-center justify-between py-3 border-b border-gray-50 text-sm text-gray-600 hover:text-[#8B7EC8] transition group"
              >
                <span>Política de privacidad</span>
                <svg className="w-5 h-5 text-gray-300 group-hover:text-[#8B7EC8] transition" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="m11.25 11.25.041-.02a.75.75 0 0 1 1.063.852l-.708 2.836a.75.75 0 0 0 1.063.853l.041-.021M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0Zm-9-3.75h.008v.008H12V8.25Z" />
                </svg>
              </Link>
              <Link
                href="/politicas/devoluciones"
                className="flex items-center justify-between py-3 border-b border-gray-50 text-sm text-gray-600 hover:text-[#8B7EC8] transition group"
              >
                <span>Política de devoluciones</span>
                <svg className="w-5 h-5 text-gray-300 group-hover:text-[#8B7EC8] transition" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 6v12m-3-2.818.879.659c1.171.879 3.07.879 4.242 0 1.172-.879 1.172-2.303 0-3.182C13.536 12.219 12.768 12 12 12c-.725 0-1.45-.22-2.003-.659-1.106-.879-1.106-2.303 0-3.182s2.9-.879 4.006 0l.415.33M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z" />
                </svg>
              </Link>
              <Link
                href="/politicas/envio"
                className="flex items-center justify-between py-3 text-sm text-gray-600 hover:text-[#8B7EC8] transition group"
              >
                <span>Política de envío</span>
                <svg className="w-5 h-5 text-gray-300 group-hover:text-[#8B7EC8] transition" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M8.25 18.75a1.5 1.5 0 0 1-3 0m3 0a1.5 1.5 0 0 0-3 0m3 0h6m-9 0H3.375a1.125 1.125 0 0 1-1.125-1.125V14.25m17.25 4.5a1.5 1.5 0 0 1-3 0m3 0a1.5 1.5 0 0 0-3 0m3 0h1.125c.621 0 1.129-.504 1.09-1.124a17.902 17.902 0 0 0-3.213-9.193 2.056 2.056 0 0 0-1.58-.86H14.25M16.5 18.75h-2.25m0-11.177v-.958c0-.568-.422-1.048-.987-1.106a48.554 48.554 0 0 0-10.026 0 1.106 1.106 0 0 0-.987 1.106v7.635m12-6.677v6.677m0 4.5v-4.5m0 0h-12" />
                </svg>
              </Link>
            </div>
          </div>
        </div>


        {/* ── Tarjeta: Reseñas (placeholder) ── */}
        <div className="bg-white rounded-2xl border border-gray-100 p-6 mb-10">
          <div className="flex items-center justify-between">
            <h3 className="text-lg font-bold text-gray-900">Reseñas</h3>
            <span className="text-xs text-gray-400 font-medium px-2.5 py-1 rounded-full bg-gray-50">Próximamente</span>
          </div>
          <div className="flex items-center gap-1 mt-3">
            {[1, 2, 3, 4, 5].map(star => (
              <svg key={star} className="w-5 h-5 text-gray-200" fill="currentColor" viewBox="0 0 24 24">
                <path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z" />
              </svg>
            ))}
            <span className="text-xs text-gray-300 ml-1">Sin reseñas aún</span>
          </div>
          <p className="text-sm text-gray-400 mt-3">
            Las reseñas estarán disponibles próximamente. Los compradores podrán dejar su opinión después de cada compra.
          </p>
        </div>

      </div>


      {/* ── Footer ── */}
      <footer className="bg-[#1a1a1a] text-gray-500 text-xs text-center py-6">
        © 2026 Bahía Shops — Bahía Blanca, Argentina
      </footer>
    </div>
  )
}