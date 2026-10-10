// Mail de recordatorio de carrito abandonado. Lo manda la plataforma en nombre
// de la tienda cuando el vendedor aprieta "Recordarle".
//
// Separado de mailsPedidos.js porque los mails de pedido (venta, compra,
// despacho) tienen que ver con ventas confirmadas; este es anterior al pago.
//
// El armado es una función pura: recibe los datos y devuelve
// { asunto, html, texto }. El envío (con el reclamo de "una sola vez") está en
// src/app/api/vendedor/pedidos/recordar/route.js.

import { EMAIL_CONTACTO } from '@/lib/contacto'
import { SITIO_URL } from '@/lib/sitio'
import {
  FUENTE_TEXTO, GRIS, BORDE, TABLA,
  escapar, pesos, plantilla, lineaAzul, tituloTexto, parrafo,
  tarjeta, boton, filaMonto,
} from '@/lib/mailBase'

function descripcionItem(item) {
  return `${item.cantidad} × ${item.nombre}${item.variante ? ` · ${item.variante}` : ''}`
}

function subtotalItem(item) {
  return Number(item.precio || 0) * Number(item.cantidad || 0)
}

// El pie con el derecho de retiro o bloqueo de los datos (Ley 25.326,
// Disposición 4/2009 de la DNPDP). Es obligatorio en un mail como este.
const PIE_LEGAL = [
  'Recibiste este mail porque iniciaste una compra en Bahía Shops.',
  `Si no querés recibir más mensajes como este, podés pedir el retiro o bloqueo de tus datos escribiendo a ${EMAIL_CONTACTO}.`,
  'Bahía Blanca, Argentina.',
]

export function armarMailRecordatorio({ tienda, slugTienda, apodo, items }) {
  const asunto = `Tu carrito en ${tienda} te espera`
  const linkTienda = `${SITIO_URL}/tienda/${encodeURIComponent(slugTienda)}`
  const lista = items || []
  const saludo = `Hola${apodo ? ` ${apodo}` : ''}. Vimos que estuviste mirando algo en ${tienda} y no llegaste a completar tu compra.`

  const filas = lista.map((item) =>
    filaMonto(escapar(descripcionItem(item)), pesos(subtotalItem(item)))
  )

  const cuerpo = [
    lineaAzul(tienda),
    tituloTexto('Te dejaste algo en el carrito'),
    parrafo(escapar(saludo)),
    lista.length > 0
      ? tarjeta('LO QUE HABÍAS ELEGIDO', `<table ${TABLA} width="100%">${filas.join('\n')}</table>`)
      : '',
    parrafo('Si todavía te interesa, los productos te están esperando.'),
    boton('Volver a la tienda', linkTienda),
    `<table ${TABLA} width="100%" style="margin:28px 0 0;"><tr><td style="border-top:1px solid ${BORDE};padding:16px 0 0;font-family:${FUENTE_TEXTO};font-size:12px;font-weight:300;line-height:1.6;color:${GRIS};">${PIE_LEGAL.map(escapar).join('<br>')}</td></tr></table>`,
  ].filter(Boolean).join('\n')

  const texto = [
    asunto,
    saludo,
    lista.map((item) => `${descripcionItem(item)}: ${pesos(subtotalItem(item))}`).join('\n'),
    'Si todavía te interesa, los productos te están esperando.',
    `Volver a la tienda: ${linkTienda}`,
    PIE_LEGAL.join('\n'),
  ].filter(Boolean).join('\n\n')

  return { asunto, html: plantilla({ asunto, cuerpo }), texto }
}
