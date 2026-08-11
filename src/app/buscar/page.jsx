'use client'

import { useState, useEffect } from 'react'
import { useSearchParams, useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import Link from 'next/link'
import { Suspense } from 'react'
import Navbar from '@/components/Navbar'
import MenuTakeover from '@/components/MenuTakeover'
import VolverAtras from '@/components/VolverAtras'
import Buscador from '@/components/Buscador'
import BotonFavorito from '@/components/BotonFavorito'
import BarraFiltros from '@/components/BarraFiltros'

const MENU_CATEGORIAS = ['moda','belleza-y-bienestar','joyeria-y-accesorios','hogar-y-deco','artes-y-oficios','bebes-y-maternidad','juegos-y-juguetes','mascotas','libros','deporte','vintage']

function getImageUrl(media) {
  if (!media?.length) return null
  const principal = media.find(m => m.es_principal)
  if (principal) return principal.url
  const sorted = [...media].sort((a, b) => a.orden - b.orden)
  return sorted[0]?.url || null
}

function BuscarContenido() {
  const supabase = createClient()
  const searchParams = useSearchParams()
  const router = useRouter()
  const q = searchParams.get('q') || ''
  const generoParam = searchParams.get('genero')
  const sellosParam = searchParams.get('sellos')
  const sellosSeleccionados = sellosParam ? sellosParam.split(',').filter(Boolean) : []

  const [productos, setProductos] = useState([])
  const [tiendas, setTiendas] = useState([])
  const [todosSellos, setTodosSellos] = useState([])
  const [cargando, setCargando] = useState(false)
  const [buscado, setBuscado] = useState(false)
  const [menuOpen, setMenuOpen] = useState(false)
  const [categorias, setCategorias] = useState([])

  useEffect(() => {
    if (menuOpen) { document.body.style.overflow = 'hidden' } else { document.body.style.overflow = '' }
    return () => { document.body.style.overflow = '' }
  }, [menuOpen])

  useEffect(() => {
    async function cargarCats() {
      const { data } = await supabase.from('categorias').select('id, nombre, slug').eq('activa', true).order('orden')
      if (data) setCategorias(data)

      const { data: sellosData } = await supabase.from('sellos').select('id, nombre, slug').eq('activa', true).order('orden')
      if (sellosData) setTodosSellos(sellosData)
    }
    cargarCats()
  }, [])

  useEffect(() => {
    if (!q.trim()) { setProductos([]); setTiendas([]); setBuscado(false); return }
    buscar(q.trim())
  }, [q, generoParam])

  async function buscar(termino) {
    setCargando(true)
    setBuscado(true)

    let query = supabase
      .from('productos')
      .select(`
        id, nombre, precio, precio_anterior, genero,
        vendedor:vendedores(id, nombre_negocio, slug),
        media:producto_media(url, es_principal, orden),
        producto_sellos ( sello_id )
      `)
      .eq('estado', 'activo')
      .or(`nombre.ilike.%${termino}%,descripcion.ilike.%${termino}%`)
      .order('creado_en', { ascending: false })
      .limit(50)

    if (generoParam) {
      query = query.contains('genero', [generoParam])
    }

    const { data: prods } = await query

    const { data: vendedores } = await supabase
      .from('vendedores')
      .select('id, nombre_negocio, slug, logo_url, descripcion_corta')
      .eq('estado_validacion', 'aprobado')
      .ilike('nombre_negocio', `%${termino}%`)
      .limit(5)

    const limpios = (prods || []).map((p) => ({
      ...p,
      selloIds: (p.producto_sellos || []).map((ps) => ps.sello_id),
    }))

    setProductos(limpios)
    setTiendas(vendedores || [])
    setCargando(false)
  }

  function actualizarFiltros(nuevos) {
    const nuevosParams = new URLSearchParams(searchParams.toString())
    if (nuevos.genero) nuevosParams.set('genero', nuevos.genero); else nuevosParams.delete('genero')
    if (nuevos.sellos?.length) nuevosParams.set('sellos', nuevos.sellos.join(',')); else nuevosParams.delete('sellos')
    router.replace(`/buscar?${nuevosParams.toString()}`, { scroll: false })
  }

  const menuCats = MENU_CATEGORIAS.map(s => categorias.find(c => c.slug === s)).filter(Boolean)

  // Sellos con al menos un producto en estos resultados (antes de aplicar el filtro de sellos)
  const sellosIdsPresentes = new Set(productos.flatMap((p) => p.selloIds))
  const sellosDisponibles = todosSellos.filter((s) => sellosIdsPresentes.has(s.id))

  const sellosSeleccionadosIds = sellosSeleccionados
    .map((slug) => todosSellos.find((s) => s.slug === slug)?.id)
    .filter(Boolean)

  const productosMostrados = sellosSeleccionadosIds.length > 0
    ? productos.filter((p) => sellosSeleccionadosIds.every((id) => p.selloIds.includes(id)))
    : productos

  const totalResultados = productosMostrados.length + tiendas.length

  return (
    <>
      <link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Inter:wght@200;300;400;500;600;700;800;900&display=swap" />
      <div className="min-h-screen bg-white" style={{ fontFamily: "'Inter', sans-serif" }}>
        {menuOpen && <MenuTakeover categorias={menuCats} onClose={() => setMenuOpen(false)} />}
        <Navbar onToggleMenu={() => setMenuOpen(!menuOpen)} variant="solid" />

        <div className="pt-20 pb-24 px-4 md:px-8">
          <div className="max-w-5xl mx-auto">

            <VolverAtras href="/" texto="Volver al inicio" />

            <h1 className="text-2xl md:text-3xl font-black text-[#0a0a0a] tracking-tight mb-6">
              Buscar
            </h1>

            {/* Buscador */}
            <div className="max-w-xl mb-8">
              <Buscador placeholder="Productos, tiendas..." mostrarFlecha />
            </div>

            {q.trim() && (
              <BarraFiltros
                sellos={sellosDisponibles}
                filtrosActivos={{ sub: null, genero: generoParam, sellos: sellosSeleccionados }}
                onFiltroChange={actualizarFiltros}
              />
            )}

            {cargando && (
              <p className="text-[#0a0a0a]/30 text-sm font-light">Buscando...</p>
            )}

            {!cargando && buscado && totalResultados === 0 && (
              <div className="text-center py-16">
                <p className="text-[#0a0a0a]/40 font-light mb-2">No encontramos resultados para "{q}"</p>
                <p className="text-xs text-[#0a0a0a]/20 font-light">Probá con otras palabras</p>
              </div>
            )}

            {/* Tiendas */}
            {tiendas.length > 0 && (
              <section className="mb-10">
                <h2 className="text-lg font-black text-[#0a0a0a] tracking-tight mb-4">Tiendas</h2>
                <div className="flex gap-3 overflow-x-auto pb-2" style={{ scrollbarWidth: 'none' }}>
                  {tiendas.map((t) => (
                    <Link
                      key={t.id}
                      href={`/tienda/${t.slug}`}
                      className="shrink-0 flex items-center gap-3 px-4 py-3 rounded-2xl border border-[#0a0a0a]/5 hover:border-[#0a0a0a]/15 transition w-64"
                    >
                      <div className="w-10 h-10 rounded-xl bg-[#ECEAE3] shrink-0 overflow-hidden">
                        {t.logo_url ? (
                          <img src={t.logo_url} alt={t.nombre_negocio} className="w-full h-full object-cover" />
                        ) : (
                          <div className="w-full h-full flex items-center justify-center text-[#0a0a0a] text-sm font-bold bg-[#0a0a0a]/5">
                            {t.nombre_negocio.charAt(0)}
                          </div>
                        )}
                      </div>
                      <div className="min-w-0">
                        <p className="text-sm font-medium text-[#0a0a0a] truncate">{t.nombre_negocio}</p>
                        {t.descripcion_corta && (
                          <p className="text-xs text-[#0a0a0a]/30 font-light truncate">{t.descripcion_corta}</p>
                        )}
                      </div>
                    </Link>
                  ))}
                </div>
              </section>
            )}

            {/* Productos */}
            {productosMostrados.length > 0 && (
              <section>
                <h2 className="text-lg font-black text-[#0a0a0a] tracking-tight mb-4">
                  Productos {buscado && <span className="text-[#0a0a0a]/20 font-light text-sm ml-1">({productosMostrados.length})</span>}
                </h2>
                <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4 md:gap-5">
                  {productosMostrados.map((prod) => {
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
                            <p className="text-sm font-medium text-[#0a0a0a] group-hover:text-[#0a0a0a]/50 transition truncate">{prod.nombre}</p>
                            <p className="text-xs text-[#0a0a0a]/30 font-light mt-0.5">{prod.vendedor?.nombre_negocio}</p>
                            <div className="flex items-center gap-2 mt-1">
                              {enOferta && (
                                <span className="text-xs text-[#0a0a0a]/30 line-through font-light">${Number(prod.precio_anterior).toLocaleString('es-AR')}</span>
                              )}
                              <span className={`text-sm font-semibold ${enOferta ? 'text-[#4164fe]' : 'text-[#0a0a0a]'}`}>
                                ${Number(prod.precio).toLocaleString('es-AR')}
                              </span>
                            </div>
                          </div>
                        </Link>
                        <div className="absolute top-2 right-2">
                          <BotonFavorito productoId={prod.id} className="w-8 h-8 rounded-full bg-white/80 backdrop-blur-sm flex items-center justify-center text-gray-500" />
                        </div>
                      </div>
                    )
                  })}
                </div>
              </section>
            )}
          </div>
        </div>
      </div>
    </>
  )
}

export default function BuscarPage() {
  return (
    <Suspense fallback={
      <div className="min-h-screen bg-white flex items-center justify-center" style={{ fontFamily: "'Inter', sans-serif" }}>
        <span className="text-[#0a0a0a]/30 text-sm font-light">Cargando...</span>
      </div>
    }>
      <BuscarContenido />
    </Suspense>
  )
}