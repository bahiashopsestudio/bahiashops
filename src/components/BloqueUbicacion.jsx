'use client'

// La ubicación de la tienda: localidad, "¿Querés que se vea tu dirección
// exacta?" y el mapa. Es el mismo bloque en el alta (paso 2) y en
// /vendedor/ubicacion.
//
// No escribe en la base: le cuenta al padre lo que hay (onChange) y el padre
// lo guarda con guardarUbicacion(), que va a /api/vendedor/ubicacion. Desde la
// migración 018 el navegador no puede escribir estas columnas.
//
// En los dos casos se busca con calle y número.
//   Dirección exacta: la dirección se guarda ("calle número"), con el punto
//     exacto y el punto arrastrable.
//   Solo la zona: la calle y el número sirven solo para buscar en el mapa. No
//     se guardan, no se mandan a la ruta y no se escriben en ningún log: al
//     servidor le llega solo el centro del aro. El aro aparece en la celda de
//     la grilla donde cae la dirección y se arrastra de celda en celda: lo que
//     se ve es exactamente lo que se guarda.
//
// Al cambiar de opción se conserva el punto. En zona, redondeado. Al volver a
// la dirección exacta, el punto regresa al último punto exacto de esta visita
// (ultimoExacto), que queda solo acá, en el navegador: nunca va en onChange
// mientras la opción sea la zona.

import { useEffect, useRef, useState } from 'react'
import dynamic from 'next/dynamic'
import {
  inputClasses, selectClasses, fuenteAyuda, ayudaClasses, labelClasses, btnNegro, btnNegroInactivo,
} from '@/lib/estilosVendedor'
import LineaBarrio from '@/components/LineaBarrio'
import { CLASE_ALTO_MAPA_UBICACION, PIELES } from '@/lib/mapaEstilo'

const MapaUbicacion = dynamic(() => import('@/app/vendedor/nuevo/MapaUbicacion'), {
  ssr: false,
  loading: () => (
    <div className={`${CLASE_ALTO_MAPA_UBICACION} rounded-lg flex items-center justify-center text-[#0a0a0a]/40 text-sm font-light`} style={{ background: PIELES.claro.land }}>
      Cargando mapa...
    </div>
  ),
})

const CENTRO_BB = { lat: -38.7183, lng: -62.2663 }

// Zooms de MapLibre. En zona, a 16 el aro no entraría en el mapa de un celular.
const ZOOM_EXACTA = 16
const ZOOM_ZONA = 14.5
const ZOOM_SIN_DIRECCION = 13
const zoomDe = (direccionVisible) => (direccionVisible ? ZOOM_EXACTA : ZOOM_ZONA)

const NO_ENCONTRADA = 'No encontramos esa dirección. Arrastrá el aro (o el punto) hasta tu zona.'

const VERDE = PIELES.claro.pin
const NOTA_EXACTA = 'Tu dirección escrita no se muestra en la tienda: la recibe solo quien te compra con retiro.'
const NOTA_ZONA = 'Tu punto exacto no se guarda: solo el centro del casillero. En la tienda se ve el aro y el barrio. Si alguien te compra con retiro, le pasás la dirección por WhatsApp.'

// Una de las dos tarjetas de "Qué ve el público". Por dentro es una opción de
// radio, así funciona con el teclado y con los lectores de pantalla.
function TarjetaOpcion({ elegida, onElegir, icono, titulo, texto }) {
  return (
    <label
      className="flex items-start gap-2.5 cursor-pointer rounded-xl bg-white has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-[#4164fe]"
      style={{
        padding: '12px 14px',
        border: `1px solid ${elegida ? '#0a0a0a' : 'rgba(10,10,10,0.12)'}`,
        boxShadow: elegida ? 'inset 0 0 0 1px #0a0a0a' : 'none',
      }}
    >
      <input type="radio" name="direccion_visible" checked={elegida} onChange={onElegir} className="sr-only" />
      <svg viewBox={icono.viewBox} aria-hidden="true" style={{ flex: 'none', width: '22px', height: '26px', marginTop: '2px' }}>
        {icono.dibujo}
      </svg>
      <span style={{ fontFamily: "'Inter', sans-serif" }}>
        <span className="block" style={{ fontWeight: 600, fontSize: '13px', color: '#0a0a0a' }}>{titulo}</span>
        <span className="block" style={{ fontSize: '12px', lineHeight: 1.4, color: 'rgba(10,10,10,0.58)', marginTop: '2px' }}>{texto}</span>
      </span>
    </label>
  )
}

const ICONO_ARO = {
  viewBox: '0 0 26 26',
  dibujo: <circle cx="13" cy="13" r="10" fill="none" stroke={VERDE} strokeWidth="3.5" />,
}
const ICONO_PUNTO = {
  viewBox: '0 0 26 26',
  dibujo: <circle cx="13" cy="13" r="7" fill={VERDE} />,
}

// Búsqueda estructurada: calle y número por un lado y la ciudad por otro.
// Como texto libre, "12 de Octubre 801" puede centrar en el barrio 12 de
// Octubre en vez de en la calle.
async function buscarEnNominatim({ calle, numero, ciudad }) {
  const params = new URLSearchParams({
    format: 'jsonv2',
    limit: '1',
    street: `${numero} ${calle}`,
    city: ciudad,
    country: 'Argentina',
  })
  const respuesta = await fetch('https://nominatim.openstreetmap.org/search?' + params.toString())
  const datos = await respuesta.json()
  return datos && datos.length > 0 ? { lat: parseFloat(datos[0].lat), lng: parseFloat(datos[0].lon) } : null
}

// "Donado 1234" -> { calle: 'Donado', numero: '1234' }. Para editar una
// dirección guardada en los dos cuadros.
function separarDireccion(direccion) {
  const texto = (direccion || '').trim()
  const partes = texto.match(/^(.*\S)\s+(\d+[\w/-]*)$/)
  return partes ? { calle: partes[1], numero: partes[2] } : { calle: texto, numero: '' }
}

// Guarda lo que armó el bloque. Devuelve { ok, error, barrio }.
export async function guardarUbicacion(datos) {
  try {
    const res = await fetch('/api/vendedor/ubicacion', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        localidadId: datos.localidadId,
        direccionVisible: datos.direccionVisible,
        direccion: datos.direccionVisible ? datos.direccion : null,
        lat: datos.lat,
        lng: datos.lng,
        barrioId: datos.barrioId,
      }),
    })
    const cuerpo = await res.json().catch(() => ({}))
    if (!res.ok) return { ok: false, error: cuerpo.error || 'No pudimos guardar tu ubicación.' }
    return { ok: true, barrio: cuerpo.barrio || null }
  } catch {
    return { ok: false, error: 'No pudimos guardar tu ubicación. Revisá tu conexión.' }
  }
}

// inicial: la fila de vendedores (localidad_id, direccion_visible, direccion,
// latitud, longitud, barrio_id), o null en el alta.
export default function BloqueUbicacion({ localidades = [], barrios = [], inicial = null, onChange }) {
  const tienePunto = inicial?.latitud != null && inicial?.longitud != null
  const puntoInicial = tienePunto ? { lat: Number(inicial.latitud), lng: Number(inicial.longitud) } : null
  // Para no perder un barrio elegido a mano cuando el mapa vuelve a cargar
  // el punto guardado y no lo detecta.
  const puntoGuardado = useRef(puntoInicial)
  const ultimoExacto = useRef(inicial?.direccion_visible === true ? puntoInicial : null)
  const direccionInicial = inicial?.direccion_visible ? separarDireccion(inicial.direccion) : { calle: '', numero: '' }

  const [localidadId, setLocalidadId] = useState(inicial?.localidad_id ? String(inicial.localidad_id) : '')
  // "Solo la zona" marcado de entrada.
  const [direccionVisible, setDireccionVisible] = useState(inicial?.direccion_visible === true)
  const [calle, setCalle] = useState(direccionInicial.calle)
  const [numero, setNumero] = useState(direccionInicial.numero)

  const [punto, setPunto] = useState(null)
  const [barrioId, setBarrioId] = useState(inicial?.barrio_id ? String(inicial.barrio_id) : '')
  const [barrioDetectado, setBarrioDetectado] = useState(null)
  const [barrioFallo, setBarrioFallo] = useState(false)

  const [mapaVisible, setMapaVisible] = useState(tienePunto)
  const [posicionBuscada, setPosicionBuscada] = useState(
    puntoInicial ? { ...puntoInicial, zoom: zoomDe(inicial?.direccion_visible === true), nonce: 0 } : null
  )
  // Cambia cuando se empieza de nuevo, para que el mapa arranque limpio.
  const [claveMapa, setClaveMapa] = useState(0)
  const [buscando, setBuscando] = useState(false)
  const [avisoMapa, setAvisoMapa] = useState(null)
  const [ultimaBusqueda, setUltimaBusqueda] = useState(null)
  const enCurso = useRef(false)
  const ultimaHora = useRef(0)

  const barriosDeLaLocalidad = localidadId ? barrios.filter((b) => b.localidad_id === Number(localidadId)) : []
  const localidadTieneBarrios = barriosDeLaLocalidad.length > 0
  const nombreLocalidad = localidades.find((l) => l.id === Number(localidadId))?.nombre || 'Bahía Blanca'
  const direccionCompleta = !!calle.trim() && !!numero.trim()

  let faltante = null
  if (!localidadId) faltante = 'Elegí tu localidad.'
  else if (!localidadTieneBarrios) faltante = 'Por ahora Bahía Shops no está disponible en esa localidad.'
  else if (direccionVisible && !direccionCompleta) faltante = 'Escribí la calle y el número.'
  else if (direccionVisible && !punto) faltante = 'Tocá "Ubicar" para marcar tu dirección en el mapa.'
  else if (!direccionVisible && !punto) faltante = 'Escribí la calle y el número y tocá "Ubicar" para ubicar tu zona.'
  else if (!barrioId) faltante = 'Elegí tu barrio.'

  // Con "No", la calle y el número no salen de acá.
  const direccionParaGuardar = direccionVisible ? `${calle.trim()} ${numero.trim()}`.trim() : ''

  useEffect(() => {
    onChange({
      localidadId: localidadId ? Number(localidadId) : null,
      direccionVisible,
      direccion: direccionParaGuardar,
      lat: punto?.lat ?? null,
      lng: punto?.lng ?? null,
      barrioId: barrioId ? Number(barrioId) : null,
      completo: !faltante,
      faltante,
    })
  }, [localidadId, direccionVisible, direccionParaGuardar, punto, barrioId, faltante, onChange])

  function empezarDeNuevo() {
    puntoGuardado.current = null
    ultimoExacto.current = null
    setPunto(null)
    setBarrioId('')
    setBarrioDetectado(null)
    setBarrioFallo(false)
    setMapaVisible(false)
    setPosicionBuscada(null)
    setAvisoMapa(null)
    setUltimaBusqueda(null)
    setClaveMapa((c) => c + 1)
  }

  // Conserva el punto: el mapa lo redondea si pasa a zona, y al volver a la
  // dirección exacta el punto regresa al último punto exacto que hubo.
  function cambiarOpcion(visible) {
    if (visible === direccionVisible) return
    setDireccionVisible(visible)
    if (!punto) return
    const destino = (visible && ultimoExacto.current) || punto
    setPosicionBuscada({ ...destino, zoom: zoomDe(visible), nonce: Date.now() })
  }

  // Al apretar "Ubicar" (siempre) o al salir del cuadro del número (solo si
  // cambió algo desde la última búsqueda). Nunca mientras se escribe:
  // Nominatim no se puede usar como autocompletado.
  async function buscar({ forzar = false } = {}) {
    // Salir del número tocando "Ubicar" dispara las dos cosas casi juntas:
    // el ref (no el estado) frena la segunda búsqueda.
    if (!direccionCompleta || enCurso.current) return
    const clave = `${localidadId}|${calle.trim().toLowerCase()}|${numero.trim().toLowerCase()}`
    if (!forzar && clave === ultimaBusqueda) return
    if (forzar && clave === ultimaBusqueda && Date.now() - ultimaHora.current < 1500) return
    enCurso.current = true
    ultimaHora.current = Date.now()
    setUltimaBusqueda(clave)
    setBuscando(true)
    setAvisoMapa(null)
    ultimoExacto.current = null
    try {
      const encontrado = await buscarEnNominatim({ calle: calle.trim(), numero: numero.trim(), ciudad: nombreLocalidad })
      setMapaVisible(true)
      if (encontrado) {
        ultimoExacto.current = encontrado
        setPosicionBuscada({ ...encontrado, zoom: zoomDe(direccionVisible), nonce: Date.now() })
      } else {
        setAvisoMapa(NO_ENCONTRADA)
        setPosicionBuscada({ ...CENTRO_BB, zoom: ZOOM_SIN_DIRECCION, nonce: Date.now() })
      }
    } catch {
      setMapaVisible(true)
      setAvisoMapa('Hubo un problema al buscar. Arrastrá el aro (o el punto) hasta tu zona.')
      setPosicionBuscada({ ...CENTRO_BB, zoom: ZOOM_SIN_DIRECCION, nonce: Date.now() })
    }
    enCurso.current = false
    setBuscando(false)
  }

  function manejarUbicacion({ lat, lng, barrioDetectado: detectado, barrioFallo: fallo }) {
    const esElGuardado = puntoGuardado.current
      && puntoGuardado.current.lat === lat && puntoGuardado.current.lng === lng
    if (direccionVisible) ultimoExacto.current = { lat, lng }
    setPunto({ lat, lng })
    setBarrioDetectado(detectado)
    setBarrioFallo(fallo)
    if (detectado) setBarrioId(String(detectado.id))
    else if (!esElGuardado) setBarrioId('')
  }

  const lineaBarrio = (
    <LineaBarrio nombre={barrioDetectado?.nombre} fallo={barrioFallo}>
      <select aria-label="Barrio" value={barrioId} onChange={(e) => setBarrioId(e.target.value)} className={selectClasses}>
        <option value="">Elegí un barrio</option>
        {barriosDeLaLocalidad.map((b) => <option key={b.id} value={b.id}>{b.nombre}</option>)}
      </select>
    </LineaBarrio>
  )

  return (
    <div className="flex flex-col gap-6">
      <label className="flex flex-col gap-1.5">
        <span className={labelClasses}>Localidad *</span>
        <select
          value={localidadId}
          onChange={(e) => { setLocalidadId(e.target.value); empezarDeNuevo() }}
          className={selectClasses}
        >
          <option value="">Elegí una localidad</option>
          {localidades.map((l) => <option key={l.id} value={l.id}>{l.nombre}</option>)}
        </select>
      </label>

      {localidadId && !localidadTieneBarrios && (
        <p className={`${ayudaClasses} m-0`} style={fuenteAyuda}>Por ahora Bahía Shops no está disponible en esa localidad.</p>
      )}

      {localidadId && localidadTieneBarrios && (
        <>
          <div className="flex flex-col gap-2.5">
            <span className={labelClasses} id="que-ve-el-publico">Qué ve el público *</span>
            <div role="radiogroup" aria-labelledby="que-ve-el-publico" className="grid grid-cols-1 min-[520px]:grid-cols-2 gap-2.5">
              <TarjetaOpcion
                elegida={!direccionVisible}
                onElegir={() => cambiarOpcion(false)}
                icono={ICONO_ARO}
                titulo="Solo la zona"
                texto="Para quienes venden desde su casa. Se ve un aro de unas dos cuadras."
              />
              <TarjetaOpcion
                elegida={direccionVisible}
                onElegir={() => cambiarOpcion(true)}
                icono={ICONO_PUNTO}
                titulo="La dirección exacta"
                texto="Para locales a la calle. Se ve un punto en tu puerta."
              />
            </div>
          </div>

          <div className="flex flex-col gap-1.5">
            <span className={ayudaClasses} style={fuenteAyuda}>
              {direccionVisible
                ? 'Escribí tu dirección y tocá "Ubicar".'
                : 'La usamos solo para ubicar tu zona en el mapa. No se guarda ni se muestra.'}
            </span>
            <div className="flex flex-col sm:flex-row gap-2 sm:items-end">
              <label className="flex flex-col gap-1 flex-[2]">
                <span className={labelClasses}>Calle *</span>
                <input type="text" placeholder="Ej: 12 de Octubre" value={calle} maxLength={120}
                  onChange={(e) => setCalle(e.target.value)} className={inputClasses} />
              </label>
              <label className="flex flex-col gap-1 flex-1">
                <span className={labelClasses}>Número *</span>
                <input type="text" inputMode="numeric" placeholder="Ej: 801" value={numero} maxLength={20}
                  onChange={(e) => setNumero(e.target.value)} onBlur={() => buscar()} className={inputClasses} />
              </label>
              <button type="button" onClick={() => buscar({ forzar: true })} disabled={buscando || !direccionCompleta}
                className={`px-4 py-2.5 whitespace-nowrap ${buscando || !direccionCompleta ? btnNegroInactivo : btnNegro}`}>
                {buscando ? 'Buscando...' : 'Ubicar 📍'}
              </button>
            </div>
          </div>

          {mapaVisible && (
            <div className="flex flex-col gap-2">
              {avisoMapa && (
                <div className="p-3 bg-amber-50 border border-amber-200 rounded-lg text-sm text-amber-800">{avisoMapa}</div>
              )}

              <MapaUbicacion
                key={claveMapa}
                modo={direccionVisible ? 'exacto' : 'zona'}
                posicionBuscada={posicionBuscada}
                onUbicacionChange={manejarUbicacion}
              />

              {punto && lineaBarrio}

              <p className="m-0" style={{ fontFamily: "'Inter', sans-serif", fontSize: '12px', lineHeight: 1.5, color: 'rgba(10,10,10,0.58)' }}>
                {direccionVisible ? NOTA_EXACTA : NOTA_ZONA}
              </p>

              {direccionVisible && punto && (
                <span className="text-[11px] text-[#0a0a0a]/20 font-mono font-light">
                  📍 {punto.lat.toFixed(6)}, {punto.lng.toFixed(6)}
                </span>
              )}
            </div>
          )}
        </>
      )}
    </div>
  )
}
