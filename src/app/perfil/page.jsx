'use client'

import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import Navbar from '@/components/Navbar'
import MenuTakeover from '@/components/MenuTakeover'

const MENU_CATEGORIAS = ['moda','belleza-y-cuidado-personal','gastronomia','hogar-deco-y-jardin','diseno-y-artesanias','tecnologia','salud-y-bienestar','arte-e-ilustracion']

export default function PerfilPage() {
  const supabase = createClient()
  const router = useRouter()
  const [user, setUser] = useState(null)
  const [perfil, setPerfil] = useState(null)
  const [cargando, setCargando] = useState(true)
  const [menuOpen, setMenuOpen] = useState(false)
  const [categorias, setCategorias] = useState([])

  useEffect(() => {
    if (menuOpen) { document.body.style.overflow = 'hidden' } else { document.body.style.overflow = '' }
    return () => { document.body.style.overflow = '' }
  }, [menuOpen])

  useEffect(() => {
    async function cargar() {
      const { data: cats } = await supabase.from('categorias').select('id, nombre, slug').eq('activa', true).order('orden')
      if (cats) setCategorias(cats)

      const { data: { user } } = await supabase.auth.getUser()
      if (!user) { router.push('/login'); return }
      setUser(user)

      const { data: perfil } = await supabase
        .from('perfiles')
        .select('*')
        .eq('id', user.id)
        .single()
      setPerfil(perfil)
      setCargando(false)
    }
    cargar()
  }, [])

  async function cerrarSesion() {
    await supabase.auth.signOut()
    router.push('/')
    router.refresh()
  }

  const menuCats = MENU_CATEGORIAS.map(s => categorias.find(c => c.slug === s)).filter(Boolean)

  if (cargando) {
    return (
      <>
        <link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Inter:wght@200;300;400;500;600;700;800;900&display=swap" />
        <div className="min-h-screen bg-white flex items-center justify-center" style={{ fontFamily: "'Inter', sans-serif" }}>
          <span className="text-[#0a0a0a]/30 text-sm font-light">Cargando...</span>
        </div>
      </>
    )
  }

  const nombre = perfil?.nombre_completo || user?.user_metadata?.nombre_completo || user?.user_metadata?.full_name || ''
  const avatar = user?.user_metadata?.avatar_url
  const inicial = nombre ? nombre.charAt(0).toUpperCase() : (user?.email?.charAt(0).toUpperCase() || '?')

  const links = [
    { href: '/mis-pedidos', label: 'Mis pedidos', icon: 'M15.75 10.5V6a3.75 3.75 0 1 0-7.5 0v4.5m11.356-1.993 1.263 12c.07.665-.45 1.243-1.119 1.243H4.25a1.125 1.125 0 0 1-1.12-1.243l1.264-12A1.125 1.125 0 0 1 5.513 7.5h12.974c.576 0 1.059.435 1.119 1.007Z' },
    { href: '/favoritos', label: 'Mis favoritos', icon: 'M21 8.25c0-2.485-2.099-4.5-4.688-4.5-1.935 0-3.597 1.126-4.312 2.733-.715-1.607-2.377-2.733-4.313-2.733C5.1 3.75 3 5.765 3 8.25c0 7.22 9 12 9 12s9-4.78 9-12Z' },
    { href: '/mis-direcciones', label: 'Mis direcciones', icon: 'M15 10.5a3 3 0 1 1-6 0 3 3 0 0 1 6 0Z M19.5 10.5c0 7.142-7.5 11.25-7.5 11.25S4.5 17.642 4.5 10.5a7.5 7.5 0 1 1 15 0Z' },
    { href: '/actualizar-contrasena', label: 'Cambiar contraseña', icon: 'M16.5 10.5V6.75a4.5 4.5 0 1 0-9 0v3.75m-.75 11.25h10.5a2.25 2.25 0 0 0 2.25-2.25v-6.75a2.25 2.25 0 0 0-2.25-2.25H6.75a2.25 2.25 0 0 0-2.25 2.25v6.75a2.25 2.25 0 0 0 2.25 2.25Z' },
  ]

  return (
    <>
      <link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Inter:wght@200;300;400;500;600;700;800;900&display=swap" />

      <div className="min-h-screen bg-white" style={{ fontFamily: "'Inter', sans-serif" }}>
        {menuOpen && <MenuTakeover categorias={menuCats} onClose={() => setMenuOpen(false)} />}
        <Navbar onToggleMenu={() => setMenuOpen(!menuOpen)} variant="solid" />

        <div className="pt-20 pb-24 px-4 md:px-8">
          <div className="max-w-lg mx-auto">

            {/* Avatar + nombre */}
            <div className="flex flex-col items-center mb-10 mt-4">
              {avatar ? (
                <img src={avatar} alt={nombre} className="w-20 h-20 rounded-full object-cover mb-4" />
              ) : (
                <div className="w-20 h-20 rounded-full bg-[#0a0a0a] text-white flex items-center justify-center text-2xl font-bold mb-4">
                  {inicial}
                </div>
              )}
              <h1 className="text-xl font-black text-[#0a0a0a] tracking-tight">
                {nombre || 'Tu cuenta'}
              </h1>
              <p className="text-sm text-[#0a0a0a]/30 font-light mt-1">{user?.email}</p>
            </div>

            {/* Links */}
            <div className="rounded-2xl border border-[#0a0a0a]/5 overflow-hidden mb-6">
              {links.map((link, i) => (
                <Link
                  key={link.href}
                  href={link.href}
                  className={`flex items-center gap-3 px-5 py-4 hover:bg-[#F5F2EC] transition ${
                    i < links.length - 1 ? 'border-b border-[#0a0a0a]/5' : ''
                  }`}
                >
                  <svg className="w-5 h-5 text-[#0a0a0a]/25 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                    <path strokeLinecap="round" strokeLinejoin="round" d={link.icon} />
                  </svg>
                  <span className="flex-1 text-sm text-[#0a0a0a] font-light">{link.label}</span>
                  <svg className="w-4 h-4 text-[#0a0a0a]/15" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="m8.25 4.5 7.5 7.5-7.5 7.5" />
                  </svg>
                </Link>
              ))}
            </div>

            {/* Vendedor */}
            <Link
              href="/vendedor/perfil"
              className="flex items-center gap-3 px-5 py-4 rounded-2xl border border-[#0a0a0a]/5 hover:bg-[#F5F2EC] transition mb-6"
            >
              <svg className="w-5 h-5 text-[#0a0a0a]/25 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M13.5 21v-7.5a.75.75 0 0 1 .75-.75h3a.75.75 0 0 1 .75.75V21m-4.5 0H2.36m11.14 0H18m0 0h3.64m-1.39 0V9.349M3.75 21V9.349m0 0a3.001 3.001 0 0 0 3.75-.615A2.993 2.993 0 0 0 9.75 9.75c.896 0 1.7-.393 2.25-1.016a2.993 2.993 0 0 0 2.25 1.016c.896 0 1.7-.393 2.25-1.015a3.001 3.001 0 0 0 3.75.614m-16.5 0a3.004 3.004 0 0 1-.621-4.72l1.189-1.19A1.5 1.5 0 0 1 5.378 3h13.243a1.5 1.5 0 0 1 1.06.44l1.19 1.189a3 3 0 0 1-.621 4.72M6.75 18h3.75a.75.75 0 0 0 .75-.75V13.5a.75.75 0 0 0-.75-.75H6.75a.75.75 0 0 0-.75.75v3.75c0 .414.336.75.75.75Z" />
              </svg>
              <span className="flex-1 text-sm text-[#0a0a0a] font-light">Mi tienda</span>
              <svg className="w-4 h-4 text-[#0a0a0a]/15" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="m8.25 4.5 7.5 7.5-7.5 7.5" />
              </svg>
            </Link>

            {/* Cerrar sesión */}
            <button
              type="button"
              onClick={cerrarSesion}
              className="w-full py-3.5 border border-[#0a0a0a]/10 rounded-full text-sm text-[#0a0a0a]/40 font-light hover:border-[#e60000]/30 hover:text-[#e60000] transition cursor-pointer"
            >
              Cerrar sesión
            </button>

          </div>
        </div>
      </div>
    </>
  )
}