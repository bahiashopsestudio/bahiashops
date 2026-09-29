// PROVISORIA (parte A): sólo para poder probar el recorrido de entrada. La
// pantalla de verdad viene en la parte B, y es la que va a marcar
// usuarios.bienvenida_vista_en. Mientras tanto, una cuenta nueva pasa por
// acá en cada ingreso.

import Link from 'next/link'
import { rutaInterna } from '@/lib/rutas'

export const metadata = {
  title: 'Bienvenida — Bahía Shops',
  robots: { index: false, follow: false },
}

export default async function BienvenidaPage({ searchParams }) {
  const { next } = await searchParams
  const destino = rutaInterna(typeof next === 'string' ? next : null)

  return (
    <div className="min-h-screen flex items-center justify-center px-4" style={{ backgroundColor: '#faf9f7' }}>
      <div className="text-center">
        <h1 style={{ fontFamily: 'Fraunces, serif', fontWeight: 500, fontSize: '28px', color: '#0a0a0a', margin: '0 0 24px' }}>
          Bienvenida
        </h1>
        <Link
          href={destino}
          className="inline-block bg-[#0a0a0a] text-white"
          style={{ fontFamily: "'Inter', sans-serif", fontWeight: 500, fontSize: '14px', borderRadius: '4px', padding: '14px 28px' }}
        >
          Seguir
        </Link>
      </div>
    </div>
  )
}
