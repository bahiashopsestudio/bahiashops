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

const igual = (a, b) => a.lat === b.lat && a.lng === b.lng

// El círculo de la zona, que se mueve de celda en celda de la grilla.
//
// Leaflet no arrastra círculos: encima va una manija invisible (un Marker
// arrastrable del tamaño del círculo), que sí se arrastra con el mouse y con
// el dedo. Mientras se arrastra, el círculo salta a la celda que corresponde;
// al soltar, la manija vuelve al centro de esa celda. Tocar el mapa también
// lleva el círculo a la celda tocada.
function ZonaArrastrable({ centro, onSoltar }) {
  const map = useMapEvents({
    zoomend: () => setZoom(map.getZoom()),
    click: (e) => onSoltar(redondearPunto(e.latlng.lat, e.latlng.lng)),
  })
  const [zoom, setZoom] = useState(() => map.getZoom())
  // La celda que se ve mientras se arrastra (null cuando no se arrastra).
  const [enArrastre, setEnArrastre] = useState(null)
  const visible = enArrastre || centro

  const radio = Math.round(radioEnPixeles(centro.lat, zoom))
  const manija = useMemo(() => L.divIcon({
    className: '',
    iconSize: [radio * 2, radio * 2],
    iconAnchor: [radio, radio],
    html: '<div style="width:100%;height:100%;border-radius:50%;cursor:grab"></div>',
  }), [radio])

  return (
    <>
      <CirculoZona centro={[visible.lat, visible.lng]} interactive={false} />
      <Marker
        position={[centro.lat, centro.lng]}
        icon={manija}
        draggable
        eventHandlers={{
          drag: (e) => {
            const { lat, lng } = e.target.getLatLng()
            const celda = redondearPunto(lat, lng)
            if (!enArrastre || !igual(celda, enArrastre)) setEnArrastre(celda)
          },
          dragend: (e) => {
            const { lat, lng } = e.target.getLatLng()
            const celda = redondearPunto(lat, lng)
            e.target.setLatLng([celda.lat, celda.lng])
            setEnArrastre(null)
            onSoltar(celda)
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
export default function MapaUbicacion({ posicionBuscada, onUbicacionChange, modo = 'exacto' }) {
  const supabase = createClient()
  const [barrios, setBarrios] = useState([])
  const [posicion, setPosicion] = useState(null)
  const [barrioResaltado, setBarrioResaltado] = useState(null)
  // Si se mueve rápido, solo cuenta la respuesta del último movimiento.
  const ultimaConsulta = useRef(0)

  useEffect(() => {
    async function cargarBarrios() {
      const { data, error } = await supabase.rpc('barrios_con_poligono')
      if (error) {
        console.error('Error cargando barrios:', error)
        return
      }
      if (data) setBarrios(data)
    }
    cargarBarrios()
  }, [])

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
    const detectado = await detectarBarrio(punto.lat, punto.lng)
    if (consulta !== ultimaConsulta.current) return
    setBarrioResaltado(detectado ? detectado.id : null)
    onUbicacionChange({ lat: punto.lat, lng: punto.lng, barrioDetectado: detectado })
  }

  const estiloNormal = { color: '#94a3b8', weight: 1, fillColor: '#cbd5e1', fillOpacity: 0.08 }
  const estiloActivo = { color: '#0a0a0a', weight: 2, fillColor: '#0a0a0a', fillOpacity: 0.15 }

  return (
    <MapContainer center={CENTRO_BB} zoom={12} style={{ height: '350px', width: '100%', borderRadius: 8 }}>
      <TileLayer {...TILES_UBICACION} />

      {barrios.map((barrio) => {
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
