// El mail al vendedor cuando pausa su tienda. Uno solo, al pausar: al
// reactivar no se manda nada.
//
// Va a la dirección de su cuenta de Bahía Shops (la de la sesión), como los
// mails de la cuenta de MercadoPago (mailsCuentaMp.js). El armado es una
// función pura; el envío va aparte y nunca lanza: la tienda ya quedó pausada y
// un mail que falla no lo deshace.

import { SITIO_URL } from '@/lib/sitio'
import {
  GRIS, BORDE, FUENTE_TEXTO, TABLA,
  escapar, negrita, plantilla, lineaAzul, tituloTexto, parrafo, boton, enviarPorResend,
} from '@/lib/mailBase'

function sinMails(texto) {
  return String(texto ?? '').replace(/[^\s"'<>(),;]+@[^\s"'<>(),;]+/g, '[mail]')
}

//   tienda   nombre de la tienda
//   mensaje  lo que dejó para el público (o null)
export function armarMailPausa({ tienda, mensaje = null }) {
  const nombreTienda = String(tienda ?? '').trim() || 'Tu tienda'
  const mensajePublico = String(mensaje ?? '').trim()
  const linkPanel = `${SITIO_URL}/vendedor/perfil`

  const asunto = 'Pausaste tu tienda'
  const titulo = 'Pausaste tu tienda'
  const aviso = `Tu tienda ${nombreTienda} dejó de verse y no va a recibir pedidos nuevos. Tus productos y tus datos están guardados.`
  const pedidos = 'Los pedidos que ya tenías siguen en tu panel para que los entregues.'
  const volver = 'Cuando quieras volver, entrá a Mi negocio y reactivá tu tienda.'

  const cuerpo = [
    lineaAzul('Tu tienda'),
    tituloTexto(titulo),
    parrafo(`Tu tienda ${negrita(escapar(nombreTienda))} dejó de verse y no va a recibir pedidos nuevos. Tus productos y tus datos están guardados.`),
    ...(mensajePublico
      ? [parrafo(`Quien entre a tu tienda va a ver tu mensaje: “${escapar(mensajePublico)}”`)]
      : []),
    parrafo(escapar(pedidos)),
    parrafo(escapar(volver)),
    boton('Reactivar mi tienda', linkPanel, { azul: true }),
    `<table ${TABLA} width="100%" style="margin:28px 0 0;"><tr><td style="border-top:1px solid ${BORDE};padding:16px 0 0;font-family:${FUENTE_TEXTO};font-size:12px;font-weight:300;line-height:1.6;color:${GRIS};">Te llegó este mail porque vendés en Bahía Shops. Bahía Blanca, Argentina.</td></tr></table>`,
  ].join('\n')

  const texto = [
    titulo,
    aviso,
    ...(mensajePublico ? [`Quien entre a tu tienda va a ver tu mensaje: “${mensajePublico}”`] : []),
    pedidos,
    volver,
    `Reactivar mi tienda: ${linkPanel}`,
    'Te llegó este mail porque vendés en Bahía Shops. Bahía Blanca, Argentina.',
  ].join('\n\n')

  return { asunto, html: plantilla({ asunto, cuerpo }), texto }
}

// Manda el mail. Nunca lanza. Devuelve { enviado, motivo? }.
export async function enviarMailPausa({ para, ...datos }) {
  const etiqueta = `Mail de tienda pausada (${datos.tienda ?? 'sin nombre'})`
  try {
    if (!para) {
      console.error(`${etiqueta} no enviado: no hay dirección.`)
      return { enviado: false, motivo: 'sin_destinatario' }
    }
    if (!process.env.RESEND_API_KEY) {
      console.error(`${etiqueta} no enviado: RESEND_API_KEY no configurada.`)
      return { enviado: false, motivo: 'sin_configurar' }
    }
    const resultado = await enviarPorResend({ para, mail: armarMailPausa(datos) })
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
