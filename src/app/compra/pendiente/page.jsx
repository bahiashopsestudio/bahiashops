'use client'

import { useSearchParams, useRouter } from 'next/navigation'
import { Suspense, useState, useEffect } from 'react'
import Navbar from '@/components/Navbar'
import MenuTakeover from '@/components/MenuTakeover'
import { createClient } from '@/lib/supabase/client'
import { useCarrito } from '@/context/CarritoContext'
import { fechaDeCupon } from '@/lib/vencimientoPago'

const MENU_CATEGORIAS = ['moda','belleza-y-bienestar','joyeria-y-accesorios','hogar-y-deco','artes-y-oficios','bebes-y-maternidad','juegos-y-juguetes','mascotas','libros','deporte','vintage']

function PendienteContenido() {
  const searchParams = useSearchParams()
  const router = useRouter()
  const supabase = createClient()
  const { vaciarLocal, listo: carritoListo } = useCarrito()
  const pedidoId = searchParams.get('pedido')
  const [menuOpen, setMenuOpen] = useState(false)
  const [categorias, setCategorias] = useState([])
  const [tiendaPagada, setTiendaPagada] = useState(null)

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

  // Un pago en proceso (por ejemplo un cupón en efectivo) es una venta en curso,
  // no un carrito abandonado: del carrito sale lo de esta tienda. El pedido se
  // lee con la sesión de quien compra (la política deja leer solo los propios).
  useEffect(() => {
    if (!pedidoId || !/^\d+$/.test(pedidoId)) return
    async function cargarPedido() {
      const { data } = await supabase.from('pedidos').select('vendedor_id').eq('id', Number(pedidoId)).maybeSingle()
      if (data?.vendedor_id) setTiendaPagada(data.vendedor_id)
    }
    cargarPedido()
  }, [pedidoId])

  useEffect(() => {
    if (carritoListo && tiendaPagada) vaciarLocal(tiendaPagada)
  }, [carritoListo, tiendaPagada])

  // ¿Es un cupón en efectivo sin pagar? Lo responde el servidor, que le pregunta
  // a MercadoPago (el webhook puede no haber llegado todavía): por eso se le
  // pasa el payment_id que MercadoPago agrega a la vuelta. Hasta que responde,
  // "Cargando...", para no mostrar un texto y cambiarlo enseguida.
  const pagoDeLaVuelta = searchParams.get('payment_id') || searchParams.get('collection_id') || ''
  const pedidoValido = !!pedidoId && /^\d+$/.test(pedidoId)
  const [cuponLeido, setCupon] = useState(null)
  // Sin un número de pedido no hay nada que consultar: pantalla genérica.
  const cupon = pedidoValido ? cuponLeido : { efectivo: false }

  useEffect(() => {
    if (!pedidoValido) return
    async function cargarCupon() {
      try {
        const consulta = /^\d+$/.test(pagoDeLaVuelta) ? `?pago=${pagoDeLaVuelta}` : ''
        const res = await fetch(`/api/pedidos/${pedidoId}/cupon${consulta}`, { cache: 'no-store' })
        const datos = res.ok ? await res.json() : null
        setCupon(datos?.efectivo ? datos : { efectivo: false })
      } catch {
        setCupon({ efectivo: false })
      }
    }
    cargarCupon()
  }, [pedidoId, pedidoValido, pagoDeLaVuelta])

  const menuCats = MENU_CATEGORIAS.map(s => categorias.find(c => c.slug === s)).filter(Boolean)

  return (
    <>
      <link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Inter:wght@200;300;400;500;600;700;800;900&display=swap" />
      <div className="min-h-screen bg-white" style={{ fontFamily: "'Inter', sans-serif" }}>
        {menuOpen && <MenuTakeover categorias={menuCats} onClose={() => setMenuOpen(false)} />}
        <Navbar onToggleMenu={() => setMenuOpen(!menuOpen)} variant="solid" />

        <div className="pt-20 pb-24 px-4">
          {!cupon ? (
            <p className="text-center text-[#0a0a0a]/30 text-sm mt-16">Cargando...</p>
          ) : (
          <div className="max-w-lg mx-auto text-center">
            <div className="w-16 h-16 rounded-full bg-amber-50 flex items-center justify-center mx-auto mt-8 mb-6">
              <svg className="w-8 h-8 text-amber-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 6v6h4.5m4.5 0a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z" />
              </svg>
            </div>

            {cupon.efectivo ? (
              // Un cupón en efectivo recién generado: todavía NO se pagó.
              <>
                <h1 className="text-2xl font-black text-[#0a0a0a] tracking-tight mb-2">Pago en efectivo pendiente</h1>
                <p className="text-[#0a0a0a]/50 font-light">
                  {fechaDeCupon(cupon.vence_en)
                    ? `Tenés hasta el ${fechaDeCupon(cupon.vence_en)} para pagar en Rapipago o Pago Fácil.`
                    : 'Pagá el cupón en Rapipago o Pago Fácil.'}
                </p>
                <p className="text-[#0a0a0a]/20 text-sm font-light mt-1">Pedido #{pedidoId}</p>

                {cupon.url_cupon && (
                  <a
                    href={cupon.url_cupon}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-block mt-6 border border-[#0a0a0a] text-[#0a0a0a] px-8 py-3.5 rounded-full text-sm font-medium hover:bg-[#0a0a0a] hover:text-white transition no-underline"
                  >
                    Ver cupón de pago
                  </a>
                )}

                <div className="bg-[#F5F2EC] rounded-2xl p-5 text-left mt-8 mb-8">
                  <p className="text-sm text-[#0a0a0a]/60 font-light leading-relaxed m-0">
                    Si no se paga antes del vencimiento, el pedido se cancela automáticamente.
                  </p>
                </div>
              </>
            ) : (
              <>
                <h1 className="text-2xl font-black text-[#0a0a0a] tracking-tight mb-2">Tu pago está en proceso</h1>
                <p className="text-[#0a0a0a]/50 font-light">Estamos esperando la confirmación de MercadoPago.</p>
                {pedidoId && <p className="text-[#0a0a0a]/20 text-sm font-light mt-1">Pedido #{pedidoId}</p>}

                <div className="bg-[#F5F2EC] rounded-2xl p-5 text-left mt-8 mb-8">
                  <p className="text-sm font-medium text-[#0a0a0a] mb-1">Es normal si pagaste con transferencia.</p>
                  <p className="text-sm text-[#0a0a0a]/40 font-light leading-relaxed">
                    Puede tardar hasta 48 horas en acreditarse. Apenas se confirme, te avisamos por mail y el vendedor empieza a preparar tu pedido.
                  </p>
                </div>
              </>
            )}

            <button
              type="button"
              onClick={() => router.push('/')}
              className="bg-[#0a0a0a] text-white px-8 py-3.5 rounded-full text-sm font-medium hover:bg-[#2a2a2a] transition cursor-pointer"
            >
              Ir al inicio
            </button>
          </div>
          )}
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