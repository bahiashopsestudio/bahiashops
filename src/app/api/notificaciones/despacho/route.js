import { NextResponse } from 'next/server';
import { createClient as createAdminClient } from '@supabase/supabase-js';

export async function POST(request) {
  try {
    const { pedidoId } = await request.json();

    if (!pedidoId) {
      return NextResponse.json({ error: 'Falta el ID del pedido' }, { status: 400 });
    }

    const admin = createAdminClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL,
      process.env.SUPABASE_SERVICE_ROLE_KEY
    );

    // Traer el pedido con datos del comprador y vendedor
    const { data: pedido, error: errPedido } = await admin
      .from('pedidos')
      .select(`
        id, total, metodo_envio, costo_envio, subtotal_productos,
        comprador_id,
        vendedor:vendedores ( nombre_negocio ),
        direccion:direcciones ( calle, numero, piso_depto )
      `)
      .eq('id', pedidoId)
      .single();

    if (errPedido || !pedido) {
      console.error('Pedido no encontrado:', errPedido);
      return NextResponse.json({ error: 'Pedido no encontrado' }, { status: 404 });
    }

    // Traer el email del comprador desde auth.users
    const { data: { user }, error: errUser } = await admin.auth.admin.getUserById(pedido.comprador_id);

    if (errUser || !user?.email) {
      console.error('No se pudo obtener el email del comprador:', errUser);
      return NextResponse.json({ error: 'Email del comprador no disponible' }, { status: 404 });
    }

    const nombreVendedor = pedido.vendedor?.nombre_negocio || 'el vendedor';
    const direccion = pedido.direccion
      ? `${pedido.direccion.calle} ${pedido.direccion.numero}${pedido.direccion.piso_depto ? `, ${pedido.direccion.piso_depto}` : ''}`
      : '';

    // Armar el email
    const htmlEmail = `
      <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 500px; margin: 0 auto; padding: 24px;">
        <h2 style="color: #222; margin-bottom: 8px;">¡Tu pedido fue despachado! 🚀</h2>
        <p style="color: #666; font-size: 15px; line-height: 1.6;">
          ${nombreVendedor} acaba de despachar tu pedido <strong>#${pedido.id}</strong>.
        </p>
        ${direccion ? `
          <p style="color: #666; font-size: 15px; line-height: 1.6;">
            Va camino a <strong>${direccion}</strong>.
          </p>
        ` : ''}
        <div style="background: #f7f7f7; border-radius: 12px; padding: 16px; margin: 20px 0;">
          <p style="margin: 0 0 8px; font-size: 14px; color: #888;">Resumen del pedido</p>
          <div style="display: flex; justify-content: space-between; font-size: 14px; padding: 4px 0;">
            <span style="color: #666;">Productos</span>
            <span>$${Number(pedido.subtotal_productos).toLocaleString('es-AR')}</span>
          </div>
          <div style="display: flex; justify-content: space-between; font-size: 14px; padding: 4px 0;">
            <span style="color: #666;">Envío</span>
            <span>${Number(pedido.costo_envio) === 0 ? 'Gratis' : '$' + Number(pedido.costo_envio).toLocaleString('es-AR')}</span>
          </div>
          <div style="display: flex; justify-content: space-between; font-size: 16px; font-weight: 600; padding: 8px 0 0; border-top: 1px solid #e0e0e0; margin-top: 4px;">
            <span>Total</span>
            <span>$${Number(pedido.total).toLocaleString('es-AR')}</span>
          </div>
        </div>
        <a href="https://bahiashops.com.ar/mis-pedidos" style="display: inline-block; background: #222; color: white; padding: 12px 24px; border-radius: 8px; text-decoration: none; font-size: 14px; font-weight: 500;">
          Ver mis compras
        </a>
        <p style="color: #aaa; font-size: 12px; margin-top: 24px;">
          Este email fue enviado desde Bahía Shops. Si tenés alguna consulta, respondé a este email.
        </p>
      </div>
    `;

    // Enviar con Resend
    const resendKey = process.env.RESEND_API_KEY;
    if (!resendKey) {
      console.error('RESEND_API_KEY no configurada');
      return NextResponse.json({ error: 'Servicio de email no configurado' }, { status: 500 });
    }

    const resendRes = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${resendKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: 'Bahía Shops <hola@bahiashops.com.ar>',
        to: user.email,
        subject: `Tu pedido #${pedido.id} fue despachado`,
        html: htmlEmail,
      }),
    });

    if (!resendRes.ok) {
      const resendError = await resendRes.text();
      console.error('Error enviando email:', resendError);
      return NextResponse.json({ error: 'No se pudo enviar el email' }, { status: 500 });
    }

    console.log(`✅ Email de despacho enviado al comprador para pedido #${pedido.id}`);
    return NextResponse.json({ enviado: true });

  } catch (err) {
    console.error('Error en notificación de despacho:', err);
    return NextResponse.json({ error: 'Error interno' }, { status: 500 });
  }
}