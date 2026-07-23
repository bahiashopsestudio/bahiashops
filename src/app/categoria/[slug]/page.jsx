'use client'

import { useState, useEffect } from 'react'
import { useParams } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'
import Navbar from '@/components/Navbar'
import MenuTakeover from '@/components/MenuTakeover'
import VolverAtras from '@/components/VolverAtras'
import BotonFavorito from '@/components/BotonFavorito'

const MENU_CATEGORIAS = [
  'moda', 'belleza-y-cuidado-personal', 'gastronomia',
  'hogar-deco-y-jardin', 'diseno-y-artesanias', 'tecnologia',
  'salud-y-bienestar', 'arte-e-ilustracion',
]

export default function CategoriaPage() {
  const supabase = createClient()
  const params = useParams()
  const slug = params.slug

  const [cargando, setCargando] = useState(true)
  const [categoria, setCategoria] = useState(null)
  const [noExiste, setNoExiste] = useState(false)
  const [subcategorias, setSubcategorias] = useState([])
  const [productos, setProductos] = useState([])
  const [subActiva, setSubActiva] = useState(null)
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
      // Categorías para el menú
      const { data: cats } = await supabase
        .from('categorias')
        .select('id, nombre, slug')
        .eq('activa', true)
        .order('orden')
      if (cats) setCategorias(cats)

      // Categoría actual
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

      // Subcategorías
      const { data: subs } = await supabase
        .from('subcategorias')
        .select('id, nombre')
        .eq('categoria_id', cat.id)
        .eq('activa', true)
        .order('orden')
      setSubcategorias(subs || [])

      // Productos
      const { data: prods } = await supabase
        .from('productos')
        .select(`
          id, nombre, precio, precio_anterior, subcategoria_id,
          producto_media ( url, orden ),
          vendedores ( nombre_negocio )
        `)
        .eq('categoria_id', cat.id)
        .eq('estado', 'activo')
        .order('creado_en', { ascending: false })

      const limpios = (prods || []).map((p) => ({
        ...p,
        fotoPrincipal: [...(p.producto_media || [])].sort((a, b) => a.orden - b.orden)[0]?.url || null,
      }))
      setProductos(limpios)
      setCargando(false)
    }
    cargar()
  }, [slug])

  function formatearPrecio(valor) {
    if (!valor) return ''
    return Number(valor).toLocaleString('es-AR')
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

  const productosMostrados = subActiva
    ? productos.filter((p) => p.subcategoria_id === subActiva)
    : productos

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
              {productosMostrados.length} {productosMostrados.length === 1 ? 'producto' : 'productos'}
            </p>

            {/* Subcategorías */}
            {subcategorias.length > 0 && (
              <div className="flex flex-wrap gap-2 mb-8">
                <button
                  type="button"
                  onClick={() => setSubActiva(null)}
                  className={`px-4 py-2 rounded-full text-sm cursor-pointer transition ${
                    subActiva === null
                      ? 'bg-[#0a0a0a] text-white'
                      : 'bg-[#F5F2EC] text-[#0a0a0a]/60 hover:text-[#0a0a0a]'
                  }`}
                >
                  Todos
                </button>
                {subcategorias.map((sub) => (
                  <button
                    key={sub.id}
                    type="button"
                    onClick={() => setSubActiva(sub.id)}
                    className={`px-4 py-2 rounded-full text-sm cursor-pointer transition ${
                      subActiva === sub.id
                        ? 'bg-[#0a0a0a] text-white'
                        : 'bg-[#F5F2EC] text-[#0a0a0a]/60 hover:text-[#0a0a0a]'
                    }`}
                  >
                    {sub.nombre}
                  </button>
                ))}
              </div>
            )}

            {/* Productos */}
            {productosMostrados.length === 0 ? (
              <div className="text-center py-16 bg-[#F5F2EC] rounded-2xl">
                {productos.length === 0 ? (
                  <p className="text-[#0a0a0a]/30 font-light">Todavía no hay productos en este rubro. ¡Pronto va a haber!</p>
                ) : (
                  <>
                    <p className="text-[#0a0a0a]/30 font-light">No hay productos en esta subcategoría por ahora.</p>
                    <button
                      type="button"
                      onClick={() => setSubActiva(null)}
                      className="mt-4 px-5 py-2 bg-[#0a0a0a] text-white rounded-full text-sm font-medium hover:bg-[#2a2a2a] transition cursor-pointer"
                    >
                      Ver todos
                    </button>
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
                            <span className={`text-sm font-semibold ${enOferta ? 'text-[#e60000]' : 'text-[#0a0a0a]'}`}>
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