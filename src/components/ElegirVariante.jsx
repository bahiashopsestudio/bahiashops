'use client'

import { useState } from 'react'
import Link from 'next/link'

// La pastilla "Elegí el talle" de una línea del carrito sin talle. Al tocarla
// despliega una pastilla por cada talle cargado; al tocar uno, onElegir(talle).
// Las usan el carrito y la pantalla "Falta elegir el talle" del checkout.
//
//   opcion     { nombre, valores } de productosQuePidenVariante (disponibilidad.js)
//   productoId para el link a la ficha si no llegaron los talles (por ejemplo,
//              el servidor devolvió FALTA_VARIANTE y la consulta falló)

const CLASES_PASTILLA = 'inline-block mt-1'
const ESTILO_PASTILLA = {
  fontSize: '11px', fontWeight: 500, color: '#0a0a0a', backgroundColor: 'rgba(10,10,10,0.05)', borderRadius: '999px', padding: '3px 9px',
}

export default function ElegirVariante({ opcion, productoId, onElegir }) {
  const [abierto, setAbierto] = useState(false)
  const nombre = opcion?.nombre || 'opción'
  const valores = opcion?.valores || []

  if (valores.length === 0) {
    return (
      <Link href={`/producto/${productoId}`} className={`${CLASES_PASTILLA} underline underline-offset-2`} style={ESTILO_PASTILLA}>
        Elegí el {nombre}
      </Link>
    )
  }

  return (
    <div>
      <button
        type="button"
        onClick={() => setAbierto((a) => !a)}
        aria-expanded={abierto}
        className={`${CLASES_PASTILLA} underline underline-offset-2 cursor-pointer`}
        style={ESTILO_PASTILLA}
      >
        Elegí el {nombre}
      </button>
      {abierto && (
        <div className="flex flex-wrap gap-1.5">
          {valores.map((valor) => (
            <button
              key={valor}
              type="button"
              onClick={() => onElegir(valor)}
              className={`${CLASES_PASTILLA} cursor-pointer`}
              style={ESTILO_PASTILLA}
            >
              {valor}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
