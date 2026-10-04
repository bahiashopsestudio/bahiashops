'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { MapContainer, TileLayer, GeoJSON, Marker, useMap, useMapEvents } from 'react-leaflet'
import L from 'leaflet'
import { createClient } from '@/lib/supabase/client'
import { TILES_UBICACION } from '@/lib/mapaTiles'
import { redondearPunto } from '@/lib/zonaVendedor'
import CirculoZona, { radioEnPixeles } from '@/components/CirculoZona'
import 'leaflet/dist/leaflet.css'

const CENTRO_BB = [-38.7183, -62.2663]

// Arreglo del ícono del pin (si no, viene roto en Next.js: Leaflet arma las
// rutas de sus imágenes a mano y no encuentra las del bundle).
//
// Las imágenes se sirven desde public/leaflet/, copiadas tal cual del paquete
// leaflet 1.9.4. Antes venían de unpkg.com: si ese CDN tardaba o se caía, el
// pin desaparecía de los tres formularios que usan este mapa (alta de
// vendedor, /vendedor/ubicacion y el formulario de direcciones). Si algún día
// se actualiza Leaflet, hay que volver a copiarlas desde
// node_modules/leaflet/dist/images/.
const iconoPin = L.icon({
  iconUrl: '/leaflet/marker-icon.png',
  iconRetinaUrl: '/leaflet/marker-icon-2x.png',
  shadowUrl: '/leaflet/marker-shadow.png',
  iconSize: [25, 41],
  iconAnchor: [12, 41],
})

// Componente interno: cuando el formulario manda una posición nueva
// (resultado de buscar la dirección), mueve el mapa ahí, pone el pin o el
// círculo y avisa al padre. El "nonce" hace que reaccione aunque la
// coordenada se repita.
function IrAPosicion({ posicion, onLlegar }) {
  const map = useMap()
  useEffect(() => {
    if (!posicion) return
    map.setView([posicion.lat, posicion.lng], posicion.zoom || 16)
    onLlegar(posicion.lat, posicion.lng)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [posicion?.nonce])
  return null
}

const DURACION_DESLIZ_MS = 200

// El círculo de la zona.
//
// Leaflet no arrastra círculos: encima va una manija invisible (un Marker
// arrastrable del tamaño del círculo), que sí se arrastra con el mouse y con
// el dedo. Mientras se arrastra, el círculo sigue a la manija sin saltos; al
// soltar, se desliza (200 ms, ease-out) hasta el centro de la celda de la
// grilla más cercana, que es lo que se guarda. Tocar el mapa fuera del
// círculo lo desliza igual hasta la celda tocada. Con "reducir movimiento"
// activado en el sistema, se ubica directo, sin animación.
//
// Durante el arrastre y la animación el círculo se mueve directo en Leaflet,
// sin pasar por React en cada cuadro. Recién al terminar se avisa al
// formulario (onSoltar), que detecta el barrio con el centro de la celda: si
// se avisara antes, React reubicaría el círculo de golpe y cortaría el
// deslizamiento.
function ZonaArrastrable({ centro, onSoltar }) {
  // El zoom se lee del mapa en cada render (ver CirculoZona).
  const [, redibujar] = useState(0)
  const map = useMapEvents({
    zoomend: () => redibujar((n) => n + 1),
    moveend: () => redibujar((n) => n + 1),
    click: (e) => deslizarA(redondearPunto(e.latlng.lat, e.latlng.lng)),
  })
  const zoom = map.getZoom()
  const circuloRef = useRef(null)
  const manijaRef = useRef(null)
  const cuadro = useRef(null)

  useEffect(() => () => cancelAnimationFrame(cuadro.current), [])

  function ubicar(latlng) {
    circuloRef.current?.setLatLng(latlng)
    manijaRef.current?.setLatLng(latlng)
  }

  function deslizarA(celda) {
    cancelAnimationFrame(cuadro.current)
    const hasta = L.latLng(celda.lat, celda.lng)
    const desde = circuloRef.current?.getLatLng() || hasta
    const terminar = () => { ubicar(hasta); onSoltar(celda) }

    const reducir = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches
    if (reducir || desde.equals(hasta)) { terminar(); return }

    const inicio = performance.now()
    const paso = (ahora) => {
      const t = Math.min(1, (ahora - inicio) / DURACION_DESLIZ_MS)
      const k = 1 - (1 - t) ** 3 // ease-out
      ubicar(L.latLng(desde.lat + (hasta.lat - desde.lat) * k, desde.lng + (hasta.lng - desde.lng) * k))
      if (t < 1) cuadro.current = requestAnimationFrame(paso)
      else terminar()
    }
    cuadro.current = requestAnimationFrame(paso)
  }

  const radio = Math.round(radioEnPixeles(centro.lat, zoom))
  const manija = useMemo(() => L.divIcon({
    className: '',
    iconSize: [radio * 2, radio * 2],
    iconAnchor: [radio, radio],
    html: '<div style="width:100%;height:100%;border-radius:50%;cursor:grab"></div>',
  }), [radio])

  return (
    <>
      <CirculoZona centro={[centro.lat, centro.lng]} capaRef={circuloRef} interactive={false} />
      <Marker
        ref={manijaRef}
        position={[centro.lat, centro.lng]}
        icon={manija}
        draggable
        eventHandlers={{
          dragstart: () => cancelAnimationFrame(cuadro.current),
          drag: (e) => circuloRef.current?.setLatLng(e.target.getLatLng()),
          dragend: (e) => {
            const { lat, lng } = e.target.getLatLng()
            deslizarA(redondearPunto(lat, lng))
          },
        }}
      />
    </>
  )
}

// Dos modos:
//   'exacto' (el de siempre): la búsqueda pone el pin, que se arrastra. El
//     barrio sale del punto del pin.
//   'zona': la búsqueda pone el círculo en la celda de la grilla donde cae
//     la dirección; se arrastra o se toca el mapa para cambiar de celda. Al
//     formulario solo le llega el centro del círculo, y el barrio sale de
//     ese centro: lo que se guarda es exactamente lo que se ve.
//
// conBarrios = false (direcciones de otra ciudad): no dibuja los barrios de
// Bahía ni pregunta el barrio del punto; barrioDetectado llega siempre null.
export default function MapaUbicacion({ posicionBuscada, onUbicacionChange, modo = 'exacto', conBarrios = true }) {
  const supabase = createClient()
  const [barrios, setBarrios] = useState([])
  const [posicion, setPosicion] = useState(null)
  const [barrioResaltado, setBarrioResaltado] = useState(null)
  // Si se mueve rápido, solo cuenta la respuesta del último movimiento.
  const ultimaConsulta = useRef(0)

  useEffect(() => {
    if (!conBarrios) return
    async function cargarBarrios() {
      const { data, error } = await supabase.rpc('barrios_con_poligono')
      if (error) {
        console.error('Error cargando barrios:', error)
        return
      }
      if (data) setBarrios(data)
    }
    cargarBarrios()
  }, [conBarrios])

  async function detectarBarrio(lat, lng) {
    const { data, error } = await supabase.rpc('barrio_en_punto', { lat, lng })
    if (error) {
      console.error('Error detectando barrio:', error)
      return null
    }
    return data && data.length > 0 ? data[0] : null
  }

  // Pone el pin o el círculo, detecta el barrio y le reporta todo al
  // formulario. En modo zona, el punto pasa antes a ser el centro de la celda.
  async function procesarPosicion(lat, lng) {
    const punto = modo === 'zona' ? redondearPunto(lat, lng) : { lat, lng }
    setPosicion(punto)
    const consulta = ++ultimaConsulta.current
    const detectado = conBarrios ? await detectarBarrio(punto.lat, punto.lng) : null
    if (consulta !== ultimaConsulta.current) return
    setBarrioResaltado(detectado ? detectado.id : null)
    onUbicacionChange({ lat: punto.lat, lng: punto.lng, barrioDetectado: detectado })
  }

  const estiloNormal = { color: '#94a3b8', weight: 1, fillColor: '#cbd5e1', fillOpacity: 0.08 }
  const estiloActivo = { color: '#0a0a0a', weight: 2, fillColor: '#0a0a0a', fillOpacity: 0.15 }

  return (
    <MapContainer center={CENTRO_BB} zoom={12} style={{ height: '350px', width: '100%', borderRadius: 8 }}>
      <TileLayer {...TILES_UBICACION} />

      {conBarrios && barrios.map((barrio) => {
        const resaltar = barrioResaltado === barrio.id
        return (
          <GeoJSON
            key={barrio.id + (resaltar ? '-on' : '')}
            data={barrio.geojson}
            style={resaltar ? estiloActivo : estiloNormal}
          />
        )
      })}

      <IrAPosicion posicion={posicionBuscada} onLlegar={procesarPosicion} />

      {modo === 'zona' && posicion && (
        <ZonaArrastrable centro={posicion} onSoltar={(celda) => procesarPosicion(celda.lat, celda.lng)} />
      )}

      {modo === 'exacto' && posicion && (
        <Marker
          draggable
          position={[posicion.lat, posicion.lng]}
          icon={iconoPin}
          eventHandlers={{
            dragend: async (e) => {
              const { lat, lng } = e.target.getLatLng()
              await procesarPosicion(lat, lng)
            },
          }}
        />
      )}
    </MapContainer>
  )
}
