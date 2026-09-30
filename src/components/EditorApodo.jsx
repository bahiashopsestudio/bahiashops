'use client'

// El bloque para elegir apodo: lo usan la bienvenida y el perfil. No guarda
// nada: le avisa a quien lo usa qué apodo quedó elegido, y quien lo usa
// guarda con /api/cuenta/apodo. La imagen es siempre el dibujo del apodo: por
// ahora no hay nada que elegir.
//
// Props:
//   apodoInicial        el apodo que ya tiene la cuenta (el que asignó la base)
//   onCambiarApodo(a)   cada vez que cambia el apodo elegido

import { useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import AvatarApodo from '@/components/AvatarApodo'

const estiloBoton = { fontFamily: "'Inter', sans-serif", fontWeight: 500, fontSize: '13px', borderRadius: '4px', padding: '10px 14px' }

function IconoDado() {
  return (
    <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.6} aria-hidden="true">
      <rect x="3.5" y="3.5" width="17" height="17" rx="3.5" />
      <circle cx="8.5" cy="8.5" r="1.2" fill="currentColor" stroke="none" />
      <circle cx="15.5" cy="8.5" r="1.2" fill="currentColor" stroke="none" />
      <circle cx="12" cy="12" r="1.2" fill="currentColor" stroke="none" />
      <circle cx="8.5" cy="15.5" r="1.2" fill="currentColor" stroke="none" />
      <circle cx="15.5" cy="15.5" r="1.2" fill="currentColor" stroke="none" />
    </svg>
  )
}

function IconoLapiz() {
  return (
    <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.6} aria-hidden="true">
      <path strokeLinecap="round" strokeLinejoin="round" d="m16.86 4.49 2.65 2.65M4.5 19.5l3.9-.87L19.1 7.94a1.5 1.5 0 0 0 0-2.12l-.92-.92a1.5 1.5 0 0 0-2.12 0L5.37 15.6 4.5 19.5Z" />
    </svg>
  )
}

export default function EditorApodo({ apodoInicial = '', onCambiarApodo }) {
  const supabase = createClient()

  const [azar, setAzar] = useState(apodoInicial)
  const [propio, setPropio] = useState('')
  const [escribiendo, setEscribiendo] = useState(false)
  const [tirando, setTirando] = useState(false)
  const [errorDado, setErrorDado] = useState('')

  const apodoElegido = escribiendo ? propio : azar

  function avisar(apodo) {
    onCambiarApodo?.(apodo)
  }

  // "Dame otro": un apodo libre nuevo. No se guarda hasta que la persona
  // confirme. Si estaba escribiendo el suyo, vuelve al azar.
  async function dameOtro() {
    setTirando(true)
    setErrorDado('')
    const { data, error } = await supabase.rpc('generar_apodo')
    setTirando(false)
    if (error || !data) {
      setErrorDado('No pudimos buscar otro apodo. Probá de nuevo.')
      return
    }
    setAzar(data)
    setEscribiendo(false)
    avisar(data)
  }

  function alternarEscritura() {
    const ahora = !escribiendo
    setEscribiendo(ahora)
    avisar(ahora ? propio : azar)
  }

  function escribir(valor) {
    setPropio(valor)
    avisar(valor)
  }

  return (
    <div>
      {/* Tarjeta del apodo */}
      <div className="bg-white rounded-lg border border-[#0a0a0a]/8 p-6 text-center">
        <div className="flex justify-center mb-4">
          <AvatarApodo apodo={apodoElegido || azar} tamano={112} />
        </div>
        <p
          className="m-0 mb-5 break-words"
          style={{ fontFamily: 'Fraunces, serif', fontWeight: 500, fontSize: '30px', lineHeight: 1.15, color: apodoElegido ? '#0a0a0a' : 'rgba(10,10,10,0.25)' }}
        >
          {apodoElegido || 'Tu apodo'}
        </p>

        <div className="flex gap-2 justify-center flex-wrap">
          <button type="button" onClick={dameOtro} disabled={tirando}
            className={`inline-flex items-center gap-2 border transition-colors ${tirando ? 'bg-[#0a0a0a]/20 text-white border-transparent cursor-wait' : 'bg-[#0a0a0a] text-white border-[#0a0a0a] hover:bg-[#2a2a2a] cursor-pointer'}`}
            style={estiloBoton}>
            <IconoDado />
            {tirando ? 'Buscando...' : 'Dame otro'}
          </button>
          <button type="button" onClick={alternarEscritura}
            className="inline-flex items-center gap-2 border border-[#0a0a0a] text-[#0a0a0a] bg-white hover:bg-[#0a0a0a]/5 transition-colors cursor-pointer"
            style={estiloBoton}>
            <IconoLapiz />
            {escribiendo ? 'Volver al azar' : 'Escribir el mío'}
          </button>
        </div>

        {errorDado && <p className="m-0 mt-3 text-xs text-red-700 font-light">{errorDado}</p>}

        {escribiendo && (
          <div className="mt-5 text-left">
            <label htmlFor="apodo-propio" className="block text-sm text-[#0a0a0a]/50 font-light mb-1.5">Tu apodo</label>
            <input id="apodo-propio" type="text" value={propio} maxLength={30} autoFocus
              onChange={(e) => escribir(e.target.value)}
              className="w-full px-4 py-3 rounded-xl border border-[#0a0a0a]/10 text-sm text-[#0a0a0a] focus:outline-none focus:border-[#4164fe]/60 transition bg-white" />
            <p className="m-0 mt-1.5 text-[12px] text-[#0a0a0a]/45 font-light">
              Tiene que ser único. Sin teléfonos, mails ni links.
            </p>
          </div>
        )}
      </div>
    </div>
  )
}
