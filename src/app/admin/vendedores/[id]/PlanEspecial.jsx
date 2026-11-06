'use client'

// El plan de una tienda y sus condiciones especiales (migración 046), en la
// ficha del admin. Sigue el mockup aprobado (mockup-tanda-f1.html, «Admin ·
// Plan de una tienda») y el armado de ComisionEspecial. Va por
// /api/admin/vendedores/[id]/plan.
//
// Los atajos salen del Básico (atajosEspecial): bloques de tope y precio por
// 2 y por 3, y la tienda propia (sin tope, $0). Un plan a medida con precio
// exige la suscripción al día por ese precio (048): la sección «Suscripción»
// de la ficha la muestra.

import { useEffect, useState } from 'react'
import { MAX_MOTIVO_PLAN, atajosEspecial, planesAsignables, textoPrecio } from '@/lib/planes'

const VERDE = '#015444'
const ROJO = '#a01020'

const ETIQUETA = { fontSize: '11.5px', color: 'rgba(10,10,10,0.5)' }
const AYUDA = { fontSize: '11px', fontWeight: 300, lineHeight: 1.45, color: 'rgba(10,10,10,0.4)' }
const SUBTITULO = { fontSize: '13px', fontWeight: 600, color: '#0a0a0a' }
const CAMPO = { border: '1px solid rgba(10,10,10,0.12)', borderRadius: '8px', backgroundColor: '#ffffff' }
const ENTRADA = { fontFamily: "'Inter', sans-serif", fontSize: '13px', border: 'none', outline: 'none', background: 'transparent', color: '#0a0a0a' }
const BOTON = { fontFamily: "'Inter', sans-serif", fontSize: '12px', fontWeight: 500, borderRadius: '4px', padding: '8px 16px' }

const FECHA = new Intl.DateTimeFormat('es-AR', { day: 'numeric', month: 'numeric', timeZone: 'America/Argentina/Buenos_Aires' })
const fecha = (iso) => (iso ? FECHA.format(new Date(iso)) : '')

function textoUso(plan) {
  return plan.sinTope ? `${plan.usados} productos` : `${plan.usados} de ${plan.tope} productos`
}

function textoPrecioEspecial(especial, plan) {
  if (especial.precio_especial === null) {
    return Number.isInteger(plan.precio) ? `${textoPrecio(plan.precio)} por mes (el del plan)` : 'El precio del plan'
  }
  if (especial.precio_especial === 0) return '$0 · sin abono'
  return `${textoPrecio(especial.precio_especial)} por mes`
}

function Vigente({ plan, especial, onQuitar }) {
  const [confirmando, setConfirmando] = useState(false)
  const [quitando, setQuitando] = useState(false)
  const [error, setError] = useState('')

  async function quitar() {
    setQuitando(true)
    setError('')
    const mensaje = await onQuitar()
    if (mensaje) setError(mensaje)
    setQuitando(false)
  }

  const titulo = plan.sinTope ? `Sin tope · ${plan.nombre} sin tope` : `Plan a medida · ${plan.nombre} con ${plan.tope} productos`
  const cambiado = especial.actualizado_en ? ` · cambiado el ${fecha(especial.actualizado_en)}` : ''

  return (
    <div className="flex flex-col" style={{ gap: '14px' }}>
      <div className="flex items-start flex-wrap" style={{ gap: '16px' }}>
        <span style={{ fontFamily: 'Fraunces, serif', fontWeight: 500, fontSize: '34px', lineHeight: 1, color: VERDE, fontVariantNumeric: 'tabular-nums' }}>
          {plan.sinTope ? '∞' : plan.tope}
        </span>
        <div className="flex flex-col flex-1" style={{ gap: '3px', minWidth: '180px' }}>
          <span style={{ fontSize: '14px', fontWeight: 500, color: '#0a0a0a' }}>{titulo}</span>
          <span style={{ fontSize: '12.5px', fontWeight: 300, color: 'rgba(10,10,10,0.5)' }}>
            {textoPrecioEspecial(especial, plan)} · {textoUso(plan)}
          </span>
          <span style={{ fontSize: '12.5px', fontWeight: 300, color: 'rgba(10,10,10,0.5)' }}>
            Desde el {fecha(especial.creado_en)}{especial.porVos ? ', cargado por vos' : ''}{cambiado}
          </span>
        </div>
      </div>

      <div style={{ backgroundColor: '#f6f5f2', borderRadius: '6px', padding: '9px 12px' }}>
        <p className="m-0" style={{ fontSize: '10px', fontWeight: 500, textTransform: 'uppercase', letterSpacing: '0.5px', color: 'rgba(10,10,10,0.4)', marginBottom: '2px' }}>
          Motivo · no lo ve la tienda
        </p>
        <p className="m-0" style={{ fontSize: '12.5px', fontWeight: 300, lineHeight: 1.5, color: 'rgba(10,10,10,0.7)', whiteSpace: 'pre-wrap' }}>{especial.motivo}</p>
      </div>

      {confirmando ? (
        <div className="flex flex-col" style={{ gap: '10px', backgroundColor: '#fce4e4', borderRadius: '6px', padding: '12px', fontSize: '12.5px', lineHeight: 1.5, color: '#7a0f1c' }}>
          <span>
            {plan.origen === 'especial' && Number(plan.precio) > 0
              // Un plan a medida que está pagando (050).
              ? '¿Quitar el plan a medida? Su suscripción baja al precio del Básico en Mercado Pago y se pausan los productos que pasen del tope del Básico (los primeros que cargó quedan publicados). Lo ya cobrado no se devuelve solo.'
              : '¿Quitar las condiciones especiales? Vuelve al plan Gratis. Si queda por encima del tope, no se pausa nada, pero no puede sumar productos.'}
          </span>
          {error && <span style={{ fontWeight: 500 }}>{error}</span>}
          <div className="flex items-center flex-wrap" style={{ gap: '12px' }}>
            <button type="button" onClick={quitar} disabled={quitando}
              style={{ ...BOTON, color: '#ffffff', backgroundColor: '#cc152b', border: '1px solid #cc152b', cursor: quitando ? 'default' : 'pointer' }}>
              {quitando ? 'Quitando...' : 'Sí, quitarlas'}
            </button>
            <button type="button" onClick={() => { setConfirmando(false); setError('') }} disabled={quitando}
              style={{ ...BOTON, fontWeight: 400, padding: 0, color: 'rgba(10,10,10,0.45)', background: 'none', border: 'none', cursor: 'pointer' }}>
              Cancelar
            </button>
          </div>
        </div>
      ) : (
        <div>
          <button type="button" onClick={() => setConfirmando(true)}
            style={{ ...BOTON, color: '#0a0a0a', backgroundColor: '#ffffff', border: '1px solid #0a0a0a', cursor: 'pointer' }}>
            Quitar condiciones
          </button>
        </div>
      )}
    </div>
  )
}

// Lo que muestra el formulario: la condición vigente, o el Básico vacío.
function formularioDe(especial, asignables) {
  if (especial) {
    return {
      plan_clave: especial.plan_clave,
      tope_productos: especial.tope_productos === null ? '' : String(especial.tope_productos),
      sin_tope: especial.sin_tope === true,
      precio_especial: especial.precio_especial === null ? '' : especial.precio_especial.toLocaleString('es-AR'),
      motivo: especial.motivo || '',
    }
  }
  const basico = asignables.find((p) => p.clave === 'basico') || asignables[0]
  return { plan_clave: basico?.clave || '', tope_productos: '', sin_tope: false, precio_especial: '', motivo: '' }
}

function Formulario({ vendedorId, especial, planes, onGuardado }) {
  const asignables = planesAsignables(planes)
  const atajos = atajosEspecial(planes)
  const [form, setForm] = useState(() => formularioDe(especial, asignables))
  const [guardando, setGuardando] = useState(false)
  const [error, setError] = useState('')
  const cambiar = (campo, valor) => { setForm((f) => ({ ...f, [campo]: valor })); setError('') }

  function usarAtajo(a) {
    setForm((f) => ({
      ...f,
      plan_clave: a.plan_clave,
      tope_productos: a.tope_productos === null ? '' : String(a.tope_productos),
      sin_tope: a.sin_tope,
      precio_especial: a.precio_especial.toLocaleString('es-AR'),
    }))
    setError('')
  }

  async function guardar(e) {
    e.preventDefault()
    setGuardando(true)
    setError('')
    try {
      const res = await fetch(`/api/admin/vendedores/${vendedorId}/plan`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
      })
      const datos = await res.json().catch(() => ({}))
      if (!res.ok) { setError(datos.error || 'No pudimos guardar las condiciones.'); return }
      await onGuardado('Condiciones guardadas.')
    } catch {
      setError('No nos pudimos conectar con el servidor. Probá de nuevo.')
    } finally {
      setGuardando(false)
    }
  }

  return (
    <form onSubmit={guardar} className="flex flex-col" style={{ gap: '12px', borderTop: '1px solid rgba(10,10,10,0.05)', paddingTop: '16px' }}>
      <p className="m-0" style={SUBTITULO}>{especial ? 'Cambiar condiciones' : 'Cargar condiciones especiales'}</p>

      {atajos.length > 0 && (
        <div className="flex items-center flex-wrap" style={{ gap: '8px' }}>
          <span style={{ fontSize: '11.5px', color: 'rgba(10,10,10,0.45)', marginRight: '2px' }}>Atajos</span>
          {atajos.map((a) => (
            <button key={a.etiqueta} type="button" onClick={() => usarAtajo(a)}
              className="rounded-full cursor-pointer transition-colors bg-white text-[#015444] hover:bg-[#015444] hover:text-[#9cc3ea]"
              style={{ fontFamily: "'Inter', sans-serif", fontSize: '12px', fontWeight: 500, padding: '6px 12px', border: `1px solid ${VERDE}` }}>
              {a.etiqueta}
            </button>
          ))}
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-3" style={{ gap: '12px' }}>
        <div className="flex flex-col min-w-0" style={{ gap: '5px' }}>
          <label htmlFor="plan-clave" style={ETIQUETA}>Plan</label>
          <select id="plan-clave" value={form.plan_clave} onChange={(e) => cambiar('plan_clave', e.target.value)}
            style={{ ...CAMPO, ...ENTRADA, height: '38px', padding: '0 10px', border: CAMPO.border, backgroundColor: '#ffffff' }}>
            {asignables.map((p) => <option key={p.clave} value={p.clave}>{p.nombre}</option>)}
          </select>
          <span style={AYUDA}>Solo planes con topes cargados.</span>
        </div>

        <div className="flex flex-col min-w-0" style={{ gap: '5px' }}>
          <label htmlFor="plan-tope" style={ETIQUETA}>Tope de productos</label>
          <div className="flex items-center" style={{ ...CAMPO, padding: '0 10px', height: '38px', opacity: form.sin_tope ? 0.4 : 1 }}>
            <input id="plan-tope" inputMode="numeric" value={form.sin_tope ? '' : form.tope_productos} disabled={form.sin_tope}
              onChange={(e) => cambiar('tope_productos', e.target.value)} className="w-full min-w-0" style={ENTRADA} />
          </div>
          <label className="flex items-center" style={{ gap: '6px', fontSize: '12px', color: 'rgba(10,10,10,0.6)' }}>
            <input type="checkbox" checked={form.sin_tope} onChange={(e) => cambiar('sin_tope', e.target.checked)} />
            Sin tope
          </label>
          <span style={AYUDA}>Vacío = el del plan.</span>
        </div>

        <div className="flex flex-col min-w-0" style={{ gap: '5px' }}>
          <label htmlFor="plan-precio" style={ETIQUETA}>Precio por mes</label>
          <div className="flex items-center" style={{ ...CAMPO, padding: '0 10px', height: '38px', gap: '6px' }}>
            <span style={{ fontSize: '13px', color: 'rgba(10,10,10,0.4)' }}>$</span>
            <input id="plan-precio" inputMode="numeric" value={form.precio_especial}
              onChange={(e) => cambiar('precio_especial', e.target.value)} className="w-full min-w-0" style={ENTRADA} />
          </div>
          <span style={AYUDA}>0 = sin abono. Vacío = el del plan. Todavía no se cobra: llega con las suscripciones.</span>
        </div>
      </div>

      <div className="flex flex-col min-w-0" style={{ gap: '5px' }}>
        <label htmlFor="plan-motivo" style={ETIQUETA}>Motivo</label>
        <textarea id="plan-motivo" value={form.motivo} maxLength={MAX_MOTIVO_PLAN} rows={3}
          onChange={(e) => cambiar('motivo', e.target.value)} className="w-full"
          style={{ ...CAMPO, fontFamily: "'Inter', sans-serif", fontSize: '13px', fontWeight: 300, padding: '9px 11px', resize: 'vertical', outline: 'none', color: '#0a0a0a' }} />
        <span style={AYUDA}>Para vos. La tienda no lo ve.</span>
      </div>

      {error && <p className="m-0" role="alert" style={{ fontSize: '12.5px', color: ROJO }}>{error}</p>}

      <div>
        <button type="submit" disabled={guardando}
          style={{ ...BOTON, color: '#ffffff', backgroundColor: guardando ? 'rgba(10,10,10,0.2)' : '#0a0a0a', border: 'none', cursor: guardando ? 'default' : 'pointer' }}>
          {guardando ? 'Guardando...' : 'Guardar condiciones'}
        </button>
      </div>
    </form>
  )
}

// { datos } o { error }. Nunca lanza.
async function leerPlan(vendedorId) {
  try {
    const res = await fetch(`/api/admin/vendedores/${vendedorId}/plan`)
    const datos = await res.json().catch(() => ({}))
    if (!res.ok) return { error: datos.error || 'No pudimos cargar el plan de la tienda.' }
    return { datos }
  } catch {
    return { error: 'No pudimos cargar el plan de la tienda.' }
  }
}

export default function PlanEspecial({ vendedorId }) {
  // datos: null mientras carga. Si una recarga falla, queda lo que había.
  const [{ datos, error }, setEstado] = useState({ datos: null, error: '' })
  const [aviso, setAviso] = useState('')
  // Para que el formulario arranque de nuevo con lo guardado.
  const [vuelta, setVuelta] = useState(0)

  function aplicar(leido) {
    setEstado((previo) => (leido.error ? { datos: previo.datos, error: leido.error } : { datos: leido.datos, error: '' }))
  }

  useEffect(() => {
    let vigente = true
    leerPlan(vendedorId).then((leido) => { if (vigente) aplicar(leido) })
    return () => { vigente = false }
  }, [vendedorId])

  async function recargar(mensaje) {
    const leido = await leerPlan(vendedorId)
    aplicar(leido)
    if (!leido.error) {
      setVuelta((v) => v + 1)
      setAviso(mensaje || '')
    }
  }

  // Devuelve el error para mostrar, o null si salió bien.
  async function quitar() {
    try {
      const res = await fetch(`/api/admin/vendedores/${vendedorId}/plan`, { method: 'DELETE' })
      const datosRes = await res.json().catch(() => ({}))
      if (!res.ok) return datosRes.error || 'No pudimos quitar las condiciones.'
      await recargar('Listo. Vuelve al plan Gratis.')
      return null
    } catch {
      return 'No nos pudimos conectar con el servidor. Probá de nuevo.'
    }
  }

  const contenedor = { padding: '14px 0', fontFamily: "'Inter', sans-serif" }

  if (datos === null) {
    return error ? (
      <div className="flex flex-col items-start" style={{ ...contenedor, gap: '10px' }}>
        <p className="m-0" style={{ fontSize: '12.5px', color: ROJO }}>{error}</p>
        <button type="button" onClick={() => recargar()}
          style={{ ...BOTON, color: '#0a0a0a', backgroundColor: '#ffffff', border: '1px solid #0a0a0a', cursor: 'pointer' }}>
          Reintentar
        </button>
      </div>
    ) : (
      <p className="m-0" style={{ ...contenedor, fontSize: '12.5px', fontWeight: 300, color: 'rgba(10,10,10,0.4)' }}>Cargando...</p>
    )
  }

  const { plan, especial, planes } = datos

  return (
    <div className="flex flex-col" style={{ ...contenedor, gap: '18px' }}>
      {especial ? (
        <Vigente key={`v-${vuelta}`} plan={plan} especial={especial} onQuitar={quitar} />
      ) : (
        <p className="m-0" style={{ fontSize: '13.5px', fontWeight: 300, lineHeight: 1.55, color: 'rgba(10,10,10,0.6)' }}>
          Sin condiciones especiales. Rige el plan <b style={{ fontWeight: 500, color: '#0a0a0a' }}>{plan.nombre}</b>:{' '}
          <b style={{ fontWeight: 500, color: '#0a0a0a' }}>{textoUso(plan)}</b>.
        </p>
      )}

      {aviso && <p className="m-0" role="status" style={{ fontSize: '12.5px', color: VERDE }}>{aviso}</p>}

      <Formulario key={`f-${vuelta}`} vendedorId={vendedorId} especial={especial} planes={planes} onGuardado={recargar} />

      {error && <p className="m-0" style={{ fontSize: '12.5px', color: ROJO }}>{error}</p>}
    </div>
  )
}
