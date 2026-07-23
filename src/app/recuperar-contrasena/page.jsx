'use client'

import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'
import Link from 'next/link'
import Navbar from '@/components/Navbar'
import MenuTakeover from '@/components/MenuTakeover'

const MENU_CATEGORIAS = ['moda','belleza-y-cuidado-personal','gastronomia','hogar-deco-y-jardin','diseno-y-artesanias','tecnologia','salud-y-bienestar','arte-e-ilustracion']

export default function RecuperarContrasenaPage() {
  const supabase = createClient()
  const [email, setEmail] = useState('')
  const [error, setError] = useState('')
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

  async function enviarRecuperacion(e) {
    e.preventDefault()
    setError('')
    if (!email.trim()) { setError('Escribí tu email.'); return }
    setCargando(true)
    const { error: authError } = await supabase.auth.resetPasswordForEmail(email.trim(), {
      redirectTo: `${window.location.origin}/auth/callback?next=/actualizar-contrasena`,
    })
    if (authError) { setError('No se pudo enviar el email. Probá de nuevo.'); setCargando(false); return }
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
                <h1 className="text-2xl font-black text-[#0a0a0a] tracking-tight mb-2">Email enviado</h1>
                <p className="text-sm text-[#0a0a0a]/40 font-light leading-relaxed">
                  Si existe una cuenta con ese email, te enviamos un enlace para restablecer tu contraseña a:
                </p>
                <p className="text-sm font-medium text-[#0a0a0a] mt-2 mb-4">{email}</p>
                <p className="text-xs text-[#0a0a0a]/20 font-light mb-8">
                  Revisá tu casilla (y la carpeta de spam). El enlace expira en 1 hora.
                </p>
                <Link href="/login" className="inline-block bg-[#0a0a0a] text-white px-8 py-3.5 rounded-full text-sm font-medium hover:bg-[#2a2a2a] transition">
                  Volver a iniciar sesión
                </Link>
              </div>
            ) : (
              <>
                <h1 className="text-2xl font-black text-[#0a0a0a] tracking-tight text-center mb-2">
                  Recuperar contraseña
                </h1>
                <p className="text-sm text-[#0a0a0a]/30 font-light text-center mb-8">
                  Te mandamos un enlace para restablecerla
                </p>

                <div>
                  <div className="mb-6">
                    <label className="block text-sm text-[#0a0a0a]/40 font-light mb-1.5">Email de tu cuenta</label>
                    <input
                      type="email"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      className="w-full px-4 py-3 rounded-xl border border-[#0a0a0a]/10 text-sm text-[#0a0a0a] focus:outline-none focus:border-[#0a0a0a]/30 transition bg-white"
                      placeholder="tu@email.com"
                    />
                  </div>

                  {error && (
                    <div className="bg-red-50 text-[#e60000] text-sm p-3 rounded-xl mb-4 font-light">{error}</div>
                  )}

                  <button
                    type="button"
                    onClick={enviarRecuperacion}
                    disabled={cargando || !email}
                    className={`w-full py-3.5 rounded-full text-sm font-medium transition cursor-pointer ${
                      cargando || !email
                        ? 'bg-[#0a0a0a]/10 text-[#0a0a0a]/20 cursor-not-allowed'
                        : 'bg-[#0a0a0a] text-white hover:bg-[#2a2a2a]'
                    }`}
                  >
                    {cargando ? 'Enviando...' : 'Enviar enlace'}
                  </button>
                </div>

                <p className="text-center text-sm text-[#0a0a0a]/30 font-light mt-6">
                  <Link href="/login" className="text-[#0a0a0a] font-medium underline underline-offset-2">
                    ← Volver a iniciar sesión
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