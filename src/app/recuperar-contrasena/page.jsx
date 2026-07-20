'use client'

import { useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import Link from 'next/link'

export default function RecuperarContrasenaPage() {
  const supabase = createClient()

  const [email, setEmail] = useState('')
  const [error, setError] = useState('')
  const [cargando, setCargando] = useState(false)
  const [enviado, setEnviado] = useState(false)

  async function enviarRecuperacion(e) {
    e.preventDefault()
    setError('')

    if (!email.trim()) {
      setError('Escribí tu email.')
      return
    }

    setCargando(true)

    const { error: authError } = await supabase.auth.resetPasswordForEmail(
      email.trim(),
      {
        redirectTo: `${window.location.origin}/auth/callback?next=/actualizar-contrasena`,
      }
    )

    if (authError) {
      setError('No se pudo enviar el email. Probá de nuevo.')
      setCargando(false)
      return
    }

    setEnviado(true)
    setCargando(false)
  }

  if (enviado) {
    return (
      <main className="min-h-screen flex items-center justify-center px-4 bg-white">
        <div className="w-full max-w-sm text-center">
          <div className="text-4xl mb-4">📬</div>
          <h1 className="text-xl font-bold text-gray-900 mb-2">Email enviado</h1>
          <p className="text-sm text-gray-500 mb-2">
            Si existe una cuenta con ese email, te enviamos un enlace para restablecer tu contraseña a:
          </p>
          <p className="text-sm font-semibold text-gray-900 mb-6">{email}</p>
          <p className="text-sm text-gray-400 mb-6">
            Revisá tu casilla (y la carpeta de spam). El enlace expira en 1 hora.
          </p>
          <Link
            href="/login"
            className="inline-block px-6 py-3 bg-[#222] text-white rounded-xl text-sm font-semibold hover:bg-[#333] transition"
          >
            Volver a iniciar sesión
          </Link>
        </div>
      </main>
    )
  }

  return (
    <main className="min-h-screen flex items-center justify-center px-4 bg-white">
      <div className="w-full max-w-sm">

        <div className="text-center mb-8">
          <Link href="/">
            <img
              src="/images/logo-bahiashops.png"
              alt="Bahía Shops"
              className="h-10 mx-auto mb-4 object-contain"
            />
          </Link>
          <h1 className="text-xl font-bold text-gray-900">Recuperar contraseña</h1>
          <p className="text-sm text-gray-400 mt-1">Te mandamos un enlace para restablecerla</p>
        </div>

        <form onSubmit={enviarRecuperacion} className="space-y-4">
          <div>
            <label className="block text-sm text-gray-600 mb-1">Email de tu cuenta</label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="tu@email.com"
              className="w-full px-4 py-3 border border-gray-200 rounded-xl text-sm focus:outline-none focus:border-[#8B7EC8]"
            />
          </div>

          {error && (
            <p className="text-sm text-red-500 bg-red-50 px-4 py-2 rounded-xl">{error}</p>
          )}

          <button
            type="submit"
            disabled={cargando}
            className="w-full py-3 rounded-xl text-sm font-semibold text-white transition cursor-pointer"
            style={{ background: cargando ? '#999' : '#222' }}
          >
            {cargando ? 'Enviando...' : 'Enviar enlace'}
          </button>
        </form>

        <p className="text-center text-sm text-gray-400 mt-6">
          <Link href="/login" className="text-[#8B7EC8] hover:text-[#7a6db7]">
            ← Volver a iniciar sesión
          </Link>
        </p>

      </div>
    </main>
  )
}
