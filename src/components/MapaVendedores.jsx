'use client'

// El mapa público de vendedores: el de la home (MapaDestacado) y el de /mapa.
//
// Quien eligió mostrar su dirección exacta aparece con un pin en su punto.
// Quien no, con un círculo alrededor de su punto redondeado (migración 018):
// nunca con un pin. Las tiendas que caen en la misma celda de la grilla
// comparten un solo círculo, con todas en la ventanita; correrlas un poco
// para separarlas sería inventar ubicaciones.
//
// Se importa siempre con dynamic(..., { ssr: false }): Leaflet necesita
// window al cargarse.

import { useEffect, useRef, useState } from 'react'
import { MapContainer, TileLayer, Marker, Popup } from 'react-leaflet'
import L from 'leaflet'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'
import { TILES_VENDEDORES } from '@/lib/mapaTiles'
import CirculoZona from '@/components/CirculoZona'
import 'leaflet/dist/leaflet.css'

const CENTRO_BB = [-38.7183, -62.2663]

const COLOR_EXACTA = '#ff1010'

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

const ICONO_EXACTA = crearIconoPin(COLOR_EXACTA)

// La ventanita se abre al pasar el mouse y se queda abierta mientras el mouse
// esté sobre ella. Sirve igual para un pin que para un círculo.
function usePopupAlPasar() {
  const capaRef = useRef(null)
  const cierreTimeout = useRef(null)

  function abrirPopup() {
    clearTimeout(cierreTimeout.current)
    capaRef.current?.openPopup()
  }

  function cerrarPopupConDemora() {
    cierreTimeout.current = setTimeout(() => {
      capaRef.current?.closePopup()
    }, 150)
  }

  const eventHandlers = {
    mouseover: abrirPopup,
    mouseout: cerrarPopupConDemora,
    popupopen: (e) => {
      const el = e.popup.getElement()
      if (!el) return
      el.addEventListener('mouseenter', abrirPopup)
      el.addEventListener('mouseleave', cerrarPopupConDemora)
    },
  }

  return { capaRef, eventHandlers }
}

function FichaTienda({ v, nombreBarrio, compacta = false }) {
  const lado = compacta ? '32px' : '40px'
  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '8px' }}>
        {v.logo_url ? (
          <img src={v.logo_url} alt="" style={{ width: lado, height: lado, borderRadius: '8px', objectFit: 'cover' }} />
        ) : (
          <div style={{ width: lado, height: lado, borderRadius: '8px', background: '#4164fe', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
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
      {!compacta && v.descripcion_corta && (
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
  )
}

function PinTienda({ v, nombreBarrio }) {
  const { capaRef, eventHandlers } = usePopupAlPasar()
  return (
    <Marker ref={capaRef} position={[v.latitud, v.longitud]} icon={ICONO_EXACTA} eventHandlers={eventHandlers}>
      <Popup className="mapa-popup" autoPan={false}>
        <div style={{ fontFamily: "'Inter', sans-serif", minWidth: '180px' }}>
          <FichaTienda v={v} nombreBarrio={nombreBarrio} />
        </div>
      </Popup>
    </Marker>
  )
}

function ZonaTiendas({ tiendas, barriosMap }) {
  const { capaRef, eventHandlers } = usePopupAlPasar()
  const nombreBarrio = (v) => (v.barrio_id ? barriosMap[v.barrio_id] : null)
  const centro = [tiendas[0].latitud, tiendas[0].longitud]
  return (
    <CirculoZona centro={centro} capaRef={capaRef} eventHandlers={eventHandlers}>
      <Popup className="mapa-popup" autoPan={false}>
        <div style={{ fontFamily: "'Inter', sans-serif", minWidth: '180px' }}>
          {tiendas.length === 1 ? (
            <FichaTienda v={tiendas[0]} nombreBarrio={nombreBarrio(tiendas[0])} />
          ) : (
            <>
              <div style={{ fontSize: '11px', fontWeight: 600, color: 'rgba(10,10,10,0.45)', marginBottom: '10px', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                {tiendas.length} tiendas en esta zona
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '14px', maxHeight: '260px', overflowY: 'auto' }}>
                {tiendas.map((v) => (
                  <FichaTienda key={v.id} v={v} nombreBarrio={nombreBarrio(v)} compacta />
                ))}
              </div>
            </>
          )}
        </div>
      </Popup>
    </CirculoZona>
  )
}

export default function MapaVendedores({ vendedores = [] }) {
  const supabase = createClient()
  const [barriosMap, setBarriosMap] = useState({})

  useEffect(() => {
    async function cargarBarrios() {
      const { data, error } = await supabase
        .from('barrios')
        .select('id, nombre')
      if (error) {
        console.error('Error cargando barrios:', error)
        return
      }
      if (data) {
        const mapa = {}
        data.forEach((b) => { mapa[b.id] = b.nombre })
        setBarriosMap(mapa)
      }
    }
    cargarBarrios()
  }, [])

  const conPunto = vendedores.filter((v) => v.latitud && v.longitud)
  const exactas = conPunto.filter((v) => v.direccion_visible)

  // Una entrada por celda: los puntos de la zona ya vienen redondeados, así
  // que dos tiendas de la misma celda tienen exactamente el mismo punto.
  const zonas = new Map()
  for (const v of conPunto.filter((v) => !v.direccion_visible)) {
    const celda = `${v.latitud},${v.longitud}`
    if (!zonas.has(celda)) zonas.set(celda, [])
    zonas.get(celda).push(v)
  }

  // relative z-0: los controles de Leaflet (la atribución) tienen z-index
  // 1000 y sin este contexto quedarían por encima de la Navbar (z-900).
  return (
    <div className="relative z-0 h-full w-full">
      <MapContainer
        center={CENTRO_BB}
        zoom={13}
        scrollWheelZoom={true}
        style={{ height: '100%', width: '100%' }}
        zoomControl={false}
      >
        <TileLayer {...TILES_VENDEDORES} />

        {[...zonas].map(([celda, tiendas]) => (
          <ZonaTiendas key={celda} tiendas={tiendas} barriosMap={barriosMap} />
        ))}

        {exactas.map((v) => (
          <PinTienda key={v.id} v={v} nombreBarrio={v.barrio_id ? barriosMap[v.barrio_id] : null} />
        ))}
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
    </div>
  )
}
