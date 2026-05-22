'use client'

import dynamic from 'next/dynamic'

const MapaBarrios = dynamic(() => import('./MapaBarrios'), {
  ssr: false,
  loading: () => <p>Cargando mapa...</p>,
})

export default function TestMapaPage() {
  return (
    <div style={{ padding: '2rem', maxWidth: 800, margin: '0 auto' }}>
      <h1>Prueba del mapa</h1>
      <p>Si ves Bahía Blanca acá abajo, Leaflet está funcionando.</p>
      <MapaBarrios />
    </div>
  )
}