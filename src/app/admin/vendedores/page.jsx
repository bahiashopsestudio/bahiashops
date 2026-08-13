'use client'

import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'
import Navbar from '@/components/Navbar'

const SIETE_DIAS_MS = 7 * 24 * 60 * 60 * 1000

function formatearFecha(fecha) {
  if (!fecha) return ''
  const d = new Date(fecha)
  const diffMs = Date.now() - d.getTime()
  const dias = Math.floor(diffMs / (24 * 60 * 60 * 1000))
  if (dias <= 0) return 'hoy'
  if (dias === 1) return 'hace 1 día'
  if (dias < 30) return `hace ${dias} días`
  return d.toLocaleDateString('es-AR', { day: '2-digit', month: '2-digit', year: 'numeric' })
}

function esNuevo(fecha) {
  if (!fecha) return false
  return Date.now() - new Date(fecha).getTime() < SIETE_DIAS_MS
}

function VendedorCard({ v, onToggleBloqueo, procesando }) {
  const [hover, setHover] = useState(false)
  const nuevo = esNuevo(v.creado_en)

  return (
    <div
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      style={{
        backgroundColor: '#ffffff',
        borderRadius: '8px',
        padding: '20px 24px',
        border: '1px solid rgba(10,10,10,0.06)',
        marginBottom: '8px',
        opacity: v.bloqueado ? 0.5 : 1,
      }}
      className="flex flex-col md:flex-row md:items-center md:justify-between gap-3"
    >
      {/* Lado izquierdo */}
      <div className="min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <Link
            href={`/tienda/${v.slug}`}
            target="_blank"
            rel="noopener noreferrer"
            style={{ fontFamily: "'Inter', sans-serif", fontSize: '14px', fontWeight: 500, color: '#0a0a0a' }}
            className="hover:underline"
          >
            {v.nombre_negocio}
          </Link>
          {v.categorias?.nombre && (
            <span
              style={{
                fontSize: '10px',
                fontWeight: 400,
                color: 'rgba(10,10,10,0.5)',
                backgroundColor: 'rgba(10,10,10,0.04)',
                borderRadius: '999px',
                padding: '2px 9px',
              }}
            >
              {v.categorias.nombre}
            </span>
          )}
          {v.bloqueado && (
            <span
              style={{
                fontSize: '10px',
                fontWeight: 500,
                color: '#ffffff',
                backgroundColor: '#cc152b',
                borderRadius: '999px',
                padding: '2px 9px',
              }}
            >
              Bloqueado
            </span>
          )}
          {!v.bloqueado && nuevo && (
            <span
              style={{
                fontSize: '10px',
                fontWeight: 500,
                color: '#6b6d00',
                backgroundColor: '#f1f29f',
                borderRadius: '999px',
                padding: '2px 9px',
              }}
            >
              Nuevo
            </span>
          )}
          {v.descripcion_corta && (
            <span
              style={{ fontFamily: "'Inter', sans-serif", fontSize: '12px', fontWeight: 300, color: 'rgba(10,10,10,0.4)' }}
              className="truncate"
            >
              · {v.descripcion_corta}
            </span>
          )}
        </div>
        {v.barrios?.nombre && (
          <p style={{ fontFamily: "'Inter', sans-serif", fontSize: '12px', fontWeight: 300, color: 'rgba(10,10,10,0.45)', marginTop: '3px' }}>
            {v.barrios.nombre}
          </p>
        )}
        {v.usuarios?.email && (
          <p style={{ fontFamily: "'Inter', sans-serif", fontSize: '11px', fontWeight: 300, color: 'rgba(10,10,10,0.35)', marginTop: '2px' }}>
            {v.usuarios.email}
          </p>
        )}
        <p style={{ fontFamily: "'Inter', sans-serif", fontSize: '11px', fontWeight: 300, color: 'rgba(10,10,10,0.3)', marginTop: '2px' }}>
          {formatearFecha(v.creado_en)}
        </p>
      </div>

      {/* Lado derecho */}
      <div className="flex items-center gap-3 shrink-0 flex-wrap">
        <span
          style={{
            fontSize: '11px',
            fontWeight: 400,
            color: 'rgba(10,10,10,0.5)',
            backgroundColor: 'rgba(10,10,10,0.04)',
            borderRadius: '999px',
            padding: '4px 10px',
          }}
        >
          {v.productos_count} {v.productos_count === 1 ? 'producto' : 'productos'}
        </span>

        <span className="flex items-center gap-1.5" style={{ fontSize: '11px', fontWeight: 300, color: 'rgba(10,10,10,0.5)' }}>
          <span
            style={{
              width: '6px',
              height: '6px',
              borderRadius: '50%',
              backgroundColor: v.mercadopago_conectado ? '#3aa15c' : 'rgba(10,10,10,0.2)',
            }}
          />
          {v.mercadopago_conectado ? 'MP conectado' : 'MP pendiente'}
        </span>

        <button
          type="button"
          onClick={() => onToggleBloqueo(v)}
          disabled={procesando}
          style={{
            fontFamily: "'Inter', sans-serif",
            fontSize: '11px',
            fontWeight: 400,
            color: '#cc152b',
            opacity: v.bloqueado ? 1 : hover ? 1 : 0,
            transition: 'opacity 150ms ease',
            cursor: procesando ? 'default' : 'pointer',
            background: 'none',
            border: 'none',
            padding: 0,
          }}
        >
          {procesando ? '...' : v.bloqueado ? 'Desbloquear' : 'Bloquear'}
        </button>
      </div>
    </div>
  )
}

export default function AdminVendedoresPage() {
  const [esAdmin, setEsAdmin] = useState(null)
  const [cargando, setCargando] = useState(true)
  const [vendedores, setVendedores] = useState([])
  const [busqueda, setBusqueda] = useState('')
  const [procesandoId, setProcesandoId] = useState(null)
  const [error, setError] = useState('')

  useEffect(() => {
    const supabase = createClient()

    async function iniciar() {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) { setEsAdmin(false); setCargando(false); return }

      const { data: perfil } = await supabase
        .from('usuarios')
        .select('es_admin')
        .eq('id', user.id)
        .single()

      if (!perfil?.es_admin) { setEsAdmin(false); setCargando(false); return }

      setEsAdmin(true)
      await cargar()
      setCargando(false)
    }
    iniciar()
  }, [])

  async function cargar() {
    const res = await fetch('/api/admin/vendedores')
    const data = await res.json()
    if (res.ok) {
      setVendedores(data.vendedores || [])
      setError('')
    } else {
      setError(data.error || 'No se pudo cargar la lista de vendedores.')
    }
  }

  async function toggleBloqueo(v) {
    const accion = v.bloqueado ? 'desbloquear' : 'bloquear'
    if (!window.confirm(`¿Seguro que querés ${accion} a "${v.nombre_negocio}"?`)) return

    setProcesandoId(v.id)
    const res = await fetch(`/api/admin/vendedores/${v.id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ bloqueado: !v.bloqueado }),
    })

    if (res.ok) {
      setVendedores((prev) => prev.map((x) => (x.id === v.id ? { ...x, bloqueado: !v.bloqueado } : x)))
    } else {
      const data = await res.json()
      alert(data.error || 'No se pudo actualizar.')
    }
    setProcesandoId(null)
  }

  const filtrados = useMemo(() => {
    const activos = vendedores.filter((v) => !v.bloqueado)
    const bloqueados = vendedores.filter((v) => v.bloqueado)
    const term = busqueda.trim().toLowerCase()
    const matchTerm = (v) => !term || v.nombre_negocio?.toLowerCase().includes(term)
    return [...activos.filter(matchTerm), ...bloqueados.filter(matchTerm)]
  }, [vendedores, busqueda])

  if (cargando) {
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
          <div className="max-w-[820px] mx-auto px-5 md:px-8" style={{ paddingTop: '48px', paddingBottom: '24px' }}>
            <Link
              href="/admin"
              style={{ fontFamily: "'Inter', sans-serif", fontSize: '12px', fontWeight: 400, color: 'rgba(10,10,10,0.4)', display: 'inline-block', marginBottom: '24px' }}
            >
              ← Panel
            </Link>
            <h1 style={{ fontFamily: 'Fraunces, serif', fontWeight: 500, fontSize: '26px', color: '#0a0a0a' }}>
              Vendedores
            </h1>
            <p style={{ fontFamily: 'Poppins, sans-serif', fontWeight: 300, fontSize: '13px', color: 'rgba(10,10,10,0.45)', marginTop: '8px' }}>
              {vendedores.length} {vendedores.length === 1 ? 'vendedor registrado' : 'vendedores registrados'}
            </p>

            {error && (
              <p style={{ fontFamily: "'Inter', sans-serif", fontSize: '12px', fontWeight: 400, color: '#cc152b', backgroundColor: '#fce4e4', borderRadius: '6px', padding: '10px 14px', marginTop: '16px' }}>
                {error}
              </p>
            )}

            <input
              type="text"
              value={busqueda}
              onChange={(e) => setBusqueda(e.target.value)}
              placeholder="Buscar vendedor..."
              style={{
                fontFamily: "'Inter', sans-serif",
                fontSize: '13px',
                fontWeight: 300,
                width: '100%',
                maxWidth: '340px',
                padding: '10px 14px',
                borderRadius: '8px',
                border: '1px solid rgba(10,10,10,0.1)',
                outline: 'none',
                marginTop: '24px',
              }}
            />
          </div>

          <div className="max-w-[820px] mx-auto px-5 md:px-8" style={{ paddingBottom: '100px' }}>
            {filtrados.length === 0 ? (
              <p style={{ fontFamily: "'Inter', sans-serif", fontSize: '13px', fontWeight: 300, color: 'rgba(10,10,10,0.35)', padding: '24px 0' }}>
                No hay vendedores que coincidan con la búsqueda.
              </p>
            ) : (
              filtrados.map((v) => (
                <VendedorCard key={v.id} v={v} onToggleBloqueo={toggleBloqueo} procesando={procesandoId === v.id} />
              ))
            )}
          </div>
        </div>
      </div>
    </>
  )
}
