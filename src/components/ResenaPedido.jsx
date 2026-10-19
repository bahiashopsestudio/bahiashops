'use client'

// La reseña de un pedido, en Mis pedidos: la etiqueta de la franja cerrada,
// el texto según el estado, el formulario y "Tu reseña". En qué estado está
// cada pedido lo dice estadoDeResena (src/lib/resenas.js), la misma regla que
// vuelve a revisar el servidor al publicar (/api/resenas).

import { useState } from 'react'
import Link from 'next/link'
import AvatarApodo from '@/components/AvatarApodo'
import { RespuestaPublica } from '@/components/ListaResenas'
import { ElegirEstrellas, EstrellasFijas } from '@/components/Estrellas'
import { ETIQUETAS_MODERACION } from '@/lib/moderacion'
import {
  etiquetaEstrellas, textoDiasRestantes, largoTexto, limpiarTexto, moderarTextoResena,
  LARGO_MAXIMO_TEXTO_RESENA,
} from '@/lib/resenas'

const INTER = "'Inter', sans-serif"
const ESTILO_BOTON = { fontFamily: INTER, fontWeight: 500, fontSize: '14px', borderRadius: '4px', padding: '11px 24px' }

// "· Dejá tu reseña" (azul) o "· Reseñado" (verde), al final de la línea de
// la franja cerrada. Nada en los demás casos.
export function EtiquetaFranja({ estado }) {
  if (estado === 'puede') {
    return <span style={{ fontFamily: INTER, fontWeight: 600, color: '#4164fe' }}> · Dejá tu reseña</span>
  }
  if (estado === 'hecha') {
    return <span style={{ fontFamily: INTER, fontWeight: 500, color: '#2e6b4f' }}> · Reseñado</span>
  }
  return null
}

// El botón negro "Dejar reseña", para la fila de botones del pedido.
export function BotonDejarResena({ onClick }) {
  return (
    <button type="button" onClick={onClick}
      className="bg-[#0a0a0a] text-white border border-[#0a0a0a] hover:bg-transparent hover:text-[#0a0a0a] transition-colors cursor-pointer"
      style={ESTILO_BOTON}>
      Dejar reseña
    </button>
  )
}

// El texto gris debajo de los botones, según el estado. null si no va nada.
export function TextoEstadoResena({ estado }) {
  let texto = null
  if (estado.estado === 'puede') {
    texto = estado.via === '14_dias'
      ? 'La tienda todavía no lo marcó como entregado, pero ya pasaron 14 días: podés contar cómo te fue.'
      : textoDiasRestantes(estado.diasRestantes)
  } else if (estado.estado === 'todavia_no') {
    texto = 'Vas a poder dejar tu reseña cuando la tienda lo marque como entregado.'
  } else if (estado.estado === 'vencida') {
    texto = 'Ya pasaron los 30 días para dejar una reseña de este pedido.'
  }
  if (!texto) return null
  return <p className="m-0 mt-2 text-xs text-[#0a0a0a]/50 font-light leading-relaxed">{texto}</p>
}

// Lo que dejó quien compró, con la respuesta de la tienda si se ve. Una
// oculta por la moderación lo dice (y no muestra la respuesta).
export function TuResena({ resena, apodo, tienda }) {
  const oculta = resena.estado === 'oculta_por_moderacion'
  return (
    <div className="mt-4 pt-4 border-t border-[#0a0a0a]/5">
      <p className="m-0 mb-2 text-[10px] uppercase tracking-[2px] text-[#0a0a0a]/40" style={{ fontFamily: INTER, fontWeight: 600 }}>Tu reseña</p>
      <EstrellasFijas valor={resena.estrellas} tamano={16} />
      <p className="m-0 mt-1.5 text-xs text-[#0a0a0a]/50 font-light">Firmada como {apodo || 'tu apodo'}</p>
      {resena.texto && (
        <p className="m-0 mt-2 text-sm text-[#0a0a0a]/80 font-light leading-relaxed whitespace-pre-line break-words">{resena.texto}</p>
      )}
      {!oculta && resena.respuesta && <RespuestaPublica tienda={tienda} respuesta={resena.respuesta} />}
      <p className={`m-0 mt-3 text-xs font-light leading-relaxed ${oculta ? 'text-[#8a3410]' : 'text-[#0a0a0a]/45'}`}>
        {oculta
          ? `No se muestra en la página de ${tienda} porque no cumple las reglas de las reseñas.`
          : `Ya está publicada en la página de ${tienda}. No se puede editar.`}
      </p>
    </div>
  )
}

// Lo que encontró el filtro: el mismo cartel que en el alta de productos.
// explicacion: el texto de arriba de la lista (reseñas o respuestas).
export function CartelBloqueo({ bloqueos, explicacion = 'Las reseñas no pueden tener datos de contacto ni insultos. Sacá esto de tu comentario:' }) {
  return (
    <div role="alert" className="mt-3 p-3.5 bg-red-50 border border-red-200 rounded-lg text-red-800">
      <p className="m-0 font-semibold text-[0.92rem]">No vas a poder publicar con esto</p>
      <p className="mt-1 mb-2.5 text-sm">
        {explicacion}
      </p>
      <ul className="m-0 pl-5 text-sm">
        {bloqueos.map((b, i) => (
          <li key={i} className="mb-0.5">
            {ETIQUETAS_MODERACION[b.tipo] || b.tipo}
            {b.tipo !== 'lenguaje_ofensivo' && <span className="text-red-700"> — &quot;{b.texto}&quot;</span>}
          </li>
        ))}
      </ul>
    </div>
  )
}

// El formulario, desplegado dentro del pedido.
//   onPublicada(resena)  la reseña quedó guardada (también si ya existía)
//   onCerrar()           "Ahora no"
export function FormularioResena({ pedidoId, tienda, apodo, via, onPublicada, onCerrar }) {
  const [estrellas, setEstrellas] = useState(0)
  const [texto, setTexto] = useState('')
  const [enviando, setEnviando] = useState(false)
  const [error, setError] = useState('')
  const [bloqueos, setBloqueos] = useState(null)

  const largo = largoTexto(texto)
  const largoDeMas = largo > LARGO_MAXIMO_TEXTO_RESENA
  const idEstrellas = `resena-${pedidoId}-estrellas`
  const idTexto = `resena-${pedidoId}-texto`

  async function publicar() {
    if (!estrellas || enviando || largoDeMas) return
    setError('')
    setBloqueos(null)
    const comentario = limpiarTexto(texto)

    // Aviso rápido antes de ir al servidor; el que decide es /api/resenas.
    const revision = moderarTextoResena(comentario)
    if (revision.nivel === 'bloqueo') { setBloqueos(revision.bloqueos); return }

    setEnviando(true)
    try {
      const res = await fetch('/api/resenas', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ pedido_id: pedidoId, estrellas, texto: comentario }),
      })
      const datos = await res.json().catch(() => null)
      if (res.ok && datos?.resena) { onPublicada(datos.resena); return }
      // Ya había una (otro clic, otra pestaña): se muestra esa.
      if (res.status === 409 && datos?.resena) { onPublicada(datos.resena); return }
      if (res.status === 422 && datos?.moderacion?.bloqueos) {
        setBloqueos(datos.moderacion.bloqueos)
      } else {
        setError(datos?.error || 'No pudimos publicar tu reseña. Probá de nuevo en un rato.')
      }
    } catch {
      setError('No pudimos conectarnos. Revisá tu conexión y probá de nuevo.')
    }
    setEnviando(false)
  }

  return (
    <div className="mt-4 border border-[#0a0a0a]/10 rounded-xl p-4 md:p-5">
      <h3 className="m-0 text-[20px] leading-snug" style={{ fontFamily: 'Fraunces, serif', fontWeight: 500, color: '#0a0a0a' }}>
        ¿Cómo te fue comprando en {tienda}?
      </h3>
      <p className="m-0 mt-1.5 text-sm text-[#0a0a0a]/50 font-light leading-relaxed">
        Contá cómo fue la atención, si el producto era como se mostraba y si la entrega salió bien.
      </p>

      {via === '14_dias' && (
        <p className="m-0 mt-3 text-sm leading-relaxed rounded-lg px-3.5 py-3 text-[#5c4a00] bg-[#fff6d6] border border-[#f0dfa0] font-light">
          La tienda todavía no marcó este pedido como entregado. Si ya lo tenés, contá cómo te fue. Si todavía no te llegó, también podés decirlo acá, o escribirle con «Reclamar».
        </p>
      )}

      <div className="mt-4">
        <span id={idEstrellas} className="sr-only">Cuántas estrellas le das</span>
        <ElegirEstrellas valor={estrellas} onCambiar={setEstrellas} idEtiqueta={idEstrellas} />
        <p className="m-0 mt-1.5 text-xs font-light text-[#0a0a0a]/50" aria-live="polite">
          {estrellas ? etiquetaEstrellas(estrellas) : 'Elegí de 1 a 5 estrellas'}
        </p>
      </div>

      <div className="mt-4">
        <label htmlFor={idTexto} className="block text-sm text-[#0a0a0a]/60 font-light mb-1.5">Un comentario, si querés (opcional)</label>
        <textarea id={idTexto} value={texto} onChange={(e) => setTexto(e.target.value)} rows={4}
          placeholder="Por ejemplo: cómo te atendieron, cómo llegó, si lo recomendarías."
          className="w-full px-4 py-3 rounded-xl border border-[#0a0a0a]/10 text-sm text-[#0a0a0a] focus:outline-none focus:border-[#4164fe]/60 transition bg-white font-[inherit] resize-y" />
        <p className={`m-0 mt-1 text-right text-xs tabular-nums ${largoDeMas ? 'text-[#dc2626]' : 'text-[#0a0a0a]/40'}`}>
          {largo} / {LARGO_MAXIMO_TEXTO_RESENA}
        </p>
        {bloqueos && <CartelBloqueo bloqueos={bloqueos} />}
      </div>

      <div className="mt-4 flex items-center gap-3 rounded-lg bg-[#f6f3ee] px-3.5 py-3">
        <AvatarApodo apodo={apodo} tamano={28} />
        <p className="m-0 text-xs text-[#0a0a0a]/65 font-light leading-relaxed">
          Se publica firmada como <strong className="font-semibold text-[#0a0a0a]">{apodo || 'tu apodo'}</strong>, no con tu nombre. Una vez publicada no se puede editar ni borrar.
        </p>
      </div>
      <p className="m-0 mt-2">
        <Link href="/resenas" target="_blank" className="text-xs text-[#0a0a0a]/45 font-light underline underline-offset-2 hover:text-[#0a0a0a]/70">
          Cómo funcionan las reseñas
        </Link>
      </p>

      {error && <p className="m-0 mt-3 text-sm text-[#dc2626] font-light leading-relaxed">{error}</p>}

      <div className="mt-4 flex flex-wrap items-center gap-4">
        <button type="button" onClick={publicar} disabled={!estrellas || enviando || largoDeMas}
          className="bg-[#0a0a0a] text-white border border-[#0a0a0a] hover:bg-transparent hover:text-[#0a0a0a] transition-colors cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:bg-[#0a0a0a] disabled:hover:text-white"
          style={ESTILO_BOTON}>
          {enviando ? 'Publicando…' : 'Publicar reseña'}
        </button>
        <button type="button" onClick={onCerrar} disabled={enviando}
          className="text-sm text-[#0a0a0a]/45 font-light bg-transparent border-none p-0 cursor-pointer hover:text-[#0a0a0a]/70 underline underline-offset-2">
          Ahora no
        </button>
      </div>
    </div>
  )
}
