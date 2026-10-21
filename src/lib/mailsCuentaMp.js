// Los mails de la cuenta de MercadoPago de una tienda:
//   · al vendedor, cada vez que conecta, cambia o desconecta la cuenta con la
//     que cobra;
//   · a quien compró, cuando su pedido pendiente se canceló porque la tienda
//     cambió o desconectó esa cuenta (el link de pago cobraba para la anterior).
//
// El mail al vendedor va a la dirección de su cuenta de Bahía Shops (la de la
// sesión), no a un mail de contacto: es el aviso que lo protege si alguien más
// conectó una cuenta con su sesión. El armado son funciones puras; el envío va
// aparte y nunca lanza (la conexión o la cancelación ya quedaron hechas y un
// mail que falla no las deshace).

import { SITIO_URL } from '@/lib/sitio'
import { EMAIL_CONTACTO, EMAIL_NOTIFICACIONES, REMITENTE_NO_REPLY } from '@/lib/contacto'
import {
  GRIS, BORDE, FUENTE_TEXTO, TABLA,
  escapar, pesos, negrita, plantilla, lineaAzul, tituloTexto, parrafo, tarjeta, boton, filaMonto, enviarPorResend,
} from '@/lib/mailBase'

// El texto de un error sin ninguna dirección de mail (lo que devuelve Resend o
// un fallo de red puede traerla, y el log no es lugar para ella).
function sinMails(texto) {
  return String(texto ?? '').replace(/[^\s"'<>(),;]+@[^\s"'<>(),;]+/g, '[mail]')
}

// "Ludomestica (N° 161947825)" o, sin nombre, "N° 161947825".
export function describirCuenta(cuenta) {
  if (!cuenta) return 'una cuenta de MercadoPago'
  const numero = `N° ${cuenta.id}`
  return cuenta.nickname ? `${cuenta.nickname} (${numero})` : numero
}

// Un párrafo armado en partes: un texto suelto va normal y uno entre corchetes
// ([texto]) va en negrita. De ahí salen la versión HTML (escapada) y la de texto.
function parrafoHtml(partes) {
  return parrafo(partes.map((p) => (Array.isArray(p) ? negrita(escapar(p[0])) : escapar(p))).join(''))
}

function parrafoTexto(partes) {
  return partes.map((p) => (Array.isArray(p) ? p[0] : p)).join('')
}

// ── Al vendedor ───────────────────────────────────────────────────────────────

// tipo: 'primera' (no había ninguna cuenta), 'misma' (volvió a conectar la
// misma), 'cambio' (conectó una distinta) o 'desconexion'.
//   tienda      nombre de la tienda
//   cuenta      { id, nickname } de la cuenta conectada ahora
//   anterior    { id, nickname } de la cuenta que había (no se muestra: va por si
//               hace falta en el log)
//   cancelados  cuántos pedidos pendientes de pago se cancelaron
export function armarMailCuentaMp({ tipo, tienda, cuenta = null, cancelados = 0 }) {
  const nombreTienda = String(tienda ?? '').trim() || 'tu tienda'
  const linkPanel = `${SITIO_URL}/vendedor/perfil`

  let asunto
  let titulo
  const parrafos = []

  if (tipo === 'primera' || tipo === 'misma') {
    asunto = `Conectaste MercadoPago a ${nombreTienda}`
    titulo = 'Conectaste tu cuenta de MercadoPago'
    parrafos.push(['Vinculaste la cuenta de MercadoPago ', [describirCuenta(cuenta)], ' a ', [nombreTienda], '. Desde ahora los pagos de tus ventas van a esa cuenta.'])
  } else if (tipo === 'cambio') {
    asunto = `Cambiaste la cuenta de MercadoPago de ${nombreTienda}`
    titulo = 'Cambiaste tu cuenta de MercadoPago'
    parrafos.push(['Cambiaste la cuenta de MercadoPago de ', [nombreTienda], '. La cuenta anterior fue desconectada y la nueva es ', [describirCuenta(cuenta)], '.'])
  } else {
    asunto = `Desconectaste MercadoPago de ${nombreTienda}`
    titulo = 'Desconectaste tu cuenta de MercadoPago'
    parrafos.push(['Desconectaste tu cuenta de MercadoPago de ', [nombreTienda], ' en Bahía Shops. Tus productos siguen publicados pero nadie va a poder pagarlos hasta que vincules una cuenta de nuevo.'])
  }

  if (cancelados === 1) {
    parrafos.push(['Se canceló ', ['1 pedido'], ' pendiente de pago y quien compró recibió un aviso.'])
  } else if (cancelados > 1) {
    parrafos.push(['Se cancelaron ', [`${cancelados} pedidos`], ' pendientes de pago y los compradores recibieron un aviso.'])
  }
  parrafos.push([`Si no fuiste vos, desconectá la cuenta desde tu panel y escribinos a ${EMAIL_CONTACTO}.`])

  const cuerpo = [
    lineaAzul('MercadoPago'),
    tituloTexto(titulo),
    ...parrafos.map(parrafoHtml),
    boton('Ir a mi panel', linkPanel),
    `<table ${TABLA} width="100%" style="margin:28px 0 0;"><tr><td style="border-top:1px solid ${BORDE};padding:16px 0 0;font-family:${FUENTE_TEXTO};font-size:12px;font-weight:300;line-height:1.6;color:${GRIS};">Te llegó este mail porque vendés en Bahía Shops. Bahía Blanca, Argentina.</td></tr></table>`,
  ].join('\n')

  const texto = [titulo, ...parrafos.map(parrafoTexto), `Ir a mi panel: ${linkPanel}`].join('\n\n')

  return { asunto, html: plantilla({ asunto, cuerpo }), texto }
}

// Manda el mail al vendedor. Nunca lanza. Devuelve { enviado, motivo? }.
export async function enviarMailCuentaMp({ para, ...datos }) {
  const etiqueta = `Mail de cuenta de MercadoPago (${datos.tipo}, tienda ${datos.tienda ?? 'sin nombre'})`
  try {
    if (!para) {
      console.error(`${etiqueta} no enviado: no hay dirección.`)
      return { enviado: false, motivo: 'sin_destinatario' }
    }
    if (!process.env.RESEND_API_KEY) {
      console.error(`${etiqueta} no enviado: RESEND_API_KEY no configurada.`)
      return { enviado: false, motivo: 'sin_configurar' }
    }
    const resultado = await enviarPorResend({ para, mail: armarMailCuentaMp(datos) })
    if (!resultado.ok) {
      console.error(`${etiqueta} falló: ${sinMails(resultado.motivo)}`)
      return { enviado: false, motivo: 'resend_error' }
    }
    console.log(`${etiqueta}: enviado.`)
    return { enviado: true }
  } catch (err) {
    console.error(`${etiqueta} falló —`, sinMails(err?.message || err))
    return { enviado: false, motivo: 'excepcion' }
  }
}

// ── A quien compró ────────────────────────────────────────────────────────────

function descripcionItem(item) {
  return `${item.cantidad} × ${item.nombre}${item.variante ? ` · ${item.variante}` : ''}`
}

function subtotalItem(item) {
  return Number(item.precio || 0) * Number(item.cantidad || 0)
}

// El pedido de quien compró se canceló porque la tienda cambió o desconectó su
// cuenta de MercadoPago.
//   pedidoId, tienda, slugTienda, apodo (o null),
//   items [{ nombre, variante, cantidad, precio }], costoEnvio, total
export function armarMailCuentaCambiada({ pedidoId, tienda, slugTienda = null, apodo = null, items = [], costoEnvio = 0, total = null }) {
  const nombreTienda = String(tienda ?? '').trim() || 'la tienda'
  const nombreApodo = String(apodo ?? '').trim()
  const slug = String(slugTienda ?? '').trim()
  const linkTienda = slug ? `${SITIO_URL}/tienda/${encodeURIComponent(slug)}` : SITIO_URL
  const lista = Array.isArray(items) ? items : []

  const asunto = `Tu pedido en ${nombreTienda} fue cancelado`
  const titulo = 'Tu pedido fue cancelado'

  const aviso = [
    `Hola${nombreApodo ? ` ${nombreApodo}` : ''}. Tu pedido en `, [nombreTienda],
    ' fue cancelado porque la tienda cambió su configuración de pagos. El link de pago ya no es válido.',
  ]
  const volver = ['Si te interesa volver a comprar, podés visitar la tienda y hacer un pedido nuevo cuando tenga los pagos habilitados.']

  const conTotal = lista.length > 0 && total !== null && total !== undefined
  const filas = lista.map((item) => filaMonto(escapar(descripcionItem(item)), pesos(subtotalItem(item))))
  if (lista.length > 0 && Number(costoEnvio) > 0) filas.push(filaMonto('Envío', pesos(costoEnvio)))
  if (conTotal) filas.push(filaMonto('Total', pesos(total), { fuerte: true, borde: true }))

  const lineasItems = lista.map((item) => `${descripcionItem(item)}: ${pesos(subtotalItem(item))}`)
  if (lista.length > 0 && Number(costoEnvio) > 0) lineasItems.push(`Envío: ${pesos(costoEnvio)}`)
  if (conTotal) lineasItems.push(`Total: ${pesos(total)}`)

  const pieTexto = `Recibiste este mail porque hiciste un pedido en Bahía Shops. Si no querés recibir más mensajes como este, podés pedir el retiro o bloqueo de tus datos escribiendo a ${EMAIL_CONTACTO}. Bahía Blanca, Argentina.`
  const pieHtml = 'Recibiste este mail porque hiciste un pedido en Bahía Shops. Si no querés recibir más mensajes como este, podés pedir el retiro o bloqueo de tus datos escribiendo a ' +
    `<a href="mailto:${escapar(EMAIL_CONTACTO)}" style="color:${GRIS};">${escapar(EMAIL_CONTACTO)}</a>. Bahía Blanca, Argentina.`

  const cuerpo = [
    lineaAzul(`Pedido #${pedidoId}`),
    tituloTexto(titulo),
    parrafoHtml(aviso),
    ...(lista.length > 0 ? [tarjeta('LO QUE HABÍAS PEDIDO', `<table ${TABLA} width="100%">${filas.join('\n')}</table>`)] : []),
    parrafoHtml(volver),
    boton('Ver la tienda', linkTienda),
    `<p style="margin:28px 0 0;font-family:${FUENTE_TEXTO};font-size:13px;font-weight:300;line-height:1.6;color:${GRIS};">${pieHtml}</p>`,
  ].join('\n')

  const texto = [
    `PEDIDO #${pedidoId}`,
    titulo,
    parrafoTexto(aviso),
    ...(lista.length > 0 ? [['LO QUE HABÍAS PEDIDO', ...lineasItems].join('\n')] : []),
    parrafoTexto(volver),
    `Ver la tienda: ${linkTienda}`,
    pieTexto,
  ].join('\n\n')

  return { asunto, html: plantilla({ asunto, cuerpo }), texto }
}

// Manda el mail a quien compró. Nunca lanza. Devuelve { enviado, motivo? }.
export async function enviarMailCuentaCambiada({ para, ...datos }) {
  const etiqueta = `Pedido ${datos.pedidoId}: mail de cancelación por cambio de cuenta de MercadoPago`
  try {
    if (!para) {
      console.error(`${etiqueta} no enviado: quien compró no tiene una dirección válida.`)
      return { enviado: false, motivo: 'sin_destinatario' }
    }
    if (!process.env.RESEND_API_KEY) {
      console.error(`${etiqueta} no enviado: RESEND_API_KEY no configurada.`)
      return { enviado: false, motivo: 'sin_configurar' }
    }
    const resultado = await enviarPorResend({
      para,
      mail: armarMailCuentaCambiada(datos),
      desde: REMITENTE_NO_REPLY,
      responderA: EMAIL_CONTACTO,
    })
    if (!resultado.ok) {
      console.error(`${etiqueta} falló: ${sinMails(resultado.motivo)}`)
      return { enviado: false, motivo: 'resend_error' }
    }
    console.log(`${etiqueta}: enviado.`)
    return { enviado: true }
  } catch (err) {
    console.error(`${etiqueta} falló —`, sinMails(err?.message || err))
    return { enviado: false, motivo: 'excepcion' }
  }
}

// ── La renovación del permiso falló (tarea diaria, migración 040) ─────────────
//
// Uno a la tienda (a la dirección de su cuenta) y uno interno a
// notificaciones@. Salen una sola vez por falla: la tarea reclama
// mercadopago_cuentas.aviso_renovacion_en antes de mandar.

const PIE_VENDEDOR = `<table ${TABLA} width="100%" style="margin:28px 0 0;"><tr><td style="border-top:1px solid ${BORDE};padding:16px 0 0;font-family:${FUENTE_TEXTO};font-size:12px;font-weight:300;line-height:1.6;color:${GRIS};">Te llegó este mail porque vendés en Bahía Shops. Bahía Blanca, Argentina.</td></tr></table>`

export function armarMailRenovacionFallida({ tienda }) {
  const nombreTienda = String(tienda ?? '').trim() || 'tu tienda'
  const linkPanel = `${SITIO_URL}/vendedor/perfil`
  const asunto = `Volvé a conectar Mercado Pago en ${nombreTienda}`
  const explicacion = ['No pudimos renovar la conexión de tu cuenta de Mercado Pago con ', [nombreTienda], '. Tus productos siguen publicados, pero para que puedan pagarte tenés que volver a conectarla.']

  const cuerpo = [
    lineaAzul('Mercado Pago'),
    parrafo('Hola,'),
    parrafoHtml(explicacion),
    boton('Conectar Mercado Pago', linkPanel),
    PIE_VENDEDOR,
  ].join('\n')

  const texto = ['Hola,', parrafoTexto(explicacion), `Conectar Mercado Pago: ${linkPanel}`].join('\n\n')

  return { asunto, html: plantilla({ asunto, cuerpo }), texto }
}

// El interno: tienda, id, cuenta de MP, vencimiento y el error (sin tokens).
export function armarMailRenovacionFallidaInterno({ tienda, vendedorId, cuenta, venceEn, error }) {
  const nombreTienda = String(tienda ?? '').trim() || `Tienda ${vendedorId}`
  const asunto = `⚠️ No se pudo renovar MP — ${nombreTienda}`
  const titulo = 'No se pudo renovar Mercado Pago'
  const explicacion = 'La tarea diaria no pudo renovar el permiso de esta tienda. La cuenta sigue conectada (no se borró ni se desconectó) y la tienda recibió un mail para volver a conectarla.'
  const vence = Date.parse(venceEn)
  const datos = [
    ['Tienda', nombreTienda],
    ['Id de la tienda', String(vendedorId)],
    ['Cuenta de MP', cuenta ? `N° ${cuenta}` : 'Sin número'],
    ['Vence', Number.isFinite(vence)
      ? new Date(vence).toLocaleString('es-AR', { timeZone: 'America/Argentina/Buenos_Aires', dateStyle: 'long', timeStyle: 'short' })
      : 'Sin fecha'],
    ['Error', sinMails(error) || 'Sin detalle'],
  ]

  const cuerpo = [
    tituloTexto(titulo),
    parrafo(escapar(explicacion)),
    tarjeta('La cuenta', `<table ${TABLA} width="100%">${datos.map(([e, v]) => filaMonto(escapar(e), escapar(v))).join('\n')}</table>`),
  ].join('\n')

  const texto = [titulo, explicacion, datos.map(([e, v]) => `${e}: ${v}`).join('\n')].join('\n\n')

  return { asunto, html: plantilla({ asunto, cuerpo }), texto }
}

// Nunca lanzan. Devuelven { enviado, motivo? }.
export async function enviarMailRenovacionFallida({ para, tienda }) {
  return enviarConEtiqueta(`Mail de renovación fallida de MercadoPago a la tienda (${tienda ?? 'sin nombre'})`, {
    para,
    mail: () => armarMailRenovacionFallida({ tienda }),
  })
}

export async function enviarMailRenovacionFallidaInterno(datos) {
  return enviarConEtiqueta(`Mail interno de renovación fallida de MercadoPago (tienda ${datos.vendedorId})`, {
    para: EMAIL_NOTIFICACIONES,
    mail: () => armarMailRenovacionFallidaInterno(datos),
    desde: REMITENTE_NO_REPLY,
    responderA: EMAIL_NOTIFICACIONES,
  })
}

async function enviarConEtiqueta(etiqueta, { para, mail, desde, responderA }) {
  try {
    if (!para) {
      console.error(`${etiqueta} no enviado: no hay dirección.`)
      return { enviado: false, motivo: 'sin_destinatario' }
    }
    if (!process.env.RESEND_API_KEY) {
      console.error(`${etiqueta} no enviado: RESEND_API_KEY no configurada.`)
      return { enviado: false, motivo: 'sin_configurar' }
    }
    const resultado = await enviarPorResend({
      para,
      mail: mail(),
      ...(desde ? { desde } : {}),
      ...(responderA ? { responderA } : {}),
    })
    if (!resultado.ok) {
      console.error(`${etiqueta} falló: ${sinMails(resultado.motivo)}`)
      return { enviado: false, motivo: 'resend_error' }
    }
    console.log(`${etiqueta}: enviado.`)
    return { enviado: true }
  } catch (err) {
    console.error(`${etiqueta} falló —`, sinMails(err?.message || err))
    return { enviado: false, motivo: 'excepcion' }
  }
}
