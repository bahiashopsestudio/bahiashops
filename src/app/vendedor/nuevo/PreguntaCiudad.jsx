'use client'

// La pregunta del principio del alta, para que nadie cargue sus datos y se
// entere después de que todavía no estamos en su ciudad.
//
// Las opciones son las localidades activas, que vienen del formulario, y al
// final "Otra ciudad". Si elige una localidad, sigue el alta. Si elige otra
// ciudad, la anota y el alta termina acá: no se crea ninguna tienda. El
// servidor toma el mail de la sesión (/api/ciudades-pedidas).

import { useState } from 'react'
import { MAX_CIUDAD } from '@/lib/formulariosPublicos'
import {
  inputClasses, fuenteTitulo, fuenteAyuda, ayudaClasses, btnNegro, btnNegroInactivo, btnLinea,
} from '@/lib/estilosVendedor'

// estado: 'cargando', 'ok' o 'error', de la carga de las localidades.
export default function PreguntaCiudad({ localidades = [], estado, onElegir }) {
  const [otraCiudad, setOtraCiudad] = useState(false)
  const [ciudad, setCiudad] = useState('')
  const [enviando, setEnviando] = useState(false)
  const [error, setError] = useState(null)
  const [anotada, setAnotada] = useState(null)

  async function enviar(e) {
    e.preventDefault()
    if (enviando || !ciudad.trim()) return
    setEnviando(true)
    setError(null)
    try {
      const res = await fetch('/api/ciudades-pedidas', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ciudad }),
      })
      const cuerpo = await res.json().catch(() => ({}))
      if (!res.ok) {
        setError(cuerpo.error || 'No pudimos guardar tu ciudad. Probá de nuevo.')
        return
      }
      setAnotada({ ciudad: cuerpo.ciudad, email: cuerpo.email })
    } catch {
      setError('No pudimos guardar tu ciudad. Revisá tu conexión.')
    } finally {
      setEnviando(false)
    }
  }

  if (anotada) {
    return (
      <p role="status" className="m-0 p-4 bg-emerald-50 border border-emerald-200 rounded-lg text-sm text-emerald-800">
        ¡Gracias! Anotamos {anotada.ciudad}. Si llegamos, te escribimos a {anotada.email}.
      </p>
    )
  }

  return (
    <div className="flex flex-col gap-6">
      <h2 className="text-lg md:text-xl m-0" style={fuenteTitulo}>¿Dónde está tu emprendimiento?</h2>

      {estado === 'cargando' && (
        <p className="m-0 text-sm text-[#0a0a0a]/40 font-light">Cargando...</p>
      )}

      {estado === 'error' && (
        <p className="m-0 p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-800">
          No pudimos cargar las opciones. Probá recargar la página.
        </p>
      )}

      {estado === 'ok' && (
        <div className="grid grid-cols-1 min-[420px]:grid-cols-2 gap-2.5">
          {localidades.map((l) => (
            <button key={l.id} type="button" onClick={() => onElegir(l.id)} className={`px-4 py-3 ${btnLinea}`}>
              {l.nombre}
            </button>
          ))}
          <button
            type="button"
            aria-pressed={otraCiudad}
            onClick={() => setOtraCiudad(true)}
            className={`px-4 py-3 ${otraCiudad ? btnNegro : btnLinea}`}
          >
            Otra ciudad
          </button>
        </div>
      )}

      {otraCiudad && (
        <form onSubmit={enviar} className="flex flex-col gap-3">
          <p className={`${ayudaClasses} m-0`} style={fuenteAyuda}>
            Todavía no estamos en otras ciudades, pero es el plan.
            <br />
            Si tu emprendimiento está en otra ciudad, escribila acá y la vamos a tener en cuenta para lo que viene.
          </p>
          <div className="flex flex-col sm:flex-row gap-2">
            <input
              type="text"
              aria-label="Ciudad y provincia"
              placeholder="Ciudad y provincia"
              required
              maxLength={MAX_CIUDAD}
              value={ciudad}
              onChange={(e) => setCiudad(e.target.value)}
              className={`${inputClasses} flex-1`}
            />
            <button
              type="submit"
              disabled={enviando || !ciudad.trim()}
              className={`px-6 py-2.5 whitespace-nowrap ${enviando || !ciudad.trim() ? btnNegroInactivo : btnNegro}`}
            >
              {enviando ? 'Enviando...' : 'Enviar'}
            </button>
          </div>
          <p className="m-0 text-xs text-[#0a0a0a]/60" style={fuenteAyuda}>Usamos el mail de tu cuenta solo para esto.</p>
          {error && (
            <p className="m-0 p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-800">{error}</p>
          )}
        </form>
      )}
    </div>
  )
}
