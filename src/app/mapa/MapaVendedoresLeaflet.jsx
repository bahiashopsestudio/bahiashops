'use client'

import { useEffect, useState } from 'react'
import { MapContainer, TileLayer, Marker, Tooltip, Popup } from 'react-leaflet'
import L from 'leaflet'
import Link from 'next/link'
import 'leaflet/dist/leaflet.css'

const CENTRO_BB = [-38.7183, -62.2663]
const COLOR_LOCAL = '#ff1010'
const COLOR_CASA = '#9cc3ea'

function iniciales(nombre) {
  if (!nombre) return ''
  const palabras = nombre.trim().split(/\s+/)
  return palabras.slice(0, 2).map(p => p[0].toUpperCase()).join('')
}

function crearIconoPin(color) {
  const r = parseInt(color.slice(1, 3), 16)
  const g = parseInt(color.slice(3, 5), 16)
  const b = parseInt(color.slice(5, 7), 16)

  return L.divIcon({
    className: '',
    iconSize: [32, 32],
    iconAnchor: [16, 16],
    popupAnchor: [0, -16],
    html: `
      <div style="position:relative;width:32px;height:32px;display:flex;align-items:center;justify-content:center;">
        <div class="pin-pulso" style="background:rgba(${r},${g},${b},0.35)"></div>
        <div style="width:8px;height:8px;border-radius:50%;background:${color};position:absolute;"></div>
      </div>
    `,
  })
}

export default function MapaVendedoresLeaflet({ vendedores = [], barriosMap = {} }) {
  const [iconoLocal, setIconoLocal] = useState(null)
  const [iconoCasa, setIconoCasa] = useState(null)

  useEffect(() => {
    setIconoLocal(crearIconoPin(COLOR_LOCAL))
    setIconoCasa(crearIconoPin(COLOR_CASA))
  }, [])

  if (!iconoLocal || !iconoCasa) {
    return (
      <div className="bg-[#F5F2EC] h-full w-full flex items-center justify-center">
        <span className="text-[#0a0a0a]/15 text-sm font-light">Cargando mapa...</span>
      </div>
    )
  }

  return (
    <>
      <MapContainer
        center={CENTRO_BB}
        zoom={13}
        scrollWheelZoom={true}
        style={{ height: '100%', width: '100%' }}
        zoomControl={false}
        attributionControl={false}
      >
        <TileLayer url="https://{s}.basemaps.cartocdn.com/rastertiles/voyager_nolabels/{z}/{x}/{y}{r}.png" />

        {vendedores.map((v) => {
          if (!v.latitud || !v.longitud) return null
          const nombreBarrio = v.barrio_id ? barriosMap[v.barrio_id] : null

          return (
            <Marker
              key={v.id}
              position={[v.latitud, v.longitud]}
              icon={v.recibe_publico ? iconoLocal : iconoCasa}
            >
              <Tooltip direction="top" offset={[0, -14]} className="mapa-pin-tooltip">
                <div>
                  <div style={{ fontWeight: 600, fontSize: '12px', color: 'white' }}>
                    {v.nombre_negocio}
                  </div>
                  {nombreBarrio && (
                    <div style={{ fontWeight: 400, fontSize: '11px', color: 'rgba(255,255,255,0.65)', marginTop: '1px' }}>
                      {nombreBarrio}
                    </div>
                  )}
                </div>
              </Tooltip>

              <Popup className="mapa-popup">
                <div style={{ fontFamily: "'Inter', sans-serif", minWidth: '180px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '8px' }}>
                    {v.logo_url ? (
                      <img src={v.logo_url} alt="" style={{ width: '40px', height: '40px', borderRadius: '8px', objectFit: 'cover' }} />
                    ) : (
                      <div style={{ width: '40px', height: '40px', borderRadius: '8px', background: '#4164fe', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                        <span style={{ fontSize: '13px', fontWeight: 700, color: 'white' }}>{iniciales(v.nombre_negocio)}</span>
                      </div>
                    )}
                    <div>
                      <div style={{ fontWeight: 700, fontSize: '14px', color: '#0a0a0a' }}>{v.nombre_negocio}</div>
                      {nombreBarrio && (
                        <div style={{ fontSize: '11px', fontWeight: 500, color: '#4164fe', marginTop: '1px' }}>{nombreBarrio}</div>
                      )}
                    </div>
                  </div>
                  {v.descripcion_corta && (
                    <p style={{ fontSize: '12px', color: 'rgba(10,10,10,0.5)', margin: '0 0 10px', lineHeight: '1.4' }}>
                      {v.descripcion_corta}
                    </p>
                  )}
                  <Link
                      href={`/tienda/${v.slug}`}
                      style={{
                          display: 'inline-block', color: '#4164fe',
                          fontSize: '12px', fontWeight: 600, textDecoration: 'none',
                      }}
                      >
                      Ver tienda →
                  </Link>
                </div>
              </Popup>
            </Marker>
          )
        })}
      </MapContainer>

      <style>{`
  @keyframes pulso {
    0% { transform: scale(1); opacity: 0.5; }
    70% { transform: scale(3); opacity: 0; }
    100% { transform: scale(3); opacity: 0; }
  }
  .pin-pulso {
    position: absolute;
    width: 10px;
    height: 10px;
    border-radius: 50%;
    animation: pulso 2s ease-out infinite;
  }
  .mapa-pin-tooltip {
    background: rgba(10,10,10,0.9) !important;
    border: none !important;
    border-radius: 8px !important;
    padding: 8px 12px !important;
    box-shadow: 0 4px 12px rgba(0,0,0,0.2) !important;
    font-family: 'Inter', sans-serif !important;
  }
  .mapa-pin-tooltip::before {
    border-top-color: rgba(10,10,10,0.9) !important;
  }
  .leaflet-popup.mapa-popup .leaflet-popup-content-wrapper {
    border-radius: 16px !important;
    padding: 0 !important;
    box-shadow: 0 8px 24px rgba(0,0,0,0.12) !important;
    border: none !important;
    overflow: hidden !important;
  }
  .leaflet-popup.mapa-popup .leaflet-popup-content {
    margin: 0 !important;
    padding: 16px 20px 18px !important;
    font-family: 'Inter', sans-serif !important;
  }
  .leaflet-popup.mapa-popup .leaflet-popup-tip-container {
    margin-top: -1px !important;
  }
  .leaflet-popup.mapa-popup .leaflet-popup-tip {
    box-shadow: none !important;
    border: none !important;
  }
  .leaflet-popup.mapa-popup .leaflet-popup-close-button {
    color: rgba(10,10,10,0.3) !important;
    font-size: 20px !important;
    top: 10px !important;
    right: 12px !important;
    width: 20px !important;
    height: 20px !important;
  }
  .leaflet-popup.mapa-popup .leaflet-popup-close-button:hover {
    color: rgba(10,10,10,0.6) !important;
  }
  .leaflet-container {
    background: #ECEAE3 !important;
  }
`}</style>
    </>
  )
}
