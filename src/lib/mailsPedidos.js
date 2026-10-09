// Mails de un pedido: el aviso de venta al vendedor, la confirmación a quien
// compró (los dos cuando MercadoPago confirma el pago) y el aviso de despacho.
//
// El de despacho vivía en /api/notificaciones/despacho, una ruta sin ninguna
// verificación: alcanzaba con acertarle al número de pedido para dispararle a
// un comprador un mail con su dirección de entrega y el total. Esa ruta se
// borró. Ahora el envío se hace desde adentro de la ruta que ya comprobó que
// quien pide el despacho es el vendedor dueño del pedido.
//
// La plantilla y las piezas comunes están en mailBase.js. Este archivo tiene
// tres partes:
//   1. Las piezas propias de los mails de pedido.
//   2. El armado: funciones puras que reciben los datos y devuelven
//      { asunto, html, texto }. No tocan la base ni la red, así que se pueden
//      ver sin mandar nada (scripts/preview-mails.mjs).
//   3. El envío: las lecturas, el reclamo de "una sola vez" y Resend.

import { EMAIL_NOTIFICACIONES, REMITENTE_NO_REPLY } from '@/lib/contacto'
import { SITIO_URL } from '@/lib/sitio'
import {
  FUENTE_TITULO, FUENTE_TEXTO, FUENTE_UI, TEXTO, ACENTO, GRIS, BORDE, TABLA,
  escapar, pesos, negrita, plantilla, lineaAzul, tituloImagen, tituloTexto, parrafo,
  tarjeta, boton, filaMonto, enviarPorResend,
} from '@/lib/mailBase'
import { normalizarTelefonoAR, formatearTelefonoAR, linkWhatsApp } from '@/lib/telefono'
import { inicialDeApodo, colorDeApodo } from '@/lib/apodos'
import { metodoPideDireccion, grupoEntrega, tipoEntregaDe, zonaDe, textoCostoEnvio, seguimientoDe } from '@/lib/metodosEntrega'
import { calleNumeroDepto, ciudadProvinciaCodigo } from '@/lib/direcciones'
import { pedidoTuvoPago } from '@/lib/pedidos'

// ── 1. Piezas propias de los mails de pedido ──────────────────────────────────

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

// Cómo le llega el pedido a quien compra: 'retiro', 'envio' o 'coordinar'.
// Es grupoEntrega(), de metodosEntrega.js: la misma regla que usa el panel
// del vendedor para elegir el texto del WhatsApp.
const tipoEntrega = grupoEntrega

// "Envío de tu tienda · Zona 2 ($ 2.500)" para el mail de venta.
function textoEntregaVenta({ metodoEnvio, zonaEnvio, costoEnvio, direccionVisible }) {
  const tipo = tipoEntregaDe(metodoEnvio)
  const zona = zonaEnvio ? zonaDe(metodoEnvio, zonaEnvio) : null
  const precio = textoCostoEnvio(metodoEnvio, costoEnvio)
  if (tipo === 'retiro') {
    return direccionVisible === false ? 'Retira: coordinan dónde y cuándo' : 'Retira en tu local'
  }
  if (tipo === 'domicilio') return `Envío de tu tienda${zona ? ` · Zona ${zona.zona}` : ''} (${precio})`
  if (tipo === 'correo') return `Correo${zona ? ` · ${zona.nombre}` : ''} (${precio})`
  return 'A coordinar con vos'
}

// "+54 9 291 512-3456". Si el teléfono guardado no se puede normalizar, se
// muestra tal como está.
function telefonoALaVista(telefono) {
  const diez = normalizarTelefonoAR(telefono)
  if (diez) return formatearTelefonoAR(diez)
  return String(telefono ?? '').trim()
}

// "Alsina 235, 2B, Punta Alta, Buenos Aires (B8109)": la dirección entera,
// para quien despacha y para quien recibe.
function direccionCompleta(direccion) {
  return [calleNumeroDepto(direccion), ciudadProvinciaCodigo(direccion)].filter(Boolean).join(', ')
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
//   pedidoId, tienda, metodoEnvio (el literal de la base), zonaEnvio,
//   direccionVisible (de la tienda: si no, el retiro se coordina),
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
  const direccion = tipo === 'envio' || tipo === 'correo'
    ? [calleNumeroDepto(datos.direccion), String(datos.direccion?.barrio ?? '').trim(), ciudadProvinciaCodigo(datos.direccion)]
      .filter(Boolean).join(' · ')
    : ''
  const turno = textoTurno(datos.turno)
  const linkPanel = `${SITIO_URL}/vendedor/pedidos?pedido=${encodeURIComponent(pedidoId)}`

  const asunto = `Nueva venta en ${tienda} · Pedido #${pedidoId}`
  const compra = { etiqueta: 'LO QUE COMPRÓ', etiquetaTotal: 'Total cobrado', items, costoEnvio, total, comision }

  const datosEntrega = [
    ['Entrega', textoEntregaVenta(datos)],
    ['Nombre', nombreCompleto],
    ['Teléfono', telefono],
    ['Dirección', direccion],
    ['Prefiere', turno],
  ].filter(([, valor]) => valor)

  const cierre = {
    retiro: `Cuando esté listo para retirar, avisale desde el panel: así ${quien} ve en qué anda su compra.`,
    envio: `Cuando lo empieces a preparar, marcalo en el panel: así ${quien} ve en qué anda su compra.`,
    correo: `Cuando lo despaches, marcalo en el panel con el número de seguimiento: así ${quien} lo puede seguir.`,
    coordinar: 'Escribile para acordar cuándo y dónde, y después seguí los pasos en el panel.',
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
  const destino = tipo === 'envio' ? calleNumeroDepto(datos.direccion)
    : tipo === 'correo' ? direccionCompleta(datos.direccion)
    : ''
  const linkPedidos = `${SITIO_URL}/mis-pedidos`

  const asunto = `Tu compra en ${tienda} está confirmada`
  const compra = { etiqueta: 'LO QUE COMPRASTE', etiquetaTotal: 'Total', items, costoEnvio, total }

  // "Qué pasa ahora" se arma una vez en partes, [texto, enNegrita], y de ahí
  // salen la versión HTML (escapada) y la de texto.
  const finales = {
    retiro: datos.direccionVisible === false
      ? [[' para coordinar dónde y cuándo lo retirás.']]
      : [[' cuando esté listo para que lo pases a buscar.']],
    envio: destino
      ? [[' para avisarte en qué franja horaria llega a '], [destino, true], ['.']]
      : [[' para avisarte en qué franja horaria llega.']],
    // El número de seguimiento llega con el mail de despacho.
    correo: destino
      ? [[' cuando lo despache por correo a '], [destino, true], ['. Ahí te mandamos el número de seguimiento.']]
      : [[' cuando lo despache por correo. Ahí te mandamos el número de seguimiento.']],
    coordinar: [[' para acordar la entrega.']],
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

// Recibe { pedido: { id, metodo_envio, subtotal_productos, costo_envio, total,
// envio_empresa, envio_empresa_otra, envio_seguimiento }, nombreVendedor,
// direccion, franja }.
//
// Con el correo no hay franja de entrega (la franja es cuándo lo llevó al
// correo): esa línea no va, y en su lugar va el seguimiento.
export function armarMailDespacho({ pedido, nombreVendedor, direccion, franja }) {
  const asunto = `Tu pedido #${pedido.id} fue despachado`
  const titulo = '¡Tu pedido fue despachado! 🚀'
  const porCorreo = tipoEntregaDe(pedido.metodo_envio) === 'correo'
  const seguimiento = porCorreo ? seguimientoDe(pedido) : null
  const franjaVisible = porCorreo ? null : franja
  const envio = tipoEntregaDe(pedido.metodo_envio) === 'coordinar'
    ? 'A coordinar'
    : Number(pedido.costo_envio) === 0 ? 'Gratis' : pesos(pedido.costo_envio)
  const linkPedidos = `${SITIO_URL}/mis-pedidos`
  const pie = 'Este email fue enviado desde Bahía Shops. Si tenés alguna consulta, respondé a este email.'

  const cuerpo = [
    tituloTexto(titulo),
    parrafo(`${escapar(nombreVendedor)} acaba de despachar tu pedido ${negrita(`#${pedido.id}`)}.`),
    direccion ? parrafo(`Va camino a ${negrita(escapar(direccion))}.`) : '',
    franjaVisible ? parrafo(`Franja de entrega: ${negrita(escapar(franjaVisible))}.`) : '',
    seguimiento ? tarjeta('SEGUIMIENTO',
      `<table ${TABLA} width="100%">${[
        filaMonto('Empresa', escapar(seguimiento.empresa)),
        filaMonto('Número', `<span style="white-space:nowrap;">${negrita(escapar(seguimiento.numero))}</span>`),
      ].join('\n')}</table>` +
      (seguimiento.url
        ? `<div style="height:16px;line-height:16px;font-size:16px;">&nbsp;</div>${boton('Seguir mi envío', seguimiento.url, { blanco: true })}` +
          `<p style="margin:12px 0 0;font-family:${FUENTE_TEXTO};font-size:13px;font-weight:300;line-height:1.6;color:${GRIS};">Copiá el número y pegalo en la página de ${escapar(seguimiento.empresa)}.</p>`
        : '')
    ) : '',
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
    franjaVisible ? `Franja de entrega: ${franjaVisible}.` : null,
    seguimiento
      ? ['SEGUIMIENTO', `Empresa: ${seguimiento.empresa}`, `Número: ${seguimiento.numero}`,
          seguimiento.url ? `Seguí tu envío en ${seguimiento.url} (copiá el número y pegalo ahí).` : null]
          .filter(Boolean).join('\n')
      : null,
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

// Manda uno de los mails del pago, una sola vez por pedido. Antes de mandar
// reclama el envío marcando la columna (aviso_vendedor_en / aviso_comprador_en)
// sólo si estaba en null: si dos avisos de MercadoPago llegan a la vez, uno
// solo se lleva la fila. Si Resend falla, la columna vuelve a null.
// Nunca lanza.
async function enviarUnaVez({ admin, pedidoId, columna, destinatario, para, armar, desde, responderA }) {
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
      const resultado = await enviarPorResend({ para, mail, ...(desde ? { desde } : {}), ...(responderA ? { responderA } : {}) })
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
        id, estado, vendedor_id, comprador_id, metodo_envio, zona_envio, turno_preferido,
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

    // El aviso de venta lleva nombre, teléfono, dirección y el botón de WhatsApp de
    // quien compró: solo sale si el pedido se pagó. Quien llama (el webhook) ya lo
    // comprueba; esta es la segunda barrera, para que un cambio futuro no mande
    // los datos de un pedido sin pagar.
    if (!pedidoTuvoPago(pedido)) {
      console.error(`Pedido ${pedidoId}: mails del pago no enviados — el pedido está en "${pedido.estado}", no se pagó.`)
      return { vendedor: { enviado: false, motivo: 'sin_pago' }, comprador: { enviado: false, motivo: 'sin_pago' } }
    }

    const { data: vendedor, error: errorVendedor } = await admin
      .from('vendedores')
      .select('nombre_negocio, usuario_id, direccion_visible')
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
      .select('id, email, nombre_usuario, cerrada_en')
      .in('id', idsCuentas)

    if (errorCuentas) {
      console.error(`Pedido ${pedidoId}: no se pudieron leer las cuentas para los mails — ${errorCuentas.message}`)
    }
    const cuentaDe = (id) => (cuentas || []).find((c) => c.id === id) || null
    // Una cuenta eliminada no recibe mails (no debería pasar: no se puede
    // eliminar con un pedido en curso). El mail que le queda es de mentira.
    const mailDe = (cuenta) => (cuenta && !cuenta.cerrada_en && !/.invalid$/i.test(cuenta.email || '') ? cuenta.email : null)
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
      zonaEnvio: pedido.zona_envio,
      direccionVisible: vendedor.direccion_visible,
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
        para: mailDe(dueno), armar: () => armarMailVenta(datos),
      }),
      enviarUnaVez({
        admin, pedidoId: pedido.id, columna: 'aviso_comprador_en', destinatario: 'comprador',
        para: mailDe(comprador), armar: () => armarMailCompra(datos),
      }),
    ])

    return { vendedor: resultadoVendedor, comprador: resultadoComprador }
  } catch (err) {
    console.error(`Pedido ${pedidoId}: error armando los mails del pago`, err)
    return { vendedor: sinDatos, comprador: sinDatos }
  }
}

// ── Pago sobre un pedido cancelado ───────────────────────────────────────────
//
// Pasa cuando alguien elimina su cuenta con un pedido todavía sin pagar (se
// cancela) y después se acredita un pago sobre ese pedido. La plata ya le llegó
// al vendedor, así que alguien tiene que coordinar el reembolso: el pedido NO
// se toca, y este mail interno es el aviso. No lleva ningún dato de la persona.

// `motivo` es pedidos.cancelado_motivo: con 'pago_vencido' el pedido no se
// canceló porque la persona eliminó su cuenta, sino porque el link de pago
// venció, y el texto lo dice. Sin motivo (o con cualquier otro) queda el texto
// de siempre.
export function armarMailPagoTardio({ pedidoId, tienda, monto, pagoId, estado, motivo }) {
  const asunto = `Pago sobre un pedido cancelado · Pedido #${pedidoId}`
  const titulo = 'Llegó un pago sobre un pedido cancelado'
  const explicacion = motivo === 'pago_vencido'
    ? 'El link de pago de este pedido venció sin que se pagara, y el pedido quedó cancelado. ' +
      'Llegó un pago igual (seguramente hecho justo antes del vencimiento) y se aprobó: la plata ya está en la cuenta de MercadoPago de la tienda. El pedido no se modificó. ' +
      'Hay que coordinar el reembolso con la tienda.'
    : 'La persona que hizo este pedido eliminó su cuenta antes de que el pago se acreditara, y el pedido quedó cancelado. ' +
      'El pago se aprobó igual y la plata ya está en la cuenta de MercadoPago de la tienda. El pedido no se modificó. ' +
      'Hay que coordinar el reembolso con la tienda.'
  const datos = [
    ['Pedido', `#${pedidoId}`],
    ['Tienda', tienda || 'Sin nombre'],
    ['Monto', pesos(monto)],
    ['Pago de MercadoPago', String(pagoId)],
    ['Estado del pago', String(estado)],
  ]

  const cuerpo = [
    tituloTexto(titulo),
    parrafo(escapar(explicacion)),
    tarjeta('Datos del pago', `<table ${TABLA} width="100%">${datos.map(([etiqueta, valor]) => filaMonto(escapar(etiqueta), escapar(valor))).join('\n')}</table>`),
  ].join('\n')

  const texto = [titulo, explicacion, ['Datos del pago', ...datos.map(([e, v]) => `${e}: ${v}`)].join('\n')].join('\n\n')

  return { asunto, html: plantilla({ asunto, cuerpo }), texto }
}

// Manda el aviso interno, una sola vez por pedido (el mismo reclamo atómico de
// los otros mails, con pedidos.aviso_pago_tardio_en). Si falla, suelta el
// reclamo: el próximo aviso de MercadoPago lo reintenta. Nunca lanza.
export async function avisarPagoTardio({ admin, pedidoId, pago }) {
  try {
    const { data: pedido, error } = await admin
      .from('pedidos')
      .select('id, vendedor_nombre, cancelado_motivo, vendedor:vendedores ( nombre_negocio )')
      .eq('id', pedidoId)
      .maybeSingle()

    if (error || !pedido) {
      console.error(`Pedido ${pedidoId}: aviso de pago tardío no enviado — no se pudo leer el pedido.`, error?.message)
      return { enviado: false, motivo: 'pedido_no_encontrado' }
    }

    return await enviarUnaVez({
      admin,
      pedidoId: pedido.id,
      columna: 'aviso_pago_tardio_en',
      destinatario: 'equipo (pago sobre pedido cancelado)',
      para: EMAIL_NOTIFICACIONES,
      desde: REMITENTE_NO_REPLY,
      responderA: EMAIL_NOTIFICACIONES,
      armar: () => armarMailPagoTardio({
        pedidoId: pedido.id,
        tienda: pedido.vendedor_nombre || pedido.vendedor?.nombre_negocio,
        monto: pago.transaction_amount,
        pagoId: pago.id,
        estado: pago.status,
        motivo: pedido.cancelado_motivo,
      }),
    })
  } catch (err) {
    console.error(`Pedido ${pedidoId}: error en el aviso de pago tardío`, err)
    return { enviado: false, motivo: 'excepcion' }
  }
}

// ── Aviso de MercadoPago que ninguna cuenta puede verificar ───────────────────
//
// MercadoPago avisó de un pago, pero con el token de ninguna tienda conectada
// se pudo consultar. Pasa, por ejemplo, con un pago hecho en un link que cobraba
// para una cuenta que la tienda ya cambió o desconectó: el pago existe, el
// dinero llegó a otra cuenta y el pedido no se puede actualizar. Hasta ahora
// solo quedaba una línea en el log. Este mail interno es para enterarse. Puede
// llegar más de una vez por el mismo pago (una por cada aviso). No lleva ningún
// dato de ninguna persona.

export function armarMailPagoSinResolver({ pagoId, accion, cobrador, enVivo }) {
  const asunto = `Aviso de pago que no se pudo verificar · Pago ${pagoId}`
  const titulo = 'Llegó un aviso de pago que no se pudo verificar'
  const explicacion =
    'MercadoPago avisó de un pago, pero ninguna de las cuentas conectadas pudo consultarlo. Puede ser un pago hecho en un link que cobraba ' +
    'para una cuenta que una tienda ya cambió o desconectó (o un aviso de prueba). No se modificó ningún pedido. ' +
    'Si el pago es real, hay que buscarlo en la cuenta de MercadoPago que cobró y coordinar con la tienda.'
  const datos = [
    ['Pago de MercadoPago', String(pagoId)],
    ['Tipo de aviso', accion ? String(accion) : 'sin dato'],
    ['Cuenta que cobró', cobrador !== undefined && cobrador !== null && cobrador !== '' ? String(cobrador) : 'sin dato'],
    ['En vivo', enVivo === true ? 'sí' : enVivo === false ? 'no (prueba)' : 'sin dato'],
  ]

  const cuerpo = [
    tituloTexto(titulo),
    parrafo(escapar(explicacion)),
    tarjeta('Datos del aviso', `<table ${TABLA} width="100%">${datos.map(([etiqueta, valor]) => filaMonto(escapar(etiqueta), escapar(valor))).join('\n')}</table>`),
  ].join('\n')

  const texto = [titulo, explicacion, ['Datos del aviso', ...datos.map(([e, v]) => `${e}: ${v}`)].join('\n')].join('\n')
  return { asunto, html: plantilla({ asunto, cuerpo }), texto }
}

// Manda el aviso interno. Nunca lanza: el webhook responde 200 igual.
export async function avisarPagoSinResolver({ pagoId, accion, cobrador, enVivo }) {
  const etiqueta = `Aviso interno de pago sin verificar (pago ${pagoId})`
  try {
    if (!process.env.RESEND_API_KEY) {
      console.error(`${etiqueta} no enviado — RESEND_API_KEY no configurada.`)
      return { enviado: false, motivo: 'sin_configurar' }
    }
    const resultado = await enviarPorResend({
      para: EMAIL_NOTIFICACIONES,
      mail: armarMailPagoSinResolver({ pagoId, accion, cobrador, enVivo }),
      desde: REMITENTE_NO_REPLY,
      responderA: EMAIL_NOTIFICACIONES,
    })
    if (!resultado.ok) {
      console.error(`${etiqueta} falló — ${resultado.motivo}`)
      return { enviado: false, motivo: 'resend_error' }
    }
    return { enviado: true }
  } catch (err) {
    console.error(`${etiqueta} falló —`, err)
    return { enviado: false, motivo: 'excepcion' }
  }
}

// ── Pago doble ───────────────────────────────────────────────────────────────
//
// Un pedido que ya tiene un pago aprobado recibió OTRO pago aprobado (por
// ejemplo, un cupón en efectivo que se pagó después de pagar con tarjeta). El
// pedido NO se modifica: alguien tiene que devolver el segundo pago a mano desde
// MercadoPago. Este mail interno lleva el pedido y los dos ids de pago, y nada de
// ninguna persona.

export function armarMailPagoDoble({ pedidoId, tienda, monto, pagoGuardado, pagoNuevo }) {
  const asunto = `Pago doble · Pedido #${pedidoId}`
  const titulo = 'Un pedido recibió dos pagos'
  const explicacion =
    'Este pedido ya estaba pagado y llegó otro pago aprobado por el mismo pedido. El pedido no se modificó y el segundo pago quedó en la cuenta de ' +
    'MercadoPago de la tienda. Hay que devolver el segundo pago a mano desde MercadoPago (el que figura como "Pago nuevo").'
  const datos = [
    ['Pedido', `#${pedidoId}`],
    ['Tienda', tienda || 'Sin nombre'],
    ['Monto', pesos(monto)],
    ['Pago registrado en el pedido', String(pagoGuardado || 'sin dato')],
    ['Pago nuevo (a devolver)', String(pagoNuevo)],
  ]

  const cuerpo = [
    tituloTexto(titulo),
    parrafo(escapar(explicacion)),
    tarjeta('Datos de los pagos', `<table ${TABLA} width="100%">${datos.map(([etiqueta, valor]) => filaMonto(escapar(etiqueta), escapar(valor))).join('\n')}</table>`),
  ].join('\n')

  const texto = [titulo, explicacion, ['Datos de los pagos', ...datos.map(([e, v]) => `${e}: ${v}`)].join('\n')].join('\n\n')
  return { asunto, html: plantilla({ asunto, cuerpo }), texto }
}

// Manda el aviso interno. Nunca lanza. Devuelve { enviado, motivo? }: quien lo
// llama (el webhook) lo usa para soltar el registro del pago doble si el mail no
// salió, así el próximo aviso de MercadoPago lo reintenta.
export async function avisarPagoDoble({ admin, pedidoId, pagoNuevo }) {
  const etiqueta = `Aviso interno de pago doble (pedido ${pedidoId}, pago ${pagoNuevo?.id})`
  try {
    if (!process.env.RESEND_API_KEY) {
      console.error(`${etiqueta} no enviado — RESEND_API_KEY no configurada.`)
      return { enviado: false, motivo: 'sin_configurar' }
    }
    const { data: pedido, error } = await admin
      .from('pedidos')
      .select('id, mp_payment_id, vendedor_nombre, vendedor:vendedores ( nombre_negocio )')
      .eq('id', pedidoId)
      .maybeSingle()
    if (error || !pedido) {
      console.error(`${etiqueta}: no se pudo leer el pedido —`, error?.message)
      return { enviado: false, motivo: 'pedido_no_encontrado' }
    }
    const resultado = await enviarPorResend({
      para: EMAIL_NOTIFICACIONES,
      mail: armarMailPagoDoble({
        pedidoId: pedido.id,
        tienda: pedido.vendedor_nombre || pedido.vendedor?.nombre_negocio,
        monto: pagoNuevo.transaction_amount,
        pagoGuardado: pedido.mp_payment_id,
        pagoNuevo: pagoNuevo.id,
      }),
      desde: REMITENTE_NO_REPLY,
      responderA: EMAIL_NOTIFICACIONES,
    })
    if (!resultado.ok) {
      console.error(`${etiqueta} falló — ${resultado.motivo}`)
      return { enviado: false, motivo: 'resend_error' }
    }
    return { enviado: true }
  } catch (err) {
    console.error(`${etiqueta} falló —`, err)
    return { enviado: false, motivo: 'excepcion' }
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
        envio_empresa, envio_empresa_otra, envio_seguimiento,
        comprador_id, vendedor_nombre, direccion_copia,
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

    // Una cuenta eliminada queda con un mail .invalid: no se le manda nada.
    if (/.invalid$/i.test(user.email)) {
      console.error('Aviso de despacho: la cuenta del comprador fue eliminada', pedidoId)
      return { enviado: false, motivo: 'cuenta_eliminada' }
    }

    if (!process.env.RESEND_API_KEY) {
      console.error('Aviso de despacho: RESEND_API_KEY no configurada')
      return { enviado: false, motivo: 'sin_configurar' }
    }

    const nombreVendedor =
      pedido.vendedor_nombre || pedido.vendedor?.nombre_negocio || 'el vendedor'

    // La copia congelada en el pedido; la embebida sólo para los pedidos
    // anteriores a la copia. Sin dirección (retiro, coordinar), nada.
    const direccion = metodoPideDireccion(pedido.metodo_envio)
      ? direccionCompleta(pedido.direccion_copia || pedido.direccion)
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
