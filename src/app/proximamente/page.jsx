// src/app/proximamente/page.jsx
'use client'

import { useState } from 'react'

export default function ProximamentePage() {
  const [email, setEmail] = useState('')
  const [estado, setEstado] = useState('idle') // idle | enviando | exito | error | duplicado

  async function handleSubmit(e) {
    e.preventDefault()
    if (!email.trim()) return

    setEstado('enviando')

    try {
      const res = await fetch('/api/waitlist', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: email.trim().toLowerCase() }),
      })

      const data = await res.json()

      if (res.ok) {
        setEstado('exito')
        setEmail('')
      } else if (res.status === 409) {
        setEstado('duplicado')
      } else {
        setEstado('error')
      }
    } catch {
      setEstado('error')
    }
  }

  return (
    <div className="text-center max-w-md w-full">

      {/* Título */}
      <h1 className="text-4xl sm:text-5xl font-semibold text-gray-900 tracking-tight mb-3">
        Bahía Shops
      </h1>

      {/* Próximamente */}
      <p className="text-xl sm:text-2xl font-medium text-gray-700 mb-6">
        Próximamente
      </p>

      {/* Separador */}
      <div className="w-12 h-px bg-gray-300 mx-auto mb-6" />

      {/* Descripción */}
      <p className="text-gray-500 leading-relaxed mb-8">
        Estamos preparando un nuevo espacio para descubrir y comprar en los comercios
        y emprendimientos de Bahía Blanca.
      </p>

      {/* Formulario de email */}
      <div className="bg-white border border-gray-200 rounded-lg p-5 text-left mb-8">

        {estado === 'exito' ? (
          <p className="text-green-700 text-sm text-center py-2">
            ¡Listo! Te vamos a avisar cuando lancemos 🎉
          </p>
        ) : estado === 'duplicado' ? (
          <p className="text-amber-700 text-sm text-center py-2">
            Ya tenemos tu email registrado. ¡Te vamos a avisar!
          </p>
        ) : (
          <>
            <p className="text-sm text-gray-400 mb-3">
              ¿Querés que te avisemos cuando lancemos?
            </p>
            <div className="flex gap-2">
              <input
                type="email"
                placeholder="tu@email.com"
                value={email}
                onChange={(e) => {
                  setEmail(e.target.value)
                  if (estado === 'error') setEstado('idle')
                }}
                className="flex-1 px-3 py-2 text-sm border border-gray-200 rounded-md focus:outline-none focus:ring-2 focus:ring-gray-300"
                disabled={estado === 'enviando'}
              />
              <button
                onClick={handleSubmit}
                disabled={estado === 'enviando' || !email.trim()}
                className="px-4 py-2 text-sm font-medium text-white bg-gray-900 rounded-md hover:bg-gray-800 disabled:opacity-50 disabled:cursor-not-allowed transition-colors whitespace-nowrap"
              >
                {estado === 'enviando' ? 'Enviando...' : 'Avisame'}
              </button>
            </div>
            {estado === 'error' && (
              <p className="text-red-600 text-xs mt-2">
                Hubo un error, intentá de nuevo.
              </p>
            )}
          </>
        )}
      </div>

      {/* Pie */}
      <p className="text-xs text-gray-400">
        Bahía Blanca, Argentina
      </p>
    </div>
  )
}
