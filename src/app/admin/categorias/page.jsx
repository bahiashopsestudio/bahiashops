'use client'

// Las categorías de la plataforma, abiertas y cerradas.
//
// El modelo es que una categoría se abre sola cuando llega el primer vendedor
// que la elige. Esta pantalla es para mirar el resultado y corregirlo a mano:
// cerrar una que se abrió por error, o abrir una a dedo antes de que llegue
// nadie. Cerrarlas automáticamente cuando se quedan sin vendedores es a
// propósito que no pase.

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'
import Navbar from '@/components/Navbar'

function Fila({ categoria, onAlternar, procesando }) {
  const { activa, nombre, slug, vendedores, vendedores_visibles, productos } = categoria
  const vacia = vendedores === 0 && productos === 0
  const soloOcultos = vendedores > 0 && vendedores_visibles === 0

  return (
    <div
      className="flex flex-col md:flex-row md:items-center md:justify-between gap-3"
      style={{
        backgroundColor: '#ffffff',
        borderRadius: '8px',
        padding: '16px 20px',
        border: '1px solid rgba(10,10,10,0.06)',
        marginBottom: '8px',
        opacity: activa ? 1 : 0.72,
      }}
    >
      <div className="min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <span style={{ fontFamily: "'Inter', sans-serif", fontSize: '14px', fontWeight: 500, color: '#0a0a0a' }}>
            {nombre}
          </span>
          <span
            style={{
              fontSize: '10px', fontWeight: 500, borderRadius: '999px', padding: '2px 9px',
              color: activa ? '#1a7a4a' : 'rgba(10,10,10,0.5)',
              backgroundColor: activa ? '#d0f0e0' : 'rgba(10,10,10,0.06)',
            }}
          >
            {activa ? 'Abierta' : 'Cerrada'}
          </span>
          {activa && vacia && (
            <span style={{ fontSize: '10px', fontWeight: 500, color: '#92650a', backgroundColor: '#fef3c7', borderRadius: '999px', padding: '2px 9px' }}>
              Sin nadie
            </span>
          )}
          {soloOcultos && (
            <span style={{ fontSize: '10px', fontWeight: 500, color: '#92650a', backgroundColor: '#fef3c7', borderRadius: '999px', padding: '2px 9px' }}>
              Sin vendedores visibles
            </span>
          )}
        </div>
        <p style={{ fontFamily: "'Inter', sans-serif", fontSize: '11px', fontWeight: 300, color: 'rgba(10,10,10,0.35)', marginTop: '3px' }}>
          /categoria/{slug}
        </p>
      </div>

      <div className="flex items-center gap-3 shrink-0 flex-wrap">
        <span
          style={{
            fontSize: '11px', fontWeight: 400, color: 'rgba(10,10,10,0.5)',
            backgroundColor: 'rgba(10,10,10,0.04)', borderRadius: '999px', padding: '4px 10px',
          }}
        >
          {vendedores} {vendedores === 1 ? 'vendedor' : 'vendedores'}
          {vendedores !== vendedores_visibles && ` · ${vendedores_visibles} visible${vendedores_visibles === 1 ? '' : 's'}`}
        </span>

        <span
          style={{
            fontSize: '11px', fontWeight: 400, color: 'rgba(10,10,10,0.5)',
            backgroundColor: 'rgba(10,10,10,0.04)', borderRadius: '999px', padding: '4px 10px',
          }}
        >
          {productos} {productos === 1 ? 'producto' : 'productos'}
        </span>

        <button
          type="button"
          onClick={() => onAlternar(categoria)}
          disabled={procesando}
          style={{
            fontFamily: "'Inter', sans-serif", fontSize: '12px', fontWeight: 500,
            color: activa ? 'rgba(10,10,10,0.6)' : '#ffffff',
            backgroundColor: activa ? 'transparent' : '#1a7a4a',
            border: activa ? '1px solid rgba(10,10,10,0.15)' : 'none',
            borderRadius: '4px', padding: '8px 16px',
            cursor: procesando ? 'default' : 'pointer',
            minWidth: '92px',
          }}
        >
          {procesando ? '...' : activa ? 'Cerrar' : 'Abrir'}
        </button>
      </div>
    </div>
  )
}

export default function AdminCategoriasPage() {
  const supabase = createClient()

  const [esAdmin, setEsAdmin] = useState(null)
  const [cargando, setCargando] = useState(true)
  const [categorias, setCategorias] = useState([])
  const [procesandoId, setProcesandoId] = useState(null)
  const [error, setError] = useState('')

  async function cargar() {
    const res = await fetch('/api/admin/categorias')
    const datos = await res.json().catch(() => ({}))
    if (res.ok) {
      setCategorias(datos.categorias || [])
      setError('')
    } else {
      setError(datos.error || 'No se pudo cargar la lista de categorías.')
    }
  }

  useEffect(() => {
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

  async function alternar(categoria) {
    setProcesandoId(categoria.id)
    setError('')

    const res = await fetch(`/api/admin/categorias/${categoria.id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ activa: !categoria.activa }),
    })
    const datos = await res.json().catch(() => ({}))

    if (res.ok) {
      setCategorias((prev) =>
        prev.map((c) => (c.id === categoria.id ? { ...c, activa: datos.categoria.activa } : c))
      )
    } else {
      setError(datos.error || 'No se pudo actualizar la categoría.')
    }
    setProcesandoId(null)
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

  const abiertas = categorias.filter((c) => c.activa).length

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
              Categorías
            </h1>
            <p style={{ fontFamily: 'Poppins, sans-serif', fontWeight: 300, fontSize: '13px', color: 'rgba(10,10,10,0.45)', marginTop: '8px', lineHeight: 1.6 }}>
              {abiertas} de {categorias.length} abiertas. Una categoría se abre sola cuando el
              primer vendedor la elige al darse de alta; acá podés corregirlo a mano. Las cerradas
              no aparecen en el menú ni en el listado del sitio, pero se siguen ofreciendo en el
              formulario de alta.
            </p>

            {error && (
              <p style={{ fontFamily: "'Inter', sans-serif", fontSize: '12px', fontWeight: 400, color: '#cc152b', backgroundColor: '#fce4e4', borderRadius: '6px', padding: '10px 14px', marginTop: '16px' }}>
                {error}
              </p>
            )}
          </div>

          <div className="max-w-[820px] mx-auto px-5 md:px-8" style={{ paddingBottom: '100px' }}>
            {categorias.map((c) => (
              <Fila
                key={c.id}
                categoria={c}
                onAlternar={alternar}
                procesando={procesandoId === c.id}
              />
            ))}
          </div>
        </div>
      </div>
    </>
  )
}
