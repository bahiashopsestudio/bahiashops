// Sondeo de las suscripciones de Mercado Pago (F3.0): llama a la API a mano y
// guarda las respuestas crudas, para confirmar campos y estados antes de
// escribir la 048 y el código. NO toca la base de datos.
//
//   node --env-file=.env.local scripts/sondear-suscripcion.mjs <comando> [opciones]
//
// Comandos (los que escriben en Mercado Pago piden --si):
//   yo                               de quién es el token (GET /users/me)
//   crear --email X --monto N --si   suscripción sin plan, con pago pendiente
//         [--back-url URL] [--motivo TEXTO]
//   leer <id>                        GET /preapproval/{id}
//   buscar [--referencia REF]        GET /preapproval/search (las del token)
//   cobro <id>                       GET /authorized_payments/{id}
//   cobros <id de la suscripción>    GET /authorized_payments/search?preapproval_id=
//                                    (no está en la documentación: a confirmar)
//   pago <id>                        GET /v1/payments/{id}
//   monto <id> <N> --si              PUT /preapproval/{id} con el monto nuevo
//   cancelar <id> --si [--estado E]  PUT /preapproval/{id} con status E
//                                    (por defecto 'cancelled'; la guía dice 'canceled')
//
// Token: --token NOMBRE_DE_VARIABLE (por defecto MP_SONDEO_ACCESS_TOKEN, el del
// vendedor de prueba, solo en .env.local). Con MP_ACCESS_TOKEN_PLATAFORMA es la
// cuenta real de Bahía Shops. Nunca se imprime el valor del token.
//
// Cada respuesta se guarda entera en la carpeta temporal del sistema
// (bahia-sondeo-suscripciones), fuera del repo: puede tener mails.

import { mkdirSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { randomUUID } from 'node:crypto'
import { SITIO_URL } from '../src/lib/sitio.js'

const API = 'https://api.mercadopago.com'
const CARPETA = join(tmpdir(), 'bahia-sondeo-suscripciones')

// argv: comando, posicionales y --opciones (con valor, salvo --si).
const [comando, ...resto] = process.argv.slice(2)
const posicionales = []
const opciones = {}
for (let i = 0; i < resto.length; i++) {
  const a = resto[i]
  if (a === '--si') opciones.si = true
  else if (a.startsWith('--')) opciones[a.slice(2)] = resto[++i]
  else posicionales.push(a)
}

function salir(mensaje) {
  console.error(mensaje)
  console.error('Uso: node --env-file=.env.local scripts/sondear-suscripcion.mjs <yo|crear|leer|buscar|cobro|cobros|pago|monto|cancelar> … (ver el encabezado del script)')
  process.exit(1)
}

const nombreToken = opciones.token || 'MP_SONDEO_ACCESS_TOKEN'
const token = (process.env[nombreToken] || '').trim()
if (!token) salir(`Falta ${nombreToken} en .env.local (o pasá --token NOMBRE_DE_VARIABLE).`)

function guardar(etiqueta, datos) {
  mkdirSync(CARPETA, { recursive: true })
  const archivo = join(CARPETA, `${new Date().toISOString().replace(/[:.]/g, '-')}-${etiqueta}.json`)
  writeFileSync(archivo, JSON.stringify(datos, null, 2))
  return archivo
}

async function llamar(metodo, ruta, cuerpo) {
  const respuesta = await fetch(`${API}${ruta}`, {
    method: metodo,
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
      ...(metodo === 'POST' ? { 'X-Idempotency-Key': randomUUID() } : {}),
    },
    body: cuerpo ? JSON.stringify(cuerpo) : undefined,
    signal: AbortSignal.timeout(15000),
  })
  const texto = await respuesta.text()
  let datos
  try { datos = JSON.parse(texto) } catch { datos = { texto_crudo: texto } }
  return { status: respuesta.status, datos }
}

// Imprime el status, los campos que importan para la 048 y dónde quedó el JSON.
function mostrar(etiqueta, { status, datos }, campos = []) {
  const archivo = guardar(etiqueta, { status, datos })
  console.log(`HTTP ${status}`)
  if (status >= 400) console.log('Error de Mercado Pago:', datos)
  else for (const campo of campos) {
    const valor = campo.split('.').reduce((o, k) => (o == null ? undefined : o[k]), datos)
    if (valor !== undefined) console.log(`  ${campo}:`, typeof valor === 'object' ? JSON.stringify(valor) : valor)
  }
  console.log('JSON completo:', archivo)
}

function pedirSi(accion) {
  if (opciones.si) return
  salir(`${accion} escribe en Mercado Pago${nombreToken === 'MP_ACCESS_TOKEN_PLATAFORMA' ? ' (cuenta REAL de Bahía Shops)' : ''}: agregá --si para hacerlo.`)
}

function idPosicional(n = 0) {
  const id = posicionales[n]
  if (!id || !/^[A-Za-z0-9_-]{1,64}$/.test(id)) salir('Falta el id (o no tiene la forma de un id de Mercado Pago).')
  return id
}

const CAMPOS_SUSCRIPCION = [
  'id', 'status', 'reason', 'external_reference', 'payer_id', 'payer_email', 'collector_id',
  'application_id', 'init_point', 'back_url', 'auto_recurring', 'next_payment_date',
  'date_created', 'last_modified', 'summarized', 'payment_method_id', 'first_invoice_offset',
]

console.log(`Token: ${nombreToken} (${token.startsWith('TEST-') ? 'TEST-…' : 'APP_USR-…'})`)

switch (comando) {
  case 'yo': {
    const r = await llamar('GET', '/users/me')
    mostrar('yo', r, ['id', 'site_id', 'nickname', 'tags'])
    // Verificación D: que el token de la plataforma sea de la cuenta que dice
    // MP_USER_ID_PLATAFORMA (se compara, no se imprime la variable).
    const esperado = (process.env.MP_USER_ID_PLATAFORMA || '').trim()
    if (r.status === 200 && esperado) {
      console.log(`  ¿Coincide con MP_USER_ID_PLATAFORMA?: ${String(r.datos.id) === esperado ? 'sí' : 'NO'}`)
    }
    break
  }

  case 'crear': {
    const email = (opciones.email || '').trim()
    const monto = Number(opciones.monto)
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) salir('Falta --email (el de la cuenta de Mercado Pago que va a pagar).')
    if (!Number.isInteger(monto) || monto <= 0) salir('Falta --monto (pesos enteros, mayor que 0).')
    pedirSi('crear')

    const base = (process.env.URL_PUBLICA_DESARROLLO || '').trim() || SITIO_URL
    const cuerpo = {
      reason: opciones.motivo || 'Bahía Shops · sondeo de suscripción',
      external_reference: `bs-sondeo-${randomUUID()}`,
      payer_email: email,
      auto_recurring: { frequency: 1, frequency_type: 'months', transaction_amount: monto, currency_id: 'ARS' },
      back_url: opciones['back-url'] || `${base}/vendedor/perfil?suscripcion=volvio`,
      status: 'pending',
    }
    console.log('Se manda:', JSON.stringify(cuerpo))
    const r = await llamar('POST', '/preapproval', cuerpo)
    mostrar('crear', r, CAMPOS_SUSCRIPCION)
    // Verificación D: la aplicación del token contra MP_CLIENT_ID.
    const clientId = (process.env.MP_CLIENT_ID || '').trim()
    if (r.status < 400 && clientId && r.datos.application_id != null) {
      console.log(`  ¿application_id coincide con MP_CLIENT_ID?: ${String(r.datos.application_id) === clientId ? 'sí' : 'NO'}`)
    }
    if (r.datos.init_point) console.log(`\nAbrí el init_point en una ventana privada, con la sesión del comprador:\n${r.datos.init_point}`)
    break
  }

  case 'leer':
    mostrar('leer', await llamar('GET', `/preapproval/${idPosicional()}`), CAMPOS_SUSCRIPCION)
    break

  case 'buscar': {
    const params = new URLSearchParams({ limit: '20' })
    if (opciones.referencia) params.set('external_reference', opciones.referencia)
    const r = await llamar('GET', `/preapproval/search?${params}`)
    mostrar('buscar', r, ['paging'])
    for (const s of r.datos.results || []) {
      console.log(`  ${s.id} · ${s.status} · $${s.auto_recurring?.transaction_amount} · ${s.external_reference} · ${s.date_created}`)
    }
    break
  }

  case 'cobro':
    mostrar('cobro', await llamar('GET', `/authorized_payments/${idPosicional()}`),
      ['id', 'preapproval_id', 'type', 'status', 'transaction_amount', 'currency_id', 'debit_date',
        'date_created', 'last_modified', 'retry_attempt', 'next_retry_date', 'payment', 'reason', 'external_reference'])
    break

  case 'cobros': {
    const r = await llamar('GET', `/authorized_payments/search?${new URLSearchParams({ preapproval_id: idPosicional() })}`)
    mostrar('cobros', r, ['paging'])
    for (const c of r.datos.results || []) {
      console.log(`  ${c.id} · ${c.status} · $${c.transaction_amount} · pago ${c.payment?.id ?? '—'} (${c.payment?.status ?? '—'}) · ${c.debit_date ?? c.date_created}`)
    }
    break
  }

  case 'pago':
    // Lo que importa: si el pago dice de qué suscripción es (metadata,
    // external_reference, point_of_interaction, operation_type…).
    mostrar('pago', await llamar('GET', `/v1/payments/${idPosicional()}`),
      ['id', 'status', 'status_detail', 'operation_type', 'transaction_amount', 'currency_id', 'date_approved',
        'collector_id', 'external_reference', 'metadata', 'description', 'point_of_interaction', 'order', 'refunds'])
    break

  case 'monto': {
    const id = idPosicional()
    const monto = Number(posicionales[1])
    if (!Number.isInteger(monto) || monto <= 0) salir('Falta el monto nuevo (pesos enteros, mayor que 0).')
    pedirSi('monto')
    const r = await llamar('PUT', `/preapproval/${id}`, { auto_recurring: { transaction_amount: monto, currency_id: 'ARS' } })
    mostrar('monto', r, CAMPOS_SUSCRIPCION)
    break
  }

  case 'cancelar': {
    const id = idPosicional()
    pedirSi('cancelar')
    const r = await llamar('PUT', `/preapproval/${id}`, { status: opciones.estado || 'cancelled' })
    mostrar('cancelar', r, ['id', 'status', 'last_modified'])
    break
  }

  default:
    salir(comando ? `No conozco el comando «${comando}».` : 'Falta el comando.')
}
