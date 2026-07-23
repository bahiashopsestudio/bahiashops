'use client'

import { useState, useEffect, Suspense } from 'react'
import { useSearchParams, useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { useCarrito } from '@/context/CarritoContext'
import Navbar from '@/components/Navbar'
import MenuTakeover from '@/components/MenuTakeover'
import VolverAtras from '@/components/VolverAtras'
import FormularioDireccion from '@/components/FormularioDireccion'

const MENU_CATEGORIAS = [
  'moda', 'belleza-y-cuidado-personal', 'gastronomia',
  'hogar-deco-y-jardin', 'diseno-y-artesanias', 'tecnologia',
  'salud-y-bienestar', 'arte-e-ilustracion',
]

const ZONAS_CORREO = [
  { key: 'correo_1', nombre: 'Zona 1', descripcion: 'Buenos Aires, Córdoba, Entre Ríos, La Pampa, Santa Fe' },
  { key: 'correo_2', nombre: 'Zona 2', descripcion: 'Mendoza, San Luis, San Juan, Neuquén, Río Negro, La Rioja' },
  { key: 'correo_3', nombre: 'Zona 3', descripcion: 'Tucumán, Salta, Jujuy, Catamarca, Chaco, Corrientes, Formosa, Misiones, Sgo. del Estero' },
  { key: 'correo_4', nombre: 'Zona 4', descripcion: 'Chubut, Santa Cruz, Tierra del Fuego' },
]

function CheckoutContenido() {
  const searchParams = useSearchParams()
  const router = useRouter()
  const supabase = createClient()
  const vendedorId = Number(searchParams.get('vendedor'))

  const { locales, subtotalLocal } = useCarrito()
  const local = locales.find((l) => l.vendedorId === vendedorId)

  const [paso, setPaso] = useState(1)
  const [direcciones, setDirecciones] = useState([])
  const [direccionElegida, setDireccionElegida] = useState(null)
  const [mostrarFormDir, setMostrarFormDir] = useState(false)
  const [metodoElegido, setMetodoElegido] = useState(null)
  const [turno, setTurno] = useState('Indistinto')
  const [cargando, setCargando] = useState(true)
  const [pagando, setPagando] = useState(false)
  const [menuOpen, setMenuOpen] = useState(false)
  const [categorias, setCategorias] = useState([])

  const [vendedorBarrioId, setVendedorBarrioId] = useState(null)
  const [metodosDisponibles, setMetodosDisponibles] = useState([])
  const [costosVendedor, setCostosVendedor] = useState({})
  const [zonaCadeteria, setZonaCadeteria] = useState(null)
  const [costoCadeteria, setCostoCadeteria] = useState(null)
  const [calculandoZona, setCalculandoZona] = useState(false)
  const [sinBarrio, setSinBarrio] = useState(false)
  const [zonaCorreoElegida, setZonaCorreoElegida] = useState(null)

  useEffect(() => {
    if (menuOpen) { document.body.style.overflow = 'hidden' } else { document.body.style.overflow = '' }
    return () => { document.body.style.overflow = '' }
  }, [menuOpen])

  function costoEnvioActual() {
    if (metodoElegido === 'retiro') return 0
    if (metodoElegido === 'cadeteria') return costoCadeteria ?? 0
    if (metodoElegido === 'correo' && zonaCorreoElegida) return costosVendedor[zonaCorreoElegida] ?? 0
    if (metodoElegido === 'acordar') return 0
    return 0
  }

  const costoEnvio = costoEnvioActual()
  const subtotal = subtotalLocal(vendedorId)
  const total = subtotal + costoEnvio

  const metodoPideDir = metodoElegido === 'cadeteria' || metodoElegido === 'correo'
  const cadeteriaSinCosto = metodoElegido === 'cadeteria' && costoCadeteria === null && !calculandoZona
  const correoSinZona = metodoElegido === 'correo' && !zonaCorreoElegida
  const paso1Listo = metodoElegido && (!metodoPideDir || direccionElegida) && !cadeteriaSinCosto && !correoSinZona && !sinBarrio

  useEffect(() => {
    async function cargar() {
      const { data: cats } = await supabase.from('categorias').select('id, nombre, slug').eq('activa', true).order('orden')
      if (cats) setCategorias(cats)

      const { data: { user } } = await supabase.auth.getUser()
      if (!user) { setCargando(false); return }

      const { data: dirs } = await supabase.from('direcciones').select('*').eq('usuario_id', user.id).order('creada_en')
      if (dirs && dirs.length > 0) {
        setDirecciones(dirs)
        const principal = dirs.find((d) => d.es_principal)
        setDireccionElegida(principal ? principal.id : dirs[0].id)
      }

      const { data: vendedor } = await supabase.from('vendedores').select('barrio_id, metodos_entrega_default, costos_envio_zona').eq('id', vendedorId).single()
      if (vendedor) {
        setVendedorBarrioId(vendedor.barrio_id)
        setMetodosDisponibles(vendedor.metodos_entrega_default || [])
        setCostosVendedor(vendedor.costos_envio_zona || {})
      }
      setCargando(false)
    }
    cargar()
  }, [])

  useEffect(() => {
    async function calcularZona() {
      if (metodoElegido !== 'cadeteria' || !direccionElegida || !vendedorBarrioId) return
      const dir = direcciones.find(d => d.id === direccionElegida)
      if (!dir) return
      if (!dir.barrio_id) { setSinBarrio(true); setCostoCadeteria(null); setZonaCadeteria(null); return }
      setSinBarrio(false); setCalculandoZona(true)
      const { data: zona, error } = await supabase.rpc('calcular_zona_envio', { barrio_vendedor_id: vendedorBarrioId, barrio_comprador_id: dir.barrio_id })
      if (error) { setCostoCadeteria(null); setZonaCadeteria(null) } else {
        setZonaCadeteria(zona)
        const costo = costosVendedor[`zona_${zona}`]
        setCostoCadeteria(costo !== undefined && costo !== null ? costo : null)
      }
      setCalculandoZona(false)
    }
    calcularZona()
  }, [metodoElegido, direccionElegida, vendedorBarrioId, costosVendedor, direcciones])

  useEffect(() => { if (metodoElegido !== 'correo') setZonaCorreoElegida(null) }, [metodoElegido])

  function fmt(n) { return Number(n).toLocaleString('es-AR') }

  function alGuardarDireccion(nueva) {
    setDirecciones((actual) => [...actual, nueva])
    setDireccionElegida(nueva.id)
    setMostrarFormDir(false)
  }

  async function pagar() {
    setPagando(true)
    try {
      const res = await fetch('/api/pedidos/crear', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ vendedorId: local.vendedorId, items: local.items, metodoEnvio: metodoElegido, direccionId: direccionElegida, turnoPreferido: turno, subtotalProductos: subtotal, costoEnvio, total }),
      })
      const data = await res.json()
      if (!res.ok) { alert('Error: ' + (data.error || 'No se pudo procesar.')); setPagando(false); return }
      window.location.href = data.checkout_url
    } catch { alert('Error al conectar. Probá de nuevo.'); setPagando(false) }
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

  if (!local) {
    return (
      <>
        <link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Inter:wght@200;300;400;500;600;700;800;900&display=swap" />
        <div className="min-h-screen bg-white" style={{ fontFamily: "'Inter', sans-serif" }}>
          <Navbar onToggleMenu={() => setMenuOpen(!menuOpen)} variant="solid" />
          {menuOpen && <MenuTakeover categorias={menuCats} onClose={() => setMenuOpen(false)} />}
          <div className="pt-20 px-4 text-center">
            <p className="text-[#0a0a0a]/40 font-light mt-8">No encontramos ese local en tu carrito.</p>
            <button onClick={() => router.push('/carrito')} className="mt-4 bg-[#0a0a0a] text-white px-6 py-3 rounded-full text-sm font-medium hover:bg-[#2a2a2a] transition cursor-pointer">
              Volver al carrito
            </button>
          </div>
        </div>
      </>
    )
  }

  // Construir métodos
  const metodos = []
  if (metodosDisponibles.includes('retiro')) metodos.push({ id: 'retiro', label: 'Retiro en el local', sub: 'Retirás en la dirección del vendedor', costoLabel: 'Gratis', pideDireccion: false, pideTurno: false })
  if (metodosDisponibles.includes('cadeteria')) {
    let costoLabel = 'Seleccioná una dirección'
    if (calculandoZona) costoLabel = 'Calculando...'
    else if (sinBarrio) costoLabel = 'Dirección sin barrio'
    else if (costoCadeteria !== null) costoLabel = `$${fmt(costoCadeteria)}`
    else if (costoCadeteria === null && zonaCadeteria) costoLabel = 'No disponible'
    metodos.push({ id: 'cadeteria', label: 'Cadetería', sub: 'Envío dentro de Bahía Blanca', costoLabel, pideDireccion: true, pideTurno: true })
  }
  if (metodosDisponibles.includes('correo')) {
    let costoLabel = 'Elegí tu zona'
    if (zonaCorreoElegida) { const c = costosVendedor[zonaCorreoElegida]; costoLabel = c !== null && c !== undefined ? `$${fmt(c)}` : 'No disponible' }
    metodos.push({ id: 'correo', label: 'Envío por correo', sub: 'Otras localidades', costoLabel, pideDireccion: true, pideTurno: false })
  }
  if (metodosDisponibles.includes('acordar')) metodos.push({ id: 'acordar', label: 'Acordar con el vendedor', sub: 'Coordinás por WhatsApp', costoLabel: 'A coordinar', pideDireccion: false, pideTurno: false })
  if (metodos.length === 0) metodos.push({ id: 'acordar', label: 'Acordar con el vendedor', sub: 'El vendedor aún no configuró envíos', costoLabel: 'A coordinar', pideDireccion: false, pideTurno: false })

  const metodoActual = metodos.find(m => m.id === metodoElegido)
  const dirElegida = direcciones.find((d) => d.id === direccionElegida)
  const pasos = ['Entrega', 'Revisar y pagar']

  return (
    <>
      <link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Inter:wght@200;300;400;500;600;700;800;900&display=swap" />
      <div className="min-h-screen bg-white" style={{ fontFamily: "'Inter', sans-serif" }}>
        {menuOpen && <MenuTakeover categorias={menuCats} onClose={() => setMenuOpen(false)} />}
        <Navbar onToggleMenu={() => setMenuOpen(!menuOpen)} variant="solid" />

        <div className="pt-20 pb-24 px-4 md:px-8">
          <div className="max-w-xl mx-auto">

            {/* Progreso */}
            <div className="flex items-center justify-center gap-2 mb-8">
              {pasos.map((nombre, i) => {
                const num = i + 1
                const activo = num === paso
                const listo = num < paso
                return (
                  <div key={nombre} className="flex items-center gap-2">
                    <div className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-medium ${
                      listo ? 'bg-[#0a0a0a] text-white' : activo ? 'bg-[#0a0a0a] text-white' : 'border border-[#0a0a0a]/15 text-[#0a0a0a]/30'
                    }`}>
                      {listo ? '✓' : num}
                    </div>
                    <span className={`text-sm ${activo ? 'text-[#0a0a0a] font-medium' : 'text-[#0a0a0a]/30 font-light'}`}>{nombre}</span>
                    {i < pasos.length - 1 && <div className={`w-8 h-px ${listo ? 'bg-[#0a0a0a]' : 'bg-[#0a0a0a]/10'} mx-1`} />}
                  </div>
                )
              })}
            </div>

            {/* ═══ PASO 1 ═══ */}
            {paso === 1 && (
              <div>
                <h2 className="text-xl font-black text-[#0a0a0a] tracking-tight mb-1">¿Cómo lo recibís?</h2>
                <p className="text-sm text-[#0a0a0a]/30 font-light mb-6">Comprando en {local.vendedorNombre}.</p>

                {/* Métodos */}
                <div className="mb-6">
                  {metodos.map((m) => {
                    const sel = metodoElegido === m.id
                    return (
                      <div key={m.id}>
                        <div
                          onClick={() => setMetodoElegido(m.id)}
                          className={`flex items-center gap-3 p-4 rounded-xl cursor-pointer mb-2 transition ${
                            sel ? 'border-2 border-[#0a0a0a]' : 'border border-[#0a0a0a]/10 hover:border-[#0a0a0a]/20'
                          }`}
                        >
                          <div className={`w-4 h-4 rounded-full border-[1.5px] flex items-center justify-center shrink-0 ${sel ? 'border-[#0a0a0a]' : 'border-[#0a0a0a]/20'}`}>
                            {sel && <div className="w-2 h-2 rounded-full bg-[#0a0a0a]" />}
                          </div>
                          <div className="flex-1">
                            <div className="text-sm font-medium text-[#0a0a0a]">{m.label}</div>
                            {m.sub && <div className="text-xs text-[#0a0a0a]/30 font-light">{m.sub}</div>}
                          </div>
                          <span className={`text-sm font-light ${m.costoLabel === 'Gratis' ? 'text-green-600' : 'text-[#0a0a0a]/60'}`}>{m.costoLabel}</span>
                        </div>

                        {/* Correo: zonas */}
                        {sel && m.id === 'correo' && (
                          <div className="ml-10 mb-3">
                            <p className="text-xs text-[#0a0a0a]/30 font-light mb-2">¿En qué zona estás?</p>
                            {ZONAS_CORREO.map(zc => {
                              const costo = costosVendedor[zc.key]
                              if (costo === null || costo === undefined) return null
                              const selZ = zonaCorreoElegida === zc.key
                              return (
                                <div key={zc.key} onClick={() => setZonaCorreoElegida(zc.key)} className={`flex items-center gap-2 p-3 rounded-lg cursor-pointer mb-1 ${selZ ? 'bg-[#F5F2EC]' : ''}`}>
                                  <div className={`w-3.5 h-3.5 rounded-full border-[1.5px] flex items-center justify-center shrink-0 ${selZ ? 'border-[#0a0a0a]' : 'border-[#0a0a0a]/15'}`}>
                                    {selZ && <div className="w-1.5 h-1.5 rounded-full bg-[#0a0a0a]" />}
                                  </div>
                                  <div className="flex-1">
                                    <div className="text-sm font-medium text-[#0a0a0a]">{zc.nombre}</div>
                                    <div className="text-[10px] text-[#0a0a0a]/25 font-light">{zc.descripcion}</div>
                                  </div>
                                  <span className="text-xs text-[#0a0a0a]/60">${fmt(costo)}</span>
                                </div>
                              )
                            })}
                          </div>
                        )}

                        {sel && m.id === 'cadeteria' && sinBarrio && (
                          <div className="ml-10 mb-3 p-3 bg-amber-50 rounded-lg text-xs text-amber-700">Tu dirección no tiene barrio asignado. Agregá una nueva con barrio.</div>
                        )}
                        {sel && m.id === 'cadeteria' && !sinBarrio && costoCadeteria === null && zonaCadeteria && (
                          <div className="ml-10 mb-3 p-3 bg-red-50 rounded-lg text-xs text-red-700">Este vendedor no hace envíos a tu zona.</div>
                        )}
                      </div>
                    )
                  })}
                </div>

                {/* Turno */}
                {metodoActual?.pideTurno && (
                  <div className="mb-6">
                    <label className="block text-sm text-[#0a0a0a]/40 font-light mb-2">¿Cuándo te queda mejor?</label>
                    <div className="flex gap-2">
                      {['Mañana', 'Tarde', 'Indistinto'].map((t) => (
                        <button key={t} type="button" onClick={() => setTurno(t)} className={`flex-1 py-2.5 rounded-full text-sm cursor-pointer transition ${turno === t ? 'bg-[#0a0a0a] text-white font-medium' : 'border border-[#0a0a0a]/10 text-[#0a0a0a]/40 font-light'}`}>
                          {t}
                        </button>
                      ))}
                    </div>
                    <p className="text-[10px] text-[#0a0a0a]/20 font-light mt-2">Es una preferencia; el vendedor la usa para coordinar.</p>
                  </div>
                )}

                {/* Dirección */}
                {metodoActual?.pideDireccion && (
                  <div className="mb-6">
                    <label className="block text-sm text-[#0a0a0a]/40 font-light mb-3">¿A dónde lo enviamos?</label>

                    {direcciones.length === 0 && !mostrarFormDir ? (
                      <div className="border border-[#0a0a0a]/10 rounded-2xl p-4">
                        <p className="text-sm text-[#0a0a0a]/30 font-light mb-3">Es tu primera compra. Cargá una dirección.</p>
                        <FormularioDireccion esPrimera={true} onGuardada={alGuardarDireccion} />
                      </div>
                    ) : (
                      <>
                        {direcciones.map((dir) => {
                          const sel = direccionElegida === dir.id
                          return (
                            <div key={dir.id} onClick={() => setDireccionElegida(dir.id)} className={`flex gap-3 items-start p-4 rounded-xl cursor-pointer mb-2 transition ${sel ? 'border-2 border-[#0a0a0a]' : 'border border-[#0a0a0a]/10'}`}>
                              <div className={`w-4 h-4 rounded-full border-[1.5px] flex items-center justify-center shrink-0 mt-0.5 ${sel ? 'border-[#0a0a0a]' : 'border-[#0a0a0a]/20'}`}>
                                {sel && <div className="w-2 h-2 rounded-full bg-[#0a0a0a]" />}
                              </div>
                              <div>
                                <div className="flex items-center gap-2">
                                  <span className="text-sm font-medium text-[#0a0a0a]">{dir.etiqueta || 'Sin etiqueta'}</span>
                                  {dir.es_principal && <span className="text-[10px] bg-[#F5F2EC] text-[#0a0a0a]/50 px-2 py-0.5 rounded-full font-light">Principal</span>}
                                  {!dir.barrio_id && <span className="text-[10px] bg-amber-50 text-amber-600 px-2 py-0.5 rounded-full font-light">Sin barrio</span>}
                                </div>
                                <p className="text-xs text-[#0a0a0a]/40 font-light mt-1">
                                  {dir.calle} {dir.numero}{dir.piso_depto ? `, ${dir.piso_depto}` : ''} · Tel. {dir.telefono}
                                </p>
                              </div>
                            </div>
                          )
                        })}

                        {mostrarFormDir ? (
                          <div className="border border-[#0a0a0a]/10 rounded-2xl p-4 mt-2">
                            <FormularioDireccion esPrimera={direcciones.length === 0} onGuardada={alGuardarDireccion} onCancelar={() => setMostrarFormDir(false)} />
                          </div>
                        ) : (
                          <button type="button" onClick={() => setMostrarFormDir(true)} className="w-full py-3 border border-dashed border-[#0a0a0a]/15 rounded-xl text-sm text-[#0a0a0a]/40 font-light cursor-pointer hover:border-[#0a0a0a]/30 transition">
                            + Usar otra dirección
                          </button>
                        )}
                      </>
                    )}
                    <p className="text-[10px] text-[#0a0a0a]/20 font-light mt-2">Tus datos se comparten solo con {local.vendedorNombre}, solo para este pedido.</p>
                  </div>
                )}

                {metodoElegido === 'acordar' && (
                  <div className="flex gap-3 items-start bg-[#F5F2EC] rounded-xl p-4 mb-4">
                    <span className="text-sm">💬</span>
                    <p className="text-xs text-[#0a0a0a]/40 font-light leading-relaxed">Pagás solo los productos ahora. El envío lo coordinás con {local.vendedorNombre} por WhatsApp después.</p>
                  </div>
                )}

                <button type="button" disabled={!paso1Listo} onClick={() => setPaso(2)} className={`w-full py-3.5 rounded-full text-sm font-medium transition cursor-pointer mt-2 ${paso1Listo ? 'bg-[#0a0a0a] text-white hover:bg-[#2a2a2a]' : 'bg-[#0a0a0a]/10 text-[#0a0a0a]/20 cursor-not-allowed'}`}>
                  Continuar
                </button>
              </div>
            )}

            {/* ═══ PASO 2 ═══ */}
            {paso === 2 && (
              <div>
                <VolverAtras href="#" texto="Volver a entrega" />
                <div className="-mt-4 mb-6" onClick={(e) => { e.preventDefault(); setPaso(1) }} />

                <button type="button" onClick={() => setPaso(1)} className="text-sm text-[#0a0a0a]/30 font-light mb-6 flex items-center gap-2 cursor-pointer hover:text-[#0a0a0a] transition">
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M10.5 19.5 3 12m0 0 7.5-7.5M3 12h18" />
                  </svg>
                  Volver a entrega
                </button>

                <h2 className="text-xl font-black text-[#0a0a0a] tracking-tight mb-4">Revisá tu compra</h2>

                {/* Productos */}
                <div className="rounded-2xl border border-[#0a0a0a]/5 p-5 mb-3">
                  <div className="font-medium text-sm text-[#0a0a0a] mb-3">{local.vendedorNombre}</div>
                  {local.items.map((item) => (
                    <div key={item.productoId + (item.variante || '')} className="flex justify-between py-2 border-t border-[#0a0a0a]/5 text-sm">
                      <span className="text-[#0a0a0a]/50 font-light">{item.nombre}{item.variante ? ` · ${item.variante}` : ''} × {item.cantidad}</span>
                      <span className="text-[#0a0a0a]">${fmt(item.precio * item.cantidad)}</span>
                    </div>
                  ))}
                </div>

                {/* Entrega */}
                <div className="rounded-2xl border border-[#0a0a0a]/5 p-5 mb-3">
                  <div className="font-medium text-sm text-[#0a0a0a] mb-2">Entrega</div>
                  <p className="text-sm text-[#0a0a0a]/50 font-light">{metodoActual?.label}</p>
                  {metodoActual?.pideTurno && <p className="text-xs text-[#0a0a0a]/30 font-light mt-1">Preferencia: {turno.toLowerCase()}</p>}
                  {dirElegida && (
                    <p className="text-xs text-[#0a0a0a]/40 font-light mt-2">
                      {dirElegida.calle} {dirElegida.numero}{dirElegida.piso_depto ? `, ${dirElegida.piso_depto}` : ''} · Tel. {dirElegida.telefono}
                    </p>
                  )}
                </div>

                {/* Totales */}
                <div className="rounded-2xl border border-[#0a0a0a]/5 p-5 mb-6">
                  <div className="flex justify-between text-sm py-1">
                    <span className="text-[#0a0a0a]/40 font-light">Productos</span>
                    <span className="text-[#0a0a0a]">${fmt(subtotal)}</span>
                  </div>
                  <div className="flex justify-between text-sm py-1">
                    <span className="text-[#0a0a0a]/40 font-light">Envío</span>
                    <span className="text-[#0a0a0a]">{metodoElegido === 'acordar' ? 'A coordinar' : (costoEnvio === 0 ? 'Gratis' : `$${fmt(costoEnvio)}`)}</span>
                  </div>
                  <div className="flex justify-between text-base font-black text-[#0a0a0a] pt-3 mt-1 border-t border-[#0a0a0a]/5">
                    <span>Total</span>
                    <span>${fmt(total)}</span>
                  </div>
                </div>

                <button type="button" disabled={pagando} onClick={pagar} className={`w-full py-3.5 rounded-full text-sm font-medium transition cursor-pointer ${pagando ? 'bg-[#0a0a0a]/30 text-white cursor-not-allowed' : 'bg-[#009ee3] text-white hover:bg-[#0087c7]'}`}>
                  {pagando ? 'Procesando...' : 'Pagar con MercadoPago'}
                </button>
              </div>
            )}
          </div>
        </div>
      </div>
    </>
  )
}

export default function CheckoutPage() {
  return (
    <Suspense fallback={
      <>
        <link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Inter:wght@200;300;400;500;600;700;800;900&display=swap" />
        <div className="min-h-screen bg-white flex items-center justify-center" style={{ fontFamily: "'Inter', sans-serif" }}>
          <span className="text-[#0a0a0a]/30 text-sm font-light">Cargando...</span>
        </div>
      </>
    }>
      <CheckoutContenido />
    </Suspense>
  )
}