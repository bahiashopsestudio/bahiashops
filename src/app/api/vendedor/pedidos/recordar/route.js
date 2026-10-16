// "Recordarle": la tienda le manda a quien dejó un carrito abandonado un mail
// invitándolo a volver. Una sola vez por pedido.
//
// El vendedor sale de la sesión, nunca del body: el pedido se busca filtrando
// por su vendedor_id, así que no hay forma de recordarle a alguien un carrito de
// otra tienda. La tienda nunca ve el mail de quien compró: lo lee esta ruta.
//
// El "una sola vez" es el mismo reclamo que enviarUnaVez en mailsPedidos.js:
// SET recordatorio_enviado_en = now() WHERE recordatorio_enviado_en IS NULL. Si
// dos clics llegan a la vez, uno solo se lleva la fila. Si Resend falla, la
// columna vuelve a null y se puede reintentar.

import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { getServiceRoleClient } from '@/lib/supabase/admin';
import { esCarritoAbandonado } from '@/lib/pedidos';
import { armarMailRecordatorio } from '@/lib/mailsCarritos';
import { enviarPorResend } from '@/lib/mailBase';
import { REMITENTE_NO_REPLY, EMAIL_CONTACTO } from '@/lib/contacto';

const NO_SE_PUDO = 'No se pudo enviar el recordatorio.';

export async function POST(request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Iniciá sesión.' }, { status: 401 });

  const admin = getServiceRoleClient();

  const { data: vendedor, error: errorVendedor } = await admin
    .from('vendedores')
    .select('id, nombre_negocio, slug')
    .eq('usuario_id', user.id)
    .maybeSingle();

  if (errorVendedor) {
    console.error('Recordatorio: no se pudo leer el vendedor', user.id, errorVendedor.message);
    return NextResponse.json({ error: NO_SE_PUDO }, { status: 500 });
  }
  if (!vendedor) return NextResponse.json({ error: 'No encontramos tu cuenta de vendedor.' }, { status: 403 });

  let body;
  try { body = await request.json(); } catch {
    return NextResponse.json({ error: 'Datos inválidos.' }, { status: 400 });
  }
  const pedidoId = Number(body?.pedidoId);
  if (!Number.isInteger(pedidoId) || pedidoId <= 0) {
    return NextResponse.json({ error: 'Falta el pedido.' }, { status: 400 });
  }

  // Sólo si es suyo. Uno ajeno da el mismo 404 que uno que no existe.
  const { data: pedido, error: errorPedido } = await admin
    .from('pedidos')
    .select(`
      id, estado, cancelado_motivo, vendedor_id, comprador_id, vence_en, efectivo_vence_en,
      mp_payment_id, recordatorio_enviado_en,
      items:pedido_items ( nombre, variante, cantidad, precio )
    `)
    .eq('id', pedidoId)
    .eq('vendedor_id', vendedor.id)
    .maybeSingle();

  if (errorPedido) {
    console.error(`Recordatorio pedido ${pedidoId}: no se pudo leer el pedido — ${errorPedido.message}`);
    return NextResponse.json({ error: NO_SE_PUDO }, { status: 500 });
  }
  if (!pedido) return NextResponse.json({ error: 'No encontramos ese pedido.' }, { status: 404 });

  if (!esCarritoAbandonado(pedido)) {
    return NextResponse.json({ error: 'Este pedido no es un carrito abandonado.' }, { status: 409 });
  }
  if (pedido.recordatorio_enviado_en) {
    return NextResponse.json({ error: 'El recordatorio ya se envió.' }, { status: 409 });
  }

  // Sin una cuenta de MercadoPago conectada, quien compró llegaría a una tienda
  // donde no puede pagar. La pantalla ya lo frena con un cartel; esto es la red
  // de seguridad (por ejemplo, si desconectó con el panel de pedidos abierto).
  const { data: cuentaMp, error: errorCuentaMp } = await admin
    .from('mercadopago_cuentas')
    .select('vendedor_id')
    .eq('vendedor_id', vendedor.id)
    .maybeSingle();
  if (errorCuentaMp) {
    console.error(`Recordatorio pedido ${pedidoId}: no se pudo leer la cuenta de MercadoPago — ${errorCuentaMp.message}`);
    return NextResponse.json({ error: NO_SE_PUDO }, { status: 500 });
  }
  if (!cuentaMp) {
    return NextResponse.json(
      { error: 'Conectá tu cuenta de MercadoPago para poder recordarle.', codigo: 'SIN_MP' },
      { status: 400 }
    );
  }

  // Una cuenta cerrada queda con un mail .invalid: a esa no se le manda nada.
  const { data: comprador, error: errorComprador } = await admin
    .from('usuarios')
    .select('id, email, nombre_usuario, cerrada_en')
    .eq('id', pedido.comprador_id)
    .maybeSingle();
  if (errorComprador) console.error('[recordar/usuarios]', errorComprador.message);

  const email = comprador && !comprador.cerrada_en && !/\.invalid$/i.test(comprador.email || '')
    ? comprador.email
    : null;
  if (!email) {
    return NextResponse.json({ error: 'No se puede contactar a quien compró.' }, { status: 409 });
  }

  if (!process.env.RESEND_API_KEY) {
    console.error(`Recordatorio pedido ${pedidoId}: RESEND_API_KEY no configurada.`);
    return NextResponse.json({ error: 'El servicio de mail no está configurado.' }, { status: 500 });
  }

  // Se arma antes de reclamar: si el armado falla, no queda nada marcado.
  const mail = armarMailRecordatorio({
    tienda: vendedor.nombre_negocio,
    slugTienda: vendedor.slug,
    apodo: comprador.nombre_usuario,
    items: pedido.items,
  });

  const { data: reclamo, error: errorReclamo } = await admin
    .from('pedidos')
    .update({ recordatorio_enviado_en: new Date().toISOString() })
    .eq('id', pedidoId)
    .eq('vendedor_id', vendedor.id)
    .is('recordatorio_enviado_en', null)
    .select('id, recordatorio_enviado_en')
    .maybeSingle();

  if (errorReclamo) {
    console.error(`Recordatorio pedido ${pedidoId}: no se pudo reclamar el envío — ${errorReclamo.message}`);
    return NextResponse.json({ error: NO_SE_PUDO }, { status: 500 });
  }
  if (!reclamo) {
    return NextResponse.json({ error: 'El recordatorio ya se envió.' }, { status: 409 });
  }

  let falla = null;
  try {
    const resultado = await enviarPorResend({ para: email, mail, desde: REMITENTE_NO_REPLY, responderA: EMAIL_CONTACTO });
    if (!resultado.ok) falla = resultado.motivo;
  } catch (err) {
    falla = err?.message || String(err);
  }

  if (falla) {
    const { error: errorSoltar } = await admin
      .from('pedidos')
      .update({ recordatorio_enviado_en: null })
      .eq('id', pedidoId);
    console.error(
      `Recordatorio pedido ${pedidoId}: falló — ${falla}` +
      (errorSoltar ? ` (y recordatorio_enviado_en no se pudo volver a null: ${errorSoltar.message})` : '')
    );
    return NextResponse.json({ error: NO_SE_PUDO }, { status: 500 });
  }

  console.log(`Recordatorio pedido ${pedidoId}: enviado.`);
  return NextResponse.json({ ok: true, recordatorio_enviado_en: reclamo.recordatorio_enviado_en });
}
