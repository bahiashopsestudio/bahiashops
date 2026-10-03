'use client'

// La ubicación de la tienda: localidad, "¿Querés que se vea tu dirección
// exacta?" y el mapa. Es el mismo bloque en el alta (paso 2) y en
// /vendedor/ubicacion.
//
// No escribe en la base: le cuenta al padre lo que hay (onChange) y el padre
// lo guarda con guardarUbicacion(), que va a /api/vendedor/ubicacion. Desde la
// migración 018 el navegador no puede escribir estas columnas.
//
// Con "Sí": dirección con número, punto exacto y pin arrastrable, como antes.
// Con "No": calle y dos entrecalles (nunca la altura); el mapa se centra en
// esa calle, la persona toca su cuadra y se dibuja la zona tal como se va a
// ver en público, en el punto redondeado.

import { useEffect, useState } from 'react'
import dynamic from 'next/dynamic'
import {
  inputClasses, selectClasses, fuenteAyuda, ayudaClasses, labelClasses, btnNegro, btnNegroInactivo,
} from '@/lib/estilosVendedor'
import { textoZona, LARGO_MAX_CALLE } from '@/lib/zonaVendedor'

const MapaUbicacion = dynamic(() => import('@/app/vendedor/nuevo/MapaUbicacion'), {
  ssr: false,
  loading: () => (
    <div className="h-[350px] bg-[#F5F2EC] rounded-lg flex items-center justify-center text-[#0a0a0a]/30 text-sm font-light">
      Cargando mapa...
    </div>
  ),
})

const CENTRO_BB = { lat: -38.7183, lng: -62.2663 }

async function buscarEnNominatim(consulta) {
  const url = 'https://nominatim.openstreetmap.org/search?format=jsonv2&limit=1&q=' + encodeURIComponent(consulta)
  const respuesta = await fetch(url)
  const datos = await respuesta.json()
  return datos && datos.length > 0 ? { lat: parseFloat(datos[0].lat), lng: parseFloat(datos[0].lon) } : null
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
        direccion: datos.direccion,
        zonaCalle: datos.zonaCalle,
        zonaEntre: datos.zonaEntre,
        zonaY: datos.zonaY,
        lat: datos.lat,
        lng: datos.lng,
        mantenerPunto: datos.mantenerPunto,
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
// zona_calle, zona_entre, zona_y, latitud, longitud, barrio_id), o null en el
// alta.
export default function BloqueUbicacion({ localidades = [], barrios = [], inicial = null, onChange }) {
  const tienePunto = inicial?.latitud != null && inicial?.longitud != null
  const puntoInicial = tienePunto ? { lat: Number(inicial.latitud), lng: Number(inicial.longitud) } : null

  const [localidadId, setLocalidadId] = useState(inicial?.localidad_id ? String(inicial.localidad_id) : '')
  // "No" marcado de entrada.
  const [direccionVisible, setDireccionVisible] = useState(inicial?.direccion_visible === true)
  const [direccion, setDireccion] = useState(inicial?.direccion || '')
  const [zonaCalle, setZonaCalle] = useState(inicial?.zona_calle || '')
  const [zonaEntre, setZonaEntre] = useState(inicial?.zona_entre || '')
  const [zonaY, setZonaY] = useState(inicial?.zona_y || '')

  const [punto, setPunto] = useState(puntoInicial)
  // Una zona ya guardada que no se volvió a marcar: el servidor la deja como
  // está, sin volver a detectar el barrio desde el punto redondeado.
  const [puntoGuardado, setPuntoGuardado] = useState(tienePunto && inicial?.direccion_visible === false)
  const [barrioId, setBarrioId] = useState(inicial?.barrio_id ? String(inicial.barrio_id) : '')
  const [barrioDetectado, setBarrioDetectado] = useState(
    () => (inicial?.barrio_id ? barrios.find((b) => b.id === inicial.barrio_id) || null : null)
  )

  const [mapaVisible, setMapaVisible] = useState(tienePunto)
  const [posicionBuscada, setPosicionBuscada] = useState(
    puntoInicial ? { ...puntoInicial, zoom: 16, nonce: 0 } : null
  )
  // Cambia cuando se empieza de nuevo, para que el mapa arranque limpio.
  const [claveMapa, setClaveMapa] = useState(0)
  const [buscando, setBuscando] = useState(false)
  const [avisoMapa, setAvisoMapa] = useState(null)
  const [calleBuscada, setCalleBuscada] = useState(null)

  const barriosDeLaLocalidad = localidadId ? barrios.filter((b) => b.localidad_id === Number(localidadId)) : []
  const localidadTieneBarrios = barriosDeLaLocalidad.length > 0
  const nombreLocalidad = localidades.find((l) => l.id === Number(localidadId))?.nombre || 'Bahía Blanca'
  const zona = textoZona(zonaCalle, zonaEntre, zonaY)
  const callesCompletas = !!zona

  let faltante = null
  if (!localidadId) faltante = 'Elegí tu localidad.'
  else if (!localidadTieneBarrios) faltante = 'Por ahora Bahía Shops no está disponible en esa localidad.'
  else if (direccionVisible && !direccion.trim()) faltante = 'Escribí tu dirección.'
  else if (direccionVisible && !punto) faltante = 'Tocá "Ubicar" para marcar tu dirección en el mapa.'
  else if (!direccionVisible && !callesCompletas) faltante = 'Completá la calle y las dos entrecalles.'
  else if (!direccionVisible && !punto) faltante = 'Marcá tu cuadra en el mapa.'
  else if (!barrioId) faltante = 'Elegí tu barrio.'

  useEffect(() => {
    onChange({
      localidadId: localidadId ? Number(localidadId) : null,
      direccionVisible,
      direccion: direccion.trim(),
      zonaCalle: zonaCalle.trim(),
      zonaEntre: zonaEntre.trim(),
      zonaY: zonaY.trim(),
      lat: punto?.lat ?? null,
      lng: punto?.lng ?? null,
      mantenerPunto: puntoGuardado,
      barrioId: barrioId ? Number(barrioId) : null,
      completo: !faltante,
      faltante,
    })
  }, [localidadId, direccionVisible, direccion, zonaCalle, zonaEntre, zonaY, punto, puntoGuardado, barrioId, faltante, onChange])

  function empezarDeNuevo() {
    setPunto(null)
    setPuntoGuardado(false)
    setBarrioId('')
    setBarrioDetectado(null)
    setMapaVisible(false)
    setPosicionBuscada(null)
    setAvisoMapa(null)
    setCalleBuscada(null)
    setClaveMapa((c) => c + 1)
  }

  async function centrarEn(consulta, avisoSiNoEncuentra) {
    setBuscando(true)
    setAvisoMapa(null)
    try {
      const encontrado = await buscarEnNominatim(consulta)
      setMapaVisible(true)
      if (encontrado) {
        setPosicionBuscada({ ...encontrado, zoom: 16, nonce: Date.now() })
      } else {
        setAvisoMapa(avisoSiNoEncuentra)
        setPosicionBuscada({ ...CENTRO_BB, zoom: 13, nonce: Date.now() })
      }
    } catch {
      setMapaVisible(true)
      setAvisoMapa('Hubo un problema al buscar. ' + avisoSiNoEncuentra)
      setPosicionBuscada({ ...CENTRO_BB, zoom: 13, nonce: Date.now() })
    }
    setBuscando(false)
  }

  function buscarDireccion() {
    if (!direccion.trim()) return
    centrarEn(`${direccion.trim()}, ${nombreLocalidad}, Argentina`, 'Arrastrá el pin hasta tu dirección.')
  }

  // Con "No" se busca cuando las tres calles están completas y la persona sale
  // de un campo, y solo si la calle cambió: Nominatim no se puede usar como
  // autocompletado (un pedido por segundo como máximo). Se busca la calle
  // sola: Nominatim no ubica bien esquinas ni entrecalles.
  function buscarCalle() {
    if (!callesCompletas) return
    const clave = `${localidadId}|${zonaCalle.trim().toLowerCase()}`
    if (clave === calleBuscada) return
    setCalleBuscada(clave)
    centrarEn(`${zonaCalle.trim()}, ${nombreLocalidad}, Argentina`, 'No encontramos esa calle. Buscá tu cuadra en el mapa.')
  }

  function manejarUbicacion({ lat, lng, barrioDetectado: detectado }) {
    setPunto({ lat, lng })
    setPuntoGuardado(false)
    setBarrioDetectado(detectado)
    setBarrioId(detectado ? String(detectado.id) : '')
  }

  const selectorBarrio = (
    <label className="flex flex-col gap-1.5">
      <span className={labelClasses}>No pudimos detectar el barrio. Elegilo vos:</span>
      <select value={barrioId} onChange={(e) => setBarrioId(e.target.value)} className={selectClasses}>
        <option value="">Elegí un barrio</option>
        {barriosDeLaLocalidad.map((b) => <option key={b.id} value={b.id}>{b.nombre}</option>)}
      </select>
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
                  En Bahía Shops se va a ver tu cuadra y una zona alrededor. Nunca te pedimos la altura.
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

          {direccionVisible ? (
            <div className="flex flex-col gap-1.5">
              <span className={labelClasses}>Dirección *</span>
              <span className={ayudaClasses} style={fuenteAyuda}>Escribí tu dirección con número y tocá &quot;Ubicar&quot;.</span>
              <div className="flex gap-2 items-stretch">
                <input type="text" required placeholder="Ej: Donado 1234" value={direccion} maxLength={200}
                  onChange={(e) => setDireccion(e.target.value)} className={`${inputClasses} flex-1`} />
                <button type="button" onClick={buscarDireccion} disabled={buscando || !direccion.trim()}
                  className={`px-4 py-2.5 whitespace-nowrap ${buscando || !direccion.trim() ? btnNegroInactivo : btnNegro}`}>
                  {buscando ? 'Buscando...' : 'Ubicar 📍'}
                </button>
              </div>
            </div>
          ) : (
            <div className="flex flex-col gap-1.5">
              <span className={labelClasses}>Tu cuadra *</span>
              <span className={ayudaClasses} style={fuenteAyuda}>La calle donde estás y las dos entre las que queda. Sin altura.</span>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                <label className="flex flex-col gap-1">
                  <span className="text-xs text-[#0a0a0a]/50">Calle</span>
                  <input type="text" required placeholder="Ej: 12 de Octubre" value={zonaCalle} maxLength={LARGO_MAX_CALLE}
                    onChange={(e) => setZonaCalle(e.target.value)} onBlur={buscarCalle} className={inputClasses} />
                </label>
                <label className="flex flex-col gap-1">
                  <span className="text-xs text-[#0a0a0a]/50">entre</span>
                  <input type="text" required placeholder="Ej: Salta" value={zonaEntre} maxLength={LARGO_MAX_CALLE}
                    onChange={(e) => setZonaEntre(e.target.value)} onBlur={buscarCalle} className={inputClasses} />
                </label>
                <label className="flex flex-col gap-1">
                  <span className="text-xs text-[#0a0a0a]/50">y</span>
                  <input type="text" required placeholder="Ej: Mitre" value={zonaY} maxLength={LARGO_MAX_CALLE}
                    onChange={(e) => setZonaY(e.target.value)} onBlur={buscarCalle} className={inputClasses} />
                </label>
              </div>
              {buscando && <span className={ayudaClasses} style={fuenteAyuda}>Buscando la calle...</span>}
            </div>
          )}

          {mapaVisible && (
            <div className="flex flex-col gap-2">
              {avisoMapa && (
                <div className="p-3 bg-amber-50 border border-amber-200 rounded-lg text-sm text-amber-800">{avisoMapa}</div>
              )}

              {!direccionVisible && (
                <div className="p-3 bg-[#F5F2EC] rounded-lg text-sm text-[#0a0a0a]/80" style={fuenteAyuda}>
                  Marcá tu cuadra en el mapa. No hace falta que sea tu casa exacta: en Bahía Shops se ve una zona alrededor, nunca el punto.
                </div>
              )}

              <MapaUbicacion
                key={`${direccionVisible ? 'exacto' : 'zona'}-${claveMapa}`}
                modo={direccionVisible ? 'exacto' : 'zona'}
                puntoInicial={!direccionVisible && puntoGuardado ? punto : null}
                barrioInicial={!direccionVisible && puntoGuardado && barrioId ? Number(barrioId) : null}
                posicionBuscada={posicionBuscada}
                onUbicacionChange={manejarUbicacion}
              />

              {punto && (barrioDetectado ? (
                <p className={`${ayudaClasses} m-0`} style={fuenteAyuda}>
                  📍 Barrio: <strong>{barrioDetectado.nombre}</strong>.
                  {direccionVisible ? ' Si la ubicación no es exacta, arrastrá el pin.' : ' Si no es tu cuadra, tocá de nuevo en el mapa.'}
                </p>
              ) : selectorBarrio)}

              {!direccionVisible && punto && zona && (
                <p className="text-sm m-0">Así te van a ver: <strong>{zona}</strong></p>
              )}

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
