'use client'

import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'

export default function BotonContacto() {
  const supabase = createClient()

  const [abierto, setAbierto] = useState(false)
  const [email, setEmail] = useState('')
  const [mensaje, setMensaje] = useState('')
  const [enviando, setEnviando] = useState(false)
  const [enviado, setEnviado] = useState(false)
  const [userId, setUserId] = useState(null)

  // Si está logueado, pre-llenar el email
  useEffect(() => {
    async function cargarUsuario() {
      const { data: { user } } = await supabase.auth.getUser()
      if (user) {
        setEmail(user.email || '')
        setUserId(user.id)
      }
    }
    cargarUsuario()
  }, [])

  async function enviar(e) {
    e.preventDefault()

    if (!email.trim() || !mensaje.trim()) {
      alert('Completá el email y el mensaje.')
      return
    }

    setEnviando(true)

    try {
      // Guardar en Supabase
      const { error: dbError } = await supabase
        .from('mensajes_contacto')
        .insert({
          email: email.trim(),
          mensaje: mensaje.trim(),
          usuario_id: userId,
        })

      if (dbError) throw dbError

      // Enviar notificación por email
      try {
        await fetch('/api/contacto', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            email: email.trim(),
            mensaje: mensaje.trim(),
          }),
        })
      } catch {
        // Si falla el email, no pasa nada — el mensaje ya está guardado en la DB
        console.log('No se pudo enviar la notificación por email, pero el mensaje quedó guardado.')
      }

      setEnviado(true)
      setMensaje('')

      // Cerrar después de 3 segundos
      setTimeout(() => {
        setEnviado(false)
        setAbierto(false)
      }, 3000)
    } catch (err) {
      console.error(err)
      alert('No se pudo enviar el mensaje. Probá de nuevo.')
    } finally {
      setEnviando(false)
    }
  }

  return (
    <>
      {/* Botón flotante */}
      <button
        onClick={() => setAbierto(true)}
        className="fixed z-40 w-12 h-12 rounded-full bg-[#8B7EC8] hover:bg-[#7a6db7] text-white shadow-lg flex items-center justify-center transition cursor-pointer bottom-20 right-4 lg:bottom-6 lg:right-6"
        aria-label="Contacto"
      >
        <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M21.75 6.75v10.5a2.25 2.25 0 0 1-2.25 2.25h-15a2.25 2.25 0 0 1-2.25-2.25V6.75m19.5 0A2.25 2.25 0 0 0 19.5 4.5h-15a2.25 2.25 0 0 0-2.25 2.25m19.5 0v.243a2.25 2.25 0 0 1-1.07 1.916l-7.5 4.615a2.25 2.25 0 0 1-2.36 0L3.32 8.91a2.25 2.25 0 0 1-1.07-1.916V6.75" />
        </svg>
      </button>

      {/* Modal */}
      {abierto && (
        <div
          className="fixed inset-0 z-50 flex items-end lg:items-center justify-center"
          onClick={() => { if (!enviando) setAbierto(false) }}
        >
          {/* Fondo oscuro */}
          <div className="absolute inset-0 bg-black/40" />

          {/* Formulario */}
          <div
            onClick={(e) => e.stopPropagation()}
            className="relative bg-white rounded-t-2xl lg:rounded-2xl w-full max-w-md mx-auto p-6 shadow-xl"
          >
            {enviado ? (
              <div className="text-center py-6">
                <div className="text-4xl mb-3">✓</div>
                <p className="text-lg font-semibold text-gray-900">¡Mensaje enviado!</p>
                <p className="text-sm text-gray-400 mt-1">Te respondemos pronto a tu email</p>
              </div>
            ) : (
              <>
                <div className="flex items-center justify-between mb-4">
                  <div>
                    <h2 className="text-lg font-bold text-gray-900">Contactanos</h2>
                    <p className="text-sm text-gray-400">¿Sugerencias, problemas, ideas? Escribinos</p>
                  </div>
                  <button
                    onClick={() => setAbierto(false)}
                    className="w-8 h-8 rounded-full bg-gray-100 flex items-center justify-center text-gray-400 hover:text-gray-600 transition cursor-pointer"
                    aria-label="Cerrar"
                  >
                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M6 18 18 6M6 6l12 12" />
                    </svg>
                  </button>
                </div>

                <div className="mb-4">
                  <label className="block text-sm text-gray-500 mb-1">Tu email</label>
                  <input
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="tu@email.com"
                    className="w-full px-3 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:border-[#8B7EC8]"
                  />
                </div>

                <div className="mb-4">
                  <label className="block text-sm text-gray-500 mb-1">Mensaje</label>
                  <textarea
                    value={mensaje}
                    onChange={(e) => setMensaje(e.target.value)}
                    placeholder="Contanos qué necesitás, qué te gustaría ver, o si algo no funciona bien..."
                    rows={4}
                    className="w-full px-3 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:border-[#8B7EC8] resize-none"
                  />
                </div>

                <button
                  onClick={enviar}
                  disabled={enviando}
                  className="w-full py-3 rounded-xl text-sm font-semibold text-white transition cursor-pointer"
                  style={{ background: enviando ? '#999' : '#8B7EC8' }}
                >
                  {enviando ? 'Enviando...' : 'Enviar mensaje'}
                </button>
              </>
            )}
          </div>
        </div>
      )}
    </>
  )
}
