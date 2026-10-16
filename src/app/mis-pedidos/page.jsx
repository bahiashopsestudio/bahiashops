'use client'

import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import Navbar from '@/components/Navbar'
import MenuTakeover from '@/components/MenuTakeover'
import VolverAtras from '@/components/VolverAtras'
import { ChipForma, BarraPasos, FlechaDesplegar, fechaDia } from '@/components/PasosPedido'
import { etiquetaMetodo, tipoEntregaDe, textoCostoEnvio, seguimientoDe } from '@/lib/metodosEntrega'
import { pedidoVencido, pagableHasta, esPagoEnEfectivoPendiente, fechaDeCupon } from '@/lib/vencimientoPago'
import {
  esVentaVisible, pasosDe, lineaDeEstado, textoCompraste, mensajeReclamo,
  NOMBRE_PASO, ESTADO_REEMBOLSADO, ESTADO_ENTREGADO, ESTADOS_PARA_RECLAMAR,
} from '@/lib/pedidos'
import { linkWhatsApp } from '@/lib/telefono'

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

const COLOR_LINEA = { curso: '#4164fe', entregado: '#2e6b4f', cancelado: '#dc2626' }

// El paso, tal como se lee en la franja cerrada. Un pendiente que se ve acá es
// siempre un pago en efectivo en proceso (los que nunca se pagaron no son
// compras: esVentaVisible). "Venció" no es un estado de la base: lo arma
// pedidoVencido (el cupón venció y el pedido no se cobró).
function textoPaso(pedido, vencido) {
  if (vencido) return 'Venció el cupón de pago'
  if (pedido.estado === 'pendiente') return 'Pago en efectivo pendiente'
  if (pedido.estado === ESTADO_REEMBOLSADO) return 'Cancelado · dinero devuelto'
  return NOMBRE_PASO[pedido.estado] || pedido.estado
}

// "Escribile a {tienda}": lo que se muestra según lo que respondió el servidor.
function Reclamo({ pedido, tienda, reclamo, onCerrar, onReintentar }) {
  const titulo = (
    <p className="m-0 mb-1 text-sm text-[#0a0a0a] font-semibold">Escribile a {tienda}</p>
  )
  const cerrar = (
    <button type="button" onClick={onCerrar}
      className="text-sm text-[#0a0a0a]/45 font-light bg-transparent border-none p-0 cursor-pointer hover:text-[#0a0a0a]/70 underline underline-offset-2">
      Cerrar
    </button>
  )

  let contenido
  if (!reclamo || reclamo.estado === 'cargando') {
    contenido = <p className="m-0 text-sm text-[#0a0a0a]/40 font-light">Buscando el WhatsApp de la tienda…</p>
  } else if (reclamo.estado === 'error') {
    contenido = (
      <>
        <p className="m-0 mb-3 text-sm text-[#dc2626] font-light leading-relaxed">{reclamo.error}</p>
        <div className="flex items-center gap-4">
          <button type="button" onClick={onReintentar}
            className="px-5 py-2.5 text-sm rounded-[4px] bg-white text-[#0a0a0a] border border-[#0a0a0a] cursor-pointer font-medium">
            Probar de nuevo
          </button>
          {cerrar}
        </div>
      </>
    )
  } else if (reclamo.estado === 'cerrada' || reclamo.estado === 'sin_telefono') {
    contenido = (
      <>
        <p className="m-0 mb-3 text-sm text-[#0a0a0a]/60 font-light leading-relaxed">
          {reclamo.estado === 'cerrada'
            ? 'Esta tienda cerró. Respondé el mail de confirmación de tu compra y te ayudamos.'
            : 'Esta tienda no cargó un WhatsApp. Respondé el mail de confirmación de tu compra y le avisamos.'}
        </p>
        {cerrar}
      </>
    )
  } else {
    const mensaje = mensajeReclamo(pedido)
    const link = linkWhatsApp(reclamo.telefono, mensaje)
    contenido = (
      <>
        <p className="m-0 mb-3 text-sm text-[#0a0a0a]/60 font-light leading-relaxed">
          Te abrimos su WhatsApp con este mensaje. Podés cambiarlo antes de mandarlo.
        </p>
        <p className="m-0 mb-4 text-sm text-[#0a0a0a] font-light leading-relaxed rounded-xl rounded-tl-sm px-4 py-3"
          style={{ backgroundColor: '#e7f6df' }}>
          {mensaje}
        </p>
        <div className="flex flex-wrap items-center gap-4 mb-3">
          {link ? (
            <a href={link} target="_blank" rel="noopener noreferrer"
              className="inline-block px-5 py-2.5 text-sm rounded-[4px] bg-[#0a0a0a] text-white no-underline font-medium hover:bg-[#0a0a0a]/80">
              Abrir WhatsApp
            </a>
          ) : (
            <p className="m-0 text-sm text-[#dc2626] font-light">No pudimos armar el link de WhatsApp de esta tienda.</p>
          )}
          {cerrar}
        </div>
        <p className="m-0 text-xs text-[#0a0a0a]/40 font-light leading-relaxed">
          El reclamo queda entre vos y la tienda. Si no se resuelve, vas a poder contarlo en tu reseña cuando se habilite.
        </p>
      </>
    )
  }

  return (
    <div className="mt-4 border border-[#0a0a0a]/10 rounded-xl p-4">
      {titulo}
      {contenido}
    </div>
  )
}

export default function MisPedidosPage() {
  const supabase = createClient()
  const router = useRouter()
  const [pedidos, setPedidos] = useState([])
  // Los ids de las tiendas cerradas a las que les compró (la fila de una tienda
  // cerrada no se puede leer: desde acá llega igual que una bloqueada).
  const [tiendasCerradas, setTiendasCerradas] = useState(() => new Set())
  // La hora a la que se cargaron los pedidos: de ella depende qué está vencido.
  // Va en el estado (y no se pide al dibujar) para que el render sea puro.
  const [ahora, setAhora] = useState(0)
  // El pedido al que se le está abriendo el pago, y el error de cada uno.
  const [pagandoId, setPagandoId] = useState(null)
  const [erroresPago, setErroresPago] = useState({})
  // Los pedidos desplegados. Todos arrancan cerrados.
  const [abiertos, setAbiertos] = useState(() => new Set())
  // "Reclamar" de cada pedido: si está abierto y lo que respondió el servidor
  // ({ estado: 'cargando' | 'ok' | 'sin_telefono' | 'cerrada' | 'error', ... }).
  const [reclamosAbiertos, setReclamosAbiertos] = useState(() => new Set())
  const [reclamos, setReclamos] = useState({})

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

  function alternar(conjunto, setConjunto, id) {
    setConjunto((previo) => {
      const nuevo = new Set(previo)
      if (nuevo.has(id)) nuevo.delete(id)
      else nuevo.add(id)
      return nuevo
    })
  }

  // El WhatsApp de la tienda se pide recién al apretar "Reclamar": el servidor
  // solo se lo da a quien tiene un pedido pagado con ella. Una vez que llegó,
  // no se vuelve a pedir.
  async function pedirWhatsApp(pedidoId) {
    setReclamos((previos) => ({ ...previos, [pedidoId]: { estado: 'cargando' } }))
    try {
      const res = await fetch(`/api/pedidos/${pedidoId}/whatsapp-tienda`)
      const cuerpo = await res.json().catch(() => null)
      if (res.ok && ['ok', 'sin_telefono', 'cerrada'].includes(cuerpo?.estado)) {
        setReclamos((previos) => ({ ...previos, [pedidoId]: cuerpo }))
        return
      }
      console.error('No se pudo traer el WhatsApp de la tienda', pedidoId, res.status, cuerpo?.error)
      setReclamos((previos) => ({
        ...previos,
        [pedidoId]: { estado: 'error', error: cuerpo?.error || 'No pudimos traer el WhatsApp de la tienda. Probá de nuevo en un rato.' },
      }))
    } catch {
      setReclamos((previos) => ({
        ...previos,
        [pedidoId]: { estado: 'error', error: 'No pudimos conectarnos. Revisá tu conexión y probá de nuevo.' },
      }))
    }
  }

  function abrirReclamo(pedido) {
    alternar(reclamosAbiertos, setReclamosAbiertos, pedido.id)
    if (reclamos[pedido.id] && reclamos[pedido.id].estado !== 'error') return
    // Una tienda que ya sabemos cerrada no se consulta.
    if (tiendasCerradas.has(Number(pedido.vendedor_id))) {
      setReclamos((previos) => ({ ...previos, [pedido.id]: { estado: 'cerrada' } }))
      return
    }
    pedirWhatsApp(pedido.id)
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
      // tienda ya no está publicada, el nombre se muestra sin enlace. Una
      // tienda cerrada (la dueña eliminó su cuenta) se muestra como "Tienda
      // cerrada": eso lo dice mis_tiendas_cerradas (migración 031), porque RLS
      // la oculta igual que a una bloqueada y desde acá no se distinguen.
      // entregado_at necesita la migración 036 (su grant select).
      const { data, error } = await supabase
        .from('pedidos')
        .select(`
          id, estado, total, costo_envio, metodo_envio, zona_envio, creado_en, entregado_at,
          vendedor_nombre, franja_horaria, envio_empresa, envio_empresa_otra, envio_seguimiento,
          vence_en, efectivo_vence_en, cancelado_motivo, mp_payment_id, vendedor_id,
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

      // Si falla, se muestran con el nombre guardado en el pedido.
      const { data: cerradas, error: errorCerradas } = await supabase.rpc('mis_tiendas_cerradas')
      if (errorCerradas) console.error('No se pudieron leer las tiendas cerradas', errorCerradas)
      setTiendasCerradas(new Set(Array.isArray(cerradas) ? cerradas.map(Number) : []))

      // Solo las compras: los pedidos que nunca se pagaron (carritos
      // abandonados) no aparecen.
      setAhora(Date.now())
      setPedidos((data || []).filter(esVentaVisible))
      setCargando(false)
    }
    cargar()
  }, [])

  function fmt(n) { return Number(n).toLocaleString('es-AR') }

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
                  const puedeReclamar = ESTADOS_PARA_RECLAMAR.includes(pedido.estado)
                  const tiendaCerrada = tiendasCerradas.has(Number(pedido.vendedor_id))
                  const nombreTienda = pedido.vendedor_nombre || 'la tienda'
                  const abierto = abiertos.has(pedido.id)
                  const reclamoAbierto = reclamosAbiertos.has(pedido.id)
                  const linea = vencido ? null : lineaDeEstado(pedido)
                  const reembolsado = pedido.estado === ESTADO_REEMBOLSADO
                  const idDetalle = `compra-${pedido.id}-detalle`
                  const compraste = textoCompraste(pedido.creado_en, ahora)
                  return (
                    <div key={pedido.id} id={`compra-${pedido.id}`} className="rounded-2xl border border-[#0a0a0a]/5 mb-3">
                      {/* La franja entera despliega y pliega. */}
                      <button type="button" aria-expanded={abierto} aria-controls={idDetalle}
                        onClick={() => alternar(abiertos, setAbiertos, pedido.id)}
                        className="w-full flex items-center gap-3 px-5 py-4 bg-transparent border-0 text-left cursor-pointer rounded-2xl">
                        <span className="flex-1 min-w-0">
                          {/* El nombre sale de la copia guardada en el pedido. */}
                          <span className={`block truncate text-[15px] ${tiendaCerrada ? 'text-[#0a0a0a]/40' : 'text-[#0a0a0a]'}`} style={{ fontWeight: 600 }}>
                            {tiendaCerrada ? 'Tienda cerrada' : (pedido.vendedor_nombre || 'Tienda')}
                          </span>
                          <span className="mt-1 flex items-center gap-2 min-w-0">
                            <ChipForma metodoEnvio={pedido.metodo_envio} />
                            <span className="truncate" style={{ fontWeight: 500, fontSize: '12.5px', color: reembolsado ? '#dc2626' : '#0a0a0a' }}>
                              #{pedido.id} · {textoPaso(pedido, vencido)}
                            </span>
                          </span>
                        </span>
                        <span className="shrink-0 text-sm text-[#0a0a0a] tabular-nums" style={{ fontWeight: 600 }}>$ {fmt(pedido.total)}</span>
                        <FlechaDesplegar abierto={abierto} />
                      </button>

                      {abierto && (
                        <div id={idDetalle} className="px-5 pb-5">
                          <div className="pt-3 border-t border-[#0a0a0a]/5">
                            <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1 mb-2">
                              {compraste && <p className="m-0 text-xs text-[#0a0a0a]/40 font-light">{compraste}</p>}
                              {/* El enlace, sólo si la tienda sigue publicada. */}
                              {!tiendaCerrada && pedido.vendedor?.slug && (
                                <Link href={`/tienda/${pedido.vendedor.slug}`}
                                  className="text-xs text-[#0a0a0a]/50 underline underline-offset-2 hover:text-[#0a0a0a]">
                                  Ver la tienda
                                </Link>
                              )}
                            </div>

                            {/* Entrega */}
                            <div className="flex justify-between gap-3 mb-1">
                              <span className="text-sm text-[#0a0a0a] font-medium">
                                {etiquetaMetodo(pedido.metodo_envio, 'comprador', { direccionVisible: pedido.vendedor?.direccion_visible })}
                              </span>
                              <span className="text-xs text-[#0a0a0a]/40 text-right">{textoEnvioPedido(pedido)}</span>
                            </div>

                            {/* Items */}
                            {pedido.items?.map((item) => (
                              <div key={item.id} className="flex items-center gap-3 py-2 border-t border-[#0a0a0a]/5">
                                <div className="w-12 h-12 rounded-lg bg-[#ECEAE3] shrink-0 overflow-hidden">
                                  {item.foto_url && <img src={item.foto_url} alt="" className="w-full h-full object-cover" />}
                                </div>
                                <div className="flex-1 min-w-0">
                                  <p className="m-0 text-sm text-[#0a0a0a] truncate font-light">
                                    {item.nombre || 'Producto'}
                                    {item.variante && <span className="text-[#0a0a0a]/30"> · {item.variante}</span>}
                                  </p>
                                  <p className="m-0 text-xs text-[#0a0a0a]/25 font-light">
                                    {item.cantidad} × ${fmt(item.precio)}
                                  </p>
                                </div>
                              </div>
                            ))}

                            {linea && (
                              <p className="m-0 pt-3 mt-1 border-t border-[#0a0a0a]/5 text-sm font-medium" style={{ color: COLOR_LINEA[linea.tono] }}>
                                {linea.texto}
                              </p>
                            )}
                            {/* Sin entregado_at (no debería pasar) no va la línea. */}
                            {pedido.estado === ESTADO_ENTREGADO && fechaDia(pedido.entregado_at) && (
                              <p className="m-0 mt-0.5 text-xs text-[#0a0a0a]/40 font-light">
                                Entregado el {fechaDia(pedido.entregado_at)}
                              </p>
                            )}
                            <Seguimiento pedido={pedido} />

                            {/* El cupón en efectivo vive 3 días (src/lib/vencimientoPago.js);
                                al comprador se le muestra solo la fecha, en hora de
                                Argentina. */}
                            {vencido && (
                              <p className="pt-3 mt-1 mb-0 border-t border-[#0a0a0a]/5 text-xs text-[#0a0a0a]/50 font-light leading-relaxed">
                                El cupón venció y el pedido no se cobró. Si todavía querés estos productos, hacé el pedido de nuevo.
                              </p>
                            )}
                            {!vencido && pagarHasta && esPagoEnEfectivoPendiente(pedido) && (
                              <p className="pt-3 mt-1 mb-0 border-t border-[#0a0a0a]/5 text-xs text-[#0a0a0a]/50 font-light leading-relaxed">
                                Vence el {fechaDeCupon(pagarHasta)}. Pagá el cupón en Rapipago o Pago Fácil, o pagá ahora con tarjeta o dinero en cuenta.
                              </p>
                            )}

                            {!vencido && pasosDe(pedido).length > 0 && (
                              <div className="mt-4">
                                <BarraPasos pasos={pasosDe(pedido)} estado={pedido.estado} />
                              </div>
                            )}

                            {(puedePagar || (puedeReclamar && !reclamoAbierto)) && (
                              <div className="flex flex-wrap gap-3 pt-4">
                                {puedePagar && (
                                  <button
                                    type="button"
                                    onClick={() => pagar(pedido)}
                                    disabled={pagandoId !== null}
                                    className="bg-[#0a0a0a] text-white border border-[#0a0a0a] hover:bg-transparent hover:text-[#0a0a0a] transition-colors cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
                                    style={{ fontFamily: "'Inter', sans-serif", fontWeight: 500, fontSize: '14px', borderRadius: '4px', padding: '11px 24px' }}
                                  >
                                    {pagandoId === pedido.id ? 'Abriendo el pago…' : 'Pagar ahora'}
                                  </button>
                                )}
                                {puedeReclamar && !reclamoAbierto && (
                                  <button
                                    type="button"
                                    onClick={() => abrirReclamo(pedido)}
                                    className="bg-white text-[#0a0a0a] border border-[#0a0a0a] hover:bg-[#0a0a0a]/[0.04] transition-colors cursor-pointer"
                                    style={{ fontFamily: "'Inter', sans-serif", fontWeight: 500, fontSize: '14px', borderRadius: '4px', padding: '11px 24px' }}
                                  >
                                    Reclamar
                                  </button>
                                )}
                              </div>
                            )}
                            {erroresPago[pedido.id] && (
                              <p className="mt-2 mb-0 text-xs text-[#dc2626] font-light leading-relaxed">{erroresPago[pedido.id]}</p>
                            )}

                            {puedeReclamar && reclamoAbierto && (
                              <Reclamo pedido={pedido} tienda={nombreTienda} reclamo={reclamos[pedido.id]}
                                onCerrar={() => alternar(reclamosAbiertos, setReclamosAbiertos, pedido.id)}
                                onReintentar={() => pedirWhatsApp(pedido.id)} />
                            )}
                          </div>
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
