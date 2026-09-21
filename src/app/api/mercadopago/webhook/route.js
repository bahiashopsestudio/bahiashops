import { NextResponse } from 'next/server';
import { createClient as createAdminClient } from '@supabase/supabase-js';
import crypto from 'crypto';
import { ESTADOS_DE_PAGO } from '@/lib/pedidos';
 
// ── Verificar que el webhook realmente viene de MercadoPago ──
// MercadoPago firma cada notificación con HMAC-SHA256.
// Si la firma no coincide, alguien está mandando webhooks falsos.
 
function verificarFirma(request, body) {
  const secret = process.env.MP_WEBHOOK_SECRET;
 
  // Si no tenemos la clave configurada, dejamos pasar (para no romper en dev)
  // pero logueamos un aviso
  if (!secret) {
    console.warn('⚠️ MP_WEBHOOK_SECRET no configurada — webhook no verificado');
    return true;
  }
 
  const xSignature = request.headers.get('x-signature');
  const xRequestId = request.headers.get('x-request-id');
 
  if (!xSignature || !xRequestId) {
    console.warn('Webhook sin headers de firma');
    return false;
  }
 
  // Parsear el header x-signature: "ts=123456,v1=abcdef..."
  const parts = {};
  xSignature.split(',').forEach(part => {
    const [key, ...rest] = part.split('=');
    parts[key.trim()] = rest.join('=').trim();
  });
 
  const ts = parts.ts;
  const v1 = parts.v1;
 
  if (!ts || !v1) {
    console.warn('Header x-signature incompleto');
    return false;
  }
 
  // Armar el string que MercadoPago firmó
  const dataId = body.data?.id;
  const manifest = `id:${dataId};request-id:${xRequestId};ts:${ts};`;
 
  // Calcular el HMAC-SHA256 con nuestra clave secreta
  const hmac = crypto.createHmac('sha256', secret).update(manifest).digest('hex');
 
  return hmac === v1;
}
 
export async function POST(request) {
  try {
    const body = await request.json();
    console.log('Webhook recibido:', JSON.stringify(body));
 
    // ── Verificar firma ──
    if (!verificarFirma(request, body)) {
      console.warn('❌ Webhook con firma inválida — rechazado');
      return NextResponse.json({ recibido: true });
    }
 
    // Solo nos importan los avisos de tipo "payment"
    if (body.type !== 'payment' || !body.data?.id) {
      return NextResponse.json({ recibido: true });
    }
 
    const paymentId = body.data.id;
 
    const admin = createAdminClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL,
      process.env.SUPABASE_SERVICE_ROLE_KEY
    );
 
    // Probar con todos los tokens de vendedores para consultar el pago
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
 
    const pedidoId = Number(pagoData.external_reference);
    const estadoMp = pagoData.status;
 
    if (!pedidoId) {
      console.log('El pago no tiene external_reference.');
      return NextResponse.json({ recibido: true });
    }
 
    // Traducir estados de MercadoPago a los nuestros
    let nuestroEstado;
    if (estadoMp === 'approved') nuestroEstado = 'pagado';
    else if (estadoMp === 'rejected' || estadoMp === 'cancelled') nuestroEstado = 'rechazado';
    else nuestroEstado = 'pendiente';
 
    // Van dos escrituras separadas a propósito.
    //
    // El id del pago es un dato del cobro y se guarda siempre: vale igual esté
    // el pedido donde esté en la preparación.
    const { data: pedidoActual, error: errorPago } = await admin
      .from('pedidos')
      .update({
        mp_payment_id: String(paymentId),
        actualizado_en: new Date().toISOString(),
      })
      .eq('id', pedidoId)
      .select('id, estado')
      .maybeSingle();

    if (errorPago) {
      console.error(`Pedido ${pedidoId}: no se pudo guardar mp_payment_id — ${errorPago.message}`);
    }

    if (!pedidoActual && !errorPago) {
      console.warn(`Pedido ${pedidoId}: no existe, no se escribió nada.`);
      return NextResponse.json({ recibido: true });
    }

    // El estado, en cambio, sólo se pisa si el pedido sigue en un estado de
    // cobro. Sin esta guarda, un aviso repetido de MercadoPago sobre un pedido
    // que el vendedor ya movió a 'preparando', 'franja', 'por_salir' o
    // 'despachado' lo devolvía a 'pagado' y reaparecía como pendiente de
    // preparar.
    const { data: pedidoNuevo, error: errorEstado } = await admin
      .from('pedidos')
      .update({ estado: nuestroEstado })
      .eq('id', pedidoId)
      .in('estado', ESTADOS_DE_PAGO)
      .select('id, estado')
      .maybeSingle();

    if (errorEstado) {
      console.error(`Pedido ${pedidoId}: no se pudo escribir el estado "${nuestroEstado}" — ${errorEstado.message}`);
    } else if (pedidoNuevo) {
      console.log(`Pedido ${pedidoId}: estado escrito -> ${pedidoNuevo.estado}`);
    } else {
      // Que la guarda frene la escritura NO es un error: es el caso normal de
      // un reintento de MercadoPago sobre un pedido que ya avanzó.
      console.log(
        `Pedido ${pedidoId}: la guarda bloqueó "${nuestroEstado}" — el pedido está en "${pedidoActual?.estado}", fuera de los estados de cobro.`
      );
    }
 
    return NextResponse.json({ recibido: true });
  } catch (err) {
    console.error('Error en webhook:', err);
    // Devolvemos 200 para que MercadoPago no reintente por un error nuestro
    return NextResponse.json({ recibido: true });
  }
}