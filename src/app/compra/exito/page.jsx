'use client'

import { useSearchParams, useRouter } from 'next/navigation'
import { useCarrito } from '@/context/CarritoContext'
import { Suspense, useEffect, useState } from 'react'
import Navbar from '@/components/Navbar'
import MenuTakeover from '@/components/MenuTakeover'
import { createClient } from '@/lib/supabase/client'
import { tipoEntregaDe } from '@/lib/metodosEntrega'

// Qué pasa ahora, según cómo le llega el pedido. Sin datos del pedido (no se
// pudo leer), el texto general.
const TEXTO_GENERAL = 'Te va a escribir por WhatsApp para coordinar la entrega.'
function textoQuePasa(pedido) {
  const tipo = tipoEntregaDe(pedido?.metodo_envio)
  if (tipo === 'retiro') {
    return pedido.vendedor?.direccion_visible === false
      ? 'Te va a escribir por WhatsApp para coordinar dónde y cuándo lo retirás.'
      : 'Te va a escribir por WhatsApp cuando esté listo para retirar.'
  }
  if (tipo === 'domicilio') return 'Te va a escribir por WhatsApp para avisarte en qué franja horaria llega.'
  if (tipo === 'correo') return 'Te va a escribir por WhatsApp cuando lo despache por correo.'
  if (tipo === 'coordinar') return 'Te va a escribir por WhatsApp para arreglar la entrega.'
  return TEXTO_GENERAL
}

const MENU_CATEGORIAS = ['moda','belleza-y-bienestar','joyeria-y-accesorios','hogar-y-deco','artes-y-oficios','bebes-y-maternidad','juegos-y-juguetes','mascotas','libros','deporte','vintage']

function ExitoContenido() {
  const searchParams = useSearchParams()
  const router = useRouter()
  const supabase = createClient()
  const { vaciarLocal, listo: carritoListo } = useCarrito()
  const pedidoId = searchParams.get('pedido')
  const [menuOpen, setMenuOpen] = useState(false)
  const [categorias, setCategorias] = useState([])
  const [pedido, setPedido] = useState(null)

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

  // El método de entrega del pedido, para el texto de "qué pasa ahora". La
  // política deja leer sólo los pedidos propios; si no se puede, va el texto
  // general.
  useEffect(() => {
    if (!pedidoId || !/^\d+$/.test(pedidoId)) return
    async function cargarPedido() {
      const { data } = await supabase
        .from('pedidos')
        .select('vendedor_id, metodo_envio, vendedor:vendedores(direccion_visible)')
        .eq('id', Number(pedidoId))
        .maybeSingle()
      if (data) setPedido(data)
    }
    cargarPedido()
  }, [pedidoId])

  // Ya se pagó: del carrito sale SOLO lo de esta tienda. El pedido se lee con la
  // sesión de quien compra (la política deja leer solo los propios), así que el
  // número de la tienda no sale de la dirección de la página.
  const tiendaPagada = pedido?.vendedor_id
  useEffect(() => {
    if (carritoListo && tiendaPagada) vaciarLocal(tiendaPagada)
  }, [carritoListo, tiendaPagada])

  const menuCats = MENU_CATEGORIAS.map(s => categorias.find(c => c.slug === s)).filter(Boolean)

  return (
    <>
      <link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Inter:wght@200;300;400;500;600;700;800;900&display=swap" />
      <div className="min-h-screen bg-white" style={{ fontFamily: "'Inter', sans-serif" }}>
        {menuOpen && <MenuTakeover categorias={menuCats} onClose={() => setMenuOpen(false)} />}
        <Navbar onToggleMenu={() => setMenuOpen(!menuOpen)} variant="solid" />

        <div className="pt-20 pb-24 px-4">
          <div className="max-w-lg mx-auto text-center">
            <div className="w-16 h-16 rounded-full bg-green-50 flex items-center justify-center mx-auto mt-8 mb-6">
              <svg className="w-8 h-8 text-green-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="m4.5 12.75 6 6 9-13.5" />
              </svg>
            </div>

            <h1 className="text-2xl font-black text-[#0a0a0a] tracking-tight mb-2">¡Compra realizada con éxito!</h1>
            {pedidoId && <p className="text-[#0a0a0a]/20 text-sm font-light mt-1">Pedido #{pedidoId}</p>}

            <div className="bg-[#F5F2EC] rounded-2xl p-5 text-left mt-8 mb-8">
              <p className="text-sm font-medium text-[#0a0a0a]">Te mandamos la confirmación por mail y ya le avisamos al vendedor. {pedido ? textoQuePasa(pedido) : TEXTO_GENERAL}</p>
            </div>

            <button
              type="button"
              onClick={() => router.push('/')}
              className="bg-[#0a0a0a] text-white px-8 py-3.5 rounded-full text-sm font-medium hover:bg-[#2a2a2a] transition cursor-pointer"
            >
              Seguir comprando
            </button>
          </div>
        </div>
      </div>
    </>
  )
}

export default function ExitoPage() {
  return (
    <Suspense fallback={<div className="min-h-screen bg-white flex items-center justify-center"><span className="text-[#0a0a0a]/30 text-sm" style={{ fontFamily: "'Inter', sans-serif" }}>Cargando...</span></div>}>
      <ExitoContenido />
    </Suspense>
  )
}