'use client'

import { useState, useEffect } from 'react'
import { useCarrito } from '@/context/CarritoContext'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import Navbar from '@/components/Navbar'
import MenuTakeover from '@/components/MenuTakeover'
import VolverAtras from '@/components/VolverAtras'

const MENU_CATEGORIAS = [
  'moda', 'belleza-y-cuidado-personal', 'gastronomia',
  'hogar-deco-y-jardin', 'diseno-y-artesanias', 'tecnologia',
  'salud-y-bienestar', 'arte-e-ilustracion',
]

export default function ElegirLocalPage() {
  const { locales, subtotalLocal, listo } = useCarrito()
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

  useEffect(() => {
    if (!listo) return
    if (locales.length === 1) {
      router.replace(`/checkout?vendedor=${locales[0].vendedorId}`)
    } else if (locales.length === 0) {
      router.replace('/carrito')
    }
  }, [listo, locales, router])

  function formatearPrecio(valor) {
    return Number(valor).toLocaleString('es-AR')
  }

  const menuCats = MENU_CATEGORIAS
    .map(slug => categorias.find(c => c.slug === slug))
    .filter(Boolean)

  if (!listo || locales.length <= 1) {
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
          <div className="max-w-xl mx-auto">

            <VolverAtras href="/carrito" texto="Volver al carrito" />

            <h1 className="text-2xl md:text-3xl font-black text-[#0a0a0a] tracking-tight mb-2">
              ¿Con qué local seguís?
            </h1>
            <p className="text-sm text-[#0a0a0a]/40 font-light leading-relaxed mb-8">
              Cada compra se paga y se coordina por separado. Con el que no elijas ahora, seguís
              después: te queda guardado en el carrito.
            </p>

            {locales.map((local) => {
              const cantidad = local.items.reduce((s, it) => s + it.cantidad, 0)
              return (
                <button
                  key={local.vendedorId}
                  type="button"
                  onClick={() => router.push(`/checkout?vendedor=${local.vendedorId}`)}
                  className="w-full text-left rounded-2xl border border-[#0a0a0a]/5 p-5 mb-3 cursor-pointer flex justify-between items-center hover:border-[#0a0a0a]/15 transition group"
                >
                  <div>
                    <div className="font-medium text-[#0a0a0a] text-sm">{local.vendedorNombre}</div>
                    <div className="text-xs text-[#0a0a0a]/30 font-light mt-1">
                      {cantidad} {cantidad === 1 ? 'producto' : 'productos'} · ${formatearPrecio(subtotalLocal(local.vendedorId))}
                    </div>
                  </div>
                  <svg className="w-5 h-5 text-[#0a0a0a]/15 group-hover:text-[#0a0a0a]/40 transition" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="m8.25 4.5 7.5 7.5-7.5 7.5" />
                  </svg>
                </button>
              )
            })}

            <div className="flex gap-3 items-start bg-[#F5F2EC] rounded-xl p-4 mt-4">
              <svg className="w-4 h-4 text-[#0a0a0a]/25 shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="m11.25 11.25.041-.02a.75.75 0 0 1 1.063.852l-.708 2.836a.75.75 0 0 0 1.063.853l.041-.021M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0Zm-9-3.75h.008v.008H12V8.25Z" />
              </svg>
              <p className="text-xs text-[#0a0a0a]/40 font-light leading-relaxed">
                Comprás de a un local por vez porque cada uno prepara y despacha su propio pedido.
              </p>
            </div>
          </div>
        </div>
      </div>
    </>
  )
}