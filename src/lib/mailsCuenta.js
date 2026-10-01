// El mail que se manda cuando una persona elimina su cuenta.
//
// Con la plantilla común (mailBase.js), igual que los de pedido. El armado es
// una función pura; el envío va aparte y nunca lanza: la cuenta ya está
// eliminada y un mail que falla no puede deshacerlo.

import {
  GRIS, BORDE, FUENTE_TEXTO,
  escapar, plantilla, tituloImagen, parrafo, enviarPorResend,
} from '@/lib/mailBase'

export function armarMailCuentaEliminada({ nombre } = {}) {
  const asunto = 'Eliminamos tu cuenta de Bahía Shops'
  const quien = String(nombre ?? '').trim()
  const saludo = quien ? `Hola ${quien}:` : 'Hola:'

  const parrafos = [
    `${saludo} como pediste, eliminamos tu cuenta y tus datos de Bahía Shops.`,
    'Si tenías compras, siguen en el registro de ventas de cada tienda, sin tus datos. Lo que pagaste queda en tu cuenta de MercadoPago, como siempre.',
    'Si no fuiste vos quien lo pidió, respondé este mail.',
  ]
  const pie = 'Es el último mail que te mandamos. Bahía Shops · Bahía Blanca, Argentina.'

  const cuerpo = [
    tituloImagen('titulo-cuenta-eliminada.png', 'Tu cuenta fue eliminada'),
    ...parrafos.map((texto) => parrafo(escapar(texto))),
    `<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="margin:28px 0 0;"><tr><td style="border-top:1px solid ${BORDE};padding:16px 0 0;font-family:${FUENTE_TEXTO};font-size:12px;font-weight:300;line-height:1.6;color:${GRIS};">${escapar(pie)}</td></tr></table>`,
  ].join('\n')

  const texto = ['Tu cuenta fue eliminada', ...parrafos, pie].join('\n\n')

  return { asunto, html: plantilla({ asunto, cuerpo }), texto }
}

// Manda el mail a cada dirección, sin repetir. Devuelve cuántos salieron y
// cuántos no; en el log no queda ninguna dirección (la cuenta ya no existe y
// el log no es lugar para guardarla).
export async function enviarMailCuentaEliminada({ emails, nombre }) {
  const direcciones = [...new Set((emails || []).map((e) => String(e ?? '').trim()).filter(Boolean))]
  const resultado = { enviados: 0, fallidos: 0 }

  if (direcciones.length === 0) {
    console.error('Mail de cuenta eliminada no enviado: no había ninguna dirección.')
    return resultado
  }
  if (!process.env.RESEND_API_KEY) {
    console.error('Mail de cuenta eliminada no enviado: RESEND_API_KEY no configurada.')
    return { enviados: 0, fallidos: direcciones.length }
  }

  const mail = armarMailCuentaEliminada({ nombre })

  for (const para of direcciones) {
    try {
      const r = await enviarPorResend({ para, mail })
      if (r.ok) resultado.enviados++
      else { resultado.fallidos++; console.error(`Mail de cuenta eliminada: ${r.motivo}`) }
    } catch (err) {
      resultado.fallidos++
      console.error('Mail de cuenta eliminada falló —', err?.message || err)
    }
  }
  return resultado
}
