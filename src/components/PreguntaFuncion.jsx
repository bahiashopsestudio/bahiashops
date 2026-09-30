'use client'

// Una pregunta "¿te gustaría…?" con Sí / No, dentro de un cartel de Bahía
// Shops. Lee y guarda el voto de la persona por /api/votos.
//
// Se muestra sólo a quien todavía no votó. Al votar agradece unos segundos y
// se cierra sola, con un fundido y un cierre de altura para que lo de abajo
// no pegue un salto.
//
// Nunca rompe la página: si la pregunta no existe, no hay sesión o la ruta
// falla al cargar, no se muestra nada.

import { useState, useEffect, useRef } from 'react'
import { preguntaPorId } from '@/lib/preguntas'
import CartelBahia, { BotonCartel } from '@/components/CartelBahia'

const MS_AGRADECIMIENTO = 3000
const MS_CIERRE = 400

export default function PreguntaFuncion({ id, className = '' }) {
  const pregunta = preguntaPorId(id)

  // 'cargando' | 'lista' | 'gracias' | 'cerrando' | 'oculta'
  const [estado, setEstado] = useState('cargando')
  const [voto, setVoto] = useState(null)
  const [guardando, setGuardando] = useState(false)
  const [error, setError] = useState('')
  const relojes = useRef([])

  // Al desmontar no quedan relojes sueltos.
  useEffect(() => () => relojes.current.forEach(clearTimeout), [])

  useEffect(() => {
    if (!pregunta) return
    let cancelado = false

    async function cargar() {
      try {
        const res = await fetch(`/api/votos?funcion=${encodeURIComponent(id)}`)
        if (!res.ok) throw new Error('respuesta ' + res.status)
        const data = await res.json()
        if (cancelado) return
        // Ya votó: la pregunta no se le vuelve a mostrar.
        setEstado(typeof data.voto === 'boolean' ? 'oculta' : 'lista')
      } catch {
        if (!cancelado) setEstado('oculta')
      }
    }
    cargar()
    return () => { cancelado = true }
  }, [id, pregunta])

  function despues(ms, fn) {
    relojes.current.push(setTimeout(fn, ms))
  }

  // Cierra el cartel. Con "reducir movimiento" activado desaparece sin animar.
  function cerrar() {
    const sinMovimiento = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches
    if (sinMovimiento) {
      setEstado('oculta')
      return
    }
    setEstado('cerrando')
    despues(MS_CIERRE, () => setEstado('oculta'))
  }

  async function votar(valor) {
    if (guardando || estado !== 'lista') return
    setGuardando(true)
    setError('')
    setVoto(valor)
    try {
      const res = await fetch('/api/votos', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ funcion: id, voto: valor }),
      })
      if (!res.ok) throw new Error('respuesta ' + res.status)
      setEstado('gracias')
      despues(MS_AGRADECIMIENTO, cerrar)
    } catch {
      // No se guardó: queda visible para volver a intentar.
      setVoto(null)
      setError('No pudimos guardar tu voto. Probá de nuevo.')
    }
    setGuardando(false)
  }

  if (!pregunta || estado === 'cargando' || estado === 'oculta') return null

  const cerrando = estado === 'cerrando'
  const votado = estado !== 'lista'

  return (
    // La grilla de una fila pasa de 1fr a 0fr: así se anima la altura sin
    // conocerla. El margen va adentro, para que también se cierre.
    <div
      className="grid transition-[grid-template-rows,opacity] ease-out motion-reduce:transition-none"
      style={{
        gridTemplateRows: cerrando ? '0fr' : '1fr',
        opacity: cerrando ? 0 : 1,
        transitionDuration: `${MS_CIERRE}ms`,
      }}
      aria-hidden={cerrando}
    >
      <div className="overflow-hidden min-h-0">
        <CartelBahia className={className}>
          <p className="m-0 mb-3 text-sm">{pregunta.texto}</p>
          <div className="flex gap-2">
            <BotonCartel onClick={() => votar(true)} disabled={guardando || votado} elegido={voto === true} aria-pressed={voto === true}>
              Sí
            </BotonCartel>
            <BotonCartel onClick={() => votar(false)} disabled={guardando || votado} elegido={voto === false} aria-pressed={voto === false}>
              No
            </BotonCartel>
          </div>
          {/* El renglón está siempre, aunque vacío: el cartel no cambia de alto
              cuando aparece el agradecimiento o el error. */}
          <p className="m-0 mt-3 text-xs min-h-[1rem]" role="status">
            {error || (votado ? '¡Gracias! Lo vamos a tener en cuenta.' : '')}
          </p>
        </CartelBahia>
      </div>
    </div>
  )
}
