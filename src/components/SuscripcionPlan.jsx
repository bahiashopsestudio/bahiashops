'use client'

// La suscripción al plan dentro de «Tu plan» (Mi negocio), migración 048.
// Solo para las tiendas habilitadas (SUSCRIPCIONES_TIENDAS): es la versión
// mínima de F3.1 para la prueba real; las pantallas del mockup llegan en F3.2.
// Va por /api/vendedor/suscripcion.
//
// Estados:
//   · puede suscribirse: «Pasarme al Básico» (o «Suscribirme por $X» con un
//     plan a medida), con el mail de su cuenta de Mercado Pago, y a pagar;
//   · esperando el pago: «Seguir con el pago» o cancelarla;
//   · volvió de Mercado Pago (?suscripcion=volvio o ?diferencia=volvio):
//     «Estamos confirmando tu pago…», consultando cada 5 segundos un minuto;
//   · activa: el monto y el próximo cobro;
//   · plan a medida con el Básico ya pagado: «Para activarlo hoy, pagá la
//     diferencia de este mes: $X».
// onCambio: para que la página vuelva a leer el plan cuando cambia.

import { useCallback, useEffect, useRef, useState } from 'react'
import { textoPrecio } from '@/lib/planes'

const VERDE = '#015444'
const ROJO = '#a01020'
const FECHA = new Intl.DateTimeFormat('es-AR', { day: 'numeric', month: 'numeric', timeZone: 'America/Argentina/Buenos_Aires' })
const fecha = (iso) => (iso ? FECHA.format(new Date(iso)) : '')

const CAJA = { backgroundColor: '#f6f5f2', borderRadius: '10px', padding: '12px 14px', fontSize: '13px', lineHeight: 1.55, color: 'rgba(10,10,10,0.7)' }
const BOTON = { fontFamily: 'Poppins, sans-serif', fontSize: '13px', fontWeight: 500, borderRadius: '999px', padding: '8px 16px', border: 'none', cursor: 'pointer', backgroundColor: VERDE, color: '#ffffff' }
const LINK = { background: 'none', border: 'none', padding: 0, cursor: 'pointer', color: VERDE, fontWeight: 500, textDecoration: 'underline', textUnderlineOffset: '2px', fontSize: '13px' }

const CONSULTAR_CADA_MS = 5000
const CONSULTAR_DURANTE_MS = 60000

export default function SuscripcionPlan({ onCambio }) {
  const [datos, setDatos] = useState(null)
  const [error, setError] = useState('')
  const [ocupado, setOcupado] = useState(false)
  const [pidiendoMail, setPidiendoMail] = useState(false)
  const [email, setEmail] = useState('')
  const [confirmando, setConfirmando] = useState(false)
  const ultimaFirma = useRef('')

  const cargar = useCallback(async () => {
    try {
      const res = await fetch('/api/vendedor/suscripcion', { cache: 'no-store' })
      const d = await res.json().catch(() => ({}))
      if (!res.ok) { setError(d.error || 'No pudimos cargar tu suscripción.'); return null }
      setDatos(d)
      setEmail((actual) => actual || d.email || '')
      // Si cambió el estado o la acción, el plan también puede haber cambiado.
      // planCambio: la ruta acaba de traer (o devolver) un cobro, aunque sea la
      // primera lectura (la página leyó el plan antes).
      const firma = JSON.stringify([d.suscripcion?.estado, d.suscripcion?.pagadoHasta, d.accion?.tipo, d.accion?.monto])
      if (d.planCambio || (ultimaFirma.current && firma !== ultimaFirma.current)) onCambio?.()
      ultimaFirma.current = firma
      return d
    } catch {
      setError('No pudimos cargar tu suscripción.')
      return null
    }
  }, [onCambio])

  // Al volver de Mercado Pago: consultar un rato hasta que se confirme.
  useEffect(() => {
    let vivo = true
    let reloj = null
    const params = new URLSearchParams(window.location.search)
    const volvio = params.get('suscripcion') === 'volvio' || params.get('diferencia') === 'volvio'
    if (volvio) {
      params.delete('suscripcion')
      params.delete('diferencia')
      const resto = params.toString()
      window.history.replaceState(null, '', window.location.pathname + (resto ? `?${resto}` : ''))
    }

    const inicio = Date.now()
    async function consultar() {
      const d = await cargar()
      if (!vivo || !volvio) return
      const listo = d?.suscripcion?.estado === 'authorized' && d?.accion?.tipo !== 'suscribirse' && d?.accion?.tipo !== 'diferencia'
      if (listo || Date.now() - inicio > CONSULTAR_DURANTE_MS) { setConfirmando(false); return }
      setConfirmando(true)
      reloj = setTimeout(consultar, CONSULTAR_CADA_MS)
    }
    consultar()
    return () => { vivo = false; clearTimeout(reloj) }
  }, [cargar])

  async function pedir(metodo, cuerpo) {
    setOcupado(true)
    setError('')
    try {
      const res = await fetch('/api/vendedor/suscripcion', {
        method: metodo,
        headers: { 'Content-Type': 'application/json' },
        body: cuerpo ? JSON.stringify(cuerpo) : undefined,
      })
      const d = await res.json().catch(() => ({}))
      if (!res.ok) { setError(d.error || 'No pudimos hacerlo. Probá de nuevo en un rato.'); return null }
      return d
    } catch {
      setError('No pudimos hacerlo. Probá de nuevo en un rato.')
      return null
    } finally {
      setOcupado(false)
    }
  }

  async function suscribirse(e) {
    e.preventDefault()
    const d = await pedir('POST', { accion: 'suscribirse', email })
    if (d?.initPoint) window.location.href = d.initPoint
  }

  async function pagarDiferencia() {
    const d = await pedir('POST', { accion: 'diferencia' })
    if (d?.initPoint) window.location.href = d.initPoint
    else if (d?.activada) { await cargar(); onCambio?.() }
  }

  async function cancelarPendiente() {
    const d = await pedir('DELETE')
    if (d?.ok) await cargar()
  }

  if (!datos) {
    return error ? <p className="m-0" style={{ fontSize: '12px', color: ROJO }}>{error}</p> : null
  }

  const sus = datos.suscripcion
  const accion = datos.accion
  const avisoError = error && <p className="m-0" style={{ fontSize: '12.5px', color: ROJO }}>{error}</p>

  if (confirmando) {
    return (
      <div style={CAJA}>
        <span>Estamos confirmando tu pago con Mercado Pago…</span>
      </div>
    )
  }

  // Una esperando el pago por otro monto (por ejemplo, la del Básico antes de
  // que se cargara un plan a medida) no tapa la que corresponde: se ofrece la
  // nueva, y al crearla se cancela la vieja.
  const pendienteVieja = sus?.estado === 'pending' && accion?.tipo === 'suscribirse' && Number(accion.monto) !== Number(sus.monto)

  if (sus?.estado === 'pending' && sus.initPoint && !pendienteVieja) {
    return (
      <div className="flex flex-col" style={{ ...CAJA, gap: '8px' }}>
        <span>Tu suscripción de {textoPrecio(sus.monto)} por mes está esperando el pago. Tu plan cambia cuando Mercado Pago lo confirme.</span>
        <div className="flex items-center flex-wrap" style={{ gap: '14px' }}>
          <a href={sus.initPoint} style={{ ...BOTON, textDecoration: 'none' }}>Seguir con el pago</a>
          <button type="button" onClick={cancelarPendiente} disabled={ocupado} style={LINK}>Cancelar</button>
        </div>
        {avisoError}
      </div>
    )
  }

  const activa = sus?.estado === 'authorized'
  return (
    <div className="flex flex-col" style={{ gap: '10px' }}>
      {activa && (
        <div style={CAJA}>
          <span>
            Tu suscripción: <b style={{ fontWeight: 600, color: '#0a0a0a' }}>{textoPrecio(sus.monto)} por mes</b>
            {sus.proximoCobro ? ` · próximo cobro el ${fecha(sus.proximoCobro)}` : ''}.
          </span>
        </div>
      )}

      {accion?.tipo === 'diferencia' && (
        <div className="flex flex-col" style={{ ...CAJA, gap: '8px' }}>
          <span>
            Tu plan a medida es de {textoPrecio(accion.precioNuevo)} por mes.{' '}
            {accion.sinCobro
              ? 'La diferencia de este mes es mínima: lo activamos sin cobrarte nada.'
              : `Para activarlo hoy, pagá la diferencia de este mes: ${textoPrecio(accion.monto)}.`}
            {accion.proximoCobro ? ` Desde el ${fecha(accion.proximoCobro)}, Mercado Pago te cobra ${textoPrecio(accion.precioNuevo)} por mes.` : ''}
          </span>
          <div>
            <button type="button" onClick={pagarDiferencia} disabled={ocupado} style={{ ...BOTON, opacity: ocupado ? 0.6 : 1 }}>
              {accion.sinCobro ? 'Activar mi plan a medida' : `Pagar ${textoPrecio(accion.monto)}`}
            </button>
          </div>
          {avisoError}
        </div>
      )}

      {accion?.tipo === 'suscribirse' && !pidiendoMail && (
        <div className="flex flex-col" style={{ gap: '6px' }}>
          <div>
            <button type="button" onClick={() => setPidiendoMail(true)} style={BOTON}>
              {accion.plan === 'basico' && !sus?.estado
                ? `Pasarme al ${accion.nombre} — ${textoPrecio(accion.monto)} por mes`
                : `Suscribirme por ${textoPrecio(accion.monto)} por mes`}
            </button>
          </div>
          {pendienteVieja && (
            <span style={{ fontSize: '12px', color: 'rgba(10,10,10,0.55)' }}>
              La suscripción de {textoPrecio(sus.monto)} que esperaba el pago se cancela al suscribirte.
            </span>
          )}
          {avisoError}
        </div>
      )}

      {accion?.tipo === 'suscribirse' && pidiendoMail && (
        <form onSubmit={suscribirse} className="flex flex-col" style={{ ...CAJA, gap: '8px' }}>
          <b style={{ fontWeight: 600, color: '#0a0a0a' }}>{accion.nombre} — {textoPrecio(accion.monto)} por mes</b>
          <label className="flex flex-col" style={{ gap: '4px' }}>
            <span style={{ fontSize: '12px', color: 'rgba(10,10,10,0.55)' }}>El mail de tu cuenta de Mercado Pago (con la que vas a pagar)</span>
            <input
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              style={{ fontSize: '14px', padding: '8px 10px', border: '1px solid rgba(10,10,10,0.15)', borderRadius: '8px', backgroundColor: '#ffffff' }}
            />
          </label>
          <span style={{ fontSize: '12px', color: 'rgba(10,10,10,0.55)' }}>
            Mercado Pago te cobra todos los meses. Tu plan cambia cuando se confirme el primer pago.
          </span>
          <div className="flex items-center flex-wrap" style={{ gap: '14px' }}>
            <button type="submit" disabled={ocupado} style={{ ...BOTON, opacity: ocupado ? 0.6 : 1 }}>
              {ocupado ? 'Yendo a Mercado Pago…' : 'Ir a Mercado Pago'}
            </button>
            <button type="button" onClick={() => setPidiendoMail(false)} style={LINK}>Volver</button>
          </div>
          {avisoError}
        </form>
      )}
    </div>
  )
}
