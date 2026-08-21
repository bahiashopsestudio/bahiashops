'use client'

import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import Navbar from '@/components/Navbar'
import MenuTakeover from '@/components/MenuTakeover'

const MENU_CATEGORIAS = ['moda','belleza-y-bienestar','joyeria-y-accesorios','hogar-y-deco','artes-y-oficios','bebes-y-maternidad','juegos-y-juguetes','mascotas','libros','deporte','vintage']

export default function PerfilPage() {
  const supabase = createClient()
  const router = useRouter()
  const [user, setUser] = useState(null)
  const [perfil, setPerfil] = useState(null)
  const [vendedorSlug, setVendedorSlug] = useState(null)
  const [esVendedor, setEsVendedor] = useState(false)
  const [cargando, setCargando] = useState(true)
  const [menuOpen, setMenuOpen] = useState(false)
  const [categorias, setCategorias] = useState([])
  const [esAdmin, setEsAdmin] = useState(false)

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

      const { data: cuenta } = await supabase
        .from('usuarios')
        .select('es_admin')
        .eq('id', user.id)
        .single()
      if (cuenta?.es_admin) setEsAdmin(true)

      // Cargar slug del vendedor si tiene cuenta
      const { data: vendedor } = await supabase
        .from('vendedores')
        .select('slug')
        .eq('usuario_id', user.id)
        .maybeSingle()
      if (vendedor) setEsVendedor(true)
      if (vendedor?.slug) setVendedorSlug(vendedor.slug)

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
      <link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Fraunces:opsz,wght@9..144,100..900&family=Poppins:wght@300;400;500&display=swap" />

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
              <h1 className="text-[22px]" style={{ fontFamily: 'Fraunces, serif', fontWeight: 500, color: '#0a0a0a' }}>
                {nombre || 'Tu cuenta'}
              </h1>
              <p style={{ fontFamily: 'Poppins, sans-serif', fontWeight: 300, fontSize: '13px', color: 'rgba(10,10,10,0.4)', marginTop: '4px' }}>
                {user?.email}
              </p>
            </div>

            {/* Panel de admin */}
            {esAdmin && (
              <Link
                href="/admin"
                className="flex items-center gap-3 px-5 py-4 rounded-2xl bg-[#0a0a0a] text-white hover:bg-[#1a1a1a] transition mb-6"
              >
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.6} className="shrink-0">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M9.594 3.94c.09-.542.56-.94 1.11-.94h2.593c.55 0 1.02.398 1.11.94l.213 1.281c.063.374.313.686.645.87.074.04.147.083.22.127.325.196.72.257 1.075.124l1.217-.456a1.125 1.125 0 0 1 1.37.49l1.296 2.247a1.125 1.125 0 0 1-.26 1.431l-1.003.827c-.293.24-.438.613-.431.992a6.759 6.759 0 0 1 0 .255c-.007.378.138.75.43.99l1.005.828c.424.35.534.954.26 1.43l-1.298 2.247a1.125 1.125 0 0 1-1.369.49l-1.217-.456c-.355-.133-.75-.072-1.076.124a6.57 6.57 0 0 1-.22.128c-.331.183-.581.495-.644.869l-.213 1.281c-.09.543-.56.94-1.11.94h-2.594c-.55 0-1.02-.397-1.11-.94l-.213-1.281c-.062-.374-.312-.686-.644-.87a6.52 6.52 0 0 1-.22-.127c-.325-.196-.72-.257-1.076-.124l-1.216.456a1.125 1.125 0 0 1-1.37-.49l-1.296-2.247a1.125 1.125 0 0 1 .26-1.431l1.004-.827c.292-.24.437-.613.43-.992a6.932 6.932 0 0 1 0-.255c.007-.378-.138-.75-.43-.99l-1.004-.828a1.125 1.125 0 0 1-.26-1.43l1.297-2.247a1.125 1.125 0 0 1 1.369-.49l1.217.456c.355.133.75.072 1.076-.124.072-.044.146-.087.22-.128.332-.183.582-.495.644-.869l.213-1.28Z" />
                  <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 1 1-6 0 3 3 0 0 1 6 0Z" />
                </svg>
                <span className="flex-1 text-sm font-medium">Panel de Bahía Shops</span>
                <svg className="w-4 h-4 text-white/40" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="m8.25 4.5 7.5 7.5-7.5 7.5" />
                </svg>
              </Link>
            )}

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
            <div className="rounded-2xl border border-[#0a0a0a]/5 overflow-hidden mb-6">
              {esVendedor && (
                <Link
                  href="/vendedor/datos"
                  className="flex items-center gap-3 px-5 py-4 border-b border-[#0a0a0a]/5 hover:bg-[#F5F2EC] transition"
                >
                  <svg className="w-5 h-5 text-[#0a0a0a]/25 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 0 0-3.375-3.375h-1.5A1.125 1.125 0 0 1 13.5 7.125v-1.5a3.375 3.375 0 0 0-3.375-3.375H8.25m2.25 0H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 0 0-9-9Z" />
                  </svg>
                  <span className="flex-1 text-sm text-[#0a0a0a] font-light">Mis datos</span>
                  <svg className="w-4 h-4 text-[#0a0a0a]/15" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="m8.25 4.5 7.5 7.5-7.5 7.5" />
                  </svg>
                </Link>
              )}

              <Link
                href="/vendedor/perfil"
                className="flex items-center gap-3 px-5 py-4 hover:bg-[#F5F2EC] transition"
              >
                <svg className="w-5 h-5 text-[#0a0a0a]/25 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M13.5 21v-7.5a.75.75 0 0 1 .75-.75h3a.75.75 0 0 1 .75.75V21m-4.5 0H2.36m11.14 0H18m0 0h3.64m-1.39 0V9.349M3.75 21V9.349m0 0a3.001 3.001 0 0 0 3.75-.615A2.993 2.993 0 0 0 9.75 9.75c.896 0 1.7-.393 2.25-1.016a2.993 2.993 0 0 0 2.25 1.016c.896 0 1.7-.393 2.25-1.015a3.001 3.001 0 0 0 3.75.614m-16.5 0a3.004 3.004 0 0 1-.621-4.72l1.189-1.19A1.5 1.5 0 0 1 5.378 3h13.243a1.5 1.5 0 0 1 1.06.44l1.19 1.189a3 3 0 0 1-.621 4.72M6.75 18h3.75a.75.75 0 0 0 .75-.75V13.5a.75.75 0 0 0-.75-.75H6.75a.75.75 0 0 0-.75.75v3.75c0 .414.336.75.75.75Z" />
                </svg>
                <span className="flex-1 text-sm text-[#0a0a0a] font-light">Mi tienda</span>
                <svg className="w-4 h-4 text-[#0a0a0a]/15" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="m8.25 4.5 7.5 7.5-7.5 7.5" />
                </svg>
              </Link>

              {vendedorSlug && (
                <Link
                  href={`/tienda/${vendedorSlug}`}
                  className="flex items-center gap-3 px-5 py-4 border-t border-[#0a0a0a]/5 hover:bg-red-50 transition"
                >
                  <span className="w-5 h-5 flex items-center justify-center shrink-0 text-[#4164fe]">
                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M13.5 6H5.25A2.25 2.25 0 0 0 3 8.25v10.5A2.25 2.25 0 0 0 5.25 21h10.5A2.25 2.25 0 0 0 18 18.75V10.5m-10.5 6L21 3m0 0h-5.25M21 3v5.25" />
                    </svg>
                  </span>
                  <span className="flex-1 text-sm text-[#4164fe] font-medium">Ver mi tienda pública</span>
                </Link>
              )}
            </div>

            {/* Cerrar sesión */}
            <button
              type="button"
              onClick={cerrarSesion}
              className="w-full py-3.5 border border-[#0a0a0a]/10 rounded-full text-sm text-[#0a0a0a]/40 font-light hover:border-[#4164fe]/30 hover:text-[#4164fe] transition cursor-pointer"
            >
              Cerrar sesión
            </button>

          </div>
        </div>
      </div>
    </>
  )
}