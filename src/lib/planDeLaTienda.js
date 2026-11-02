// El plan que rige para una tienda y cuántos productos le cuentan, leído con
// service_role (public.rpc_plan_de_tienda, migración 046). Para las rutas del
// servidor: la tienda ya salió de la sesión.
//
// Devuelve { plan } (ver planDesdeLaBase en src/lib/planes.js) o { error }
// (ya logueado). Nunca lanza.

import { planDesdeLaBase } from '@/lib/planes'

export async function planDeLaTienda(admin, vendedorId, contexto) {
  try {
    const { data, error } = await admin.rpc('rpc_plan_de_tienda', { p_vendedor_id: vendedorId })
    if (error || !data) {
      console.error(`[${contexto}/plan]`, vendedorId, error?.code, error?.message || 'sin datos')
      return { error: error || new Error('sin datos') }
    }
    return { plan: planDesdeLaBase(data) }
  } catch (err) {
    console.error(`[${contexto}/plan]`, vendedorId, err?.message)
    return { error: err }
  }
}
