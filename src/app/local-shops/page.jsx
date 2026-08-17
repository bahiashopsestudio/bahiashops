// src/app/local-shops/page.jsx
'use client'

import { useState } from 'react'
import VolverAtras from '@/components/VolverAtras'

const PROVINCIAS = [
  'Buenos Aires',
  'Catamarca',
  'Chaco',
  'Chubut',
  'Ciudad Autónoma de Buenos Aires',
  'Córdoba',
  'Corrientes',
  'Entre Ríos',
  'Formosa',
  'Jujuy',
  'La Pampa',
  'La Rioja',
  'Mendoza',
  'Misiones',
  'Neuquén',
  'Río Negro',
  'Salta',
  'San Juan',
  'San Luis',
  'Santa Cruz',
  'Santa Fe',
  'Santiago del Estero',
  'Tierra del Fuego',
  'Tucumán',
]

const inputClasses =
  'w-full px-3 py-2.5 border border-gray-300 rounded-lg text-[0.95rem] outline-none focus:border-[#0a0a0a] focus:ring-1 focus:ring-[#0a0a0a]/20 transition-colors box-border'

export default function LocalShopsPage() {
  const [provincia, setProvincia] = useState('')
  const [ciudad, setCiudad] = useState('')
  const [estado, setEstado] = useState('idle') // idle | enviando | exito | error

  async function handleSubmit(e) {
    e.preventDefault()
    if (!provincia || !ciudad.trim()) return

    setEstado('enviando')

    try {
      const res = await fetch('/api/local-shops', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ provincia, ciudad: ciudad.trim() }),
      })

      if (res.ok) {
        setEstado('exito')
        setProvincia('')
        setCiudad('')
      } else {
        setEstado('error')
      }
    } catch {
      setEstado('error')
    }
  }

  return (
    <div className="max-w-md w-full" style={{ fontFamily: "'Inter', sans-serif" }}>
      <link
        rel="stylesheet"
        href="https://fonts.googleapis.com/css2?family=Fraunces:opsz,wght@9..144,100..900&family=Poppins:wght@300;400;500&display=swap"
      />

      <VolverAtras />

      <h1
        className="text-2xl sm:text-3xl mb-4"
        style={{ fontFamily: 'Fraunces, serif', fontWeight: 500, color: '#0a0a0a', letterSpacing: '-0.02em' }}
      >
        Local Shops
      </h1>

      <p style={{ fontFamily: 'Poppins, sans-serif', fontWeight: 300, fontSize: '15px', color: '#4b5563', lineHeight: 1.6, marginBottom: '8px' }}>
        Local Shops es el proyecto que busca llevar el modelo de Bahía Shops a otras
        ciudades de Argentina.
      </p>
      <p style={{ fontFamily: 'Poppins, sans-serif', fontWeight: 300, fontSize: '15px', color: '#4b5563', lineHeight: 1.6, marginBottom: '32px' }}>
        Todavía se está construyendo.
      </p>

      <div className="bg-white border border-gray-200 rounded-lg p-5">
        <p className="text-sm mb-4" style={{ fontFamily: "'Inter', sans-serif", fontWeight: 500, color: '#374151' }}>
          ¿Te gustaría que Local Shops esté en tu ciudad?
        </p>

        {estado === 'exito' ? (
          <p className="text-green-700 text-sm text-center py-2">
            Gracias, anotamos tu ciudad.
          </p>
        ) : (
          <form onSubmit={handleSubmit} className="flex flex-col gap-3">
            <div>
              <label className="block text-sm text-gray-500 mb-1">Provincia</label>
              <select
                value={provincia}
                onChange={(e) => setProvincia(e.target.value)}
                className={`${inputClasses} bg-white`}
                disabled={estado === 'enviando'}
                required
              >
                <option value="" disabled>Elegí tu provincia</option>
                {PROVINCIAS.map((p) => (
                  <option key={p} value={p}>{p}</option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-sm text-gray-500 mb-1">Ciudad</label>
              <input
                type="text"
                value={ciudad}
                onChange={(e) => setCiudad(e.target.value)}
                placeholder="Tu ciudad"
                className={inputClasses}
                disabled={estado === 'enviando'}
                required
              />
            </div>

            <button
              type="submit"
              disabled={estado === 'enviando' || !provincia || !ciudad.trim()}
              className="self-start inline-block mt-1 border transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
              style={{
                fontFamily: "'Inter', sans-serif",
                fontWeight: 500,
                fontSize: '14px',
                padding: '14px 28px',
                borderRadius: '4px',
                backgroundColor: '#0a0a0a',
                borderColor: '#0a0a0a',
                color: '#fff',
                cursor: estado === 'enviando' ? 'not-allowed' : 'pointer',
              }}
              onMouseEnter={(e) => {
                if (estado === 'enviando') return
                e.currentTarget.style.backgroundColor = 'transparent'
                e.currentTarget.style.color = '#0a0a0a'
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.backgroundColor = '#0a0a0a'
                e.currentTarget.style.color = '#fff'
              }}
            >
              {estado === 'enviando' ? 'Enviando...' : 'Enviar'}
            </button>

            {estado === 'error' && (
              <p className="text-red-600 text-xs">
                Hubo un error, intentá de nuevo.
              </p>
            )}
          </form>
        )}
      </div>
    </div>
  )
}
