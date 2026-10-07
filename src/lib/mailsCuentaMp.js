// Los mails de la cuenta de MercadoPago de una tienda: al vendedor cada vez que
// conecta, cambia o desconecta la cuenta con la que cobra, y uno interno para
// avisar cuando quedan links de pago que no se pudieron vencer.
//
// El mail al vendedor va a la dirección de su cuenta de Bahía Shops (la de la
// sesión), no a un mail de contacto: es el aviso que lo protege si alguien más
// conectó una cuenta con su sesión. El armado es una función pura; el envío va
// aparte y nunca lanza (la conexión ya quedó hecha y un mail que falla no la
// deshace).

import { SITIO_URL } from '@/lib/sitio'
import { EMAIL_NOTIFICACIONES, REMITENTE_NO_REPLY } from '@/lib/contacto'
import {
  GRIS, BORDE, FUENTE_TEXTO, FUENTE_UI, TABLA,
  escapar, plantilla, lineaAzul, tituloTexto, parrafo, tarjeta, boton, enviarPorResend,
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

const PIE_VENDEDOR = 'Si no fuiste vos, entrá a tu panel, desconectá la cuenta de MercadoPago y escribinos respondiendo este mail.'

// tipo: 'primera' (no había ninguna cuenta), 'misma' (volvió a conectar la
// misma), 'cambio' (conectó una distinta) o 'desconexion'.
//   tienda            nombre de la tienda
//   cuenta            { id, nickname } de la cuenta conectada ahora
//   anterior          { id, nickname } de la cuenta que había (cambio o desconexión)
//   pedidosCancelados cuántos pedidos sin pagar se cancelaron
//   pagosEnProceso    cuántos pagos en proceso quedaron en la cuenta anterior
export function armarMailCuentaMp({ tipo, tienda, cuenta = null, anterior = null, pedidosCancelados = 0, pagosEnProceso = 0 }) {
  const nombreTienda = String(tienda ?? '').trim() || 'tu tienda'
  const linkPanel = `${SITIO_URL}/vendedor/perfil`

  let asunto
  let titulo
  const parrafos = []

  if (tipo === 'primera') {
    asunto = 'Conectaste MercadoPago a tu tienda'
    titulo = 'Conectaste tu cuenta de MercadoPago'
    parrafos.push(`Conectaste la cuenta ${describirCuenta(cuenta)} a ${nombreTienda}. Desde ahora el dinero de tus ventas va a esa cuenta.`)
  } else if (tipo === 'misma') {
    asunto = 'Volviste a conectar MercadoPago a tu tienda'
    titulo = 'Volviste a conectar tu cuenta de MercadoPago'
    parrafos.push(`Volviste a conectar la cuenta ${describirCuenta(cuenta)} a ${nombreTienda}. Es la misma que ya tenías: no cambió nada de cómo cobrás.`)
  } else if (tipo === 'cambio') {
    asunto = 'Cambiaste la cuenta de MercadoPago de tu tienda'
    titulo = 'Cambiaste tu cuenta de MercadoPago'
    parrafos.push(`Pasaste de la cuenta ${describirCuenta(anterior)} a la cuenta ${describirCuenta(cuenta)} en ${nombreTienda}. Desde ahora el dinero de tus ventas nuevas va a la cuenta nueva.`)
    parrafos.push(
      pedidosCancelados > 0
        ? `Cancelamos ${pedidosCancelados} ${pedidosCancelados === 1 ? 'pedido que todavía no se había pagado' : 'pedidos que todavía no se habían pagado'}, porque su link de pago cobraba en la cuenta anterior. Quien compró tiene que hacer el pedido de nuevo.`
        : 'No había pedidos sin pagar, así que no hubo que cancelar nada.'
    )
    if (pagosEnProceso > 0) {
      parrafos.push(`Hay ${pagosEnProceso} ${pagosEnProceso === 1 ? 'pago en proceso' : 'pagos en proceso'} (por ejemplo en efectivo) que se va a acreditar en la cuenta anterior, no en la nueva. No los cancelamos.`)
    }
    parrafos.push('Las ventas que ya estaban pagadas siguen en la cuenta en la que se cobraron.')
  } else {
    asunto = 'Desconectaste MercadoPago de tu tienda'
    titulo = 'Desconectaste tu cuenta de MercadoPago'
    parrafos.push(`Desconectaste la cuenta ${describirCuenta(anterior)} de ${nombreTienda}. Hasta que vuelvas a conectar una, nadie puede pagarte por la plataforma.`)
    if (pedidosCancelados > 0) {
      parrafos.push(`Cancelamos ${pedidosCancelados} ${pedidosCancelados === 1 ? 'pedido que todavía no se había pagado' : 'pedidos que todavía no se habían pagado'}. Quien compró tiene que hacer el pedido de nuevo.`)
    }
    if (pagosEnProceso > 0) {
      parrafos.push(`Hay ${pagosEnProceso} ${pagosEnProceso === 1 ? 'pago en proceso' : 'pagos en proceso'} que se va a acreditar igual en esa cuenta.`)
    }
  }

  const cuerpo = [
    lineaAzul('MercadoPago'),
    tituloTexto(titulo),
    ...parrafos.map((p) => parrafo(escapar(p))),
    boton('Ir a mi panel', linkPanel),
    `<p style="margin:20px 0 0;font-family:${FUENTE_TEXTO};font-size:13px;font-weight:300;line-height:1.6;color:${GRIS};">${escapar(PIE_VENDEDOR)}</p>`,
    `<table ${TABLA} width="100%" style="margin:28px 0 0;"><tr><td style="border-top:1px solid ${BORDE};padding:16px 0 0;font-family:${FUENTE_TEXTO};font-size:12px;font-weight:300;line-height:1.6;color:${GRIS};">Te llegó este mail porque vendés en Bahía Shops. Bahía Blanca, Argentina.</td></tr></table>`,
  ].join('\n')

  const texto = [titulo, ...parrafos, `Ir a mi panel: ${linkPanel}`, PIE_VENDEDOR].join('\n\n')

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

// ── Aviso interno: links que no se pudieron vencer ──
//
// Si al cambiar o desconectar la cuenta MercadoPago no deja vencer el link de
// algún pedido (o no hay token de la cuenta anterior), ese link sigue cobrando
// para la cuenta vieja hasta su fecha. Un pago ahí no lo puede ver el webhook.
// Este mail es para que alguien lo sepa. No lleva datos de ninguna persona.
export function armarMailLinksSinVencer({ tiendaId, tienda, pedidos }) {
  const asunto = `Links de pago sin vencer · Tienda ${tiendaId}`
  const titulo = 'Quedaron links de pago sin vencer'
  const explicacion =
    'Una tienda cambió o desconectó su cuenta de MercadoPago y se cancelaron sus pedidos sin pagar, ' +
    'pero MercadoPago no dejó vencer el link de pago de los pedidos de abajo. Esos links siguen cobrando para la cuenta anterior ' +
    'hasta su vencimiento (3 días desde que se creó cada pedido). Si alguien paga ahí, el aviso no se puede verificar y el pedido figura cancelado.'
  const filas = (pedidos || []).map((id) => `<p style="margin:0;font-family:${FUENTE_UI};font-size:14px;">Pedido #${escapar(id)}</p>`).join('\n')
  const cuerpo = [
    tituloTexto(titulo),
    parrafo(escapar(explicacion)),
    tarjeta(`Tienda ${tiendaId}${tienda ? ' · ' + tienda : ''}`, filas || '<p style="margin:0;">(sin detalle)</p>'),
  ].join('\n')
  const texto = [titulo, explicacion, `Tienda ${tiendaId}${tienda ? ' · ' + tienda : ''}`, ...(pedidos || []).map((id) => `Pedido #${id}`)].join('\n\n')
  return { asunto, html: plantilla({ asunto, cuerpo }), texto }
}

export async function avisarLinksSinVencer({ tiendaId, tienda, pedidos }) {
  const etiqueta = `Aviso interno de links sin vencer (tienda ${tiendaId})`
  try {
    if (!pedidos || pedidos.length === 0) return { enviado: false, motivo: 'nada_que_avisar' }
    if (!process.env.RESEND_API_KEY) {
      console.error(`${etiqueta} no enviado: RESEND_API_KEY no configurada.`)
      return { enviado: false, motivo: 'sin_configurar' }
    }
    const resultado = await enviarPorResend({
      para: EMAIL_NOTIFICACIONES,
      mail: armarMailLinksSinVencer({ tiendaId, tienda, pedidos }),
      desde: REMITENTE_NO_REPLY,
      responderA: EMAIL_NOTIFICACIONES,
    })
    if (!resultado.ok) {
      console.error(`${etiqueta} falló: ${sinMails(resultado.motivo)}`)
      return { enviado: false, motivo: 'resend_error' }
    }
    return { enviado: true }
  } catch (err) {
    console.error(`${etiqueta} falló —`, sinMails(err?.message || err))
    return { enviado: false, motivo: 'excepcion' }
  }
}

