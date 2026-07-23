'use client'

import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import Navbar from '@/components/Navbar'
import MenuTakeover from '@/components/MenuTakeover'
import VolverAtras from '@/components/VolverAtras'
import BotonFavorito from '@/components/BotonFavorito'

const MENU_CATEGORIAS = [
  'moda', 'belleza-y-cuidado-personal', 'gastronomia',
  'hogar-deco-y-jardin', 'diseno-y-artesanias', 'tecnologia',
  'salud-y-bienestar', 'arte-e-ilustracion',
]

function getImageUrl(media) {
  if (!media?.length) return null
  const principal = media.find(m => m.es_principal)
  if (principal) return principal.url
  const sorted = [...media].sort((a, b) => a.orden - b.orden)
  return sorted[0]?.url || null
}

export default function FavoritosPage() {
  const supabase = createClient()
  const router = useRouter()
  const [productos, setProductos] = useState([])
  const [cargando, setCargando] = useState(true)
  const [logueado, setLogueado] = useState(true)
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
    async function cargar() {
      const { data: cats } = await supabase
        .from('categorias')
        .select('id, nombre, slug')
        .eq('activa', true)
        .order('orden')
      if (cats) setCategorias(cats)

      const { data: { user } } = await supabase.auth.getUser()
      if (!user) {
        setLogueado(false)
        setCargando(false)
        return
      }

      const { data: favs } = await supabase
        .from('favoritos')
        .select('producto_id')
        .eq('usuario_id', user.id)
        .order('creado_en', { ascending: false })

      if (!favs || favs.length === 0) {
        setProductos([])
        setCargando(false)
        return
      }

      const ids = favs.map(f => f.producto_id)

      const { data: prods } = await supabase
        .from('productos')
        .select(`
          id, nombre, precio, precio_anterior,
          vendedor:vendedores(id, nombre_negocio, slug),
          media:producto_media(url, es_principal, orden)
        `)
        .in('id', ids)
        .eq('estado', 'activo')

      const ordenado = ids
        .map(id => (prods || []).find(p => p.id === id))
        .filter(Boolean)

      setProductos(ordenado)
      setCargando(false)
    }
    cargar()
  }, [])

  function quitarDeLista(productoId) {
    setProductos(prev => prev.filter(p => p.id !== productoId))
  }

  const menuCats = MENU_CATEGORIAS
    .map(slug => categorias.find(c => c.slug === slug))
    .filter(Boolean)

  if (cargando) {
    return (
      <>
        <link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Inter:wght@200;300;400;500;600;700;800;900&display=swap" />
        <div className="min-h-screen bg-white flex items-center justify-center" style={{ fontFamily: "'Inter', sans-serif" }}>
          <span className="text-[#0a0a0a]/30 text-sm font-light">Cargando...</span>
        </div>
      </>
    )
  }

  return (
    <>
      <link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Inter:wght@200;300;400;500;600;700;800;900&display=swap" />

      <div className="min-h-screen bg-white" style={{ fontFamily: "'Inter', sans-serif" }}>

        {menuOpen && (
          <MenuTakeover categorias={menuCats} onClose={() => setMenuOpen(false)} />
        )}

        <Navbar onToggleMenu={() => setMenuOpen(!menuOpen)} variant="solid" />

        <div className="pt-20 pb-24 px-4 md:px-8">
          <div className="max-w-5xl mx-auto">

            <VolverAtras href="/" texto="Volver al inicio" />

            <h1 className="text-2xl md:text-3xl font-black text-[#0a0a0a] tracking-tight mb-1">
              Mis favoritos
            </h1>

            {!logueado ? (
              <div className="text-center py-20">
                <p className="text-[#0a0a0a]/30 font-light mb-6">Iniciá sesión para ver tus productos guardados</p>
                <Link
                  href="/login"
                  className="inline-block bg-[#0a0a0a] text-white px-6 py-3 rounded-full text-sm font-medium hover:bg-[#2a2a2a] transition"
                >
                  Iniciar sesión
                </Link>
              </div>
            ) : productos.length === 0 ? (
              <div className="text-center py-20">
                <svg className="w-12 h-12 text-[#0a0a0a]/10 mx-auto mb-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M21 8.25c0-2.485-2.099-4.5-4.688-4.5-1.935 0-3.597 1.126-4.312 2.733-.715-1.607-2.377-2.733-4.313-2.733C5.1 3.75 3 5.765 3 8.25c0 7.22 9 12 9 12s9-4.78 9-12Z" />
                </svg>
                <p className="text-[#0a0a0a]/40 font-light mb-2">Todavía no guardaste productos</p>
                <p className="text-[#0a0a0a]/20 text-sm font-light mb-6">Tocá el corazón en cualquier producto para guardarlo acá</p>
                <button
                  onClick={() => router.push('/')}
                  className="bg-[#0a0a0a] text-white px-6 py-3 rounded-full text-sm font-medium hover:bg-[#2a2a2a] transition cursor-pointer"
                >
                  Explorar productos
                </button>
              </div>
            ) : (
              <>
                <p className="text-sm text-[#0a0a0a]/30 font-light mb-6">
                  {productos.length} {productos.length === 1 ? 'producto guardado' : 'productos guardados'}
                </p>

                <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4 md:gap-5">
                  {productos.map((prod) => {
                    const imageUrl = getImageUrl(prod.media)
                    const enOferta = prod.precio_anterior && Number(prod.precio_anterior) > Number(prod.precio)
                    return (
                      <div key={prod.id} className="relative">
                        <Link href={`/producto/${prod.id}`} className="block group">
                          <div className="aspect-square bg-[#ECEAE3] rounded-xl overflow-hidden">
                            {imageUrl ? (
                              <img src={imageUrl} alt={prod.nombre} className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300" />
                            ) : (
                              <div className="w-full h-full flex items-center justify-center text-[#0a0a0a]/20 text-xs font-light">foto</div>
                            )}
                          </div>
                          <div className="mt-2.5 px-0.5">
                            <p className="text-sm font-medium text-[#0a0a0a] group-hover:text-[#0a0a0a]/50 transition truncate">
                              {prod.nombre}
                            </p>
                            <p className="text-xs text-[#0a0a0a]/30 font-light mt-0.5">
                              {prod.vendedor?.nombre_negocio}
                            </p>
                            <div className="flex items-center gap-2 mt-1">
                              {enOferta && (
                                <span className="text-xs text-[#0a0a0a]/30 line-through font-light">
                                  ${Number(prod.precio_anterior).toLocaleString('es-AR')}
                                </span>
                              )}
                              <span className={`text-sm font-semibold ${enOferta ? 'text-[#e60000]' : 'text-[#0a0a0a]'}`}>
                                ${Number(prod.precio).toLocaleString('es-AR')}
                              </span>
                            </div>
                          </div>
                        </Link>

                        <div className="absolute top-2 right-2">
                          <BotonFavorito
                            productoId={prod.id}
                            className="w-8 h-8 rounded-full bg-white/80 backdrop-blur-sm flex items-center justify-center text-gray-500"
                            onToggle={(nuevo) => { if (!nuevo) quitarDeLista(prod.id) }}
                          />
                        </div>
                      </div>
                    )
                  })}
                </div>
              </>
            )}
          </div>
        </div>
      </div>
    </>
  )
}