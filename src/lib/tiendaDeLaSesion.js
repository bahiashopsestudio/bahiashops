// La tienda de quien tiene la sesión, leída con service_role. Para las rutas
// del vendedor que escriben por el servidor: la tienda sale de la sesión,
// nunca del cuerpo del pedido.
//
// Devuelve { user, vendedor, admin } o { respuesta } (la respuesta de error,
// lista para devolver).

import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { getServiceRoleClient } from '@/lib/supabase/admin'

export async function tiendaDeLaSesion(contexto) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { respuesta: NextResponse.json({ error: 'Iniciá sesión.' }, { status: 401 }) }

  const admin = getServiceRoleClient()
  const { data: vendedor, error } = await admin
    .from('vendedores')
    .select('id')
    .eq('usuario_id', user.id)
    .maybeSingle()
  if (error) {
    console.error(`[${contexto}/vendedor]`, user.id, error.message)
    return { respuesta: NextResponse.json({ error: 'No pudimos verificar tu cuenta. Probá de nuevo en un momento.' }, { status: 500 }) }
  }
  if (!vendedor) {
    return { respuesta: NextResponse.json({ error: 'No encontramos tu cuenta de vendedor.' }, { status: 404 }) }
  }
  return { user, vendedor, admin }
}
