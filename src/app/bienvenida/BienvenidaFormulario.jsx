'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import EditorApodo from '@/components/EditorApodo'
import { validarApodo } from '@/lib/apodos'

const estiloTitulo = { fontFamily: 'Fraunces, serif', fontWeight: 500, fontSize: '28px', color: '#0a0a0a', letterSpacing: '-0.02em', lineHeight: 1.15, margin: 0 }
const estiloParrafo = { fontFamily: 'Poppins, sans-serif', fontWeight: 300, fontSize: '15px', color: 'rgba(10,10,10,0.55)', lineHeight: 1.6 }
const estiloBoton = { fontFamily: "'Inter', sans-serif", fontWeight: 500, fontSize: '14px', borderRadius: '4px', padding: '14px 24px' }
const claseCampo = 'w-full px-4 py-3 rounded-xl border border-[#0a0a0a]/10 text-sm text-[#0a0a0a] focus:outline-none focus:border-[#4164fe]/60 transition bg-white'

export default function BienvenidaFormulario({ next, apodoInicial, faltantes }) {
  const router = useRouter()

  const [apodo, setApodo] = useState(apodoInicial)
  const [nombre, setNombre] = useState(faltantes?.nombre || '')
  const [apellido, setApellido] = useState(faltantes?.apellido || '')
  const [guardando, setGuardando] = useState(false)
  const [error, setError] = useState('')

  async function listo() {
    setError('')

    // Aviso rápido antes de ir al servidor; el que decide es /api/cuenta/apodo.
    const validacion = validarApodo(apodo)
    if (!validacion.ok) {
      setError(validacion.motivo)
      return
    }

    setGuardando(true)
    try {
      const res = await fetch('/api/cuenta/apodo', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          apodo: validacion.apodo,
          // Por ahora la única imagen es el dibujo del apodo.
          imagen_perfil: 'dibujo',
          ...(faltantes?.pedirNombre ? { nombre } : {}),
          ...(faltantes?.pedirApellido ? { apellido } : {}),
          marcarBienvenida: true,
        }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) {
        setError(data.error || 'No pudimos guardar. Probá de nuevo.')
        setGuardando(false)
        return
      }
      router.push(next)
      router.refresh()
    } catch {
      setError('No pudimos conectarnos. Revisá tu conexión y probá de nuevo.')
      setGuardando(false)
    }
  }

  return (
    <div className="min-h-screen px-4 pt-16 pb-24" style={{ backgroundColor: '#faf9f7', fontFamily: "'Inter', sans-serif" }}>
      <div className="max-w-md mx-auto">
        <p className="m-0 mb-3 text-[11px] font-semibold uppercase tracking-[0.14em] text-[#4164fe]">
          Tu cuenta está lista
        </p>
        <h1 style={estiloTitulo}>¿Cómo te van a ver en Bahía Shops?</h1>
        <p style={{ ...estiloParrafo, margin: '10px 0 24px' }}>
          En reseñas y comentarios aparecés con un apodo, nunca con tu nombre real. Elegimos este para vos, podés cambiarlo:
        </p>

        <EditorApodo apodoInicial={apodoInicial} onCambiarApodo={setApodo} />

        {faltantes && (
          <div className="mt-6 rounded-lg border border-[#4164fe]/15 p-5" style={{ backgroundColor: '#eef3ff' }}>
            <p className="m-0 mb-4 text-sm font-medium text-[#0a0a0a]">Nos faltan tus datos</p>
            <div className={`grid gap-3 ${faltantes.pedirNombre && faltantes.pedirApellido ? 'grid-cols-2' : 'grid-cols-1'}`}>
              {faltantes.pedirNombre && (
                <div>
                  <label htmlFor="bv-nombre" className="block text-sm text-[#0a0a0a]/50 font-light mb-1.5">Nombre</label>
                  <input id="bv-nombre" type="text" value={nombre} maxLength={60} autoComplete="given-name"
                    onChange={(e) => setNombre(e.target.value)} className={claseCampo} />
                </div>
              )}
              {faltantes.pedirApellido && (
                <div>
                  <label htmlFor="bv-apellido" className="block text-sm text-[#0a0a0a]/50 font-light mb-1.5">Apellido</label>
                  <input id="bv-apellido" type="text" value={apellido} maxLength={60} autoComplete="family-name"
                    onChange={(e) => setApellido(e.target.value)} className={claseCampo} />
                </div>
              )}
            </div>
          </div>
        )}

        {error && (
          <div className="mt-6 p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-800">{error}</div>
        )}

        <button type="button" onClick={listo} disabled={guardando}
          className={`mt-6 w-full border transition-colors ${guardando ? 'bg-[#0a0a0a]/20 text-white border-transparent cursor-wait' : 'bg-[#0a0a0a] text-white border-[#0a0a0a] hover:bg-[#2a2a2a] cursor-pointer'}`}
          style={estiloBoton}>
          {guardando ? 'Guardando...' : 'Listo, seguir'}
        </button>
        <p className="m-0 mt-3 text-center text-[12px] text-[#0a0a0a]/40 font-light">
          Lo podés cambiar cuando quieras desde tu perfil.
        </p>
      </div>
    </div>
  )
}
