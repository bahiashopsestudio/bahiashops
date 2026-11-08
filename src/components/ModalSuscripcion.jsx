'use client'

// El alta de la suscripción al plan (F3.2, mockup-tanda-f3-2.html, «El alta»).
// Se abre desde «Tu plan» (Mi negocio), desde los carteles del tope y desde
// /vender. Va por /api/vendedor/suscripcion.
//
//   abierto   si se dibuja
//   onClose   la cruz, Escape o tocar afuera (no mientras abre Mercado Pago)
//   datos     lo de GET /api/vendedor/suscripcion, si ya lo tiene quien lo
//             abre; si no, lo pide al abrirse.
//
// Título «Pasarme al Básico» (o «Tu plan a medida»), el precio, las pastillas
// de lo que trae, el mail de la cuenta de Mercado Pago (cargado con el de la
// cuenta) y «Ir a Mercado Pago». Los errores de Mercado Pago llegan ya
// traducidos de la ruta (errorDeAltaRechazada): nunca el texto de Mercado
// Pago tal cual. Si el error es del mail, el campo va en rojo.

import { useCallback, useEffect, useId, useRef, useState } from 'react'
import Link from 'next/link'
import { cantidad, textoPrecio } from '@/lib/planes'

const VERDE = '#015444'
const ROJO = '#cc152b'
const ERROR_CARGA = 'No pudimos cargar tu plan. Probá de nuevo en un rato.'
const ERROR_RED = 'Mercado Pago no respondió. Probá de nuevo en unos minutos.'

export const BOTON_VERDE = {
  display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: '8px',
  backgroundColor: VERDE, color: '#ffffff', border: 'none', borderRadius: '999px', padding: '11px 20px',
  fontFamily: 'Poppins, sans-serif', fontSize: '13.5px', fontWeight: 500, cursor: 'pointer', whiteSpace: 'nowrap', textDecoration: 'none',
}

// El círculo que gira (quieto con «reducir movimiento»).
export function Ruedita() {
  return (
    <span aria-hidden="true" className="inline-block animate-spin motion-reduce:animate-none rounded-full shrink-0"
      style={{ width: '14px', height: '14px', border: '2px solid currentColor', borderRightColor: 'transparent' }} />
  )
}

// Las pastillas de lo que trae un plan: { tope, sinTope, fotos, carritos }.
export function pastillasDelPlan(trae) {
  if (!trae) return []
  return [
    trae.sinTope ? 'Productos sin tope' : trae.tope ? `Hasta ${cantidad(trae.tope, 'producto', 'productos')}` : null,
    trae.fotos ? `${cantidad(trae.fotos, 'foto', 'fotos')} por producto` : null,
    trae.carritos ? 'Carritos abandonados' : null,
  ].filter(Boolean)
}

// { datos } o { error }. Nunca lanza.
async function leer() {
  try {
    const res = await fetch('/api/vendedor/suscripcion', { cache: 'no-store' })
    const d = await res.json().catch(() => ({}))
    return res.ok ? { datos: d } : { error: d.error || ERROR_CARGA }
  } catch {
    return { error: ERROR_CARGA }
  }
}

export default function ModalSuscripcion({ abierto, onClose, datos }) {
  if (!abierto) return null
  return <Alta onClose={onClose} datosIniciales={datos} />
}

function Alta({ onClose, datosIniciales }) {
  const [leido, setLeido] = useState(datosIniciales ? { datos: datosIniciales } : null)
  const [email, setEmail] = useState(datosIniciales?.email || '')
  const [yendo, setYendo] = useState(false)
  const [error, setError] = useState(null) // { texto, campo }
  const idCampo = useId()
  const idError = useId()
  const idTitulo = useId()
  const campo = useRef(null)

  const aplicar = useCallback((r) => {
    setLeido(r)
    if (r.datos?.email) setEmail((actual) => actual || r.datos.email)
  }, [])

  useEffect(() => {
    if (datosIniciales) return undefined
    let vigente = true
    leer().then((r) => { if (vigente) aplicar(r) })
    return () => { vigente = false }
  }, [datosIniciales, aplicar])

  const cerrar = useCallback(() => { if (!yendo) onClose?.() }, [yendo, onClose])

  // Escape cierra; mientras está abierto la página de atrás no se mueve.
  useEffect(() => {
    const tecla = (e) => { if (e.key === 'Escape') cerrar() }
    document.addEventListener('keydown', tecla)
    const antes = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.removeEventListener('keydown', tecla)
      document.body.style.overflow = antes
    }
  }, [cerrar])

  // Con un error del mail, el foco va al campo cuando deja de estar desactivado.
  useEffect(() => {
    if (error?.campo === 'email' && !yendo) campo.current?.focus()
  }, [error, yendo])

  async function reintentarCarga() {
    setLeido(null)
    aplicar(await leer())
  }

  async function irAMercadoPago(e) {
    e.preventDefault()
    setYendo(true)
    setError(null)
    try {
      const res = await fetch('/api/vendedor/suscripcion', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ accion: 'suscribirse', email }),
      })
      const d = await res.json().catch(() => ({}))
      if (res.ok && d.initPoint) {
        // Sigue «Abriendo Mercado Pago…» hasta que el navegador se va.
        window.location.href = d.initPoint
        return
      }
      setError({ texto: d.error || ERROR_RED, campo: d.campo || null })
    } catch {
      setError({ texto: ERROR_RED, campo: null })
    }
    setYendo(false)
  }

  const accion = leido?.datos?.accion
  const puede = leido?.datos?.habilitada && accion?.tipo === 'suscribirse'
  // Después de una caída (050) es volver al plan que tenía: «Reactivar…». La
  // primera vez, «Pasarme al Básico» o «Tu plan a medida».
  const caida = leido?.datos?.caida
  const reactivar = !!caida && caida.motivo !== 'condiciones_quitadas'
  const titulo = !puede ? 'Tu plan'
    : reactivar ? (accion.medida ? 'Reactivar mi plan a medida' : `Reactivar mi plan ${accion.nombre || 'Básico'}`)
      : accion.medida ? 'Tu plan a medida' : `Pasarme al ${accion.nombre || 'Básico'}`
  const errorDelCampo = error?.campo === 'email'

  let cuerpo
  if (!leido) {
    cuerpo = (
      <p className="m-0 flex items-center" style={{ gap: '8px', fontSize: '13px', color: 'rgba(10,10,10,0.55)', padding: '12px 0' }}>
        <Ruedita /> Cargando…
      </p>
    )
  } else if (leido.error) {
    cuerpo = (
      <div className="flex flex-col" style={{ gap: '12px' }}>
        <p className="m-0" style={{ fontSize: '13px', color: ROJO }}>{leido.error}</p>
        <div><button type="button" onClick={reintentarCarga} style={BOTON_VERDE}>Probar de nuevo</button></div>
      </div>
    )
  } else if (!leido.datos.habilitada) {
    cuerpo = <p className="m-0" style={TEXTO}>Por ahora la suscripción no está disponible desde el panel. Escribinos y lo resolvemos.</p>
  } else if (!puede) {
    cuerpo = (
      <div className="flex flex-col" style={{ gap: '12px' }}>
        <p className="m-0" style={TEXTO}>
          {accion?.tipo === 'diferencia'
            ? 'Tu plan a medida se activa pagando la diferencia de este mes, desde «Tu plan» en Mi negocio.'
            : 'Tu plan ya está al día: no hay nada que pagar ahora.'}
        </p>
        <div><Link href="/vendedor/perfil" style={BOTON_VERDE} onClick={() => onClose?.()}>Ir a Mi negocio</Link></div>
      </div>
    )
  } else {
    const pastillas = pastillasDelPlan(accion.trae)
    cuerpo = (
      <form onSubmit={irAMercadoPago} className="flex flex-col" style={{ gap: '14px' }} noValidate>
        {pastillas.length > 0 && (
          <div className="flex flex-wrap" style={{ gap: '6px' }}>
            {pastillas.map((p) => (
              <span key={p} style={{ fontSize: '11.5px', fontWeight: 500, borderRadius: '999px', padding: '4px 10px', backgroundColor: '#e6f2ee', color: VERDE }}>{p}</span>
            ))}
          </div>
        )}
        <div>
          <label htmlFor={idCampo} style={{ display: 'block', fontSize: '12.5px', lineHeight: 1.4, color: 'rgba(10,10,10,0.65)', marginBottom: '6px' }}>
            El mail de tu cuenta de Mercado Pago, con la que vas a pagar
          </label>
          <input
            ref={campo}
            id={idCampo}
            type="email"
            inputMode="email"
            autoComplete="email"
            required
            value={email}
            disabled={yendo}
            onChange={(e) => { setEmail(e.target.value); if (errorDelCampo) setError(null) }}
            aria-invalid={errorDelCampo || undefined}
            aria-describedby={error ? idError : undefined}
            className="w-full outline-none focus:border-[#0a0a0a]"
            style={{
              height: '42px', padding: '0 12px', fontSize: '14px', color: '#0a0a0a', backgroundColor: '#ffffff', borderRadius: '10px',
              border: `1px solid ${errorDelCampo ? ROJO : 'rgba(10,10,10,0.12)'}`,
            }}
          />
          {error && <p id={idError} role="alert" className="m-0" style={{ color: ROJO, fontSize: '12px', marginTop: '6px', lineHeight: 1.45 }}>{error.texto}</p>}
        </div>
        <p className="m-0" style={{ fontFamily: 'Poppins, sans-serif', fontWeight: 300, fontSize: '12.5px', lineHeight: 1.55, color: 'rgba(10,10,10,0.6)' }}>
          Mercado Pago te cobra todos los meses. Tu plan cambia cuando se confirme el primer pago. Podés darte de baja cuando quieras y seguís con el plan hasta que termine el mes pago.
        </p>
        <button type="submit" disabled={yendo} style={{ ...BOTON_VERDE, width: '100%', padding: '13px 20px', opacity: yendo ? 0.55 : 1, cursor: yendo ? 'default' : 'pointer' }}>
          {yendo ? <><Ruedita />Abriendo Mercado Pago…</> : 'Ir a Mercado Pago'}
        </button>
        <p className="m-0 text-center" style={{ fontSize: '11.5px', color: 'rgba(10,10,10,0.45)', marginTop: '-4px' }}>
          El pago se hace en Mercado Pago. Bahía Shops no ve tu tarjeta.
        </p>
      </form>
    )
  }

  return (
    <>
      <link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Fraunces:opsz,wght@9..144,100..900&family=Poppins:wght@300;400;500&display=swap" />
      <div className="fixed inset-0 z-[950] flex items-center justify-center" style={{ padding: '16px', backgroundColor: 'rgba(10,10,10,0.45)' }} onClick={cerrar}>
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby={idTitulo}
          onClick={(e) => e.stopPropagation()}
          className="relative flex flex-col overflow-y-auto"
          style={{ backgroundColor: '#ffffff', borderRadius: '18px', width: '440px', maxWidth: '100%', maxHeight: 'calc(100dvh - 32px)', padding: '26px 24px 22px', gap: '14px', fontFamily: "'Inter', sans-serif" }}
        >
          <button type="button" onClick={cerrar} aria-label="Cerrar" disabled={yendo}
            className="absolute flex items-center justify-center rounded-full border-0 bg-transparent cursor-pointer hover:bg-[rgba(10,10,10,0.05)]"
            style={{ top: '14px', right: '14px', width: '30px', height: '30px', color: 'rgba(10,10,10,0.5)' }}>
            <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="2" style={{ width: '15px', height: '15px' }} aria-hidden="true">
              <path d="m5 5 10 10M15 5 5 15" />
            </svg>
          </button>
          <h3 id={idTitulo} className="m-0" style={{ fontFamily: 'Fraunces, serif', fontWeight: 500, fontSize: '22px', lineHeight: 1.2, color: '#0a0a0a', paddingRight: '30px', textWrap: 'balance' }}>
            {titulo}
          </h3>
          {puede && <p className="m-0" style={{ fontSize: '13px', color: 'rgba(10,10,10,0.5)', marginTop: '-6px' }}>{textoPrecio(accion.monto)} por mes</p>}
          {cuerpo}
        </div>
      </div>
    </>
  )
}

const TEXTO = { fontSize: '13.5px', lineHeight: 1.55, color: 'rgba(10,10,10,0.65)' }
