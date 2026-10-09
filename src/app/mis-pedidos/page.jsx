'use client'

import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import Navbar from '@/components/Navbar'
import MenuTakeover from '@/components/MenuTakeover'
import VolverAtras from '@/components/VolverAtras'
import { etiquetaMetodo, tipoEntregaDe, textoCostoEnvio, seguimientoDe } from '@/lib/metodosEntrega'
import { pedidoVencido, pagableHasta, esPagoEnEfectivoPendiente, fechaDeCupon } from '@/lib/vencimientoPago'
import { esVentaVisible } from '@/lib/pedidos'

// Lo que costó la entrega, al lado del método: "Envío a tu zona: $2.500",
// "Gratis", "A coordinar". A quien compra no se le muestran zonas ni
// distancias.
function textoEnvioPedido(pedido) {
  const tipo = tipoEntregaDe(pedido.metodo_envio)
  const costo = Number(pedido.costo_envio) || 0
  if (tipo === 'retiro') return 'Gratis'
  if (tipo === 'coordinar') return 'A coordinar'
  if (tipo === 'domicilio') {
    return costo === 0 ? 'Envío gratis' : `Envío a tu zona: ${textoCostoEnvio(pedido.metodo_envio, costo)}`
  }
  if (tipo === 'correo') return textoCostoEnvio(pedido.metodo_envio, costo)
  return costo > 0 ? `$${costo.toLocaleString('es-AR')}` : ''
}

// El estado, dicho para quien espera el pedido. Con la franja guardada dice
// cuál es; con el correo, la franja es cuándo lo lleva al correo.
function etiquetaEstado(pedido, estado) {
  const correo = tipoEntregaDe(pedido.metodo_envio) === 'correo'
  if (pedido.estado === 'franja' && pedido.franja_horaria) {
    const f = pedido.franja_horaria.toLowerCase()
    return correo ? `Lo lleva al correo a la ${f}` : `Sale a la ${f}`
  }
  if (pedido.estado === 'despachado' && correo) return 'Despachado por correo'
  return estado.label
}

// Empresa, número para copiar y link a la página de seguimiento.
function Seguimiento({ pedido }) {
  const [copiado, setCopiado] = useState(false)
  const seguimiento = seguimientoDe(pedido)
  if (!seguimiento) return null
  async function copiar() {
    try {
      await navigator.clipboard.writeText(seguimiento.numero)
      setCopiado(true)
      setTimeout(() => setCopiado(false), 2000)
    } catch {
      setCopiado(false)
    }
  }
  return (
    <div className="flex flex-wrap items-center gap-x-2 gap-y-1 pt-2 mt-1 text-xs text-[#0a0a0a]/50 font-light">
      <span>Enviado por {seguimiento.empresa} · N° <span className="text-[#0a0a0a] font-normal">{seguimiento.numero}</span></span>
      <button type="button" onClick={copiar}
        className="text-[#0a0a0a]/50 underline underline-offset-2 cursor-pointer bg-transparent border-none p-0">
        {copiado ? 'Copiado' : 'Copiar'}
      </button>
      {seguimiento.url && (
        <a href={seguimiento.url} target="_blank" rel="noopener noreferrer"
          className="text-[#0a0a0a] underline underline-offset-2">
          Seguí tu envío ↗
        </a>
      )}
    </div>
  )
}

const MENU_CATEGORIAS = ['moda','belleza-y-bienestar','joyeria-y-accesorios','hogar-y-deco','artes-y-oficios','bebes-y-maternidad','juegos-y-juguetes','mascotas','libros','deporte','vintage']

const ESTADOS = {
  // Un pedido pendiente que se ve acá es siempre un pago en efectivo en proceso:
  // los que nunca se pagaron no son compras (esVentaVisible).
  pendiente: { label: 'Pago en efectivo pendiente', color: 'bg-amber-50 text-amber-600' },
  // No es un estado de la base: lo arma pedidoVencido (el cupón venció y el
  // pedido no se cobró).
  vencido: { label: 'Venció el cupón de pago', color: 'bg-gray-100 text-gray-500' },
  pagado: { label: 'Pagado', color: 'bg-green-50 text-green-600' },
  preparando: { label: 'Preparando', color: 'bg-blue-50 text-blue-600' },
  franja: { label: 'Franja horaria asignada', color: 'bg-blue-50 text-blue-600' },
  por_salir: { label: 'Por salir', color: 'bg-indigo-50 text-indigo-600' },
  despachado: { label: 'Despachado', color: 'bg-green-50 text-green-700' },
  cancelado: { label: 'Cancelado', color: 'bg-red-50 text-[#dc2626]' },
  rechazado: { label: 'Rechazado', color: 'bg-red-50 text-[#dc2626]' },
  reembolsado: { label: 'Cancelado · dinero devuelto', color: 'bg-red-50 text-[#dc2626]' },
}

export default function MisPedidosPage() {
  const supabase = createClient()
  const router = useRouter()
  const [pedidos, setPedidos] = useState([])
  // La hora a la que se cargaron los pedidos: de ella depende qué está vencido.
  // Va en el estado (y no se pide al dibujar) para que el render sea puro.
  const [ahora, setAhora] = useState(0)
  // El pedido al que se le está abriendo el pago, y el error de cada uno.
  const [pagandoId, setPagandoId] = useState(null)
  const [erroresPago, setErroresPago] = useState({})

  // Mientras la pantalla está abierta, la hora se actualiza sola: al vencer el
  // cupón el botón "Pagar ahora" desaparece y queda el texto de "Venció".
  useEffect(() => {
    const reloj = setInterval(() => setAhora(Date.now()), 15000)
    return () => clearInterval(reloj)
  }, [])

  // Pide un link de pago NUEVO al servidor (que comprueba que el pedido sea tuyo
  // y siga vigente) y manda a MercadoPago. El link no se arma acá.
  async function pagar(pedido) {
    if (pagandoId) return
    setPagandoId(pedido.id)
    setErroresPago((previos) => ({ ...previos, [pedido.id]: '' }))
    try {
      const res = await fetch(`/api/pedidos/${pedido.id}/pagar-ahora`, { method: 'POST' })
      const cuerpo = await res.json().catch(() => null)
      if (res.ok && cuerpo?.url) {
        window.location.href = cuerpo.url
        // Si la persona vuelve con "atrás" y la página queda en pantalla, el
        // botón no se tiene que quedar trabado.
        setTimeout(() => setPagandoId(null), 5000)
        return
      }
      setErroresPago((previos) => ({ ...previos, [pedido.id]: cuerpo?.error || 'No pudimos abrir el pago. Probá de nuevo en un rato.' }))
      // Venció mientras la pantalla estaba abierta: se actualiza la hora.
      if (res.status === 410) setAhora(Date.now())
    } catch {
      setErroresPago((previos) => ({ ...previos, [pedido.id]: 'No pudimos conectarnos. Revisá tu conexión y probá de nuevo.' }))
    }
    setPagandoId(null)
  }
  const [cargando, setCargando] = useState(true)
  const [error, setError] = useState(null)
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
      if (!user) { router.replace('/entrar?next=%2Fmis-pedidos'); return }

      // El historial se arma con lo que quedó congelado al comprar, no con lo
      // que exista hoy: pedido_items guarda el nombre, el precio y la foto de
      // cada producto, y el pedido guarda el nombre de la tienda. Si después
      // se borra el producto o se bloquea el vendedor, la compra vieja se
      // sigue viendo igual.
      //
      // De 'vendedores' sólo se pide el slug, y sólo para el enlace: si la
      // tienda ya no está publicada, el nombre se muestra sin enlace.
      const { data, error } = await supabase
        .from('pedidos')
        .select(`
          id, estado, total, costo_envio, metodo_envio, zona_envio, creado_en,
          vendedor_nombre, franja_horaria, envio_empresa, envio_empresa_otra, envio_seguimiento,
          vence_en, efectivo_vence_en, cancelado_motivo, mp_payment_id,
          vendedor:vendedores(slug, direccion_visible),
          items:pedido_items(id, nombre, foto_url, cantidad, precio, variante)
        `)
        .eq('comprador_id', user.id)
        .order('creado_en', { ascending: false })

      if (error) {
        console.error('No se pudieron cargar las compras', error)
        setError('No pudimos cargar tus compras. Probá de nuevo en un rato.')
        setCargando(false)
        return
      }

      // Solo las compras: los pedidos que nunca se pagaron (carritos
      // abandonados) no aparecen.
      setAhora(Date.now())
      setPedidos((data || []).filter(esVentaVisible))
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
      <link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Fraunces:opsz,wght@9..144,100..900&family=Poppins:wght@300;400;500&display=swap" />

      <div className="min-h-screen bg-white" style={{ fontFamily: "'Inter', sans-serif" }}>
        {menuOpen && <MenuTakeover categorias={menuCats} onClose={() => setMenuOpen(false)} />}
        <Navbar onToggleMenu={() => setMenuOpen(!menuOpen)} variant="solid" />

        <div className="pt-20 pb-24 px-4 md:px-8">
          <div className="max-w-2xl mx-auto">

            <VolverAtras href="/perfil" texto="Volver al perfil" />

            <p style={{ fontFamily: "'Inter', sans-serif", fontSize: '10px', textTransform: 'uppercase', letterSpacing: '2px', color: 'rgba(10,10,10,0.3)', marginBottom: '10px' }}>
              Tu cuenta
            </p>
            <h1 className="text-[26px] md:text-[30px]" style={{ fontFamily: 'Fraunces, serif', fontWeight: 500, color: '#0a0a0a', marginBottom: '4px' }}>
              Mis pedidos
            </h1>

            {error ? (
              <div className="mt-6 p-4 bg-red-50 border border-red-200 rounded-lg text-sm text-red-800">
                {error}
              </div>
            ) : pedidos.length === 0 ? (
              <div className="text-center py-20">
                <svg className="w-12 h-12 text-[#0a0a0a]/10 mx-auto mb-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 10.5V6a3.75 3.75 0 1 0-7.5 0v4.5m11.356-1.993 1.263 12c.07.665-.45 1.243-1.119 1.243H4.25a1.125 1.125 0 0 1-1.12-1.243l1.264-12A1.125 1.125 0 0 1 5.513 7.5h12.974c.576 0 1.059.435 1.119 1.007Z" />
                </svg>
                <p className="text-[#0a0a0a]/40 font-light mb-2">Todavía no hiciste ninguna compra</p>
                <button
                  onClick={() => router.push('/')}
                  className="mt-4 bg-[#0a0a0a] text-white border border-[#0a0a0a] hover:bg-transparent hover:text-[#0a0a0a] transition-colors cursor-pointer"
                  style={{ fontFamily: "'Inter', sans-serif", fontWeight: 500, fontSize: '14px', borderRadius: '4px', padding: '14px 28px' }}
                >
                  Explorar productos
                </button>
              </div>
            ) : (
              <div className="mt-6">
                {pedidos.map((pedido) => {
                  const vencido = pedidoVencido(pedido, ahora)
                  const pagarHasta = pagableHasta(pedido, ahora)
                  // El botón: un pago en efectivo en proceso y el cupón todavía
                  // vigente (esto lo ve la pantalla, para que desaparezca solo
                  // al vencer). El servidor comprueba todo de nuevo al
                  // apretarlo: tienda disponible, misma cuenta de MercadoPago.
                  const puedePagar = !vencido && !!pagarHasta && esPagoEnEfectivoPendiente(pedido)
                  const estado = vencido
                    ? ESTADOS.vencido
                    : (ESTADOS[pedido.estado] || { label: pedido.estado, color: 'bg-gray-50 text-gray-600' })
                  // Sin franja (pedidos anteriores a la migración 009) queda
                  // la etiqueta genérica.
                  const textoEstado = etiquetaEstado(pedido, estado)
                  return (
                    <div key={pedido.id} className="rounded-2xl border border-[#0a0a0a]/5 p-5 mb-4">
                      {/* Header */}
                      <div className="flex items-center justify-between mb-3">
                        <div>
                          <div className="flex items-center gap-2">
                            {/* El nombre sale de la copia guardada en el
                                pedido. El enlace, sólo si la tienda sigue
                                publicada. */}
                            {pedido.vendedor?.slug ? (
                              <Link
                                href={`/tienda/${pedido.vendedor.slug}`}
                                className="text-sm font-medium text-[#0a0a0a] hover:text-[#0a0a0a]/50 transition"
                              >
                                {pedido.vendedor_nombre || 'Tienda'}
                              </Link>
                            ) : (
                              <span className="text-sm font-medium text-[#0a0a0a]">
                                {pedido.vendedor_nombre || 'Tienda'}
                              </span>
                            )}
                            <span className={`text-[10px] font-medium px-2 py-0.5 rounded-full ${estado.color}`}>
                              {textoEstado}
                            </span>
                          </div>
                          <p className="text-xs text-[#0a0a0a]/20 font-light mt-1">
                            Pedido #{pedido.id} · {formatearFecha(pedido.creado_en)}
                          </p>
                        </div>
                        <span className="text-sm font-semibold text-[#0a0a0a]">${fmt(pedido.total)}</span>
                      </div>

                      {/* Items */}
                      {pedido.items?.map((item) => (
                        <div key={item.id} className="flex items-center gap-3 py-2 border-t border-[#0a0a0a]/5">
                          <div className="w-12 h-12 rounded-lg bg-[#ECEAE3] shrink-0 overflow-hidden">
                            {item.foto_url && <img src={item.foto_url} alt="" className="w-full h-full object-cover" />}
                          </div>
                          <div className="flex-1 min-w-0">
                            <p className="text-sm text-[#0a0a0a] truncate font-light">
                              {item.nombre || 'Producto'}
                              {item.variante && <span className="text-[#0a0a0a]/30"> · {item.variante}</span>}
                            </p>
                            <p className="text-xs text-[#0a0a0a]/25 font-light">
                              {item.cantidad} × ${fmt(item.precio)}
                            </p>
                          </div>
                        </div>
                      ))}

                      {/* Entrega */}
                      <div className="flex justify-between gap-3 pt-2 border-t border-[#0a0a0a]/5 mt-1">
                        <span className="text-xs text-[#0a0a0a]/40 font-light">
                          {etiquetaMetodo(pedido.metodo_envio, 'comprador', { direccionVisible: pedido.vendedor?.direccion_visible })}
                        </span>
                        <span className="text-xs text-[#0a0a0a]/40 text-right">{textoEnvioPedido(pedido)}</span>
                      </div>
                      <Seguimiento pedido={pedido} />

                      {/* El cupón en efectivo vive 3 días (src/lib/vencimientoPago.js);
                          al comprador se le muestra solo la fecha, en hora de
                          Argentina. */}
                      {vencido && (
                        <p className="pt-2 mt-1 text-xs text-[#0a0a0a]/50 font-light leading-relaxed">
                          El cupón venció y el pedido no se cobró. Si todavía querés estos productos, hacé el pedido de nuevo.
                        </p>
                      )}
                      {!vencido && pagarHasta && esPagoEnEfectivoPendiente(pedido) && (
                        <p className="pt-2 mt-1 text-xs text-[#0a0a0a]/50 font-light leading-relaxed">
                          Vence el {fechaDeCupon(pagarHasta)}. Pagá el cupón en Rapipago o Pago Fácil, o pagá ahora con tarjeta o dinero en cuenta.
                        </p>
                      )}
                      {puedePagar && (
                        <div className="pt-2">
                          <button
                            type="button"
                            onClick={() => pagar(pedido)}
                            disabled={pagandoId !== null}
                            className="bg-[#0a0a0a] text-white border border-[#0a0a0a] hover:bg-transparent hover:text-[#0a0a0a] transition-colors cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
                            style={{ fontFamily: "'Inter', sans-serif", fontWeight: 500, fontSize: '14px', borderRadius: '4px', padding: '11px 24px' }}
                          >
                            {pagandoId === pedido.id ? 'Abriendo el pago…' : 'Pagar ahora'}
                          </button>
                          {erroresPago[pedido.id] && (
                            <p className="mt-2 mb-0 text-xs text-[#dc2626] font-light leading-relaxed">{erroresPago[pedido.id]}</p>
                          )}
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
