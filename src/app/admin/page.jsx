'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'
import Navbar from '@/components/Navbar'
import MenuTakeover from '@/components/MenuTakeover'

const MENU_CATEGORIAS = ['moda','belleza-y-bienestar','joyeria-y-accesorios','hogar-y-deco','artes-y-oficios','bebes-y-maternidad','juegos-y-juguetes','mascotas','libros','deporte','vintage']

function IconoTienda() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.6}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M4 9.5v9A1.5 1.5 0 0 0 5.5 20h13a1.5 1.5 0 0 0 1.5-1.5v-9M2.5 9.5l1.7-4.6A1.5 1.5 0 0 1 5.6 4h12.8a1.5 1.5 0 0 1 1.4.9l1.7 4.6M2.5 9.5a2.25 2.25 0 0 0 4.35 1 2.25 2.25 0 0 0 4.15 0 2.25 2.25 0 0 0 4 0 2.25 2.25 0 0 0 4.35-1M9 20v-5.5a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1V20" />
    </svg>
  )
}

function IconoCheck() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.6}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75 11.25 15 15 9.75M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z" />
    </svg>
  )
}

function IconoRegalo() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.6}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M21 11.25v8.25a1.5 1.5 0 0 1-1.5 1.5H4.5a1.5 1.5 0 0 1-1.5-1.5v-8.25M12 4.875A2.625 2.625 0 1 0 9.375 7.5H12m0-2.625V7.5m0-2.625A2.625 2.625 0 1 1 14.625 7.5H12m0 0V21m-8.625-9.75h18c.621 0 1.125-.504 1.125-1.125v-1.5c0-.621-.504-1.125-1.125-1.125h-18c-.621 0-1.125.504-1.125 1.125v1.5c0 .621.504 1.125 1.125 1.125Z" />
    </svg>
  )
}

function IconoSparkles() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor">
      <path d="M9.813 15.904 9 18.75l-.813-2.846a4.5 4.5 0 0 0-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 0 0 3.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 0 0 3.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 0 0-3.09 3.09ZM18.259 8.715 18 9.75l-.259-1.035a3.375 3.375 0 0 0-2.455-2.456L14.25 6l1.036-.259a3.375 3.375 0 0 0 2.455-2.456L18 2.25l.259 1.035a3.375 3.375 0 0 0 2.456 2.456L21.75 6l-1.035.259a3.375 3.375 0 0 0-2.456 2.456Z" />
    </svg>
  )
}

function IconoCuadrados() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor">
      <path d="M3.75 6A2.25 2.25 0 0 1 6 3.75h2.25A2.25 2.25 0 0 1 10.5 6v2.25a2.25 2.25 0 0 1-2.25 2.25H6a2.25 2.25 0 0 1-2.25-2.25V6ZM3.75 15.75A2.25 2.25 0 0 1 6 13.5h2.25a2.25 2.25 0 0 1 2.25 2.25V18a2.25 2.25 0 0 1-2.25 2.25H6A2.25 2.25 0 0 1 3.75 18v-2.25ZM13.5 6a2.25 2.25 0 0 1 2.25-2.25H18A2.25 2.25 0 0 1 20.25 6v2.25A2.25 2.25 0 0 1 18 10.5h-2.25a2.25 2.25 0 0 1-2.25-2.25V6ZM13.5 15.75a2.25 2.25 0 0 1 2.25-2.25H18a2.25 2.25 0 0 1 2.25 2.25V18A2.25 2.25 0 0 1 18 20.25h-2.25A2.25 2.25 0 0 1 13.5 18v-2.25Z" />
    </svg>
  )
}

function IconoBombilla() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.6}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M9 18h6M10 21h4M12 3a6 6 0 0 0-3.5 10.9c.5.36.8.95.8 1.58V16h5.4v-.52c0-.63.3-1.22.8-1.58A6 6 0 0 0 12 3Z" />
    </svg>
  )
}

function Tarjeta({ href, disabled, icono, iconoFondo, iconoColor, titulo, desc, badge, badgeTipo, flecha }) {
  const [hover, setHover] = useState(false)

  const contenido = (
    <div
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      style={{
        position: 'relative',
        backgroundColor: '#ffffff',
        borderRadius: '10px',
        padding: '28px',
        border: `1px solid ${hover && !disabled ? 'rgba(10,10,10,0.12)' : 'rgba(10,10,10,0.06)'}`,
        boxShadow: hover && !disabled ? '0 2px 12px rgba(10,10,10,0.04)' : 'none',
        minHeight: '160px',
        display: 'flex',
        flexDirection: 'column',
        opacity: disabled ? 0.55 : 1,
        cursor: disabled ? 'default' : 'pointer',
        transition: 'border-color 200ms ease, box-shadow 200ms ease',
      }}
    >
      {badge && (
        <span
          style={{
            position: 'absolute',
            top: '20px',
            right: '20px',
            borderRadius: '999px',
            fontSize: '11px',
            fontWeight: 500,
            padding: '3px 10px',
            backgroundColor: badgeTipo === 'rojo' ? '#cc152b' : badgeTipo === 'proximamente' ? 'rgba(10,10,10,0.06)' : 'rgba(10,10,10,0.06)',
            color: badgeTipo === 'rojo' ? '#ffffff' : badgeTipo === 'proximamente' ? 'rgba(10,10,10,0.35)' : 'rgba(10,10,10,0.5)',
          }}
        >
          {badge}
        </span>
      )}

      <div
        style={{
          width: '36px',
          height: '36px',
          borderRadius: '8px',
          backgroundColor: iconoFondo,
          color: iconoColor,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          marginBottom: '16px',
        }}
      >
        {icono}
      </div>

      <p style={{ fontFamily: "'Inter', sans-serif", fontSize: '15px', fontWeight: 500, color: '#0a0a0a', marginBottom: '6px' }}>
        {titulo}
      </p>
      <p style={{ fontFamily: "'Inter', sans-serif", fontSize: '12px', fontWeight: 300, color: 'rgba(10,10,10,0.5)', lineHeight: 1.5, flex: 1 }}>
        {desc}
      </p>
      <p style={{ fontFamily: "'Inter', sans-serif", fontSize: '12px', fontWeight: 400, color: disabled ? 'rgba(10,10,10,0.25)' : 'rgba(10,10,10,0.3)', marginTop: '14px' }}>
        {flecha}
      </p>
    </div>
  )

  if (disabled) return contenido
  return <Link href={href}>{contenido}</Link>
}

export default function AdminDashboard() {
  const [esAdmin, setEsAdmin] = useState(null)
  const [cargando, setCargando] = useState(true)
  const [menuOpen, setMenuOpen] = useState(false)
  const [categorias, setCategorias] = useState([])
  const [pendientesModeracion, setPendientesModeracion] = useState(0)
  const [vendedoresNuevos, setVendedoresNuevos] = useState(0)
  const [tesorosActivos, setTesorosActivos] = useState(0)
  const [ideasPendientes, setIdeasPendientes] = useState(0)

  const menuCats = MENU_CATEGORIAS.map((s) => categorias.find((c) => c.slug === s)).filter(Boolean)

  useEffect(() => {
    document.body.style.overflow = menuOpen ? 'hidden' : ''
    return () => { document.body.style.overflow = '' }
  }, [menuOpen])

  useEffect(() => {
    const supabase = createClient()

    async function iniciar() {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) { setEsAdmin(false); setCargando(false); return }

      const { data: perfil } = await supabase
        .from('usuarios')
        .select('es_admin')
        .eq('id', user.id)
        .single()

      if (!perfil?.es_admin) { setEsAdmin(false); setCargando(false); return }

      setEsAdmin(true)

      const { data: cats } = await supabase
        .from('categorias')
        .select('id, nombre, slug')
        .eq('activa', true)
        .order('orden')
      if (cats) setCategorias(cats)

      const { count: countModeracion } = await supabase
        .from('productos')
        .select('*', { count: 'exact', head: true })
        .eq('estado', 'en_revision')
      setPendientesModeracion(countModeracion || 0)

      const hace7dias = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString()
      const { count: countNuevos } = await supabase
        .from('vendedores')
        .select('*', { count: 'exact', head: true })
        .gte('creado_en', hace7dias)
      setVendedoresNuevos(countNuevos || 0)

      const { count: countTesoros } = await supabase
        .from('tesoros')
        .select('*', { count: 'exact', head: true })
        .eq('activo', true)
      setTesorosActivos(countTesoros || 0)

      const resIdeas = await fetch('/api/admin/ideas')
      if (resIdeas.ok) {
        const { ideas } = await resIdeas.json()
        setIdeasPendientes(ideas?.length || 0)
      }

      setCargando(false)
    }
    iniciar()
  }, [])

  if (cargando) {
    return (
      <>
        <Navbar variant="solid" />
        <main className="pt-28 px-6 text-center text-[#0a0a0a]/30 text-sm font-light">Cargando...</main>
      </>
    )
  }

  if (!esAdmin) {
    return (
      <>
        <Navbar variant="solid" />
        <main className="pt-28 px-6 text-center">
          <h1 className="text-2xl font-semibold text-[#0a0a0a]">Acceso restringido</h1>
          <p className="text-[#0a0a0a]/40 font-light">Esta página es solo para administradores.</p>
        </main>
      </>
    )
  }

  return (
    <>
      <link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Inter:wght@200;300;400;500;600;700;800;900&display=swap" />
      <link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Fraunces:opsz,wght@9..144,100..900&family=Poppins:wght@300;400;500&display=swap" />

      <div className="min-h-screen bg-[#faf9f7]" style={{ fontFamily: "'Inter', sans-serif" }}>
        {menuOpen && <MenuTakeover categorias={menuCats} onClose={() => setMenuOpen(false)} />}
        <Navbar onToggleMenu={() => setMenuOpen(!menuOpen)} variant="solid" />

        <div className="pt-20">
          <div className="max-w-[900px] mx-auto px-5 md:px-8" style={{ paddingTop: '56px', paddingBottom: '40px' }}>
            <p style={{ fontFamily: "'Inter', sans-serif", fontSize: '10px', textTransform: 'uppercase', letterSpacing: '2px', color: 'rgba(10,10,10,0.3)', marginBottom: '14px' }}>
              Administración
            </p>
            <h1 style={{ fontFamily: 'Fraunces, serif', fontWeight: 500, fontSize: '30px', color: '#0a0a0a' }}>
              Panel de Bahía Shops
            </h1>
            <p style={{ fontFamily: 'Poppins, sans-serif', fontWeight: 300, fontSize: '14px', color: 'rgba(10,10,10,0.45)', marginTop: '10px' }}>
              Todo lo que necesitás para que la plataforma funcione.
            </p>
          </div>

          <div
            className="max-w-[900px] mx-auto px-5 md:px-8 grid grid-cols-1 md:grid-cols-2"
            style={{ paddingBottom: '100px', gap: '16px' }}
          >
            <Tarjeta
              href="/admin/vendedores"
              icono={<IconoTienda />}
              iconoFondo="#e8d4f0"
              iconoColor="#6b3fa0"
              titulo="Vendedores"
              desc="Vendedores registrados, estado de cada tienda, conexión con MercadoPago."
              badge={vendedoresNuevos > 0 ? vendedoresNuevos : null}
              badgeTipo="rojo"
              flecha="Ver vendedores →"
            />
            <Tarjeta
              href="/admin/moderacion"
              icono={<IconoCheck />}
              iconoFondo="#fce4e4"
              iconoColor="#cc152b"
              titulo="Moderación"
              desc="Productos esperando tu revisión. Aprobar, rechazar, pedir cambios."
              badge={pendientesModeracion > 0 ? pendientesModeracion : null}
              badgeTipo="rojo"
              flecha="Ir al panel →"
            />
            <Tarjeta
              disabled
              icono={<IconoRegalo />}
              iconoFondo="#d4e8f0"
              iconoColor="#1a6585"
              titulo="Cápsulas"
              desc="Creá colecciones temáticas e invitá vendedores a sumarse con sus productos."
              badge="Próximamente"
              badgeTipo="proximamente"
              flecha="Próximamente"
            />
            <Tarjeta
              href="/admin/tesoros"
              icono={<IconoSparkles />}
              iconoFondo="#f1f29f"
              iconoColor="#6b6d00"
              titulo="Tesoros"
              desc="Seleccioná productos para la vitrina curada. Elegí destacados, cargá quotes de vendedores."
              badge={tesorosActivos > 0 ? tesorosActivos : null}
              badgeTipo="gris"
              flecha="Gestionar tesoros →"
            />
            <Tarjeta
              disabled
              icono={<IconoCuadrados />}
              iconoFondo="#d0f0e0"
              iconoColor="#1a7a4a"
              titulo="Categorías"
              desc="Activar, desactivar y reordenar las categorías de la plataforma."
              badge="Próximamente"
              badgeTipo="proximamente"
              flecha="Próximamente"
            />
            <Tarjeta
              href="/admin/ideas"
              icono={<IconoBombilla />}
              iconoFondo="#fef3c7"
              iconoColor="#92650a"
              titulo="Ideas pendientes"
              desc="Cosas para retomar más adelante: pestañas ocultas, funciones a medio pensar, mejoras sueltas."
              badge={ideasPendientes > 0 ? ideasPendientes : null}
              badgeTipo="gris"
              flecha="Ver ideas →"
            />
          </div>
        </div>
      </div>
    </>
  )
}
