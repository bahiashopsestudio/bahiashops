import Link from 'next/link'

export default function VolverAtras({ href = '/', texto = 'Volver' }) {
  return (
    <Link
      href={href}
      className="inline-flex items-center gap-2 text-[#0a0a0a]/40 hover:text-[#0a0a0a] text-sm font-light transition mb-6"
    >
      <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M10.5 19.5 3 12m0 0 7.5-7.5M3 12h18" />
      </svg>
      {texto}
    </Link>
  )
}