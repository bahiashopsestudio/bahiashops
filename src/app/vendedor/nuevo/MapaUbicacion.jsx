'use client'

import { useEffect, useState } from 'react'
import { MapContainer, TileLayer, GeoJSON, Marker, useMap } from 'react-leaflet'
import L from 'leaflet'
import { createClient } from '@/lib/supabase/client'
import 'leaflet/dist/leaflet.css'

// Centro aproximado de Bahía Blanca (Plaza Rivadavia)
const CENTRO_BB = [-38.7183, -62.2663]

// Arreglo del ícono del pin (si no, viene roto en Next.js)
const iconoPin = L.icon({
  iconUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png',
  iconRetinaUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png',
  shadowUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png',
  iconSize: [25, 41],
  iconAnchor: [12, 41],
})

// Componente interno: cuando cambia el barrio elegido en el dropdown,
// centra el mapa en ese barrio y avisa al padre dónde está su centro
// (para poner el pin ahí). Usa useMap() para controlar el mapa por dentro.
function CentrarEnBarrio({ geojsonObjetivo, onCentrar }) {
  const map = useMap()
  useEffect(() => {
    if (!geojsonObjetivo) return
    const capa = L.geoJSON(geojsonObjetivo)
    const bounds = capa.getBounds()
    map.fitBounds(bounds, { padding: [20, 20] })
    onCentrar(bounds.getCenter())
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [geojsonObjetivo])
  return null
}

export default function MapaUbicacion({ barrioObjetivoId, onUbicacionChange }) {
  const supabase = createClient()
  const [barrios, setBarrios] = useState([])
  const [posicionPin, setPosicionPin] = useState(null)
  const [barrioResaltado, setBarrioResaltado] = useState(null)

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

  // Cuando el dropdown elige un barrio, lo buscamos para centrarnos en él
  const barrioObjetivo = barrios.find((b) => b.id === Number(barrioObjetivoId))

  const estiloNormal = { color: '#94a3b8', weight: 1, fillColor: '#cbd5e1', fillOpacity: 0.08 }
  const estiloActivo = { color: '#2563eb', weight: 2, fillColor: '#3b82f6', fillOpacity: 0.4 }

  return (
    <MapContainer center={CENTRO_BB} zoom={12} style={{ height: '400px', width: '100%', borderRadius: 8 }}>
      <TileLayer
        attribution='&copy; OpenStreetMap &copy; CARTO'
        url="https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png"
      />

      {barrios.map((barrio) => {
        const resaltar = barrioResaltado
          ? barrioResaltado === barrio.id
          : Number(barrioObjetivoId) === barrio.id
        return (
          <GeoJSON
            key={barrio.id + (resaltar ? '-on' : '')}
            data={barrio.geojson}
            style={resaltar ? estiloActivo : estiloNormal}
          />
        )
      })}

      <CentrarEnBarrio
        geojsonObjetivo={barrioObjetivo?.geojson}
        onCentrar={(centro) => {
          const lat = centro.lat
          const lng = centro.lng
          setPosicionPin([lat, lng])
          setBarrioResaltado(null)
          onUbicacionChange({ lat, lng, barrioDetectado: null, evaluar: false })
        }}
      />

      {posicionPin && (
        <Marker
          draggable
          position={posicionPin}
          icon={iconoPin}
          eventHandlers={{
            dragend: async (e) => {
              const { lat, lng } = e.target.getLatLng()
              setPosicionPin([lat, lng])
              const detectado = await detectarBarrio(lat, lng)
              setBarrioResaltado(detectado ? detectado.id : null)
              onUbicacionChange({ lat, lng, barrioDetectado: detectado, evaluar: true })
            },
          }}
        />
      )}
    </MapContainer>
  )
}