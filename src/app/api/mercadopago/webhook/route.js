import { NextResponse } from 'next/server';
import { createClient as createAdminClient } from '@supabase/supabase-js';
import crypto from 'crypto';
import { ESTADOS_DE_PAGO, ESTADO_REEMBOLSADO } from '@/lib/pedidos';
import {
  validarPago, estadoDelPedido, MOTIVOS_DE_FRAUDE, ESTADOS_REEMPLAZABLES, DEVOLUCIONES_MP, SIN_CAMBIOS_MP,
} from '@/lib/validarPago';
import { avisarPago } from '@/lib/mailsPedidos';

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

  // Comparación en tiempo constante: con === se puede ir adivinando la firma
  // midiendo cuánto tarda en fallar. timingSafeEqual exige el mismo largo, y
  // un largo distinto ya es una firma inválida.
  const esperada = Buffer.from(hmac, 'utf8');
  const recibida = Buffer.from(v1, 'utf8');
  if (esperada.length !== recibida.length) return false;
  return crypto.timingSafeEqual(esperada, recibida);
}

// Consulta el pago con el token de cada cuenta hasta que una lo pueda ver.
// Devuelve { pago, cuenta } o null. `cuenta` es la fila cuyo token sirvió: de
// ahí sale qué vendedor consultó el pago.
async function consultarPago(paymentId, cuentas) {
  for (const cuenta of cuentas) {
    const res = await fetch(`https://api.mercadopago.com/v1/payments/${encodeURIComponent(paymentId)}`, {
      headers: { 'Authorization': `Bearer ${cuenta.access_token}` },
    });
    if (res.ok) {
      return { pago: await res.json(), cuenta };
    }
  }
  return null;
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

    const { data: cuentas } = await admin
      .from('mercadopago_cuentas')
      .select('vendedor_id, access_token, mp_user_id');

    if (!cuentas || cuentas.length === 0) {
      console.log('No hay vendedores conectados con MercadoPago.');
      return NextResponse.json({ recibido: true });
    }

    // El aviso suele traer el id de la cuenta que cobró (user_id). Se usa SÓLO
    // como pista para probar primero ese token y no recorrerlos todos: quién
    // cobró de verdad lo decide validarPago con lo que devuelve la API.
    const pista = body.user_id !== undefined && body.user_id !== null ? String(body.user_id) : '';
    const primera = pista ? cuentas.find((c) => String(c.mp_user_id) === pista) : null;
    const orden = primera ? [primera, ...cuentas.filter((c) => c !== primera)] : cuentas;

    const consulta = await consultarPago(paymentId, orden);

    if (!consulta) {
      console.log('No pudimos consultar el pago con ningún vendedor.');
      return NextResponse.json({ recibido: true });
    }

    const { pago, cuenta: cuentaDelToken } = consulta;

    // ── Ninguna escritura hasta que el pago pase todas las verificaciones ──
    // Todo sale de la API de MercadoPago y de la base, nada del cuerpo del
    // aviso.
    const referencia = String(pago.external_reference ?? '').trim();
    let pedido = null;

    if (/^[1-9]\d*$/.test(referencia)) {
      const { data, error: errorPedido } = await admin
        .from('pedidos')
        .select('id, vendedor_id, total, estado, mp_payment_id, aviso_vendedor_en, aviso_comprador_en')
        .eq('id', Number(referencia))
        .maybeSingle();

      if (errorPedido) {
        // No es "pedido inexistente": no se sabe. Se corta sin escribir.
        console.error(`Pago ${pago.id}: no se pudo leer el pedido ${referencia} — ${errorPedido.message}`);
        return NextResponse.json({ recibido: true });
      }
      pedido = data;
    }

    // La cuenta de MP del vendedor del pedido: la misma lista que ya se leyó.
    const cuentaDelPedido = pedido
      ? cuentas.find((c) => String(c.vendedor_id) === String(pedido.vendedor_id)) || null
      : null;

    const veredicto = validarPago(pago, pedido, cuentaDelPedido, cuentaDelToken.vendedor_id);

    if (!veredicto.ok) {
      const detalle = {
        pago: pago.id,
        pedido: referencia || null,
        vendedorDelPedido: pedido?.vendedor_id ?? null,
        vendedorDelToken: cuentaDelToken.vendedor_id,
        cobrador: pago.collector_id ?? null,
        monto: pago.transaction_amount ?? null,
        moneda: pago.currency_id ?? null,
        estadoPedido: pedido?.estado ?? null,
      };

      // No hay todavía una función para avisar por mail a notificaciones@:
      // los intentos de fraude quedan marcados en el log para buscarlos.
      if (MOTIVOS_DE_FRAUDE.includes(veredicto.motivo)) {
        console.error(`[webhook] POSIBLE FRAUDE — pago rechazado: ${veredicto.motivo}`, detalle);
      } else {
        console.warn(`[webhook] pago no aplicado: ${veredicto.motivo}`, detalle);
      }
      // 200 igual: que MercadoPago no reintente algo que no vamos a aceptar.
      return NextResponse.json({ recibido: true });
    }

    const idPago = String(pago.id);

    // Un reclamo abierto no cambia nada: el pedido sigue donde está.
    const sinCambios = SIN_CAMBIOS_MP[pago.status];
    if (sinCambios) {
      console.log(`Pedido ${pedido.id}: ${sinCambios} en el pago ${idPago}; el pedido sigue en "${pedido.estado}".`);
      return NextResponse.json({ recibido: true });
    }

    const nuestroEstado = estadoDelPedido(pago.status);

    // El mismo aviso otra vez, sin nada nuevo: no se toca el pedido.
    if (String(pedido.mp_payment_id ?? '') === idPago && pedido.estado === nuestroEstado) {
      console.log(`Pedido ${pedido.id}: aviso repetido del pago ${idPago}, sin cambios.`);

      // Si un mail falló la primera vez, la columna quedó en null: este aviso
      // repetido es la oportunidad de mandarlo. Sólo mientras el pedido sigue
      // en 'pagado'; si el vendedor ya lo movió, ya no tiene sentido. El
      // reclamo con "where ... is null" evita que se duplique el que sí salió.
      if (pedido.estado === 'pagado' && (!pedido.aviso_vendedor_en || !pedido.aviso_comprador_en)) {
        console.log(`Pedido ${pedido.id}: reintento de aviso (vendedor ${pedido.aviso_vendedor_en ? 'ya enviado' : 'pendiente'}, comprador ${pedido.aviso_comprador_en ? 'ya enviado' : 'pendiente'}).`);
        try {
          await avisarPago({ admin, pedidoId: pedido.id });
        } catch (errMails) {
          console.error(`Pedido ${pedido.id}: error en el reintento de aviso`, errMails);
        }
      }
      return NextResponse.json({ recibido: true });
    }

    // ── La plata volvió: reembolso o contracargo ──
    // Desde cualquier estado, pero sólo sobre el pago guardado (validarPago ya
    // lo comprobó, y el WHERE lo repite por si cambió entretanto). No se toca
    // mp_payment_id: es el mismo pago.
    const devolucion = DEVOLUCIONES_MP[pago.status];
    if (devolucion) {
      const { data: pedidoDevuelto, error: errorDevolucion } = await admin
        .from('pedidos')
        .update({
          estado: ESTADO_REEMBOLSADO,
          actualizado_en: new Date().toISOString(),
        })
        .eq('id', pedido.id)
        .eq('mp_payment_id', idPago)
        .select('id, estado')
        .maybeSingle();

      if (errorDevolucion) {
        console.error(`Pedido ${pedido.id}: ${devolucion} del pago ${idPago}, pero no se pudo escribir — ${errorDevolucion.message}`);
      } else if (pedidoDevuelto) {
        console.log(`Pedido ${pedido.id}: ${devolucion} del pago ${idPago} -> ${ESTADO_REEMBOLSADO} (estaba en "${pedido.estado}")`);
      } else {
        console.log(`Pedido ${pedido.id}: ${devolucion} del pago ${idPago}, pero el pedido cambió de pago entretanto; no se tocó.`);
      }
      return NextResponse.json({ recibido: true });
    }

    // Una sola escritura, con las guardas de validarPago repetidas en el
    // WHERE: si entre la lectura y acá el pedido avanzó o quedó pagado con
    // otro pago, no se pisa. Sin esta guarda, un aviso repetido sobre un pedido
    // que el vendedor ya movió a 'preparando' lo devolvía a 'pagado'.
    //
    // El pago se aplica si el pedido no tiene pago, si es este mismo, o si
    // está en un estado donde un pago nuevo reemplaza al anterior.
    const { data: pedidoNuevo, error: errorEscritura } = await admin
      .from('pedidos')
      .update({
        mp_payment_id: idPago,
        estado: nuestroEstado,
        actualizado_en: new Date().toISOString(),
      })
      .eq('id', pedido.id)
      .in('estado', ESTADOS_DE_PAGO)
      .or(`mp_payment_id.is.null,mp_payment_id.eq.${idPago},estado.in.(${ESTADOS_REEMPLAZABLES.join(',')})`)
      .select('id, estado')
      .maybeSingle();

    if (errorEscritura) {
      console.error(`Pedido ${pedido.id}: no se pudo escribir el pago ${idPago} — ${errorEscritura.message}`);
    } else if (pedidoNuevo) {
      console.log(`Pedido ${pedido.id}: pago ${idPago} aplicado -> ${pedidoNuevo.estado}`);

      // El pedido quedó pagado con esta escritura: aviso de venta al vendedor
      // y confirmación a quien compró. Se esperan antes de responder (en Vercel
      // lo que queda después de la respuesta puede no ejecutarse), pero no
      // cambian la respuesta: avisarPago no lanza y cada mail se reclama una
      // sola vez por pedido, así que un aviso repetido no manda nada.
      if (pedidoNuevo.estado === 'pagado') {
        try {
          await avisarPago({ admin, pedidoId: pedido.id });
        } catch (errMails) {
          console.error(`Pedido ${pedido.id}: error en los mails del pago`, errMails);
        }
      }
    } else {
      console.log(`Pedido ${pedido.id}: cambió entre la lectura y la escritura; el pago ${idPago} no se aplicó.`);
    }

    return NextResponse.json({ recibido: true });
  } catch (err) {
    console.error('Error en webhook:', err);
    // Devolvemos 200 para que MercadoPago no reintente por un error nuestro
    return NextResponse.json({ recibido: true });
  }
}
