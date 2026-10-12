// La cuenta de MercadoPago de una tienda: cómo se llama, y qué pasa con los
// pedidos pendientes de pago cuando la tienda cambia o desconecta la cuenta.
//
// Lo usan el callback del OAuth (conectar o cambiar de cuenta), la desconexión
// y la ruta del panel (/api/mercadopago/cuenta, para el cartel de "¿Desconectar?").
//
// Por qué se cancelan: el link de pago (y el cupón en efectivo) de un pedido
// cobra para la cuenta con la que se creó. Cuando la tienda la cambia o la
// desconecta, ya no queda guardado ningún token que pueda leer ese pago: si
// alguien pagara, el webhook no podría confirmarlo, el pedido no pasaría a
// pagado y al vencer quedaría cancelado como "vencido" aunque se hubiera pagado.
// Por eso, al cambiar o desconectar, los pendientes que todavía se pueden pagar
// se cancelan (cuenta_mp_cambiada), se vencen sus links y cupones en
// MercadoPago con el token de la cuenta anterior (a mejor esfuerzo) y se le
// avisa por mail a quien compró.

import { pedidoVencido, pedidoTienePago } from '@/lib/vencimientoPago'
import { vencerPreferencia } from '@/lib/mercadopago/preferencias'
import { enviarMailCuentaCambiada } from '@/lib/mailsCuentaMp'

const TIEMPO_MAXIMO_MP_MS = 6000

export const MOTIVO_CUENTA_MP_CAMBIADA = 'cuenta_mp_cambiada'

// Lo que hace falta de cada pedido para decidir y, después, para avisar.
const COLUMNAS_PENDIENTE = 'id, estado, comprador_id, total, costo_envio, vence_en, efectivo_vence_en, mp_payment_id, mp_preference_id, mp_user_id_cobro'

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

// Un id de cuenta guardado como texto puede haber quedado "null" o "undefined":
// es lo mismo que no tenerlo (como en validarPago.js y pagarAhora.js).
function idOVacio(valor) {
  const t = valor === null || valor === undefined ? '' : String(valor).trim()
  return t === 'undefined' || t === 'null' ? '' : t
}

// ¿Qué pedidos se cancelan al cambiar o desconectar la cuenta? Función pura.
//
// Los pendientes que todavía se pueden pagar: con el link vivo, con un cupón en
// efectivo vigente o con un pago en proceso. Los que ya vencieron no: esos los
// cancela el vencimiento de siempre (pago_vencido), y a quien compró no hay
// nada que avisarle. Con `conservar` (el id de la cuenta que se acaba de
// conectar), se dejan en paz los que cobra esa misma cuenta.
export function pedidosACancelarPorCuentaMp(pedidos, { conservar = null, ahoraMs = Date.now() } = {}) {
  const cuenta = idOVacio(conservar)
  return (pedidos || []).filter((p) =>
    p?.estado === 'pendiente'
    && !pedidoVencido(p, ahoraMs)
    && !(cuenta && idOVacio(p.mp_user_id_cobro) === cuenta)
  )
}

async function leerPendientes(admin, vendedorId) {
  const { data, error } = await admin
    .from('pedidos')
    .select(COLUMNAS_PENDIENTE)
    .eq('vendedor_id', vendedorId)
    .eq('estado', 'pendiente')
  return { pendientes: data || [], error }
}

// Cuántos pedidos se cancelarían si la tienda desconectara (o cambiara) la cuenta
// ahora. Para el cartel del panel. Devuelve un número, o null si no se pudo leer.
export async function contarPendientesPorCuentaMp(admin, vendedorId) {
  try {
    const { pendientes, error } = await leerPendientes(admin, vendedorId)
    if (error) {
      console.warn(`Cuenta de MercadoPago: no se pudieron contar los pedidos pendientes de la tienda ${vendedorId} — ${error.message}`)
      return null
    }
    return pedidosACancelarPorCuentaMp(pendientes).length
  } catch (err) {
    console.warn(`Cuenta de MercadoPago: no se pudieron contar los pedidos pendientes — ${err?.message || err}`)
    return null
  }
}

// Cancela en MercadoPago un pago que todavía no se acreditó (un cupón en
// efectivo sin pagar, una tarjeta en proceso), para que no se pueda completar.
// MercadoPago solo lo acepta sobre pagos pending o in_process. Mejor esfuerzo.
async function cancelarPagoEnMp(token, pagoId, etiqueta) {
  try {
    const res = await fetch(`https://api.mercadopago.com/v1/payments/${encodeURIComponent(pagoId)}`, {
      method: 'PUT',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: 'cancelled' }),
      signal: AbortSignal.timeout(TIEMPO_MAXIMO_MP_MS),
    })
    if (res.ok) return true
    console.warn(`Cambio de cuenta de MP: MercadoPago no aceptó cancelar el pago del ${etiqueta} (${res.status}).`)
  } catch (err) {
    console.warn(`Cambio de cuenta de MP: no se pudo cancelar el pago del ${etiqueta} — ${err?.message || err}`)
  }
  return false
}

// Los mails a quienes compraron. Cada uno por su cuenta: si uno falla, los
// demás salen igual. Nunca lanza.
async function avisarCompradores({ admin, vendedor, cancelados }) {
  try {
    const ids = cancelados.map((p) => p.id)
    const compradores = [...new Set(cancelados.map((p) => p.comprador_id).filter(Boolean))]

    const { data: items, error: errorItems } = await admin
      .from('pedido_items')
      .select('pedido_id, nombre, variante, cantidad, precio')
      .in('pedido_id', ids)
    if (errorItems) {
      console.error(`Cambio de cuenta de MP, tienda ${vendedor.id}: no se pudieron leer los productos para los mails — ${errorItems.message}. Salen sin la lista.`)
    }

    const { data: cuentas, error: errorCuentas } = compradores.length > 0
      ? await admin.from('usuarios').select('id, email, nombre_usuario, cerrada_en').in('id', compradores)
      : { data: [], error: null }
    if (errorCuentas) {
      console.error(`Cambio de cuenta de MP, tienda ${vendedor.id}: no se pudieron leer las cuentas de quienes compraron — ${errorCuentas.message}`)
    }
    const cuentaDe = (id) => (cuentas || []).find((c) => c.id === id) || null
    // Una cuenta cerrada no recibe mails: el que le queda es de mentira (.invalid).
    const mailDe = (cuenta) => (cuenta && !cuenta.cerrada_en && !/\.invalid$/i.test(cuenta.email || '') ? cuenta.email : null)

    for (const pedido of cancelados) {
      const cuenta = cuentaDe(pedido.comprador_id)
      await enviarMailCuentaCambiada({
        para: mailDe(cuenta),
        pedidoId: pedido.id,
        tienda: vendedor.nombre_negocio,
        slugTienda: vendedor.slug,
        apodo: cuenta?.nombre_usuario || null,
        items: (items || []).filter((it) => it.pedido_id === pedido.id),
        costoEnvio: pedido.costo_envio,
        total: pedido.total,
      })
    }
  } catch (err) {
    console.error(`Cambio de cuenta de MP, tienda ${vendedor.id}: error mandando los avisos a quienes compraron —`, err?.message || err)
  }
}

// Cancela los pedidos pendientes de pago de una tienda que cambió o desconectó
// su cuenta de MercadoPago, vence sus links y cupones con el token de la cuenta
// anterior y le avisa a cada persona que compró.
//
//   vendedor    { id, nombre_negocio, slug }
//   tokenViejo  el access_token de la cuenta que se va, o null si no se tiene
//   conservar   el id de la cuenta que se acaba de conectar (sus pedidos no se
//               tocan), o null al desconectar
//
// La cancelación es definitiva: si después falla vencer un link o mandar un
// mail, queda en el log y el pedido sigue cancelado. Cada pedido se avisa una
// sola vez porque el UPDATE devuelve exactamente los que canceló ESTE llamado:
// si se reintenta, los que ya estaban cancelados no vuelven a salir.
//
// Devuelve { ok: true, cancelados: n } o { ok: false, cancelados: 0 }. Nunca lanza.
export async function cancelarPendientesPorCuentaMp({ admin, vendedor, tokenViejo = null, conservar = null }) {
  try {
    const { pendientes, error } = await leerPendientes(admin, vendedor.id)
    if (error) {
      console.error(`Cambio de cuenta de MP, tienda ${vendedor.id}: no se pudieron leer los pedidos pendientes — ${error.message}`)
      return { ok: false, cancelados: 0 }
    }

    const aCancelar = pedidosACancelarPorCuentaMp(pendientes, { conservar })
    if (aCancelar.length === 0) return { ok: true, cancelados: 0 }

    // El WHERE repite "pendiente": si el webhook marcó uno como pagado entre la
    // lectura y acá, no se cancela.
    const { data: cancelados, error: errorCancelar } = await admin
      .from('pedidos')
      .update({
        estado: 'cancelado',
        cancelado_motivo: MOTIVO_CUENTA_MP_CAMBIADA,
        actualizado_en: new Date().toISOString(),
      })
      .in('id', aCancelar.map((p) => p.id))
      .eq('vendedor_id', vendedor.id)
      .eq('estado', 'pendiente')
      .select(COLUMNAS_PENDIENTE)
    if (errorCancelar) {
      console.error(`Cambio de cuenta de MP, tienda ${vendedor.id}: no se pudieron cancelar los pedidos pendientes — ${errorCancelar.message}`)
      return { ok: false, cancelados: 0 }
    }

    const lista = cancelados || []
    console.log(`Cambio de cuenta de MP, tienda ${vendedor.id}: ${lista.length} pedido(s) pendiente(s) cancelado(s) (${MOTIVO_CUENTA_MP_CAMBIADA}): ${lista.map((p) => p.id).join(', ') || 'ninguno'}.`)

    // Que el link y el cupón dejen de servir. Sin el token de la cuenta anterior
    // no se puede: quedan en el log.
    for (const pedido of lista) {
      const etiqueta = `pedido ${pedido.id}`
      if (!tokenViejo) {
        console.warn(`Cambio de cuenta de MP: sin el token de la cuenta anterior, no se vence el link del ${etiqueta}.`)
        continue
      }
      if (pedido.mp_preference_id) {
        await vencerPreferencia(tokenViejo, pedido.mp_preference_id, etiqueta, 'Cambio de cuenta de MP')
      }
      if (pedidoTienePago(pedido)) {
        await cancelarPagoEnMp(tokenViejo, String(pedido.mp_payment_id).trim(), etiqueta)
      }
    }

    if (lista.length > 0) await avisarCompradores({ admin, vendedor, cancelados: lista })

    return { ok: true, cancelados: lista.length }
  } catch (err) {
    console.error(`Cambio de cuenta de MP, tienda ${vendedor?.id}: error cancelando los pedidos pendientes —`, err?.message || err)
    return { ok: false, cancelados: 0 }
  }
}
