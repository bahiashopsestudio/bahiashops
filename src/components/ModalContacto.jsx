'use client'

import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'
import { sesionParaContacto, precargarEmail } from '@/lib/formularioContacto'

// Cerrado no se dibuja nada, y el formulario de adentro se monta de nuevo cada
// vez que se abre: así arranca siempre vacío (lo que se escribió la vez anterior
// no queda) y vuelve a leer la sesión. Importa porque BotonContacto vive en el
// layout raíz y nunca se desmonta al navegar ni al cerrar sesión.
export default function ModalContacto({ abierto, ...props }) {
  if (!abierto) return null
  return <FormularioContacto {...props} />
}

function FormularioContacto({
  onClose,
  mensajeInicial = '',
  titulo = 'Contactanos',
  subtitulo = '¿Sugerencias, problemas, ideas? Escribinos',
  contexto = '',
}) {
  const supabase = createClient()

  const [email, setEmail] = useState('')
  const [mensaje, setMensaje] = useState(mensajeInicial)
  const [enviando, setEnviando] = useState(false)
  const [enviado, setEnviado] = useState(false)

  // El email se precarga solo si hay una sesión activa al abrir. Si la sesión se
  // cierra con el formulario abierto (en otra pestaña, por ejemplo), se vacía.
  useEffect(() => {
    let vigente = true
    sesionParaContacto(supabase).then((sesion) => {
      if (vigente) setEmail((actual) => precargarEmail(actual, sesion))
    })
    const { data } = supabase.auth.onAuthStateChange((evento) => {
      if (evento === 'SIGNED_OUT') {
        setEmail('')
        setMensaje('')
      }
    })
    return () => {
      vigente = false
      data?.subscription?.unsubscribe()
    }
  }, [])

  async function enviar(e) {
    e.preventDefault()

    if (!email.trim() || !mensaje.trim()) {
      alert('Completá el email y el mensaje.')
      return
    }

    setEnviando(true)

    const cuerpo = contexto ? `[${contexto}]

${mensaje.trim()}` : mensaje.trim()

    try {
      // La cuenta se vuelve a leer al enviar: el mensaje sale a nombre de quien
      // tiene la sesión AHORA (o de nadie), nunca de una sesión anterior.
      const { usuarioId } = await sesionParaContacto(supabase)

      // Guardar en Supabase
      const { error: dbError } = await supabase
        .from('mensajes_contacto')
        .insert({
          email: email.trim(),
          mensaje: cuerpo,
          usuario_id: usuarioId,
        })

      if (dbError) throw dbError

      // Enviar notificación por email
      try {
        await fetch('/api/contacto', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            email: email.trim(),
            mensaje: cuerpo,
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
        onClose()
      }, 3000)
    } catch (err) {
      console.error(err)
      alert('No se pudo enviar el mensaje. Probá de nuevo.')
    } finally {
      setEnviando(false)
    }
  }

  return (
    <div
      className="fixed inset-0 z-[950] flex items-end lg:items-center justify-center"
      onClick={() => { if (!enviando) onClose() }}
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
                <h2 className="text-lg font-bold text-gray-900">{titulo}</h2>
                <p className="text-sm text-gray-400">{subtitulo}</p>
              </div>
              <button
                onClick={onClose}
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
                className="w-full px-3 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:border-[#4164fe]"
              />
            </div>

            <div className="mb-4">
              <label className="block text-sm text-gray-500 mb-1">Mensaje</label>
              <textarea
                value={mensaje}
                onChange={(e) => setMensaje(e.target.value)}
                placeholder="Contanos qué necesitás, qué te gustaría ver, o si algo no funciona bien..."
                rows={4}
                className="w-full px-3 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:border-[#4164fe] resize-none"
              />
            </div>

            <button
              onClick={enviar}
              disabled={enviando}
              className="w-full py-3 rounded-xl text-sm font-semibold text-white transition cursor-pointer"
              style={{ background: enviando ? '#999' : '#4164fe' }}
            >
              {enviando ? 'Enviando...' : 'Enviar mensaje'}
            </button>
          </>
        )}
      </div>
    </div>
  )
}
