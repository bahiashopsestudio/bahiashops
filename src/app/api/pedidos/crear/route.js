import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createClient as createAdminClient } from '@supabase/supabase-js';
import { getValidAccessToken } from '@/lib/mercadopago/tokens';

export async function POST(request) {
  // 1. ¿Quién está comprando? (necesitamos su sesión)
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json(
      { error: 'Iniciá sesión para comprar.' },
      { status: 401 }
    );
  }

  // 2. Leer los datos que mandó el checkout.
  const body = await request.json();
  const {
    vendedorId, items, metodoEnvio,
    direccionId, turnoPreferido,
    subtotalProductos, costoEnvio, total,
  } = body;

  if (!vendedorId || !items?.length || !metodoEnvio) {
    return NextResponse.json(
      { error: 'Faltan datos del pedido.' },
      { status: 400 }
    );
  }

  const admin = createAdminClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
  );

  // 3. ¿Esto todavía se puede comprar?
  //
  // El carrito vive en el localStorage del comprador: puede tener adentro un
  // producto pausado hace un mes o la tienda de un vendedor bloqueado ayer.
  // Nada de lo que pasó antes en la UI cuenta como control — este cliente usa
  // service_role y se saltea RLS, así que la regla se aplica acá a mano.
  //
  // El mensaje que sale de acá no dice por qué. "No está disponible" es todo
  // lo que le corresponde saber a quien compra: el motivo es entre nosotros y
  // el vendedor.
  const NO_DISPONIBLE = {
    error: 'Algunos productos de este pedido ya no están disponibles.',
    codigo: 'NO_DISPONIBLE',
  };

  const { data: vendedor, error: errorVendedor } = await admin
    .from('vendedores')
    .select('id, bloqueado, estado_validacion')
    .eq('id', vendedorId)
    .maybeSingle();

  if (errorVendedor) {
    return NextResponse.json(
      { error: 'No se pudo verificar el pedido.' },
      { status: 500 }
    );
  }

  // Tienda inexistente, bloqueada o despublicada: los tres son lo mismo acá.
  if (!vendedor || vendedor.bloqueado || vendedor.estado_validacion !== 'aprobado') {
    return NextResponse.json(
      { ...NO_DISPONIBLE, productos_no_disponibles: items.map((i) => Number(i.productoId)) },
      { status: 409 }
    );
  }

  // Y los productos uno por uno: que sigan activos y que sigan siendo de este
  // vendedor (el precio y el nombre los manda el cliente, el permiso no).
  const idsPedidos = [...new Set(items.map((i) => Number(i.productoId)).filter(Boolean))];

  const { data: vigentes, error: errorProductos } = await admin
    .from('productos')
    .select('id')
    .in('id', idsPedidos)
    .eq('vendedor_id', vendedorId)
    .eq('estado', 'activo');

  if (errorProductos) {
    return NextResponse.json(
      { error: 'No se pudo verificar el pedido.' },
      { status: 500 }
    );
  }

  const disponibles = new Set((vigentes || []).map((p) => p.id));
  const caidos = idsPedidos.filter((id) => !disponibles.has(id));

  if (caidos.length > 0) {
    return NextResponse.json(
      { ...NO_DISPONIBLE, productos_no_disponibles: caidos },
      { status: 409 }
    );
  }

  // 4. Calcular la comisión: 5% sobre PRODUCTOS, no sobre envío.
  const comision = Math.round(subtotalProductos * 0.05);

  // 5. Obtener un token válido del vendedor (se auto-renueva si está por vencer).
  let accessToken;
  try {
    accessToken = await getValidAccessToken(vendedorId, admin);
  } catch (err) {
    const mensajes = {
      VENDEDOR_SIN_MP: 'Este vendedor no tiene MercadoPago conectado.',
      TOKEN_SIN_REFRESH: 'La conexión de MercadoPago del vendedor venció y no se pudo renovar.',
      REFRESH_RECHAZADO: 'La conexión de MercadoPago del vendedor fue revocada. Tiene que reconectar.',
    };
    return NextResponse.json(
      { error: mensajes[err.message] || 'Error con la conexión de MercadoPago del vendedor.' },
      { status: 400 }
    );
  }

  // 6. Anotar el pedido en la libreta (estado: pendiente, porque todavía no pagó).
  const { data: pedido, error: errorPedido } = await admin
    .from('pedidos')
    .insert({
      comprador_id: user.id,
      vendedor_id: vendedorId,
      direccion_id: direccionId || null,
      metodo_envio: metodoEnvio,
      turno_preferido: turnoPreferido || null,
      subtotal_productos: subtotalProductos,
      costo_envio: costoEnvio,
      total: total,
      comision_plataforma: comision,
      estado: 'pendiente',
    })
    .select()
    .single();

  if (errorPedido) {
    return NextResponse.json(
      { error: 'No se pudo crear el pedido.', detalle: errorPedido.message },
      { status: 500 }
    );
  }

  // 7. Guardar la "foto" de los productos (nombre y precio de este momento).
  const itemsParaGuardar = items.map((item) => ({
    pedido_id: pedido.id,
    producto_id: item.productoId,
    nombre: item.nombre,
    variante: item.variante || null,
    precio: item.precio,
    cantidad: item.cantidad,
    foto_url: item.foto || null,
  }));

  const { error: errorItems } = await admin
    .from('pedido_items')
    .insert(itemsParaGuardar);

  if (errorItems) {
    await admin.from('pedidos').delete().eq('id', pedido.id);
    return NextResponse.json(
      { error: 'No se pudieron guardar los productos.', detalle: errorItems.message },
      { status: 500 }
    );
  }

  // 8. Pedirle a MercadoPago el link de pago con el split.
  //    Usamos las llaves DEL VENDEDOR (no las nuestras) — así el pago
  //    entra a SU cuenta y MercadoPago reparte nuestra comisión solo.
  const baseUrl = new URL(request.url).origin;

  const mpItems = items.map((item) => ({
    title: item.nombre + (item.variante ? ` (${item.variante})` : ''),
    quantity: item.cantidad,
    unit_price: item.precio,
    currency_id: 'ARS',
  }));

  // Si hay costo de envío, lo sumamos como un item más al pago.
  if (costoEnvio > 0) {
    mpItems.push({
      title: 'Envío',
      quantity: 1,
      unit_price: costoEnvio,
      currency_id: 'ARS',
    });
  }

  const mpResponse = await fetch('https://api.mercadopago.com/checkout/preferences', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${accessToken}`,
    },
    body: JSON.stringify({
      items: mpItems,
      marketplace_fee: comision,
      back_urls: {
        success: `${baseUrl}/compra/exito?pedido=${pedido.id}`,
        failure: `${baseUrl}/compra/fallo?pedido=${pedido.id}`,
        pending: `${baseUrl}/compra/pendiente?pedido=${pedido.id}`,
      },
      auto_return: 'approved',
      notification_url: `${baseUrl}/api/mercadopago/webhook`,
      external_reference: String(pedido.id),
    }),
  });

  const mpData = await mpResponse.json();

  if (!mpResponse.ok) {
    return NextResponse.json(
      { error: 'No se pudo crear el pago en MercadoPago.', detalle: mpData },
      { status: 500 }
    );
  }

  // 9. Guardar el id de la preferencia en el pedido (para rastrearlo después).
  await admin
    .from('pedidos')
    .update({ mp_preference_id: mpData.id })
    .eq('id', pedido.id);

  // 10. Devolver el link de pago al checkout para que mande al comprador.
  return NextResponse.json({
    checkout_url: mpData.init_point,
    pedido_id: pedido.id,
  });
}