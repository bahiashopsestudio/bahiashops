'use client'

import { createClient } from '@/lib/supabase/client'

export default function LoginPage() {
  const handleGoogleLogin = async () => {
    const supabase = createClient()

    const { error } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: {
        redirectTo: `${window.location.origin}/auth/callback`,
      },
    })

    if (error) {
      console.error('Error al iniciar sesión:', error.message)
      alert('Hubo un error al iniciar sesión. Revisá la consola.')
    }
  }

  return (
    <main style={{ display: 'flex', minHeight: '100vh', alignItems: 'center', justifyContent: 'center', padding: '2rem' }}>
      <div style={{ maxWidth: '400px', width: '100%', textAlign: 'center' }}>
        <h1 style={{ fontSize: '2rem', marginBottom: '1rem' }}>Bahía Shops</h1>
        <p style={{ marginBottom: '2rem', color: '#666' }}>
          Iniciá sesión para entrar al marketplace
        </p>
        <button
          onClick={handleGoogleLogin}
          style={{
            padding: '0.75rem 1.5rem',
            fontSize: '1rem',
            cursor: 'pointer',
            border: '1px solid #ddd',
            borderRadius: '8px',
            background: 'white',
            width: '100%',
          }}
        >
          Iniciar sesión con Google
        </button>
      </div>
    </main>
  )
}