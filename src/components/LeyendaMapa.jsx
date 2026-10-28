'use client'

// La leyenda del mapa público (home y /mapa). Cada muestra va en un
// cuadradito con el color de tierra de la piel elegida, con la casita o el
// aro encima tal como se ven en el mapa: sobre el fondo de cada sección
// (oliva en la home, blanco en /mapa) los colores de las pieles solos no se
// distinguen.

import { PIELES, PIEL_INICIAL, CASA, CASA_VIEWBOX } from '@/lib/mapaEstilo'

function Muestra({ fondo, children }) {
  return (
    <span
      aria-hidden="true"
      style={{
        width: '22px', height: '22px', borderRadius: '5px', background: fondo, flexShrink: 0,
        display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
      }}
    >
      {children}
    </span>
  )
}

// textoExacta / textoZona: lo que dice cada muestra. estiloTexto y className
// son los de cada página.
export default function LeyendaMapa({ piel = PIEL_INICIAL, textoExacta, textoZona, estiloTexto, claseTexto, className }) {
  const s = PIELES[piel] || PIELES[PIEL_INICIAL]
  return (
    <div className={className}>
      <div className="flex items-center gap-2">
        <Muestra fondo={s.land}>
          {/* La casita ocupa el cuadradito con la punta hacia abajo a la izquierda, como en el mapa */}
          <svg viewBox={CASA_VIEWBOX} style={{ width: '10px', height: '14.6px', display: 'block', marginLeft: '-1px', marginTop: '1px' }}>
            <path d={CASA} fill={s.pin} />
          </svg>
        </Muestra>
        <span className={claseTexto} style={estiloTexto}>{textoExacta}</span>
      </div>
      <div className="flex items-center gap-2">
        <Muestra fondo={s.land}>
          {/* El aro de la zona: sin relleno, solo el borde */}
          <span style={{ width: '14px', height: '14px', borderRadius: '50%', border: `2.5px solid ${s.aro}`, boxSizing: 'border-box' }} />
        </Muestra>
        <span className={claseTexto} style={estiloTexto}>{textoZona}</span>
      </div>
    </div>
  )
}
