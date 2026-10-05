// Eliminar una cuenta (derecho de supresión, Ley 25.326).
//
// La lógica que comparten las dos puertas: la persona (/api/cuenta/cerrar) y
// el admin (/api/admin/cuentas). Todo corre en el servidor con service_role.
//
// Qué hace cada parte:
//   · La base decide y borra: rpc_evaluar_eliminar_cuenta (solo lee) y
//     rpc_cerrar_cuenta (todo o nada, en una transacción). Migración 016.
//   · Este archivo agrega lo que la base no puede hacer: preguntarle a
//     MercadoPago si un pedido "abandonado" tiene en realidad un pago en
//     camino, y vencer los links de pago de los pedidos que se cancelan.
//
// MercadoPago se consulta a la defensiva: si no responde, o la respuesta no
// tiene la forma esperada, NO se elimina nada (falla cerrado).

import { getValidAccessToken } from '@/lib/mercadopago/tokens'
import { vencerPreferencia } from '@/lib/mercadopago/preferencias'

export const PALABRA_CONFIRMACION = 'ELIMINAR'

// El orden en que la pantalla muestra los impedimentos.
const ORDEN_MOTIVOS = ['TIENDA', 'PEDIDO_ACTIVO', 'PAGO_EN_CURSO', 'ES_ADMIN']

// Estados de un pago en MercadoPago que significan "hay plata en camino o ya
// llegó". Con cualquiera de estos, el pedido no se considera abandonado.
const ESTADOS_PAGO_EN_CAMINO = ['pending', 'in_process', 'authorized', 'approved', 'in_mediation']

const TIEMPO_MAXIMO_MP_MS = 8000

export function confirmacionValida(texto) {
  return typeof texto === 'string' && texto.trim().toUpperCase() === PALABRA_CONFIRMACION
}

function ordenarMotivos(motivos) {
  return [...new Set(motivos)].sort((a, b) => {
    const ia = ORDEN_MOTIVOS.indexOf(a)
    const ib = ORDEN_MOTIVOS.indexOf(b)
    return (ia === -1 ? 99 : ia) - (ib === -1 ? 99 : ib)
  })
}

class MercadoPagoNoResponde extends Error {}

// El token del vendedor de cada pedido, una sola vez por vendedor. Si el
// vendedor no tiene MercadoPago conectado (o el token ya no sirve) no se puede
// ni consultar ni vencer nada: se deja en el log y se sigue (decisión de
// producto: eso no bloquea a quien quiere eliminar su cuenta).
async function tokensPorVendedor(admin, vendedorIds) {
  const tokens = new Map()
  for (const id of new Set(vendedorIds)) {
    try {
      tokens.set(id, await getValidAccessToken(id, admin))
    } catch (err) {
      console.warn(`Eliminar cuenta: sin token de MercadoPago para la tienda ${id} (${err.message}); no se revisan ni se vencen sus pedidos.`)
      tokens.set(id, null)
    }
  }
  return tokens
}

// Los pagos de un pedido en MercadoPago. Devuelve la lista de { id, status }.
// Lanza MercadoPagoNoResponde si la respuesta no es la esperada.
async function pagosDelPedido(token, pedidoId) {
  let res
  try {
    res = await fetch(
      `https://api.mercadopago.com/v1/payments/search?external_reference=${encodeURIComponent(pedidoId)}&sort=date_created&criteria=desc&limit=10`,
      { headers: { Authorization: `Bearer ${token}` }, signal: AbortSignal.timeout(TIEMPO_MAXIMO_MP_MS) }
    )
  } catch (err) {
    throw new MercadoPagoNoResponde(`pedido ${pedidoId}: ${err?.message || err}`)
  }

  if (!res.ok) throw new MercadoPagoNoResponde(`pedido ${pedidoId}: respondió ${res.status}`)

  let datos
  try {
    datos = await res.json()
  } catch {
    throw new MercadoPagoNoResponde(`pedido ${pedidoId}: la respuesta no es JSON`)
  }

  // La forma esperada: results es una lista y cada pago trae su status. Si no,
  // es lo mismo que no haber obtenido respuesta.
  if (!datos || !Array.isArray(datos.results) || datos.results.some((p) => !p || typeof p.status !== 'string')) {
    throw new MercadoPagoNoResponde(`pedido ${pedidoId}: la respuesta no tiene la forma esperada`)
  }

  return datos.results.map((p) => ({ id: p.id, status: p.status }))
}

// vencerPreferencia (vence el link de pago de un pedido) vive en
// src/lib/mercadopago/preferencias.js: la comparte la regularización de pedidos
// viejos. Se llama con el contexto por defecto, 'Eliminar cuenta', así que los
// mensajes del log son los mismos de siempre.

async function vencerPreferencias(admin, pedidos, yaVencidas = new Set()) {
  const pendientes = pedidos.filter((p) => p.mp_preference_id && !yaVencidas.has(p.mp_preference_id))
  if (pendientes.length === 0) return yaVencidas
  const tokens = await tokensPorVendedor(admin, pendientes.map((p) => p.vendedor_id))
  for (const p of pendientes) {
    const token = tokens.get(p.vendedor_id)
    if (!token) continue
    if (await vencerPreferencia(token, p.mp_preference_id, `pedido ${p.id}`)) yaVencidas.add(p.mp_preference_id)
  }
  return yaVencidas
}

const textoTienda = (nombre) => (String(nombre ?? '').trim() || 'la tienda')

// ¿Se puede eliminar esta cuenta, y si no, por qué?
//
// Devuelve { ok: true, existe, cerrada, puede, motivos, numeros, apodo,
//            tiene_pedidos, tienda, pedidos, pagos, abandonados }
//      o { ok: false, error: 'mp_no_responde' | 'error' }.
//
//   motivos   en el orden en que se muestran (ver ORDEN_MOTIVOS)
//   numeros   cuántos hay de cada cosa (para el admin)
//   tienda    { nombre } si tiene una (cualquier estado), si no null
//   pedidos   los pedidos en camino: [{ id, tienda }] — nada más
//   pagos     los pedidos con un pago en proceso: [{ id, tienda }] — nada más
//   abandonados  interno: los pedidos que se cancelarían al eliminar
export async function evaluarCuenta(admin, userId) {
  const { data, error } = await admin.rpc('rpc_evaluar_eliminar_cuenta', { p_id: userId })
  if (error || !data || typeof data !== 'object') {
    console.error('Eliminar cuenta: no se pudo evaluar —', error?.message || 'respuesta vacía')
    return { ok: false, error: 'error' }
  }
  if (!data.existe) return { ok: true, existe: false, cerrada: false, puede: false, motivos: [] }
  if (data.cerrada) return { ok: true, existe: true, cerrada: true, puede: false, motivos: [] }

  const motivos = [...(data.motivos || [])]
  const abandonados = Array.isArray(data.abandonados) ? data.abandonados : []

  // ── Pagos en camino que la base todavía no ve ──
  // Un pedido "abandonado" puede tener un pago aprobado o en proceso cuyo aviso
  // no llegó aún. Se le pregunta a MercadoPago, pedido por pedido.
  const tokens = await tokensPorVendedor(admin, abandonados.map((p) => p.vendedor_id))
  const conPagoEnCamino = []
  try {
    for (const p of abandonados) {
      const token = tokens.get(p.vendedor_id)
      if (!token) continue
      const pagos = await pagosDelPedido(token, p.id)
      if (pagos.some((pago) => ESTADOS_PAGO_EN_CAMINO.includes(pago.status))) conPagoEnCamino.push(p.id)
    }
  } catch (err) {
    if (err instanceof MercadoPagoNoResponde) {
      console.error(`Eliminar cuenta: MercadoPago no respondió como se esperaba (${err.message}); no se elimina nada.`)
      return { ok: false, error: 'mp_no_responde' }
    }
    throw err
  }
  if (conPagoEnCamino.length > 0) motivos.push('PAGO_EN_CURSO')

  // ── Los datos que la pantalla muestra de cada impedimento ──
  let tienda = null
  const { data: tiendas, error: errorTiendas } = await admin
    .from('vendedores').select('nombre_negocio').eq('usuario_id', userId).limit(1)
  if (errorTiendas) {
    console.error('Eliminar cuenta: no se pudo leer la tienda —', errorTiendas.message)
    return { ok: false, error: 'error' }
  }
  if (tiendas && tiendas.length > 0) tienda = { nombre: tiendas[0].nombre_negocio }

  const ESTADOS_TERMINADOS = '(pendiente,rechazado,cancelado,despachado,reembolsado)'
  const { data: enCamino, error: errorCamino } = await admin
    .from('pedidos').select('id, vendedor_nombre')
    .eq('comprador_id', userId).not('estado', 'in', ESTADOS_TERMINADOS).order('id')
  const { data: conPago, error: errorPagos } = await admin
    .from('pedidos').select('id, vendedor_nombre, mp_payment_id')
    .eq('comprador_id', userId).eq('estado', 'pendiente').not('mp_payment_id', 'is', null).order('id')
  if (errorCamino || errorPagos) {
    console.error('Eliminar cuenta: no se pudieron leer los pedidos —', (errorCamino || errorPagos).message)
    return { ok: false, error: 'error' }
  }

  const pagos = (conPago || [])
    .filter((p) => !['', 'null', 'undefined'].includes(String(p.mp_payment_id ?? '').trim()))
    .map((p) => ({ id: p.id, tienda: textoTienda(p.vendedor_nombre) }))
  for (const id of conPagoEnCamino) {
    if (!pagos.some((p) => p.id === id)) {
      const aband = abandonados.find((p) => p.id === id)
      pagos.push({ id, tienda: textoTienda(aband?.vendedor_nombre) })
    }
  }

  // El nombre de la tienda de los abandonados no viene de la base: se completa
  // para los que tienen un pago en camino.
  const sinNombre = pagos.filter((p) => p.tienda === 'la tienda').map((p) => p.id)
  if (sinNombre.length > 0) {
    const { data: filas } = await admin.from('pedidos').select('id, vendedor_nombre').in('id', sinNombre)
    for (const f of filas || []) {
      const p = pagos.find((x) => x.id === f.id)
      if (p) p.tienda = textoTienda(f.vendedor_nombre)
    }
  }

  const { data: cuenta } = await admin.from('usuarios').select('nombre_usuario').eq('id', userId).maybeSingle()

  const motivosOrdenados = ordenarMotivos(motivos)

  return {
    ok: true,
    existe: true,
    cerrada: false,
    puede: motivosOrdenados.length === 0,
    motivos: motivosOrdenados,
    numeros: {
      tiendas: data.tiendas || 0,
      pedidos_activos: data.pedidos_activos || 0,
      pagos_en_curso: Math.max(data.pagos_en_curso || 0, pagos.length),
    },
    apodo: cuenta?.nombre_usuario || null,
    tiene_pedidos: (data.pedidos_total || 0) > 0,
    tienda,
    pedidos: (enCamino || []).map((p) => ({ id: p.id, tienda: textoTienda(p.vendedor_nombre) })),
    pagos,
    abandonados,
  }
}

// Elimina la cuenta, con todas las verificaciones repetidas.
//
// Devuelve { ok: true, resultado: 'borrada' | 'anonimizada' | 'ya_cerrada', emails, nombre }
//      o { ok: false, status, error?, evaluacion? }:
//   409 + evaluacion: algo lo impide (la pantalla muestra los motivos)
//   503: MercadoPago no respondió como se esperaba
//   500: error inesperado
//
// Orden: evaluar (con MercadoPago) → vencer los links de pago de los pedidos
// sin pagar → la transacción de la base → vencer los que se hayan sumado entre
// medio. Si algo falla antes de la transacción, no se tocó nada de la cuenta.
export async function eliminarCuenta(admin, userId) {
  const evaluacion = await evaluarCuenta(admin, userId)

  if (!evaluacion.ok) {
    return { ok: false, status: evaluacion.error === 'mp_no_responde' ? 503 : 500, error: evaluacion.error }
  }
  if (!evaluacion.existe || evaluacion.cerrada) {
    return { ok: true, resultado: 'ya_cerrada', emails: [], nombre: null }
  }
  if (!evaluacion.puede) {
    return { ok: false, status: 409, evaluacion }
  }

  // Vencer antes de la transacción: si la base fallara después, un carrito
  // abandonado con el link vencido no hace daño.
  const vencidas = await vencerPreferencias(admin, evaluacion.abandonados)

  const { data, error } = await admin.rpc('rpc_cerrar_cuenta', { p_id: userId })
  if (error || !data || typeof data !== 'object') {
    console.error('Eliminar cuenta: la transacción falló —', error?.message || 'respuesta vacía')
    return { ok: false, status: 500, error: 'error' }
  }

  if (data.ok === false) {
    // Cambió algo entre la evaluación y la transacción (un pedido que avanzó,
    // un pago que llegó). Se vuelve a evaluar para mostrar los motivos nuevos.
    if ((data.motivos || []).includes('SIN_PERFIL')) {
      console.error('Eliminar cuenta: la cuenta de auth no tiene perfil en usuarios', userId)
      return { ok: false, status: 500, error: 'error' }
    }
    const nueva = await evaluarCuenta(admin, userId)
    if (nueva.ok && !nueva.puede) return { ok: false, status: 409, evaluacion: nueva }
    return { ok: false, status: 409, evaluacion: { ok: true, motivos: data.motivos || [], pedidos: [], pagos: [], tienda: null } }
  }

  // Los pedidos que la transacción canceló y no estaban en la evaluación.
  await vencerPreferencias(admin, Array.isArray(data.pedidos_cancelados) ? data.pedidos_cancelados : [], vencidas)

  console.log(`Eliminar cuenta ${userId}: ${data.resultado}.`)
  return { ok: true, resultado: data.resultado, emails: data.emails || [], nombre: data.nombre || null }
}

// Lo que cualquiera de las dos puertas devuelve como "se puede / no se puede".
// Sin los datos internos (abandonados).
export function resumenDeEvaluacion(evaluacion) {
  return {
    puede: !!evaluacion.puede,
    motivos: evaluacion.motivos || [],
    apodo: evaluacion.apodo ?? null,
    tiene_pedidos: !!evaluacion.tiene_pedidos,
    tienda: evaluacion.tienda ?? null,
    pedidos: evaluacion.pedidos || [],
    pagos: evaluacion.pagos || [],
  }
}

// Busca una cuenta por mail exacto, sin distinguir mayúsculas (para el admin).
export async function buscarCuentaPorMail(admin, email) {
  const texto = String(email ?? '').trim()
  if (!texto || texto.length > 254) return { ok: true, cuenta: null }

  // ilike sin comodines: se escapan \ % _ para que sea una igualdad.
  const sinComodines = texto.replace(/[\\%_]/g, (c) => `\\${c}`)
  const { data, error } = await admin
    .from('usuarios').select('id, email, nombre_usuario, cerrada_en')
    .ilike('email', sinComodines).limit(1)

  if (error) {
    console.error('Eliminar cuenta (admin): no se pudo buscar por mail —', error.message)
    return { ok: false }
  }
  return { ok: true, cuenta: data && data.length > 0 ? data[0] : null }
}
