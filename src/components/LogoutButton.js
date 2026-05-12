'use client'

import { createClient } from '@/lib/supabase/client'
import { useRouter } from 'next/navigation'

export default function LogoutButton() {
  const router = useRouter()

  const handleLogout = async () => {
    const supabase = createClient()
    await supabase.auth.signOut()
    router.refresh()
  }

  return (
    <button
      onClick={handleLogout}
      style={{
        marginTop: '1rem',
        padding: '0.5rem 1rem',
        fontSize: '0.9rem',
        cursor: 'pointer',
        border: '1px solid #ddd',
        borderRadius: '6px',
        background: 'white',
      }}
    >
      Cerrar sesión
    </button>
  )
}