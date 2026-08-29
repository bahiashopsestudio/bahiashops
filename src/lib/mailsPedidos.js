// Mails que le llegan al comprador por su pedido.
//
// Esto vivía en /api/notificaciones/despacho, una ruta sin ninguna
// verificación: alcanzaba con acertarle al número de pedido para dispararle a
// un comprador un mail con su dirección de entrega y el total. Esa ruta se
// borró. Ahora el envío se hace desde adentro de la ruta que ya comprobó que
// quien pide el despacho es el vendedor dueño del pedido.

import { EMAIL_CONTACTO, REMITENTE_CONTACTO } from '@/lib/contacto'

const SITIO = 'https://bahiashops.com.ar'

function pesos(n) {
  return `$${Number(n || 0).toLocaleString('es-AR')}`
}

function escapar(texto) {
  return String(texto ?? '')
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

function html({ pedido, nombreVendedor, direccion, franja }) {
  return `
    <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 500px; margin: 0 auto; padding: 24px;">
      <h2 style="color: #222; margin-bottom: 8px;">¡Tu pedido fue despachado! 🚀</h2>
      <p style="color: #666; font-size: 15px; line-height: 1.6;">
        ${escapar(nombreVendedor)} acaba de despachar tu pedido <strong>#${pedido.id}</strong>.
      </p>
      ${direccion ? `
        <p style="color: #666; font-size: 15px; line-height: 1.6;">
          Va camino a <strong>${escapar(direccion)}</strong>.
        </p>
      ` : ''}
      ${franja ? `
        <p style="color: #666; font-size: 15px; line-height: 1.6;">
          Franja de entrega: <strong>${escapar(franja)}</strong>.
        </p>
      ` : ''}
      <div style="background: #f7f7f7; border-radius: 12px; padding: 16px; margin: 20px 0;">
        <p style="margin: 0 0 8px; font-size: 14px; color: #888;">Resumen del pedido</p>
        <div style="display: flex; justify-content: space-between; font-size: 14px; padding: 4px 0;">
          <span style="color: #666;">Productos</span>
          <span>${pesos(pedido.subtotal_productos)}</span>
        </div>
        <div style="display: flex; justify-content: space-between; font-size: 14px; padding: 4px 0;">
          <span style="color: #666;">Envío</span>
          <span>${Number(pedido.costo_envio) === 0 ? 'Gratis' : pesos(pedido.costo_envio)}</span>
        </div>
        <div style="display: flex; justify-content: space-between; font-size: 16px; font-weight: 600; padding: 8px 0 0; border-top: 1px solid #e0e0e0; margin-top: 4px;">
          <span>Total</span>
          <span>${pesos(pedido.total)}</span>
        </div>
      </div>
      <a href="${SITIO}/mis-pedidos" style="display: inline-block; background: #222; color: white; padding: 12px 24px; border-radius: 8px; text-decoration: none; font-size: 14px; font-weight: 500;">
        Ver mis compras
      </a>
      <p style="color: #aaa; font-size: 12px; margin-top: 24px;">
        Este email fue enviado desde Bahía Shops. Si tenés alguna consulta, respondé a este email.
      </p>
    </div>
  `
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

    const respuesta = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${process.env.RESEND_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: REMITENTE_CONTACTO,
        to: user.email,
        reply_to: EMAIL_CONTACTO,
        subject: `Tu pedido #${pedido.id} fue despachado`,
        html: html({ pedido, nombreVendedor, direccion, franja: pedido.franja_horaria }),
      }),
    })

    if (!respuesta.ok) {
      const detalle = await respuesta.text()
      console.error('Resend rechazó el aviso de despacho', pedidoId, respuesta.status, detalle.slice(0, 300))
      return { enviado: false, motivo: 'resend_error' }
    }

    return { enviado: true }
  } catch (err) {
    console.error('Error enviando el aviso de despacho', pedidoId, err)
    return { enviado: false, motivo: 'excepcion' }
  }
}
