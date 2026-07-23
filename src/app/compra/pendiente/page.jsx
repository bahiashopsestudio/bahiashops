'use client'

import { useSearchParams, useRouter } from 'next/navigation'
import { Suspense, useState, useEffect } from 'react'
import Navbar from '@/components/Navbar'
import MenuTakeover from '@/components/MenuTakeover'
import { createClient } from '@/lib/supabase/client'

const MENU_CATEGORIAS = ['moda','belleza-y-cuidado-personal','gastronomia','hogar-deco-y-jardin','diseno-y-artesanias','tecnologia','salud-y-bienestar','arte-e-ilustracion']

function PendienteContenido() {
  const searchParams = useSearchParams()
  const router = useRouter()
  const supabase = createClient()
  const pedidoId = searchParams.get('pedido')
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
    }
    cargarCats()
  }, [])

  const menuCats = MENU_CATEGORIAS.map(s => categorias.find(c => c.slug === s)).filter(Boolean)

  return (
    <>
      <link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Inter:wght@200;300;400;500;600;700;800;900&display=swap" />
      <div className="min-h-screen bg-white" style={{ fontFamily: "'Inter', sans-serif" }}>
        {menuOpen && <MenuTakeover categorias={menuCats} onClose={() => setMenuOpen(false)} />}
        <Navbar onToggleMenu={() => setMenuOpen(!menuOpen)} variant="solid" />

        <div className="pt-20 pb-24 px-4">
          <div className="max-w-lg mx-auto text-center">
            <div className="w-16 h-16 rounded-full bg-amber-50 flex items-center justify-center mx-auto mt-8 mb-6">
              <svg className="w-8 h-8 text-amber-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 6v6h4.5m4.5 0a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z" />
              </svg>
            </div>

            <h1 className="text-2xl font-black text-[#0a0a0a] tracking-tight mb-2">Tu pago está en proceso</h1>
            <p className="text-[#0a0a0a]/50 font-light">Estamos esperando la confirmación de MercadoPago.</p>
            {pedidoId && <p className="text-[#0a0a0a]/20 text-sm font-light mt-1">Pedido #{pedidoId}</p>}

            <div className="bg-[#F5F2EC] rounded-2xl p-5 text-left mt-8 mb-8">
              <p className="text-sm font-medium text-[#0a0a0a] mb-1">Es normal si elegiste pago en efectivo o transferencia.</p>
              <p className="text-sm text-[#0a0a0a]/40 font-light leading-relaxed">
                Estos métodos pueden tardar hasta 48 horas en acreditarse. Apenas se confirme, te avisamos por mail y el vendedor empieza a preparar tu pedido.
              </p>
            </div>

            <button
              type="button"
              onClick={() => router.push('/')}
              className="bg-[#0a0a0a] text-white px-8 py-3.5 rounded-full text-sm font-medium hover:bg-[#2a2a2a] transition cursor-pointer"
            >
              Ir al inicio
            </button>
          </div>
        </div>
      </div>
    </>
  )
}

export default function PendientePage() {
  return (
    <Suspense fallback={<div className="min-h-screen bg-white flex items-center justify-center"><span className="text-[#0a0a0a]/30 text-sm" style={{ fontFamily: "'Inter', sans-serif" }}>Cargando...</span></div>}>
      <PendienteContenido />
    </Suspense>
  )
}