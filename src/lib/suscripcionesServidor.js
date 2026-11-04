// Las suscripciones del plan (migración 048), del lado del servidor: lo que
// junta la base y Mercado Pago. Lo usan el webhook, la tarea diaria, las rutas
// de la tienda y del admin, y el cierre de tiendas.
//
// Las reglas puras están en src/lib/suscripciones.js; las llamadas a Mercado
// Pago, en src/lib/mercadopago/suscripciones.js. Todo con service_role.
//
// Ninguna función lanza. Lo que se escribe sale siempre de consultar la API
// de Mercado Pago, nunca del cuerpo de un aviso. Las fechas del plan las
// calcula la base con los cobros aprobados (rpc_registrar_cobro_suscripcion),
// así que procesar dos veces lo mismo no cambia nada.

import { urlParaMercadoPago } from '@/lib/sitio'
import { fechaAR } from '@/lib/mercadopago/preferencias'
import {
  CANCELADA, ESTADOS_VIVOS, MAIL_DE_LA_PLATAFORMA, MINIMO_DIFERENCIA, REUSAR_PENDIENTE_HORAS, mensajeDeAltaRechazada,
  cuerpoDeAlta, cuerpoDeDiferencia, datosDeCobro, datosDePagoDeSuscripcion, datosDeSuscripcion,
  diferenciaProporcional, problemaDeSuscripcion, reusarPendiente, tipoDePagoDePlataforma,
} from '@/lib/suscripciones'
import {
  buscarCobrosMp, cambiarMontoMp, cancelarSuscripcionMp, crearPreferenciaMp, crearSuscripcionMp,
  idDePlataforma, leerCobroMp, mailDePlataforma, leerPagoDePlataformaMp, leerSuscripcionMp,
} from '@/lib/mercadopago/suscripciones'

const ahoraIso = () => new Date().toISOString()

// ── Lecturas ──────────────────────────────────────────────────────────────────

export async function suscripcionViva(admin, vendedorId) {
  const { data, error } = await admin
    .from('vendedor_suscripciones')
    .select('*')
    .eq('vendedor_id', vendedorId)
    .in('estado', ESTADOS_VIVOS)
    .maybeSingle()
  if (error) console.error('[suscripciones/viva]', vendedorId, error.message)
  return { fila: data || null, error }
}

async function filaPor(admin, columna, valor) {
  const { data, error } = await admin.from('vendedor_suscripciones').select('*').eq(columna, valor).maybeSingle()
  if (error) console.error(`[suscripciones/${columna}]`, valor, error.message)
  return { fila: data || null, error }
}

// ── Cobros ────────────────────────────────────────────────────────────────────

async function registrarCobro(admin, suscripcionId, d) {
  const { data, error } = await admin.rpc('rpc_registrar_cobro_suscripcion', {
    p_suscripcion_id: suscripcionId,
    p_mp_cobro_id: d.mp_cobro_id,
    p_mp_pago_id: d.mp_pago_id,
    p_estado_cobro: d.estado_cobro,
    p_estado_pago: d.estado_pago,
    p_monto: d.monto,
    p_cobrado_en: d.cobrado_en,
  })
  if (error || data?.ok === false) {
    console.error('[suscripciones/cobro]', suscripcionId, d.mp_cobro_id, d.mp_pago_id, error?.message || data?.motivo)
    return { ok: false }
  }
  return { ok: true }
}

// ── Sincronizar con Mercado Pago ─────────────────────────────────────────────

// Lee la suscripción en Mercado Pago y guarda lo que devuelve. Con conCobros,
// también trae sus cobros (para cuando un aviso no llegó).
// Devuelve { ok, fila } (la fila actualizada) o { ok: false, error, deLaBase }
// (deLaBase: falló la escritura, no Mercado Pago).
export async function sincronizarSuscripcion(admin, fila, { conCobros = true } = {}) {
  if (!fila?.mp_preapproval_id) return { ok: true, fila }

  const mp = await leerSuscripcionMp(fila.mp_preapproval_id)
  if (!mp.ok) {
    console.error('[suscripciones/sincronizar]', fila.id, mp.status, mp.error)
    return { ok: false, error: mp.error }
  }
  const problema = problemaDeSuscripcion(mp.datos, fila, idDePlataforma())
  if (problema) {
    console.error(`[suscripciones/sincronizar] la suscripción ${fila.id} (${fila.mp_preapproval_id}) no coincide: ${problema}`)
    return { ok: false, error: problema }
  }

  const d = datosDeSuscripcion(mp.datos)
  const cambios = {
    consultada_en: ahoraIso(),
    actualizada_en: ahoraIso(),
    ...(d.estado ? { estado: d.estado } : {}),
    ...(d.proximo_cobro_en ? { proximo_cobro_en: d.proximo_cobro_en } : {}),
    ...(d.monto ? { monto: d.monto } : {}),
    ...(d.estado === 'pending' && d.init_point ? { init_point: d.init_point } : {}),
    ...(d.estado === CANCELADA && !fila.cancelada_en ? { cancelada_en: ahoraIso() } : {}),
  }
  const { data: nueva, error } = await admin.from('vendedor_suscripciones').update(cambios).eq('id', fila.id).select('*').maybeSingle()
  if (error) {
    console.error('[suscripciones/sincronizar/guardar]', fila.id, error.message)
    return { ok: false, error: error.message, deLaBase: true }
  }

  if (conCobros && d.estado && d.estado !== 'pending') {
    const cobros = await buscarCobrosMp(fila.mp_preapproval_id)
    if (!cobros.ok) {
      console.warn('[suscripciones/sincronizar/cobros]', fila.id, cobros.status, cobros.error)
    } else {
      for (const c of cobros.datos?.results || []) {
        const dc = datosDeCobro(c)
        if (dc.preapproval_id !== fila.mp_preapproval_id) continue
        if (String(c.external_reference ?? fila.external_reference) !== fila.external_reference) continue
        // El estado del pago lo dice el pago: un reembolso o un contracargo se
        // ve ahí aunque su aviso no llegue (los pagos de una suscripción no
        // tienen notification_url: prueba real del 04/11).
        if (dc.mp_pago_id) {
          const pago = await leerPagoDePlataformaMp(dc.mp_pago_id)
          if (pago.ok && typeof pago.datos?.status === 'string') dc.estado_pago = pago.datos.status
          else console.warn('[suscripciones/sincronizar/pago]', fila.id, dc.mp_pago_id, pago.status, pago.error)
        }
        await registrarCobro(admin, fila.id, dc)
      }
    }
  }

  const { fila: final } = await filaPor(admin, 'id', fila.id)
  const actual = final || nueva
  // planCambio: llegó (o se devolvió) un cobro, así que el plan pudo cambiar.
  return { ok: true, fila: actual, planCambio: String(actual?.pagado_hasta ?? '') !== String(fila.pagado_hasta ?? '') }
}

// Las suscripciones que conviene sincronizar: la viva y todas las que todavía
// dan el plan (pagado_hasta futuro), aunque estén canceladas o haya otra más
// nueva: un reembolso de cualquiera de sus cobros cambia el plan. Con
// ultimaSiNoHay, si no queda ninguna, la última creada en Mercado Pago (el
// botón del admin). Devuelve { filas } o { error }.
export async function suscripcionesParaSincronizar(admin, vendedorId, { ultimaSiNoHay = false } = {}) {
  const { data, error } = await admin.from('vendedor_suscripciones').select('*')
    .eq('vendedor_id', vendedorId).not('mp_preapproval_id', 'is', null)
    .or(`estado.in.(${ESTADOS_VIVOS.join(',')}),pagado_hasta.gt.${ahoraIso()}`)
    .order('creada_en', { ascending: false })
  if (error) {
    console.error('[suscripciones/para-sincronizar]', vendedorId, error.message)
    return { error }
  }
  if (data?.length || !ultimaSiNoHay) return { filas: data || [] }
  const { data: ultima, error: errorUltima } = await admin.from('vendedor_suscripciones').select('*')
    .eq('vendedor_id', vendedorId).not('mp_preapproval_id', 'is', null)
    .order('creada_en', { ascending: false }).limit(1).maybeSingle()
  if (errorUltima) console.error('[suscripciones/para-sincronizar/ultima]', vendedorId, errorUltima.message)
  return errorUltima ? { error: errorUltima } : { filas: ultima ? [ultima] : [] }
}

// ── Alta ──────────────────────────────────────────────────────────────────────

// Crea la suscripción de una tienda por un monto y devuelve dónde pagarla.
// Si ya hay una esperando el pago por el mismo monto (de menos de
// REUSAR_PENDIENTE_HORAS), devuelve esa; si es por otro monto, la cancela.
// Devuelve { ok: true, initPoint } o { ok: false, status, error } (error es
// un texto para mostrar).
export async function crearSuscripcionDeTienda(admin, { vendedorId, plan, nombrePlan, monto, email }) {
  const { fila: viva, error: errorViva } = await suscripcionViva(admin, vendedorId)
  if (errorViva) return { ok: false, status: 500, error: 'No pudimos revisar tu suscripción. Probá de nuevo en un rato.' }
  if (viva?.estado === 'authorized' || viva?.estado === 'paused') {
    return { ok: false, status: 409, error: 'Ya tenés una suscripción activa.' }
  }
  // Nadie puede pagarse a sí mismo: el mail de la cuenta que cobra se frena
  // antes de crear nada.
  const mailCobrador = await mailDePlataforma()
  if (mailCobrador && email.toLowerCase() === mailCobrador.toLowerCase()) {
    return { ok: false, status: 400, error: MAIL_DE_LA_PLATAFORMA }
  }
  // Con otro mail va una nueva: el de una suscripción no se cambia.
  if (viva && reusarPendiente(viva, monto) && (!email || viva.payer_email === email)) {
    return { ok: true, initPoint: viva.init_point }
  }
  if (viva) {
    const cancelada = await cancelarSuscripcion(admin, viva)
    if (!cancelada.ok) return { ok: false, status: 502, error: 'No pudimos reemplazar tu suscripción anterior. Probá de nuevo en un rato.' }
  }

  const { data: fila, error } = await admin
    .from('vendedor_suscripciones')
    .insert({ vendedor_id: vendedorId, plan_clave: plan, monto, payer_email: email, estado: 'creando' })
    .select('*')
    .single()
  if (error) {
    if (error.code === '23505') return { ok: false, status: 409, error: 'Ya hay una suscripción en curso. Recargá la página.' }
    console.error('[suscripciones/alta/guardar]', vendedorId, error.message)
    return { ok: false, status: 500, error: 'No pudimos crear tu suscripción. Probá de nuevo en un rato.' }
  }

  const mp = await crearSuscripcionMp(cuerpoDeAlta({
    monto,
    email,
    referencia: fila.external_reference,
    backUrl: `${urlParaMercadoPago()}/vendedor/perfil?suscripcion=volvio`,
    motivo: `Bahía Shops · plan ${nombrePlan || plan}`,
  }))
  if (!mp.ok || !mp.datos?.id || !mp.datos?.init_point) {
    console.error('[suscripciones/alta/mp]', vendedorId, mp.status, mp.error)
    // El motivo queda en la fila (049): el log de Vercel dura minutos.
    const errorMp = `${mp.status || 'sin respuesta'} · ${mp.error || 'sin init_point'}`.slice(0, 300)
    await admin.from('vendedor_suscripciones').update({ estado: 'error', error_mp: errorMp, actualizada_en: ahoraIso() }).eq('id', fila.id)
    return { ok: false, status: 502, error: mensajeDeAltaRechazada({ status: mp.status, email, mailPlataforma: mailCobrador }) }
  }

  const problema = problemaDeSuscripcion(mp.datos, fila, idDePlataforma())
  if (problema) {
    console.error(`[suscripciones/alta] la suscripción creada no coincide (${problema}); se cancela`, vendedorId, mp.datos.id)
    await cancelarSuscripcionMp(mp.datos.id)
    await admin.from('vendedor_suscripciones').update({ estado: 'error', mp_preapproval_id: String(mp.datos.id), actualizada_en: ahoraIso() }).eq('id', fila.id)
    return { ok: false, status: 502, error: 'No pudimos crear tu suscripción. Probá de nuevo en un rato.' }
  }

  const d = datosDeSuscripcion(mp.datos)
  const { error: errorGuardar } = await admin.from('vendedor_suscripciones').update({
    mp_preapproval_id: String(mp.datos.id),
    estado: d.estado || 'pending',
    init_point: d.init_point,
    proximo_cobro_en: d.proximo_cobro_en,
    consultada_en: ahoraIso(),
    actualizada_en: ahoraIso(),
  }).eq('id', fila.id)
  if (errorGuardar) {
    // La suscripción existe en Mercado Pago pero no quedó anotada: se cancela
    // para que no quede una que no conocemos.
    console.error('[suscripciones/alta/anotar]', vendedorId, mp.datos.id, errorGuardar.message)
    await cancelarSuscripcionMp(mp.datos.id)
    return { ok: false, status: 500, error: 'No pudimos crear tu suscripción. Probá de nuevo en un rato.' }
  }
  console.log(`[suscripciones] tienda ${vendedorId}: suscripción ${fila.id} (${mp.datos.id}) por $${monto}, esperando el pago.`)
  return { ok: true, initPoint: d.init_point }
}

// ── Cancelar ──────────────────────────────────────────────────────────────────

// Cancela una suscripción en Mercado Pago y la anota. Si Mercado Pago no la
// cancela, se lee: si ya estaba cancelada, vale igual.
export async function cancelarSuscripcion(admin, fila) {
  if (fila.mp_preapproval_id) {
    const r = await cancelarSuscripcionMp(fila.mp_preapproval_id)
    if (!r.ok) {
      const leida = await leerSuscripcionMp(fila.mp_preapproval_id)
      if (!(leida.ok && leida.datos?.status === CANCELADA)) {
        console.error('[suscripciones/cancelar]', fila.id, fila.mp_preapproval_id, r.status, r.error)
        return { ok: false, error: r.error }
      }
    }
  }
  const { error } = await admin.from('vendedor_suscripciones')
    .update({ estado: CANCELADA, cancelada_en: ahoraIso(), actualizada_en: ahoraIso() })
    .eq('id', fila.id)
  if (error) {
    console.error('[suscripciones/cancelar/anotar]', fila.id, error.message)
    return { ok: false, error: error.message }
  }
  console.log(`[suscripciones] suscripción ${fila.id} (${fila.mp_preapproval_id || 'sin crear'}) cancelada.`)
  return { ok: true }
}

// Antes de cerrar o borrar una tienda: cancela en Mercado Pago lo que todavía
// puede cobrar. { ok: false } si alguna no se pudo (entonces no se cierra).
export async function cancelarSuscripcionesVivas(admin, vendedorId) {
  const { data, error } = await admin.from('vendedor_suscripciones').select('*')
    .eq('vendedor_id', vendedorId).in('estado', ESTADOS_VIVOS)
  if (error) {
    console.error('[suscripciones/cancelar-vivas]', vendedorId, error.message)
    return { ok: false }
  }
  let ok = true
  for (const fila of data || []) {
    if (!(await cancelarSuscripcion(admin, fila)).ok) ok = false
  }
  return { ok }
}

// ── La diferencia de un plan a medida ─────────────────────────────────────────

// Cambia el monto de la suscripción en Mercado Pago al precio del plan a
// medida (rige desde el próximo cobro). Si falla, lo anota: lo reintenta la
// tarea diaria y la ficha del admin lo muestra.
export async function aplicarMontoNuevo(admin, dif) {
  const { fila } = await filaPor(admin, 'id', dif.suscripcion_id)
  if (!fila?.mp_preapproval_id || !ESTADOS_VIVOS.includes(fila.estado)) {
    console.error('[suscripciones/monto] la suscripción de la diferencia no está viva', dif.id, fila?.estado)
    await admin.from('suscripcion_diferencias').update({
      intentos_monto_mp: (dif.intentos_monto_mp || 0) + 1, error_monto_mp: 'La suscripción no está activa.', actualizada_en: ahoraIso(),
    }).eq('id', dif.id)
    return { ok: false }
  }
  const r = Number(fila.monto) === Number(dif.precio_nuevo) ? { ok: true } : await cambiarMontoMp(fila.mp_preapproval_id, dif.precio_nuevo)
  if (!r.ok) {
    console.error('[suscripciones/monto]', dif.id, fila.mp_preapproval_id, r.status, r.error)
    await admin.from('suscripcion_diferencias').update({
      intentos_monto_mp: (dif.intentos_monto_mp || 0) + 1, error_monto_mp: String(r.error).slice(0, 300), actualizada_en: ahoraIso(),
    }).eq('id', dif.id)
    return { ok: false }
  }
  await admin.from('vendedor_suscripciones').update({ monto: dif.precio_nuevo, actualizada_en: ahoraIso() }).eq('id', fila.id)
  await admin.from('suscripcion_diferencias').update({
    monto_mp_actualizado_en: ahoraIso(), error_monto_mp: null, actualizada_en: ahoraIso(),
  }).eq('id', dif.id)
  console.log(`[suscripciones] suscripción ${fila.id}: monto en Mercado Pago -> $${dif.precio_nuevo} (diferencia ${dif.id}).`)
  return { ok: true }
}

// Una diferencia devuelta (reembolso o contracargo) deshace el cambio: la
// suscripción vuelve al monto anterior en Mercado Pago, para que el próximo
// cobro no sea por el plan a medida que ya no rige. La tienda vuelve a ver
// «pagá la diferencia de este mes».
//
// monto_mp_actualizado_en en null = nada pendiente en Mercado Pago. Si el
// cambio falla, queda con la fecha: lo reintenta la tarea diaria y la ficha
// del admin lo muestra. Con la suscripción ya cancelada, o con el monto ya
// cambiado por otra cosa, no hay nada que volver atrás.
export async function revertirMonto(admin, dif) {
  const { fila } = await filaPor(admin, 'id', dif.suscripcion_id)
  const vigente = fila?.mp_preapproval_id && ESTADOS_VIVOS.includes(fila.estado) && Number(fila.monto) === Number(dif.precio_nuevo)
  const r = vigente ? await cambiarMontoMp(fila.mp_preapproval_id, dif.monto_anterior) : { ok: true }
  if (!r.ok) {
    console.error('[suscripciones/revertir-monto]', dif.id, fila.mp_preapproval_id, r.status, r.error)
    await admin.from('suscripcion_diferencias').update({
      intentos_monto_mp: (dif.intentos_monto_mp || 0) + 1,
      error_monto_mp: `No se pudo volver al monto anterior: ${String(r.error).slice(0, 250)}`,
      actualizada_en: ahoraIso(),
    }).eq('id', dif.id)
    return { ok: false }
  }
  if (vigente) {
    await admin.from('vendedor_suscripciones').update({ monto: dif.monto_anterior, actualizada_en: ahoraIso() }).eq('id', fila.id)
    console.log(`[suscripciones] suscripción ${fila.id}: diferencia ${dif.id} devuelta, monto en Mercado Pago -> $${dif.monto_anterior}.`)
  }
  await admin.from('suscripcion_diferencias').update({
    monto_mp_actualizado_en: null, error_monto_mp: null, actualizada_en: ahoraIso(),
  }).eq('id', dif.id)
  return { ok: true }
}

// La tienda pasa a un plan a medida más caro: paga la diferencia del mes con
// un pago único, o se activa sin cobro si no llega al mínimo.
// Devuelve { ok: true, initPoint } (a pagar), { ok: true, activada: true }
// (sin cobro) o { ok: false, status, error }.
export async function crearDiferencia(admin, { vendedorId, suscripcion, plan, precioNuevo, email }) {
  let fila = suscripcion
  if (!fila.proximo_cobro_en) {
    const sincronizada = await sincronizarSuscripcion(admin, fila, { conCobros: false })
    if (sincronizada.ok) fila = sincronizada.fila
  }
  const calculo = diferenciaProporcional({ precioNuevo, montoActual: fila.monto, proximoCobro: fila.proximo_cobro_en })
  if (!calculo) {
    console.error('[suscripciones/diferencia] no se puede calcular', vendedorId, fila.id, fila.monto, precioNuevo, fila.proximo_cobro_en)
    return { ok: false, status: 500, error: 'No pudimos calcular la diferencia. Probá de nuevo en un rato.' }
  }

  const { data: pendiente, error: errorPendiente } = await admin.from('suscripcion_diferencias').select('*')
    .eq('suscripcion_id', fila.id).eq('estado', 'pendiente').maybeSingle()
  if (errorPendiente) {
    console.error('[suscripciones/diferencia/pendiente]', fila.id, errorPendiente.message)
    return { ok: false, status: 500, error: 'No pudimos revisar tu suscripción. Probá de nuevo en un rato.' }
  }
  if (pendiente) {
    const reciente = Date.now() - Date.parse(pendiente.creada_en) < REUSAR_PENDIENTE_HORAS * 3600 * 1000
    if (reciente && pendiente.precio_nuevo === precioNuevo && pendiente.init_point) return { ok: true, initPoint: pendiente.init_point }
    await admin.from('suscripcion_diferencias').update({ estado: 'vencida', actualizada_en: ahoraIso() }).eq('id', pendiente.id).eq('estado', 'pendiente')
  }

  const sinCobro = calculo.monto < MINIMO_DIFERENCIA
  const { data: dif, error } = await admin.from('suscripcion_diferencias').insert({
    suscripcion_id: fila.id,
    vendedor_id: vendedorId,
    plan_clave: plan,
    precio_nuevo: precioNuevo,
    monto_anterior: Number(fila.monto),
    monto: calculo.monto,
    cubre_hasta: fila.proximo_cobro_en,
    estado: sinCobro ? 'sin_cobro' : 'pendiente',
  }).select('*').single()
  if (error) {
    console.error('[suscripciones/diferencia/guardar]', fila.id, error.code, error.message)
    return { ok: false, status: error.code === '23505' ? 409 : 500, error: 'No pudimos preparar el pago. Probá de nuevo en un rato.' }
  }

  if (sinCobro) {
    console.log(`[suscripciones] tienda ${vendedorId}: diferencia ${dif.id} de $${calculo.monto}, por debajo del mínimo: se activa sin cobrar.`)
    await aplicarMontoNuevo(admin, dif)
    return { ok: true, activada: true }
  }

  const ahora = Date.now()
  const hasta = Math.min(ahora + REUSAR_PENDIENTE_HORAS * 3600 * 1000, Date.parse(fila.proximo_cobro_en))
  const mp = await crearPreferenciaMp({
    ...cuerpoDeDiferencia({
      monto: calculo.monto,
      referencia: dif.external_reference,
      titulo: `Bahía Shops · diferencia del plan a medida (${calculo.diasRestantes} de ${calculo.diasCiclo} días)`,
      email,
      urlMp: urlParaMercadoPago(),
    }),
    expires: true,
    expiration_date_from: fechaAR(ahora - 60 * 1000),
    expiration_date_to: fechaAR(hasta),
  })
  if (!mp.ok || !mp.datos?.init_point) {
    console.error('[suscripciones/diferencia/mp]', dif.id, mp.status, mp.error)
    await admin.from('suscripcion_diferencias').update({ estado: 'vencida', actualizada_en: ahoraIso() }).eq('id', dif.id)
    return { ok: false, status: 502, error: 'Mercado Pago no respondió. Probá de nuevo en un rato.' }
  }
  await admin.from('suscripcion_diferencias').update({
    mp_preferencia_id: String(mp.datos.id), init_point: mp.datos.init_point, actualizada_en: ahoraIso(),
  }).eq('id', dif.id)
  console.log(`[suscripciones] tienda ${vendedorId}: diferencia ${dif.id} de $${calculo.monto} (${calculo.diasRestantes}/${calculo.diasCiclo} días), esperando el pago.`)
  return { ok: true, initPoint: mp.datos.init_point }
}

// La red de los avisos de una diferencia pagada (la tarea diaria): lee el
// pago y, si cambió (por ejemplo, se devolvió), lo procesa como un aviso.
export async function revisarPagoDeDiferencia(admin, dif) {
  if (!dif.mp_pago_id) return { ok: true }
  const mp = await leerPagoDePlataformaMp(dif.mp_pago_id)
  if (!mp.ok) {
    console.warn('[suscripciones/revisar-diferencia]', dif.id, dif.mp_pago_id, mp.status, mp.error)
    return { ok: false }
  }
  if (mp.datos?.status === 'approved') return { ok: true }
  return procesarPagoDeDiferencia(admin, mp.datos)
}

async function procesarPagoDeDiferencia(admin, pago) {
  const { data: dif, error } = await admin.from('suscripcion_diferencias').select('*')
    .eq('external_reference', String(pago.external_reference)).maybeSingle()
  if (error) {
    console.error('[suscripciones/pago-diferencia]', pago.id, error.message)
    return { ok: false }
  }
  if (!dif) {
    console.error(`[suscripciones/pago-diferencia] el pago ${pago.id} trae la referencia ${pago.external_reference}, que no conocemos.`)
    return { ok: true }
  }
  if (pago.currency_id && pago.currency_id !== 'ARS') {
    console.error(`[suscripciones/pago-diferencia] POSIBLE FRAUDE — el pago ${pago.id} de la diferencia ${dif.id} no es en pesos.`)
    return { ok: true }
  }
  const { data: r, error: errorRpc } = await admin.rpc('rpc_registrar_pago_diferencia', {
    p_diferencia_id: dif.id,
    p_mp_pago_id: String(pago.id),
    p_estado_pago: String(pago.status ?? ''),
    p_monto: Number(pago.transaction_amount) || 0,
    p_pagado_en: pago.date_approved || null,
  })
  if (errorRpc) {
    console.error('[suscripciones/pago-diferencia/registrar]', dif.id, pago.id, errorRpc.message)
    return { ok: false }
  }
  if (r?.ok === false && r.motivo === 'otro_pago' && pago.status === 'approved') {
    console.error(`[webhook] PAGO DOBLE de la diferencia ${dif.id}: el pago ${pago.id} llegó después del ${dif.mp_pago_id}. Hay que devolverlo a mano desde Mercado Pago.`)
    return { ok: true }
  }
  console.log(`[suscripciones] diferencia ${dif.id}: pago ${pago.id} (${pago.status}) -> ${r?.estado}.`)
  if (r?.estado === 'pagada' && !dif.monto_mp_actualizado_en) {
    const { data: actual } = await admin.from('suscripcion_diferencias').select('*').eq('id', dif.id).maybeSingle()
    await aplicarMontoNuevo(admin, actual || dif)
  }
  if (r?.estado === 'devuelta' && dif.monto_mp_actualizado_en) {
    const { data: actual } = await admin.from('suscripcion_diferencias').select('*').eq('id', dif.id).maybeSingle()
    await revertirMonto(admin, actual || dif)
  }
  return { ok: true }
}

// ── Los avisos (webhook) ─────────────────────────────────────────────────────

// Un pago a la cuenta de la plataforma: un cobro de una suscripción o la
// diferencia de un plan a medida. Si no es de la plataforma, o es de la
// plataforma pero no de una suscripción (una venta de una tienda que cobra con
// esa misma cuenta), devuelve { manejado: false } y sigue el camino de las
// ventas.
export async function procesarPagoDePlataforma(admin, pagoId) {
  const mp = await leerPagoDePlataformaMp(pagoId)
  if (!mp.ok) return { manejado: false }
  const pago = mp.datos
  const tipo = tipoDePagoDePlataforma(pago)
  if (!tipo) return { manejado: false }

  const plataforma = idDePlataforma()
  if (plataforma && String(pago.collector_id ?? '') !== plataforma) {
    console.error(`[webhook] POSIBLE FRAUDE — el pago ${pago.id} trae una referencia nuestra (${pago.external_reference}) pero lo cobró ${pago.collector_id}.`)
    return { manejado: true, ok: true }
  }

  if (tipo === 'diferencia') return { manejado: true, ...(await procesarPagoDeDiferencia(admin, pago)) }

  const { fila, error } = await filaPor(admin, 'external_reference', String(pago.external_reference))
  if (error) return { manejado: true, ok: false }
  if (!fila) {
    console.error(`[suscripciones/pago] el pago ${pago.id} trae la referencia ${pago.external_reference}, que no conocemos.`)
    return { manejado: true, ok: true }
  }
  const d = datosDePagoDeSuscripcion(pago)
  if (d.preapproval_id && fila.mp_preapproval_id && d.preapproval_id !== fila.mp_preapproval_id) {
    console.error(`[suscripciones/pago] el pago ${pago.id} dice ser de ${d.preapproval_id} y la referencia es de ${fila.mp_preapproval_id}.`)
    return { manejado: true, ok: true }
  }
  const r = await registrarCobro(admin, fila.id, d)
  console.log(`[suscripciones] suscripción ${fila.id}: pago ${pago.id} (${pago.status}).`)
  return { manejado: true, ok: r.ok }
}

// Un aviso de suscripción (subscription_preapproval o
// subscription_authorized_payment). Devuelve { ok }: ok false = error nuestro
// (de la base), y el webhook responde 500 para que Mercado Pago reintente.
export async function procesarAvisoSuscripcion(admin, { tipo, id }) {
  if (!id) return { ok: true }

  if (tipo === 'subscription_preapproval') {
    const { fila, error } = await filaPor(admin, 'mp_preapproval_id', String(id))
    if (error) return { ok: false }
    if (!fila) {
      console.warn(`[suscripciones/aviso] suscripción ${id} que no conocemos.`)
      return { ok: true }
    }
    const r = await sincronizarSuscripcion(admin, fila)
    console.log(`[suscripciones] aviso de la suscripción ${fila.id} (${id}) -> ${r.fila?.estado ?? r.error}.`)
    return { ok: !r.deLaBase }
  }

  if (tipo === 'subscription_authorized_payment') {
    const mp = await leerCobroMp(id)
    if (!mp.ok) {
      console.error('[suscripciones/aviso-cobro]', id, mp.status, mp.error)
      // Sin respuesta de Mercado Pago: que reintente. Un 404 no es nuestro.
      return { ok: mp.status !== 0 }
    }
    const d = datosDeCobro(mp.datos)
    const { fila, error } = await filaPor(admin, 'mp_preapproval_id', String(d.preapproval_id))
    if (error) return { ok: false }
    if (!fila) {
      console.warn(`[suscripciones/aviso-cobro] cobro ${id} de una suscripción que no conocemos (${d.preapproval_id}).`)
      return { ok: true }
    }
    if (mp.datos.external_reference && String(mp.datos.external_reference) !== fila.external_reference) {
      console.error(`[suscripciones/aviso-cobro] el cobro ${id} trae otra referencia (${mp.datos.external_reference}).`)
      return { ok: true }
    }
    const r = await registrarCobro(admin, fila.id, d)
    console.log(`[suscripciones] suscripción ${fila.id}: cobro ${id} (${d.estado_cobro}, pago ${d.estado_pago}).`)
    return { ok: r.ok }
  }

  return { ok: true }
}
