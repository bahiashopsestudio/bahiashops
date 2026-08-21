// src/components/Footer.jsx
'use client'

import Link from 'next/link'
import { EMAIL_ARREPENTIMIENTO, EMAIL_CONTACTO } from '@/lib/contacto'

export default function Footer() {
  return (
    <>
      <link
        rel="stylesheet"
        href="https://fonts.googleapis.com/css2?family=Poppins:wght@300;400;500&display=swap"
      />
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
            <p style={{ fontFamily: "'Inter', sans-serif", fontWeight: 600, fontSize: '18px', letterSpacing: '-0.01em' }}>
              Bahía Shops
            </p>
            <p style={{ fontFamily: 'Poppins, sans-serif', fontWeight: 300, fontSize: '14px', color: '#9cc3ea', marginTop: '4px' }}>
              Lo que buscás ya está en tu ciudad.
            </p>
            <p style={{ fontFamily: "'Inter', sans-serif", fontWeight: 400, fontSize: '13px', color: '#9cc3ea', marginTop: '12px' }}>
              <a
                href={`mailto:${EMAIL_CONTACTO}`}
                className="underline underline-offset-2 hover:text-[#9cc3ea] transition-colors"
              >
                {EMAIL_CONTACTO}
              </a>
            </p>
          </div>

          {/* Columna derecha: links */}
          <div
            className="flex flex-col gap-2"
            style={{ fontFamily: "'Inter', sans-serif", fontWeight: 400, fontSize: '13px', color: '#9cc3ea' }}
          >
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
        <div
          className="flex flex-col sm:flex-row sm:items-center gap-4 sm:gap-6"
          style={{ fontFamily: "'Inter', sans-serif", fontWeight: 400, fontSize: '12px', color: '#9cc3ea' }}
        >

          {/* Botón de arrepentimiento — Resolución 424/2020 */}
          <a
            href={`mailto:${EMAIL_ARREPENTIMIENTO}?subject=Solicitud%20de%20arrepentimiento%20-%20Ley%2024.240`}
            className="inline-flex items-center gap-1.5 px-4 py-2 rounded-full transition-colors"
            style={{
              fontFamily: "'Inter', sans-serif",
              fontWeight: 500,
              fontSize: '12px',
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

        {/* Desarrollado por */}
        <div
          className="flex flex-wrap items-center gap-1.5"
          style={{ fontFamily: 'Poppins, sans-serif', fontWeight: 300, fontSize: '12px', color: '#9cc3ea', marginTop: '24px' }}
        >
          <span>Desarrollado por</span>
          <Link
            href="/local-shops"
            className="hover:text-[#9cc3ea] transition-colors underline underline-offset-2"
            style={{ fontFamily: "'Inter', sans-serif", fontWeight: 400 }}
          >
            Local Shops
          </Link>
          <span>y</span>
          <a
            href="https://www.instagram.com/planmaterial/"
            target="_blank"
            rel="noopener noreferrer"
            className="hover:text-[#9cc3ea] transition-colors underline underline-offset-2"
            style={{ fontFamily: "'Inter', sans-serif", fontWeight: 400 }}
          >
            Plan Material
          </a>
        </div>

        {/* Copyright */}
        <p
          style={{ fontFamily: 'Poppins, sans-serif', fontWeight: 300, fontSize: '12px', color: '#9cc3ea', marginTop: '8px' }}
        >
          © {new Date().getFullYear()} Bahía Shops. Bahía Blanca, Argentina.
        </p>

      </div>
      </footer>
    </>
  )
}