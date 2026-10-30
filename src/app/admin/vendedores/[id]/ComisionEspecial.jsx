'use client'

// La comisión especial de una tienda (migración 042), en la ficha del admin.
// Sigue el mockup aprobado (mockup-tanda-a2.html). Va por
// /api/admin/vendedores/[id]/comisiones: la vigente, cargar una nueva, terminarla
// y el historial.

import { useEffect, useState } from 'react'
import {
  MAX_MOTIVO_ESPECIAL, fechaDeComision, hoyEnArgentina, textoPorcentaje, ultimoDiaQueVale, venceEnDesdeDia,
} from '@/lib/comision'

const VERDE = '#015444'
const ROJO = '#a01020'

const ETIQUETA = { fontSize: '11.5px', color: 'rgba(10,10,10,0.5)' }
const AYUDA = { fontSize: '11px', fontWeight: 300, color: 'rgba(10,10,10,0.35)' }
const SUBTITULO = { fontSize: '13px', fontWeight: 600, color: '#0a0a0a' }
const CAMPO = { border: '1px solid rgba(10,10,10,0.12)', borderRadius: '8px', backgroundColor: '#ffffff' }
const BOTON = { fontFamily: "'Inter', sans-serif", fontSize: '12px', fontWeight: 500, borderRadius: '4px', padding: '8px 16px' }

const CHIPS = {
  vigente: { texto: 'Vigente', backgroundColor: '#d1fae5', color: '#047857' },
  vencida: { texto: 'Vencida', backgroundColor: '#f1efe9', color: 'rgba(10,10,10,0.5)' },
  terminada: { texto: 'Terminada', backgroundColor: '#fce4e4', color: ROJO },
}

function textoFechas(c) {
  const vence = c.vence_en ? `vence el ${ultimoDiaQueVale(c.vence_en)}` : 'sin vencimiento'
  return `Desde el ${fechaDeComision(c.desde)} · ${vence}`
}

function Vigente({ comision, onTerminar }) {
  const [confirmando, setConfirmando] = useState(false)
  const [terminando, setTerminando] = useState(false)
  const [error, setError] = useState('')
  const porcentaje = textoPorcentaje(comision.comision_bp)

  async function terminar() {
    setTerminando(true)
    setError('')
    const mensaje = await onTerminar(comision.id)
    // Si salió bien, este recuadro se va con la recarga de la sección.
    if (mensaje) setError(mensaje)
    setTerminando(false)
  }

  return (
    <div className="flex flex-col" style={{ gap: '14px' }}>
      <div className="flex items-start flex-wrap" style={{ gap: '18px' }}>
        <span style={{ fontFamily: 'Fraunces, serif', fontWeight: 500, fontSize: '40px', lineHeight: 1, color: VERDE }}>{porcentaje}</span>
        <div className="flex flex-col flex-1" style={{ gap: '4px', minWidth: '180px' }}>
          <span style={{ fontSize: '14px', fontWeight: 500, color: '#0a0a0a' }}>Comisión especial vigente</span>
          <span style={{ fontSize: '12.5px', fontWeight: 300, color: 'rgba(10,10,10,0.5)' }}>{textoFechas(comision)}</span>
          <span style={{ fontSize: '12.5px', fontWeight: 300, color: 'rgba(10,10,10,0.5)' }}>
            Mientras dure, en cada venta se cobra la más baja entre esta y la normal (5%, o 2,5% por su link).
          </span>
        </div>
      </div>

      <div style={{ backgroundColor: '#f6f5f2', borderRadius: '6px', padding: '9px 12px' }}>
        <p className="m-0" style={{ fontSize: '10px', fontWeight: 500, textTransform: 'uppercase', letterSpacing: '0.5px', color: 'rgba(10,10,10,0.4)', marginBottom: '2px' }}>
          Motivo · no lo ve la tienda
        </p>
        <p className="m-0" style={{ fontSize: '12.5px', fontWeight: 300, lineHeight: 1.5, color: 'rgba(10,10,10,0.7)', whiteSpace: 'pre-wrap' }}>{comision.motivo}</p>
      </div>

      {confirmando ? (
        <div className="flex flex-col" style={{ gap: '10px', backgroundColor: '#fce4e4', borderRadius: '6px', padding: '12px', fontSize: '12.5px', lineHeight: 1.5, color: '#7a0f1c' }}>
          <span>¿Terminar la comisión de {porcentaje}? Desde ahora cobra la normal: 5%, o 2,5% en las ventas por su link.</span>
          {error && <span style={{ fontWeight: 500 }}>{error}</span>}
          <div className="flex items-center flex-wrap" style={{ gap: '12px' }}>
            <button type="button" onClick={terminar} disabled={terminando}
              style={{ ...BOTON, color: '#ffffff', backgroundColor: '#cc152b', border: '1px solid #cc152b', cursor: terminando ? 'default' : 'pointer' }}>
              {terminando ? 'Terminando...' : 'Sí, terminarla'}
            </button>
            <button type="button" onClick={() => { setConfirmando(false); setError('') }} disabled={terminando}
              style={{ ...BOTON, fontWeight: 400, padding: 0, color: 'rgba(10,10,10,0.45)', background: 'none', border: 'none', cursor: 'pointer' }}>
              Cancelar
            </button>
          </div>
        </div>
      ) : (
        <div>
          <button type="button" onClick={() => setConfirmando(true)}
            style={{ ...BOTON, color: '#0a0a0a', backgroundColor: '#ffffff', border: '1px solid #0a0a0a', cursor: 'pointer' }}>
            Terminar ahora
          </button>
        </div>
      )}
    </div>
  )
}

function Formulario({ vendedorId, vigente, onCargada }) {
  const [porcentaje, setPorcentaje] = useState('')
  const [dia, setDia] = useState('')
  const [sinVencimiento, setSinVencimiento] = useState(false)
  const [motivo, setMotivo] = useState('')
  const [cargando, setCargando] = useState(false)
  const [error, setError] = useState('')

  async function cargar(e) {
    e.preventDefault()
    setError('')

    // La ruta toma una fecha vacía como "sin vencimiento": que sea a propósito.
    if (!sinVencimiento && !dia) {
      setError('Elegí la fecha de vencimiento o tildá «Sin vencimiento».')
      return
    }

    setCargando(true)
    try {
      const res = await fetch(`/api/admin/vendedores/${vendedorId}/comisiones`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ porcentaje, venceEn: sinVencimiento ? null : venceEnDesdeDia(dia), motivo }),
      })
      const datos = await res.json().catch(() => ({}))
      if (!res.ok) {
        setError(datos.error || 'No se pudo cargar la comisión.')
        return
      }
      setPorcentaje('')
      setDia('')
      setSinVencimiento(false)
      setMotivo('')
      await onCargada()
    } catch {
      setError('No nos pudimos conectar con el servidor. Probá de nuevo.')
    } finally {
      setCargando(false)
    }
  }

  return (
    <form onSubmit={cargar} className="flex flex-col" style={{ gap: '12px', borderTop: '1px solid rgba(10,10,10,0.05)', paddingTop: '16px' }}>
      <p className="m-0" style={SUBTITULO}>Cargar una comisión especial</p>

      {vigente && (
        <p className="m-0" style={{ fontSize: '12px', lineHeight: 1.5, color: '#92650a', backgroundColor: '#fef3c7', borderRadius: '6px', padding: '9px 12px' }}>
          Al cargarla, termina la de {textoPorcentaje(vigente.comision_bp)} que está vigente.
        </p>
      )}

      <div className="grid grid-cols-1 md:grid-cols-[140px_minmax(0,1fr)]" style={{ gap: '12px' }}>
        <div className="flex flex-col min-w-0" style={{ gap: '5px' }}>
          <label htmlFor="comision-porcentaje" style={ETIQUETA}>Porcentaje</label>
          <div className="flex items-center" style={{ ...CAMPO, padding: '0 10px', height: '38px' }}>
            <input
              id="comision-porcentaje"
              inputMode="decimal"
              value={porcentaje}
              onChange={(e) => setPorcentaje(e.target.value)}
              className="w-full min-w-0"
              style={{ fontFamily: "'Inter', sans-serif", fontSize: '13px', border: 'none', outline: 'none', background: 'transparent', color: '#0a0a0a' }}
            />
            <span style={{ fontSize: '13px', color: 'rgba(10,10,10,0.4)' }}>%</span>
          </div>
          <span style={AYUDA}>De 0 a 4,99</span>
        </div>

        <div className="flex flex-col min-w-0" style={{ gap: '5px' }}>
          <label htmlFor="comision-vence" style={ETIQUETA}>Vence</label>
          <div className="flex items-center" style={{ ...CAMPO, padding: '0 10px', height: '38px', opacity: sinVencimiento ? 0.4 : 1 }}>
            <input
              id="comision-vence"
              type="date"
              min={hoyEnArgentina()}
              value={dia}
              disabled={sinVencimiento}
              onChange={(e) => setDia(e.target.value)}
              className="w-full min-w-0"
              style={{ fontFamily: "'Inter', sans-serif", fontSize: '13px', border: 'none', outline: 'none', background: 'transparent', color: '#0a0a0a' }}
            />
          </div>
          <label className="flex items-center" style={{ gap: '6px', fontSize: '12px', color: 'rgba(10,10,10,0.6)' }}>
            <input type="checkbox" checked={sinVencimiento} onChange={(e) => setSinVencimiento(e.target.checked)} />
            Sin vencimiento
          </label>
          <span style={AYUDA}>{sinVencimiento ? 'Dura hasta que la termines.' : 'Vale todo ese día, hasta las 23:59.'}</span>
        </div>
      </div>

      <div className="flex flex-col min-w-0" style={{ gap: '5px' }}>
        <label htmlFor="comision-motivo" style={ETIQUETA}>Motivo</label>
        <textarea
          id="comision-motivo"
          value={motivo}
          maxLength={MAX_MOTIVO_ESPECIAL}
          onChange={(e) => setMotivo(e.target.value)}
          rows={3}
          className="w-full"
          style={{ ...CAMPO, fontFamily: "'Inter', sans-serif", fontSize: '13px', fontWeight: 300, padding: '9px 11px', resize: 'vertical', outline: 'none', color: '#0a0a0a' }}
        />
        <span style={AYUDA}>Para vos. La tienda no lo ve.</span>
      </div>

      {error && <p className="m-0" style={{ fontSize: '12.5px', color: ROJO }}>{error}</p>}

      <div>
        <button type="submit" disabled={cargando}
          style={{ ...BOTON, color: '#ffffff', backgroundColor: cargando ? 'rgba(10,10,10,0.2)' : '#0a0a0a', border: 'none', cursor: cargando ? 'default' : 'pointer' }}>
          {cargando ? 'Cargando...' : 'Cargar comisión'}
        </button>
      </div>
    </form>
  )
}

function Historial({ comisiones }) {
  return (
    <div style={{ borderTop: '1px solid rgba(10,10,10,0.05)', paddingTop: '14px' }}>
      <p className="m-0" style={{ ...SUBTITULO, marginBottom: '6px' }}>Historial</p>
      {comisiones.map((c, i) => {
        const chip = CHIPS[c.estado] || CHIPS.vencida
        return (
          <div key={c.id} className="grid items-baseline"
            style={{ gridTemplateColumns: '60px minmax(0, 1fr) auto', gap: '12px', padding: '10px 0', borderTop: i === 0 ? 'none' : '1px solid rgba(10,10,10,0.05)' }}>
            <span style={{ fontFamily: 'Fraunces, serif', fontWeight: 500, fontSize: '18px', color: '#0a0a0a' }}>{textoPorcentaje(c.comision_bp)}</span>
            <span className="min-w-0" style={{ fontSize: '12.5px', fontWeight: 300, lineHeight: 1.45, color: 'rgba(10,10,10,0.6)' }}>
              {textoFechas(c)}
              {c.estado === 'terminada' && c.terminada_en && (
                <span className="block" style={{ fontSize: '11.5px', color: 'rgba(10,10,10,0.4)' }}>Terminada el {fechaDeComision(c.terminada_en)}</span>
              )}
              <span className="block" style={{ fontSize: '11.5px', color: 'rgba(10,10,10,0.4)', whiteSpace: 'pre-wrap' }}>{c.motivo}</span>
            </span>
            <span className="rounded-full whitespace-nowrap" style={{ fontSize: '10px', fontWeight: 600, padding: '2px 8px', backgroundColor: chip.backgroundColor, color: chip.color }}>
              {chip.texto}
            </span>
          </div>
        )
      })}
    </div>
  )
}

// El historial: { comisiones } o { error }. Nunca lanza.
async function leerHistorial(vendedorId) {
  try {
    const res = await fetch(`/api/admin/vendedores/${vendedorId}/comisiones`)
    const datos = await res.json().catch(() => ({}))
    if (!res.ok) return { error: datos.error || 'No se pudo leer el historial.' }
    return { comisiones: datos.comisiones || [] }
  } catch {
    return { error: 'No se pudo leer el historial.' }
  }
}

export default function ComisionEspecial({ vendedorId }) {
  // comisiones: null mientras carga. Si una recarga falla, queda lo que había.
  const [{ comisiones, error }, setHistorial] = useState({ comisiones: null, error: '' })

  function aplicar(leido) {
    setHistorial((previo) => (leido.error
      ? { comisiones: previo.comisiones, error: leido.error }
      : { comisiones: leido.comisiones, error: '' }))
  }

  useEffect(() => {
    let vigenteElPedido = true
    leerHistorial(vendedorId).then((leido) => { if (vigenteElPedido) aplicar(leido) })
    return () => { vigenteElPedido = false }
  }, [vendedorId])

  async function recargar() {
    aplicar(await leerHistorial(vendedorId))
  }

  // Devuelve el error para mostrar, o null si salió bien.
  async function terminar(comisionId) {
    try {
      const res = await fetch(`/api/admin/vendedores/${vendedorId}/comisiones/${comisionId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ terminar: true }),
      })
      const datos = await res.json().catch(() => ({}))
      if (!res.ok) return datos.error || 'No se pudo terminar la comisión.'
      await recargar()
      return null
    } catch {
      return 'No nos pudimos conectar con el servidor. Probá de nuevo.'
    }
  }

  const contenedor = { padding: '14px 0', fontFamily: "'Inter', sans-serif" }

  if (comisiones === null) {
    return error
      ? <p className="m-0" style={{ ...contenedor, fontSize: '12.5px', color: ROJO }}>{error}</p>
      : <p className="m-0" style={{ ...contenedor, fontSize: '12.5px', fontWeight: 300, color: 'rgba(10,10,10,0.4)' }}>Cargando...</p>
  }

  const vigente = comisiones.find((c) => c.estado === 'vigente') || null

  return (
    <div className="flex flex-col" style={{ ...contenedor, gap: '18px' }}>
      {vigente ? (
        <Vigente key={vigente.id} comision={vigente} onTerminar={terminar} />
      ) : (
        <p className="m-0" style={{ fontSize: '13.5px', fontWeight: 300, lineHeight: 1.55, color: 'rgba(10,10,10,0.6)' }}>
          No tiene comisión especial. Cobra la normal: <b style={{ fontWeight: 500, color: '#0a0a0a' }}>5%</b>, o <b style={{ fontWeight: 500, color: '#0a0a0a' }}>2,5%</b> en las ventas que llegan por su link.
        </p>
      )}

      <Formulario vendedorId={vendedorId} vigente={vigente} onCargada={recargar} />

      {comisiones.length > 0 && <Historial comisiones={comisiones} />}

      {error && <p className="m-0" style={{ fontSize: '12.5px', color: ROJO }}>{error}</p>}
    </div>
  )
}
