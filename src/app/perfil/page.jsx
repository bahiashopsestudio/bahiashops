'use client'

import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import VolverAtras from '@/components/VolverAtras'

export default function PerfilPage() {
  const supabase = createClient()
  const router = useRouter()

  const [user, setUser] = useState(null)
  const [vendedor, setVendedor] = useState(null)
  const [cargando, setCargando] = useState(true)

  useEffect(() => {
    async function cargar() {
      const { data: { user } } = await supabase.auth.getUser()

      if (!user) {
        router.push('/login')
        return
      }

      setUser(user)

      const { data } = await supabase
        .from('vendedores')
        .select('id, nombre_negocio, slug, logo_url')
        .eq('usuario_id', user.id)
        .single()

      if (data) setVendedor(data)
      setCargando(false)
    }
    cargar()
  }, [])

  async function cerrarSesion() {
    await supabase.auth.signOut()
    router.push('/')
  }

  if (cargando) {
    return (
      <main className="min-h-screen flex items-center justify-center">
        <p className="text-gray-400">Cargando...</p>
      </main>
    )
  }

  const nombre = user?.user_metadata?.full_name || user?.email
  const avatar = user?.user_metadata?.avatar_url
  const email = user?.email

  return (
    <main className="min-h-screen bg-white px-4 pt-20 pb-28 lg:pt-10 lg:pb-10">
      <div className="max-w-lg mx-auto">
        <VolverAtras href="/" texto="Inicio" />

        {/* ── Info del usuario ── */}
        <div className="flex items-center gap-4 mb-8">
          {avatar ? (
            <img
              src={avatar}
              alt={nombre}
              className="w-14 h-14 rounded-full object-cover"
              referrerPolicy="no-referrer"
            />
          ) : (
            <div className="w-14 h-14 rounded-full bg-[#8B7EC8] text-white flex items-center justify-center text-xl font-semibold">
              {nombre?.charAt(0)?.toUpperCase() || '?'}
            </div>
          )}
          <div>
            <h1 className="text-xl font-bold text-gray-900">{nombre}</h1>
            <p className="text-sm text-gray-400">{email}</p>
          </div>
        </div>

        {/* ── Panel vendedor ── */}
        {vendedor ? (
          <section className="mb-6">
            <h2 className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-3">Tu negocio</h2>
            <div className="border border-gray-200 rounded-2xl overflow-hidden">
              <Link
                href="/vendedor/productos"
                className="flex items-center justify-between px-5 py-4 hover:bg-gray-50 transition"
              >
                <div className="flex items-center gap-3">
                  {vendedor.logo_url ? (
                    <img src={vendedor.logo_url} alt="" className="w-10 h-10 rounded-lg object-cover" />
                  ) : (
                    <div className="w-10 h-10 rounded-lg bg-gray-100 flex items-center justify-center text-gray-400 text-xs">logo</div>
                  )}
                  <div>
                    <p className="text-sm font-semibold text-gray-900">{vendedor.nombre_negocio}</p>
                    <p className="text-xs text-gray-400">Mis productos</p>
                  </div>
                </div>
                <svg className="w-4 h-4 text-gray-300" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="m8.25 4.5 7.5 7.5-7.5 7.5" />
                </svg>
              </Link>

              <div className="border-t border-gray-100" />

              <Link
                href="/vendedor/pedidos"
                className="flex items-center justify-between px-5 py-4 hover:bg-gray-50 transition"
              >
                <span className="text-sm text-gray-700">Pedidos de mi negocio</span>
                <svg className="w-4 h-4 text-gray-300" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="m8.25 4.5 7.5 7.5-7.5 7.5" />
                </svg>
              </Link>

              <div className="border-t border-gray-100" />

              <Link
                href="/vendedor/perfil"
                className="flex items-center justify-between px-5 py-4 hover:bg-gray-50 transition"
              >
                <span className="text-sm text-gray-700">Editar tienda</span>
                <svg className="w-4 h-4 text-gray-300" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="m8.25 4.5 7.5 7.5-7.5 7.5" />
                </svg>
              </Link>

              <div className="border-t border-gray-100" />

              <Link
                href={`/tienda/${vendedor.slug}`}
                className="flex items-center justify-between px-5 py-4 hover:bg-gray-50 transition"
              >
                <span className="text-sm text-gray-700">Ver mi tienda pública</span>
                <svg className="w-4 h-4 text-gray-300" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="m8.25 4.5 7.5 7.5-7.5 7.5" />
                </svg>
              </Link>
            </div>
          </section>
        ) : (
          <section className="mb-6">
            <Link
              href="/vendedor/nuevo"
              className="block border-2 border-dashed border-gray-200 rounded-2xl px-5 py-6 text-center hover:border-[#8B7EC8] transition group"
            >
              <p className="text-sm font-semibold text-gray-500 group-hover:text-[#8B7EC8] transition">¿Vendés en Bahía?</p>
              <p className="text-xs text-gray-400 mt-1">Registrá tu emprendimiento y empezá a vender</p>
            </Link>
          </section>
        )}

        {/* ── Mis cosas ── */}
        <section className="mb-6">
          <h2 className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-3">Mi cuenta</h2>
          <div className="border border-gray-200 rounded-2xl overflow-hidden">
            <Link
              href="/mis-pedidos"
              className="flex items-center justify-between px-5 py-4 hover:bg-gray-50 transition"
            >
              <span className="text-sm text-gray-700">Mis compras</span>
              <svg className="w-4 h-4 text-gray-300" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="m8.25 4.5 7.5 7.5-7.5 7.5" />
              </svg>
            </Link>

            <div className="border-t border-gray-100" />

            <Link
              href="/mis-direcciones"
              className="flex items-center justify-between px-5 py-4 hover:bg-gray-50 transition"
            >
              <span className="text-sm text-gray-700">Mis direcciones</span>
              <svg className="w-4 h-4 text-gray-300" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="m8.25 4.5 7.5 7.5-7.5 7.5" />
              </svg>
            </Link>

            <div className="border-t border-gray-100" />

            <Link
              href="/cambiar-contrasena"
              className="flex items-center justify-between px-5 py-4 hover:bg-gray-50 transition"
            >
              <span className="text-sm text-gray-700">Cambiar contraseña</span>
              <svg className="w-4 h-4 text-gray-300" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="m8.25 4.5 7.5 7.5-7.5 7.5" />
              </svg>
            </Link>

          </div>
        </section>

        {/* ── Cerrar sesión ── */}
        <button
          onClick={cerrarSesion}
          className="w-full text-sm text-red-500 hover:text-red-600 py-3 transition cursor-pointer"
        >
          Cerrar sesión
        </button>

      </div>
    </main>
  )
}
