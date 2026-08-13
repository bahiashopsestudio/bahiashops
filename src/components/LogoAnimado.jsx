'use client'

import { useRef, useEffect, useId } from 'react'

export default function LogoAnimado({ className = '', color = '#0a0a0a' }) {
  const circleARef = useRef(null)
  const circleBRef = useRef(null)
  const rafRef = useRef(null)
  const t0Ref = useRef(null)
  const filterId = useId()

  useEffect(() => {
    const cx = 260, cy = 170, baseR = 66
    const speed = 9      // segundos por ciclo base — más alto = más lento
    const sep = 90        // amplitud del recorrido de cada círculo (en unidades del svg)
    const pulse = 0.29    // cuánto "late" el radio

    function heartbeat(p) {
      const s1 = Math.max(0, Math.sin(p))
      const s2 = Math.max(0, Math.sin(p - 0.62))
      return Math.pow(s1, 6) + 0.55 * Math.pow(s2, 6)
    }

    function frame(now) {
      if (t0Ref.current == null) t0Ref.current = now
      const sec = (now - t0Ref.current) / 1000
      const w = (2 * Math.PI) / speed
      const t = sec * w

      const ax = cx - sep * 0.32 + Math.sin(t * 0.9) * sep * 0.60 + Math.sin(t * 0.41 + 1.3) * 12
      const ay = cy + Math.sin(t * 1.35 + 0.5) * sep * 0.42 + Math.cos(t * 0.63) * 10
      const ar = baseR * (1 + pulse * heartbeat(t * 1.7))

      const bx = cx + sep * 0.32 + Math.sin(t * 0.72 + 2.1) * sep * 0.60 + Math.cos(t * 0.47) * 12
      const by = cy + Math.cos(t * 1.05 + 1.7) * sep * 0.42 + Math.sin(t * 0.55 + 2.0) * 10
      const br = baseR * (1 + pulse * heartbeat(t * 1.15 + 1.4))

      const A = circleARef.current
      const B = circleBRef.current
      if (A) { A.setAttribute('cx', ax.toFixed(2)); A.setAttribute('cy', ay.toFixed(2)); A.setAttribute('r', Math.max(4, ar).toFixed(2)) }
      if (B) { B.setAttribute('cx', bx.toFixed(2)); B.setAttribute('cy', by.toFixed(2)); B.setAttribute('r', Math.max(4, br).toFixed(2)) }

      rafRef.current = requestAnimationFrame(frame)
    }

    rafRef.current = requestAnimationFrame(frame)
    return () => { if (rafRef.current) cancelAnimationFrame(rafRef.current) }
  }, [])

  return (
    <svg viewBox="0 0 520 340" className={className} role="img" aria-label="Bahía Shops">
      <defs>
        <filter id={`bahiaGoo-${filterId}`}>
          <feGaussianBlur in="SourceGraphic" stdDeviation="13" result="blur" />
          <feColorMatrix in="blur" type="matrix" values="1 0 0 0 0  0 1 0 0 0  0 0 1 0 0  0 0 0 26 -13" result="goo" />
        </filter>
      </defs>
      <g filter={`url(#bahiaGoo-${filterId})`}>
        <circle ref={circleARef} cx="215" cy="170" r="70" fill={color} />
        <circle ref={circleBRef} cx="305" cy="170" r="70" fill={color} />
      </g>
    </svg>
  )
}