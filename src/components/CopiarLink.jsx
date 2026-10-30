'use client'

// El botón "Copiar link", en Mi negocio y en Mis productos.
//
//   variante 'oscuro': sobre el fondo verde del bloque del link.
//   variante 'claro':  una pill sobre blanco, en la tarjeta del producto.
//
// Al copiar dice "Copiado" unos 2 segundos. Si el portapapeles falla (sitio sin
// https, permiso negado) avisa con onFallo: cada pantalla muestra el link para
// copiarlo a mano. Con onCopiado, avisa que esta vez sí se pudo.

import { useEffect, useRef, useState } from 'react'

const VERDE = '#015444'
const CELESTE = '#9cc3ea'

const ESTILOS = {
  oscuro: {
    base: { borderRadius: '4px', padding: '6px 11px', borderColor: CELESTE },
    normal: { backgroundColor: 'transparent', color: CELESTE },
    encima: { backgroundColor: CELESTE, color: VERDE },
  },
  claro: {
    base: { borderRadius: '999px', padding: '6px 13px', borderColor: VERDE },
    normal: { backgroundColor: '#ffffff', color: VERDE },
    encima: { backgroundColor: VERDE, color: CELESTE },
  },
}

export function IconoCopiar() {
  return (
    <svg width="13" height="13" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.6" aria-hidden="true">
      <rect x="7" y="7" width="10" height="10" rx="2" />
      <path d="M13 7V5a2 2 0 0 0-2-2H5a2 2 0 0 0-2 2v6a2 2 0 0 0 2 2h2" />
    </svg>
  )
}

export default function CopiarLink({ link, variante = 'oscuro', onFallo, onCopiado }) {
  const [copiado, setCopiado] = useState(false)
  const [encima, setEncima] = useState(false)
  const temporizador = useRef(null)

  useEffect(() => () => clearTimeout(temporizador.current), [])

  async function copiar() {
    try {
      await navigator.clipboard.writeText(link)
      setCopiado(true)
      clearTimeout(temporizador.current)
      temporizador.current = setTimeout(() => setCopiado(false), 2000)
      onCopiado?.()
    } catch {
      setCopiado(false)
      onFallo?.()
    }
  }

  const estilo = ESTILOS[variante]

  return (
    <button
      type="button"
      onClick={copiar}
      // Solo con mouse: en un celular, el hover quedaría pegado después del toque.
      onPointerEnter={(e) => { if (e.pointerType === 'mouse') setEncima(true) }}
      onPointerLeave={() => setEncima(false)}
      className="inline-flex items-center shrink-0 cursor-pointer whitespace-nowrap"
      style={{
        fontFamily: "'Inter', sans-serif", fontWeight: 500, fontSize: '12px', gap: '6px',
        borderWidth: '1px', borderStyle: 'solid',
        transition: 'background-color 0.15s, color 0.15s',
        ...estilo.base,
        ...(encima ? estilo.encima : estilo.normal),
      }}
    >
      <IconoCopiar />
      <span aria-live="polite">{copiado ? 'Copiado' : 'Copiar link'}</span>
    </button>
  )
}
