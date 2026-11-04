// Las llamadas a Mercado Pago de las suscripciones del plan, con el token de
// la cuenta de la plataforma (MP_ACCESS_TOKEN_PLATAFORMA). Las ventas siguen
// con el token de cada tienda: esto es solo lo que cobra Bahía Shops.
//
// Ninguna lanza: devuelven { ok: true, datos } o { ok: false, status, error }
// (status 0 = no hubo respuesta: sin token, tiempo agotado o red).
//
// Los endpoints son los que se probaron en el sondeo (04/11/2026,
// scripts/sondear-suscripcion.mjs): POST y PUT /preapproval, GET
// /preapproval/{id}, GET /authorized_payments/{id},
// GET /authorized_payments/search?preapproval_id= (no está en la
// documentación, pero anda), GET /v1/payments/{id} y POST
// /checkout/preferences.

import { randomUUID } from 'node:crypto'

const API = 'https://api.mercadopago.com'
const TIEMPO_MAXIMO_MS = 10000

export function tokenDePlataforma(entorno = process.env) {
  return String(entorno.MP_ACCESS_TOKEN_PLATAFORMA ?? '').trim() || null
}

export function idDePlataforma(entorno = process.env) {
  return String(entorno.MP_USER_ID_PLATAFORMA ?? '').trim() || null
}

async function llamar(metodo, ruta, cuerpo) {
  const token = tokenDePlataforma()
  if (!token) return { ok: false, status: 0, error: 'Falta MP_ACCESS_TOKEN_PLATAFORMA.' }
  try {
    const res = await fetch(`${API}${ruta}`, {
      method: metodo,
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
        ...(metodo === 'POST' ? { 'X-Idempotency-Key': randomUUID() } : {}),
      },
      body: cuerpo ? JSON.stringify(cuerpo) : undefined,
      signal: AbortSignal.timeout(TIEMPO_MAXIMO_MS),
    })
    const datos = await res.json().catch(() => null)
    if (!res.ok) {
      const error = datos?.message || datos?.error || `HTTP ${res.status}`
      return { ok: false, status: res.status, error: String(error).slice(0, 300), datos }
    }
    return { ok: true, status: res.status, datos }
  } catch (err) {
    return { ok: false, status: 0, error: err?.message || String(err) }
  }
}

const id = (valor) => encodeURIComponent(String(valor))

// El mail de la cuenta de la plataforma (GET /users/me), una vez por proceso.
// null si no se pudo leer.
let mailPlataforma
export async function mailDePlataforma() {
  if (mailPlataforma === undefined) {
    const r = await llamar('GET', '/users/me')
    if (!r.ok) return null
    mailPlataforma = typeof r.datos?.email === 'string' ? r.datos.email : null
  }
  return mailPlataforma
}

export const crearSuscripcionMp = (cuerpo) => llamar('POST', '/preapproval', cuerpo)
export const leerSuscripcionMp = (preapprovalId) => llamar('GET', `/preapproval/${id(preapprovalId)}`)
export const cambiarMontoMp = (preapprovalId, monto) =>
  llamar('PUT', `/preapproval/${id(preapprovalId)}`, { auto_recurring: { transaction_amount: monto, currency_id: 'ARS' } })
export const cancelarSuscripcionMp = (preapprovalId) => llamar('PUT', `/preapproval/${id(preapprovalId)}`, { status: 'cancelled' })
export const leerCobroMp = (cobroId) => llamar('GET', `/authorized_payments/${id(cobroId)}`)
export const buscarCobrosMp = (preapprovalId) =>
  llamar('GET', `/authorized_payments/search?${new URLSearchParams({ preapproval_id: String(preapprovalId) })}`)
export const leerPagoDePlataformaMp = (pagoId) => llamar('GET', `/v1/payments/${id(pagoId)}`)
export const crearPreferenciaMp = (cuerpo) => llamar('POST', '/checkout/preferences', cuerpo)
