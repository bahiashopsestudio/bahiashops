'use client'

import { useEffect, useState } from 'react'
import { MapContainer, TileLayer, GeoJSON, Marker } from 'react-leaflet'
import L from 'leaflet'
import { createClient } from '@/lib/supabase/client'
import 'leaflet/dist/leaflet.css'

const CENTRO_BB = [-38.7183, -62.2663]

const iconoPin = L.icon({
  iconUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png',
  iconRetinaUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png',
  shadowUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png',
  iconSize: [25, 41],
  iconAnchor: [12, 41],
})

export default function MapaBarrios() {
  const supabase = createClient()
  const [barrios, setBarrios] = useState([])
  const [posicionPin, setPosicionPin] = useState(CENTRO_BB)
  const [barrioDetectado, setBarrioDetectado] = useState(null)

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
      return
    }
    setBarrioDetectado(data && data.length > 0 ? data[0] : null)
  }

  // Dos estilos: discreto para todos, resaltado para el detectado
  const estiloNormal = { color: '#94a3b8', weight: 1, fillColor: '#cbd5e1', fillOpacity: 0.08 }
  const estiloActivo = { color: '#2563eb', weight: 2, fillColor: '#3b82f6', fillOpacity: 0.4 }

  return (
    <div>
      <MapContainer
        center={CENTRO_BB}
        zoom={12}
        style={{ height: '500px', width: '100%', borderRadius: 8 }}
      >
        <TileLayer
          attribution='&copy; OpenStreetMap &copy; CARTO'
          url="https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png"
        />
        {barrios.map((barrio) => {
          const activo = barrioDetectado?.id === barrio.id
          return (
            <GeoJSON
              key={barrio.id + (activo ? '-activo' : '')}
              data={barrio.geojson}
              style={activo ? estiloActivo : estiloNormal}
            />
          )
        })}
        <Marker
          draggable
          position={posicionPin}
          icon={iconoPin}
          eventHandlers={{
            dragend: (e) => {
              const { lat, lng } = e.target.getLatLng()
              setPosicionPin([lat, lng])
              detectarBarrio(lat, lng)
            },
          }}
        />
      </MapContainer>

      <p style={{ marginTop: '1rem' }}>
        {barrioDetectado
          ? <>📍 El pin está en: <strong>{barrioDetectado.nombre}</strong></>
          : '📍 Arrastrá el pin a tu local'}
      </p>
    </div>
  )
}