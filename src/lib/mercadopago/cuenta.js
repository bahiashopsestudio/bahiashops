// La cuenta de MercadoPago de una tienda: cómo se llama, y qué pasa con los
// pedidos que todavía no se pagaron cuando la tienda cambia o desconecta la
// cuenta con la que cobra.
//
// Lo usan el callback del OAuth (conectar o cambiar de cuenta), la desconexión y
// el panel del vendedor.

import { vencerPreferencia } from '@/lib/mercadopago/preferencias'

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

// Cancela los pedidos pendientes SIN pago de una tienda (los que cobraban para
// una cuenta que ya no es la suya) y vence sus links en MercadoPago.
//
//   cuentaAConservar  el mp_user_id de la cuenta que acaba de conectarse: sus
//                     pedidos no se tocan. Con null (desconexión) se cancelan
//                     todos.
//   tokenViejo        el access_token de la cuenta ANTERIOR, para vencer sus
//                     links. Si no hay (no se pudo renovar), los pedidos se
//                     cancelan igual y los links quedan vivos hasta su fecha.
//
// El orden importa: primero se cancela en la base (con una sola sentencia, que
// ya respeta "sin ningún pago": un pago en proceso no se cancela nunca) y
// después se vencen los links, uno por uno, a mejor esfuerzo. Así quien compra
// deja de ver "Pagar" aunque MercadoPago tarde o falle.
//
// Nunca lanza. Devuelve { ok, error?, cancelados, ids, en_proceso, links_vencidos,
// sin_vencer: [ids de pedido] }. "sin_vencer" son los pedidos cuyo link NO se
// pudo vencer: durante unos días alguien podría pagarlos, sin que el sistema lo
// vea.
export async function cancelarPendientesDeTienda({ admin, vendedorId, motivo, cuentaAConservar = null, tokenViejo = null, contexto = 'Cambio de cuenta de MercadoPago' }) {
  const vacio = { cancelados: 0, ids: [], en_proceso: 0, links_vencidos: 0, sin_vencer: [] }

  const { data, error } = await admin.rpc('rpc_cancelar_pedidos_de_tienda', {
    p_vendedor_id: vendedorId,
    p_motivo: motivo,
    p_cuenta_a_conservar: cuentaAConservar,
  })
  if (error || !data || typeof data !== 'object') {
    console.error(`${contexto}: no se pudieron cancelar los pedidos pendientes de la tienda ${vendedorId} —`, error?.message || 'respuesta vacía')
    return { ok: false, error: error?.message || 'respuesta vacía', ...vacio }
  }

  const cancelados = Array.isArray(data.cancelados) ? data.cancelados : []
  const resultado = {
    ok: true,
    cancelados: cancelados.length,
    ids: cancelados.map((p) => p.id),
    en_proceso: Number(data.en_proceso) || 0,
    links_vencidos: 0,
    sin_vencer: [],
  }

  for (const pedido of cancelados) {
    if (!pedido.mp_preference_id) continue // sin preferencia no hay link que vencer
    const vencido = tokenViejo
      ? await vencerPreferencia(tokenViejo, pedido.mp_preference_id, `pedido ${pedido.id}`, contexto)
      : false
    if (vencido) resultado.links_vencidos++
    else resultado.sin_vencer.push(pedido.id)
  }

  console.log(`${contexto}: tienda ${vendedorId}, ${resultado.cancelados} pedido(s) cancelado(s), ${resultado.links_vencidos} link(s) vencido(s), ${resultado.sin_vencer.length} sin vencer, ${resultado.en_proceso} con pago en proceso.`)
  return resultado
}
