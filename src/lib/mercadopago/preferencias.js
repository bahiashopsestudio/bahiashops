// Lo que hace falta de las preferencias de pago de MercadoPago (los links de
// pago): armar las fechas, ponerle vencimiento a una y vencerla.
//
// Lo usan /api/pedidos/crear (las crea con vencimiento), la regularización de
// pedidos viejos (/api/admin/pedidos/regularizar) y "Eliminar mi cuenta"
// (src/lib/eliminarCuenta.js).

const TIEMPO_MAXIMO_MP_MS = 8000

// "2026-10-01T09:30:00.000-03:00": hora de Argentina con su desfase, el formato
// que muestra la documentación de MercadoPago.
export function fechaAR(ms) {
  return new Date(ms - 3 * 3600 * 1000).toISOString().replace('Z', '-03:00')
}

// Los cuatro datos con los que una preferencia vence en `venceEnMs`:
//   expires, expiration_date_from y expiration_date_to: el link de pago.
//   date_of_expiration: el ticket de los pagos en efectivo (Rapipago, Pago
//     Fácil), que tiene su propio vencimiento. Si se paga después, MercadoPago
//     devuelve el dinero a quien pagó.
// "Desde" arranca un minuto antes de ahora, por si los relojes no coinciden.
// Si MercadoPago cambia algo de estos campos, se cambia sólo acá.
export function camposDeVencimiento(venceEnMs, ahoraMs = Date.now()) {
  return {
    expires: true,
    expiration_date_from: fechaAR(ahoraMs - 60 * 1000),
    expiration_date_to: fechaAR(venceEnMs),
    date_of_expiration: fechaAR(venceEnMs),
  }
}

// Le pone vencimiento a una preferencia que ya existe. Mejor esfuerzo: nunca
// lanza. Devuelve true si MercadoPago la aceptó.
export async function ponerVencimientoPreferencia(token, preferenciaId, venceEnMs, etiqueta, contexto = 'Vencimiento de pedidos') {
  try {
    const res = await fetch(`https://api.mercadopago.com/checkout/preferences/${encodeURIComponent(preferenciaId)}`, {
      method: 'PUT',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(camposDeVencimiento(venceEnMs)),
      signal: AbortSignal.timeout(TIEMPO_MAXIMO_MP_MS),
    })
    if (res.ok) return true
    console.warn(`${contexto}: MercadoPago no aceptó el vencimiento de la preferencia de ${etiqueta} (respondió ${res.status}).`)
    return false
  } catch (err) {
    console.warn(`${contexto}: no se pudo poner el vencimiento a la preferencia de ${etiqueta} — ${err?.message || err}`)
    return false
  }
}

// Vence el link de pago de un pedido. Mejor esfuerzo: nunca lanza.
// Primero con una fecha ya pasada; si la API no la acepta, con un minuto de
// margen. Si MercadoPago dejara pagar igual una preferencia vencida, el aviso
// interno del webhook (pago sobre pedido cancelado) es la cobertura.
export async function vencerPreferencia(token, preferenciaId, etiqueta, contexto = 'Eliminar cuenta') {
  const ahora = Date.now()
  const intentos = [
    { desde: ahora - 2 * 3600 * 1000, hasta: ahora - 3600 * 1000 },
    { desde: ahora - 60 * 1000, hasta: ahora + 60 * 1000 },
  ]
  for (const { desde, hasta } of intentos) {
    try {
      const res = await fetch(`https://api.mercadopago.com/checkout/preferences/${encodeURIComponent(preferenciaId)}`, {
        method: 'PUT',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ expires: true, expiration_date_from: fechaAR(desde), expiration_date_to: fechaAR(hasta) }),
        signal: AbortSignal.timeout(TIEMPO_MAXIMO_MP_MS),
      })
      if (res.ok) return true
    } catch (err) {
      console.warn(`${contexto}: no se pudo vencer la preferencia de ${etiqueta} — ${err?.message || err}`)
      return false
    }
  }
  console.warn(`${contexto}: MercadoPago no aceptó vencer la preferencia de ${etiqueta}.`)
  return false
}
