'use client'

import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import Navbar from '@/components/Navbar'
import MenuTakeover from '@/components/MenuTakeover'

const MENU_CATEGORIAS = ['moda','belleza-y-bienestar','joyeria-y-accesorios','hogar-y-deco','artes-y-oficios','bebes-y-maternidad','juegos-y-juguetes','mascotas','libros','deporte','vintage']

export default function LoginPage() {
  const supabase = createClient()
  const router = useRouter()

  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState(null)
  const [cargando, setCargando] = useState(false)
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

  async function loginConGoogle() {
    const { error } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: { redirectTo: `${window.location.origin}/auth/callback` },
    })
    if (error) setError(error.message)
  }

  async function loginConEmail(e) {
    e.preventDefault()
    setError(null)
    setCargando(true)

    const { error } = await supabase.auth.signInWithPassword({ email, password })

    if (error) {
      if (error.message === 'Invalid login credentials') {
        setError('Email o contraseña incorrectos.')
      } else {
        setError(error.message)
      }
      setCargando(false)
      return
    }

    router.push('/')
    router.refresh()
  }

  const menuCats = MENU_CATEGORIAS.map(s => categorias.find(c => c.slug === s)).filter(Boolean)

  return (
    <>
      <link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Inter:wght@200;300;400;500;600;700;800;900&display=swap" />
      <link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Fraunces:opsz,wght@9..144,100..900&display=swap" />

      <div className="min-h-screen bg-white" style={{ fontFamily: "'Inter', sans-serif" }}>
        {menuOpen && <MenuTakeover categorias={menuCats} onClose={() => setMenuOpen(false)} />}
        <Navbar onToggleMenu={() => setMenuOpen(!menuOpen)} variant="solid" />

        <div className="pt-20 pb-24 px-4">
          <div className="max-w-sm mx-auto mt-8">

            <div className="flex flex-col items-center text-center mb-8">
              <img
                src="/images/logo-negro-bahia-shops.png"
                alt="Bahía Shops"
                className="h-8 w-auto mb-5"
              />
              <h1
                style={{
                  fontFamily: 'Fraunces, serif',
                  fontWeight: 500,
                  fontSize: '28px',
                  color: '#0a0a0a',
                  letterSpacing: '-0.02em',
                }}
              >
                Iniciá sesión
              </h1>
            </div>

            {/* Google */}
            <button
              type="button"
              onClick={loginConGoogle}
              className="w-full flex items-center justify-center gap-3 border border-[#0a0a0a]/10 text-[#0a0a0a] hover:border-[#0a0a0a]/30 transition-colors cursor-pointer"
              style={{
                fontFamily: "'Inter', sans-serif",
                fontWeight: 500,
                fontSize: '14px',
                borderRadius: '4px',
                padding: '13px 24px',
              }}
            >
              <svg className="w-5 h-5" viewBox="0 0 24 24">
                <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z" fill="#4285F4"/>
                <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
                <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05"/>
                <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/>
              </svg>
              Continuar con Google
            </button>

            {/* Separador */}
            <div className="flex items-center gap-4 my-6">
              <div className="flex-1 h-px bg-[#0a0a0a]/5" />
              <span className="text-xs text-[#0a0a0a]/20 font-light">o con email</span>
              <div className="flex-1 h-px bg-[#0a0a0a]/5" />
            </div>

            {/* Form email */}
            <div>
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

              <div className="mb-2">
                <label className="block text-sm text-[#0a0a0a]/40 font-light mb-1.5">Contraseña</label>
                <input
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="w-full px-4 py-3 rounded-xl border border-[#0a0a0a]/10 text-sm text-[#0a0a0a] focus:outline-none focus:border-[#0a0a0a]/30 transition bg-white"
                  placeholder="Tu contraseña"
                />
              </div>

              <div className="text-right mb-6">
                <Link href="/recuperar-contrasena" className="text-xs text-[#0a0a0a]/30 font-light hover:text-[#0a0a0a] transition">
                  ¿Olvidaste tu contraseña?
                </Link>
              </div>

              {error && (
                <div className="bg-red-50 text-[#dc2626] text-sm p-3 rounded-xl mb-4 font-light">
                  {error}
                </div>
              )}

              <button
                type="button"
                onClick={loginConEmail}
                disabled={cargando || !email || !password}
                className={`w-full transition-colors cursor-pointer border ${
                  cargando || !email || !password
                    ? 'bg-[#0a0a0a]/10 text-[#0a0a0a]/20 border-transparent cursor-not-allowed'
                    : 'bg-[#0a0a0a] text-white border-[#0a0a0a] hover:bg-transparent hover:text-[#0a0a0a]'
                }`}
                style={{
                  fontFamily: "'Inter', sans-serif",
                  fontWeight: 500,
                  fontSize: '14px',
                  borderRadius: '4px',
                  padding: '14px 28px',
                }}
              >
                {cargando ? 'Entrando...' : 'Iniciar sesión'}
              </button>
            </div>

            {/* Link a registro */}
            <p className="text-center text-sm text-[#0a0a0a]/30 font-light mt-6">
              ¿No tenés cuenta?{' '}
              <Link href="/registro" className="text-[#0a0a0a] font-medium underline underline-offset-2">
                Registrate
              </Link>
            </p>

          </div>
        </div>
      </div>
    </>
  )
}