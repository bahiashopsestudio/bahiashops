'use client'

import { useEffect, useState } from 'react'
import { MapContainer, TileLayer, GeoJSON, Marker, useMap } from 'react-leaflet'
import L from 'leaflet'
import { createClient } from '@/lib/supabase/client'
import 'leaflet/dist/leaflet.css'

const CENTRO_BB = [-38.7183, -62.2663]

// Arreglo del ícono del pin (si no, viene roto en Next.js)
const iconoPin = L.icon({
  iconUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png',
  iconRetinaUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png',
  shadowUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png',
  iconSize: [25, 41],
  iconAnchor: [12, 41],
})

// Componente interno: cuando el formulario manda una posición nueva
// (resultado de buscar la dirección), mueve el mapa ahí y avisa al padre.
// El "nonce" hace que reaccione aunque la coordenada se repita.
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

export default function MapaUbicacion({ posicionBuscada, onUbicacionChange }) {
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

  // Pone el pin, detecta el barrio y le reporta todo al formulario
  async function procesarPosicion(lat, lng) {
    setPosicionPin([lat, lng])
    const detectado = await detectarBarrio(lat, lng)
    setBarrioResaltado(detectado ? detectado.id : null)
    onUbicacionChange({ lat, lng, barrioDetectado: detectado })
  }

  const estiloNormal = { color: '#94a3b8', weight: 1, fillColor: '#cbd5e1', fillOpacity: 0.08 }
  const estiloActivo = { color: '#0a0a0a', weight: 2, fillColor: '#0a0a0a', fillOpacity: 0.15 }

  return (
    <MapContainer center={CENTRO_BB} zoom={12} style={{ height: '350px', width: '100%', borderRadius: 8 }}>
      <TileLayer
        attribution='&copy; OpenStreetMap &copy; CARTO'
        url="https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png"
      />

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

      {posicionPin && (
        <Marker
          draggable
          position={posicionPin}
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