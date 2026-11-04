'use client'

// Los planes (migración 046): precio por mes, tope de productos, fotos por
// producto, carritos abandonados y si se puede elegir. Sigue el mockup
// aprobado (mockup-tanda-f1.html, «Admin · Planes»). Va por /api/admin/planes:
// lo que se guarda se ve en /vender (revalidatePath) y en el panel de cada
// tienda.
//
// El Gratis vale siempre $0 y se puede elegir. El Pro no se edita todavía.
// En F5 se suma el «precio próximo con fecha» y el aviso a las suscriptas.

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'
import Navbar from '@/components/Navbar'
import { avisosDePlan, textoPrecio } from '@/lib/planes'

const ROJO = '#a01020'
const ETIQUETA = { fontSize: '11.5px', color: 'rgba(10,10,10,0.5)' }
const AYUDA = { fontSize: '11px', fontWeight: 300, lineHeight: 1.45, color: 'rgba(10,10,10,0.4)' }
const CAMPO = { border: '1px solid rgba(10,10,10,0.12)', borderRadius: '8px', backgroundColor: '#ffffff', height: '36px', padding: '0 10px' }
const ENTRADA = { fontFamily: "'Inter', sans-serif", fontSize: '13px', border: 'none', outline: 'none', background: 'transparent', color: '#0a0a0a' }
const BOTON = { fontFamily: "'Inter', sans-serif", fontSize: '12px', fontWeight: 500, borderRadius: '4px', padding: '8px 16px' }

const FECHA = new Intl.DateTimeFormat('es-AR', { day: 'numeric', month: 'numeric', timeZone: 'America/Argentina/Buenos_Aires' })

// Lo que se edita de un plan, como texto de los campos.
function formularioDe(plan) {
  return {
    precio_mensual: plan.precio_mensual === null ? '' : plan.precio_mensual.toLocaleString('es-AR'),
    tope_productos: plan.tope_productos === null ? '' : String(plan.tope_productos),
    fotos_por_producto: plan.fotos_por_producto === null ? '' : String(plan.fotos_por_producto),
    carritos_abandonados: plan.carritos_abandonados === true,
    disponible: plan.disponible === true,
  }
}

function Chip({ disponible }) {
  return (
    <span className="rounded-full whitespace-nowrap" style={{
      fontFamily: "'Inter', sans-serif", fontSize: '10px', fontWeight: 600, padding: '2px 8px',
      backgroundColor: disponible ? '#d1fae5' : '#f1efe9', color: disponible ? '#047857' : 'rgba(10,10,10,0.5)',
    }}>
      {disponible ? 'Se puede elegir' : 'No se puede elegir'}
    </span>
  )
}

function Campo({ id, etiqueta, valor, onCambiar, prefijo, deshabilitado }) {
  return (
    <div className="flex flex-col min-w-0" style={{ gap: '5px' }}>
      <label htmlFor={id} style={ETIQUETA}>{etiqueta}</label>
      <div className="flex items-center" style={{ ...CAMPO, gap: '6px', backgroundColor: deshabilitado ? '#f6f5f2' : '#ffffff' }}>
        {prefijo && <span style={{ fontSize: '13px', color: 'rgba(10,10,10,0.4)' }}>{prefijo}</span>}
        <input id={id} inputMode="numeric" value={valor} disabled={deshabilitado}
          onChange={(e) => onCambiar(e.target.value)} className="w-full min-w-0" style={ENTRADA} />
      </div>
    </div>
  )
}

function TarjetaPro({ plan }) {
  return (
    <div className="flex flex-col min-w-0" style={{ backgroundColor: '#ffffff', border: '1px solid rgba(10,10,10,0.06)', borderRadius: '8px', padding: '16px', gap: '12px' }}>
      <h2 className="flex items-center justify-between m-0" style={{ fontFamily: 'Fraunces, serif', fontWeight: 500, fontSize: '19px', gap: '8px', color: '#0a0a0a' }}>
        {plan.nombre} <Chip disponible={plan.disponible} />
      </h2>
      <div className="flex flex-col" style={{ gap: '5px' }}>
        <span style={ETIQUETA}>Precio por mes</span>
        <div className="flex items-center" style={{ ...CAMPO, backgroundColor: '#f6f5f2', fontSize: '13px', color: 'rgba(10,10,10,0.5)' }}>
          {plan.precio_mensual === null ? 'Próximamente' : textoPrecio(plan.precio_mensual)}
        </div>
      </div>
      <p className="m-0" style={AYUDA}>Se muestra en /vender como «Próximamente». Los topes se cargan cuando lo construyamos.</p>
    </div>
  )
}

function TarjetaPlan({ plan, onGuardado }) {
  const gratis = plan.clave === 'gratis'
  const [form, setForm] = useState(() => formularioDe(plan))
  const [guardando, setGuardando] = useState(false)
  const [error, setError] = useState('')
  const avisos = avisosDePlan(plan, form)
  const cambiar = (campo) => (valor) => { setForm((f) => ({ ...f, [campo]: valor })); setError('') }

  async function guardar() {
    setGuardando(true)
    setError('')
    try {
      const res = await fetch('/api/admin/planes', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ clave: plan.clave, ...form }),
      })
      const datos = await res.json().catch(() => ({}))
      if (!res.ok) { setError(datos.error || 'No pudimos guardar el plan.'); return }
      setForm(formularioDe(datos.plan))
      onGuardado(datos.plan)
    } catch {
      setError('No nos pudimos conectar con el servidor. Probá de nuevo.')
    } finally {
      setGuardando(false)
    }
  }

  return (
    <div className="flex flex-col min-w-0" style={{ backgroundColor: '#ffffff', border: '1px solid rgba(10,10,10,0.06)', borderRadius: '8px', padding: '16px', gap: '12px' }}>
      <h2 className="flex items-center justify-between m-0" style={{ fontFamily: 'Fraunces, serif', fontWeight: 500, fontSize: '19px', gap: '8px', color: '#0a0a0a' }}>
        {plan.nombre} <Chip disponible={form.disponible} />
      </h2>
      <Campo id={`precio-${plan.clave}`} etiqueta="Precio por mes" prefijo="$" valor={form.precio_mensual}
        onCambiar={cambiar('precio_mensual')} deshabilitado={gratis} />
      <Campo id={`tope-${plan.clave}`} etiqueta="Tope de productos" valor={form.tope_productos} onCambiar={cambiar('tope_productos')} />
      <Campo id={`fotos-${plan.clave}`} etiqueta="Fotos por producto" valor={form.fotos_por_producto} onCambiar={cambiar('fotos_por_producto')} />
      <label className="flex items-center" style={{ gap: '8px', fontSize: '12.5px', color: 'rgba(10,10,10,0.7)' }}>
        <input type="checkbox" checked={form.carritos_abandonados} onChange={(e) => cambiar('carritos_abandonados')(e.target.checked)} />
        Carritos abandonados
      </label>
      <label className="flex items-center" style={{ gap: '8px', fontSize: '12.5px', color: 'rgba(10,10,10,0.7)' }}>
        <input type="checkbox" checked={form.disponible} disabled={gratis} onChange={(e) => cambiar('disponible')(e.target.checked)} />
        Se puede elegir
      </label>
      {gratis && <p className="m-0" style={AYUDA}>El Gratis vale siempre $0 y se puede elegir: es el que rige si no hay otro.</p>}

      {avisos.map((aviso) => (
        <p key={aviso} className="m-0" style={{ backgroundColor: '#fef3c7', color: '#92650a', borderRadius: '6px', padding: '9px 12px', fontSize: '12px', lineHeight: 1.5 }}>
          {aviso}
        </p>
      ))}
      {error && <p className="m-0" role="alert" style={{ fontSize: '12.5px', lineHeight: 1.45, color: ROJO }}>{error}</p>}

      <div className="flex items-center justify-between flex-wrap" style={{ gap: '10px' }}>
        <span style={AYUDA}>{plan.actualizado_en ? `Actualizado el ${FECHA.format(new Date(plan.actualizado_en))}` : ''}</span>
        <button type="button" onClick={guardar} disabled={guardando}
          style={{ ...BOTON, color: '#ffffff', backgroundColor: guardando ? 'rgba(10,10,10,0.2)' : '#0a0a0a', border: '1px solid transparent', cursor: guardando ? 'default' : 'pointer' }}>
          {guardando ? 'Guardando...' : 'Guardar'}
        </button>
      </div>
    </div>
  )
}

export default function AdminPlanesPage() {
  const [esAdmin, setEsAdmin] = useState(null)
  const [planes, setPlanes] = useState(null)
  const [error, setError] = useState('')
  const [aviso, setAviso] = useState('')

  async function cargar() {
    setError('')
    try {
      const res = await fetch('/api/admin/planes')
      const datos = await res.json().catch(() => ({}))
      if (res.ok) setPlanes(datos.planes || [])
      else setError(datos.error || 'No pudimos cargar los planes.')
    } catch {
      setError('No pudimos cargar los planes. Revisá tu conexión y probá de nuevo.')
    }
  }

  useEffect(() => {
    const supabase = createClient()
    async function iniciar() {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) { setEsAdmin(false); return }
      const { data: perfil } = await supabase.from('usuarios').select('es_admin').eq('id', user.id).single()
      if (!perfil?.es_admin) { setEsAdmin(false); return }
      setEsAdmin(true)
      await cargar()
    }
    iniciar()
  }, [])

  useEffect(() => {
    if (!aviso) return
    const t = setTimeout(() => setAviso(''), 3000)
    return () => clearTimeout(t)
  }, [aviso])

  function alGuardar(plan) {
    setPlanes((lista) => lista.map((p) => (p.clave === plan.clave ? plan : p)))
    setAviso('Guardado. Ya se ve en /vender y en los paneles.')
  }

  if (esAdmin === null || (esAdmin && planes === null && !error)) {
    return (
      <>
        <Navbar variant="solid" />
        <main className="pt-28 px-6 text-center text-[#0a0a0a]/30 text-sm font-light">Cargando...</main>
      </>
    )
  }

  if (!esAdmin) {
    return (
      <>
        <Navbar variant="solid" />
        <main className="pt-28 px-6 text-center">
          <h1 className="text-2xl font-semibold text-[#0a0a0a]">Acceso restringido</h1>
          <p className="text-[#0a0a0a]/40 font-light">Esta página es solo para administradores.</p>
        </main>
      </>
    )
  }

  return (
    <>
      <link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Inter:wght@200;300;400;500;600;700;800;900&display=swap" />
      <link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Fraunces:opsz,wght@9..144,100..900&family=Poppins:wght@300;400;500&display=swap" />

      <div className="min-h-screen bg-[#faf9f7]" style={{ fontFamily: "'Inter', sans-serif" }}>
        <Navbar variant="solid" />

        <div className="pt-20">
          <div className="max-w-[820px] mx-auto px-4 md:px-8" style={{ paddingTop: '48px', paddingBottom: '100px' }}>
            <Link href="/admin" style={{ fontSize: '12px', fontWeight: 400, color: 'rgba(10,10,10,0.4)', display: 'inline-block', marginBottom: '24px' }}>
              ← Admin
            </Link>
            <h1 style={{ fontFamily: 'Fraunces, serif', fontWeight: 500, fontSize: '26px', color: '#0a0a0a', margin: 0 }}>Planes</h1>
            <p style={{ fontFamily: 'Poppins, sans-serif', fontWeight: 300, fontSize: '13px', color: 'rgba(10,10,10,0.45)', margin: '4px 0 22px' }}>
              Lo que cambies acá se ve en /vender y en el panel de cada tienda. La comisión no depende del plan.
            </p>

            {error ? (
              <div className="flex flex-col items-start" style={{ gap: '12px' }}>
                <p className="m-0" role="alert" style={{ fontSize: '13px', color: ROJO }}>{error}</p>
                <button type="button" onClick={cargar}
                  style={{ ...BOTON, color: '#0a0a0a', backgroundColor: '#ffffff', border: '1px solid #0a0a0a', cursor: 'pointer' }}>
                  Reintentar
                </button>
              </div>
            ) : planes.length === 0 ? (
              <p className="m-0" style={{ fontSize: '13px', fontWeight: 300, color: 'rgba(10,10,10,0.5)' }}>
                No hay planes cargados. Revisá que la migración 046 esté corrida.
              </p>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-3" style={{ gap: '14px' }}>
                {planes.map((plan) => (plan.clave === 'pro'
                  ? <TarjetaPro key={plan.clave} plan={plan} />
                  : <TarjetaPlan key={`${plan.clave}-${plan.actualizado_en}`} plan={plan} onGuardado={alGuardar} />))}
              </div>
            )}
          </div>
        </div>

        {aviso && (
          <div role="status" className="fixed left-1/2 -translate-x-1/2"
            style={{ bottom: '24px', backgroundColor: '#0a0a0a', color: '#ffffff', fontSize: '12.5px', padding: '10px 14px', borderRadius: '8px', maxWidth: 'calc(100% - 32px)', lineHeight: 1.5, zIndex: 50 }}>
            {aviso}
          </div>
        )}
      </div>
    </>
  )
}
