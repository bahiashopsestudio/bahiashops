import { createClient } from '@/lib/supabase/server'
import LogoutButton from '@/components/LogoutButton'

export default async function Home() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  return (
    <main style={{ padding: '2rem', textAlign: 'center' }}>
      <h1 style={{ fontSize: '2rem' }}>Bahía Shops</h1>
      {user ? (
        <>
          <p style={{ marginTop: '1rem' }}>
            Hola, <strong>{user.email}</strong> 👋
          </p>
          <LogoutButton />
        </>
      ) : (
        <p style={{ marginTop: '1rem' }}>
          <a href="/login">Iniciá sesión</a>
        </p>
      )}
    </main>
  )
}