'use client'

import { useState, useEffect, Suspense } from 'react'
import { useParams, useSearchParams, useRouter } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'
import Navbar from '@/components/Navbar'
import MenuTakeover from '@/components/MenuTakeover'
import VolverAtras from '@/components/VolverAtras'
import BotonFavorito from '@/components/BotonFavorito'
import BarraFiltros from '@/components/BarraFiltros'

const MENU_CATEGORIAS = [
  'moda', 'belleza-y-bienestar', 'joyeria-y-accesorios',
  'hogar-y-deco', 'artes-y-oficios', 'bebes-y-maternidad',
  'juegos-y-juguetes', 'mascotas', 'libros',
  'deporte', 'vintage',
]

function fotoPrincipalDe(media) {
  if (!media?.length) return null
  const principal = media.find((m) => m.es_principal)
  if (principal) return principal.url
  const ordenadas = [...media].sort((a, b) => a.orden - b.orden)
  return ordenadas[0]?.url || null
}

function CategoriaContenido() {
  const supabase = createClient()
  const params = useParams()
  const searchParams = useSearchParams()
  const router = useRouter()
  const slug = params.slug

  const subParam = searchParams.get('sub')
  const generoParam = searchParams.get('genero')
  const sellosParam = searchParams.get('sellos')
  const sellosSeleccionados = sellosParam ? sellosParam.split(',').filter(Boolean) : []

  const [cargando, setCargando] = useState(true)
  const [cargandoProductos, setCargandoProductos] = useState(true)
  const [categoria, setCategoria] = useState(null)
  const [noExiste, setNoExiste] = useState(false)
  const [subcategorias, setSubcategorias] = useState([])
  const [todosSellos, setTodosSellos] = useState([])
  const [productos, setProductos] = useState([])
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

  // ── Categoría, subcategorías, sellos, menú (una vez por slug) ──
  useEffect(() => {
    async function cargar() {
      setCargando(true)

      const { data: cats } = await supabase
        .from('categorias')
        .select('id, nombre, slug')
        .eq('activa', true)
        .order('orden')
      if (cats) setCategorias(cats)

      const { data: cat, error: errorCat } = await supabase
        .from('categorias')
        .select('id, nombre, slug')
        .eq('slug', slug)
        .single()

      if (errorCat || !cat) {
        setNoExiste(true)
        setCargando(false)
        return
      }
      setCategoria(cat)

      const { data: subs } = await supabase
        .from('subcategorias')
        .select('id, nombre, slug')
        .eq('categoria_id', cat.id)
        .eq('activa', true)
        .order('orden')
      setSubcategorias(subs || [])

      const { data: sellosData } = await supabase
        .from('sellos')
        .select('id, nombre, slug')
        .eq('activa', true)
        .order('orden')
      setTodosSellos(sellosData || [])

      setCargando(false)
    }
    cargar()
  }, [slug])

  // ── Productos (se refetchean cuando cambia categoría, subcategoría o género) ──
  useEffect(() => {
    if (!categoria) return

    async function cargarProductos() {
      setCargandoProductos(true)

      const subId = subParam
        ? subcategorias.find((s) => s.slug === subParam)?.id
        : null

      let query = supabase
        .from('productos')
        .select(`
          id, nombre, precio, precio_anterior, genero,
          producto_media ( url, es_principal, orden ),
          vendedores ( nombre_negocio ),
          producto_sellos ( sello_id )
        `)
        .eq('estado', 'activo')
        .or(`categoria_id.eq.${categoria.id},categoria_secundaria_id.eq.${categoria.id}`)
        .order('creado_en', { ascending: false })

      if (subId) {
        query = query.or(`subcategoria_id.eq.${subId},subcategoria_secundaria_id.eq.${subId}`)
      }
      if (generoParam) {
        query = query.contains('genero', [generoParam])
      }

      const { data: prods } = await query

      const limpios = (prods || []).map((p) => ({
        ...p,
        fotoPrincipal: fotoPrincipalDe(p.producto_media),
        selloIds: (p.producto_sellos || []).map((ps) => ps.sello_id),
      }))
      setProductos(limpios)
      setCargandoProductos(false)
    }
    cargarProductos()
  }, [categoria, subParam, generoParam, subcategorias])

  function formatearPrecio(valor) {
    if (!valor) return ''
    return Number(valor).toLocaleString('es-AR')
  }

  function actualizarFiltros(nuevos) {
    const nuevosParams = new URLSearchParams(searchParams.toString())
    if (nuevos.sub) nuevosParams.set('sub', nuevos.sub); else nuevosParams.delete('sub')
    if (nuevos.genero) nuevosParams.set('genero', nuevos.genero); else nuevosParams.delete('genero')
    if (nuevos.sellos?.length) nuevosParams.set('sellos', nuevos.sellos.join(',')); else nuevosParams.delete('sellos')
    const query = nuevosParams.toString()
    router.replace(`/categoria/${slug}${query ? `?${query}` : ''}`, { scroll: false })
  }

  const menuCats = MENU_CATEGORIAS
    .map(s => categorias.find(c => c.slug === s))
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

  if (noExiste) {
    return (
      <>
        <link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Inter:wght@200;300;400;500;600;700;800;900&display=swap" />
        <div className="min-h-screen bg-white" style={{ fontFamily: "'Inter', sans-serif" }}>
          <Navbar onToggleMenu={() => setMenuOpen(!menuOpen)} variant="solid" />
          {menuOpen && <MenuTakeover categorias={menuCats} onClose={() => setMenuOpen(false)} />}
          <div className="pt-20 px-4 text-center">
            <VolverAtras href="/" texto="Volver al inicio" />
            <h1 className="text-2xl font-black text-[#0a0a0a] tracking-tight mt-4">No encontramos esa categoría</h1>
            <p className="text-[#0a0a0a]/40 font-light mt-2">Puede que el link esté mal o que la categoría ya no exista.</p>
          </div>
        </div>
      </>
    )
  }

  // Sellos con al menos un producto en esta categoría (antes de aplicar el filtro de sellos)
  const sellosIdsPresentes = new Set(productos.flatMap((p) => p.selloIds))
  const sellosDisponibles = todosSellos.filter((s) => sellosIdsPresentes.has(s.id))

  const sellosSeleccionadosIds = sellosSeleccionados
    .map((slug) => todosSellos.find((s) => s.slug === slug)?.id)
    .filter(Boolean)

  const productosMostrados = sellosSeleccionadosIds.length > 0
    ? productos.filter((p) => sellosSeleccionadosIds.every((id) => p.selloIds.includes(id)))
    : productos

  const hayFiltrosActivos = !!subParam || !!generoParam || sellosSeleccionados.length > 0

  return (
    <>
      <link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Inter:wght@200;300;400;500;600;700;800;900&display=swap" />

      <div className="min-h-screen bg-white" style={{ fontFamily: "'Inter', sans-serif" }}>

        {menuOpen && (
          <MenuTakeover categorias={menuCats} onClose={() => setMenuOpen(false)} />
        )}

        <Navbar onToggleMenu={() => setMenuOpen(!menuOpen)} variant="solid" />

        <div className="pt-20 pb-24 px-4 md:px-8">
          <div className="max-w-6xl mx-auto">

            <VolverAtras href="/" texto="Volver al inicio" />

            <h1 className="text-2xl md:text-4xl font-black text-[#0a0a0a] tracking-tight mb-1">
              {categoria.nombre}
            </h1>
            <p className="text-sm text-[#0a0a0a]/30 font-light mb-6">
              {cargandoProductos ? 'Buscando...' : `${productosMostrados.length} ${productosMostrados.length === 1 ? 'producto' : 'productos'}`}
            </p>

            <BarraFiltros
              subcategorias={subcategorias}
              sellos={sellosDisponibles}
              filtrosActivos={{ sub: subParam, genero: generoParam, sellos: sellosSeleccionados }}
              onFiltroChange={actualizarFiltros}
            />

            {/* Productos */}
            {!cargandoProductos && productosMostrados.length === 0 ? (
              <div className="text-center py-16 bg-[#F5F2EC] rounded-2xl">
                {productos.length === 0 ? (
                  <p className="text-[#0a0a0a]/30 font-light">Todavía no hay productos en este rubro. ¡Pronto va a haber!</p>
                ) : (
                  <>
                    <p className="text-[#0a0a0a]/30 font-light">No hay productos que coincidan con estos filtros.</p>
                    {hayFiltrosActivos && (
                      <button
                        type="button"
                        onClick={() => actualizarFiltros({ sub: null, genero: null, sellos: [] })}
                        className="mt-4 px-5 py-2 bg-[#0a0a0a] text-white rounded-full text-sm font-medium hover:bg-[#2a2a2a] transition cursor-pointer"
                      >
                        Limpiar filtros
                      </button>
                    )}
                  </>
                )}
              </div>
            ) : (
              <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4 md:gap-5">
                {productosMostrados.map((p) => {
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

export default function CategoriaPage() {
  return (
    <Suspense fallback={
      <div className="min-h-screen bg-white flex items-center justify-center" style={{ fontFamily: "'Inter', sans-serif" }}>
        <span className="text-[#0a0a0a]/30 text-sm font-light">Cargando...</span>
      </div>
    }>
      <CategoriaContenido />
    </Suspense>
  )
}
