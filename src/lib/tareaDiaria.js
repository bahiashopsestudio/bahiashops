// La tarea diaria (Vercel Cron → /api/cron/diaria, una vez por día entre las
// 10 y las 11 de Argentina; migración 040). Hace seis cosas, cada una por su
// lado: si una falla, las otras siguen.
//
//   1. vencidos       cancela los pedidos cuyo link o cupón venció
//                     (privado.cancelar_pedidos_vencidos; el panel de la
//                     tienda lo sigue haciendo también al abrirse).
//   2. mercadopago    renueva los tokens que vencen en 30 días o menos (de
//                     tiendas sin cerrar; las pausadas, sí). Si falla, NO
//                     desconecta: marca la cuenta y avisa UNA vez a la tienda
//                     y a notificaciones@.
//   3. aviso_14_dias  la invitación a reseñar de un pedido pagado hace 14 a 21
//                     días que la tienda no marcó entregado.
//   4. recordatorio   uno solo, a los 7 días de la invitación (la que haya
//                     sido), si quedan 3 días o más de ventana.
//   5. suscripciones  las suscripciones del plan (048): lee en Mercado Pago
//                     cada una viva (o cancelada con días pagos) y sus
//                     cobros con el estado de cada pago (por si un aviso o un
//                     reembolso no llegó), cancela las que esperan el pago
//                     hace más de 7 días, reintenta el monto nuevo de las
//                     diferencias pagadas, revisa si se devolvió alguna y
//                     vuelve al monto anterior el de las devueltas.
//                     Después (050): hace caer las tiendas cuyo plan pago
//                     terminó (la red de pg_cron) y cancela en Mercado Pago
//                     las que cayeron por falta de pago (si falla, se
//                     reintenta mañana). Sin MP_ACCESS_TOKEN_PLATAFORMA, no
//                     corre.
//   6. mails_del_plan los tres mails de cuando deja de pagar (050): el cobro
//                     rechazado, los últimos días de la gracia y la vuelta al
//                     Gratis. Una sola vez cada uno (src/lib/mailsPlan.js).
//
// Cada mail se marca en la base ANTES de mandarlo, con un UPDATE que solo se
// lleva la fila si la marca estaba en null: dos corridas el mismo día (o a la
// vez) no mandan nada repetido. Si Resend falla, la marca se suelta y sale al
// día siguiente.
//
// Quedan afuera de los mails: cancelados y reembolsados (no están en
// ESTADOS_PARA_RESENAR), tiendas cerradas y cuentas eliminadas.
//
// Modo prueba: arma la lista de lo que HARÍA (pedido, a quién, qué mail, qué
// cuenta renovaría) sin mandar, renovar ni cambiar nada.
//
// Las reglas (qué pedido recibe qué) son funciones puras, sin base ni red:
// las prueba scripts/probar-040.mjs.

import { ESTADOS_PARA_RESENAR, estadoDeResena, ventanaDeResena } from '@/lib/resenas'
import { avisarResena14Dias, recordarResena, armarMailAviso14Dias, armarMailRecordatorioResena } from '@/lib/mailsPedidos'
import { renovarToken, marcarRenovacionFallida } from '@/lib/mercadopago/tokens'
import { enviarMailRenovacionFallida, enviarMailRenovacionFallidaInterno } from '@/lib/mailsCuentaMp'
import { ESTADOS_VIVOS, caidaConMail, graciaHasta, mailDeCobroQueToca, pendienteAbandonada } from '@/lib/suscripciones'
import { tokenDePlataforma } from '@/lib/mercadopago/suscripciones'
import {
  aplicarMontoNuevo, cancelarCaidasPorFaltaDePago, cancelarSuscripcion, revertirMonto, revisarPagoDeDiferencia, sincronizarSuscripcion,
} from '@/lib/suscripcionesServidor'
import { enviarMailPlan } from '@/lib/mailsPlan'

const DIA_MS = 24 * 60 * 60 * 1000

// Resend: tope de mails por corrida (el plan gratis manda 100 por día y los
// mails de las compras también cuentan). Lo que no entra sale mañana.
export const TOPE_MAILS_POR_CORRIDA = 40
// Resend acepta unos pocos envíos por segundo: uno cada tanto.
const PAUSA_ENTRE_MAILS_MS = 600

// El aviso de los 14 días sale entre el día 14 y el 21 desde el pago.
export const AVISO_DESDE_DIA = 14
export const AVISO_HASTA_DIA = 21
export const DIAS_PARA_RECORDATORIO = 7
export const DIAS_MINIMOS_DE_VENTANA = 3
export const DIAS_PARA_RENOVAR_MP = 30
// Una invitación de hace más de esto ya no tiene ventana (la más larga es la
// del pago: hasta el día 44): no hace falta leerla.
const DIAS_MAXIMOS_DESDE_INVITACION = 45

// La fecha de corte del aviso de los 14 días: solo los pedidos pagados desde
// acá (los que cumplen 14 días a partir de que se publica la tarea). Los
// anteriores no lo reciben; si la tienda los marca entregados, les llega el
// «¿Cómo te fue?» como siempre. El recordatorio no tiene corte.
export const AVISO_14_DIAS_PAGADOS_DESDE = '2026-10-06T00:00:00-03:00'

// La fecha de corte en milisegundos. Para probar en la máquina propia, fuera
// de producción (NODE_ENV distinto de 'production', o sea `npm run dev`), se
// puede correr con AVISO_14_DIAS_PAGADOS_DESDE en .env.local (una fecha ISO).
// En producción, y en cualquier build, es siempre la constante, aunque la
// variable esté cargada (como URL_PUBLICA_DESARROLLO, src/lib/sitio.js).
export function pagadosDesdeParaAviso(entorno = process.env) {
  if (entorno.NODE_ENV !== 'production') {
    const valor = String(entorno.AVISO_14_DIAS_PAGADOS_DESDE ?? '').trim()
    if (valor) {
      const desde = Date.parse(valor)
      if (Number.isFinite(desde)) return desde
      console.warn('AVISO_14_DIAS_PAGADOS_DESDE no es una fecha: se usa la fecha de corte del código.')
    }
  }
  return Date.parse(AVISO_14_DIAS_PAGADOS_DESDE)
}

// ── Las reglas ────────────────────────────────────────────────────────────────
//
// Cada candidato: { pedido, resena (o null), comprador { email, cerrada_en }
// (o null), tienda { nombre_negocio, cerrada_en } (o null) }. Devuelven null si
// le corresponde el mail, o el motivo por el que no.

function ms(valor) {
  const n = Date.parse(valor)
  return Number.isFinite(n) ? n : null
}

// Una cuenta eliminada no recibe mails: le queda un mail .invalid.
export function mailDeQuienCompro(comprador) {
  if (!comprador || comprador.cerrada_en) return null
  const email = String(comprador.email ?? '').trim()
  return email && !/\.invalid$/i.test(email) ? email : null
}

function motivoComun(c) {
  if (!c?.pedido || !ESTADOS_PARA_RESENAR.includes(c.pedido.estado)) return 'no_corresponde'
  if (!c.tienda || c.tienda.cerrada_en) return 'tienda_cerrada'
  if (!mailDeQuienCompro(c.comprador)) return 'cuenta_eliminada'
  if (c.resena) return 'ya_reseno'
  return null
}

export function motivoSinAviso14Dias(c, { ahoraMs, pagadosDesdeMs }) {
  const comun = motivoComun(c)
  if (comun) return comun
  const { pedido } = c
  if (ms(pedido.entregado_at) !== null) return 'entregado'
  if (pedido.aviso_resena_en) return 'ya_invitado'
  const pago = ms(pedido.pagado_en)
  if (pago === null) return 'no_corresponde'
  const dias = Math.floor((ahoraMs - pago) / DIA_MS)
  if (dias < AVISO_DESDE_DIA) return 'todavia_no'
  if (dias > AVISO_HASTA_DIA) return 'pasado_el_dia_21'
  if (Number.isFinite(pagadosDesdeMs) && pago < pagadosDesdeMs) return 'antes_del_corte'
  if (estadoDeResena({ pedido, resena: null, ahoraMs }).estado !== 'puede') return 'ventana_cerrada'
  return null
}

export function motivoSinRecordatorio(c, { ahoraMs }) {
  const comun = motivoComun(c)
  if (comun) return comun
  const { pedido } = c
  const invitacion = ms(pedido.aviso_resena_en)
  if (invitacion === null) return 'sin_invitacion'
  if (pedido.recordatorio_resena_en) return 'ya_recordado'
  if (ahoraMs - invitacion < DIAS_PARA_RECORDATORIO * DIA_MS) return 'todavia_no'
  if (estadoDeResena({ pedido, resena: null, ahoraMs }).estado !== 'puede') return 'ventana_cerrada'
  const ventana = ventanaDeResena(pedido)
  if (!ventana || ventana.hasta - ahoraMs < DIAS_MINIMOS_DE_VENTANA * DIA_MS) return 'poca_ventana'
  return null
}

// Una cuenta de MercadoPago que hay que renovar: null, o el motivo por el que no.
export function motivoSinRenovar(cuenta, tienda, ahoraMs) {
  if (!tienda || tienda.cerrada_en) return 'tienda_cerrada'
  const vence = ms(cuenta?.token_expira_en)
  if (vence !== null && vence - ahoraMs > DIAS_PARA_RENOVAR_MP * DIA_MS) return 'todavia_no'
  return null
}

// ── Las lecturas ──────────────────────────────────────────────────────────────

const CAMPOS_PEDIDO = 'id, estado, vendedor_id, comprador_id, comprador_nombre, vendedor_nombre, pagado_en, entregado_at, aviso_resena_en, aviso_resena_via, recordatorio_resena_en'

function iso(valorMs) {
  return new Date(valorMs).toISOString()
}

function fallar(que, error) {
  throw new Error(`no se pudo leer ${que}: ${error.message}`)
}

async function leerPorIds(admin, tabla, campos, columna, ids) {
  if (ids.length === 0) return []
  const { data, error } = await admin.from(tabla).select(campos).in(columna, ids)
  if (error) fallar(tabla, error)
  return data || []
}

// Los pedidos, con su reseña, quién compró y la tienda.
async function completar(admin, pedidos) {
  const ids = pedidos.map((p) => p.id)
  const compradores = [...new Set(pedidos.map((p) => p.comprador_id).filter(Boolean))]
  const tiendas = [...new Set(pedidos.map((p) => p.vendedor_id).filter((v) => v !== null && v !== undefined))]
  const [resenas, cuentas, vendedores] = await Promise.all([
    leerPorIds(admin, 'resenas', 'pedido_id', 'pedido_id', ids),
    leerPorIds(admin, 'usuarios', 'id, email, cerrada_en', 'id', compradores),
    leerPorIds(admin, 'vendedores', 'id, nombre_negocio, cerrada_en', 'id', tiendas),
  ])
  const conResena = new Set(resenas.map((r) => String(r.pedido_id)))
  const porCuenta = new Map(cuentas.map((u) => [u.id, u]))
  const porTienda = new Map(vendedores.map((v) => [String(v.id), v]))
  return pedidos.map((pedido) => ({
    pedido,
    resena: conResena.has(String(pedido.id)) ? { pedido_id: pedido.id } : null,
    comprador: porCuenta.get(pedido.comprador_id) || null,
    tienda: porTienda.get(String(pedido.vendedor_id)) || null,
  }))
}

function nombreDeLaTienda(c) {
  return String(c.pedido.vendedor_nombre || c.tienda?.nombre_negocio || '').trim() || 'la tienda'
}

// ── El cupo de mails y la pausa entre envíos ──────────────────────────────────

function nuevoCupo(tope, pausaMs) {
  let yaMando = false
  return {
    restantes: tope,
    usados: 0,
    tomar(cantidad = 1) {
      if (this.restantes < cantidad) return false
      this.restantes -= cantidad
      this.usados += cantidad
      return true
    },
    async pausar() {
      if (yaMando && pausaMs > 0) await new Promise((r) => setTimeout(r, pausaMs))
      yaMando = true
    },
  }
}

function contar(mapa, clave) {
  mapa[clave] = (mapa[clave] || 0) + 1
}

// ── Las cuatro tareas ─────────────────────────────────────────────────────────

async function tareaVencidos({ admin, prueba }) {
  if (prueba) {
    const { data, error } = await admin.rpc('rpc_pedidos_vencidos')
    if (error) throw new Error(error.message)
    return { a_cancelar: (data || []).length, lista: data || [] }
  }
  const { data, error } = await admin.rpc('rpc_cancelar_pedidos_vencidos', { p_vendedor_id: null })
  if (error) throw new Error(error.message)
  return { cancelados: Number(data) || 0 }
}

async function tareaMercadoPago({ admin, prueba, ahoraMs, cupo }) {
  const r = { candidatas: 0, renovadas: 0, fallidas: 0, avisadas: 0, ya_avisadas: 0, para_manana: 0, omitidas: {}, errores: [] }
  if (prueba) r.lista = []

  const { data: cuentas, error } = await admin
    .from('mercadopago_cuentas')
    .select('vendedor_id, mp_user_id, refresh_token, token_expira_en, renovacion_fallida_en, aviso_renovacion_en')
    .lte('token_expira_en', iso(ahoraMs + DIAS_PARA_RENOVAR_MP * DIA_MS))
    .order('token_expira_en', { ascending: true })
  if (error) fallar('mercadopago_cuentas', error)

  const vendedores = await leerPorIds(admin, 'vendedores', 'id, nombre_negocio, cerrada_en, usuario_id', 'id',
    (cuentas || []).map((c) => c.vendedor_id))
  const porTienda = new Map(vendedores.map((v) => [String(v.id), v]))
  const duenos = await leerPorIds(admin, 'usuarios', 'id, email, cerrada_en', 'id',
    [...new Set(vendedores.map((v) => v.usuario_id).filter(Boolean))])
  const porDueno = new Map(duenos.map((u) => [u.id, u]))

  for (const cuenta of cuentas || []) {
    const tienda = porTienda.get(String(cuenta.vendedor_id)) || null
    const motivo = motivoSinRenovar(cuenta, tienda, ahoraMs)
    if (motivo) { contar(r.omitidas, motivo); continue }
    r.candidatas++
    const nombre = String(tienda.nombre_negocio || '').trim() || `Tienda ${cuenta.vendedor_id}`

    if (prueba) {
      const vence = ms(cuenta.token_expira_en)
      r.lista.push({
        vendedor_id: cuenta.vendedor_id,
        tienda: nombre,
        cuenta_mp: cuenta.mp_user_id ?? null,
        vence_en: cuenta.token_expira_en,
        dias_para_vencer: vence === null ? null : Math.floor((vence - ahoraMs) / DIA_MS),
        ya_fallo_antes: !!cuenta.renovacion_fallida_en,
        ya_se_aviso: !!cuenta.aviso_renovacion_en,
      })
      continue
    }

    const renovacion = await renovarToken({ admin, vendedorId: cuenta.vendedor_id, refreshToken: cuenta.refresh_token })
    if (renovacion.ok) { r.renovadas++; continue }

    r.fallidas++
    r.errores.push({ vendedor_id: cuenta.vendedor_id, error: renovacion.error })
    // Un corte de red no es una renovación fallida: se reintenta mañana.
    if (renovacion.codigo === 'MP_SIN_RESPUESTA') continue
    await marcarRenovacionFallida({ admin, vendedorId: cuenta.vendedor_id, error: renovacion.error })

    if (cuenta.aviso_renovacion_en) { r.ya_avisadas++; continue }
    // Son dos mails: el de la tienda y el interno.
    if (!cupo.tomar(2)) { r.para_manana++; continue }

    const { data: reclamo, error: errorReclamo } = await admin
      .from('mercadopago_cuentas')
      .update({ aviso_renovacion_en: new Date().toISOString() })
      .eq('vendedor_id', cuenta.vendedor_id)
      .is('aviso_renovacion_en', null)
      .not('renovacion_fallida_en', 'is', null)
      .select('vendedor_id')
      .maybeSingle()
    if (errorReclamo) {
      r.errores.push({ vendedor_id: cuenta.vendedor_id, error: `no se pudo marcar el aviso: ${errorReclamo.message}` })
      continue
    }
    if (!reclamo) { r.ya_avisadas++; continue }

    const dueno = porDueno.get(tienda.usuario_id)
    const para = dueno && !dueno.cerrada_en && !/\.invalid$/i.test(dueno.email || '') ? dueno.email : null
    await cupo.pausar()
    const alaTienda = await enviarMailRenovacionFallida({ para, tienda: nombre })
    if (!alaTienda.enviado && alaTienda.motivo !== 'sin_destinatario') {
      // Resend falló: se suelta la marca y se reintenta mañana (los dos).
      const { error: errorSoltar } = await admin
        .from('mercadopago_cuentas')
        .update({ aviso_renovacion_en: null })
        .eq('vendedor_id', cuenta.vendedor_id)
      r.errores.push({
        vendedor_id: cuenta.vendedor_id,
        error: `el mail a la tienda no salió (${alaTienda.motivo})` + (errorSoltar ? `; y la marca no se pudo soltar: ${errorSoltar.message}` : ''),
      })
      continue
    }
    await cupo.pausar()
    const interno = await enviarMailRenovacionFallidaInterno({
      tienda: nombre,
      vendedorId: cuenta.vendedor_id,
      cuenta: cuenta.mp_user_id ?? null,
      venceEn: cuenta.token_expira_en,
      error: renovacion.error,
    })
    if (!interno.enviado) r.errores.push({ vendedor_id: cuenta.vendedor_id, error: `el mail interno no salió (${interno.motivo})` })
    r.avisadas++
  }
  return r
}

async function tareaResenas({ admin, prueba, ahoraMs, cupo, tipo, pagadosDesdeMs }) {
  const r = { candidatos: 0, enviados: 0, no_enviados: 0, para_manana: 0, omitidos: {}, motivos_no_enviados: {} }
  if (prueba) r.lista = []

  let consulta = admin.from('pedidos').select(CAMPOS_PEDIDO).in('estado', ESTADOS_PARA_RESENAR)
  if (tipo === 'aviso_14_dias') {
    consulta = consulta
      .is('entregado_at', null)
      .is('aviso_resena_en', null)
      .lte('pagado_en', iso(ahoraMs - AVISO_DESDE_DIA * DIA_MS))
      .gt('pagado_en', iso(ahoraMs - (AVISO_HASTA_DIA + 1) * DIA_MS))
      .order('pagado_en', { ascending: true })
  } else {
    consulta = consulta
      .not('aviso_resena_en', 'is', null)
      .is('recordatorio_resena_en', null)
      .lte('aviso_resena_en', iso(ahoraMs - DIAS_PARA_RECORDATORIO * DIA_MS))
      .gt('aviso_resena_en', iso(ahoraMs - DIAS_MAXIMOS_DESDE_INVITACION * DIA_MS))
      .order('aviso_resena_en', { ascending: true })
  }
  const { data: pedidos, error } = await consulta
  if (error) fallar('pedidos', error)

  let candidatos = await completar(admin, pedidos || [])
  const motivo = tipo === 'aviso_14_dias'
    ? (c) => motivoSinAviso14Dias(c, { ahoraMs, pagadosDesdeMs })
    : (c) => motivoSinRecordatorio(c, { ahoraMs })
  candidatos = candidatos.filter((c) => {
    const m = motivo(c)
    if (m) contar(r.omitidos, m)
    return !m
  })
  // Los recordatorios que cierran antes, primero.
  if (tipo === 'recordatorio') {
    candidatos.sort((a, b) => ventanaDeResena(a.pedido).hasta - ventanaDeResena(b.pedido).hasta)
  }
  r.candidatos = candidatos.length

  for (const c of candidatos) {
    if (!cupo.tomar(1)) { r.para_manana++; continue }
    const datos = {
      pedidoId: c.pedido.id,
      tienda: nombreDeLaTienda(c),
      nombre: c.pedido.comprador_nombre,
      para: mailDeQuienCompro(c.comprador),
    }
    if (prueba) {
      const armar = tipo === 'aviso_14_dias' ? armarMailAviso14Dias : armarMailRecordatorioResena
      r.lista.push({
        pedido: datos.pedidoId,
        tienda: datos.tienda,
        para: datos.para,
        mail: tipo,
        asunto: armar(datos).asunto,
        dias_desde_pago: Math.floor((ahoraMs - ms(c.pedido.pagado_en)) / DIA_MS),
        ...(tipo === 'recordatorio' ? { invitacion: c.pedido.aviso_resena_via || 'entregado' } : {}),
      })
      continue
    }
    await cupo.pausar()
    const enviar = tipo === 'aviso_14_dias' ? avisarResena14Dias : recordarResena
    const resultado = await enviar({ admin, ...datos })
    if (resultado.enviado) r.enviados++
    else { r.no_enviados++; contar(r.motivos_no_enviados, resultado.motivo) }
  }
  return r
}

// ── Las suscripciones del plan (048) ─────────────────────────────────────────
//
// La red de los avisos de Mercado Pago: si uno no llegó, acá se lee igual.
// Una suscripción que se está creando hace más de un día (se cortó en el
// medio) también se cancela.
async function tareaSuscripciones({ admin, prueba, ahoraMs }) {
  if (!tokenDePlataforma()) return { omitida: 'sin MP_ACCESS_TOKEN_PLATAFORMA' }
  const r = { revisadas: 0, sincronizadas: 0, canceladas_sin_pagar: 0, montos_aplicados: 0, montos_revertidos: 0, fallidas: 0 }
  if (prueba) r.lista = []

  // Las vivas y las canceladas que todavía dan el plan: un reembolso de su
  // último cobro se ve leyendo el pago (sincronizarSuscripcion).
  const { data: vivas, error } = await admin.from('vendedor_suscripciones').select('*')
    .or(`estado.in.(${ESTADOS_VIVOS.join(',')}),and(estado.eq.cancelled,pagado_hasta.gt.${iso(ahoraMs)})`)
  if (error) fallar('vendedor_suscripciones', error)
  for (const fila of vivas || []) {
    r.revisadas++
    const trabada = fila.estado === 'creando' && ahoraMs - ms(fila.creada_en) > DIA_MS
    const accion = pendienteAbandonada(fila, ahoraMs) || trabada ? 'cancelar_sin_pagar' : 'sincronizar'
    if (prueba) { r.lista.push({ suscripcion: fila.id, tienda: fila.vendedor_id, estado: fila.estado, accion }); continue }
    if (accion === 'cancelar_sin_pagar') {
      if ((await cancelarSuscripcion(admin, fila)).ok) r.canceladas_sin_pagar++
      else r.fallidas++
    } else if ((await sincronizarSuscripcion(admin, fila)).ok) r.sincronizadas++
    else r.fallidas++
  }

  const { data: difs, error: errorDifs } = await admin.from('suscripcion_diferencias').select('*')
    .in('estado', ['pagada', 'sin_cobro']).is('monto_mp_actualizado_en', null)
  if (errorDifs) fallar('suscripcion_diferencias', errorDifs)
  for (const d of difs || []) {
    if (prueba) { r.lista.push({ diferencia: d.id, tienda: d.vendedor_id, accion: 'aplicar_monto', monto: d.precio_nuevo }); continue }
    if ((await aplicarMontoNuevo(admin, d)).ok) r.montos_aplicados++
    else r.fallidas++
  }

  // Diferencias devueltas cuyo monto sigue cambiado en Mercado Pago: volver
  // al anterior.
  const { data: devueltas, error: errorDevueltas } = await admin.from('suscripcion_diferencias').select('*')
    .eq('estado', 'devuelta').not('monto_mp_actualizado_en', 'is', null)
  if (errorDevueltas) fallar('suscripcion_diferencias', errorDevueltas)
  for (const d of devueltas || []) {
    if (prueba) { r.lista.push({ diferencia: d.id, tienda: d.vendedor_id, accion: 'revertir_monto', monto: d.monto_anterior }); continue }
    if ((await revertirMonto(admin, d)).ok) r.montos_revertidos++
    else r.fallidas++
  }

  // Diferencias pagadas en los últimos 40 días: si el pago se devolvió y el
  // aviso no llegó, se ve leyéndolo.
  const { data: pagadas, error: errorPagadas } = await admin.from('suscripcion_diferencias').select('*')
    .eq('estado', 'pagada').not('mp_pago_id', 'is', null).gt('pagada_en', iso(ahoraMs - 40 * DIA_MS))
  if (errorPagadas) fallar('suscripcion_diferencias', errorPagadas)
  for (const d of pagadas || []) {
    if (prueba) continue
    if (!(await revisarPagoDeDiferencia(admin, d)).ok) r.fallidas++
  }

  // ── Cuando deja de pagar (050) ──
  // Las tiendas cuyo plan pago ya terminó y todavía no cayeron (la red de
  // pg_cron), y la cancelación en Mercado Pago de las que cayeron por falta de
  // pago (si falla, queda anotada en la caída y se reintenta mañana).
  if (prueba) {
    const { data: caidasAbiertas, error: errorAbiertas } = await admin.from('plan_caidas')
      .select('id, vendedor_id, motivo, mp_cancelada_en').is('restaurada_en', null)
    if (errorAbiertas) fallar('plan_caidas', errorAbiertas)
    for (const c of caidasAbiertas || []) {
      if (c.motivo === 'falta_de_pago' && !c.mp_cancelada_en) r.lista.push({ caida: c.id, tienda: c.vendedor_id, accion: 'cancelar_en_mercado_pago' })
    }
  } else {
    const { data: cayeron, error: errorCaidas } = await admin.rpc('rpc_aplicar_caidas_vencidas')
    if (errorCaidas) fallar('las caídas', errorCaidas)
    r.caidas = Number(cayeron) || 0
    const cancelacion = await cancelarCaidasPorFaltaDePago(admin)
    r.canceladas_por_caida = cancelacion.canceladas
    r.fallidas += cancelacion.fallidas
  }
  return r
}

// ── Los mails del plan (050) ──────────────────────────────────────────────────
//
// 1 y 2: las suscripciones con un cobro rechazado, en la gracia
// (mailDeCobroQueToca). 3: las caídas que todavía no avisaron (caidaConMail).
// Cada mail reclama su marca antes de salir; si Resend falla, se suelta y sale
// mañana.

// El nombre de la tienda, la dirección de su cuenta, su plan y cuántos
// productos tiene. null si la tienda está cerrada o no se encuentra.
async function datosParaMail(admin, vendedorId) {
  const { data: tienda, error } = await admin.from('vendedores').select('id, nombre_negocio, usuario_id, cerrada_en').eq('id', vendedorId).maybeSingle()
  if (error) fallar('vendedores', error)
  if (!tienda || tienda.cerrada_en) return null
  const [dueno, plan, guardados, visibles, gratis] = await Promise.all([
    admin.from('usuarios').select('email, cerrada_en').eq('id', tienda.usuario_id).maybeSingle(),
    admin.rpc('rpc_plan_de_tienda', { p_vendedor_id: vendedorId }),
    admin.from('productos').select('id', { count: 'exact', head: true }).eq('vendedor_id', vendedorId),
    admin.from('productos').select('id', { count: 'exact', head: true }).eq('vendedor_id', vendedorId).in('estado', ['activo', 'agotado', 'en_revision']),
    admin.from('planes').select('tope_productos').eq('clave', 'gratis').maybeSingle(),
  ])
  for (const x of [dueno, plan, guardados, visibles, gratis]) if (x.error) fallar('los datos del mail', x.error)
  const email = dueno.data && !dueno.data.cerrada_en && !/\.invalid$/i.test(dueno.data.email || '') ? dueno.data.email : null
  const topeGratis = Number(gratis.data?.tope_productos) || 10
  return {
    para: email,
    tienda: String(tienda.nombre_negocio || '').trim() || `Tienda ${vendedorId}`,
    plan: plan.data?.nombre || 'Básico',
    aMedida: plan.data?.origen === 'especial',
    // El plan que perdió (el de la caída abierta), para el mail 3.
    planCaida: plan.data?.caida?.nombre || null,
    productos: guardados.count ?? 0,
    sePausarian: Math.max(0, (visibles.count ?? 0) - topeGratis),
    topeGratis,
  }
}

export async function tareaMailsDelPlan({ admin, prueba, ahoraMs, cupo }) {
  // Sin la cuenta de la plataforma no hay suscripciones (como la tarea 5).
  if (!tokenDePlataforma()) return { omitida: 'sin MP_ACCESS_TOKEN_PLATAFORMA' }
  const r ={ rechazo: 0, fin_gracia: 0, caida: 0, no_enviados: 0, para_manana: 0, motivos_no_enviados: {} }
  if (prueba) r.lista = []

  // 1 y 2.
  const { data: rechazadas, error } = await admin.from('vendedor_suscripciones')
    .select('id, vendedor_id, estado, monto, plan_clave, pagado_hasta, cobro_fallido_desde, aviso_rechazo_en, aviso_fin_gracia_en')
    .in('estado', ['authorized', 'paused']).not('cobro_fallido_desde', 'is', null)
  if (error) fallar('vendedor_suscripciones', error)
  for (const s of rechazadas || []) {
    const tipo = mailDeCobroQueToca(s, ahoraMs)
    if (!tipo || !s.vendedor_id) continue
    const hasta = graciaHasta(s.pagado_hasta)
    const datos = await datosParaMail(admin, s.vendedor_id)
    if (!datos) continue
    const dias = Math.max(1, Math.ceil((Date.parse(hasta) - ahoraMs) / DIA_MS))
    if (prueba) { r.lista.push({ suscripcion: s.id, tienda: datos.tienda, para: datos.para, mail: tipo, hasta }); continue }
    if (!cupo.tomar(1)) { r.para_manana++; continue }
    const marca = tipo === 'rechazo' ? 'aviso_rechazo_en' : 'aviso_fin_gracia_en'
    const { data: reclamo, error: errorReclamo } = await admin.from('vendedor_suscripciones')
      .update({ [marca]: new Date().toISOString() }).eq('id', s.id).is(marca, null).select('id').maybeSingle()
    if (errorReclamo) fallar('la marca del mail', errorReclamo)
    if (!reclamo) continue
    await cupo.pausar()
    const envio = await enviarMailPlan({ ...datos, tipo, monto: s.monto, hasta, dias })
    if (envio.enviado || envio.motivo === 'sin_destinatario') { if (envio.enviado) r[tipo]++; else r.no_enviados++; continue }
    await admin.from('vendedor_suscripciones').update({ [marca]: null }).eq('id', s.id)
    r.no_enviados++
    contar(r.motivos_no_enviados, envio.motivo)
  }

  // 3.
  const { data: caidas, error: errorCaidas } = await admin.from('plan_caidas')
    .select('id, vendedor_id, motivo, plan_clave, a_medida, pausados, cayo_en, restaurada_en, aviso_mail_en')
    .is('restaurada_en', null).is('aviso_mail_en', null)
  if (errorCaidas) fallar('plan_caidas', errorCaidas)
  for (const c of caidas || []) {
    if (!caidaConMail(c, ahoraMs)) continue
    const datos = await datosParaMail(admin, c.vendedor_id)
    if (!datos) continue
    const delMail = { ...datos, plan: datos.planCaida || 'Básico', aMedida: c.a_medida === true, motivo: c.motivo, pausados: Number(c.pausados) || 0 }
    if (prueba) { r.lista.push({ caida: c.id, tienda: datos.tienda, para: datos.para, mail: 'caida', pausados: delMail.pausados }); continue }
    if (!cupo.tomar(1)) { r.para_manana++; continue }
    const { data: reclamo, error: errorReclamo } = await admin.from('plan_caidas')
      .update({ aviso_mail_en: new Date().toISOString() }).eq('id', c.id).is('aviso_mail_en', null).is('restaurada_en', null).select('id').maybeSingle()
    if (errorReclamo) fallar('la marca del mail', errorReclamo)
    if (!reclamo) continue
    await cupo.pausar()
    const envio = await enviarMailPlan({ ...delMail, tipo: 'caida' })
    if (envio.enviado || envio.motivo === 'sin_destinatario') { if (envio.enviado) r.caida++; else r.no_enviados++; continue }
    await admin.from('plan_caidas').update({ aviso_mail_en: null }).eq('id', c.id)
    r.no_enviados++
    contar(r.motivos_no_enviados, envio.motivo)
  }
  return r
}

// ── La corrida ────────────────────────────────────────────────────────────────

// Devuelve el resumen (en modo prueba, con las listas). Nunca lanza.
export async function correrTareaDiaria({
  admin,
  prueba = false,
  ahoraMs = Date.now(),
  entorno = process.env,
  tope = TOPE_MAILS_POR_CORRIDA,
  pausaMs = PAUSA_ENTRE_MAILS_MS,
}) {
  const inicio = Date.now()
  const cupo = nuevoCupo(tope, prueba ? 0 : pausaMs)
  const pagadosDesdeMs = pagadosDesdeParaAviso(entorno)
  const resumen = {
    prueba,
    fecha: iso(ahoraMs),
    tope_mails: tope,
    aviso_14_dias_pagados_desde: iso(pagadosDesdeMs),
  }
  const errores = []

  // MercadoPago primero: sus mails tienen prioridad en el cupo; después los
  // avisos de los 14 días (los más viejos primero) y los recordatorios.
  const tareas = [
    ['vencidos', () => tareaVencidos({ admin, prueba })],
    ['mercadopago', () => tareaMercadoPago({ admin, prueba, ahoraMs, cupo })],
    ['aviso_14_dias', () => tareaResenas({ admin, prueba, ahoraMs, cupo, tipo: 'aviso_14_dias', pagadosDesdeMs })],
    ['recordatorio', () => tareaResenas({ admin, prueba, ahoraMs, cupo, tipo: 'recordatorio' })],
    ['suscripciones', () => tareaSuscripciones({ admin, prueba, ahoraMs })],
    // Después de las suscripciones: ya sincronizadas y con las caídas al día.
    ['mails_del_plan', () => tareaMailsDelPlan({ admin, prueba, ahoraMs, cupo })],
  ]
  for (const [nombre, correr] of tareas) {
    try {
      resumen[nombre] = await correr()
    } catch (err) {
      const mensaje = err?.message || String(err)
      resumen[nombre] = { error: mensaje }
      errores.push(`${nombre}: ${mensaje}`)
    }
  }

  resumen.mails_usados = cupo.usados
  resumen.errores = errores
  resumen.duracion_ms = Date.now() - inicio
  return resumen
}

// El resumen para el log: sin las listas (llevan direcciones de mail).
export function resumenParaElLog(resumen) {
  return JSON.parse(JSON.stringify(resumen, (clave, valor) => (clave === 'lista' ? undefined : valor)))
}
