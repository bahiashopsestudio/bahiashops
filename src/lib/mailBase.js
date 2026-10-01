// La base común de los mails de Bahía Shops: la plantilla visual, las piezas
// que se repiten (línea azul, título, tarjeta, botón) y el envío por Resend.
//
// La usan los mails de pedido (mailsPedidos.js) y los de cuenta (mailsCuenta.js).
// Lo que reciben las piezas como "html" ya tiene que venir escapado; el resto
// se escapa acá.

import { EMAIL_CONTACTO, REMITENTE_CONTACTO } from '@/lib/contacto'
import { SITIO_URL } from '@/lib/sitio'

export const FUENTE_TITULO = 'Fraunces, Georgia, serif'
export const FUENTE_TEXTO = 'Poppins, Arial, sans-serif'
export const FUENTE_UI = 'Inter, Arial, sans-serif'

export const FONDO = '#faf9f7'
export const TEXTO = '#0a0a0a'
export const ACENTO = '#4164fe'
export const GRIS = '#6f6f6f'
export const BORDE = '#e8e5df'

export const TABLA = 'role="presentation" cellpadding="0" cellspacing="0" border="0"'
export const ESTILO_PARRAFO = `margin:0 0 20px;font-family:${FUENTE_TEXTO};font-size:15px;font-weight:300;line-height:1.6;color:${TEXTO};`
export const ESTILO_TITULO = `font-family:${FUENTE_TITULO};font-size:26px;font-weight:500;line-height:1.25;color:${TEXTO};`

export function escapar(texto) {
  return String(texto ?? '')
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;')
}

// "$ 14.500": punto de miles, sin decimales si el monto es entero.
export function pesos(n) {
  return `$ ${Number(n || 0).toLocaleString('es-AR')}`
}

export function negrita(html) {
  return `<strong style="font-weight:500;">${html}</strong>`
}

// La base visual de los tres mails. `cuerpo` ya viene escapado.
export function plantilla({ asunto, cuerpo }) {
  return `<!DOCTYPE html>
<html lang="es">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="color-scheme" content="light">
<meta name="supported-color-schemes" content="light">
<title>${escapar(asunto)}</title>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Fraunces:wght@500&amp;family=Poppins:wght@300;500&amp;family=Inter:wght@500;600&amp;display=swap">
</head>
<body style="margin:0;padding:0;background-color:${FONDO};">
<table ${TABLA} width="100%" bgcolor="${FONDO}" style="background-color:${FONDO};">
<tr><td align="center" style="padding:32px 16px;">
<table ${TABLA} width="600" style="width:100%;max-width:600px;">
<tr><td align="center" style="padding:0 0 32px;">
<img src="${SITIO_URL}/mail/logo.png" width="160" alt="Bahía Shops" style="display:block;border:0;font-family:${FUENTE_TITULO};font-size:22px;color:${TEXTO};">
</td></tr>
<tr><td align="left" style="font-family:${FUENTE_TEXTO};font-size:15px;font-weight:300;line-height:1.6;color:${TEXTO};">
${cuerpo}
</td></tr>
</table>
</td></tr>
</table>
</body>
</html>`
}

// La línea azul en mayúsculas chicas que va arriba del título.
export function lineaAzul(texto) {
  return `<p style="margin:0 0 10px;font-family:${FUENTE_UI};font-size:12px;font-weight:600;letter-spacing:1.2px;text-transform:uppercase;color:${ACENTO};">${escapar(texto)}</p>`
}

// El título es una imagen. Si el programa de mail no la muestra, se ve el alt
// con el estilo del título.
export function tituloImagen(archivo, texto) {
  return `<img src="${SITIO_URL}/mail/${archivo}" width="500" height="40" alt="${escapar(texto)}" style="display:block;border:0;max-width:100%;height:auto;margin:0 0 20px;${ESTILO_TITULO}">`
}

export function tituloTexto(texto) {
  return `<h1 style="margin:0 0 20px;${ESTILO_TITULO}">${escapar(texto)}</h1>`
}

export function parrafo(html) {
  return `<p style="${ESTILO_PARRAFO}">${html}</p>`
}

export function tarjeta(etiqueta, contenido) {
  return `<table ${TABLA} width="100%" style="margin:0 0 20px;">
<tr><td bgcolor="#ffffff" style="background-color:#ffffff;border:1px solid ${BORDE};border-radius:8px;padding:20px;">
<p style="margin:0 0 12px;font-family:${FUENTE_UI};font-size:11px;font-weight:600;letter-spacing:1.2px;text-transform:uppercase;color:${GRIS};">${escapar(etiqueta)}</p>
${contenido}
</td></tr>
</table>`
}

// Un <a> dentro de una celda: el color de fondo va en la celda, que es lo que
// respeta Outlook.
export function boton(texto, href, { blanco = false } = {}) {
  const fondo = blanco ? '#ffffff' : TEXTO
  const color = blanco ? TEXTO : '#ffffff'
  return `<table ${TABLA} width="100%">
<tr><td align="center" bgcolor="${fondo}" style="background-color:${fondo};border:1px solid ${TEXTO};border-radius:4px;">
<a href="${escapar(href)}" target="_blank" style="display:block;padding:14px 20px;font-family:${FUENTE_UI};font-size:14px;font-weight:600;line-height:1.2;color:${color};text-decoration:none;border-radius:4px;">${escapar(texto)}</a>
</td></tr>
</table>`
}

// Una fila de la tarjeta de la compra: descripción a la izquierda, monto a la
// derecha. `izquierda` y `derecha` ya vienen escapados.
export function filaMonto(izquierda, derecha, { fuerte = false, chica = false, borde = false } = {}) {
  const base =
    `padding:${borde ? '12px' : '5px'} 0 5px;` +
    (borde ? `border-top:1px solid ${BORDE};` : '') +
    `font-size:${chica ? '13px' : '15px'};line-height:1.5;` +
    `color:${chica ? GRIS : TEXTO};`
  const pesoTexto = fuerte ? 500 : 300
  const pesoMonto = fuerte ? 600 : 500
  return `<tr>
<td align="left" valign="top" style="${base}font-family:${FUENTE_TEXTO};font-weight:${pesoTexto};">${izquierda}</td>
<td align="right" valign="top" style="${base}padding-left:16px;white-space:nowrap;font-family:${FUENTE_UI};font-weight:${pesoMonto};">${derecha}</td>
</tr>`
}

// Manda un mail por Resend. Devuelve { ok: true } o { ok: false, motivo }.
// Puede lanzar (red caída, tiempo agotado): quien llama lo ataja.
export async function enviarPorResend({ para, mail, desde = REMITENTE_CONTACTO, responderA = EMAIL_CONTACTO }) {
  const respuesta = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${process.env.RESEND_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      from: desde,
      to: para,
      reply_to: responderA,
      subject: mail.asunto,
      html: mail.html,
      text: mail.texto,
    }),
    // Que un Resend colgado no deje esperando a quien llama.
    signal: AbortSignal.timeout(10000),
  })

  if (!respuesta.ok) {
    const detalle = await respuesta.text()
    return { ok: false, motivo: `Resend respondió ${respuesta.status}: ${detalle.slice(0, 300)}` }
  }
  return { ok: true }
}
