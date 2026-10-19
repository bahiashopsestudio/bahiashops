// Avanzar un pedido al siguiente paso de su forma de entrega.
//
// Lo que se valida acá, en este orden:
//   1. Hay sesión.
//   2. Quien llama es un vendedor.
//   3. El pedido es SUYO.
//   4. El destino es el paso siguiente de la secuencia de su forma de entrega
//      (SECUENCIAS en src/lib/pedidos.js).
//
// El vendedor nunca puede escribir 'pendiente', 'pagado', 'rechazado',
// 'cancelado' ni 'reembolsado': esos los pone el webhook de MercadoPago y no
// aparecen como destino en ninguna secuencia. Tampoco puede retroceder ni
// saltear pasos, por lo mismo.
//
// Los mails a quien compró salen desde acá, no de una ruta suelta: para cuando
// se mandan, ya está verificado quién lo pidió. Van DESPUÉS de guardar el
// estado y nunca lo deshacen:
//   · despachado  el mail de despacho
//   · listo       «Tu pedido está listo para retirar», una sola vez por pedido
//   · entregado   «¿Cómo te fue?», para dejar la reseña, una sola vez por
//                 pedido (marca entregado_at)
//
// Un pedido por correo no se puede marcar como despachado sin la empresa y el
// número de seguimiento: van en el mail de despacho y en Mis pedidos.

import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { getServiceRoleClient } from '@/lib/supabase/admin';
import { validarAvance, ESTADO_PIDE_FRANJA, FRANJAS_VALIDAS, ESTADO_ENTREGADO } from '@/lib/pedidos';
import { avisarDespacho, avisarListo, avisarResena } from '@/lib/mailsPedidos';
import { tipoEntregaDe, validarSeguimiento } from '@/lib/metodosEntrega';

export async function POST(request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: 'Iniciá sesión.' }, { status: 401 });
  }

  const body = await request.json().catch(() => ({}));
  const pedidoId = Number(body.pedido_id);
  const destino = typeof body.destino === 'string' ? body.destino : null;

  if (!Number.isInteger(pedidoId) || pedidoId <= 0) {
    return NextResponse.json({ error: 'Falta pedido_id.' }, { status: 400 });
  }

  const admin = getServiceRoleClient();

  const { data: vendedor, error: errorVendedor } = await admin
    .from('vendedores')
    .select('id')
    .eq('usuario_id', user.id)
    .maybeSingle();

  if (errorVendedor) {
    console.error('No se pudo leer el vendedor', user.id, errorVendedor.message);
    return NextResponse.json({ error: 'No se pudo procesar el pedido.' }, { status: 500 });
  }

  if (!vendedor) {
    return NextResponse.json({ error: 'No encontramos tu cuenta de vendedor.' }, { status: 403 });
  }

  const { data: pedido, error: errorPedido } = await admin
    .from('pedidos')
    .select('id, estado, vendedor_id, metodo_envio')
    .eq('id', pedidoId)
    .maybeSingle();

  if (errorPedido) {
    console.error('No se pudo leer el pedido', pedidoId, errorPedido.message);
    return NextResponse.json({ error: 'No se pudo procesar el pedido.' }, { status: 500 });
  }

  // Toda la regla, en un solo lugar y sin tocar la base.
  const veredicto = validarAvance({ pedido, vendedorId: vendedor.id, destino });

  if (!veredicto.ok) {
    // Un pedido ajeno se responde igual que uno inexistente: que el mensaje no
    // sirva para averiguar qué pedidos existen ni en qué estado están.
    console.warn('Avance rechazado', { pedidoId, vendedorId: vendedor.id, destino, motivo: veredicto.motivo });
    return NextResponse.json({ error: veredicto.error, motivo: veredicto.motivo }, { status: veredicto.status });
  }

  const ahora = new Date().toISOString();
  const campos = {
    estado: veredicto.siguiente,
    actualizado_en: ahora,
  };

  // La franja se guarda: va en el WhatsApp, en el mail de despacho y en Mis
  // pedidos. Sólo tiene sentido en el paso que la pide.
  if (veredicto.siguiente === ESTADO_PIDE_FRANJA) {
    const franja = typeof body.franja === 'string' ? body.franja.trim() : '';
    if (!FRANJAS_VALIDAS.includes(franja)) {
      return NextResponse.json(
        { error: `La franja horaria tiene que ser una de: ${FRANJAS_VALIDAS.join(', ')}.` },
        { status: 400 }
      );
    }
    campos.franja_horaria = franja;
  }

  // El correo se despacha con seguimiento.
  if (veredicto.siguiente === 'despachado' && tipoEntregaDe(pedido.metodo_envio) === 'correo') {
    const seguimiento = validarSeguimiento(body.seguimiento || {});
    if (!seguimiento.ok) {
      return NextResponse.json({ error: seguimiento.error, motivo: 'sin_seguimiento' }, { status: 400 });
    }
    Object.assign(campos, seguimiento.campos);
  }

  if (veredicto.siguiente === ESTADO_ENTREGADO) {
    campos.entregado_at = ahora;
  }

  const { data: actualizado, error: errorUpdate } = await admin
    .from('pedidos')
    .update(campos)
    .eq('id', pedidoId)
    // Cinturón y tiradores: aunque ya lo verificamos arriba, el UPDATE se
    // acota otra vez al vendedor y al estado del que partimos. Si algo cambió
    // entre la lectura y la escritura, no escribe nada.
    .eq('vendedor_id', vendedor.id)
    .eq('estado', pedido.estado)
    .select('id, estado, franja_horaria, actualizado_en, entregado_at, envio_empresa, envio_empresa_otra, envio_seguimiento')
    .maybeSingle();

  if (errorUpdate) {
    console.error('No se pudo avanzar el pedido', pedidoId, errorUpdate.message);
    return NextResponse.json({ error: 'No se pudo actualizar el pedido.' }, { status: 500 });
  }

  if (!actualizado) {
    return NextResponse.json(
      { error: 'El pedido cambió de estado mientras lo actualizabas. Recargá y probá de nuevo.', motivo: 'carrera' },
      { status: 409 }
    );
  }

  // El mail va DESPUÉS de que el estado quedó guardado, y no puede deshacerlo.
  // Los dos nunca lanzan: si fallan, queda en el log y la pantalla avisa.
  let aviso = { enviado: false, motivo: 'sin_aviso' };
  if (actualizado.estado === 'despachado') {
    aviso = await avisarDespacho({ admin, pedidoId });
  } else if (actualizado.estado === 'listo') {
    aviso = await avisarListo({ admin, pedidoId });
  } else if (actualizado.estado === ESTADO_ENTREGADO) {
    aviso = await avisarResena({ admin, pedidoId });
  }

  return NextResponse.json({ pedido: actualizado, aviso });
}
