'use client'

import Link from 'next/link'

export default function MenuTakeover({ categorias = [], onClose }) {
  return (
    <div className="fixed inset-0 z-[60] bg-[#9cc3ea] flex flex-col" style={{ fontFamily: "'Inter', sans-serif" }}>
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
          href="/#mapa"
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