'use client'

import { useState, useRef } from 'react'
import Link from 'next/link'
import { useCarrito } from '@/context/CarritoContext'
import BarraScrollCustom from '@/components/BarraScrollCustom'
import { useDragScroll } from '@/hooks/useDragScroll'

const MAX_POR_CATEGORIA = 10

function getFoto(media) {
  if (!media?.length) return null
  const principal = media.find((m) => m.es_principal)
  if (principal) return principal.url
  const sorted = [...media].sort((a, b) => a.orden - b.orden)
  return sorted[0]?.url || null
}

export default function ProductosDestacados({ categorias, productos }) {
  const { agregar } = useCarrito()
  const [categoriaActiva, setCategoriaActiva] = useState(null)
  const [visible, setVisible] = useState(true)
  const scrollRef = useRef(null)
  const pillsRef = useRef(null)
  useDragScroll(pillsRef)

  const productosFiltrados = (
    categoriaActiva
      ? productos.filter((p) => p.categoria_id === categoriaActiva)
      : productos
  ).slice(0, MAX_POR_CATEGORIA)

  function cambiarCategoria(id) {
    if (id === categoriaActiva) return
    setVisible(false)
    setTimeout(() => {
      setCategoriaActiva(id)
      if (scrollRef.current) scrollRef.current.scrollLeft = 0
      setVisible(true)
    }, 200)
  }

  function handleAgregar(p) {
    agregar(
      {
        productoId: p.id,
        nombre: p.nombre,
        precio: Number(p.precio),
        foto: getFoto(p.media),
        variante: null,
        cantidad: 1,
      },
      {
        id: p.vendedor?.id,
        nombre: p.vendedor?.nombre_negocio || 'Local',
      }
    )
  }

  return (
    <section style={{ paddingTop: '48px', paddingBottom: '48px' }}>
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
          Productos destacados
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
          Lo más buscado en Bahía esta semana
        </p>
      </div>

      {/* ── Pastillas de categorías ── */}
      <div
        ref={pillsRef}
        className="no-scrollbar flex gap-2 overflow-x-auto"
        style={{ padding: '0 32px', marginBottom: '24px', scrollbarWidth: 'none', msOverflowStyle: 'none', cursor: 'grab' }}
      >
        <button
          type="button"
          onClick={() => cambiarCategoria(null)}
          className={`shrink-0 whitespace-nowrap rounded-full border px-4 py-2 text-[13px] font-normal transition-colors cursor-pointer ${
            categoriaActiva === null
              ? 'bg-[#0a0a0a] text-white border-[#0a0a0a]'
              : 'bg-transparent text-[#777] border-[#d5d5d5] hover:border-[#0a0a0a] hover:text-[#0a0a0a]'
          }`}
          style={{ fontFamily: "'Inter', sans-serif" }}
        >
          Todos
        </button>
        {categorias.map((c) => (
          <button
            key={c.id}
            type="button"
            onClick={() => cambiarCategoria(c.id)}
            className={`shrink-0 whitespace-nowrap rounded-full border px-4 py-2 text-[13px] font-normal transition-colors cursor-pointer ${
              categoriaActiva === c.id
                ? 'bg-[#0a0a0a] text-white border-[#0a0a0a]'
                : 'bg-transparent text-[#777] border-[#d5d5d5] hover:border-[#0a0a0a] hover:text-[#0a0a0a]'
            }`}
            style={{ fontFamily: "'Inter', sans-serif" }}
          >
            {c.nombre}
          </button>
        ))}
      </div>

      {/* ── Carrusel de productos ── */}
      <div
        ref={scrollRef}
        className="no-scrollbar flex overflow-x-auto"
        style={{
          gap: '20px',
          padding: '0 32px',
          scrollbarWidth: 'none',
          msOverflowStyle: 'none',
          opacity: visible ? 1 : 0,
          transition: 'opacity 200ms ease',
        }}
      >
        {productosFiltrados.length === 0 && (
          <p style={{ fontFamily: "'Inter', sans-serif", fontSize: '13px', color: '#aaa', padding: '24px 0' }}>
            Todavía no hay productos en esta categoría.
          </p>
        )}
        {productosFiltrados.map((p) => {
          const foto = getFoto(p.media)
          return (
            <div key={p.id} className="shrink-0" style={{ width: '190px' }}>
              <Link href={`/producto/${p.id}`} className="block group">
                <div
                  className="overflow-hidden"
                  style={{ width: '190px', height: '230px', background: '#f0ede8', borderRadius: '4px' }}
                >
                  {foto && (
                    <img
                      src={foto}
                      alt={p.nombre}
                      className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                    />
                  )}
                </div>
                <p
                  className="whitespace-nowrap overflow-hidden text-ellipsis"
                  style={{ fontFamily: "'Inter', sans-serif", fontWeight: 400, fontSize: '13.5px', color: '#0a0a0a', marginTop: '10px' }}
                >
                  {p.nombre}
                </p>
                <p
                  style={{ fontFamily: "'Inter', sans-serif", fontWeight: 300, fontSize: '12px', color: '#aaa', marginTop: '2px' }}
                >
                  {p.barrioNombre || ''}
                </p>
                <p
                  style={{ fontFamily: "'Inter', sans-serif", fontWeight: 500, fontSize: '14px', color: '#0a0a0a', marginTop: '4px' }}
                >
                  ${Number(p.precio).toLocaleString('es-AR')}
                </p>
              </Link>
              <button
                type="button"
                onClick={() => handleAgregar(p)}
                className="w-full bg-[#0a0a0a] text-white border border-[#0a0a0a] hover:bg-transparent hover:text-[#0a0a0a] transition-colors cursor-pointer"
                style={{
                  fontFamily: "'Inter', sans-serif",
                  fontSize: '12px',
                  fontWeight: 500,
                  borderRadius: '4px',
                  padding: '8px 16px',
                  marginTop: '10px',
                }}
              >
                Agregar al carrito
              </button>
            </div>
          )
        })}
      </div>

      {/* ── Barra de scroll custom ── */}
      {productosFiltrados.length > 0 && (
        <BarraScrollCustom
          scrollRef={scrollRef}
          deps={[productosFiltrados.length]}
          style={{ margin: '24px 32px 0' }}
        />
      )}
    </section>
  )
}
