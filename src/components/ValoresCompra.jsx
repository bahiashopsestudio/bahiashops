'use client'

import { useState, useRef } from 'react'
import Link from 'next/link'
import { useDragScroll } from '@/hooks/useDragScroll'

const VALORES_TAGS = [
  {
    slug: 'hecho-en-bahia',
    nombre: 'Hecho en Bahía',
    boton: 'Ver productos hechos en Bahía',
    quote: 'Todo lo que hacemos nace y se produce acá, en Bahía Blanca.',
    vendedor: 'Aroma Casa',
    ubicacion: 'Barrio Universitario, Bahía Blanca',
  },
  {
    slug: 'productos-unicos',
    nombre: 'Productos únicos',
    boton: 'Ver productos únicos',
    quote: 'Cada pieza es distinta: no vas a encontrar dos iguales.',
    vendedor: 'Hilo Sur',
    ubicacion: 'Centro Sur, Bahía Blanca',
  },
  {
    slug: 'hecho-a-mano',
    nombre: 'Hecho a mano',
    boton: 'Ver productos hechos a mano',
    quote: 'Todo pasa por nuestras manos, sin líneas de producción.',
    vendedor: 'Natural BB',
    ubicacion: 'Villa Mitre, Bahía Blanca',
  },
  {
    slug: 'de-mujeres-emprendedoras',
    nombre: 'De mujeres emprendedoras',
    boton: 'Ver productos de mujeres emprendedoras',
    quote: 'Armamos este proyecto entre amigas, desde cero.',
    vendedor: 'Flor de Ceibo',
    ubicacion: 'Pedro Pico, Bahía Blanca',
  },
  {
    slug: 'eco-friendly',
    nombre: 'Eco-friendly',
    boton: 'Ver productos eco-friendly',
    quote: 'Usamos materiales biodegradables en cada envío.',
    vendedor: 'Verde Bahía',
    ubicacion: 'Palihue, Bahía Blanca',
  },
  {
    slug: 'vegano',
    nombre: 'Vegano',
    boton: 'Ver productos veganos',
    quote: 'Ningún producto nuestro tiene origen animal.',
    vendedor: 'Sabor Libre',
    ubicacion: 'Centro, Bahía Blanca',
  },
  {
    slug: 'produccion-responsable',
    nombre: 'Producción responsable',
    boton: 'Ver productos producidos responsablemente',
    quote: 'Elegimos proveedores locales y procesos de bajo impacto.',
    vendedor: 'Taller del Sur',
    ubicacion: 'Bella Vista, Bahía Blanca',
  },
  {
    slug: 'segunda-oportunidad',
    nombre: 'Segunda oportunidad',
    boton: 'Ver productos de segundas oportunidades',
    quote: 'Le damos una nueva vida a piezas que ya tienen historia.',
    vendedor: 'Vintage BB',
    ubicacion: 'Centro Sur, Bahía Blanca',
  },
  {
    slug: 'delivery-en-bicicleta',
    nombre: 'Delivery en bicicleta',
    boton: 'Ver productos con delivery en bicicleta',
    quote: 'Repartimos todos los pedidos en bici, sin excepción.',
    vendedor: 'Pedal Market',
    ubicacion: 'Barrio Universitario, Bahía Blanca',
  },
]

export default function ValoresCompra() {
  const [activo, setActivo] = useState(0)
  const [visible, setVisible] = useState(true)
  const pillsRef = useRef(null)
  useDragScroll(pillsRef)

  function cambiarValor(i) {
    if (i === activo) return
    setVisible(false)
    setTimeout(() => {
      setActivo(i)
      setVisible(true)
    }, 200)
  }

  const valor = VALORES_TAGS[activo]

  return (
    <section style={{ paddingTop: '16px', paddingBottom: '48px' }}>
      <div style={{ padding: '0 32px', marginBottom: '20px' }}>
        <h2
          style={{
            fontFamily: 'Fraunces, serif',
            fontWeight: 500,
            fontSize: '28px',
            color: '#0a0a0a',
            letterSpacing: '-0.02em',
          }}
        >
          Comprá productos con tus valores
        </h2>
        <p
          style={{
            fontFamily: 'Poppins, sans-serif',
            fontWeight: 300,
            fontSize: '14px',
            color: '#888',
            marginTop: '4px',
          }}
        >
          Descubrí productos de tu ciudad que tienen mucho en común con vos.
        </p>
      </div>

      {/* ── Pastillas de valores ── */}
      <div
        ref={pillsRef}
        className="no-scrollbar flex gap-2 overflow-x-auto"
        style={{ padding: '0 32px', marginBottom: '24px', scrollbarWidth: 'none', msOverflowStyle: 'none', cursor: 'grab' }}
      >
        {VALORES_TAGS.map((v, i) => (
          <button
            key={v.slug}
            type="button"
            onClick={() => cambiarValor(i)}
            className={`shrink-0 whitespace-nowrap rounded-full border px-4 py-2 text-[13px] font-normal transition-colors cursor-pointer ${
              activo === i
                ? 'bg-[#0a0a0a] text-white border-[#0a0a0a]'
                : 'bg-transparent text-[#777] border-[#d5d5d5] hover:border-[#0a0a0a] hover:text-[#0a0a0a]'
            }`}
            style={{ fontFamily: "'Inter', sans-serif" }}
          >
            {v.nombre}
          </button>
        ))}
      </div>

      {/* ── Card del valor activo ── */}
      <div
        className="flex flex-col md:flex-row"
        style={{
          padding: '0 32px',
          gap: '32px',
          opacity: visible ? 1 : 0,
          transition: 'opacity 200ms ease',
        }}
      >
        <div
          style={{
            flex: '3 1 0%',
            aspectRatio: '16 / 9',
            width: '100%',
            borderRadius: 0,
            background: '#d5d0c8',
          }}
        />

        <div className="flex flex-col justify-center" style={{ flex: '2 1 0%' }}>
          <p
            style={{
              fontFamily: 'Poppins, sans-serif',
              fontWeight: 500,
              fontSize: '14px',
              color: '#0a0a0a',
              lineHeight: 1.6,
              marginBottom: '16px',
            }}
          >
            &ldquo;{valor.quote}&rdquo;
          </p>
          <p style={{ fontFamily: "'Inter', sans-serif", fontWeight: 500, fontSize: '14px', color: '#0a0a0a' }}>
            {valor.vendedor}
          </p>
          <p
            style={{
              fontFamily: "'Inter', sans-serif",
              fontWeight: 300,
              fontSize: '12px',
              color: '#999',
              marginBottom: '20px',
            }}
          >
            {valor.ubicacion}
          </p>
          <Link
            href={`/valor/${valor.slug}`}
            className="block w-full text-center bg-[#0a0a0a] text-white border border-[#0a0a0a] hover:bg-transparent hover:text-[#0a0a0a] transition-colors cursor-pointer"
            style={{
              fontFamily: "'Inter', sans-serif",
              fontWeight: 500,
              fontSize: '13px',
              borderRadius: '4px',
              padding: '12px 24px',
            }}
          >
            {valor.boton}
          </Link>
        </div>
      </div>
    </section>
  )
}
