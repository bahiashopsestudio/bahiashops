'use client'

import { useState } from 'react'
import ModalContacto from '@/components/ModalContacto'

export default function BotonContacto() {
  const [abierto, setAbierto] = useState(false)

  return (
    <>
      {/* Botón flotante */}
      <button
        onClick={() => setAbierto(true)}
        className="fixed z-[900] w-12 h-12 rounded-full bg-[#0071bc] hover:bg-transparent text-white hover:text-[#0071bc] border border-[#0071bc] shadow-lg flex items-center justify-center transition-colors cursor-pointer bottom-20 right-4 lg:bottom-6 lg:right-6"
        aria-label="Contacto"
      >
        <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M21.75 6.75v10.5a2.25 2.25 0 0 1-2.25 2.25h-15a2.25 2.25 0 0 1-2.25-2.25V6.75m19.5 0A2.25 2.25 0 0 0 19.5 4.5h-15a2.25 2.25 0 0 0-2.25 2.25m19.5 0v.243a2.25 2.25 0 0 1-1.07 1.916l-7.5 4.615a2.25 2.25 0 0 1-2.36 0L3.32 8.91a2.25 2.25 0 0 1-1.07-1.916V6.75" />
        </svg>
      </button>

      <ModalContacto abierto={abierto} onClose={() => setAbierto(false)} />
    </>
  )
}
