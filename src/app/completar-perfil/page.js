import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import ProfileForm from './ProfileForm'

export default async function CompletarPerfilPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    redirect('/login')
  }

  const { data: perfil } = await supabase
    .from('usuarios')
    .select('nombre, apellido, nombre_usuario, telefono')
    .eq('id', user.id)
    .single()

  return (
    <main style={{ padding: '2rem', maxWidth: '500px', margin: '0 auto' }}>
      <h1 style={{ fontSize: '1.75rem', marginBottom: '0.5rem' }}>Completá tu perfil</h1>
      <p style={{ color: '#666', marginBottom: '2rem' }}>
        Estos datos los van a ver otros usuarios cuando hagas preguntas o compras.
      </p>
      <ProfileForm perfil={perfil} />
    </main>
  )
}