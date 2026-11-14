'use client'

// Hoy solo lo usa /vender. La home tiene su propio hero en HomeContent.jsx;
// se puede migrar cuando tenga poster.
//
// Un hero de pantalla completa (100vh: el Navbar transparente pasa a blanco
// cuando termina de salir de pantalla) con video de fondo, una capa de
// oscurecido y el contenido encima.
//
//   src         el video de compu
//   srcCelu     (opcional) el video de celular, debajo de 768 px
//   poster      la imagen fija de compu (el primer cuadro del video)
//   posterCelu  (opcional) la imagen fija de celular, debajo de 768 px
//   overlay     el fondo de la capa de oscurecido, como texto CSS
//   children    el contenido, encima de todo
//
// La imagen fija es un <picture> detrás del video, no el atributo poster: así
// el navegador baja una sola de las dos (según el ancho) y se ve desde el
// primer momento, antes de que cargue el JavaScript. El video no trae src en
// el HTML: lo pone el efecto, una sola versión. Con «reducir movimiento» no se
// carga ningún video y queda la imagen. Si el navegador no deja reproducir
// (modo ahorro del iPhone, por ejemplo), también queda la imagen.

import { useEffect, useRef } from 'react'

const CELU = '(max-width: 767px)'
// Respaldo para que el texto blanco se lea aunque falle la imagen.
const FONDO = '#1d2420'

export default function HeroVideo({ src, srcCelu, poster, posterCelu, overlay, children }) {
  const ref = useRef(null)

  useEffect(() => {
    const v = ref.current
    if (!v) return
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return
    const elegido = srcCelu && window.matchMedia(CELU).matches ? srcCelu : src
    v.muted = true
    v.src = elegido
    v.play().catch(() => {})
  }, [src, srcCelu])

  return (
    <section className="relative h-screen overflow-hidden" style={{ background: FONDO }}>
      {poster && (
        <picture>
          {posterCelu && <source media={CELU} srcSet={posterCelu} />}
          <img src={poster} alt="" aria-hidden="true" fetchPriority="high" className="absolute inset-0 w-full h-full object-cover" />
        </picture>
      )}
      <video
        ref={ref}
        muted
        loop
        playsInline
        preload="none"
        aria-hidden="true"
        className="absolute inset-0 w-full h-full object-cover"
      />
      <div className="absolute inset-0" aria-hidden="true" style={{ background: overlay }} />
      <div className="relative z-10 h-full">
        {children}
      </div>
    </section>
  )
}
