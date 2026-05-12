import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import FormularioVendedor from './FormularioVendedor'

export default async function NuevoVendedorPage() {
  const supabase = await createClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    redirect('/login')
  }

  return (
    <main style={{ maxWidth: 600, margin: '2rem auto', padding: '1rem' }}>
      <h1>Crear mi emprendimiento</h1>
      <p style={{ color: '#666', marginBottom: '2rem' }}>
        Contanos sobre tu proyecto. Tu perfil queda pendiente de revisión
        hasta que lo aprobemos.
      </p>
      <FormularioVendedor userId={user.id} />
    </main>
  )
}