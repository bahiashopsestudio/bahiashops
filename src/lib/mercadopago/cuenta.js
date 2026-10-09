// La cuenta de MercadoPago de una tienda: cómo se llama, y cuántos pagos en
// efectivo siguen en camino cuando la tienda cambia o desconecta la cuenta.
//
// Lo usan el callback del OAuth (conectar o cambiar de cuenta) y la desconexión.
// Cambiar de cuenta ya no cancela ningún pedido: una venta existe solo cuando
// se paga, y los links de pago sin usar vencen solos a las 2 horas.

const TIEMPO_MAXIMO_MP_MS = 6000

// Quién es la cuenta que acaba de conectarse: { id, nickname }, o null si
// MercadoPago no responde como se espera. Mejor esfuerzo: nunca lanza, y nunca
// devuelve ni guarda el mail de la cuenta (la respuesta de MercadoPago lo trae,
// pero acá no se lee).
export async function leerCuentaDeMp(accessToken) {
  try {
    const res = await fetch('https://api.mercadopago.com/users/me', {
      headers: { Authorization: `Bearer ${accessToken}` },
      signal: AbortSignal.timeout(TIEMPO_MAXIMO_MP_MS),
    })
    if (!res.ok) {
      console.warn(`Cuenta de MercadoPago: /users/me respondió ${res.status}; se sigue sin el nombre de la cuenta.`)
      return null
    }
    const datos = await res.json()
    const id = datos?.id === undefined || datos?.id === null ? '' : String(datos.id).trim()
    if (!id) return null
    const nickname = typeof datos.nickname === 'string' && datos.nickname.trim() ? datos.nickname.trim().slice(0, 80) : null
    return { id, nickname }
  } catch (err) {
    console.warn(`Cuenta de MercadoPago: no se pudo leer /users/me — ${err?.message || err}`)
    return null
  }
}

// Cuántos pagos en efectivo en proceso tiene la tienda: pedidos pendientes con un
// cupón ya generado. Se van a acreditar en la cuenta con la que se generaron, no
// en la que se conecte ahora. Mejor esfuerzo: si la lectura falla devuelve 0.
export async function contarPagosEnProceso(admin, vendedorId) {
  try {
    const { data, error } = await admin
      .from('pedidos')
      .select('id, mp_payment_id')
      .eq('vendedor_id', vendedorId)
      .eq('estado', 'pendiente')
      .not('mp_payment_id', 'is', null)
    if (error) {
      console.warn(`Cuenta de MercadoPago: no se pudieron contar los pagos en proceso de la tienda ${vendedorId} — ${error.message}`)
      return 0
    }
    return (data || []).filter((p) => !['', 'null', 'undefined'].includes(String(p.mp_payment_id).trim())).length
  } catch (err) {
    console.warn(`Cuenta de MercadoPago: no se pudieron contar los pagos en proceso — ${err?.message || err}`)
    return 0
  }
}
