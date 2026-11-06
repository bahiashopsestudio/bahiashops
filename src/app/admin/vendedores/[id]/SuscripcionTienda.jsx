'use client'

// La suscripción al plan de una tienda (migración 048), en la ficha del admin,
// después de «Plan». Sigue el mockup de F3.2 (mockup-tanda-f3-2.html, «Admin ·
// Suscripción»). Va por /api/admin/vendedores/[id]/suscripcion.
//
//   · Arriba, el aviso amarillo si tiene condiciones de $0 y sigue pagando, y
//     los del monto que Mercado Pago no aceptó.
//   · El monto en grande y la pastilla de estado (Al día, Esperando el pago,
//     Diferencia sin pagar, Cancelada), con tres datos en fila.
//   · Una sola tabla «Cobros» con los de todas sus suscripciones y los pagos
//     de la diferencia (filasDeCobros).
//   · En la gracia de un cobro rechazado (050): la pastilla ámbar «En gracia
//     hasta el 14/12» y el dato «Cobro rechazado»; en la tabla, en rojo.
//   · «Caídas del plan» (050): fecha, motivo, cuántos se pausaron y cuándo
//     se restauraron (o si falta cancelar en Mercado Pago).
//   · Plegados: «Datos de Mercado Pago» y «Altas que Mercado Pago rechazó».
//   · Sincronizar ahora, Cancelar en Mercado Pago (con confirmación en el
//     mismo recuadro, como «Quitar condiciones») y Reintentar el monto.

import { useCallback, useEffect, useState } from 'react'
import { textoPrecio } from '@/lib/planes'
import { esViva, filasDeCobros, pastillaDeLaFicha, seCancelaSola, suscripcionDeLaFicha } from '@/lib/suscripciones'

const VERDE = '#015444'
const ROJO = '#cc152b'
const TEXTO = { fontSize: '13.5px', fontWeight: 300, lineHeight: 1.55, color: 'rgba(10,10,10,0.6)' }
const RELLENO = { padding: '14px 0' }
const BOTON = { fontFamily: "'Inter', sans-serif", fontSize: '12px', fontWeight: 500, borderRadius: '4px', padding: '8px 16px', cursor: 'pointer' }
const PEQUENA = { fontSize: '10.5px', textTransform: 'uppercase', letterSpacing: '0.5px', color: 'rgba(10,10,10,0.4)', fontWeight: 500 }
const PASTILLAS = {
  ok: { backgroundColor: '#d1fae5', color: '#047857' },
  espera: { backgroundColor: '#fef3c7', color: '#92650a' },
  gris: { backgroundColor: '#f1efe9', color: 'rgba(10,10,10,0.55)' },
}
const TONOS = { ok: '#047857', espera: '#92650a', no: ROJO, gris: 'rgba(10,10,10,0.5)' }

const FECHA = new Intl.DateTimeFormat('es-AR', { day: 'numeric', month: 'numeric', year: '2-digit', timeZone: 'America/Argentina/Buenos_Aires' })
const HORA = new Intl.DateTimeFormat('es-AR', { day: 'numeric', month: 'numeric', year: '2-digit', hour: '2-digit', minute: '2-digit', timeZone: 'America/Argentina/Buenos_Aires' })
const fecha = (iso) => (iso ? FECHA.format(new Date(iso)) : '—')
const fechaCorta = (iso) => (iso ? new Intl.DateTimeFormat('es-AR', { day: 'numeric', month: 'numeric', timeZone: 'America/Argentina/Buenos_Aires' }).format(new Date(iso)) : '')

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

// El plan que rige, en una línea.
function textoDelPlan(plan) {
  if (!plan?.nombre) return '—'
  if (plan.origen === 'especial') return plan.precio === 0 ? `${plan.nombre} a medida ($0)` : `${plan.nombre} a medida`
  return plan.nombre
}

// Una caída del plan (050), en una línea: «14/12/26 · falta de pago · 15
// pausados · restaurados el 20/12/26».
const MOTIVOS = {
  falta_de_pago: 'falta de pago',
  baja: 'baja',
  devolucion: 'cobro devuelto',
  condiciones_quitadas: 'condiciones quitadas',
}
function textoDeCaida(c) {
  const partes = [fecha(c.cayo_en)]
  partes.push(c.motivo === 'condiciones_quitadas' && c.tope_antes && c.tope_despues
    ? `condiciones quitadas (a medida ${c.tope_antes} → ${c.tope_despues})`
    : `${MOTIVOS[c.motivo] || c.motivo}${c.a_medida ? ' (a medida)' : ''}`)
  partes.push(c.pausados === 1 ? '1 pausado' : `${c.pausados || 0} pausados`)
  if (c.reemplazada_por) partes.push('la reemplazó otra caída')
  else if (c.restaurada_en) partes.push(`restaurados el ${fecha(c.restaurada_en)}`)
  if (c.motivo === 'falta_de_pago' && !c.restaurada_en) {
    partes.push(c.mp_cancelada_en ? `cancelada en Mercado Pago el ${fecha(c.mp_cancelada_en)}` : 'sin cancelar en Mercado Pago')
  }
  return partes.join(' · ')
}

// Los tres datos de arriba, según el estado.
function datosDeArriba(actual, { plan, diferenciaPendiente, diferenciaSinPagar, ahora }) {
  if (actual.estado === 'pending' || actual.estado === 'creando') {
    return [['Pedida', fecha(actual.creada_en)], ['Se cancela sola', fecha(seCancelaSola(actual))], ['Plan', textoDelPlan(plan)]]
  }
  if (actual.estado === 'cancelled') {
    const conDias = Date.parse(actual.pagado_hasta ?? '') > ahora
    return [
      ['Cancelada el', fecha(actual.cancelada_en)],
      ['Pagado hasta', fecha(actual.pagado_hasta)],
      ['Plan', conDias ? `${plan?.nombre || '—'} hasta el ${fechaCorta(actual.pagado_hasta)}` : textoDelPlan(plan)],
    ]
  }
  // En la gracia de un cobro rechazado (050).
  if (actual.cobro_fallido_desde && (actual.estado === 'authorized' || actual.estado === 'paused')) {
    return [['Pagado hasta', fecha(actual.pagado_hasta)], ['Cobro rechazado', fecha(actual.cobro_fallido_desde)], ['Plan', textoDelPlan(plan)]]
  }
  if (diferenciaSinPagar) {
    return [
      ['Pagado hasta', fecha(actual.pagado_hasta)],
      ['Diferencia', diferenciaPendiente ? `${textoPrecio(diferenciaPendiente.monto)}, pedida el ${fechaCorta(diferenciaPendiente.creada_en)}` : 'Sin pedir'],
      ['Plan', `${textoDelPlan(plan)} (a medida pendiente)`],
    ]
  }
  return [['Pagado hasta', fecha(actual.pagado_hasta)], ['Próximo cobro', fecha(actual.proximo_cobro_en)], ['Plan', textoDelPlan(plan)]]
}

export default function SuscripcionTienda({ vendedorId }) {
  const [datos, setDatos] = useState(null)
  const [errorCarga, setErrorCarga] = useState('')
  const [error, setError] = useState('')
  const [hecho, setHecho] = useState('')
  const [ocupado, setOcupado] = useState('')
  const [confirmando, setConfirmando] = useState(false)

  const aplicar = useCallback((leido) => {
    if (leido.error) setErrorCarga(leido.error)
    else { setErrorCarga(''); setDatos({ ...leido.datos, leidoEn: Date.now() }) }
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
    setHecho('')
    try {
      const res = await fetch(`/api/admin/vendedores/${vendedorId}/suscripcion`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ accion }),
      })
      const d = await res.json().catch(() => ({}))
      if (!res.ok) setError(d.error || 'No se pudo.')
      else setHecho({ sincronizar: 'Sincronizado con Mercado Pago.', cancelar: 'Cancelada en Mercado Pago.', reintentar_monto: 'Mercado Pago aceptó el monto.' }[accion] || '')
      setConfirmando(false)
      await cargar()
    } catch {
      setError('No se pudo.')
    } finally {
      setOcupado('')
    }
  }

  if (!datos) {
    return errorCarga ? (
      <p className="m-0" style={{ ...TEXTO, ...RELLENO, color: ROJO }}>
        {errorCarga}{' '}
        <button type="button" onClick={cargar} style={{ ...BOTON, padding: 0, border: 'none', background: 'none', color: ROJO, textDecoration: 'underline' }}>Probar de nuevo</button>
      </p>
    ) : <p className="m-0" style={{ ...TEXTO, ...RELLENO }}>Cargando…</p>
  }

  const { suscripciones, cobros, diferencias, avisos, plan } = datos
  const actual = suscripcionDeLaFicha(suscripciones)
  const viva = actual && esViva(actual.estado)
  const rechazadas = suscripciones.filter((s) => s.estado === 'error')
  // Sincronizar sirve también con la suscripción cancelada: un reembolso de
  // su cobro se ve leyendo el pago.
  const sincronizable = suscripciones.some((s) => s.mp_preapproval_id)
  const pendiente = plan?.especialPendiente
  const diferenciaSinPagar = actual?.estado === 'authorized' && !!pendiente && Number(pendiente.precio) > Number(actual.monto)
  const diferenciaPendiente = diferencias.find((d) => d.estado === 'pendiente') || null
  const pastilla = pastillaDeLaFicha(actual, { diferenciaSinPagar, ahoraMs: datos.leidoEn })
  const caidas = datos.caidas || []
  const filas = filasDeCobros({ cobros, diferencias })
  const avisoPagaSinPrecio = avisos.find((a) => a.tipo === 'paga_sin_precio')
  const avisosMonto = avisos.filter((a) => a.tipo !== 'paga_sin_precio')

  return (
    <div className="flex flex-col" style={{ gap: '16px', padding: '16px 0' }}>
      {avisoPagaSinPrecio && (
        <p className="m-0" style={{ backgroundColor: '#fef3c7', color: '#92650a', borderRadius: '6px', padding: '9px 12px', fontSize: '12px', lineHeight: 1.5 }}>{avisoPagaSinPrecio.texto}</p>
      )}
      {avisosMonto.map((a, i) => (
        <p key={i} className="m-0" style={{ fontSize: '12px', lineHeight: 1.5, color: '#7a0f1c', backgroundColor: '#fce4e4', borderRadius: '6px', padding: '9px 12px' }}>{a.texto}</p>
      ))}

      {!actual ? (
        <p className="m-0" style={TEXTO}>Sin suscripción. Rige el plan <b style={{ fontWeight: 500, color: '#0a0a0a' }}>{textoDelPlan(plan)}</b>.</p>
      ) : (
        <>
          <div className="flex justify-between items-baseline flex-wrap" style={{ gap: '10px' }}>
            <span style={{ fontFamily: 'Fraunces, serif', fontWeight: 500, fontSize: '26px', lineHeight: 1.1, color: actual.estado === 'cancelled' ? TEXTO.color : VERDE, fontVariantNumeric: 'tabular-nums' }}>
              {textoPrecio(actual.monto)} por mes{diferenciaSinPagar ? ` → ${textoPrecio(pendiente.precio)}` : ''}
            </span>
            {pastilla && (
              <span style={{ fontSize: '10.5px', fontWeight: 600, borderRadius: '999px', padding: '3px 9px', ...PASTILLAS[pastilla.tono] }}>
                {pastilla.hasta ? `${pastilla.texto} hasta el ${fechaCorta(pastilla.hasta)}` : pastilla.texto}
              </span>
            )}
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-3" style={{ gap: '12px' }}>
            {datosDeArriba(actual, { plan, diferenciaPendiente, diferenciaSinPagar, ahora: datos.leidoEn }).map(([titulo, valor]) => (
              <div key={titulo} className="flex flex-col min-w-0" style={{ gap: '2px' }}>
                <small style={PEQUENA}>{titulo}</small>
                <span style={{ fontSize: '13.5px', color: '#0a0a0a', fontVariantNumeric: 'tabular-nums', overflowWrap: 'anywhere' }}>{valor}</span>
              </div>
            ))}
          </div>
        </>
      )}

      {filas.length > 0 && (
        <div className="overflow-x-auto">
          <table style={{ borderCollapse: 'collapse', width: '100%', fontSize: '12.5px', minWidth: '420px' }}>
            <caption style={{ ...PEQUENA, textAlign: 'left', paddingBottom: '6px' }}>Cobros</caption>
            <thead>
              <tr>
                {['Fecha', 'Monto', 'Estado', 'Suscripción'].map((t, i) => (
                  <th key={t} style={{ textAlign: 'left', fontWeight: 500, color: 'rgba(10,10,10,0.45)', padding: i === 0 ? '6px 8px 6px 0' : '6px 8px', borderBottom: '1px solid rgba(10,10,10,0.08)' }}>{t}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filas.map((f) => (
                <tr key={f.clave}>
                  <td style={{ padding: '7px 8px 7px 0', borderBottom: '1px solid rgba(10,10,10,0.05)', fontVariantNumeric: 'tabular-nums' }}>{fecha(f.fecha)}</td>
                  <td style={{ padding: '7px 8px', borderBottom: '1px solid rgba(10,10,10,0.05)', fontVariantNumeric: 'tabular-nums' }}>{f.monto !== null ? textoPrecio(f.monto) : '—'}</td>
                  <td style={{ padding: '7px 8px', borderBottom: '1px solid rgba(10,10,10,0.05)', fontWeight: 500, color: TONOS[f.estado.tono] }}>{f.estado.texto}</td>
                  <td style={{ padding: '7px 8px', borderBottom: '1px solid rgba(10,10,10,0.05)' }}>{f.suscripcion}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {caidas.length > 0 && (
        <div className="flex flex-col" style={{ gap: '4px', fontSize: '12.5px', lineHeight: 1.5, color: 'rgba(10,10,10,0.65)' }}>
          <small style={PEQUENA}>Caídas del plan</small>
          {caidas.map((c) => <span key={c.id}>{textoDeCaida(c)}</span>)}
        </div>
      )}

      {(actual || rechazadas.length > 0) && (
        <div className="flex flex-col" style={{ gap: '6px', fontSize: '11.5px', lineHeight: 1.6, color: 'rgba(10,10,10,0.4)', overflowWrap: 'anywhere' }}>
          {actual && (
            <details>
              <summary className="cursor-pointer" style={{ color: 'rgba(10,10,10,0.55)' }}>Datos de Mercado Pago</summary>
              Suscripción #{actual.id} · {actual.mp_preapproval_id || 'sin id de Mercado Pago'} · paga con {actual.payer_email || '—'}
              {' '}· consultada el {actual.consultada_en ? HORA.format(new Date(actual.consultada_en)) : '—'}
            </details>
          )}
          {rechazadas.length > 0 && (
            <details>
              <summary className="cursor-pointer" style={{ color: 'rgba(10,10,10,0.55)' }}>Altas que Mercado Pago rechazó ({rechazadas.length})</summary>
              {rechazadas.map((s) => (
                <span key={s.id} className="block">
                  {fecha(s.creada_en)} · {textoPrecio(s.monto)} · {s.payer_email || '—'} · {s.error_mp || 'sin el motivo (anterior a la 049)'}
                </span>
              ))}
            </details>
          )}
        </div>
      )}

      {error && <p className="m-0" role="alert" style={{ fontSize: '12.5px', color: ROJO }}>{error}</p>}
      {hecho && !error && <p className="m-0" role="status" style={{ fontSize: '12.5px', color: VERDE }}>{hecho}</p>}

      {(viva || sincronizable) && (
        confirmando && viva ? (
          <div className="flex flex-col" style={{ gap: '10px', backgroundColor: '#fce4e4', borderRadius: '6px', padding: '12px', fontSize: '12.5px', lineHeight: 1.5, color: '#7a0f1c' }}>
            <span>
              ¿Cancelar la suscripción en Mercado Pago? No se le cobra más.
              {actual.pagado_hasta && Date.parse(actual.pagado_hasta) > datos.leidoEn
                ? ` Conserva el plan hasta el ${fechaCorta(actual.pagado_hasta)}. Lo ya cobrado no se devuelve solo.`
                : ' Todavía no pagó: sigue en el plan Gratis.'}
            </span>
            <div className="flex items-center flex-wrap" style={{ gap: '12px' }}>
              <button type="button" disabled={!!ocupado} onClick={() => hacer('cancelar')}
                style={{ ...BOTON, color: '#ffffff', backgroundColor: ROJO, border: `1px solid ${ROJO}`, cursor: ocupado ? 'default' : 'pointer' }}>
                {ocupado === 'cancelar' ? 'Cancelando…' : 'Sí, cancelar'}
              </button>
              <button type="button" disabled={!!ocupado} onClick={() => setConfirmando(false)}
                style={{ ...BOTON, fontWeight: 400, padding: 0, color: 'rgba(10,10,10,0.45)', background: 'none', border: 'none' }}>
                Volver
              </button>
            </div>
          </div>
        ) : (
          <div className="flex flex-wrap items-center" style={{ gap: '10px' }}>
            {sincronizable && (
              <button type="button" disabled={!!ocupado} onClick={() => hacer('sincronizar')}
                style={{ ...BOTON, border: '1px solid #0a0a0a', backgroundColor: '#ffffff', color: '#0a0a0a' }}>
                {ocupado === 'sincronizar' ? 'Sincronizando…' : 'Sincronizar ahora'}
              </button>
            )}
            {viva && (
              <button type="button" disabled={!!ocupado} onClick={() => { setConfirmando(true); setHecho('') }}
                style={{ ...BOTON, border: `1px solid ${ROJO}`, backgroundColor: '#ffffff', color: ROJO }}>
                Cancelar en Mercado Pago
              </button>
            )}
            {avisos.some((a) => a.tipo === 'monto_sin_cambiar') && (
              <button type="button" disabled={!!ocupado} onClick={() => hacer('reintentar_monto')}
                style={{ ...BOTON, border: `1px solid ${VERDE}`, backgroundColor: '#ffffff', color: VERDE }}>
                {ocupado === 'reintentar_monto' ? 'Reintentando…' : 'Reintentar el monto'}
              </button>
            )}
          </div>
        )
      )}
    </div>
  )
}
