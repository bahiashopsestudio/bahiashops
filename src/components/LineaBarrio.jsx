'use client'

// Lo que se muestra debajo del mapa de ubicación sobre el barrio del punto. El
// barrio detectado va en una pastilla verde; si no hay, o si la consulta falló,
// un aviso, y el formulario pone debajo (children) el desplegable para elegirlo.

import { PIELES } from '@/lib/mapaEstilo'

export default function LineaBarrio({ nombre, fallo = false, children }) {
  const fuente = { fontFamily: "'Inter', sans-serif", fontSize: '14px' }
  if (nombre) {
    return (
      <div aria-live="polite" className="flex flex-wrap items-center gap-2.5" style={{ ...fuente, color: '#0a0a0a' }}>
        Barrio detectado
        <span
          className="inline-flex items-center rounded-full text-white"
          style={{ background: PIELES.claro.pin, fontSize: '13px', fontWeight: 600, padding: '5px 10px' }}
        >
          {nombre}
        </span>
      </div>
    )
  }
  return (
    <div className="flex flex-col gap-1.5">
      <p aria-live="polite" className="m-0" style={{ ...fuente, color: 'rgba(10,10,10,0.58)' }}>
        {fallo ? 'No pudimos detectar el barrio. Elegilo de la lista.' : 'Este punto no cae en ningún barrio cargado.'}
      </p>
      {children}
    </div>
  )
}
