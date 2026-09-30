// Mails de un pedido: el aviso de venta al vendedor, la confirmación a quien
// compró (los dos cuando MercadoPago confirma el pago) y el aviso de despacho.
//
// El de despacho vivía en /api/notificaciones/despacho, una ruta sin ninguna
// verificación: alcanzaba con acertarle al número de pedido para dispararle a
// un comprador un mail con su dirección de entrega y el total. Esa ruta se
// borró. Ahora el envío se hace desde adentro de la ruta que ya comprobó que
// quien pide el despacho es el vendedor dueño del pedido.
//
// El archivo tiene tres partes:
//   1. La plantilla y las piezas que comparten los tres mails.
//   2. El armado: funciones puras que reciben los datos y devuelven
//      { asunto, html, texto }. No tocan la base ni la red, así que se pueden
//      ver sin mandar nada (scripts/preview-mails.mjs).
//   3. El envío: las lecturas, el reclamo de "una sola vez" y Resend.

import { EMAIL_CONTACTO, REMITENTE_CONTACTO } from '@/lib/contacto'
import { SITIO_URL } from '@/lib/sitio'
import { normalizarTelefonoAR, formatearTelefonoAR, linkWhatsApp } from '@/lib/telefono'
import { inicialDeApodo, colorDeApodo } from '@/lib/apodos'
import { metodoPideDireccion } from '@/lib/precioPedido'

// ── 1. Plantilla y piezas ───────────────────────────────────────────────────

const FUENTE_TITULO = 'Fraunces, Georgia, serif'
const FUENTE_TEXTO = 'Poppins, Arial, sans-serif'
const FUENTE_UI = 'Inter, Arial, sans-serif'

const FONDO = '#faf9f7'
const TEXTO = '#0a0a0a'
const ACENTO = '#4164fe'
const GRIS = '#6f6f6f'
const BORDE = '#e8e5df'

const TABLA = 'role="presentation" cellpadding="0" cellspacing="0" border="0"'
const ESTILO_PARRAFO = `margin:0 0 20px;font-family:${FUENTE_TEXTO};font-size:15px;font-weight:300;line-height:1.6;color:${TEXTO};`
const ESTILO_TITULO = `font-family:${FUENTE_TITULO};font-size:26px;font-weight:500;line-height:1.25;color:${TEXTO};`

function escapar(texto) {
  return String(texto ?? '')
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;')
}

// "$ 14.500": punto de miles, sin decimales si el monto es entero.
function pesos(n) {
  return `$ ${Number(n || 0).toLocaleString('es-AR')}`
}

function negrita(html) {
  return `<strong style="font-weight:500;">${html}</strong>`
}

// La base visual de los tres mails. `cuerpo` ya viene escapado.
function plantilla({ asunto, cuerpo }) {
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
function lineaAzul(texto) {
  return `<p style="margin:0 0 10px;font-family:${FUENTE_UI};font-size:12px;font-weight:600;letter-spacing:1.2px;text-transform:uppercase;color:${ACENTO};">${escapar(texto)}</p>`
}

// El título es una imagen. Si el programa de mail no la muestra, se ve el alt
// con el estilo del título.
function tituloImagen(archivo, texto) {
  return `<img src="${SITIO_URL}/mail/${archivo}" width="500" height="40" alt="${escapar(texto)}" style="display:block;border:0;max-width:100%;height:auto;margin:0 0 20px;${ESTILO_TITULO}">`
}

function tituloTexto(texto) {
  return `<h1 style="margin:0 0 20px;${ESTILO_TITULO}">${escapar(texto)}</h1>`
}

function parrafo(html) {
  return `<p style="${ESTILO_PARRAFO}">${html}</p>`
}

function tarjeta(etiqueta, contenido) {
  return `<table ${TABLA} width="100%" style="margin:0 0 20px;">
<tr><td bgcolor="#ffffff" style="background-color:#ffffff;border:1px solid ${BORDE};border-radius:8px;padding:20px;">
<p style="margin:0 0 12px;font-family:${FUENTE_UI};font-size:11px;font-weight:600;letter-spacing:1.2px;text-transform:uppercase;color:${GRIS};">${escapar(etiqueta)}</p>
${contenido}
</td></tr>
</table>`
}

// Un <a> dentro de una celda: el color de fondo va en la celda, que es lo que
// respeta Outlook.
function boton(texto, href, { blanco = false } = {}) {
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
function filaMonto(izquierda, derecha, { fuerte = false, chica = false, borde = false } = {}) {
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

function descripcionItem(item) {
  return `${item.cantidad} × ${item.nombre}${item.variante ? ` · ${item.variante}` : ''}`
}

function subtotalItem(item) {
  return Number(item.precio || 0) * Number(item.cantidad || 0)
}

// La tarjeta con lo comprado. Con `comision` (sólo el vendedor) agrega abajo
// la línea de la comisión.
function tarjetaCompra({ etiqueta, etiquetaTotal, items, costoEnvio, total, comision = null }) {
  const filas = (items || []).map((item) =>
    filaMonto(escapar(descripcionItem(item)), pesos(subtotalItem(item)))
  )
  if (Number(costoEnvio) > 0) filas.push(filaMonto('Envío', pesos(costoEnvio)))
  filas.push(filaMonto(etiquetaTotal, pesos(total), { fuerte: true, borde: true }))
  if (comision !== null) {
    filas.push(filaMonto('Comisión Bahía Shops', `− ${pesos(comision)}`, { chica: true }))
  }
  return tarjeta(etiqueta, `<table ${TABLA} width="100%">${filas.join('\n')}</table>`)
}

function textoCompra({ etiqueta, etiquetaTotal, items, costoEnvio, total, comision = null }) {
  const lineas = [etiqueta]
  for (const item of items || []) lineas.push(`${descripcionItem(item)}: ${pesos(subtotalItem(item))}`)
  if (Number(costoEnvio) > 0) lineas.push(`Envío: ${pesos(costoEnvio)}`)
  lineas.push(`${etiquetaTotal}: ${pesos(total)}`)
  if (comision !== null) lineas.push(`Comisión Bahía Shops: − ${pesos(comision)}`)
  return lineas.join('\n')
}

// Cómo le llega el pedido a quien compra: 'retiro', 'envio' (los métodos que
// usan dirección: cadetería y correo) o 'acordar' (el resto). Es la misma
// regla que usa el panel del vendedor para elegir el texto del WhatsApp.
export function tipoEntrega(metodoEnvio) {
  if (metodoEnvio === 'retiro') return 'retiro'
  return metodoPideDireccion(metodoEnvio) ? 'envio' : 'acordar'
}

// "+54 9 291 512-3456". Si el teléfono guardado no se puede normalizar, se
// muestra tal como está.
function telefonoALaVista(telefono) {
  const diez = normalizarTelefonoAR(telefono)
  if (diez) return formatearTelefonoAR(diez)
  return String(telefono ?? '').trim()
}

// "Calle 123, 2B" a partir de la copia de la dirección guardada en el pedido.
function calleNumeroDepto(direccion) {
  const calle = [direccion?.calle, direccion?.numero]
    .map((v) => (v == null ? '' : String(v).trim()))
    .filter(Boolean)
    .join(' ')
  const depto = direccion?.piso_depto ? String(direccion.piso_depto).trim() : ''
  return [calle, depto].filter(Boolean).join(', ')
}

const TEXTO_ENTREGA = {
  retiro: 'Retira en tu local',
  envio: 'Envío a domicilio',
  acordar: 'Acordar con vos',
}

// turno_preferido guarda 'Mañana', 'Tarde' o 'Indistinto' (y 'Noche' en la
// lista de franjas). 'Indistinto' no es una preferencia: esa fila no va.
const TEXTO_TURNO = {
  'mañana': 'Por la mañana',
  'tarde': 'Por la tarde',
  'noche': 'Por la noche',
}

function textoTurno(turno) {
  return TEXTO_TURNO[String(turno ?? '').trim().toLowerCase()] || null
}

// ── 2. Armado ───────────────────────────────────────────────────────────────
//
// Los dos mails del pago reciben el mismo objeto:
//   pedidoId, tienda, metodoEnvio (el literal de la base),
//   nombre, apellido, telefono, apodo,
//   items [{ nombre, variante, cantidad, precio }],
//   costoEnvio, total, comision,
//   direccion { calle, numero, piso_depto, barrio } o null,
//   turno (turno_preferido) o null

export function armarMailVenta(datos) {
  const { pedidoId, tienda, apodo, items, costoEnvio, total, comision } = datos
  const tipo = tipoEntrega(datos.metodoEnvio)
  const nombre = String(datos.nombre ?? '').trim()
  const nombreCompleto = [nombre, String(datos.apellido ?? '').trim()].filter(Boolean).join(' ')
  const quien = nombre || 'quien compró'
  const telefono = telefonoALaVista(datos.telefono)
  const whatsapp = linkWhatsApp(
    datos.telefono,
    `Hola${nombre ? ` ${nombre}` : ''}, te escribimos de ${tienda} por tu pedido #${pedidoId} en Bahía Shops.`
  )
  const direccion = tipo === 'envio'
    ? [calleNumeroDepto(datos.direccion), String(datos.direccion?.barrio ?? '').trim()].filter(Boolean).join(' · ')
    : ''
  const turno = textoTurno(datos.turno)
  const linkPanel = `${SITIO_URL}/vendedor/pedidos?pedido=${encodeURIComponent(pedidoId)}`

  const asunto = `Nueva venta en ${tienda} · Pedido #${pedidoId}`
  const compra = { etiqueta: 'LO QUE COMPRÓ', etiquetaTotal: 'Total cobrado', items, costoEnvio, total, comision }

  const datosEntrega = [
    ['Entrega', TEXTO_ENTREGA[tipo]],
    ['Nombre', nombreCompleto],
    ['Teléfono', telefono],
    ['Dirección', direccion],
    ['Prefiere', turno],
  ].filter(([, valor]) => valor)

  const cierre = {
    retiro: `Cuando esté listo para retirar, avisale desde el panel: así ${quien} ve en qué anda su compra.`,
    envio: `Cuando lo empieces a preparar, marcalo en el panel: así ${quien} ve en qué anda su compra.`,
    acordar: 'Escribile para acordar cuándo y dónde, y después seguí los pasos en el panel.',
  }[tipo]

  const pie = [
    'Estos datos son para entregar este pedido. No los uses para otra cosa ni los compartas.',
    'Te llegó este mail porque vendiste en Bahía Shops. Bahía Blanca, Argentina.',
  ]

  // El avatar: un círculo de 30px con la inicial, del mismo color que
  // AvatarApodo. Donde no se respeta el radio (Outlook) queda cuadrado.
  const lineaApodo = apodo ? `<table ${TABLA} style="margin:0 0 20px;">
<tr>
<td width="30" height="30" align="center" valign="middle" bgcolor="${colorDeApodo(apodo)}" style="width:30px;height:30px;border-radius:50%;background-color:${colorDeApodo(apodo)};font-family:${FUENTE_TITULO};font-size:14px;font-weight:500;line-height:30px;color:#3d3d3d;">${escapar(inicialDeApodo(apodo))}</td>
<td valign="middle" style="padding-left:10px;font-family:${FUENTE_TEXTO};font-size:15px;font-weight:300;line-height:1.5;color:${TEXTO};">En tu panel la vas a ver como ${negrita(escapar(apodo))}.</td>
</tr>
</table>` : ''

  const filasEntrega = datosEntrega.map(([etiqueta, valor]) => `<tr>
<td width="90" align="left" valign="top" style="width:90px;padding:5px 12px 5px 0;font-family:${FUENTE_UI};font-size:13px;font-weight:500;line-height:1.6;color:${GRIS};">${etiqueta}</td>
<td align="left" valign="top" style="padding:5px 0;font-family:${FUENTE_TEXTO};font-size:15px;font-weight:300;line-height:1.5;color:${TEXTO};">${escapar(valor)}</td>
</tr>`).join('\n')

  const cuerpo = [
    lineaAzul(`Pedido #${pedidoId}`),
    tituloImagen('titulo-venta.png', 'Tenés una venta nueva'),
    parrafo(`MercadoPago confirmó el pago de ${escapar(nombreCompleto)} en ${negrita(escapar(tienda))}. Ya podés empezar a prepararlo.`),
    lineaApodo,
    tarjetaCompra(compra),
    tarjeta('DATOS PARA LA ENTREGA',
      `<table ${TABLA} width="100%">${filasEntrega}</table>` +
      (whatsapp ? `<div style="height:16px;line-height:16px;font-size:16px;">&nbsp;</div>${boton('Escribirle por WhatsApp', whatsapp, { blanco: true })}` : '')
    ),
    boton('Ver el pedido en mi panel', linkPanel),
    `<p style="margin:16px 0 0;font-family:${FUENTE_TEXTO};font-size:13px;font-weight:300;line-height:1.6;color:${GRIS};">${escapar(cierre)}</p>`,
    `<table ${TABLA} width="100%" style="margin:28px 0 0;"><tr><td style="border-top:1px solid ${BORDE};padding:16px 0 0;font-family:${FUENTE_TEXTO};font-size:12px;font-weight:300;line-height:1.6;color:${GRIS};">${pie.map(escapar).join('<br>')}</td></tr></table>`,
  ].filter(Boolean).join('\n')

  const texto = [
    `PEDIDO #${pedidoId}`,
    'Tenés una venta nueva',
    `MercadoPago confirmó el pago de ${nombreCompleto} en ${tienda}. Ya podés empezar a prepararlo.`,
    apodo ? `En tu panel la vas a ver como ${apodo}.` : null,
    textoCompra(compra),
    ['DATOS PARA LA ENTREGA', ...datosEntrega.map(([etiqueta, valor]) => `${etiqueta}: ${valor}`)].join('\n'),
    whatsapp ? `Escribirle por WhatsApp: ${whatsapp}` : null,
    `Ver el pedido en mi panel: ${linkPanel}`,
    cierre,
    pie.join('\n'),
  ].filter(Boolean).join('\n\n')

  return { asunto, html: plantilla({ asunto, cuerpo }), texto }
}

export function armarMailCompra(datos) {
  const { pedidoId, tienda, items, costoEnvio, total } = datos
  const tipo = tipoEntrega(datos.metodoEnvio)
  const nombre = String(datos.nombre ?? '').trim()
  const telefono = telefonoALaVista(datos.telefono)
  const destino = tipo === 'envio' ? calleNumeroDepto(datos.direccion) : ''
  const linkPedidos = `${SITIO_URL}/mis-pedidos`

  const asunto = `Tu compra en ${tienda} está confirmada`
  const compra = { etiqueta: 'LO QUE COMPRASTE', etiquetaTotal: 'Total', items, costoEnvio, total }

  // "Qué pasa ahora" se arma una vez en partes, [texto, enNegrita], y de ahí
  // salen la versión HTML (escapada) y la de texto.
  const finales = {
    retiro: [[' cuando esté listo para que lo pases a buscar.']],
    envio: destino
      ? [[' para avisarte en qué franja horaria llega a '], [destino, true], ['.']]
      : [[' para avisarte en qué franja horaria llega.']],
    acordar: [[' para acordar la entrega.']],
  }
  const quePasa = [
    [`${tienda} te va a escribir por WhatsApp`],
    ...(telefono ? [[' al '], [telefono, true]] : []),
    ...finales[tipo],
  ]

  const saludo = nombre ? `Hola ${nombre}: ` : ''
  const pie = [
    'Si tenés algún problema con tu compra, respondé este mail.',
    'Bahía Shops · Bahía Blanca, Argentina.',
  ]

  const cuerpo = [
    lineaAzul(`Pedido #${pedidoId}`),
    tituloImagen('titulo-compra.png', '¡Tu compra está confirmada!'),
    parrafo(`${escapar(saludo)}MercadoPago confirmó tu pago y ya le avisamos a ${negrita(escapar(tienda))}.`),
    tarjetaCompra(compra),
    tarjeta('QUÉ PASA AHORA',
      `<p style="margin:0;font-family:${FUENTE_TEXTO};font-size:15px;font-weight:300;line-height:1.6;color:${TEXTO};">` +
      quePasa.map(([parte, fuerte]) => {
        if (!fuerte) return escapar(parte)
        // El teléfono no se parte en dos renglones.
        return parte === telefono
          ? `<span style="white-space:nowrap;">${negrita(escapar(parte))}</span>`
          : negrita(escapar(parte))
      }).join('') +
      '</p>'
    ),
    boton('Ver mis pedidos', linkPedidos),
    `<p style="margin:28px 0 0;font-family:${FUENTE_TEXTO};font-size:12px;font-weight:300;line-height:1.6;color:${GRIS};">${pie.map(escapar).join('<br>')}</p>`,
  ].join('\n')

  const texto = [
    `PEDIDO #${pedidoId}`,
    '¡Tu compra está confirmada!',
    `${saludo}MercadoPago confirmó tu pago y ya le avisamos a ${tienda}.`,
    textoCompra(compra),
    `QUÉ PASA AHORA\n${quePasa.map(([parte]) => parte).join('')}`,
    `Ver mis pedidos: ${linkPedidos}`,
    pie.join('\n'),
  ].join('\n\n')

  return { asunto, html: plantilla({ asunto, cuerpo }), texto }
}

// Recibe { pedido: { id, subtotal_productos, costo_envio, total },
// nombreVendedor, direccion, franja }.
export function armarMailDespacho({ pedido, nombreVendedor, direccion, franja }) {
  const asunto = `Tu pedido #${pedido.id} fue despachado`
  const titulo = '¡Tu pedido fue despachado! 🚀'
  const envio = Number(pedido.costo_envio) === 0 ? 'Gratis' : pesos(pedido.costo_envio)
  const linkPedidos = `${SITIO_URL}/mis-pedidos`
  const pie = 'Este email fue enviado desde Bahía Shops. Si tenés alguna consulta, respondé a este email.'

  const cuerpo = [
    tituloTexto(titulo),
    parrafo(`${escapar(nombreVendedor)} acaba de despachar tu pedido ${negrita(`#${pedido.id}`)}.`),
    direccion ? parrafo(`Va camino a ${negrita(escapar(direccion))}.`) : '',
    franja ? parrafo(`Franja de entrega: ${negrita(escapar(franja))}.`) : '',
    tarjeta('Resumen del pedido', `<table ${TABLA} width="100%">${[
      filaMonto('Productos', pesos(pedido.subtotal_productos)),
      filaMonto('Envío', envio),
      filaMonto('Total', pesos(pedido.total), { fuerte: true, borde: true }),
    ].join('\n')}</table>`),
    boton('Ver mis compras', linkPedidos),
    `<p style="margin:28px 0 0;font-family:${FUENTE_TEXTO};font-size:12px;font-weight:300;line-height:1.6;color:${GRIS};">${escapar(pie)}</p>`,
  ].filter(Boolean).join('\n')

  const texto = [
    titulo,
    `${nombreVendedor} acaba de despachar tu pedido #${pedido.id}.`,
    direccion ? `Va camino a ${direccion}.` : null,
    franja ? `Franja de entrega: ${franja}.` : null,
    [
      'Resumen del pedido',
      `Productos: ${pesos(pedido.subtotal_productos)}`,
      `Envío: ${envio}`,
      `Total: ${pesos(pedido.total)}`,
    ].join('\n'),
    `Ver mis compras: ${linkPedidos}`,
    pie,
  ].filter(Boolean).join('\n\n')

  return { asunto, html: plantilla({ asunto, cuerpo }), texto }
}

// ── 3. Envío ────────────────────────────────────────────────────────────────

// Manda un mail por Resend. Devuelve { ok: true } o { ok: false, motivo }.
// Puede lanzar (red caída, tiempo agotado): quien llama lo ataja.
async function enviarPorResend({ para, mail }) {
  const respuesta = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${process.env.RESEND_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      from: REMITENTE_CONTACTO,
      to: para,
      reply_to: EMAIL_CONTACTO,
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

// Manda uno de los mails del pago, una sola vez por pedido. Antes de mandar
// reclama el envío marcando la columna (aviso_vendedor_en / aviso_comprador_en)
// sólo si estaba en null: si dos avisos de MercadoPago llegan a la vez, uno
// solo se lleva la fila. Si Resend falla, la columna vuelve a null.
// Nunca lanza.
async function enviarUnaVez({ admin, pedidoId, columna, destinatario, para, armar }) {
  const etiqueta = `Pedido ${pedidoId}: mail al ${destinatario}`
  try {
    if (!para) {
      console.error(`${etiqueta} no enviado — no hay dirección de mail.`)
      return { enviado: false, motivo: 'sin_destinatario' }
    }
    if (!process.env.RESEND_API_KEY) {
      console.error(`${etiqueta} no enviado — RESEND_API_KEY no configurada.`)
      return { enviado: false, motivo: 'sin_configurar' }
    }

    // Se arma antes de reclamar: si el armado falla, no queda nada marcado.
    const mail = armar()

    const { data: reclamo, error: errorReclamo } = await admin
      .from('pedidos')
      .update({ [columna]: new Date().toISOString() })
      .eq('id', pedidoId)
      .is(columna, null)
      .select('id')
      .maybeSingle()

    if (errorReclamo) {
      console.error(`${etiqueta} no enviado — no se pudo reclamar el envío: ${errorReclamo.message}`)
      return { enviado: false, motivo: 'reclamo_fallido' }
    }
    if (!reclamo) {
      console.log(`${etiqueta} ya se había mandado; no se repite.`)
      return { enviado: false, motivo: 'ya_enviado' }
    }

    let falla = null
    try {
      const resultado = await enviarPorResend({ para, mail })
      if (!resultado.ok) falla = resultado.motivo
    } catch (err) {
      falla = err?.message || String(err)
    }

    if (falla) {
      const { error: errorSoltar } = await admin
        .from('pedidos')
        .update({ [columna]: null })
        .eq('id', pedidoId)
      console.error(
        `${etiqueta} falló — ${falla}` +
        (errorSoltar ? ` (y ${columna} no se pudo volver a null: ${errorSoltar.message})` : '')
      )
      return { enviado: false, motivo: 'resend_error' }
    }

    console.log(`${etiqueta} enviado.`)
    return { enviado: true }
  } catch (err) {
    console.error(`${etiqueta} falló —`, err)
    return { enviado: false, motivo: 'excepcion' }
  }
}

// Los dos mails de un pedido recién pagado: el aviso de venta al dueño de la
// tienda y la confirmación a quien compró. Lo llama el webhook de MercadoPago
// cuando el pedido pasa a 'pagado'. Son independientes: si uno falla, el otro
// se manda igual. Nunca lanza.
//
// 'admin' tiene que ser un cliente con service_role.
export async function avisarPago({ admin, pedidoId }) {
  const sinDatos = { enviado: false, motivo: 'sin_datos' }
  try {
    // La copia congelada en el pedido, no los datos actuales de la cuenta.
    const { data: pedido, error: errorPedido } = await admin
      .from('pedidos')
      .select(`
        id, vendedor_id, comprador_id, metodo_envio, turno_preferido,
        total, costo_envio, comision_plataforma,
        comprador_nombre, comprador_apellido, comprador_telefono, direccion_copia,
        items:pedido_items ( id, nombre, variante, cantidad, precio )
      `)
      .eq('id', pedidoId)
      .maybeSingle()

    if (errorPedido || !pedido) {
      console.error(`Pedido ${pedidoId}: mails del pago no enviados — no se pudo leer el pedido.`, errorPedido?.message)
      return { vendedor: sinDatos, comprador: sinDatos }
    }

    const { data: vendedor, error: errorVendedor } = await admin
      .from('vendedores')
      .select('nombre_negocio, usuario_id')
      .eq('id', pedido.vendedor_id)
      .maybeSingle()

    if (errorVendedor || !vendedor) {
      console.error(`Pedido ${pedidoId}: mails del pago no enviados — no se pudo leer la tienda.`, errorVendedor?.message)
      return { vendedor: sinDatos, comprador: sinDatos }
    }

    // El mail del dueño de la tienda (no el de contacto público) y el de quien
    // compró, más su apodo. Si la lectura falla, los dos quedan sin dirección
    // y cada envío lo deja en el log.
    const idsCuentas = [vendedor.usuario_id, pedido.comprador_id].filter(Boolean)
    const { data: cuentas, error: errorCuentas } = await admin
      .from('usuarios')
      .select('id, email, nombre_usuario')
      .in('id', idsCuentas)

    if (errorCuentas) {
      console.error(`Pedido ${pedidoId}: no se pudieron leer las cuentas para los mails — ${errorCuentas.message}`)
    }
    const cuentaDe = (id) => (cuentas || []).find((c) => c.id === id) || null
    const dueno = cuentaDe(vendedor.usuario_id)
    const comprador = cuentaDe(pedido.comprador_id)

    // La dirección sólo si el método la usa. La copia guarda el id del barrio;
    // el nombre se busca aparte y, si falla, la dirección va sin barrio.
    let direccion = null
    if (metodoPideDireccion(pedido.metodo_envio) && pedido.direccion_copia) {
      direccion = { ...pedido.direccion_copia, barrio: null }
      if (direccion.barrio_id) {
        const { data: barrio, error: errorBarrio } = await admin
          .from('barrios')
          .select('nombre')
          .eq('id', direccion.barrio_id)
          .maybeSingle()
        if (errorBarrio) console.error(`Pedido ${pedidoId}: no se pudo leer el barrio — ${errorBarrio.message}`)
        direccion.barrio = barrio?.nombre || null
      }
    }

    const datos = {
      pedidoId: pedido.id,
      tienda: vendedor.nombre_negocio,
      metodoEnvio: pedido.metodo_envio,
      nombre: pedido.comprador_nombre,
      apellido: pedido.comprador_apellido,
      telefono: pedido.comprador_telefono,
      apodo: comprador?.nombre_usuario || null,
      items: [...(pedido.items || [])].sort((a, b) => a.id - b.id),
      costoEnvio: pedido.costo_envio,
      total: pedido.total,
      comision: pedido.comision_plataforma,
      direccion,
      turno: pedido.turno_preferido,
    }

    const [resultadoVendedor, resultadoComprador] = await Promise.all([
      enviarUnaVez({
        admin, pedidoId: pedido.id, columna: 'aviso_vendedor_en', destinatario: 'vendedor',
        para: dueno?.email || null, armar: () => armarMailVenta(datos),
      }),
      enviarUnaVez({
        admin, pedidoId: pedido.id, columna: 'aviso_comprador_en', destinatario: 'comprador',
        para: comprador?.email || null, armar: () => armarMailCompra(datos),
      }),
    ])

    return { vendedor: resultadoVendedor, comprador: resultadoComprador }
  } catch (err) {
    console.error(`Pedido ${pedidoId}: error armando los mails del pago`, err)
    return { vendedor: sinDatos, comprador: sinDatos }
  }
}

// Avisa al comprador que su pedido salió. Nunca lanza: el pedido ya quedó
// despachado y no queremos deshacerlo porque falle un mail. Devuelve
// { enviado, motivo } para que quien llama pueda avisar en pantalla.
//
// 'admin' tiene que ser un cliente con service_role: hace falta para leer el
// mail del comprador de auth.users.
export async function avisarDespacho({ admin, pedidoId }) {
  try {
    const { data: pedido, error } = await admin
      .from('pedidos')
      .select(`
        id, total, metodo_envio, costo_envio, subtotal_productos, franja_horaria,
        comprador_id, vendedor_nombre,
        vendedor:vendedores ( nombre_negocio ),
        direccion:direcciones ( calle, numero, piso_depto )
      `)
      .eq('id', pedidoId)
      .maybeSingle()

    if (error || !pedido) {
      console.error('Aviso de despacho: pedido no encontrado', pedidoId, error?.message)
      return { enviado: false, motivo: 'pedido_no_encontrado' }
    }

    const { data: { user }, error: errorUsuario } =
      await admin.auth.admin.getUserById(pedido.comprador_id)

    if (errorUsuario || !user?.email) {
      console.error('Aviso de despacho: sin mail del comprador', pedidoId, errorUsuario?.message)
      return { enviado: false, motivo: 'sin_destinatario' }
    }

    if (!process.env.RESEND_API_KEY) {
      console.error('Aviso de despacho: RESEND_API_KEY no configurada')
      return { enviado: false, motivo: 'sin_configurar' }
    }

    const nombreVendedor =
      pedido.vendedor_nombre || pedido.vendedor?.nombre_negocio || 'el vendedor'

    const direccion = pedido.direccion
      ? `${pedido.direccion.calle} ${pedido.direccion.numero}` +
        `${pedido.direccion.piso_depto ? `, ${pedido.direccion.piso_depto}` : ''}`
      : ''

    const resultado = await enviarPorResend({
      para: user.email,
      mail: armarMailDespacho({ pedido, nombreVendedor, direccion, franja: pedido.franja_horaria }),
    })

    if (!resultado.ok) {
      console.error('Resend rechazó el aviso de despacho', pedidoId, resultado.motivo)
      return { enviado: false, motivo: 'resend_error' }
    }

    return { enviado: true }
  } catch (err) {
    console.error('Error enviando el aviso de despacho', pedidoId, err)
    return { enviado: false, motivo: 'excepcion' }
  }
}
