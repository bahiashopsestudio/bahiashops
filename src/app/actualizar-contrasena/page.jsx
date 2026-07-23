'use client'

import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import Navbar from '@/components/Navbar'
import MenuTakeover from '@/components/MenuTakeover'

const MENU_CATEGORIAS = ['moda','belleza-y-cuidado-personal','gastronomia','hogar-deco-y-jardin','diseno-y-artesanias','tecnologia','salud-y-bienestar','arte-e-ilustracion']

export default function ActualizarContrasenaPage() {
  const supabase = createClient()
  const router = useRouter()
  const [password, setPassword] = useState('')
  const [confirmar, setConfirmar] = useState('')
  const [error, setError] = useState('')
  const [cargando, setCargando] = useState(false)
  const [exito, setExito] = useState(false)
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

  async function actualizar(e) {
    e.preventDefault()
    setError('')

    if (password.length < 6) { setError('La contraseña debe tener al menos 6 caracteres.'); return }
    if (password !== confirmar) { setError('Las contraseñas no coinciden.'); return }

    setCargando(true)
    const { error: authError } = await supabase.auth.updateUser({ password })
    if (authError) { setError('No se pudo actualizar. Probá de nuevo.'); setCargando(false); return }
    setExito(true)
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

            {exito ? (
              <div className="text-center">
                <div className="w-16 h-16 rounded-full bg-green-50 flex items-center justify-center mx-auto mb-6">
                  <svg className="w-8 h-8 text-green-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="m4.5 12.75 6 6 9-13.5" />
                  </svg>
                </div>
                <h1 className="text-2xl font-black text-[#0a0a0a] tracking-tight mb-2">¡Contraseña actualizada!</h1>
                <p className="text-sm text-[#0a0a0a]/40 font-light mb-8">Ya podés usar tu nueva contraseña para iniciar sesión.</p>
                <button
                  type="button"
                  onClick={() => { router.push('/perfil'); router.refresh() }}
                  className="bg-[#0a0a0a] text-white px-8 py-3.5 rounded-full text-sm font-medium hover:bg-[#2a2a2a] transition cursor-pointer"
                >
                  Ir a mi perfil
                </button>
              </div>
            ) : (
              <>
                <h1 className="text-2xl font-black text-[#0a0a0a] tracking-tight text-center mb-2">
                  Nueva contraseña
                </h1>
                <p className="text-sm text-[#0a0a0a]/30 font-light text-center mb-8">
                  Elegí una contraseña nueva para tu cuenta.
                </p>

                <div>
                  <div className="mb-4">
                    <label className="block text-sm text-[#0a0a0a]/40 font-light mb-1.5">Nueva contraseña</label>
                    <input
                      type="password"
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      className="w-full px-4 py-3 rounded-xl border border-[#0a0a0a]/10 text-sm text-[#0a0a0a] focus:outline-none focus:border-[#0a0a0a]/30 transition bg-white"
                      placeholder="Mínimo 6 caracteres"
                    />
                  </div>

                  <div className="mb-6">
                    <label className="block text-sm text-[#0a0a0a]/40 font-light mb-1.5">Repetir contraseña</label>
                    <input
                      type="password"
                      value={confirmar}
                      onChange={(e) => setConfirmar(e.target.value)}
                      className="w-full px-4 py-3 rounded-xl border border-[#0a0a0a]/10 text-sm text-[#0a0a0a] focus:outline-none focus:border-[#0a0a0a]/30 transition bg-white"
                      placeholder="Repetí la contraseña"
                    />
                  </div>

                  {error && (
                    <div className="bg-red-50 text-[#e60000] text-sm p-3 rounded-xl mb-4 font-light">{error}</div>
                  )}

                  <button
                    type="button"
                    onClick={actualizar}
                    disabled={cargando || !password || !confirmar}
                    className={`w-full py-3.5 rounded-full text-sm font-medium transition cursor-pointer ${
                      cargando || !password || !confirmar
                        ? 'bg-[#0a0a0a]/10 text-[#0a0a0a]/20 cursor-not-allowed'
                        : 'bg-[#0a0a0a] text-white hover:bg-[#2a2a2a]'
                    }`}
                  >
                    {cargando ? 'Actualizando...' : 'Actualizar contraseña'}
                  </button>
                </div>

                <p className="text-center text-sm text-[#0a0a0a]/30 font-light mt-6">
                  <Link href="/perfil" className="text-[#0a0a0a] font-medium underline underline-offset-2">
                    Volver al perfil
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