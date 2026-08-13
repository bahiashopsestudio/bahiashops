'use client'

import { useState, useEffect } from 'react'
import { useCarrito } from '@/context/CarritoContext'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import Navbar from '@/components/Navbar'
import MenuTakeover from '@/components/MenuTakeover'
import VolverAtras from '@/components/VolverAtras'
import Link from 'next/link'

const MENU_CATEGORIAS = [
  'moda', 'belleza-y-bienestar', 'joyeria-y-accesorios',
  'hogar-y-deco', 'artes-y-oficios', 'bebes-y-maternidad',
  'juegos-y-juguetes', 'mascotas', 'libros',
  'deporte', 'vintage',
]

export default function PaginaCarrito() {
  const { locales, cambiarCantidad, quitar, subtotalLocal, listo } = useCarrito()
  const router = useRouter()
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

  function formatearPrecio(valor) {
    return Number(valor).toLocaleString('es-AR')
  }

  const menuCats = MENU_CATEGORIAS
    .map(slug => categorias.find(c => c.slug === slug))
    .filter(Boolean)

  if (!listo) {
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
      <link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Fraunces:opsz,wght@9..144,100..900&family=Poppins:wght@300;400;500&display=swap" />

      <div className="min-h-screen bg-white" style={{ fontFamily: "'Inter', sans-serif" }}>

        {menuOpen && (
          <MenuTakeover categorias={menuCats} onClose={() => setMenuOpen(false)} />
        )}

        <Navbar onToggleMenu={() => setMenuOpen(!menuOpen)} variant="solid" />

        <div className="pt-20 pb-24 px-4 md:px-8">
          <div className="max-w-2xl mx-auto">

            <VolverAtras href="/" texto="Seguir comprando" />

            <p style={{ fontFamily: "'Inter', sans-serif", fontSize: '10px', textTransform: 'uppercase', letterSpacing: '2px', color: 'rgba(10,10,10,0.3)', marginBottom: '10px' }}>
              Tu compra
            </p>
            <h1 className="text-[26px] md:text-[30px]" style={{ fontFamily: 'Fraunces, serif', fontWeight: 500, color: '#0a0a0a', marginBottom: '4px' }}>
              Tu carrito
            </h1>

            {locales.length === 0 ? (
              <div className="text-center py-20">
                <p className="text-[#0a0a0a]/30 font-light mb-6">Todavía no agregaste nada.</p>
                <Link
                  href="/"
                  className="inline-block bg-[#0a0a0a] text-white border border-[#0a0a0a] hover:bg-transparent hover:text-[#0a0a0a] transition-colors"
                  style={{ fontFamily: "'Inter', sans-serif", fontWeight: 500, fontSize: '14px', borderRadius: '4px', padding: '14px 28px' }}
                >
                  Seguir mirando
                </Link>
              </div>
            ) : (
              <>
                <p style={{ fontFamily: 'Poppins, sans-serif', fontWeight: 300, fontSize: '13px', color: 'rgba(10,10,10,0.45)', marginBottom: '24px' }}>
                  Tenés productos de {locales.length} {locales.length === 1 ? 'local' : 'locales'}.
                </p>

                {locales.map((local) => (
                  <div
                    key={local.vendedorId}
                    className="rounded-2xl border border-[#0a0a0a]/5 p-5 mb-4"
                  >
                    <div className="flex items-center gap-2 mb-3">
                      <span className="font-medium text-[#0a0a0a] text-sm">{local.vendedorNombre}</span>
                    </div>

                    {local.items.map((item) => (
                      <div
                        key={item.productoId}
                        className="flex items-center gap-3 py-3 border-t border-[#0a0a0a]/5"
                      >
                        <div className="w-14 h-14 rounded-xl bg-[#ECEAE3] shrink-0 overflow-hidden">
                          {item.foto && (
                            <img src={item.foto} alt={item.nombre} className="w-full h-full object-cover" />
                          )}
                        </div>

                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium text-[#0a0a0a] truncate">{item.nombre}</p>
                          {item.variante && (
                            <p className="text-xs text-[#0a0a0a]/30 font-light mt-0.5">{item.variante}</p>
                          )}
                          <p className="text-sm text-[#0a0a0a]/60 mt-0.5">${formatearPrecio(item.precio)}</p>
                        </div>

                        <div className="flex items-center gap-3 border border-[#0a0a0a]/10 rounded-full px-3 py-1">
                          <button
                            type="button"
                            onClick={() => cambiarCantidad(local.vendedorId, item.productoId, item.cantidad - 1)}
                            className="text-[#0a0a0a]/40 hover:text-[#0a0a0a] transition cursor-pointer text-base"
                            aria-label="Restar"
                          >−</button>
                          <span className="text-sm min-w-[16px] text-center">{item.cantidad}</span>
                          <button
                            type="button"
                            onClick={() => cambiarCantidad(local.vendedorId, item.productoId, item.cantidad + 1)}
                            className="text-[#0a0a0a]/40 hover:text-[#0a0a0a] transition cursor-pointer text-base"
                            aria-label="Sumar"
                          >+</button>
                        </div>

                        <button
                          type="button"
                          onClick={() => quitar(local.vendedorId, item.productoId)}
                          className="text-[#0a0a0a]/20 hover:text-[#dc2626] transition cursor-pointer p-1"
                          aria-label="Quitar"
                        >
                          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                            <path strokeLinecap="round" strokeLinejoin="round" d="m14.74 9-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 0 1-2.244 2.077H8.084a2.25 2.25 0 0 1-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 0 0-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 0 1 3.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 0 0-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 0 0-7.5 0" />
                          </svg>
                        </button>
                      </div>
                    ))}

                    <div className="flex justify-between pt-3 border-t border-[#0a0a0a]/5 mt-1">
                      <span className="text-sm text-[#0a0a0a]/30 font-light">Subtotal</span>
                      <span className="text-sm font-semibold text-[#0a0a0a]">${formatearPrecio(subtotalLocal(local.vendedorId))}</span>
                    </div>
                  </div>
                ))}

                <button
                  type="button"
                  onClick={() => {
                    if (locales.length === 1) {
                      router.push(`/checkout?vendedor=${locales[0].vendedorId}`)
                    } else {
                      router.push('/carrito/elegir')
                    }
                  }}
                  className="w-full bg-[#0a0a0a] text-white border border-[#0a0a0a] hover:bg-transparent hover:text-[#0a0a0a] transition-colors cursor-pointer mt-2"
                  style={{ fontFamily: "'Inter', sans-serif", fontWeight: 500, fontSize: '14px', borderRadius: '4px', padding: '14px 28px' }}
                >
                  Comprar
                </button>
              </>
            )}
          </div>
        </div>
      </div>
    </>
  )
}