// La firma de los avisos de Mercado Pago (webhook), sin red ni base. La usa
// /api/mercadopago/webhook y la prueba scripts/probar-firma-webhook.mjs.
//
// Mercado Pago manda x-signature ("ts=…,v1=…") y x-request-id, y firma con
// HMAC-SHA256 y la clave secreta de la aplicación este texto:
//   id:[data.id de la URL];request-id:[x-request-id];ts:[ts];
// El id sale de la URL (no del cuerpo) y va en minúsculas si tiene letras
// (los ids de las suscripciones las tienen). Si falta una parte, se saca del
// texto entera. (Documentación de Webhooks, «Validar origen de la
// notificación».)
//
// Devuelve { valida, motivo }: motivo es null si es válida, o 'sin_clave',
// 'sin_headers', 'header_incompleto' o 'no_coincide'.

import crypto from 'node:crypto'

export function partesDeLaFirma(xSignature) {
  const partes = {}
  for (const parte of String(xSignature ?? '').split(',')) {
    const [clave, ...resto] = parte.split('=')
    if (clave) partes[clave.trim()] = resto.join('=').trim()
  }
  return partes
}

export function manifiesto({ dataId, xRequestId, ts }) {
  let texto = ''
  if (dataId !== undefined && dataId !== null && String(dataId) !== '') texto += `id:${String(dataId).toLowerCase()};`
  if (xRequestId) texto += `request-id:${xRequestId};`
  if (ts) texto += `ts:${ts};`
  return texto
}

export function verificarFirma({ xSignature, xRequestId, dataId, secreto }) {
  if (!secreto) return { valida: false, motivo: 'sin_clave' }
  if (!xSignature) return { valida: false, motivo: 'sin_headers' }

  const { ts, v1 } = partesDeLaFirma(xSignature)
  if (!ts || !v1) return { valida: false, motivo: 'header_incompleto' }

  const hmac = crypto.createHmac('sha256', secreto).update(manifiesto({ dataId, xRequestId, ts })).digest('hex')
  // Comparación en tiempo constante: con === se puede ir adivinando la firma
  // midiendo cuánto tarda en fallar. timingSafeEqual exige el mismo largo, y
  // un largo distinto ya es una firma inválida.
  const esperada = Buffer.from(hmac, 'utf8')
  const recibida = Buffer.from(v1, 'utf8')
  const valida = esperada.length === recibida.length && crypto.timingSafeEqual(esperada, recibida)
  return { valida, motivo: valida ? null : 'no_coincide' }
}

// ¿Se rechazan los avisos con la firma mal? Solo con MP_FIRMA_ESTRICTA=1.
// Sin ella (la semana de observación) se loguea y se procesa igual: todo lo
// que se escribe sale de consultar la API de Mercado Pago, nunca del aviso.
export const firmaEstricta = (entorno = process.env) => String(entorno.MP_FIRMA_ESTRICTA ?? '').trim() === '1'
