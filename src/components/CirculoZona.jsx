'use client'

// La zona de una tienda que no muestra su dirección: un círculo de
// RADIO_ZONA_M metros alrededor del punto redondeado. Se usa adentro de un
// MapContainer (mapa público y formulario de ubicación).
//
// A zoom bajo 200 m son pocos píxeles y el círculo desaparece: ahí se dibuja
// un círculo de tamaño fijo en pantalla (CircleMarker) en lugar del de metros.

import { useState } from 'react'
import { Circle, CircleMarker, useMapEvents } from 'react-leaflet'
import { RADIO_ZONA_M } from '@/lib/zonaVendedor'

const RADIO_MINIMO_PX = 9

export const ESTILO_ZONA = { color: '#6fa3d6', weight: 1, fillColor: '#9cc3ea', fillOpacity: 0.35 }

// Metros que mide un píxel a esa latitud y zoom (tiles de 256 px).
function metrosPorPixel(lat, zoom) {
  return (40075016.686 * Math.cos((lat * Math.PI) / 180)) / 2 ** (zoom + 8)
}

// Lo que mide en pantalla el radio del círculo, con el mínimo aplicado.
export function radioEnPixeles(lat, zoom) {
  return Math.max(RADIO_MINIMO_PX, RADIO_ZONA_M / metrosPorPixel(lat, zoom))
}

// interactive={false}: el círculo no recibe el mouse (en el formulario lo
// agarra una manija invisible encima, y los toques pasan al mapa).
export default function CirculoZona({ centro, capaRef, eventHandlers, interactive = true, children }) {
  const map = useMapEvents({ zoomend: () => setZoom(map.getZoom()) })
  const [zoom, setZoom] = useState(() => map.getZoom())

  const radioPx = RADIO_ZONA_M / metrosPorPixel(centro[0], zoom)

  if (radioPx < RADIO_MINIMO_PX) {
    return (
      <CircleMarker ref={capaRef} center={centro} radius={RADIO_MINIMO_PX} pathOptions={ESTILO_ZONA}
        interactive={interactive} eventHandlers={eventHandlers}>
        {children}
      </CircleMarker>
    )
  }

  return (
    <Circle ref={capaRef} center={centro} radius={RADIO_ZONA_M} pathOptions={ESTILO_ZONA}
      interactive={interactive} eventHandlers={eventHandlers}>
      {children}
    </Circle>
  )
}
