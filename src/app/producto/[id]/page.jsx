'use client'

import { useState, useEffect } from 'react'
import { useParams } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'
import { useCarrito } from '@/context/CarritoContext'
import Navbar from '@/components/Navbar'
import MenuTakeover from '@/components/MenuTakeover'
import VolverAtras from '@/components/VolverAtras'
import BotonFavorito from '@/components/BotonFavorito'

const MENU_CATEGORIAS = [
  'moda', 'belleza-y-cuidado-personal', 'gastronomia',
  'hogar-deco-y-jardin', 'diseno-y-artesanias', 'tecnologia',
  'salud-y-bienestar', 'arte-e-ilustracion',
]

export default function PaginaProducto() {
  const supabase = createClient()
  const { agregar } = useCarrito()
  const params = useParams()
  const productoId = params.id

  const [producto, setProducto] = useState(null)
  const [fotos, setFotos] = useState([])
  const [variantes, setVariantes] = useState([])
  const [vendedor, setVendedor] = useState(null)
  const [categoria, setCategoria] = useState(null)
  const [categorias, setCategorias] = useState([])
  const [fotoActiva, setFotoActiva] = useState(0)
  const [varianteElegida, setVarianteElegida] = useState('')
  const [cargando, setCargando] = useState(true)
  const [noEncontrado, setNoEncontrado] = useState(false)
  const [menuOpen, setMenuOpen] = useState(false)

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

      const { data: prod, error } = await supabase
        .from('productos')
        .select('*')
        .eq('id', productoId)
        .single()

      if (error || !prod) {
        setNoEncontrado(true)
        setCargando(false)
        return
      }
      setProducto(prod)

      const { data: media } = await supabase
        .from('producto_media')
        .select('url, orden, es_principal')
        .eq('producto_id', productoId)
        .order('orden')
      if (media) setFotos(media)

      const { data: vars } = await supabase
        .from('producto_variantes')
        .select('propiedad_1_valor')
        .eq('producto_id', productoId)
      if (vars) setVariantes(vars)

      const { data: vend } = await supabase
        .from('vendedores')
        .select('nombre_negocio, slug')
        .eq('id', prod.vendedor_id)
        .single()
      if (vend) setVendedor(vend)

      const { data: cat } = await supabase
        .from('categorias')
        .select('nombre, slug')
        .eq('id', prod.categoria_id)
        .single()
      if (cat) setCategoria(cat)

      setCargando(false)
    }
    cargar()
  }, [productoId])

  function formatearPrecio(valor) {
    if (!valor) return ''
    return Number(valor).toLocaleString('es-AR')
  }

  const menuCats = MENU_CATEGORIAS
    .map(slug => categorias.find(c => c.slug === slug))
    .filter(Boolean)

  if (cargando) {
    return (
      <>
        <link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Inter:wght@200;300;400;500;600;700;800;900&display=swap" />
        <div className="min-h-screen bg-white flex items-center justify-center" style={{ fontFamily: "'Inter', sans-serif" }}>
          <span className="text-[#0a0a0a]/30 text-sm font-light">Cargando producto...</span>
        </div>
      </>
    )
  }

  if (noEncontrado) {
    return (
      <>
        <link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Inter:wght@200;300;400;500;600;700;800;900&display=swap" />
        <div className="min-h-screen bg-white" style={{ fontFamily: "'Inter', sans-serif" }}>
          <Navbar onToggleMenu={() => setMenuOpen(!menuOpen)} variant="solid" />
          {menuOpen && <MenuTakeover categorias={menuCats} onClose={() => setMenuOpen(false)} />}
          <div className="pt-20 px-4 text-center">
            <VolverAtras href="/" texto="Volver al inicio" />
            <p className="text-[#0a0a0a]/40 font-light mt-4">No encontramos este producto.</p>
          </div>
        </div>
      </>
    )
  }

  const hayOferta = producto.precio_anterior && Number(producto.precio_anterior) > Number(producto.precio)

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

            <div className="flex items-center gap-1.5 text-xs font-light text-[#0a0a0a]/30 mb-8 -mt-2">
              <Link href="/" className="hover:text-[#0a0a0a]/60 transition">Inicio</Link>
              {categoria && (
                <>
                  <span>·</span>
                  <Link href={`/categoria/${categoria.slug}`} className="hover:text-[#0a0a0a]/60 transition underline underline-offset-2">
                    {categoria.nombre}
                  </Link>
                </>
              )}
              <span>·</span>
              <span className="text-[#0a0a0a]/50">{producto.nombre}</span>
            </div>

            <div className="flex flex-col md:flex-row gap-8 md:gap-12">

              <div className="flex-1 min-w-0 relative">
                {fotos.length > 0 ? (
                  <>
                    <div className="aspect-square bg-[#ECEAE3] rounded-2xl overflow-hidden">
                      <img
                        src={fotos[fotoActiva].url}
                        alt={producto.nombre}
                        className="w-full h-full object-cover"
                      />
                    </div>
                    <div className="absolute top-4 right-4">
                      <BotonFavorito
                        productoId={producto.id}
                        className="w-10 h-10 rounded-full bg-white/80 backdrop-blur-sm flex items-center justify-center text-gray-500 shadow-sm"
                      />
                    </div>
                    {fotos.length > 1 && (
                      <div className="flex gap-2 mt-3">
                        {fotos.map((foto, index) => (
                          <button
                            key={foto.url}
                            onClick={() => setFotoActiva(index)}
                            className={`w-16 h-16 rounded-lg overflow-hidden cursor-pointer transition ${
                              index === fotoActiva
                                ? 'ring-2 ring-[#0a0a0a] ring-offset-2 ring-offset-white'
                                : 'opacity-50 hover:opacity-100'
                            }`}
                          >
                            <img src={foto.url} alt={`Vista ${index + 1}`} className="w-full h-full object-cover" />
                          </button>
                        ))}
                      </div>
                    )}
                  </>
                ) : (
                  <div className="aspect-square bg-[#ECEAE3] rounded-2xl flex items-center justify-center">
                    <span className="text-[#0a0a0a]/20 text-sm font-light">Sin foto</span>
                  </div>
                )}
              </div>

              <div className="flex-1 min-w-0">
                {vendedor && (
                  <Link
                    href={`/tienda/${vendedor.slug}`}
                    className="text-sm font-light text-[#0a0a0a]/40 hover:text-[#0a0a0a] transition underline underline-offset-2"
                  >
                    {vendedor.nombre_negocio}
                  </Link>
                )}

                <h1 className="text-2xl md:text-3xl font-black text-[#0a0a0a] tracking-tight mt-2 mb-4">
                  {producto.nombre}
                </h1>

                <div className="mb-6">
                  {hayOferta && (
                    <span className="text-[#0a0a0a]/30 line-through text-base font-light mr-3">
                      ${formatearPrecio(producto.precio_anterior)}
                    </span>
                  )}
                  <span className="text-2xl font-black text-[#0a0a0a] tracking-tight">
                    ${formatearPrecio(producto.precio)}
                  </span>
                  {hayOferta && (
                    <span className="ml-3 bg-[#e60000] text-white text-xs font-medium px-2.5 py-1 rounded-full">
                      Oferta
                    </span>
                  )}
                </div>

                {producto.marca && (
                  <p className="text-sm text-[#0a0a0a]/40 font-light mb-4">
                    <span className="font-medium text-[#0a0a0a]/60">Marca:</span> {producto.marca}
                  </p>
                )}

                {variantes.length > 0 && producto.propiedad_1_nombre && (
                  <div className="mb-6">
                    <label className="block text-sm font-medium text-[#0a0a0a]/60 mb-2">
                      {producto.propiedad_1_nombre}
                    </label>
                    <div className="flex flex-wrap gap-2">
                      {variantes.map((v) => (
                        <button
                          key={v.propiedad_1_valor}
                          type="button"
                          onClick={() => setVarianteElegida(v.propiedad_1_valor)}
                          className={`px-4 py-2 rounded-full text-sm cursor-pointer transition ${
                            varianteElegida === v.propiedad_1_valor
                              ? 'bg-[#0a0a0a] text-white'
                              : 'bg-white text-[#0a0a0a] hover:bg-[#0a0a0a]/5'
                          }`}
                        >
                          {v.propiedad_1_valor}
                        </button>
                      ))}
                    </div>
                  </div>
                )}

                <button
                  type="button"
                  onClick={() => {
                    if (variantes.length > 0 && producto.propiedad_1_nombre && !varianteElegida) {
                      alert(`Elegí ${producto.propiedad_1_nombre.toLowerCase()} antes de agregar.`)
                      return
                    }

                    const itemParaCarrito = {
                      productoId: producto.id,
                      nombre: producto.nombre,
                      precio: Number(producto.precio),
                      foto: fotos.length > 0 ? fotos[0].url : null,
                      variante: varianteElegida || null,
                      cantidad: 1,
                    }

                    const vendedorParaCarrito = {
                      id: producto.vendedor_id,
                      nombre: vendedor ? vendedor.nombre_negocio : 'Local',
                    }

                    agregar(itemParaCarrito, vendedorParaCarrito)
                    alert('¡Agregado al carrito!')
                  }}
                  className="w-full py-3.5 bg-[#0a0a0a] text-white rounded-full text-sm font-medium hover:bg-[#2a2a2a] transition cursor-pointer"
                >
                  Agregar al carrito
                </button>

                {producto.tiempo_preparacion && (
                  <p className="mt-4 text-sm text-[#0a0a0a]/30 font-light">
                    Tiempo de preparación: {producto.tiempo_preparacion.replaceAll('_', ' ')}
                  </p>
                )}

                {producto.descripcion && (
                  <div className="mt-8 pt-6 border-t border-[#0a0a0a]/5">
                    <h2 className="text-lg font-black text-[#0a0a0a] tracking-tight mb-3">Descripción</h2>
                    <p className="whitespace-pre-line leading-relaxed text-[#0a0a0a]/50 font-light">
                      {producto.descripcion}
                    </p>
                  </div>
                )}
              </div>
            </div>

          </div>
        </div>
      </div>
    </>
  )
}