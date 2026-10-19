'use client'

// La lista de reseñas: la de la página de la tienda y la del panel del
// vendedor (que suma "Pedido #n" con el link al pedido). Las más recientes
// primero, de a 10, y "Ver más reseñas" pide la página siguiente.
//
// Props:
//   inicial        las primeras reseñas (ya cargadas)
//   hayMasInicial  si hay otra página
//   urlPagina(n)   la URL que devuelve { resenas, hayMas } desde la n-ésima
//   conPedido      muestra "Pedido #n" (solo el panel de la tienda)
//   tienda         el nombre de la tienda: con él, debajo de cada reseña va la
//                  respuesta de la tienda, si está publicada (página pública)
//   extra(resena)  lo que va debajo de cada reseña (el panel de la tienda:
//                  su respuesta, "Responder" y "Pedir revisión")

import { useState } from 'react'
import Link from 'next/link'
import AvatarApodo from '@/components/AvatarApodo'
import { EstrellasFijas } from '@/components/Estrellas'
import { fechaCorta } from '@/lib/fechas'
import { FIRMA_CUENTA_ELIMINADA } from '@/lib/resenas'

// La respuesta de la tienda, debajo de la reseña: con sangría y una línea gris
// de 2px a la izquierda (más chica en el celular). marca: lo que va al lado
// de la fecha (en el panel, la etiqueta "Oculta").
export function RespuestaPublica({ tienda, respuesta, marca = null }) {
  return (
    <div className="mt-3 ml-2 md:ml-8 pl-3 md:pl-4 border-l-2 border-[#0a0a0a]/10">
      <p className="m-0 flex flex-wrap items-center gap-x-1.5 gap-y-1">
        <span className="text-[#0a0a0a]" style={{ fontFamily: "'Inter', sans-serif", fontWeight: 600, fontSize: '13px' }}>
          Respuesta de {tienda}
        </span>
        <span className="text-xs text-[#0a0a0a]/40 font-light">
          · {fechaCorta(respuesta.creado_en)}{respuesta.editada ? ' · editada' : ''}
        </span>
        {marca}
      </p>
      <p className="m-0 mt-1 text-[14px] text-[#0a0a0a]/80 font-light leading-relaxed whitespace-pre-line break-words">{respuesta.texto}</p>
    </div>
  )
}

export function ItemResena({ resena, conPedido = false, tienda = null, extra = null }) {
  const eliminada = !resena.apodo
  return (
    <li className="py-4 border-t border-[#0a0a0a]/5 first:border-t-0 list-none">
      <div className="flex items-center gap-2.5 flex-wrap">
        {eliminada ? (
          <span aria-hidden="true" className="inline-block rounded-full shrink-0" style={{ width: '28px', height: '28px', backgroundColor: '#e3e1dc' }} />
        ) : (
          <AvatarApodo apodo={resena.apodo} tamano={28} />
        )}
        <span className={eliminada ? 'text-[#0a0a0a]/45' : 'text-[#0a0a0a]'}
          style={{ fontFamily: "'Inter', sans-serif", fontWeight: 600, fontSize: '14px' }}>
          {eliminada ? FIRMA_CUENTA_ELIMINADA : resena.apodo}
        </span>
        <EstrellasFijas valor={resena.estrellas} tamano={13} />
        <span className="text-xs text-[#0a0a0a]/40 font-light">{fechaCorta(resena.creado_en)}</span>
        {conPedido && resena.pedido_id && (
          <Link href={`/vendedor/pedidos?pedido=${resena.pedido_id}`}
            className="text-[11px] font-medium text-[#0a0a0a]/55 bg-[#0a0a0a]/[0.05] rounded-full px-2 py-0.5 no-underline hover:text-[#0a0a0a]">
            Pedido #{resena.pedido_id}
          </Link>
        )}
      </div>
      {resena.texto ? (
        <p className="m-0 mt-2 text-sm text-[#0a0a0a]/80 font-light leading-relaxed whitespace-pre-line break-words">{resena.texto}</p>
      ) : (
        <p className="m-0 mt-2 text-sm text-[#0a0a0a]/40 font-light italic">Dejó solo las estrellas.</p>
      )}
      {tienda && resena.respuesta && <RespuestaPublica tienda={tienda} respuesta={resena.respuesta} />}
      {extra}
    </li>
  )
}

export default function ListaResenas({ inicial, hayMasInicial, urlPagina, conPedido = false, tienda = null, extra = null }) {
  const [resenas, setResenas] = useState(inicial || [])
  const [hayMas, setHayMas] = useState(!!hayMasInicial)
  const [cargando, setCargando] = useState(false)
  const [error, setError] = useState('')

  async function verMas() {
    setCargando(true)
    setError('')
    try {
      const res = await fetch(urlPagina(resenas.length))
      const datos = await res.json().catch(() => null)
      if (!res.ok || !Array.isArray(datos?.resenas)) {
        setError(datos?.error || 'No pudimos cargar más reseñas. Probá de nuevo.')
      } else {
        // Sin repetir, por si entró una nueva mientras tanto.
        setResenas((previas) => {
          const vistas = new Set(previas.map((r) => r.id))
          return [...previas, ...datos.resenas.filter((r) => !vistas.has(r.id))]
        })
        setHayMas(!!datos.hayMas)
      }
    } catch {
      setError('No pudimos conectarnos. Revisá tu conexión y probá de nuevo.')
    }
    setCargando(false)
  }

  return (
    <>
      <ul className="m-0 p-0">
        {resenas.map((r) => <ItemResena key={r.id} resena={r} conPedido={conPedido} tienda={tienda} extra={extra ? extra(r) : null} />)}
      </ul>
      {error && <p className="m-0 mt-2 text-sm text-[#dc2626] font-light">{error}</p>}
      {hayMas && (
        <button type="button" onClick={verMas} disabled={cargando}
          className="mt-3 bg-white text-[#0a0a0a] border border-[#0a0a0a] hover:bg-[#0a0a0a]/[0.04] transition-colors cursor-pointer disabled:opacity-50 disabled:cursor-wait"
          style={{ fontFamily: "'Inter', sans-serif", fontWeight: 500, fontSize: '14px', borderRadius: '4px', padding: '10px 20px' }}>
          {cargando ? 'Cargando…' : 'Ver más reseñas'}
        </button>
      )}
    </>
  )
}
