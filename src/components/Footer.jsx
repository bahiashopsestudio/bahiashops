// src/components/Footer.jsx
'use client'

import Link from 'next/link'

export default function Footer() {
  return (
    <footer
      className="w-full px-4 md:px-8 pt-15 pb-32"
      style={{
        fontFamily: "'Inter', sans-serif",
        backgroundColor: '#015444',
        color: '#9cc3ea',
      }}
    >
      <div className="max-w-3xl mx-auto">

        {/* Fila principal */}
        <div className="flex flex-col md:flex-row md:items-start md:justify-between gap-8">

          {/* Columna izquierda: marca + contacto */}
          <div>
            <p className="text-lg font-bold tracking-tight">Bahía Shops</p>
            <p className="text-sm mt-1" style={{ color: '#9cc3ea' }}>
              Tu comercio local, online.
            </p>
            <p className="text-sm mt-3" style={{ color: '#9cc3ea' }}>
              <a
                href="mailto:hola@bahiashops.com"
                className="underline underline-offset-2 hover:text-[#9cc3ea] transition-colors"
              >
                hola@bahiashops.com.ar
              </a>
            </p>
          </div>

          {/* Columna derecha: links */}
          <div className="flex flex-col gap-2 text-sm" style={{ color: '#9cc3ea' }}>
            <Link
              href="/terminos"
              className="hover:text-[#9cc3ea] transition-colors underline-offset-2 hover:underline"
            >
              Términos y Condiciones
            </Link>
            <Link
              href="/privacidad"
              className="hover:text-[#9cc3ea] transition-colors underline-offset-2 hover:underline"
            >
              Política de Privacidad
            </Link>
            <div className="flex gap-4 mt-2">
              <a
                href="https://instagram.com/bahiashops"
                target="_blank"
                rel="noopener noreferrer"
                className="hover:text-[#9cc3ea] transition-colors"
              >
                Instagram
              </a>
              <a
                href="https://tiktok.com/@bahiashops"
                target="_blank"
                rel="noopener noreferrer"
                className="hover:text-[#9cc3ea] transition-colors"
              >
                TikTok
              </a>
            </div>
          </div>
        </div>

        {/* Separador */}
        <div
          className="my-8"
          style={{ borderTop: '1px solid rgba(156,195,234,0.35)' }}
        />

        {/* Bloque legal obligatorio */}
        <div className="flex flex-col sm:flex-row sm:items-center gap-4 sm:gap-6 text-xs" style={{ color: '#9cc3ea' }}>

          {/* Botón de arrepentimiento — Resolución 424/2020 */}
          <a
            href="mailto:bahiashops.estudio@gmail.com?subject=Solicitud%20de%20arrepentimiento%20-%20Ley%2024.240"
            className="inline-flex items-center gap-1.5 px-4 py-2 rounded-full text-xs font-medium transition-colors"
            style={{
              backgroundColor: 'rgba(156,195,234,0.16)',
              color: '#9cc3ea',
            }}
            onMouseEnter={(e) => e.currentTarget.style.backgroundColor = 'rgba(156,195,234,0.26)'}
            onMouseLeave={(e) => e.currentTarget.style.backgroundColor = 'rgba(156,195,234,0.16)'}
          >
            Botón de arrepentimiento
          </a>

          {/* Defensa del Consumidor */}
          <a
            href="https://www.argentina.gob.ar/produccion/defensadelconsumidor/formulario"
            target="_blank"
            rel="noopener noreferrer"
            className="hover:text-[#9cc3ea] transition-colors underline underline-offset-2"
          >
            Defensa del Consumidor
          </a>
        </div>

        {/* Copyright */}
        <p
          className="mt-6 text-xs"
          style={{ color: '#9cc3ea' }}
        >
          © {new Date().getFullYear()} Bahía Shops. Bahía Blanca, Argentina.
        </p>

      </div>
    </footer>
  )
}