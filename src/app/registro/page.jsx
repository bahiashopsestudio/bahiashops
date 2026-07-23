'use client'

import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import Navbar from '@/components/Navbar'
import MenuTakeover from '@/components/MenuTakeover'

const MENU_CATEGORIAS = ['moda','belleza-y-cuidado-personal','gastronomia','hogar-deco-y-jardin','diseno-y-artesanias','tecnologia','salud-y-bienestar','arte-e-ilustracion']

export default function RegistroPage() {
  const supabase = createClient()
  const router = useRouter()

  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [nombre, setNombre] = useState('')
  const [error, setError] = useState(null)
  const [cargando, setCargando] = useState(false)
  const [enviado, setEnviado] = useState(false)
  const [menuOpen, setMenuOpen] = useState(false)
  const [categorias, setCategorias] = useState([])

  useEffect(() => {
    if (menuOpen) { document.body.style.overflow = 'hidden' } else { document.body.style.overflow = '' }
    return () => { document.body.style.overflow = '' }
  }, [menuOpen])

  useEffect(() => {
    async function cargarCats() {
      const { data } = await supabase.from('categorias').select('id, nombre, slug').eq('activa', true).order('orden')
      if (data) setCategorias(data)
    }
    cargarCats()
  }, [])

  async function registrarConGoogle() {
    const { error } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: { redirectTo: `${window.location.origin}/auth/callback` },
    })
    if (error) setError(error.message)
  }

  async function registrarConEmail(e) {
    e.preventDefault()
    setError(null)
    setCargando(true)

    const { error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        data: { nombre_completo: nombre },
        emailRedirectTo: `${window.location.origin}/auth/callback`,
      },
    })

    if (error) {
      if (error.message.includes('already registered')) {
        setError('Este email ya está registrado. Probá iniciar sesión.')
      } else {
        setError(error.message)
      }
      setCargando(false)
      return
    }

    setEnviado(true)
    setCargando(false)
  }

  const menuCats = MENU_CATEGORIAS.map(s => categorias.find(c => c.slug === s)).filter(Boolean)

  return (
    <>
      <link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Inter:wght@200;300;400;500;600;700;800;900&display=swap" />

      <div className="min-h-screen bg-white" style={{ fontFamily: "'Inter', sans-serif" }}>
        {menuOpen && <MenuTakeover categorias={menuCats} onClose={() => setMenuOpen(false)} />}
        <Navbar onToggleMenu={() => setMenuOpen(!menuOpen)} variant="solid" />

        <div className="pt-20 pb-24 px-4">
          <div className="max-w-sm mx-auto mt-8">

            {enviado ? (
              <div className="text-center">
                <div className="w-16 h-16 rounded-full bg-green-50 flex items-center justify-center mx-auto mb-6">
                  <svg className="w-8 h-8 text-green-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M21.75 6.75v10.5a2.25 2.25 0 0 1-2.25 2.25h-15a2.25 2.25 0 0 1-2.25-2.25V6.75m19.5 0A2.25 2.25 0 0 0 19.5 4.5h-15a2.25 2.25 0 0 0-2.25 2.25m19.5 0v.243a2.25 2.25 0 0 1-1.07 1.916l-7.5 4.615a2.25 2.25 0 0 1-2.36 0L3.32 8.91a2.25 2.25 0 0 1-1.07-1.916V6.75" />
                  </svg>
                </div>
                <h1 className="text-2xl font-black text-[#0a0a0a] tracking-tight mb-2">¡Revisá tu email!</h1>
                <p className="text-[#0a0a0a]/40 font-light leading-relaxed">
                  Te enviamos un link de confirmación a <span className="text-[#0a0a0a] font-medium">{email}</span>. Hacé clic en el link para activar tu cuenta.
                </p>
                <button
                  type="button"
                  onClick={() => router.push('/login')}
                  className="mt-8 bg-[#0a0a0a] text-white px-8 py-3.5 rounded-full text-sm font-medium hover:bg-[#2a2a2a] transition cursor-pointer"
                >
                  Ir a iniciar sesión
                </button>
              </div>
            ) : (
              <>
                <h1 className="text-2xl font-black text-[#0a0a0a] tracking-tight text-center mb-8">
                  Creá tu cuenta
                </h1>

                {/* Google */}
                <button
                  type="button"
                  onClick={registrarConGoogle}
                  className="w-full flex items-center justify-center gap-3 py-3 border border-[#0a0a0a]/10 rounded-full text-sm font-medium text-[#0a0a0a] hover:bg-[#F5F2EC] transition cursor-pointer"
                >
                  <svg className="w-5 h-5" viewBox="0 0 24 24">
                    <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z" fill="#4285F4"/>
                    <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
                    <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05"/>
                    <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/>
                  </svg>
                  Registrarse con Google
                </button>

                {/* Separador */}
                <div className="flex items-center gap-4 my-6">
                  <div className="flex-1 h-px bg-[#0a0a0a]/5" />
                  <span className="text-xs text-[#0a0a0a]/20 font-light">o con email</span>
                  <div className="flex-1 h-px bg-[#0a0a0a]/5" />
                </div>

                {/* Form */}
                <div>
                  <div className="mb-4">
                    <label className="block text-sm text-[#0a0a0a]/40 font-light mb-1.5">Nombre</label>
                    <input
                      type="text"
                      value={nombre}
                      onChange={(e) => setNombre(e.target.value)}
                      className="w-full px-4 py-3 rounded-xl border border-[#0a0a0a]/10 text-sm text-[#0a0a0a] focus:outline-none focus:border-[#0a0a0a]/30 transition bg-white"
                      placeholder="Tu nombre"
                    />
                  </div>

                  <div className="mb-4">
                    <label className="block text-sm text-[#0a0a0a]/40 font-light mb-1.5">Email</label>
                    <input
                      type="email"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      className="w-full px-4 py-3 rounded-xl border border-[#0a0a0a]/10 text-sm text-[#0a0a0a] focus:outline-none focus:border-[#0a0a0a]/30 transition bg-white"
                      placeholder="tu@email.com"
                    />
                  </div>

                  <div className="mb-6">
                    <label className="block text-sm text-[#0a0a0a]/40 font-light mb-1.5">Contraseña</label>
                    <input
                      type="password"
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      className="w-full px-4 py-3 rounded-xl border border-[#0a0a0a]/10 text-sm text-[#0a0a0a] focus:outline-none focus:border-[#0a0a0a]/30 transition bg-white"
                      placeholder="Mínimo 6 caracteres"
                    />
                  </div>

                  {error && (
                    <div className="bg-red-50 text-[#e60000] text-sm p-3 rounded-xl mb-4 font-light">
                      {error}
                    </div>
                  )}

                  <button
                    type="button"
                    onClick={registrarConEmail}
                    disabled={cargando || !email || !password || !nombre}
                    className={`w-full py-3.5 rounded-full text-sm font-medium transition cursor-pointer ${
                      cargando || !email || !password || !nombre
                        ? 'bg-[#0a0a0a]/10 text-[#0a0a0a]/20 cursor-not-allowed'
                        : 'bg-[#0a0a0a] text-white hover:bg-[#2a2a2a]'
                    }`}
                  >
                    {cargando ? 'Creando cuenta...' : 'Crear cuenta'}
                  </button>
                </div>

                <p className="text-center text-sm text-[#0a0a0a]/30 font-light mt-6">
                  ¿Ya tenés cuenta?{' '}
                  <Link href="/login" className="text-[#0a0a0a] font-medium underline underline-offset-2">
                    Iniciá sesión
                  </Link>
                </p>
              </>
            )}

          </div>
        </div>
      </div>
    </>
  )
}