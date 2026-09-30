// Un "cartel de Bahía Shops": la forma en que el sitio le habla a la gente
// (una pregunta, un aviso). Fondo verde del footer, texto celeste.
//
// Los colores salen de src/lib/coloresBahia.js y se pasan como variables CSS
// al cartel: lo que va adentro (BotonCartel, textos) usa esas variables, así
// que cambiar el diseño es cambiar ese archivo, no cada cartel.

import { FONDO_BAHIA, CELESTE_BAHIA } from '@/lib/coloresBahia'

export default function CartelBahia({ children, className = '' }) {
  return (
    <div
      className={`rounded-lg p-4 ${className}`}
      style={{
        '--cartel-fondo': FONDO_BAHIA,
        '--cartel-texto': CELESTE_BAHIA,
        backgroundColor: 'var(--cartel-fondo)',
        color: 'var(--cartel-texto)',
        fontFamily: "'Inter', sans-serif",
      }}
    >
      {children}
    </div>
  )
}

// Botón para usar dentro de un CartelBahia: borde y texto celestes; el
// elegido, relleno celeste con el texto del color del fondo.
export function BotonCartel({ elegido = false, className = '', style, children, ...resto }) {
  return (
    <button
      type="button"
      {...resto}
      className={`border transition-colors motion-reduce:transition-none disabled:cursor-default ${resto.disabled ? '' : 'cursor-pointer'} ${className}`}
      style={{
        fontFamily: "'Inter', sans-serif",
        fontWeight: 500,
        fontSize: '13px',
        borderRadius: '4px',
        padding: '8px 22px',
        borderColor: 'var(--cartel-texto)',
        backgroundColor: elegido ? 'var(--cartel-texto)' : 'transparent',
        color: elegido ? 'var(--cartel-fondo)' : 'var(--cartel-texto)',
        ...style,
      }}
    >
      {children}
    </button>
  )
}
