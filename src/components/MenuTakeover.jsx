'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'

export default function MenuTakeover({ categorias = [], onClose }) {
  const [esAdmin, setEsAdmin] = useState(false)

  useEffect(() => {
    const supabase = createClient()
    async function verificar() {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return
      const { data: perfil } = await supabase
        .from('usuarios')
        .select('es_admin')
        .eq('id', user.id)
        .single()
      if (perfil?.es_admin) setEsAdmin(true)
    }
    verificar()
  }, [])

  return (
    <div className="fixed inset-0 z-[950] bg-[#4164fe] flex flex-col" style={{ fontFamily: "'Inter', sans-serif" }}>
      <div className="flex justify-between items-center px-6 md:px-10 pt-6">
        <Link href="/" onClick={onClose} className="text-xs font-extrabold tracking-[3px] uppercase text-[#0a0a0a]">
          Bahía Shops
        </Link>
        <button
          onClick={onClose}
          className="text-xs font-light text-[#0a0a0a]/40 flex items-center gap-2 cursor-pointer hover:text-[#0a0a0a] transition"
        >
          Cerrar
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M6 18 18 6M6 6l12 12" />
          </svg>
        </button>
      </div>

      <div className="flex-1 flex flex-col justify-center px-8 md:px-16 gap-1 md:gap-2 overflow-y-auto">
        {/* Categorías */}
        {categorias.map((cat) => (
          <Link
            key={cat.slug}
            href={`/categoria/${cat.slug}`}
            onClick={onClose}
            className="text-2xl md:text-4xl font-extralight text-[#0a0a0a] tracking-tight leading-snug hover:text-[#0a0a0a]/30 transition-colors"
          >
            {cat.nombre}
          </Link>
        ))}

        {/* Separador */}
        <div className="h-px bg-[#0a0a0a]/10 my-4 max-w-xs" />

        {/* Secciones */}
        <Link
          href="/mapa"
          onClick={onClose}
          className="text-lg md:text-2xl font-extralight text-[#0a0a0a]/50 tracking-tight leading-snug hover:text-[#0a0a0a] transition-colors"
        >
          Mapa
        </Link>
        <Link
          href="/"
          onClick={onClose}
          className="text-lg md:text-2xl font-extralight text-[#0a0a0a]/50 tracking-tight leading-snug hover:text-[#0a0a0a] transition-colors"
        >
          Descubrí
        </Link>
        <Link
          href="/"
          onClick={onClose}
          className="text-lg md:text-2xl font-extralight text-[#0a0a0a]/50 tracking-tight leading-snug hover:text-[#0a0a0a] transition-colors"
        >
          Historias
        </Link>
        <Link
          href="/sobre-nosotros"
          onClick={onClose}
          className="text-lg md:text-2xl font-extralight text-[#0a0a0a]/50 tracking-tight leading-snug hover:text-[#0a0a0a] transition-colors"
        >
          Quiénes somos
        </Link>

        {esAdmin && (
          <Link
            href="/admin"
            onClick={onClose}
            className="flex items-center gap-2 text-sm md:text-base font-medium text-[#0a0a0a] tracking-tight leading-snug hover:text-[#0a0a0a]/60 transition-colors"
            style={{ marginTop: '18px' }}
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M9.594 3.94c.09-.542.56-.94 1.11-.94h2.593c.55 0 1.02.398 1.11.94l.213 1.281c.063.374.313.686.645.87.074.04.147.083.22.127.325.196.72.257 1.075.124l1.217-.456a1.125 1.125 0 0 1 1.37.49l1.296 2.247a1.125 1.125 0 0 1-.26 1.431l-1.003.827c-.293.24-.438.613-.431.992a6.759 6.759 0 0 1 0 .255c-.007.378.138.75.43.99l1.005.828c.424.35.534.954.26 1.43l-1.298 2.247a1.125 1.125 0 0 1-1.369.49l-1.217-.456c-.355-.133-.75-.072-1.076.124a6.57 6.57 0 0 1-.22.128c-.331.183-.581.495-.644.869l-.213 1.281c-.09.543-.56.94-1.11.94h-2.594c-.55 0-1.02-.397-1.11-.94l-.213-1.281c-.062-.374-.312-.686-.644-.87a6.52 6.52 0 0 1-.22-.127c-.325-.196-.72-.257-1.076-.124l-1.216.456a1.125 1.125 0 0 1-1.37-.49l-1.296-2.247a1.125 1.125 0 0 1 .26-1.431l1.004-.827c.292-.24.437-.613.43-.992a6.932 6.932 0 0 1 0-.255c.007-.378-.138-.75-.43-.99l-1.004-.828a1.125 1.125 0 0 1-.26-1.43l1.297-2.247a1.125 1.125 0 0 1 1.369-.49l1.217.456c.355.133.75.072 1.076-.124.072-.044.146-.087.22-.128.332-.183.582-.495.644-.869l.213-1.28Z" />
              <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 1 1-6 0 3 3 0 0 1 6 0Z" />
            </svg>
            Panel de Bahía Shops
          </Link>
        )}
      </div>

      <div className="flex justify-between items-end px-6 md:px-10 pb-6">
        <div className="flex gap-4 text-[10px] font-light text-[#0a0a0a]/30 tracking-wide">
          <a href="https://instagram.com/bahiashops" target="_blank" rel="noopener noreferrer" className="hover:text-[#0a0a0a] transition">Instagram</a>
          <a href="https://tiktok.com/@bahiashops" target="_blank" rel="noopener noreferrer" className="hover:text-[#0a0a0a] transition">TikTok</a>
          <a href="https://facebook.com/bahiashops" target="_blank" rel="noopener noreferrer" className="hover:text-[#0a0a0a] transition">Facebook</a>
        </div>
        <span className="text-[10px] font-light text-[#0a0a0a]/30 tracking-wide">
          bahiashops.com.ar
        </span>
      </div>
    </div>
  )
}