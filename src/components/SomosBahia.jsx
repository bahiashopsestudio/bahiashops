'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'

const INTERVALO_MS = 5000

const SLIDES = [
  {
    imagen: '/images/somos-bahia.png',
    titulo: 'Ella es Sofía. Hace cerámica.',
    bajada: 'Bueno… en realidad no existe.',
    cierre: 'Pero nos encantaría que pronto haya muchas Sofías reales en Bahía Shops.',
  },
  {
    imagen: '/images/somos-bahia-cafe.png',
    titulo: 'Ellos son Martín y Florencia. Tuestan café.',
    bajada: 'Spoiler: tampoco existen.',
    cierre: 'Pero nos encantaría que pronto haya muchos de ellos reales en Bahía Shops.',
  },
  {
    imagen: '/images/somos-bahia-zapato.png',
    titulo: 'Ella es Delfina. Vende zapatos.',
    bajada: 'Sí, también la inventamos.',
    cierre: 'Pero nos encantaría que pronto haya muchas Delfinas reales en Bahía Shops.',
  },
]

export default function SomosBahia() {
  const [activo, setActivo] = useState(0)

  useEffect(() => {
    const id = setInterval(() => {
      setActivo((i) => (i + 1) % SLIDES.length)
    }, INTERVALO_MS)
    return () => clearInterval(id)
  }, [])

  return (
    <section className="py-6 md:py-8">
      <div style={{ background: '#f1f29f', borderRadius: 0, overflow: 'hidden' }}>
        {/* ── Fila superior: texto ── */}
        <div
          className="flex flex-col md:flex-row md:justify-between md:items-start gap-6"
          style={{ padding: '44px 36px 32px' }}
        >
          <div>
            <h2
              style={{
                fontFamily: 'Fraunces, serif',
                fontStyle: 'normal',
                fontWeight: 500,
                fontSize: '34px',
                color: '#0a0a0a',
                letterSpacing: '-0.02em',
                lineHeight: 1.1,
                marginBottom: '8px',
              }}
            >
              Somos Bahía.
            </h2>
            <p
              style={{
                fontFamily: 'Poppins, sans-serif',
                fontWeight: 300,
                fontSize: '15px',
                color: '#333',
              }}
            >
              El marketplace de tu ciudad.
            </p>
          </div>

          <p
            style={{
              fontFamily: 'Poppins, sans-serif',
              fontWeight: 300,
              fontSize: '13px',
              color: '#555',
              lineHeight: 1.65,
              maxWidth: '280px',
            }}
          >
            Te ayudamos a encontrar eso que buscás en tu ciudad. No hace falta que busques afuera.
            Lo que buscás ya está acá.
          </p>
        </div>

        {/* ── Slide automático de fotos ── */}
        <div style={{ margin: '0 36px' }}>
          <div style={{ position: 'relative', height: '300px', borderRadius: '6px', overflow: 'hidden' }}>

            {/* Las fotos van apiladas y se cruzan por opacidad: así no hay
                parpadeo ni recarga al cambiar de slide. */}
            {SLIDES.map((s, i) => (
              <img
                key={s.imagen}
                src={s.imagen}
                alt={s.titulo}
                style={{
                  position: 'absolute',
                  inset: 0,
                  width: '100%',
                  height: '100%',
                  objectFit: 'cover',
                  opacity: i === activo ? 1 : 0,
                  transition: 'opacity 900ms ease',
                }}
              />
            ))}

            {/* Degradado: sin esto el texto blanco se pierde sobre la parte
                clara de la foto. */}
            <div
              style={{
                position: 'absolute',
                inset: 0,
                background: 'linear-gradient(to top, rgba(0,0,0,0.65) 0%, rgba(0,0,0,0.3) 40%, rgba(0,0,0,0) 70%)',
                pointerEvents: 'none',
              }}
            />

            {/* Los epígrafes se cruzan con el mismo tiempo que las fotos. */}
            {SLIDES.map((s, i) => (
              <div
                key={s.imagen}
                className="max-w-[440px] md:max-w-[520px]"
                style={{
                  position: 'absolute',
                  left: '16px',
                  right: '16px',
                  bottom: '16px',
                  opacity: i === activo ? 1 : 0,
                  transition: 'opacity 900ms ease',
                  pointerEvents: 'none',
                }}
              >
                <p
                  style={{
                    fontFamily: "'Inter', sans-serif",
                    fontWeight: 500,
                    fontSize: '13px',
                    color: 'rgba(255,255,255,0.95)',
                  }}
                >
                  {s.titulo}
                </p>
                <p
                  style={{
                    fontFamily: "'Inter', sans-serif",
                    fontWeight: 300,
                    fontSize: '13px',
                    color: 'rgba(255,255,255,0.9)',
                  }}
                >
                  {s.bajada}
                </p>
                <p
                  style={{
                    fontFamily: "'Inter', sans-serif",
                    fontWeight: 300,
                    fontSize: '13px',
                    color: 'rgba(255,255,255,0.9)',
                    lineHeight: 1.5,
                    marginTop: '10px',
                  }}
                >
                  {s.cierre}
                </p>
              </div>
            ))}
          </div>
        </div>

        {/* ── Línea inferior ── */}
        <div style={{ padding: '20px 36px 36px' }}>
          <span style={{ fontFamily: "'Inter', sans-serif", fontWeight: 300, fontSize: '13px', color: '#777' }}>
            ¿Tenés un emprendimiento?{' '}
          </span>
          <Link
            href="/vendedor/nuevo"
            style={{
              fontFamily: "'Inter', sans-serif",
              fontWeight: 700,
              fontSize: '13px',
              color: '#0a0a0a',
              textDecoration: 'underline',
              textUnderlineOffset: '3px',
            }}
          >
            Contanos tu historia.
          </Link>
        </div>
      </div>
    </section>
  )
}
