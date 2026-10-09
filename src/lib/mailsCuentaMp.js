// Los mails de la cuenta de MercadoPago de una tienda: al vendedor cada vez que
// conecta, cambia o desconecta la cuenta con la que cobra.
//
// El mail al vendedor va a la dirección de su cuenta de Bahía Shops (la de la
// sesión), no a un mail de contacto: es el aviso que lo protege si alguien más
// conectó una cuenta con su sesión. El armado es una función pura; el envío va
// aparte y nunca lanza (la conexión ya quedó hecha y un mail que falla no la
// deshace).

import { SITIO_URL } from '@/lib/sitio'
import {
  GRIS, BORDE, FUENTE_TEXTO, TABLA,
  escapar, plantilla, lineaAzul, tituloTexto, parrafo, boton, enviarPorResend,
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
//   pagosEnProceso    cuántos pagos en efectivo en proceso quedaron en la cuenta anterior
export function armarMailCuentaMp({ tipo, tienda, cuenta = null, anterior = null, pagosEnProceso = 0 }) {
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
    parrafos.push('No cancelamos ningún pedido. Los links de pago que alguien tenía abiertos vencen solos a las 2 horas, y un pago hecho en uno de ellos en ese rato se cobra en la cuenta anterior.')
    if (pagosEnProceso > 0) {
      parrafos.push(`Hay ${pagosEnProceso} ${pagosEnProceso === 1 ? 'pago en efectivo en proceso' : 'pagos en efectivo en proceso'} que se va a acreditar en la cuenta anterior, no en la nueva.`)
    }
    parrafos.push('Las ventas que ya estaban pagadas siguen en la cuenta en la que se cobraron.')
  } else {
    asunto = 'Desconectaste MercadoPago de tu tienda'
    titulo = 'Desconectaste tu cuenta de MercadoPago'
    parrafos.push(`Desconectaste la cuenta ${describirCuenta(anterior)} de ${nombreTienda}. Hasta que vuelvas a conectar una, nadie puede pagarte por la plataforma.`)
    if (pagosEnProceso > 0) {
      parrafos.push(`Hay ${pagosEnProceso} ${pagosEnProceso === 1 ? 'pago en efectivo en proceso' : 'pagos en efectivo en proceso'} que se va a acreditar igual en esa cuenta.`)
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
