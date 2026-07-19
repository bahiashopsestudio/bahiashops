'use client'

import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'

export default function BotonFavorito({ productoId, className = '', onToggle }) {
  const supabase = createClient()
  const [esFavorito, setEsFavorito] = useState(false)
  const [cargando, setCargando] = useState(true)
  const [userId, setUserId] = useState(null)

  useEffect(() => {
    async function verificar() {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) { setCargando(false); return }
      setUserId(user.id)

      const { data } = await supabase
        .from('favoritos')
        .select('id')
        .eq('usuario_id', user.id)
        .eq('producto_id', productoId)
        .maybeSingle()

      setEsFavorito(!!data)
      setCargando(false)
    }
    verificar()
  }, [productoId])

  async function toggle(e) {
    // Evitar que el click navegue si el corazón está dentro de un Link
    e.preventDefault()
    e.stopPropagation()

    if (!userId) {
      window.location.href = '/login'
      return
    }

    const nuevoEstado = !esFavorito

    if (esFavorito) {
      await supabase
        .from('favoritos')
        .delete()
        .eq('usuario_id', userId)
        .eq('producto_id', productoId)
    } else {
      await supabase
        .from('favoritos')
        .insert({ usuario_id: userId, producto_id: productoId })
    }

    setEsFavorito(nuevoEstado)

    // Avisar al componente padre (la página de favoritos lo usa
    // para quitar el producto de la lista sin recargar)
    if (onToggle) onToggle(nuevoEstado)
  }

  // Mientras carga, no muestra nada para no flashear
  if (cargando) return null

  return (
    <button
      onClick={toggle}
      className={`cursor-pointer transition-transform hover:scale-110 ${className}`}
      aria-label={esFavorito ? 'Quitar de favoritos' : 'Agregar a favoritos'}
    >
      <svg
        className="w-5 h-5"
        fill={esFavorito ? '#8B7EC8' : 'none'}
        viewBox="0 0 24 24"
        stroke={esFavorito ? '#8B7EC8' : 'currentColor'}
        strokeWidth={1.5}
      >
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          d="M21 8.25c0-2.485-2.099-4.5-4.688-4.5-1.935 0-3.597 1.126-4.312 2.733-.715-1.607-2.377-2.733-4.313-2.733C5.1 3.75 3 5.765 3 8.25c0 7.22 9 12 9 12s9-4.78 9-12Z"
        />
      </svg>
    </button>
  )
}
