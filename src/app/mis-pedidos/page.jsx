'use client'

import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import Navbar from '@/components/Navbar'
import MenuTakeover from '@/components/MenuTakeover'
import VolverAtras from '@/components/VolverAtras'

const MENU_CATEGORIAS = ['moda','belleza-y-cuidado-personal','gastronomia','hogar-deco-y-jardin','diseno-y-artesanias','tecnologia','salud-y-bienestar','arte-e-ilustracion']

const ESTADOS = {
  pendiente: { label: 'Pendiente de pago', color: 'bg-amber-50 text-amber-600' },
  pagado: { label: 'Pagado', color: 'bg-green-50 text-green-600' },
  preparando: { label: 'Preparando', color: 'bg-blue-50 text-blue-600' },
  franja: { label: 'Franja asignada', color: 'bg-blue-50 text-blue-600' },
  por_salir: { label: 'Por salir', color: 'bg-indigo-50 text-indigo-600' },
  despachado: { label: 'Despachado', color: 'bg-green-50 text-green-700' },
  cancelado: { label: 'Cancelado', color: 'bg-red-50 text-[#e60000]' },
  rechazado: { label: 'Rechazado', color: 'bg-red-50 text-[#e60000]' },
}

export default function MisPedidosPage() {
  const supabase = createClient()
  const router = useRouter()
  const [pedidos, setPedidos] = useState([])
  const [cargando, setCargando] = useState(true)
  const [menuOpen, setMenuOpen] = useState(false)
  const [categorias, setCategorias] = useState([])

  useEffect(() => {
    if (menuOpen) { document.body.style.overflow = 'hidden' } else { document.body.style.overflow = '' }
    return () => { document.body.style.overflow = '' }
  }, [menuOpen])

  useEffect(() => {
    async function cargar() {
      const { data: cats } = await supabase.from('categorias').select('id, nombre, slug').eq('activa', true).order('orden')
      if (cats) setCategorias(cats)

      const { data: { user } } = await supabase.auth.getUser()
      if (!user) { router.push('/login'); return }

      const { data } = await supabase
        .from('pedidos')
        .select(`
          id, estado, total, costo_envio, metodo_envio, creado_en,
          vendedor:vendedores(nombre_negocio, slug),
          items:pedido_items(
            cantidad, precio_unitario, variante,
            producto:productos(nombre, producto_media(url, orden))
          )
        `)
        .eq('comprador_id', user.id)
        .order('creado_en', { ascending: false })

      setPedidos(data || [])
      setCargando(false)
    }
    cargar()
  }, [])

  function fmt(n) { return Number(n).toLocaleString('es-AR') }

  function formatearFecha(fecha) {
    return new Date(fecha).toLocaleDateString('es-AR', {
      day: 'numeric', month: 'short', year: 'numeric',
    })
  }

  function getFoto(item) {
    const media = item.producto?.producto_media
    if (!media?.length) return null
    return [...media].sort((a, b) => a.orden - b.orden)[0]?.url || null
  }

  const menuCats = MENU_CATEGORIAS.map(s => categorias.find(c => c.slug === s)).filter(Boolean)

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
        {menuOpen && <MenuTakeover categorias={menuCats} onClose={() => setMenuOpen(false)} />}
        <Navbar onToggleMenu={() => setMenuOpen(!menuOpen)} variant="solid" />

        <div className="pt-20 pb-24 px-4 md:px-8">
          <div className="max-w-2xl mx-auto">

            <VolverAtras href="/perfil" texto="Volver al perfil" />

            <h1 className="text-2xl md:text-3xl font-black text-[#0a0a0a] tracking-tight mb-1">
              Mis pedidos
            </h1>

            {pedidos.length === 0 ? (
              <div className="text-center py-20">
                <svg className="w-12 h-12 text-[#0a0a0a]/10 mx-auto mb-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 10.5V6a3.75 3.75 0 1 0-7.5 0v4.5m11.356-1.993 1.263 12c.07.665-.45 1.243-1.119 1.243H4.25a1.125 1.125 0 0 1-1.12-1.243l1.264-12A1.125 1.125 0 0 1 5.513 7.5h12.974c.576 0 1.059.435 1.119 1.007Z" />
                </svg>
                <p className="text-[#0a0a0a]/40 font-light mb-2">Todavía no hiciste ninguna compra</p>
                <button
                  onClick={() => router.push('/')}
                  className="mt-4 bg-[#0a0a0a] text-white px-6 py-3 rounded-full text-sm font-medium hover:bg-[#2a2a2a] transition cursor-pointer"
                >
                  Explorar productos
                </button>
              </div>
            ) : (
              <div className="mt-6">
                {pedidos.map((pedido) => {
                  const estado = ESTADOS[pedido.estado] || { label: pedido.estado, color: 'bg-gray-50 text-gray-600' }
                  return (
                    <div key={pedido.id} className="rounded-2xl border border-[#0a0a0a]/5 p-5 mb-4">
                      {/* Header */}
                      <div className="flex items-center justify-between mb-3">
                        <div>
                          <div className="flex items-center gap-2">
                            {pedido.vendedor && (
                              <Link
                                href={`/tienda/${pedido.vendedor.slug}`}
                                className="text-sm font-medium text-[#0a0a0a] hover:text-[#0a0a0a]/50 transition"
                              >
                                {pedido.vendedor.nombre_negocio}
                              </Link>
                            )}
                            <span className={`text-[10px] font-medium px-2 py-0.5 rounded-full ${estado.color}`}>
                              {estado.label}
                            </span>
                          </div>
                          <p className="text-xs text-[#0a0a0a]/20 font-light mt-1">
                            Pedido #{pedido.id} · {formatearFecha(pedido.creado_en)}
                          </p>
                        </div>
                        <span className="text-sm font-semibold text-[#0a0a0a]">${fmt(pedido.total)}</span>
                      </div>

                      {/* Items */}
                      {pedido.items?.map((item, i) => {
                        const foto = getFoto(item)
                        return (
                          <div key={i} className="flex items-center gap-3 py-2 border-t border-[#0a0a0a]/5">
                            <div className="w-12 h-12 rounded-lg bg-[#ECEAE3] shrink-0 overflow-hidden">
                              {foto && <img src={foto} alt="" className="w-full h-full object-cover" />}
                            </div>
                            <div className="flex-1 min-w-0">
                              <p className="text-sm text-[#0a0a0a] truncate font-light">
                                {item.producto?.nombre || 'Producto'}
                                {item.variante && <span className="text-[#0a0a0a]/30"> · {item.variante}</span>}
                              </p>
                              <p className="text-xs text-[#0a0a0a]/25 font-light">
                                {item.cantidad} × ${fmt(item.precio_unitario)}
                              </p>
                            </div>
                          </div>
                        )
                      })}

                      {/* Envío */}
                      {pedido.costo_envio > 0 && (
                        <div className="flex justify-between pt-2 border-t border-[#0a0a0a]/5 mt-1">
                          <span className="text-xs text-[#0a0a0a]/25 font-light">Envío</span>
                          <span className="text-xs text-[#0a0a0a]/40">${fmt(pedido.costo_envio)}</span>
                        </div>
                      )}
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
