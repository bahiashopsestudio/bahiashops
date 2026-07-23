'use client'

import { useEffect, useState } from 'react'
import { MapContainer, TileLayer, Marker, GeoJSON, Tooltip } from 'react-leaflet'
import L from 'leaflet'
import { createClient } from '@/lib/supabase/client'
import 'leaflet/dist/leaflet.css'

const CENTRO_BB = [-38.7183, -62.2663]

const COLOR_LOCAL = '#e60000'
const COLOR_CASA = '#9cc3ea'

function crearIconoPin(color) {
  const r = parseInt(color.slice(1, 3), 16)
  const g = parseInt(color.slice(3, 5), 16)
  const b = parseInt(color.slice(5, 7), 16)

  return L.divIcon({
    className: '',
    iconSize: [32, 32],
    iconAnchor: [16, 16],
    html: `
      <div style="position:relative;width:32px;height:32px;display:flex;align-items:center;justify-content:center;">
        <div class="pin-pulso" style="background:rgba(${r},${g},${b},0.35)"></div>
        <div style="width:8px;height:8px;border-radius:50%;background:${color};position:absolute;"></div>
      </div>
    `,
  })
}

export default function MapaHome({ vendedores = [] }) {
  const supabase = createClient()
  const [listo, setListo] = useState(false)
  const [iconoLocal, setIconoLocal] = useState(null)
  const [iconoCasa, setIconoCasa] = useState(null)
  const [barrios, setBarrios] = useState([])

  useEffect(() => {
    setIconoLocal(crearIconoPin(COLOR_LOCAL))
    setIconoCasa(crearIconoPin(COLOR_CASA))
    setListo(true)

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

  if (!listo || !iconoLocal || !iconoCasa) {
    return (
      <div className="bg-[#ECEAE3] rounded-2xl h-[320px] md:h-[400px] flex items-center justify-center">
        <span className="text-[#0a0a0a]/15 text-sm font-light">Cargando mapa...</span>
      </div>
    )
  }

  const estiloBarrio = {
    color: 'rgba(10,10,10,0.3)',
    weight: 0.6,
    fillColor: '#0a0a0a',
    fillOpacity: 0.01,
  }

  function onCadaBarrio(feature, layer) {
    if (feature.properties?.nombre) {
      layer.bindTooltip(feature.properties.nombre, {
        direction: 'top',
        offset: [0, -4],
        className: 'mapa-barrio-tooltip',
      })
      // En mobile (touch), abrir el tooltip al tocar
      layer.on('click', function () {
        if ('ontouchstart' in window) {
          if (layer.isTooltipOpen()) {
            layer.closeTooltip()
          } else {
            layer.openTooltip()
          }
        }
      })
    }
  }

  return (
    <div className="rounded-2xl overflow-hidden h-[320px] md:h-[400px]">
      <MapContainer
        center={CENTRO_BB}
        zoom={13}
        scrollWheelZoom={true}
        style={{ height: '100%', width: '100%' }}
        zoomControl={false}
        attributionControl={false}
      >
        <TileLayer
          url="https://{s}.basemaps.cartocdn.com/rastertiles/voyager_nolabels/{z}/{x}/{y}{r}.png"
        />

        {/* Polígonos de barrios */}
        {barrios.map((barrio) => {
          const feature = {
            type: 'Feature',
            properties: { nombre: barrio.nombre },
            geometry: barrio.geojson,
          }
          return (
            <GeoJSON
              key={barrio.id}
              data={feature}
              style={estiloBarrio}
              onEachFeature={onCadaBarrio}
            />
          )
        })}

        {/* Pines de vendedores */}
        {vendedores.map((v) => {
          if (!v.latitud || !v.longitud) return null

          return (
            <Marker
              key={v.id}
              position={[v.latitud, v.longitud]}
              icon={v.recibe_publico ? iconoLocal : iconoCasa}
            >
              <Tooltip direction="top" offset={[0, -14]} className="mapa-home-tooltip">
                <span style={{ fontFamily: "'Inter', sans-serif", fontSize: '12px', fontWeight: 500, color: '#0a0a0a' }}>
                  {v.nombre_negocio}
                </span>
              </Tooltip>
            </Marker>
          )
        })}
      </MapContainer>

      <style>{`
        @keyframes pulso {
          0% {
            transform: scale(1);
            opacity: 0.5;
          }
          70% {
            transform: scale(3);
            opacity: 0;
          }
          100% {
            transform: scale(3);
            opacity: 0;
          }
        }
        .pin-pulso {
          position: absolute;
          width: 10px;
          height: 10px;
          border-radius: 50%;
          animation: pulso 2s ease-out infinite;
        }
        .mapa-barrio-tooltip {
          background: rgba(10,10,10,0.85) !important;
          border: none !important;
          border-radius: 8px !important;
          padding: 6px 12px !important;
          box-shadow: 0 2px 8px rgba(0,0,0,0.15) !important;
          font-family: 'Inter', sans-serif !important;
          font-size: 12px !important;
          font-weight: 400 !important;
          color: white !important;
        }
        .mapa-barrio-tooltip::before {
          border-top-color: rgba(10,10,10,0.85) !important;
        }
        .leaflet-container {
          background: #ECEAE3 !important;
        }
      `}</style>
    </div>
  )
}
