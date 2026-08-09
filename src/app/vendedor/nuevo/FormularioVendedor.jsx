'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import dynamic from 'next/dynamic'
import { createClient } from '@/lib/supabase/client'
import BloqueHorarios, { HORARIOS_INICIALES } from './BloqueHorarios'

const MapaUbicacion = dynamic(() => import('./MapaUbicacion'), {
  ssr: false,
  loading: () => <p className="text-[#0a0a0a]/20 text-sm font-light">Cargando mapa...</p>,
})

const CENTRO_BB = { lat: -38.7183, lng: -62.2663 }

const EJEMPLOS_RED = {
  facebook: 'https://facebook.com/bahiashops',
  tiktok: 'https://tiktok.com/@bahiashops',
  otro: 'https://ejemplo.com/bahiashops',
}

const TITULOS_PASOS = {
  1: 'Tu emprendimiento',
  2: 'Ubicación',
  3: 'Disponibilidad y despacho',
}

const inputClasses =
  'w-full px-3 py-2.5 border border-gray-300 rounded-lg outline-none focus:border-[#0a0a0a] focus:ring-1 focus:ring-[#0a0a0a]/20 transition-colors'
const selectClasses = `${inputClasses} bg-white`

export default function FormularioVendedor({ userId }) {
  const router = useRouter()
  const supabase = createClient()

  const [nombreNegocio, setNombreNegocio] = useState('')
  const [descripcionCorta, setDescripcionCorta] = useState('')
  const [descripcionLarga, setDescripcionLarga] = useState('')
  const [instagram, setInstagram] = useState('')
  const [plataformaSitio, setPlataformaSitio] = useState('')
  const [sitioWeb, setSitioWeb] = useState('')
  const [redSecundariaTipo, setRedSecundariaTipo] = useState('')
  const [redSecundariaUrl, setRedSecundariaUrl] = useState('')
  const [whatsapp, setWhatsapp] = useState('')
  const [usarOtroEmail, setUsarOtroEmail] = useState(false)
  const [emailContacto, setEmailContacto] = useState('')

  const [recibePublico, setRecibePublico] = useState(null)
  const [localidadId, setLocalidadId] = useState('')
  const [direccion, setDireccion] = useState('')
  const [barrioId, setBarrioId] = useState('')

  const [latitud, setLatitud] = useState(null)
  const [longitud, setLongitud] = useState(null)
  const [barrioAuto, setBarrioAuto] = useState(false)
  const [barrioDetectado, setBarrioDetectado] = useState(null)
  const [mapaVisible, setMapaVisible] = useState(false)
  const [posicionBuscada, setPosicionBuscada] = useState(null)
  const [buscando, setBuscando] = useState(false)
  const [avisoMapa, setAvisoMapa] = useState(null)

  const [localidades, setLocalidades] = useState([])
  const [barrios, setBarrios] = useState([])
  const [categorias, setCategorias] = useState([])
  const [categoriaId, setCategoriaId] = useState('')

  // ── Sellos ──
  const [sellos, setSellos] = useState([])
  const [sellosSeleccionados, setSellosSeleccionados] = useState([])

  // ── Flujo Alimentos ──
  const [alimentosCamino, setAlimentosCamino] = useState(null)
  const [leadNombre, setLeadNombre] = useState('')
  const [leadWhatsapp, setLeadWhatsapp] = useState('')
  const [leadQueHace, setLeadQueHace] = useState('')
  const [leadEmail, setLeadEmail] = useState('')
  const [leadEnviado, setLeadEnviado] = useState(false)
  const [enviandoLead, setEnviandoLead] = useState(false)

  const esAlimentos = categoriaId === '12'

  async function enviarLeadGastronomia() {
    if (!leadNombre.trim() || !leadQueHace.trim()) {
      alert('Completá tu nombre y qué hacés.')
      return
    }
    setEnviandoLead(true)
    try {
      await supabase.from('leads_gastronomia').insert({
        nombre: leadNombre.trim(),
        whatsapp: leadWhatsapp ? '+549' + leadWhatsapp.replace(/\D/g, '') : null,
        que_hace: leadQueHace.trim(),
        email: leadEmail.trim() || null,
      })
      await fetch('/api/lead-gastronomia', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          nombre: leadNombre.trim(),
          whatsapp: leadWhatsapp ? '+549' + leadWhatsapp.replace(/\D/g, '') : null,
          queHace: leadQueHace.trim(),
          email: leadEmail.trim() || null,
        }),
      })
      setLeadEnviado(true)
    } catch (err) {
      console.error('Error enviando lead:', err)
      alert('Hubo un error. Probá de nuevo.')
    } finally {
      setEnviandoLead(false)
    }
  }

  function toggleSello(selloId) {
    setSellosSeleccionados((actuales) =>
      actuales.includes(selloId)
        ? actuales.filter((id) => id !== selloId)
        : [...actuales, selloId]
    )
  }

  const [horarios, setHorarios] = useState(HORARIOS_INICIALES)
  const [notasHorarios, setNotasHorarios] = useState('')
  const [tiempoDespacho, setTiempoDespacho] = useState('')
  const [metodosEntrega, setMetodosEntrega] = useState([])

  function toggleMetodo(metodo) {
    setMetodosEntrega((actuales) =>
      actuales.includes(metodo) ? actuales.filter((m) => m !== metodo) : [...actuales, metodo]
    )
  }

  const [paso, setPaso] = useState(1)
  const [guardando, setGuardando] = useState(false)
  const [error, setError] = useState(null)

  useEffect(() => {
    async function cargarDatos() {
      const { data: locs } = await supabase.from('localidades').select('id, nombre').order('nombre')
      const { data: brs } = await supabase.from('barrios').select('id, nombre, localidad_id').order('nombre')

      // Todas las categorías (las inactivas se activan al ser elegidas)
      const { data: cats } = await supabase
        .from('categorias')
        .select('id, nombre, activa')
        .order('orden')

      // Sellos activos
      const { data: slls } = await supabase
        .from('sellos')
        .select('id, nombre')
        .eq('activa', true)
        .order('orden')

      if (locs) setLocalidades(locs)
      if (brs) setBarrios(brs)
      if (cats) setCategorias(cats)
      if (slls) setSellos(slls)
    }
    cargarDatos()
  }, [])

  const barriosDeLaLocalidad = localidadId ? barrios.filter((b) => b.localidad_id === Number(localidadId)) : []
  const localidadTieneBarrios = barriosDeLaLocalidad.length > 0
  const tienePlataforma = plataformaSitio !== '' && plataformaSitio !== 'no_tengo'
  const tieneRedSecundaria = redSecundariaTipo !== '' && redSecundariaTipo !== 'no_tengo'
  const placeholderRed = EJEMPLOS_RED[redSecundariaTipo] || 'https://...'

  function resetearUbicacion() {
    setBarrioId(''); setLatitud(null); setLongitud(null); setBarrioAuto(false)
    setBarrioDetectado(null); setMapaVisible(false); setPosicionBuscada(null); setAvisoMapa(null)
  }

  async function buscarDireccion() {
    if (!direccion) return
    setBuscando(true); setAvisoMapa(null)
    const nombreLocalidad = localidades.find((l) => l.id === Number(localidadId))?.nombre || 'Bahía Blanca'
    const consulta = `${direccion}, ${nombreLocalidad}, Argentina`
    try {
      const url = 'https://nominatim.openstreetmap.org/search?format=jsonv2&limit=1&q=' + encodeURIComponent(consulta)
      const respuesta = await fetch(url)
      const datos = await respuesta.json()
      setMapaVisible(true)
      if (datos && datos.length > 0) {
        setPosicionBuscada({ lat: parseFloat(datos[0].lat), lng: parseFloat(datos[0].lon), zoom: 16, nonce: Date.now() })
      } else {
        setAvisoMapa('No pudimos ubicar esa dirección exacta. Arrastrá el pin hasta tu local.')
        setPosicionBuscada({ ...CENTRO_BB, zoom: 13, nonce: Date.now() })
      }
    } catch (e) {
      setMapaVisible(true)
      setAvisoMapa('Hubo un problema al buscar la dirección. Arrastrá el pin hasta tu local.')
      setPosicionBuscada({ ...CENTRO_BB, zoom: 13, nonce: Date.now() })
    }
    setBuscando(false)
  }

  function manejarUbicacion({ lat, lng, barrioDetectado: detectado }) {
    setLatitud(lat); setLongitud(lng); setBarrioDetectado(detectado)
    if (detectado) { setBarrioId(String(detectado.id)); setBarrioAuto(true) }
    else { setBarrioAuto(false) }
  }

  function generarSlug(texto) {
    return texto.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '')
      .replace(/[^a-z0-9\s-]/g, '').trim().replace(/\s+/g, '-')
  }

  function armarTelefonoCompleto(numero) {
    if (!numero) return null
    return '+549' + numero.replace(/\D/g, '')
  }

  function irAlAnterior() {
    setPaso((p) => p - 1)
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  async function handleSubmit(e) {
    e.preventDefault()
    if (paso < 3) { setPaso((p) => p + 1); window.scrollTo({ top: 0, behavior: 'smooth' }); return }

    setError(null); setGuardando(true)
    const slug = generarSlug(nombreNegocio)

    // Insertar vendedor
    const { data: vendedorNuevo, error: errorInsert } = await supabase
      .from('vendedores')
      .insert({
        usuario_id: userId, categoria_id: categoriaId ? Number(categoriaId) : null,
        nombre_negocio: nombreNegocio, slug, descripcion_corta: descripcionCorta,
        descripcion_larga: descripcionLarga || null, instagram,
        plataforma_sitio: plataformaSitio || null, sitio_web: tienePlataforma ? sitioWeb : null,
        red_social_secundaria_tipo: redSecundariaTipo || null,
        red_social_secundaria_url: tieneRedSecundaria ? redSecundariaUrl : null,
        telefono_contacto: armarTelefonoCompleto(whatsapp),
        email_contacto: usarOtroEmail ? emailContacto : null,
        recibe_publico: recibePublico, localidad_id: localidadId ? Number(localidadId) : null,
        direccion: recibePublico ? direccion : null, barrio_id: barrioId ? Number(barrioId) : null,
        latitud: recibePublico ? latitud : null, longitud: recibePublico ? longitud : null,
        barrio_detectado_automaticamente: barrioAuto, horarios_estructurados: horarios,
        notas_horarios: notasHorarios || null, tiempo_despacho: tiempoDespacho || null,
        metodos_entrega_default: metodosEntrega,
      })
      .select('id')
      .single()

    if (errorInsert) {
      if (errorInsert.code === '23505') setError('Ya tenés un emprendimiento creado con esta cuenta. Por ahora cada usuario puede tener uno solo.')
      else setError(errorInsert.message)
      setGuardando(false); return
    }

    // Activar categoría si estaba inactiva
    if (vendedorNuevo && categoriaId) {
      const catElegida = categorias.find((c) => c.id === Number(categoriaId))
      if (catElegida && !catElegida.activa) {
        await supabase
          .from('categorias')
          .update({ activa: true })
          .eq('id', Number(categoriaId))
      }
    }

    // Guardar sellos seleccionados
    if (vendedorNuevo && sellosSeleccionados.length > 0) {
      const filasSellos = sellosSeleccionados.map((selloId) => ({
        vendedor_id: vendedorNuevo.id,
        sello_id: selloId,
      }))

      const { error: errorSellos } = await supabase
        .from('vendedor_sellos')
        .insert(filasSellos)

      if (errorSellos) {
        console.error('Error al guardar sellos:', errorSellos.message)
        // No bloqueamos el registro por esto — el vendedor ya se creó
      }
    }

    router.push('/')
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-4">
      {/* Encabezado del paso */}
      <div className="mb-2">
        <h2 className="text-lg font-black text-[#0a0a0a] tracking-tight m-0">
          {TITULOS_PASOS[paso]}
        </h2>
        <span className="text-[11px] text-[#0a0a0a]/25 font-light">Paso {paso} de 3</span>
      </div>

      {/* ───── PASO 1 ───── */}
      {paso === 1 && (
        <>
          <label className="flex flex-col gap-1">
            <span className="text-sm text-[#0a0a0a]/60 font-light">Nombre del emprendimiento *</span>
            <input type="text" required maxLength={80} value={nombreNegocio}
              onChange={(e) => setNombreNegocio(e.target.value)} className={inputClasses} />
          </label>

          <label className="flex flex-col gap-1">
            <span className="text-sm text-[#0a0a0a]/60 font-light">Categoría / rubro *</span>
            <span className="text-[11px] text-[#0a0a0a]/25 font-light">El rubro principal de tu emprendimiento.</span>
            <select required value={categoriaId} onChange={(e) => { setCategoriaId(e.target.value); setAlimentosCamino(null); setLeadEnviado(false) }} className={selectClasses}>
              <option value="">Elegí tu rubro</option>
              {categorias.map((c) => <option key={c.id} value={c.id}>{c.nombre}</option>)}
            </select>
          </label>

          {/* ── Flujo Alimentos y bebidas ── */}
          {esAlimentos && !alimentosCamino && !leadEnviado && (
            <div className="rounded-2xl border border-[#0a0a0a]/5 p-5 flex flex-col gap-3">
              <p className="text-sm text-[#0a0a0a]/60 font-light m-0">
                ¿Qué tipo de productos alimenticios vendés?
              </p>
              <button type="button" onClick={() => setAlimentosCamino('envasados')}
                className="w-full p-4 border border-[#0a0a0a]/10 rounded-xl text-left cursor-pointer bg-white hover:border-[#0a0a0a]/30 transition-all">
                <span className="block text-sm font-medium text-[#0a0a0a]">Productos envasados y no perecederos</span>
                <span className="block text-[11px] text-[#0a0a0a]/40 font-light mt-1">
                  Conservas, bebidas embotelladas, snacks, especias, yerba, café, chocolates...
                </span>
              </button>
              <button type="button" onClick={() => setAlimentosCamino('cocinero')}
                className="w-full p-4 border border-[#0a0a0a]/10 rounded-xl text-left cursor-pointer bg-white hover:border-[#0a0a0a]/30 transition-all">
                <span className="block text-sm font-medium text-[#0a0a0a]">Soy cocinero/a, pastelero/a o gastronómico/a</span>
                <span className="block text-[11px] text-[#0a0a0a]/40 font-light mt-1">
                  Comidas preparadas, repostería, catering, tortas, viandas...
                </span>
              </button>
            </div>
          )}

          {esAlimentos && alimentosCamino === 'envasados' && (
            <div className="p-3 bg-emerald-50 border border-emerald-200 rounded-lg text-sm text-emerald-800">
              ✓ Los productos envasados y no perecederos están habilitados para la venta en Bahía Shops. Continuá con el registro.
            </div>
          )}

          {esAlimentos && alimentosCamino === 'cocinero' && !leadEnviado && (
            <div className="rounded-2xl border border-[#0a0a0a]/5 p-5 flex flex-col gap-4">
              <div>
                <p className="text-sm font-medium text-[#0a0a0a] m-0">¡Nos encanta que quieras sumarte!</p>
                <p className="text-sm text-[#0a0a0a]/40 font-light mt-1 mb-0">
                  Estamos preparando planes especiales para profesionales que prestan servicios. Dejanos tus datos y te contactamos cuando estén listos.
                </p>
              </div>
              <label className="flex flex-col gap-1">
                <span className="text-sm text-[#0a0a0a]/60 font-light">Tu nombre *</span>
                <input type="text" required value={leadNombre}
                  onChange={(e) => setLeadNombre(e.target.value)}
                  placeholder="Nombre y apellido" className={inputClasses} />
              </label>
              <label className="flex flex-col gap-1">
                <span className="text-sm text-[#0a0a0a]/60 font-light">¿Qué hacés? *</span>
                <input type="text" required value={leadQueHace}
                  onChange={(e) => setLeadQueHace(e.target.value)}
                  placeholder="Ej: Pastelería artesanal, viandas saludables..." className={inputClasses} />
              </label>
              <label className="flex flex-col gap-1">
                <span className="text-sm text-[#0a0a0a]/60 font-light">WhatsApp</span>
                <div className="flex gap-2 items-stretch">
                  <span className="px-3 py-2.5 border border-gray-300 rounded-lg bg-[#F5F2EC] text-[#0a0a0a]/40 flex items-center text-sm font-light">
                    +54 9
                  </span>
                  <input type="tel" value={leadWhatsapp}
                    onChange={(e) => setLeadWhatsapp(e.target.value.replace(/\D/g, ''))}
                    placeholder="291 555 1234" className={`${inputClasses} flex-1`} />
                </div>
              </label>
              <label className="flex flex-col gap-1">
                <span className="text-sm text-[#0a0a0a]/60 font-light">Email</span>
                <input type="email" value={leadEmail}
                  onChange={(e) => setLeadEmail(e.target.value)}
                  placeholder="tucorreo@ejemplo.com" className={inputClasses} />
              </label>
              <button type="button" onClick={enviarLeadGastronomia} disabled={enviandoLead}
                className={`w-full px-6 py-2.5 border-none rounded-full text-sm text-white font-medium transition-colors ${
                  enviandoLead ? 'bg-[#0a0a0a]/30 cursor-not-allowed' : 'bg-[#0a0a0a] cursor-pointer hover:bg-[#1a1a1a]'
                }`}>
                {enviandoLead ? 'Enviando...' : 'Enviar mis datos'}
              </button>
            </div>
          )}

          {esAlimentos && leadEnviado && (
            <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-5 text-center">
              <p className="text-lg font-black text-emerald-800 m-0">¡Gracias!</p>
              <p className="text-sm text-emerald-700 mt-2 mb-0">
                Recibimos tus datos. Te vamos a contactar cuando los planes para gastronómicos estén listos.
              </p>
            </div>
          )}

          {/* ── Resto del formulario (oculto si eligió Camino B) ── */}
          {(!esAlimentos || alimentosCamino === 'envasados') && (
          <>

          {/* ── Sellos ── */}
          <div className="flex flex-col gap-2">
            <span className="text-sm text-[#0a0a0a]/60 font-light">
              Sellos <span className="text-[#0a0a0a]/25">(opcional)</span>
            </span>
            <span className="text-[11px] text-[#0a0a0a]/25 font-light">
              ¿Tu emprendimiento tiene alguno de estos sellos? Elegí los que apliquen.
            </span>
            <div className="flex flex-wrap gap-2">
              {sellos.map((s) => {
                const activo = sellosSeleccionados.includes(s.id)
                return (
                  <button
                    key={s.id}
                    type="button"
                    onClick={() => toggleSello(s.id)}
                    className={`px-3 py-1.5 rounded-full text-sm transition-all cursor-pointer border ${
                      activo
                        ? 'bg-[#0a0a0a] text-white border-[#0a0a0a]'
                        : 'bg-white text-[#0a0a0a]/60 border-[#0a0a0a]/10 hover:border-[#0a0a0a]/30'
                    }`}
                  >
                    {s.nombre}
                  </button>
                )
              })}
            </div>
          </div>

          <label className="flex flex-col gap-1">
            <span className="text-sm text-[#0a0a0a]/60 font-light">
              Descripción corta * <span className="text-[#0a0a0a]/25">(una línea, es lo primero que van a leer los compradores sobre tu emprendimiento)</span>
            </span>
            <input type="text" required maxLength={140} value={descripcionCorta}
              onChange={(e) => setDescripcionCorta(e.target.value)} className={inputClasses} />
          </label>

          <label className="flex flex-col gap-1">
            <span className="text-sm text-[#0a0a0a]/60 font-light">
              Descripción larga <span className="text-[#0a0a0a]/25">(opcional)</span>
            </span>
            <textarea rows={5} maxLength={1000} value={descripcionLarga}
              onChange={(e) => setDescripcionLarga(e.target.value)}
              className={`${inputClasses} font-[inherit]`} />
          </label>

          <label className="flex flex-col gap-1">
            <span className="text-sm text-[#0a0a0a]/60 font-light">Instagram *</span>
            <input type="text" required placeholder="bahiashops (sin @)" value={instagram}
              onChange={(e) => setInstagram(e.target.value.replace('@', ''))} className={inputClasses} />
          </label>

          <label className="flex flex-col gap-1">
            <span className="text-sm text-[#0a0a0a]/60 font-light">Sitio web propio</span>
            <select value={plataformaSitio} onChange={(e) => setPlataformaSitio(e.target.value)} className={selectClasses}>
              <option value="">Elegí una opción</option>
              <option value="no_tengo">No tengo sitio web</option>
              <option value="tienda_nube">Tienda Nube</option>
              <option value="empretienda">Empretienda</option>
              <option value="mercado_shops">Mercado Shops</option>
              <option value="shopify">Shopify</option>
              <option value="wordpress">WordPress / WooCommerce</option>
              <option value="wix">Wix</option>
              <option value="hecho_a_medida">Hecho a medida</option>
              <option value="otro">Otro</option>
            </select>
          </label>

          {tienePlataforma && (
            <label className="flex flex-col gap-1">
              <span className="text-sm text-[#0a0a0a]/60 font-light">URL del sitio *</span>
              <input type="url" required placeholder="https://bahiashops.com.ar" value={sitioWeb}
                onChange={(e) => setSitioWeb(e.target.value)} className={inputClasses} />
            </label>
          )}

          <label className="flex flex-col gap-1">
            <span className="text-sm text-[#0a0a0a]/60 font-light">Otra red social</span>
            <select value={redSecundariaTipo} onChange={(e) => setRedSecundariaTipo(e.target.value)} className={selectClasses}>
              <option value="">Elegí una opción</option>
              <option value="no_tengo">No tengo otra red</option>
              <option value="facebook">Facebook</option>
              <option value="tiktok">TikTok</option>
              <option value="otro">Otro</option>
            </select>
          </label>

          {tieneRedSecundaria && (
            <label className="flex flex-col gap-1">
              <span className="text-sm text-[#0a0a0a]/60 font-light">URL o usuario *</span>
              <input type="text" required placeholder={placeholderRed} value={redSecundariaUrl}
                onChange={(e) => setRedSecundariaUrl(e.target.value)} className={inputClasses} />
            </label>
          )}

          <label className="flex flex-col gap-1">
            <span className="text-sm text-[#0a0a0a]/60 font-light">
              WhatsApp <span className="text-[#0a0a0a]/25">(recomendado)</span>
            </span>
            <div className="flex gap-2 items-stretch">
              <span className="px-3 py-2.5 border border-gray-300 rounded-lg bg-[#F5F2EC] text-[#0a0a0a]/40 flex items-center text-sm font-light">
                +54 9
              </span>
              <input type="tel" placeholder="291 555 1234 (sin 0 y sin 15)" value={whatsapp}
                onChange={(e) => setWhatsapp(e.target.value.replace(/\D/g, ''))}
                className={`${inputClasses} flex-1`} />
            </div>
          </label>

          <label className="flex items-center gap-2 cursor-pointer">
            <input type="checkbox" checked={usarOtroEmail} onChange={(e) => setUsarOtroEmail(e.target.checked)}
              className="accent-[#0a0a0a]" />
            <span className="text-sm text-[#0a0a0a]/60 font-light">Usar otro email para contacto público</span>
          </label>

          {usarOtroEmail && (
            <label className="flex flex-col gap-1">
              <span className="text-sm text-[#0a0a0a]/60 font-light">Email de contacto *</span>
              <input type="email" required placeholder="contacto@bahiashops.com.ar" value={emailContacto}
                onChange={(e) => setEmailContacto(e.target.value)} className={inputClasses} />
            </label>
          )}

          </>
          )}
        </>
      )}

      {/* ───── PASO 2 ───── */}
      {paso === 2 && (
        <div className="rounded-2xl border border-[#0a0a0a]/5 p-5 flex flex-col gap-4">
          <div className="flex flex-col gap-2">
            <span className="text-sm text-[#0a0a0a]/60 font-light">¿Recibís gente en tu local, taller o showroom? *</span>
            <label className="flex items-center gap-2 cursor-pointer">
              <input type="radio" name="recibe_publico" checked={recibePublico === true}
                onChange={() => { setRecibePublico(true); resetearUbicacion() }} required className="accent-[#0a0a0a]" />
              <span className="text-sm">Sí, recibo gente</span>
            </label>
            <label className="flex items-center gap-2 cursor-pointer">
              <input type="radio" name="recibe_publico" checked={recibePublico === false}
                onChange={() => { setRecibePublico(false); resetearUbicacion() }} className="accent-[#0a0a0a]" />
              <span className="text-sm">No, vendo desde casa o solo despacho</span>
            </label>
          </div>

          {recibePublico !== null && (
            <label className="flex flex-col gap-1">
              <span className="text-sm text-[#0a0a0a]/60 font-light">Localidad *</span>
              <select value={localidadId} onChange={(e) => { setLocalidadId(e.target.value); resetearUbicacion() }}
                required className={selectClasses}>
                <option value="">Elegí una localidad</option>
                {localidades.map((l) => <option key={l.id} value={l.id}>{l.nombre}</option>)}
              </select>
            </label>
          )}

          {recibePublico !== null && localidadId && localidadTieneBarrios && (
            <>
              <div className="flex flex-col gap-1">
                <span className="text-sm text-[#0a0a0a]/60 font-light">Dirección *</span>
                <span className="text-[11px] text-[#0a0a0a]/25 font-light">
                  {recibePublico
                    ? 'Escribí la dirección de tu local y tocá "Ubicar".'
                    : 'La usamos solo para detectar tu barrio. No se guarda ni se muestra.'}
                </span>
                <div className="flex gap-2 items-stretch">
                  <input type="text" required placeholder="Ej: Donado 1234" value={direccion}
                    onChange={(e) => setDireccion(e.target.value)} className={`${inputClasses} flex-1`} />
                  <button type="button" onClick={buscarDireccion} disabled={buscando || !direccion}
                    className={`px-4 py-2.5 text-white border-none rounded-lg whitespace-nowrap transition-colors text-sm ${
                      buscando || !direccion ? 'bg-[#0a0a0a]/20 cursor-not-allowed' : 'bg-[#0a0a0a] cursor-pointer hover:bg-[#1a1a1a]'
                    }`}>
                    {buscando ? 'Buscando...' : 'Ubicar 📍'}
                  </button>
                </div>
              </div>

              {mapaVisible && (
                <>
                  {avisoMapa && (
                    <div className="p-3 bg-amber-50 border border-amber-200 rounded-lg text-sm text-amber-800">
                      {avisoMapa}
                    </div>
                  )}

                  <MapaUbicacion posicionBuscada={posicionBuscada} onUbicacionChange={manejarUbicacion} />

                  {barrioDetectado ? (
                    <p className="text-sm m-0">
                      📍 Tu local está en <strong>{barrioDetectado.nombre}</strong>. Si la ubicación no es exacta, arrastrá el pin.
                    </p>
                  ) : latitud ? (
                    <label className="flex flex-col gap-1">
                      <span className="text-sm text-[#0a0a0a]/60 font-light">No pudimos detectar el barrio. Elegilo vos:</span>
                      <select value={barrioId} onChange={(e) => { setBarrioId(e.target.value); setBarrioAuto(false) }}
                        required className={selectClasses}>
                        <option value="">Elegí un barrio</option>
                        {barriosDeLaLocalidad.map((b) => <option key={b.id} value={b.id}>{b.nombre}</option>)}
                      </select>
                    </label>
                  ) : null}

                  {recibePublico && latitud && longitud && (
                    <span className="text-[11px] text-[#0a0a0a]/20 font-mono font-light">
                      📍 {latitud.toFixed(6)}, {longitud.toFixed(6)}
                    </span>
                  )}
                </>
              )}
            </>
          )}
        </div>
      )}

      {/* ───── PASO 3 ───── */}
      {paso === 3 && (
        <div className="rounded-2xl border border-[#0a0a0a]/5 p-5 flex flex-col gap-4">
          <div>
            <span className="block mb-2 text-sm text-[#0a0a0a]/60 font-light">Horarios de atención</span>
            <BloqueHorarios valor={horarios} onChange={setHorarios} notas={notasHorarios} onNotasChange={setNotasHorarios} />
          </div>

          <div className="flex flex-col gap-2">
            <span className="text-sm text-[#0a0a0a]/60 font-light">Tiempo de despacho *</span>
            <span className="text-[11px] text-[#0a0a0a]/25 font-light">Cuánto te lleva en general despachar un pedido.</span>
            {[
              { valor: 'mismo_dia',  label: 'Mismo día (si se compra dentro del horario)' },
              { valor: '24_48hs',    label: '24 a 48 horas hábiles' },
              { valor: '2_5_dias',   label: '2 a 5 días hábiles' },
              { valor: 'mas_5_dias', label: 'Más de 5 días / a coordinar' },
            ].map((opcion) => (
              <label key={opcion.valor} className="flex items-center gap-2 cursor-pointer">
                <input type="radio" name="tiempo_despacho" value={opcion.valor}
                  checked={tiempoDespacho === opcion.valor}
                  onChange={(e) => setTiempoDespacho(e.target.value)} required className="accent-[#0a0a0a]" />
                <span className="text-sm">{opcion.label}</span>
              </label>
            ))}
          </div>

          <div className="flex flex-col gap-2">
            <span className="text-sm text-[#0a0a0a]/60 font-light">Métodos de entrega típicos</span>
            <span className="text-[11px] text-[#0a0a0a]/25 font-light">Los que usás habitualmente. Después podés ajustar producto por producto.</span>
            {[
              { valor: 'retiro',        label: 'Retiro en mi local / domicilio' },
              { valor: 'coordinar',     label: 'A coordinar con el comprador' },
              { valor: 'envio_propio',  label: 'Envío propio (yo lo llevo)' },
              { valor: 'flash_pedidos', label: 'Uber Flash / PedidosYa Envíos' },
              { valor: 'correo',        label: 'Correo / encomienda' },
            ].map((opcion) => (
              <label key={opcion.valor} className="flex items-center gap-2 cursor-pointer">
                <input type="checkbox" checked={metodosEntrega.includes(opcion.valor)}
                  onChange={() => toggleMetodo(opcion.valor)} className="accent-[#0a0a0a]" />
                <span className="text-sm">{opcion.label}</span>
              </label>
            ))}
          </div>
        </div>
      )}

      {/* Error */}
      {error && (
        <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-red-800 text-sm">
          {error}
        </div>
      )}

      {/* Navegación */}
      <div className="flex gap-3 justify-between mt-2">
        {paso > 1 ? (
          <button type="button" onClick={irAlAnterior}
            className="px-5 py-2.5 border border-[#0a0a0a]/10 rounded-full bg-white text-sm text-[#0a0a0a]/60 font-light cursor-pointer hover:border-[#0a0a0a]/30 transition-all">
            ← Anterior
          </button>
        ) : <div />}

        <button type="submit" disabled={guardando}
          className={`px-6 py-2.5 border-none rounded-full text-sm text-white font-medium transition-colors ${
            guardando ? 'bg-[#0a0a0a]/30 cursor-not-allowed' : 'bg-[#0a0a0a] cursor-pointer hover:bg-[#1a1a1a]'
          }`}>
          {paso < 3 ? 'Siguiente →' : (guardando ? 'Guardando...' : 'Sumar mi emprendimiento')}
        </button>
      </div>
    </form>
  )
}