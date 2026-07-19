import Link from 'next/link'

export default function VolverAtras({ href, texto = 'Volver' }) {
  return (
    <Link
      href={href}
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: '0.4rem',
        color: '#666',
        textDecoration: 'none',
        fontSize: '0.9rem',
        marginBottom: '1rem',
      }}
    >
      <svg width="18" height="18" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M10.5 19.5 3 12m0 0 7.5-7.5M3 12h18" />
      </svg>
      {texto}
    </Link>
  )
}
