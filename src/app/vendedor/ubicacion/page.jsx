'use client'

import { useState, useEffect } from 'react'
import dynamic from 'next/dynamic'
import { createClient } from '@/lib/supabase/client'
import Navbar from '@/components/Navbar'
import MenuTakeover from '@/components/MenuTakeover'
import VolverAtras from '@/components/VolverAtras'
import {
  inputClasses, selectClasses, fuenteTitulo, fuenteAyuda, ayudaClasses, labelClasses,
  btnNegro, btnNegroInactivo,
} from '@/lib/estilosVendedor'

const MapaUbicacion = dynamic(
  () => import('@/app/vendedor/nuevo/MapaUbicacion'),
  {
    ssr: false,
    loading: () => (
      <div className="h-[300px] bg-[#F5F2EC] rounded-lg flex items-center justify-center text-[#0a0a0a]/30 text-sm font-light">
        Cargando mapa...
      </div>
    ),
  }
)

const CENTRO_BB = { lat: -38.7183, lng: -62.2663 }

const MENU_CATEGORIAS = ['moda','belleza-y-bienestar','joyeria-y-accesorios','hogar-y-deco','artes-y-oficios','bebes-y-maternidad','juegos-y-juguetes','mascotas','libros','deporte','vintage']

export default function UbicacionVendedorPage() {
  const supabase = createClient()

  const [menuOpen, setMenuOpen] = useState(false)
  const [categorias, setCategorias] = useState([])

  const [cargando, setCargando] = useState(true)
  const [vendedorId, setVendedorId] = useState(null)

  const [recibePublico, setRecibePublico] = useState(null)
  const [localidadId, setLocalidadId] = useState('')
  const [direccion, setDireccion] = useState('')

  const [latitud, setLatitud] = useState(null)
  const [longitud, setLongitud] = useState(null)
  const [barrioId, setBarrioId] = useState('')
  const [barrioAuto, setBarrioAuto] = useState(false)
  const [barrioDetectado, setBarrioDetectado] = useState(null)

  const [mapaVisible, setMapaVisible] = useState(false)
  const [posicionBuscada, setPosicionBuscada] = useState(null)
  const [buscando, setBuscando] = useState(false)
  const [avisoMapa, setAvisoMapa] = useState(null)

  const [localidades, setLocalidades] = useState([])
  const [barrios, setBarrios] = useState([])

  const [guardando, setGuardando] = useState(false)
  const [guardado, setGuardado] = useState(false)

  useEffect(() => {
    if (menuOpen) { document.body.style.overflow = 'hidden' } else { document.body.style.overflow = '' }
    return () => { document.body.style.overflow = '' }
  }, [menuOpen])

  // ── Cargar datos actuales ──
  useEffect(() => {
    async function cargar() {
      const { data: cats } = await supabase.from('categorias').select('id, nombre, slug').eq('activa', true).order('orden')
      if (cats) setCategorias(cats)

      const { data: { user } } = await supabase.auth.getUser()
      if (!user) { setCargando(false); return }

      const { data: vendedor } = await supabase
        .from('vendedores')
        .select('id, recibe_publico, localidad_id, direccion, latitud, longitud, barrio_id, barrio_detectado_automaticamente')
        .eq('usuario_id', user.id)
        .single()

      if (!vendedor) { setCargando(false); return }

      setVendedorId(vendedor.id)
      setRecibePublico(vendedor.recibe_publico)
      setLocalidadId(vendedor.localidad_id ? String(vendedor.localidad_id) : '')
      setDireccion(vendedor.direccion || '')
      setLatitud(vendedor.latitud)
      setLongitud(vendedor.longitud)
      setBarrioId(vendedor.barrio_id ? String(vendedor.barrio_id) : '')
      setBarrioAuto(vendedor.barrio_detectado_automaticamente || false)

      // Cargar listas
      const { data: locs } = await supabase.from('localidades').select('id, nombre').order('nombre')
      const { data: brs } = await supabase.from('barrios').select('id, nombre, localidad_id').order('nombre')
      if (locs) setLocalidades(locs)
      if (brs) setBarrios(brs)

      // Si tiene coordenadas, cargar el nombre del barrio y mostrar el mapa
      if (vendedor.barrio_id) {
        const barrio = (brs || []).find(b => b.id === vendedor.barrio_id)
        if (barrio) setBarrioDetectado(barrio)
      }

      if (vendedor.latitud && vendedor.longitud) {
        setMapaVisible(true)
        setPosicionBuscada({
          lat: vendedor.latitud,
          lng: vendedor.longitud,
          zoom: 16,
          nonce: Date.now(),
        })
      }

      setCargando(false)
    }
    cargar()
  }, [])

  const barriosDeLaLocalidad = localidadId
    ? barrios.filter((b) => b.localidad_id === Number(localidadId))
    : []
  const localidadTieneBarrios = barriosDeLaLocalidad.length > 0

  function resetearUbicacion() {
    setBarrioId('')
    setLatitud(null)
    setLongitud(null)
    setBarrioAuto(false)
    setBarrioDetectado(null)
    setMapaVisible(false)
    setPosicionBuscada(null)
    setAvisoMapa(null)
  }

  async function buscarDireccion() {
    if (!direccion) return
    setBuscando(true)
    setAvisoMapa(null)

    const nombreLocalidad =
      localidades.find((l) => l.id === Number(localidadId))?.nombre || 'Bahía Blanca'
    const consulta = `${direccion}, ${nombreLocalidad}, Argentina`

    try {
      const url =
        'https://nominatim.openstreetmap.org/search?format=jsonv2&limit=1&q=' +
        encodeURIComponent(consulta)
      const respuesta = await fetch(url)
      const datos = await respuesta.json()

      setMapaVisible(true)

      if (datos && datos.length > 0) {
        const lat = parseFloat(datos[0].lat)
        const lng = parseFloat(datos[0].lon)
        setPosicionBuscada({ lat, lng, zoom: 16, nonce: Date.now() })
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
    setLatitud(lat)
    setLongitud(lng)
    setBarrioDetectado(detectado)
    setGuardado(false)

    if (detectado) {
      setBarrioId(String(detectado.id))
      setBarrioAuto(true)
    } else {
      setBarrioAuto(false)
    }
  }

  async function guardar() {
    if (!barrioId) {
      alert('Necesitamos saber tu barrio. Usá el mapa o elegilo de la lista.')
      return
    }

    setGuardando(true)

    const campos = {
      recibe_publico: recibePublico,
      localidad_id: localidadId ? Number(localidadId) : null,
      direccion: recibePublico ? direccion : null,
      barrio_id: Number(barrioId),
      latitud: latitud,
      longitud: longitud,
      barrio_detectado_automaticamente: barrioAuto,
    }

    const { error } = await supabase
      .from('vendedores')
      .update(campos)
      .eq('id', vendedorId)

    if (error) {
      alert('No se pudo guardar: ' + error.message)
    } else {
      setGuardado(true)
      setTimeout(() => setGuardado(false), 3000)
    }

    setGuardando(false)
  }

  // ── Render ──
  // Un único árbol: si el <link> y el Navbar cambiaran de posición según el
  // estado, el HTML del servidor y el del cliente no coincidirían (hydration).

  const menuCats = MENU_CATEGORIAS.map((s) => categorias.find((c) => c.slug === s)).filter(Boolean)

  return (
    <>
      <link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Fraunces:opsz,wght@9..144,100..900&family=Poppins:wght@300;400;500&family=Inter:wght@200;300;400;500;600;700;800;900&display=swap" />

      <div className="min-h-screen bg-white" style={{ fontFamily: "'Inter', sans-serif" }}>
        {menuOpen && <MenuTakeover categorias={menuCats} onClose={() => setMenuOpen(false)} />}
        <Navbar onToggleMenu={() => setMenuOpen(!menuOpen)} variant="solid" />

      <main className="pt-28 pb-12 px-6 max-w-[700px] w-full mx-auto">
        {cargando ? (
          <p className="text-center text-[#0a0a0a]/30 text-sm font-light">Cargando...</p>
        ) : !vendedorId ? (
          <p className="text-center text-[#0a0a0a]/30 text-sm font-light">No encontramos tu cuenta de vendedor.</p>
        ) : (
        <>
        <VolverAtras href="/vendedor/perfil" texto="Volver a Mi negocio" />
        <h1 className="text-2xl md:text-3xl mt-2 mb-2" style={fuenteTitulo}>Mi ubicación</h1>
        <p style={{ ...fuenteAyuda, fontSize: '14px', color: 'rgba(10,10,10,0.45)', marginBottom: '32px' }}>
          Actualizá la dirección y ubicación de tu negocio en el mapa.
        </p>

        {guardado && (
          <div className="mb-6 p-3 bg-emerald-50 border border-emerald-200 rounded-lg text-sm text-emerald-800">
            ✓ Listo, guardamos tus cambios.
          </div>
        )}

        {/* ¿Recibe público? */}
        <div className="flex flex-col gap-2.5 mb-6">
          <span className={labelClasses}>¿Recibís gente en tu local, taller o showroom?</span>
          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="radio"
              name="recibe_publico"
              checked={recibePublico === true}
              onChange={() => { setRecibePublico(true); resetearUbicacion() }}
              className="accent-[#0a0a0a]"
            />
            <span className="text-sm">Sí, recibo gente</span>
          </label>
          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="radio"
              name="recibe_publico"
              checked={recibePublico === false}
              onChange={() => { setRecibePublico(false); resetearUbicacion() }}
              className="accent-[#0a0a0a]"
            />
            <span className="text-sm">No, vendo desde casa o solo despacho</span>
          </label>
        </div>

        {/* Localidad */}
        {recibePublico !== null && (
          <div className="mb-6">
            <label className={`block mb-1.5 ${labelClasses}`}>Localidad</label>
            <select
              value={localidadId}
              onChange={(e) => { setLocalidadId(e.target.value); resetearUbicacion() }}
              className={selectClasses}
            >
              <option value="">Elegí una localidad</option>
              {localidades.map((l) => (
                <option key={l.id} value={l.id}>{l.nombre}</option>
              ))}
            </select>
          </div>
        )}

        {/* Dirección + mapa */}
        {recibePublico !== null && localidadId && localidadTieneBarrios && (
          <div className="mb-6">
            <label className={`block mb-1.5 ${labelClasses}`}>Dirección</label>
            <p className={`${ayudaClasses} mb-2`} style={fuenteAyuda}>
              {recibePublico
                ? 'La dirección de tu local. Escribila y tocá "Ubicar".'
                : 'La usamos solo para detectar tu barrio. No se muestra públicamente.'}
            </p>
            <div className="flex gap-2 items-stretch mb-4">
              <input
                type="text"
                placeholder="Ej: Donado 1234"
                value={direccion}
                onChange={(e) => setDireccion(e.target.value)}
                className={`${inputClasses} flex-1`}
              />
              <button
                type="button"
                onClick={buscarDireccion}
                disabled={buscando || !direccion}
                className={`px-4 py-2.5 whitespace-nowrap ${buscando || !direccion ? btnNegroInactivo : btnNegro}`}
              >
                {buscando ? 'Buscando...' : 'Ubicar 📍'}
              </button>
            </div>

            {mapaVisible && (
              <>
                {avisoMapa && (
                  <div className="p-3 bg-amber-50 border border-amber-200 rounded-lg text-sm text-amber-800 mb-3">
                    {avisoMapa}
                  </div>
                )}

                <MapaUbicacion
                  posicionBuscada={posicionBuscada}
                  onUbicacionChange={manejarUbicacion}
                />

                {barrioDetectado ? (
                  <p className={`${ayudaClasses} mt-2 mb-0`} style={fuenteAyuda}>
                    📍 Tu local está en <strong>{barrioDetectado.nombre}</strong>. Si la ubicación no es exacta, arrastrá el pin.
                  </p>
                ) : latitud ? (
                  <div className="mt-2">
                    <label className={`block mb-1.5 ${labelClasses}`}>No pudimos detectar el barrio. Elegilo vos:</label>
                    <select
                      value={barrioId}
                      onChange={(e) => { setBarrioId(e.target.value); setBarrioAuto(false); setGuardado(false) }}
                      className={selectClasses}
                    >
                      <option value="">Elegí un barrio</option>
                      {barriosDeLaLocalidad.map((b) => (
                        <option key={b.id} value={b.id}>{b.nombre}</option>
                      ))}
                    </select>
                  </div>
                ) : null}

                {latitud && longitud && (
                  <span className="text-[11px] text-[#0a0a0a]/20 font-mono font-light mt-1 block">
                    📍 {latitud.toFixed(6)}, {longitud.toFixed(6)}
                  </span>
                )}
              </>
            )}
          </div>
        )}

        {/* Guardar */}
        <button
          type="button"
          onClick={guardar}
          disabled={guardando}
          className={`px-6 py-2.5 ${guardando ? btnNegroInactivo : btnNegro}`}
        >
          {guardando ? 'Guardando...' : 'Guardar cambios'}
        </button>
        </>
        )}
      </main>
      </div>
    </>
  )
}