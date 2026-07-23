'use client'

import { useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useRouter } from 'next/navigation'

export default function ProfileForm({ userId }) {
  const supabase = createClient()
  const router = useRouter()
  const [nombre, setNombre] = useState('')
  const [guardando, setGuardando] = useState(false)
  const [error, setError] = useState(null)

  async function guardar(e) {
    e.preventDefault()
    if (!nombre.trim()) return

    setGuardando(true)
    setError(null)

    const { error: err } = await supabase
      .from('perfiles')
      .update({ nombre_completo: nombre.trim() })
      .eq('id', userId)

    if (err) {
      setError('No se pudo guardar. Intentá de nuevo.')
      setGuardando(false)
      return
    }

    router.push('/')
    router.refresh()
  }

  return (
    <div>
      <div className="mb-6">
        <label className="block text-sm text-[#0a0a0a]/40 font-light mb-1.5">
          Nombre completo
        </label>
        <input
          type="text"
          value={nombre}
          onChange={(e) => setNombre(e.target.value)}
          className="w-full px-4 py-3 rounded-xl border border-[#0a0a0a]/10 text-sm text-[#0a0a0a] focus:outline-none focus:border-[#0a0a0a]/30 transition bg-white"
          placeholder="Tu nombre y apellido"
          autoFocus
        />
      </div>

      {error && (
        <div className="bg-red-50 text-[#e60000] text-sm p-3 rounded-xl mb-4 font-light">
          {error}
        </div>
      )}

      <button
        type="button"
        onClick={guardar}
        disabled={guardando || !nombre.trim()}
        className={`w-full py-3.5 rounded-full text-sm font-medium transition cursor-pointer ${
          guardando || !nombre.trim()
            ? 'bg-[#0a0a0a]/10 text-[#0a0a0a]/20 cursor-not-allowed'
            : 'bg-[#0a0a0a] text-white hover:bg-[#2a2a2a]'
        }`}
      >
        {guardando ? 'Guardando...' : 'Continuar'}
      </button>
    </div>
  )
}