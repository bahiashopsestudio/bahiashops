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
//   Con "Sí": la dirección se guarda ("calle número"), con el punto exacto y
//     el pin arrastrable, como antes.
//   Con "No": la calle y el número sirven solo para buscar en el mapa. No se
//     guardan, no se mandan a la ruta y no se escriben en ningún log: al
//     servidor le llega solo el centro del círculo. El círculo aparece en la
//     celda de la grilla donde cae la dirección y se arrastra de celda en
//     celda: lo que se ve es exactamente lo que se guarda.

import { useEffect, useRef, useState } from 'react'
import dynamic from 'next/dynamic'
import {
  inputClasses, selectClasses, fuenteAyuda, ayudaClasses, labelClasses, btnNegro, btnNegroInactivo,
} from '@/lib/estilosVendedor'

const MapaUbicacion = dynamic(() => import('@/app/vendedor/nuevo/MapaUbicacion'), {
  ssr: false,
  loading: () => (
    <div className="h-[350px] bg-[#F5F2EC] rounded-lg flex items-center justify-center text-[#0a0a0a]/30 text-sm font-light">
      Cargando mapa...
    </div>
  ),
})

const CENTRO_BB = { lat: -38.7183, lng: -62.2663 }

const NO_ENCONTRADA = 'No encontramos esa dirección. Arrastrá el círculo (o el pin) hasta tu zona.'

// Búsqueda estructurada: calle y número por un lado y la ciudad por otro.
// Como texto libre, "12 de Octubre 833" puede centrar en el barrio 12 de
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
  const direccionInicial = inicial?.direccion_visible ? separarDireccion(inicial.direccion) : { calle: '', numero: '' }

  const [localidadId, setLocalidadId] = useState(inicial?.localidad_id ? String(inicial.localidad_id) : '')
  // "No" marcado de entrada.
  const [direccionVisible, setDireccionVisible] = useState(inicial?.direccion_visible === true)
  const [calle, setCalle] = useState(direccionInicial.calle)
  const [numero, setNumero] = useState(direccionInicial.numero)

  const [punto, setPunto] = useState(null)
  const [barrioId, setBarrioId] = useState(inicial?.barrio_id ? String(inicial.barrio_id) : '')
  const [barrioDetectado, setBarrioDetectado] = useState(null)

  const [mapaVisible, setMapaVisible] = useState(tienePunto)
  const [posicionBuscada, setPosicionBuscada] = useState(
    puntoInicial ? { ...puntoInicial, zoom: 16, nonce: 0 } : null
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
    setPunto(null)
    setBarrioId('')
    setBarrioDetectado(null)
    setMapaVisible(false)
    setPosicionBuscada(null)
    setAvisoMapa(null)
    setUltimaBusqueda(null)
    setClaveMapa((c) => c + 1)
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
    try {
      const encontrado = await buscarEnNominatim({ calle: calle.trim(), numero: numero.trim(), ciudad: nombreLocalidad })
      setMapaVisible(true)
      if (encontrado) {
        setPosicionBuscada({ ...encontrado, zoom: 16, nonce: Date.now() })
      } else {
        setAvisoMapa(NO_ENCONTRADA)
        setPosicionBuscada({ ...CENTRO_BB, zoom: 14, nonce: Date.now() })
      }
    } catch {
      setMapaVisible(true)
      setAvisoMapa('Hubo un problema al buscar. Arrastrá el círculo (o el pin) hasta tu zona.')
      setPosicionBuscada({ ...CENTRO_BB, zoom: 14, nonce: Date.now() })
    }
    enCurso.current = false
    setBuscando(false)
  }

  function manejarUbicacion({ lat, lng, barrioDetectado: detectado }) {
    const esElGuardado = puntoGuardado.current
      && puntoGuardado.current.lat === lat && puntoGuardado.current.lng === lng
    setPunto({ lat, lng })
    setBarrioDetectado(detectado)
    if (detectado) setBarrioId(String(detectado.id))
    else if (!esElGuardado) setBarrioId('')
  }

  const barrioElegido = barriosDeLaLocalidad.find((b) => b.id === Number(barrioId))

  const lineaBarrio = barrioDetectado ? (
    <p className={`${ayudaClasses} m-0`} style={fuenteAyuda}>
      📍 Barrio: <strong>{barrioDetectado.nombre}</strong>
      {direccionVisible ? '. Si la ubicación no es exacta, arrastrá el pin.' : ''}
    </p>
  ) : (
    <label className="flex flex-col gap-1.5">
      <span className={labelClasses}>No pudimos detectar el barrio. Elegilo vos:</span>
      <select value={barrioId} onChange={(e) => setBarrioId(e.target.value)} className={selectClasses}>
        <option value="">Elegí un barrio</option>
        {barriosDeLaLocalidad.map((b) => <option key={b.id} value={b.id}>{b.nombre}</option>)}
      </select>
      {barrioElegido && !direccionVisible && (
        <span className={ayudaClasses} style={fuenteAyuda}>Barrio: {barrioElegido.nombre}</span>
      )}
    </label>
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
            <span className={labelClasses}>¿Querés que se vea tu dirección exacta? *</span>
            <label className="flex items-start gap-2 cursor-pointer">
              <input type="radio" name="direccion_visible" checked={!direccionVisible}
                onChange={() => { setDireccionVisible(false); empezarDeNuevo() }} className="accent-[#0a0a0a] mt-1" />
              <span className="text-sm">
                No, prefiero mostrar una zona
                <span className={`block ${ayudaClasses} text-[#0a0a0a]/50`} style={fuenteAyuda}>
                  En Bahía Shops se ve una zona de unas cuadras alrededor, nunca tu dirección.
                </span>
              </span>
            </label>
            <label className="flex items-start gap-2 cursor-pointer">
              <input type="radio" name="direccion_visible" checked={direccionVisible}
                onChange={() => { setDireccionVisible(true); empezarDeNuevo() }} className="accent-[#0a0a0a] mt-1" />
              <span className="text-sm">
                Sí, mostrar mi dirección
                <span className={`block ${ayudaClasses} text-[#0a0a0a]/50`} style={fuenteAyuda}>
                  Tu dirección se va a ver en tu tienda y el mapa va a mostrar el punto exacto.
                </span>
              </span>
            </label>
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
                <input type="text" inputMode="numeric" placeholder="Ej: 833" value={numero} maxLength={20}
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
                key={`${direccionVisible ? 'exacto' : 'zona'}-${claveMapa}`}
                modo={direccionVisible ? 'exacto' : 'zona'}
                posicionBuscada={posicionBuscada}
                onUbicacionChange={manejarUbicacion}
              />

              {!direccionVisible && punto && (
                <p className="text-sm m-0">
                  Este círculo es lo que se va a ver en el mapa. Podés arrastrarlo para ajustar tu zona. Tu dirección no se guarda ni se muestra.
                </p>
              )}

              {punto && lineaBarrio}

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
