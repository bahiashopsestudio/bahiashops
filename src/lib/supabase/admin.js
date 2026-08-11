import { createClient as createAdminClient } from '@supabase/supabase-js'
import { createClient } from '@/lib/supabase/server'

// Cliente con la service_role key: bypassea RLS. Usar solo en Route Handlers,
// nunca en código que corre en el navegador.
export function getServiceRoleClient() {
  return createAdminClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
  )
}

// Confirma que quien hace el request tiene sesión y es admin (usuarios.es_admin).
// Devuelve el user si es admin, o null si no.
export async function verificarAdmin() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return null

  const { data: perfil } = await supabase
    .from('usuarios')
    .select('es_admin')
    .eq('id', user.id)
    .single()

  if (!perfil?.es_admin) return null
  return user
}
