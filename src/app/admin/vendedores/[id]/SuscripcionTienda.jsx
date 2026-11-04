'use client'

// La suscripción al plan de una tienda (migración 048), en la ficha del admin,
// después de «Plan». Va por /api/admin/vendedores/[id]/suscripcion.
//
// Muestra la suscripción viva (o la última), sus cobros y los pagos de la
// diferencia de un plan a medida, con los avisos (un monto nuevo que Mercado
// Pago no aceptó, una tienda de $0 que sigue pagando). Botones: sincronizar
// con Mercado Pago (también con la suscripción cancelada), cancelar (con confirmación en el mismo recuadro) y
// reintentar el monto nuevo.

import { useCallback, useEffect, useState } from 'react'
import { textoPrecio } from '@/lib/planes'

const VERDE = '#015444'
const ROJO = '#a01020'
const ETIQUETA = { fontSize: '11.5px', color: 'rgba(10,10,10,0.5)' }
const TEXTO = { fontSize: '12.5px', fontWeight: 300, color: 'rgba(10,10,10,0.6)' }
const BOTON = { fontFamily: "'Inter', sans-serif", fontSize: '12px', fontWeight: 500, borderRadius: '4px', padding: '8px 16px', cursor: 'pointer' }

const FECHA = new Intl.DateTimeFormat('es-AR', { day: 'numeric', month: 'numeric', year: '2-digit', timeZone: 'America/Argentina/Buenos_Aires' })
const fecha = (iso) => (iso ? FECHA.format(new Date(iso)) : '—')

const ESTADOS = {
  creando: 'creándose',
  pending: 'esperando el pago',
  authorized: 'activa',
  paused: 'pausada',
  cancelled: 'cancelada',
  error: 'no se pudo crear',
}
const VIVAS = ['creando', 'pending', 'authorized', 'paused']

// { datos } o { error }. Nunca lanza.
async function leer(vendedorId) {
  try {
    const res = await fetch(`/api/admin/vendedores/${vendedorId}/suscripcion`, { cache: 'no-store' })
    const d = await res.json().catch(() => ({}))
    return res.ok ? { datos: d } : { error: d.error || 'No pudimos cargar la suscripción.' }
  } catch {
    return { error: 'No pudimos cargar la suscripción.' }
  }
}

export default function SuscripcionTienda({ vendedorId }) {
  const [datos, setDatos] = useState(null)
  const [error, setError] = useState('')
  const [ocupado, setOcupado] = useState('')
  const [confirmando, setConfirmando] = useState(false)

  const aplicar = useCallback((leido) => {
    if (leido.error) setError(leido.error)
    else setDatos(leido.datos)
  }, [])
  const cargar = useCallback(async () => aplicar(await leer(vendedorId)), [aplicar, vendedorId])

  useEffect(() => {
    let vigente = true
    leer(vendedorId).then((leido) => { if (vigente) aplicar(leido) })
    return () => { vigente = false }
  }, [aplicar, vendedorId])

  async function hacer(accion) {
    setOcupado(accion)
    setError('')
    try {
      const res = await fetch(`/api/admin/vendedores/${vendedorId}/suscripcion`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ accion }),
      })
      const d = await res.json().catch(() => ({}))
      if (!res.ok) setError(d.error || 'No se pudo.')
      setConfirmando(false)
      await cargar()
    } catch {
      setError('No se pudo.')
    } finally {
      setOcupado('')
    }
  }

  if (!datos) {
    return <p className="m-0" style={{ ...TEXTO, padding: '14px 0', color: error ? ROJO : TEXTO.color }}>{error || 'Cargando…'}</p>
  }

  const { suscripciones, cobros, diferencias, avisos } = datos
  const actual = suscripciones.find((s) => VIVAS.includes(s.estado)) || suscripciones[0] || null
  const viva = actual && VIVAS.includes(actual.estado)
  // Sincronizar sirve también con la suscripción cancelada: un reembolso de
  // su cobro se ve leyendo el pago.
  const sincronizable = suscripciones.some((s) => s.mp_preapproval_id)
  const cobrosDeActual = actual ? cobros.filter((c) => c.suscripcion_id === actual.id) : []

  return (
    <div className="flex flex-col" style={{ gap: '12px', padding: '14px 0' }}>
      {avisos.map((a, i) => (
        <p key={i} className="m-0" style={{ fontSize: '12.5px', lineHeight: 1.5, color: ROJO, backgroundColor: 'rgba(160,16,32,0.06)', borderRadius: '6px', padding: '8px 12px' }}>
          {a.texto}
        </p>
      ))}

      {!actual ? (
        <p className="m-0" style={TEXTO}>Sin suscripción.</p>
      ) : (
        <div className="flex flex-col" style={{ gap: '4px' }}>
          <span style={{ fontSize: '14px', fontWeight: 500, color: '#0a0a0a' }}>
            {textoPrecio(actual.monto)} por mes · {ESTADOS[actual.estado] || actual.estado}
          </span>
          <span style={TEXTO}>
            Desde el {fecha(actual.creada_en)}
            {actual.pagado_hasta ? ` · pagado hasta el ${fecha(actual.pagado_hasta)}` : ''}
            {actual.estado === 'authorized' && actual.proximo_cobro_en ? ` · próximo cobro el ${fecha(actual.proximo_cobro_en)}` : ''}
            {actual.cancelada_en ? ` · cancelada el ${fecha(actual.cancelada_en)}` : ''}
          </span>
          <span style={{ ...TEXTO, fontSize: '11.5px' }}>
            Mercado Pago: {actual.mp_preapproval_id || '—'} · paga con {actual.payer_email || '—'} · consultada el {fecha(actual.consultada_en)}
          </span>
        </div>
      )}

      {cobrosDeActual.length > 0 && (
        <div className="flex flex-col" style={{ gap: '2px' }}>
          <span style={ETIQUETA}>Cobros</span>
          {cobrosDeActual.map((c) => (
            <span key={c.id} style={TEXTO}>
              {fecha(c.cobrado_en)} · {c.monto !== null ? textoPrecio(c.monto) : '—'} · {c.estado_pago || c.estado_cobro || '—'} · pago {c.mp_pago_id || '—'}
            </span>
          ))}
        </div>
      )}

      {suscripciones.some((s) => s.estado === 'error') && (
        <div className="flex flex-col" style={{ gap: '2px' }}>
          <span style={ETIQUETA}>Altas que Mercado Pago rechazó</span>
          {suscripciones.filter((s) => s.estado === 'error').map((s) => (
            <span key={s.id} style={TEXTO}>
              {fecha(s.creada_en)} · {textoPrecio(s.monto)} · {s.payer_email || '—'} · {s.error_mp || 'sin el motivo (anterior a la 049)'}
            </span>
          ))}
        </div>
      )}

      {diferencias.length > 0 && (
        <div className="flex flex-col" style={{ gap: '2px' }}>
          <span style={ETIQUETA}>Diferencias del plan a medida</span>
          {diferencias.map((d) => (
            <span key={d.id} style={TEXTO}>
              {fecha(d.creada_en)} · {textoPrecio(d.monto_anterior)} → {textoPrecio(d.precio_nuevo)} · diferencia {textoPrecio(d.monto)} · {d.estado}
              {['pagada', 'sin_cobro'].includes(d.estado) ? (d.monto_mp_actualizado_en ? ' · monto cambiado en Mercado Pago' : ' · monto SIN cambiar en Mercado Pago') : ''}
            </span>
          ))}
        </div>
      )}

      {error && <p className="m-0" style={{ fontSize: '12.5px', color: ROJO }}>{error}</p>}

      {(viva || sincronizable) && (
        confirmando && viva ? (
          <div className="flex flex-col" style={{ gap: '8px', backgroundColor: '#f6f5f2', borderRadius: '6px', padding: '10px 12px' }}>
            <span style={{ fontSize: '12.5px', color: '#0a0a0a' }}>
              ¿Cancelar la suscripción en Mercado Pago? No vuelve a cobrar. La tienda conserva el plan hasta el {fecha(actual.pagado_hasta)}.
            </span>
            <div className="flex flex-wrap" style={{ gap: '8px' }}>
              <button type="button" disabled={!!ocupado} onClick={() => hacer('cancelar')} style={{ ...BOTON, border: 'none', backgroundColor: ROJO, color: '#ffffff' }}>
                {ocupado === 'cancelar' ? 'Cancelando…' : 'Sí, cancelar'}
              </button>
              <button type="button" onClick={() => setConfirmando(false)} style={{ ...BOTON, border: '1px solid rgba(10,10,10,0.15)', backgroundColor: '#ffffff', color: '#0a0a0a' }}>
                No
              </button>
            </div>
          </div>
        ) : (
          <div className="flex flex-wrap" style={{ gap: '8px' }}>
            <button type="button" disabled={!!ocupado} onClick={() => hacer('sincronizar')} style={{ ...BOTON, border: `1px solid ${VERDE}`, backgroundColor: '#ffffff', color: VERDE }}>
              {ocupado === 'sincronizar' ? 'Sincronizando…' : 'Sincronizar ahora'}
            </button>
            {viva && (
              <button type="button" disabled={!!ocupado} onClick={() => setConfirmando(true)} style={{ ...BOTON, border: `1px solid ${ROJO}`, backgroundColor: '#ffffff', color: ROJO }}>
                Cancelar en Mercado Pago
              </button>
            )}
            {avisos.some((a) => a.tipo === 'monto_sin_cambiar') && (
              <button type="button" disabled={!!ocupado} onClick={() => hacer('reintentar_monto')} style={{ ...BOTON, border: `1px solid ${VERDE}`, backgroundColor: '#ffffff', color: VERDE }}>
                {ocupado === 'reintentar_monto' ? 'Reintentando…' : 'Reintentar el monto'}
              </button>
            )}
          </div>
        )
      )}
    </div>
  )
}
