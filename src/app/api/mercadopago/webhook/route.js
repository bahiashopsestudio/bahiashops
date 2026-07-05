import { NextResponse } from 'next/server';
import { createClient as createAdminClient } from '@supabase/supabase-js';

export async function POST(request) {
  try {
    // 1. MercadoPago nos toca el timbre. El aviso viene pelado, con el id de un pago.
    const body = await request.json();
    console.log('Webhook recibido:', JSON.stringify(body));

    // Solo nos importan los avisos de tipo "payment" (hay otros tipos que MP manda).
    if (body.type !== 'payment' || !body.data?.id) {
      return NextResponse.json({ recibido: true });
    }

    const paymentId = body.data.id;

    // 2. Necesitamos preguntarle a MercadoPago qué pasó con ese pago.
    //    Para eso usamos las llaves del vendedor. Pero acá viene el detalle:
    //    todavía no sabemos de qué vendedor es este pago. Lo averiguamos.
    const admin = createAdminClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL,
      process.env.SUPABASE_SERVICE_ROLE_KEY
    );

    // Primero probamos con TODOS los tokens de vendedores que tengamos.
    // (En una versión más pulida, guardaríamos qué vendedor está esperando qué pago.
    //  Por ahora, con probar de a uno alcanza — son pocos vendedores.)
    const { data: cuentas } = await admin
      .from('mercadopago_cuentas')
      .select('vendedor_id, access_token');

    if (!cuentas || cuentas.length === 0) {
      console.log('No hay vendedores conectados con MercadoPago.');
      return NextResponse.json({ recibido: true });
    }

    let pagoData = null;

    for (const cuenta of cuentas) {
      const res = await fetch(`https://api.mercadopago.com/v1/payments/${paymentId}`, {
        headers: { 'Authorization': `Bearer ${cuenta.access_token}` },
      });
      if (res.ok) {
        pagoData = await res.json();
        break;
      }
    }

    if (!pagoData) {
      console.log('No pudimos consultar el pago con ningún vendedor.');
      return NextResponse.json({ recibido: true });
    }

    // 3. Ya sabemos qué pasó. Vemos si el pago está aprobado y actualizamos el pedido.
    //    El pedido lo encontramos con external_reference, que le pasamos al crearlo.
    const pedidoId = Number(pagoData.external_reference);
    const estadoMp = pagoData.status; // "approved", "rejected", "pending", etc.

    if (!pedidoId) {
      console.log('El pago no tiene external_reference.');
      return NextResponse.json({ recibido: true });
    }

    // Traducir los estados de MercadoPago a los nuestros.
    let nuestroEstado;
    if (estadoMp === 'approved') nuestroEstado = 'pagado';
    else if (estadoMp === 'rejected' || estadoMp === 'cancelled') nuestroEstado = 'rechazado';
    else nuestroEstado = 'pendiente';

    // 4. Actualizar el pedido en la base.
    await admin
      .from('pedidos')
      .update({
        estado: nuestroEstado,
        mp_payment_id: String(paymentId),
        actualizado_en: new Date().toISOString(),
      })
      .eq('id', pedidoId);

    console.log(`Pedido ${pedidoId} actualizado a: ${nuestroEstado}`);

    return NextResponse.json({ recibido: true });
  } catch (err) {
    console.error('Error en webhook:', err);
    // Le devolvemos 200 igual, para que MercadoPago no siga reintentando por un error nuestro.
    return NextResponse.json({ recibido: true });
  }
}