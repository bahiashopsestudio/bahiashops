'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'
import Navbar from '@/components/Navbar'

const COLORES = ['#f1f29f', '#f0e0d0', '#d4e8f0', '#e8d4f0', '#d0f0e0', '#f0d4d4']

function getFoto(media) {
  if (!media?.length) return null
  const sorted = [...media].sort((a, b) => a.orden - b.orden)
  return sorted[0]?.url || null
}

function QuoteIcon() {
  return (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="currentColor" style={{ opacity: 0.35 }}>
      <path d="M9.983 3v7.391c0 5.704-3.731 9.57-8.983 10.609l-.995-2.151c2.432-.917 3.995-3.638 3.995-5.849h-4v-10h9.983zm14.017 0v7.391c0 5.704-3.748 9.57-9 10.609l-.996-2.151c2.433-.917 3.996-3.638 3.996-5.849h-4v-10h10z" />
    </svg>
  )
}

function TarjetaTesoro({ t, barrioNombre, onEditar, onQuitar, editando, procesando }) {
  const producto = t.producto
  const foto = getFoto(producto?.media)

  return (
    <div style={{ backgroundColor: '#ffffff', borderRadius: '8px', border: '1px solid rgba(10,10,10,0.06)', marginBottom: '8px' }}>
      <div className="flex items-center gap-4" style={{ padding: '16px 20px' }}>
        <div style={{ width: '48px', height: '48px', borderRadius: '4px', overflow: 'hidden', background: '#f0ede8', flexShrink: 0 }}>
          {foto && <img src={foto} alt={producto?.nombre} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />}
        </div>

        <div className="min-w-0 flex-1">
          <p style={{ fontFamily: "'Inter', sans-serif", fontSize: '13px', fontWeight: 500, color: '#0a0a0a' }}>
            {producto?.nombre}
          </p>
          <p style={{ fontFamily: "'Inter', sans-serif", fontSize: '11px', fontWeight: 300, color: 'rgba(10,10,10,0.45)', marginTop: '2px' }}>
            {producto?.vendedor?.nombre_negocio}{barrioNombre ? ` · ${barrioNombre}` : ''}
          </p>
          <p style={{ fontFamily: "'Inter', sans-serif", fontSize: '12px', fontWeight: 400, color: '#0a0a0a', marginTop: '2px' }}>
            ${Number(producto?.precio || 0).toLocaleString('es-AR')}
          </p>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          {t.destacado && (
            <span
              style={{
                fontSize: '10px',
                fontWeight: 500,
                color: '#0a0a0a',
                backgroundColor: t.color_fondo || '#f1f29f',
                borderRadius: '999px',
                padding: '3px 10px',
              }}
            >
              Destacado
            </span>
          )}
          {t.quote && <QuoteIcon />}
        </div>

        <div className="flex items-center gap-3 shrink-0">
          <button
            type="button"
            onClick={() => onEditar(t)}
            style={{ fontFamily: "'Inter', sans-serif", fontSize: '11px', fontWeight: 400, color: 'rgba(10,10,10,0.5)', background: 'none', border: 'none', cursor: 'pointer' }}
          >
            {editando ? 'Cerrar' : 'Editar'}
          </button>
          <button
            type="button"
            onClick={() => onQuitar(t)}
            disabled={procesando}
            style={{ fontFamily: "'Inter', sans-serif", fontSize: '11px', fontWeight: 400, color: '#cc152b', background: 'none', border: 'none', cursor: procesando ? 'default' : 'pointer' }}
          >
            {procesando ? '...' : 'Quitar'}
          </button>
        </div>
      </div>

      {editando && (
        <FormEdicion tesoro={t} onGuardado={onEditar} />
      )}
    </div>
  )
}

function FormEdicion({ tesoro, onGuardado }) {
  const [destacado, setDestacado] = useState(tesoro.destacado)
  const [colorFondo, setColorFondo] = useState(tesoro.color_fondo || COLORES[0])
  const [quote, setQuote] = useState(tesoro.quote || '')
  const [quoteAutor, setQuoteAutor] = useState(tesoro.quote_autor || '')
  const [guardando, setGuardando] = useState(false)

  async function guardar() {
    setGuardando(true)
    const res = await fetch(`/api/admin/tesoros/${tesoro.id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        destacado,
        color_fondo: colorFondo,
        quote: destacado ? quote : '',
        quote_autor: destacado ? quoteAutor : '',
      }),
    })
    setGuardando(false)
    if (res.ok) {
      onGuardado(null, {
        ...tesoro,
        destacado,
        color_fondo: colorFondo,
        quote: destacado ? quote.trim() || null : null,
        quote_autor: destacado ? quoteAutor.trim() || null : null,
      })
    } else {
      const data = await res.json()
      alert(data.error || 'No se pudo guardar.')
    }
  }

  return (
    <div style={{ borderTop: '1px solid rgba(10,10,10,0.06)', padding: '18px 20px' }}>
      <label className="flex items-center gap-2" style={{ fontFamily: "'Inter', sans-serif", fontSize: '13px', fontWeight: 400, color: '#0a0a0a', cursor: 'pointer' }}>
        <input type="checkbox" checked={destacado} onChange={(e) => setDestacado(e.target.checked)} />
        Destacado
      </label>

      {destacado && (
        <div style={{ marginTop: '16px' }}>
          <p style={{ fontFamily: "'Inter', sans-serif", fontSize: '11px', fontWeight: 400, color: 'rgba(10,10,10,0.5)', marginBottom: '8px' }}>
            Color de fondo
          </p>
          <div className="flex items-center gap-2" style={{ marginBottom: '16px' }}>
            {COLORES.map((c) => (
              <button
                key={c}
                type="button"
                onClick={() => setColorFondo(c)}
                aria-label={c}
                style={{
                  width: '22px',
                  height: '22px',
                  borderRadius: '50%',
                  backgroundColor: c,
                  border: colorFondo === c ? '2px solid #0a0a0a' : '1px solid rgba(10,10,10,0.1)',
                  cursor: 'pointer',
                }}
              />
            ))}
          </div>

          <p style={{ fontFamily: "'Inter', sans-serif", fontSize: '11px', fontWeight: 400, color: 'rgba(10,10,10,0.5)', marginBottom: '6px' }}>
            Quote del vendedor
          </p>
          <textarea
            value={quote}
            onChange={(e) => setQuote(e.target.value)}
            placeholder="Lo que dice el vendedor sobre este producto..."
            rows={3}
            style={{
              fontFamily: "'Inter', sans-serif",
              fontSize: '13px',
              fontWeight: 300,
              width: '100%',
              padding: '10px 12px',
              borderRadius: '6px',
              border: '1px solid rgba(10,10,10,0.1)',
              outline: 'none',
              resize: 'vertical',
              marginBottom: '12px',
            }}
          />

          <p style={{ fontFamily: "'Inter', sans-serif", fontSize: '11px', fontWeight: 400, color: 'rgba(10,10,10,0.5)', marginBottom: '6px' }}>
            Autor de la quote
          </p>
          <input
            type="text"
            value={quoteAutor}
            onChange={(e) => setQuoteAutor(e.target.value)}
            placeholder="Nombre, Tienda"
            style={{
              fontFamily: "'Inter', sans-serif",
              fontSize: '13px',
              fontWeight: 300,
              width: '100%',
              padding: '10px 12px',
              borderRadius: '6px',
              border: '1px solid rgba(10,10,10,0.1)',
              outline: 'none',
            }}
          />
        </div>
      )}

      <button
        type="button"
        onClick={guardar}
        disabled={guardando}
        style={{
          fontFamily: "'Inter', sans-serif",
          fontSize: '12px',
          fontWeight: 400,
          color: '#ffffff',
          backgroundColor: '#0a0a0a',
          padding: '9px 20px',
          borderRadius: '4px',
          border: 'none',
          cursor: guardando ? 'default' : 'pointer',
          marginTop: '18px',
        }}
      >
        {guardando ? 'Guardando...' : 'Guardar'}
      </button>
    </div>
  )
}

export default function AdminTesorosPage() {
  const [esAdmin, setEsAdmin] = useState(null)
  const [cargando, setCargando] = useState(true)
  const [tesoros, setTesoros] = useState([])
  const [barriosMap, setBarriosMap] = useState({})
  const [editandoId, setEditandoId] = useState(null)
  const [quitandoId, setQuitandoId] = useState(null)

  const [busqueda, setBusqueda] = useState('')
  const [resultados, setResultados] = useState([])
  const [buscando, setBuscando] = useState(false)
  const [agregandoId, setAgregandoId] = useState(null)

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

      const { data: barrios } = await supabase.from('barrios').select('id, nombre')
      if (barrios) {
        const mapa = {}
        barrios.forEach((b) => { mapa[b.id] = b.nombre })
        setBarriosMap(mapa)
      }

      await cargarTesoros()
      setCargando(false)
    }
    iniciar()
  }, [])

  async function cargarTesoros() {
    const supabase = createClient()
    const { data, error } = await supabase
      .from('tesoros')
      .select(`
        id, destacado, color_fondo, quote, quote_autor, orden, activo,
        producto:productos (
          id, nombre, precio,
          vendedor:vendedores ( nombre_negocio, barrio_id ),
          media:producto_media ( url, orden )
        )
      `)
      .eq('activo', true)
      .order('orden')

    if (!error && data) setTesoros(data.filter((t) => t.producto))
  }

  useEffect(() => {
    const term = busqueda.trim()
    if (!term) { setResultados([]); return }

    setBuscando(true)
    const timeout = setTimeout(async () => {
      const supabase = createClient()
      const { data } = await supabase
        .from('productos')
        .select(`
          id, nombre, precio,
          vendedor:vendedores ( nombre_negocio ),
          media:producto_media ( url, orden )
        `)
        .eq('estado', 'activo')
        .ilike('nombre', `%${term}%`)
        .limit(10)

      const idsExistentes = new Set(tesoros.map((t) => t.producto?.id))
      setResultados((data || []).filter((p) => !idsExistentes.has(p.id)))
      setBuscando(false)
    }, 300)

    return () => clearTimeout(timeout)
  }, [busqueda, tesoros])

  function handleEditarToggle(t, actualizado) {
    if (actualizado) {
      setTesoros((prev) => prev.map((x) => (x.id === actualizado.id ? { ...x, ...actualizado } : x)))
      setEditandoId(null)
      return
    }
    setEditandoId((prev) => (prev === t.id ? null : t.id))
  }

  async function quitar(t) {
    if (!window.confirm(`¿Quitar "${t.producto?.nombre}" de los tesoros?`)) return
    setQuitandoId(t.id)
    const res = await fetch(`/api/admin/tesoros/${t.id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ activo: false }),
    })
    if (res.ok) {
      setTesoros((prev) => prev.filter((x) => x.id !== t.id))
    } else {
      const data = await res.json()
      alert(data.error || 'No se pudo quitar.')
    }
    setQuitandoId(null)
  }

  async function agregar(producto) {
    setAgregandoId(producto.id)
    const res = await fetch('/api/admin/tesoros', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ producto_id: producto.id }),
    })
    if (res.ok) {
      await cargarTesoros()
      setResultados((prev) => prev.filter((p) => p.id !== producto.id))
    } else {
      const data = await res.json()
      alert(data.error || 'No se pudo agregar.')
    }
    setAgregandoId(null)
  }

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
              Tesoros
            </h1>
            <p style={{ fontFamily: 'Poppins, sans-serif', fontWeight: 300, fontSize: '13px', color: 'rgba(10,10,10,0.45)', marginTop: '8px' }}>
              Seleccioná productos para la vitrina curada.
            </p>
          </div>

          <div className="max-w-[820px] mx-auto px-5 md:px-8">
            {tesoros.length === 0 ? (
              <p style={{ fontFamily: "'Inter', sans-serif", fontSize: '13px', fontWeight: 300, color: 'rgba(10,10,10,0.35)', padding: '12px 0 24px' }}>
                Todavía no hay tesoros. Agregá el primero abajo.
              </p>
            ) : (
              tesoros.map((t) => (
                <TarjetaTesoro
                  key={t.id}
                  t={t}
                  barrioNombre={t.producto?.vendedor?.barrio_id ? barriosMap[t.producto.vendedor.barrio_id] : null}
                  onEditar={(x, actualizado) => handleEditarToggle(x, actualizado)}
                  onQuitar={quitar}
                  editando={editandoId === t.id}
                  procesando={quitandoId === t.id}
                />
              ))
            )}

            <p style={{ fontFamily: "'Inter', sans-serif", fontSize: '14px', fontWeight: 500, color: '#0a0a0a', marginTop: '40px', marginBottom: '14px' }}>
              Agregar producto
            </p>
            <input
              type="text"
              value={busqueda}
              onChange={(e) => setBusqueda(e.target.value)}
              placeholder="Buscar por nombre de producto..."
              style={{
                fontFamily: "'Inter', sans-serif",
                fontSize: '13px',
                fontWeight: 300,
                width: '100%',
                maxWidth: '400px',
                padding: '10px 14px',
                borderRadius: '8px',
                border: '1px solid rgba(10,10,10,0.1)',
                outline: 'none',
              }}
            />

            <div style={{ marginTop: '16px', paddingBottom: '100px' }}>
              {buscando && (
                <p style={{ fontFamily: "'Inter', sans-serif", fontSize: '12px', fontWeight: 300, color: 'rgba(10,10,10,0.35)' }}>
                  Buscando...
                </p>
              )}
              {!buscando && busqueda.trim() && resultados.length === 0 && (
                <p style={{ fontFamily: "'Inter', sans-serif", fontSize: '12px', fontWeight: 300, color: 'rgba(10,10,10,0.35)' }}>
                  Sin resultados.
                </p>
              )}
              {resultados.map((p) => {
                const foto = getFoto(p.media)
                return (
                  <div
                    key={p.id}
                    className="flex items-center gap-3"
                    style={{ padding: '10px 0', borderBottom: '1px solid rgba(10,10,10,0.05)' }}
                  >
                    <div style={{ width: '40px', height: '40px', borderRadius: '4px', overflow: 'hidden', background: '#f0ede8', flexShrink: 0 }}>
                      {foto && <img src={foto} alt={p.nombre} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />}
                    </div>
                    <div className="min-w-0 flex-1">
                      <p style={{ fontFamily: "'Inter', sans-serif", fontSize: '13px', fontWeight: 400, color: '#0a0a0a' }}>
                        {p.nombre}
                      </p>
                      <p style={{ fontFamily: "'Inter', sans-serif", fontSize: '11px', fontWeight: 300, color: 'rgba(10,10,10,0.45)' }}>
                        {p.vendedor?.nombre_negocio} · ${Number(p.precio).toLocaleString('es-AR')}
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={() => agregar(p)}
                      disabled={agregandoId === p.id}
                      style={{
                        fontFamily: "'Inter', sans-serif",
                        fontSize: '11px',
                        fontWeight: 400,
                        color: '#ffffff',
                        backgroundColor: '#0a0a0a',
                        borderRadius: '4px',
                        border: 'none',
                        padding: '7px 14px',
                        cursor: agregandoId === p.id ? 'default' : 'pointer',
                        flexShrink: 0,
                      }}
                    >
                      {agregandoId === p.id ? 'Agregando...' : 'Agregar como tesoro'}
                    </button>
                  </div>
                )
              })}
            </div>
          </div>
        </div>
      </div>
    </>
  )
}
