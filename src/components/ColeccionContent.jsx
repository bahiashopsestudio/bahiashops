'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import Navbar from '@/components/Navbar'
import MenuTakeover from '@/components/MenuTakeover'
import BotonFavorito from '@/components/BotonFavorito'
import { createClient } from '@/lib/supabase/client'

function getImageUrl(media) {
  if (!media?.length) return null
  const principal = media.find(m => m.es_principal)
  if (principal) return principal.url
  const sorted = [...media].sort((a, b) => a.orden - b.orden)
  return sorted[0]?.url || null
}

function formatearPrecio(valor) {
  if (!valor) return ''
  return Number(valor).toLocaleString('es-AR')
}

const MENU_CATEGORIAS = [
  'moda', 'belleza-y-bienestar', 'joyeria-y-accesorios',
  'hogar-y-deco', 'artes-y-oficios', 'bebes-y-maternidad',
  'juegos-y-juguetes', 'mascotas', 'libros',
  'deporte', 'vintage',
]

export default function ColeccionContent({ coleccion, productos }) {
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
      <link
        rel="stylesheet"
        href="https://fonts.googleapis.com/css2?family=Inter:wght@200;300;400;500;600;700;800;900&display=swap"
      />
      <link
        rel="stylesheet"
        href="https://fonts.googleapis.com/css2?family=Fraunces:opsz,wght@9..144,100..900&display=swap"
      />

      <div className="min-h-screen bg-white" style={{ fontFamily: "'Inter', sans-serif" }}>
        {menuOpen && (
          <MenuTakeover categorias={menuCats} onClose={() => setMenuOpen(false)} />
        )}

        <Navbar onToggleMenu={() => setMenuOpen(!menuOpen)} variant="solid" />

        {/* ── Banner ── */}
        <div className="relative h-64 md:h-80 overflow-hidden mt-14">
          {coleccion.imagen_url ? (
            <img
              src={coleccion.imagen_url}
              alt={coleccion.nombre}
              className="w-full h-full object-cover"
            />
          ) : (
            <div className="absolute inset-0 bg-gradient-to-br from-[#0a0a0a] via-[#1a1a1a] to-[#333]" />
          )}
          <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-black/10 to-transparent" />

          <div className="absolute inset-0 flex flex-col justify-end px-6 md:px-10 pb-8 max-w-6xl mx-auto">
            <h1
              className="text-white text-3xl md:text-5xl"
              style={{ fontFamily: 'Fraunces, serif', fontWeight: 500, letterSpacing: '-0.02em', lineHeight: 1.1 }}
            >
              {coleccion.nombre}
            </h1>
            {coleccion.descripcion && (
              <p className="text-white/85 text-sm md:text-base font-light mt-3 max-w-xl">
                {coleccion.descripcion}
              </p>
            )}
          </div>
        </div>

        {/* ── Productos ── */}
        <div className="max-w-6xl mx-auto px-4 md:px-8 py-10">
          <p className="text-sm text-[#0a0a0a]/30 font-light mb-6">
            {productos.length} {productos.length === 1 ? 'producto' : 'productos'}
          </p>

          {productos.length > 0 ? (
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4 md:gap-5">
              {productos.map((p) => {
                const imageUrl = getImageUrl(p.media)
                const enOferta = p.precio_anterior && Number(p.precio_anterior) > Number(p.precio)
                return (
                  <div key={p.id} className="relative">
                    <Link href={`/producto/${p.id}`} className="block group">
                      <div className="aspect-square bg-[#ECEAE3] rounded-xl overflow-hidden">
                        {imageUrl ? (
                          <img
                            src={imageUrl}
                            alt={p.nombre}
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
                          {p.nombre}
                        </p>
                        <p className="text-xs text-[#0a0a0a]/30 font-light mt-0.5">
                          {p.vendedor?.nombre_negocio || ''}
                        </p>
                        <div className="flex items-center gap-2 mt-1">
                          {enOferta && (
                            <span className="text-xs text-[#0a0a0a]/30 line-through font-light">
                              ${formatearPrecio(p.precio_anterior)}
                            </span>
                          )}
                          <span className={`text-sm font-semibold ${enOferta ? 'text-[#4164fe]' : 'text-[#0a0a0a]'}`}>
                            ${formatearPrecio(p.precio)}
                          </span>
                        </div>
                      </div>
                    </Link>
                    <div className="absolute top-2 right-2">
                      <BotonFavorito
                        productoId={p.id}
                        className="w-8 h-8 rounded-full bg-white/80 backdrop-blur-sm flex items-center justify-center text-gray-500"
                      />
                    </div>
                  </div>
                )
              })}
            </div>
          ) : (
            <div className="text-center py-16 bg-[#F5F2EC] rounded-2xl">
              <p className="text-[#0a0a0a]/30 text-sm font-light">Todavía no hay productos en esta colección.</p>
            </div>
          )}
        </div>
      </div>
    </>
  )
}
