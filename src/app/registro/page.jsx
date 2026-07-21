'use client'

import { useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import Link from 'next/link'

export default function RegistroPage() {
  const supabase = createClient()

  const [nombre, setNombre] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [passwordConfirm, setPasswordConfirm] = useState('')
  const [error, setError] = useState('')
  const [cargando, setCargando] = useState(false)
  const [enviado, setEnviado] = useState(false)

  async function registrar(e) {
    e.preventDefault()
    setError('')

    if (!nombre.trim()) {
        setError('Completá tu nombre y apellido.')
        return
    }

    if (!email.trim() || !password) {
      setError('Completá email y contraseña.')
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

    const { error: authError } = await supabase.auth.signUp({
      email: email.trim(),
      password,
      options: {
        data: {
          full_name: nombre.trim() || null,
        },
        emailRedirectTo: `${window.location.origin}/auth/callback`,
      },
    })

    if (authError) {
      if (authError.message.includes('already registered')) {
        setError('Este email ya tiene una cuenta. Probá iniciar sesión.')
      } else {
        setError('No se pudo crear la cuenta. Probá de nuevo.')
      }
      setCargando(false)
      return
    }

    setEnviado(true)
    setCargando(false)
  }

  async function registrarConGoogle() {
    const { error } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: {
        redirectTo: `${window.location.origin}/auth/callback`,
      },
    })

    if (error) {
      setError('Hubo un error con Google. Probá de nuevo.')
    }
  }

  // Pantalla de confirmación después del registro
  if (enviado) {
    return (
      <main className="min-h-screen flex items-center justify-center px-4 bg-white">
        <div className="w-full max-w-sm text-center">
          <div className="text-4xl mb-4">✉️</div>
          <h1 className="text-xl font-bold text-gray-900 mb-2">Revisá tu email</h1>
          <p className="text-sm text-gray-500 mb-2">
            Te enviamos un enlace de confirmación a:
          </p>
          <p className="text-sm font-semibold text-gray-900 mb-6">{email}</p>
          <p className="text-sm text-gray-400 mb-6">
            Hacé click en el enlace del email para activar tu cuenta. Si no lo ves, revisá la carpeta de spam.
          </p>
          <Link
            href="/login"
            className="inline-block px-6 py-3 bg-[#222] text-white rounded-xl text-sm font-semibold hover:bg-[#333] transition"
          >
            Ir a iniciar sesión
          </Link>
        </div>
      </main>
    )
  }

  return (
    <main className="min-h-screen flex items-center justify-center px-4 bg-white">
      <div className="w-full max-w-sm">

        {/* Logo */}
        <div className="text-center mb-8">
          <Link href="/">
            <img
              src="/images/logo-bahiashops.png"
              alt="Bahía Shops"
              className="h-10 mx-auto mb-4 object-contain"
            />
          </Link>
          <h1 className="text-xl font-bold text-gray-900">Creá tu cuenta</h1>
          <p className="text-sm text-gray-400 mt-1">Registrate en Bahía Shops</p>
        </div>

        {/* Formulario */}
        <form onSubmit={registrar} className="space-y-4">
          <div>
            <label className="block text-sm text-gray-600 mb-1">Nombre y Apellido</label>
            <input
              type="text"
              value={nombre}
              onChange={(e) => setNombre(e.target.value)}
              placeholder="Tu nombre"
              className="w-full px-4 py-3 border border-gray-200 rounded-xl text-sm focus:outline-none focus:border-[#8B7EC8]"
            />
          </div>

          <div>
            <label className="block text-sm text-gray-600 mb-1">Email</label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="tu@email.com"
              className="w-full px-4 py-3 border border-gray-200 rounded-xl text-sm focus:outline-none focus:border-[#8B7EC8]"
            />
          </div>

          <div>
            <label className="block text-sm text-gray-600 mb-1">Contraseña</label>
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
            {cargando ? 'Creando cuenta...' : 'Crear cuenta'}
          </button>
        </form>

        {/* Separador */}
        <div className="flex items-center gap-3 my-6">
          <div className="flex-1 h-px bg-gray-200" />
          <span className="text-xs text-gray-400">o</span>
          <div className="flex-1 h-px bg-gray-200" />
        </div>

        {/* Google */}
        <button
          onClick={registrarConGoogle}
          className="w-full py-3 border border-gray-200 rounded-xl text-sm font-medium text-gray-700 hover:bg-gray-50 transition cursor-pointer flex items-center justify-center gap-3"
        >
          <svg className="w-5 h-5" viewBox="0 0 24 24">
            <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z" fill="#4285F4"/>
            <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
            <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05"/>
            <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/>
          </svg>
          Continuar con Google
        </button>

        {/* Link a login */}
        <p className="text-center text-sm text-gray-400 mt-6">
          ¿Ya tenés cuenta?{' '}
          <Link href="/login" className="text-[#8B7EC8] font-medium hover:text-[#7a6db7]">
            Iniciá sesión
          </Link>
        </p>

      </div>
    </main>
  )
}
