'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'

export default function ProfileForm({ perfil }) {
  const router = useRouter()
  const [nombre, setNombre] = useState(perfil?.nombre || '')
  const [apellido, setApellido] = useState(perfil?.apellido || '')
  const [nombreUsuario, setNombreUsuario] = useState(perfil?.nombre_usuario || '')
  const [telefono, setTelefono] = useState(perfil?.telefono || '')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)

  const handleSubmit = async (e) => {
    e.preventDefault()
    setLoading(true)
    setError(null)

    if (!nombre.trim() || !apellido.trim() || !nombreUsuario.trim()) {
      setError('Nombre, apellido y nombre de usuario son obligatorios.')
      setLoading(false)
      return
    }

    if (!/^[a-z0-9_]+$/.test(nombreUsuario)) {
      setError('El nombre de usuario solo puede tener letras minúsculas, números y guión bajo.')
      setLoading(false)
      return
    }

    const supabase = createClient()
    const { data: { user } } = await supabase.auth.getUser()

    const { error: updateError } = await supabase
      .from('usuarios')
      .update({
        nombre: nombre.trim(),
        apellido: apellido.trim(),
        nombre_usuario: nombreUsuario.trim(),
        telefono: telefono.trim() || null,
      })
      .eq('id', user.id)

    if (updateError) {
      if (updateError.code === '23505') {
        setError('Ese nombre de usuario ya está en uso. Probá con otro.')
      } else {
        setError('Hubo un error al guardar. Intentá de nuevo.')
        console.error(updateError)
      }
      setLoading(false)
      return
    }

    router.push('/')
    router.refresh()
  }

  const inputStyle = {
    width: '100%',
    padding: '0.5rem',
    fontSize: '1rem',
    border: '1px solid #ddd',
    borderRadius: '6px',
    marginBottom: '1rem',
  }

  const labelStyle = {
    display: 'block',
    marginBottom: '0.25rem',
    fontSize: '0.9rem',
    fontWeight: '500',
  }

  return (
    <form onSubmit={handleSubmit}>
      <label style={labelStyle}>
        Nombre *
        <input
          type="text"
          value={nombre}
          onChange={(e) => setNombre(e.target.value)}
          style={inputStyle}
          required
        />
      </label>

      <label style={labelStyle}>
        Apellido *
        <input
          type="text"
          value={apellido}
          onChange={(e) => setApellido(e.target.value)}
          style={inputStyle}
          required
        />
      </label>

      <label style={labelStyle}>
        Nombre de usuario *
        <input
          type="text"
          value={nombreUsuario}
          onChange={(e) => setNombreUsuario(e.target.value.toLowerCase())}
          style={inputStyle}
          placeholder="lulu_ceramic"
          required
        />
        <small style={{ display: 'block', color: '#666', marginTop: '-0.75rem', marginBottom: '1rem' }}>
          Solo minúsculas, números y guión bajo. Es como te ven los demás.
        </small>
      </label>

      <label style={labelStyle}>
        Teléfono (opcional)
        <input
          type="tel"
          value={telefono}
          onChange={(e) => setTelefono(e.target.value)}
          style={inputStyle}
          placeholder="291-555-1234"
        />
      </label>

      {error && (
        <p style={{ color: '#c0392b', marginBottom: '1rem' }}>{error}</p>
      )}

      <button
        type="submit"
        disabled={loading}
        style={{
          padding: '0.75rem 1.5rem',
          fontSize: '1rem',
          cursor: loading ? 'not-allowed' : 'pointer',
          border: 'none',
          borderRadius: '8px',
          background: loading ? '#999' : '#222',
          color: 'white',
          width: '100%',
        }}
      >
        {loading ? 'Guardando...' : 'Guardar perfil'}
      </button>
    </form>
  )
}