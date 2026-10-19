'use client'

// Las estrellas de las reseñas: las que se muestran (EstrellasFijas) y las que
// se eligen al dejar una reseña (ElegirEstrellas, un radiogroup: flechas para
// moverse, Espacio o Enter para elegir).

import { useRef } from 'react'
import { ETIQUETAS_ESTRELLAS } from '@/lib/resenas'

const NEGRO = '#0a0a0a'
const GRIS_CLARO = '#d9d5cd'
const RUTA = 'M12 2.5l2.94 5.96 6.58.96-4.76 4.64 1.12 6.55L12 17.52l-5.88 3.09 1.12-6.55L2.48 9.42l6.58-.96L12 2.5z'

function Estrella({ llena, tamano, color = NEGRO }) {
  return (
    <svg width={tamano} height={tamano} viewBox="0 0 24 24" aria-hidden="true" className="shrink-0 block">
      <path d={RUTA} fill={llena ? color : GRIS_CLARO} />
    </svg>
  )
}

// valor: de 1 a 5 (entero; con decimales, redondea).
export function EstrellasFijas({ valor, tamano = 14, color = NEGRO, className = '' }) {
  const llenas = Math.round(Number(valor) || 0)
  return (
    <span role="img" aria-label={`${llenas} de 5 estrellas`} className={`inline-flex items-center gap-[2px] ${className}`}>
      {[1, 2, 3, 4, 5].map((n) => <Estrella key={n} llena={n <= llenas} tamano={tamano} color={color} />)}
    </span>
  )
}

// Cinco estrellas grandes. Negras hasta la elegida, gris claro el resto.
//   valor        0 (sin elegir) a 5
//   onCambiar(n) al elegir
export function ElegirEstrellas({ valor, onCambiar, idEtiqueta }) {
  const botones = useRef([])

  function teclas(evento, n) {
    let siguiente = null
    if (evento.key === 'ArrowRight' || evento.key === 'ArrowUp') siguiente = Math.min(5, n + 1)
    if (evento.key === 'ArrowLeft' || evento.key === 'ArrowDown') siguiente = Math.max(1, n - 1)
    if (evento.key === 'Home') siguiente = 1
    if (evento.key === 'End') siguiente = 5
    if (siguiente === null) return
    evento.preventDefault()
    onCambiar(siguiente)
    botones.current[siguiente - 1]?.focus()
  }

  return (
    <div role="radiogroup" aria-labelledby={idEtiqueta} className="flex items-center gap-1.5">
      {[1, 2, 3, 4, 5].map((n) => {
        const elegida = valor === n
        // Sin elegir, la primera es la que recibe el foco con Tab.
        const enfocable = valor ? elegida : n === 1
        return (
          <button
            key={n}
            ref={(el) => { botones.current[n - 1] = el }}
            type="button"
            role="radio"
            aria-checked={elegida}
            aria-label={`${n} ${n === 1 ? 'estrella' : 'estrellas'}: ${ETIQUETAS_ESTRELLAS[n - 1]}`}
            tabIndex={enfocable ? 0 : -1}
            onClick={() => onCambiar(n)}
            onKeyDown={(e) => teclas(e, n)}
            className="p-0.5 bg-transparent border-0 cursor-pointer rounded-md focus-visible:outline focus-visible:outline-2 focus-visible:outline-[#4164fe]"
          >
            <Estrella llena={n <= valor} tamano={34} />
          </button>
        )
      })}
    </div>
  )
}
