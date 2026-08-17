'use client'

import { useState, useEffect } from 'react'
import { useParams } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'
import Navbar from '@/components/Navbar'
import MenuTakeover from '@/components/MenuTakeover'
import VolverAtras from '@/components/VolverAtras'
import BotonFavorito from '@/components/BotonFavorito'

function fotoPrincipalDe(media) {
  if (!media?.length) return null
  const principal = media.find((m) => m.es_principal)
  if (principal) return principal.url
  const ordenadas = [...media].sort((a, b) => a.orden - b.orden)
  return ordenadas[0]?.url || null
}

export default function ValorPage() {
  const supabase = createClient()
  const params = useParams()
  const slug = params.slug

  const [cargando, setCargando] = useState(true)
  const [sello, setSello] = useState(null)
  const [noExiste, setNoExiste] = useState(false)
  const [productos, setProductos] = useState([])
  const [menuOpen, setMenuOpen] = useState(false)

  useEffect(() => {
    document.body.style.overflow = menuOpen ? 'hidden' : ''
    return () => { document.body.style.overflow = '' }
  }, [menuOpen])

  useEffect(() => {
    async function cargar() {
      setCargando(true)

      const { data: selloData, error } = await supabase
        .from('sellos')
        .select('id, nombre, slug')
        .eq('slug', slug)
        .eq('activa', true)
        .maybeSingle()

      if (error || !selloData) {
        setNoExiste(true)
        setCargando(false)
        return
      }
      setSello(selloData)

      // !inner filtra los productos que tienen este sello: sin el inner join
      // traería todos los productos y el filtro no se aplicaría.
      const { data: prods } = await supabase
        .from('productos')
        .select(`
          id, nombre, precio, precio_anterior,
          producto_media ( url, es_principal, orden ),
          vendedores ( nombre_negocio ),
          producto_sellos!inner ( sello_id )
        `)
        .eq('estado', 'activo')
        .eq('producto_sellos.sello_id', selloData.id)
        .order('creado_en', { ascending: false })

      setProductos(
        (prods || []).map((p) => ({ ...p, fotoPrincipal: fotoPrincipalDe(p.producto_media) }))
      )
      setCargando(false)
    }
    cargar()
  }, [slug])

  function formatearPrecio(valor) {
    if (!valor) return ''
    return Number(valor).toLocaleString('es-AR')
  }

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

  if (noExiste) {
    return (
      <>
        <link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Inter:wght@200;300;400;500;600;700;800;900&display=swap" />
        <div className="min-h-screen bg-white" style={{ fontFamily: "'Inter', sans-serif" }}>
          {menuOpen && <MenuTakeover onClose={() => setMenuOpen(false)} />}
          <Navbar onToggleMenu={() => setMenuOpen(!menuOpen)} variant="solid" />
          <div className="pt-20 px-4 text-center">
            <VolverAtras href="/" texto="Volver al inicio" />
            <h1 className="text-2xl font-black text-[#0a0a0a] tracking-tight mt-4">No encontramos ese valor</h1>
            <p className="text-[#0a0a0a]/40 font-light mt-2">Puede que el link esté mal o que ya no exista.</p>
          </div>
        </div>
      </>
    )
  }

  return (
    <>
      <link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Inter:wght@200;300;400;500;600;700;800;900&display=swap" />

      <div className="min-h-screen bg-white" style={{ fontFamily: "'Inter', sans-serif" }}>

        {menuOpen && <MenuTakeover onClose={() => setMenuOpen(false)} />}

        <Navbar onToggleMenu={() => setMenuOpen(!menuOpen)} variant="solid" />

        <div className="pt-20 pb-24 px-4 md:px-8">
          <div className="max-w-6xl mx-auto">

            <VolverAtras href="/" texto="Volver al inicio" />

            <h1 className="text-2xl md:text-4xl font-black text-[#0a0a0a] tracking-tight mb-1">
              {sello.nombre}
            </h1>
            <p className="text-sm text-[#0a0a0a]/30 font-light mb-6">
              {productos.length} {productos.length === 1 ? 'producto' : 'productos'}
            </p>

            {productos.length === 0 ? (
              <div className="text-center py-16 bg-[#F5F2EC] rounded-2xl">
                <p className="text-[#0a0a0a]/30 font-light">
                  Todavía no hay productos con este valor. ¡Pronto va a haber!
                </p>
              </div>
            ) : (
              <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4 md:gap-5">
                {productos.map((p) => {
                  const enOferta = p.precio_anterior && Number(p.precio_anterior) > Number(p.precio)
                  return (
                    <div key={p.id} className="relative">
                      <Link href={`/producto/${p.id}`} className="block group">
                        <div className="aspect-square bg-[#ECEAE3] rounded-xl overflow-hidden">
                          {p.fotoPrincipal ? (
                            <img
                              src={p.fotoPrincipal}
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
                            {p.vendedores?.nombre_negocio || ''}
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
            )}
          </div>
        </div>
      </div>
    </>
  )
}
