'use client'

// La pastilla de «Cuánto cuesta» en /vender: alterna entre los dos casos de
// comisión (cliente nuevo / cliente propio). Un círculo con el porcentaje
// viaja de un extremo al otro y la pastilla cambia de color; los textos se
// cruzan sin superponerse (el que se va desaparece en la primera mitad del
// cruce y el nuevo aparece en la segunda).
//
//   casos  [{ porcentaje, quien, explicacion }, { … }]: el primero va con el
//          círculo a la izquierda y el segundo a la derecha. Sin textos fijos
//          acá adentro.
//
// Rota sola cada 4 s. Al tocarla (o Enter / espacio, o un puntito) cambia en
// el momento y la rotación se pausa 8 s. No rota con la pestaña oculta ni con
// «reducir movimiento» (ahí el cambio es instantáneo y solo al tocarla).
// Los dos casos están siempre escritos en un párrafo oculto visualmente, para
// Google y lectores de pantalla; lo animado va con aria-hidden.
//
// Medidas (celular / desde md): alto 128 / 184 px, margen del círculo 7 /
// 10 px, texto a 20 / 44 px del círculo y a 40 / 72 px del borde redondeado.

import { useEffect, useState } from 'react'
import { FONDO_BAHIA, BEIGE_BAHIA, CELESTE_CLARO, AMARILLO_BAHIA } from '@/lib/coloresBahia'

const FRAUNCES = "'Fraunces', Georgia, 'Times New Roman', serif"
const INTER = "'Inter', system-ui, sans-serif"
const POPPINS = "'Poppins', system-ui, sans-serif"

// Colores de cada estado: pastilla, círculo, número y texto.
const ESTADOS = [
  { pastilla: BEIGE_BAHIA, circulo: FONDO_BAHIA, numero: BEIGE_BAHIA, texto: FONDO_BAHIA },
  { pastilla: CELESTE_CLARO, circulo: AMARILLO_BAHIA, numero: FONDO_BAHIA, texto: FONDO_BAHIA },
]

const CRUCE = '0.8s'
const MITAD = '0.4s'
const CURVA = 'cubic-bezier(.65,0,.35,1)'
const CADA = 4000
const PAUSA = 8000

// Las medidas van en variables CSS (con su valor de celular y el de md), así
// el círculo y los márgenes del texto se calculan con calc().
const MEDIDAS =
  '[--alto:128px] [--margen:7px] [--cerca:20px] [--lejos:40px] ' +
  'md:[--alto:184px] md:[--margen:10px] md:[--cerca:44px] md:[--lejos:72px]'
const DIAMETRO = 'calc(var(--alto) - 2 * var(--margen))'
// Distancia del borde de la pastilla al texto, del lado del círculo.
const LADO_CIRCULO = 'calc(var(--margen) + var(--alto) - 2 * var(--margen) + var(--cerca))'

export default function PastillaComision({ casos }) {
  const [activo, setActivo] = useState(0)
  // Cuánto espera el próximo cambio solo: 4 s, u 8 s después de un toque.
  const [espera, setEspera] = useState(CADA)
  // Cambia en cada toque (y si la pestaña estaba oculta) para reiniciar la espera.
  const [vuelta, setVuelta] = useState(0)
  const [reducir, setReducir] = useState(false)

  useEffect(() => {
    const mq = window.matchMedia('(prefers-reduced-motion: reduce)')
    const leer = () => setReducir(mq.matches)
    leer()
    mq.addEventListener('change', leer)
    return () => mq.removeEventListener('change', leer)
  }, [])

  useEffect(() => {
    if (reducir) return
    const t = setTimeout(() => {
      if (document.visibilityState === 'visible') {
        setActivo((a) => 1 - a)
        setEspera(CADA)
      } else {
        // Oculta: no rota; vuelve a probar en otros 4 s.
        setVuelta((v) => v + 1)
      }
    }, espera)
    return () => clearTimeout(t)
  }, [activo, espera, vuelta, reducir])

  function elegir(i) {
    setActivo(i)
    setEspera(PAUSA)
    setVuelta((v) => v + 1)
  }

  function alTeclear(e) {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault()
      elegir(1 - activo)
    }
  }

  const estado = ESTADOS[activo]
  const sinMovimiento = reducir ? 'none' : undefined

  // El que entra aparece en la segunda mitad; el que se va, en la primera.
  const fundido = (visible, corrimiento) => ({
    opacity: visible ? 1 : 0,
    transform: visible || !corrimiento ? 'none' : `translateX(${corrimiento}px)`,
    transition: sinMovimiento ?? (visible
      ? `opacity ${MITAD} ease ${MITAD}, transform ${MITAD} ease ${MITAD}`
      : `opacity ${MITAD} ease, transform ${MITAD} ease`),
  })

  return (
    <div>
      <p className="sr-only">
        {casos.map((c) => `${c.porcentaje}: ${c.quien}. ${c.explicacion}`).join(' ')}
      </p>

      <div
        role="button"
        tabIndex={0}
        aria-label="Cambiar entre los dos casos de comisión"
        onClick={() => elegir(1 - activo)}
        onKeyDown={alTeclear}
        className={`relative w-full overflow-hidden cursor-pointer select-none focus-visible:outline-2 focus-visible:outline-offset-4 ${MEDIDAS}`}
        style={{
          height: 'var(--alto)',
          borderRadius: '999px',
          background: estado.pastilla,
          outlineColor: BEIGE_BAHIA,
          transition: sinMovimiento ?? `background-color ${CRUCE} ${CURVA}`,
        }}
      >
        {/* Los textos: cada caso tiene su lugar fijo (al lado de donde queda su círculo). */}
        {casos.map((c, i) => {
          const izquierda = i === 0
          return (
            <div
              key={c.quien}
              aria-hidden="true"
              className={`absolute inset-y-0 flex flex-col justify-center gap-2 ${izquierda ? 'text-left' : 'text-right md:text-left'}`}
              style={{
                left: izquierda ? LADO_CIRCULO : 'var(--lejos)',
                right: izquierda ? 'var(--lejos)' : LADO_CIRCULO,
                color: ESTADOS[i].texto,
                ...fundido(activo === i, izquierda ? 12 : -12),
              }}
            >
              <span className="text-[14px] md:text-[16px]" style={{ fontFamily: INTER, fontWeight: 600, lineHeight: 1.3 }}>
                {c.quien}
              </span>
              <span className="text-[12px] md:text-[14px] leading-[1.4] md:leading-[1.55]" style={{ fontFamily: POPPINS, fontWeight: 300, opacity: 0.85 }}>
                {c.explicacion}
              </span>
            </div>
          )
        })}

        {/* El círculo: viaja de un extremo al otro y cambia de color. */}
        <div
          aria-hidden="true"
          className="absolute rounded-full"
          style={{
            top: 'var(--margen)',
            width: DIAMETRO,
            height: DIAMETRO,
            left: activo === 0 ? 'var(--margen)' : `calc(100% - var(--margen) - ${DIAMETRO})`,
            background: estado.circulo,
            transition: sinMovimiento ?? `left ${CRUCE} ${CURVA}, background-color ${CRUCE} ${CURVA}`,
          }}
        >
          {casos.map((c, i) => (
            <span
              key={c.porcentaje}
              className="absolute inset-0 flex items-center justify-center text-[34px] md:text-[54px]"
              style={{
                fontFamily: FRAUNCES,
                fontWeight: 500,
                letterSpacing: '-0.02em',
                fontVariantNumeric: 'tabular-nums',
                lineHeight: 1,
                color: ESTADOS[i].numero,
                ...fundido(activo === i, 0),
              }}
            >
              {c.porcentaje}
            </span>
          ))}
        </div>
      </div>

      {/* Los puntitos: 9 px, borde beige; el del estado activo, relleno. */}
      <div className="flex justify-center gap-1 mt-[10px]">
        {casos.map((c, i) => (
          <button
            key={c.porcentaje}
            type="button"
            aria-label={`Ver ${c.porcentaje}`}
            aria-pressed={activo === i}
            onClick={() => elegir(i)}
            className="p-[6px] cursor-pointer rounded-full focus-visible:outline-2 focus-visible:outline-offset-2"
            style={{ outlineColor: BEIGE_BAHIA }}
          >
            <span
              className="block rounded-full"
              style={{
                width: '9px',
                height: '9px',
                border: `1.5px solid ${BEIGE_BAHIA}`,
                background: activo === i ? BEIGE_BAHIA : 'transparent',
                transition: sinMovimiento ?? `background-color ${MITAD} ease`,
              }}
            />
          </button>
        ))}
      </div>
    </div>
  )
}
