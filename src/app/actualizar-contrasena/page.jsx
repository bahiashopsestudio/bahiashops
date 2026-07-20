'use client'

import { useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useRouter } from 'next/navigation'
import Link from 'next/link'

export default function ActualizarContrasenaPage() {
  const supabase = createClient()
  const router = useRouter()

  const [password, setPassword] = useState('')
  const [passwordConfirm, setPasswordConfirm] = useState('')
  const [error, setError] = useState('')
  const [cargando, setCargando] = useState(false)
  const [actualizado, setActualizado] = useState(false)

  async function actualizar(e) {
    e.preventDefault()
    setError('')

    if (!password) {
      setError('Escribí tu nueva contraseña.')
      return
    }

    if (password.length < 8) {
        setError('La contraseña tiene que tener al menos 8 caracteres.')
        return
    }

    if (!/[a-zA-Z]/.test(password) || !/[0-9]/.test(password)) {
        setError('La contraseña tiene que combinar letras y números.')
        return
    }

    if (password !== passwordConfirm) {
      setError('Las contraseñas no coinciden.')
      return
    }

    setCargando(true)

    const { error: authError } = await supabase.auth.updateUser({
      password,
    })

    if (authError) {
      setError('No se pudo actualizar la contraseña. El enlace puede haber expirado. Pedí uno nuevo.')
      setCargando(false)
      return
    }

    setActualizado(true)
    setCargando(false)

    // Redirigir al inicio después de 3 segundos
    setTimeout(() => router.push('/'), 3000)
  }

  if (actualizado) {
    return (
      <main className="min-h-screen flex items-center justify-center px-4 bg-white">
        <div className="w-full max-w-sm text-center">
          <div className="text-4xl mb-4">✓</div>
          <h1 className="text-xl font-bold text-gray-900 mb-2">¡Contraseña actualizada!</h1>
          <p className="text-sm text-gray-400">Te redirigimos al inicio...</p>
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
          <h1 className="text-xl font-bold text-gray-900">Nueva contraseña</h1>
          <p className="text-sm text-gray-400 mt-1">Elegí una nueva contraseña para tu cuenta</p>
        </div>

        <form onSubmit={actualizar} className="space-y-4">
          <div>
            <label className="block text-sm text-gray-600 mb-1">Nueva contraseña</label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Mínimo 8 caracteres, letras y números"
              className="w-full px-4 py-3 border border-gray-200 rounded-xl text-sm focus:outline-none focus:border-[#8B7EC8]"
            />
          </div>

          <div>
            <label className="block text-sm text-gray-600 mb-1">Repetir contraseña</label>
            <input
              type="password"
              value={passwordConfirm}
              onChange={(e) => setPasswordConfirm(e.target.value)}
              placeholder="Repetí la contraseña"
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
            {cargando ? 'Actualizando...' : 'Actualizar contraseña'}
          </button>
        </form>

        <p className="text-center text-sm text-gray-400 mt-6">
          <Link href="/recuperar-contrasena" className="text-[#8B7EC8] hover:text-[#7a6db7]">
            Pedir un nuevo enlace
          </Link>
        </p>

      </div>
    </main>
  )
}