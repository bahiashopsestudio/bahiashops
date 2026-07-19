'use client'

import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import VolverAtras from '@/components/VolverAtras'
import BotonFavorito from '@/components/BotonFavorito'

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

  useEffect(() => {
    async function cargar() {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) {
        setLogueado(false)
        setCargando(false)
        return
      }

      // Traer los IDs de productos favoritos del usuario
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

      // Traer los datos de esos productos (solo activos)
      const { data: prods } = await supabase
        .from('productos')
        .select(`
          id, nombre, precio, precio_anterior,
          vendedor:vendedores(id, nombre_negocio, slug),
          media:producto_media(url, es_principal, orden)
        `)
        .in('id', ids)
        .eq('estado', 'activo')

      // Mantener el orden de favoritos (más reciente primero)
      const ordenado = ids
        .map(id => (prods || []).find(p => p.id === id))
        .filter(Boolean)

      setProductos(ordenado)
      setCargando(false)
    }
    cargar()
  }, [])

  // Cuando se quita un favorito, sacarlo de la lista sin recargar
  function quitarDeLista(productoId) {
    setProductos(prev => prev.filter(p => p.id !== productoId))
  }

  if (cargando) {
    return (
      <main className="min-h-screen flex items-center justify-center">
        <p className="text-gray-400">Cargando...</p>
      </main>
    )
  }

  if (!logueado) {
    return (
      <main className="min-h-screen bg-white px-4 pt-20 pb-28 lg:pt-10 lg:pb-10">
        <div className="max-w-lg mx-auto text-center py-16">
          <VolverAtras href="/" texto="Inicio" />
          <h1 className="text-xl font-bold text-gray-900 mb-2">Mis favoritos</h1>
          <p className="text-gray-400 mb-6">Iniciá sesión para ver tus productos guardados</p>
          <Link
            href="/login"
            className="inline-block bg-[#222] text-white px-6 py-3 rounded-full text-sm font-semibold hover:bg-[#333] transition"
          >
            Iniciar sesión
          </Link>
        </div>
      </main>
    )
  }

  return (
    <main className="min-h-screen bg-white px-4 pt-20 pb-28 lg:pt-10 lg:pb-10">
      <div className="max-w-5xl mx-auto">

        <VolverAtras href="/" texto="Inicio" />

        <h1 className="text-xl font-bold text-gray-900 mb-1">Mis favoritos</h1>

        {/* Sin favoritos */}
        {productos.length === 0 && (
          <div className="text-center py-16">
            <svg className="w-12 h-12 text-gray-200 mx-auto mb-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M21 8.25c0-2.485-2.099-4.5-4.688-4.5-1.935 0-3.597 1.126-4.312 2.733-.715-1.607-2.377-2.733-4.313-2.733C5.1 3.75 3 5.765 3 8.25c0 7.22 9 12 9 12s9-4.78 9-12Z" />
            </svg>
            <p className="text-gray-400 text-lg mb-2">Todavía no guardaste productos</p>
            <p className="text-gray-300 text-sm mb-6">Tocá el corazón en cualquier producto para guardarlo acá</p>
            <button
              onClick={() => router.push('/')}
              className="bg-[#222] text-white px-6 py-3 rounded-full text-sm font-semibold hover:bg-[#333] transition cursor-pointer"
            >
              Explorar productos
            </button>
          </div>
        )}

        {/* Contador */}
        {productos.length > 0 && (
          <p className="text-sm text-gray-400 mb-6">
            {productos.length} {productos.length === 1 ? 'producto guardado' : 'productos guardados'}
          </p>
        )}

        {/* Grilla de favoritos */}
        {productos.length > 0 && (
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4">
            {productos.map((prod) => {
              const imageUrl = getImageUrl(prod.media)
              return (
                <div key={prod.id} className="relative group">
                  <Link href={`/producto/${prod.id}`}>
                    <div className="aspect-square bg-[#e8e5dd] rounded-2xl overflow-hidden flex items-center justify-center">
                      {imageUrl ? (
                        <img src={imageUrl} alt={prod.nombre} className="w-full h-full object-cover" />
                      ) : (
                        <span className="text-gray-400 text-xs">foto</span>
                      )}
                    </div>
                    <div className="mt-2.5 px-0.5">
                      <p className="text-sm font-medium text-gray-900 group-hover:text-[#8B7EC8] transition truncate">
                        {prod.nombre}
                      </p>
                      <p className="text-xs text-gray-400 mt-0.5">
                        {prod.vendedor?.nombre_negocio}
                      </p>
                      <div className="flex items-center gap-2 mt-1">
                        {prod.precio_anterior && (
                          <span className="text-xs text-gray-400 line-through">
                            ${Number(prod.precio_anterior).toLocaleString('es-AR')}
                          </span>
                        )}
                        <span className="text-sm font-semibold text-gray-900">
                          ${Number(prod.precio).toLocaleString('es-AR')}
                        </span>
                      </div>
                    </div>
                  </Link>

                  {/* Corazón en la esquina de la imagen */}
                  <div className="absolute top-2 right-2">
                    <BotonFavorito
                      productoId={prod.id}
                      className="w-8 h-8 rounded-full bg-white/80 backdrop-blur-sm flex items-center justify-center text-gray-500 hover:text-[#8B7EC8]"
                      onToggle={(nuevo) => { if (!nuevo) quitarDeLista(prod.id) }}
                    />
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>
    </main>
  )
}
