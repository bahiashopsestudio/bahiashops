'use client'

import { useState, useEffect } from 'react'
import { useSearchParams } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import Link from 'next/link'
import Buscador from '@/components/Buscador'
import VolverAtras from '@/components/VolverAtras'
import BotonFavorito from '@/components/BotonFavorito'

function getImageUrl(media) {
  if (!media?.length) return null
  const principal = media.find(m => m.es_principal)
  if (principal) return principal.url
  const sorted = [...media].sort((a, b) => a.orden - b.orden)
  return sorted[0]?.url || null
}

export default function BuscarPage() {
  const searchParams = useSearchParams()
  const q = searchParams.get('q') || ''

  const supabase = createClient()

  const [resultados, setResultados] = useState([])
  const [cargando, setCargando] = useState(true)

  useEffect(() => {
    async function buscar() {
      if (!q.trim()) {
        setResultados([])
        setCargando(false)
        return
      }

      setCargando(true)

      const { data, error } = await supabase
        .from('productos')
        .select(`
          id, nombre, precio, precio_anterior,
          vendedor:vendedores(id, nombre_negocio, slug),
          media:producto_media(url, es_principal, orden)
        `)
        .eq('estado', 'activo')
        .or(`nombre.ilike.%${q.trim()}%,descripcion.ilike.%${q.trim()}%`)
        .order('creado_en', { ascending: false })
        .limit(30)

      if (error) console.error('Error buscando:', error)
      setResultados(data || [])
      setCargando(false)
    }
    buscar()
  }, [q])

  return (
    <main className="min-h-screen bg-white px-4 pt-20 pb-28 lg:pt-8 lg:pb-10">
      <div className="max-w-5xl mx-auto">

        <VolverAtras href="/" texto="Inicio" />

        <div className="mb-8">
          <Buscador
            placeholder="¿Qué estás buscando?"
            mostrarFlecha
            className="max-w-lg"
          />
        </div>

        {q && (
          <h1 className="text-xl font-bold text-gray-900 mb-1">
            Resultados para "{q}"
          </h1>
        )}

        {!q && (
          <div className="text-center py-16">
            <p className="text-gray-400 text-lg">Escribí algo para buscar productos</p>
          </div>
        )}

        {cargando && q && (
          <p className="text-gray-400 mt-4">Buscando...</p>
        )}

        {!cargando && q && resultados.length === 0 && (
          <div className="text-center py-16">
            <p className="text-gray-400 text-lg mb-2">No encontramos productos con "{q}"</p>
            <p className="text-gray-300 text-sm">Probá con otras palabras o revisá que esté bien escrito</p>
          </div>
        )}

        {!cargando && resultados.length > 0 && (
          <p className="text-sm text-gray-400 mb-6">
            {resultados.length} {resultados.length === 1 ? 'producto' : 'productos'}
          </p>
        )}

        {!cargando && resultados.length > 0 && (
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4">
            {resultados.map((prod) => {
              const imageUrl = getImageUrl(prod.media)
              return (
                <div key={prod.id} className="relative group">
                  <Link
                    href={`/producto/${prod.id}`}
                    className="block"
                  >
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
        )}
      </div>
    </main>
  )
}
