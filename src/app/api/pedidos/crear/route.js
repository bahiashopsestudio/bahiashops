import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createClient as createAdminClient } from '@supabase/supabase-js';
import { getValidAccessToken } from '@/lib/mercadopago/tokens';
import { SITIO_URL } from '@/lib/sitio';

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
    .select('id, nombre_negocio, bloqueado, estado_validacion')
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

  // 3b. La dirección de entrega, si hay, tiene que ser de quien compra.
  //
  // ESTO NO ES DEFENSIVO, a diferencia de las lecturas del payer más abajo:
  // si no se puede confirmar el dueño, la compra se rechaza y el pedido no se
  // crea. El direccionId viene del navegador, y la pantalla del vendedor lee
  // el pedido con service_role mostrando la dirección embebida, teléfono
  // incluido. Sin esta verificación, cualquiera podía darse de alta como
  // vendedor, comprarse su propio producto pasando un direccion_id ajeno (son
  // correlativos) y leer la dirección y el teléfono de otra persona.
  //
  // Una dirección inexistente y una ajena reciben la misma respuesta, para que
  // esto no sirva para averiguar qué ids existen.
  let direccionIdVerificada = null;

  if (direccionId !== null && direccionId !== undefined && direccionId !== '') {
    const idNumerico = Number(direccionId);

    if (!Number.isInteger(idNumerico) || idNumerico <= 0) {
      console.warn('Compra rechazada: direccionId inválido', { usuario: user.id, direccionId });
      return NextResponse.json(
        { error: 'La dirección de entrega no es válida.' },
        { status: 400 }
      );
    }

    const { data: direccionPropia, error: errorDueno } = await admin
      .from('direcciones')
      .select('id')
      .eq('id', idNumerico)
      .eq('usuario_id', user.id)
      .maybeSingle();

    if (errorDueno) {
      console.error('Compra rechazada: no se pudo verificar el dueño de la dirección', {
        usuario: user.id, direccionId: idNumerico, error: errorDueno.message,
      });
      return NextResponse.json(
        { error: 'No se pudo verificar la dirección de entrega. Probá de nuevo.' },
        { status: 500 }
      );
    }

    if (!direccionPropia) {
      console.warn('Compra rechazada: la dirección no es de quien compra', {
        usuario: user.id, direccionId: idNumerico,
      });
      return NextResponse.json(
        { error: 'La dirección de entrega no es válida.' },
        { status: 403 }
      );
    }

    direccionIdVerificada = idNumerico;
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
      // Copia congelada: el historial del comprador tiene que poder nombrar la
      // tienda aunque después se bloquee o cambie de nombre.
      vendedor_nombre: vendedor.nombre_negocio,
      // Sólo la dirección verificada en el paso 3b: es exactamente el id que se
      // comprobó, no el valor crudo que mandó el navegador.
      direccion_id: direccionIdVerificada,
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
  const mpItems = items.map((item) => {
    const mpItem = {
      id: String(item.productoId),
      title: item.nombre + (item.variante ? ` (${item.variante})` : ''),
      description: item.nombre,
      quantity: item.cantidad,
      unit_price: item.precio,
      currency_id: 'ARS',
      category_id: 'others',
    };
    // Sin foto no va la clave: nada de picture_url vacío.
    if (item.foto) mpItem.picture_url = item.foto;
    return mpItem;
  });

  // Si hay costo de envío, lo sumamos como un item más al pago.
  if (costoEnvio > 0) {
    mpItems.push({
      title: 'Envío',
      quantity: 1,
      unit_price: costoEnvio,
      currency_id: 'ARS',
      category_id: 'others',
    });
  }

  // ── Datos del comprador para la preferencia ──
  //
  // Todo lo de acá abajo es opcional: sirve para que MercadoPago muestre mejor
  // el pago, pero nada de esto puede impedir una compra. Si un dato falta, si
  // viene vacío, o si la lectura falla, se omite la CLAVE ENTERA y se sigue.
  // Nunca se manda un phone sin número ni un address a medio llenar.
  const payer = { email: user.email };

  const { data: comprador, error: errorComprador } = await admin
    .from('usuarios')
    .select('nombre, apellido, telefono')
    .eq('id', user.id)
    .maybeSingle();

  if (errorComprador) {
    console.error('No se pudieron leer los datos del comprador', user.id, errorComprador.message);
  }

  // nombre y apellido son NOT NULL pero pueden venir vacíos: con registro por
  // Google puede faltar el apellido. El vacío se trata igual que el nulo.
  const nombreComprador = comprador?.nombre?.trim();
  const apellidoComprador = comprador?.apellido?.trim();
  if (nombreComprador) payer.name = nombreComprador;
  if (apellidoComprador) payer.surname = apellidoComprador;

  // La dirección sólo existe si el método de entrega la pidió. En retiro en
  // local o "a coordinar", no hay dirección verificada y acá no se consulta
  // nada. Esta lectura SÍ es defensiva: el dueño ya se comprobó en el paso 3b,
  // y si ahora falla, se omite el address y la compra sigue.
  let direccionComprador = null;
  if (direccionIdVerificada) {
    const { data, error: errorDireccion } = await admin
      .from('direcciones')
      .select('calle, numero, telefono')
      .eq('id', direccionIdVerificada)
      // Que la dirección sea de quien compra: el id viene del navegador.
      .eq('usuario_id', user.id)
      .maybeSingle();

    if (errorDireccion) {
      console.error('No se pudo leer la dirección del comprador', direccionIdVerificada, errorDireccion.message);
    }
    direccionComprador = data || null;
  }

  // Teléfono: primero el de la cuenta, después el de la dirección. Sin
  // area_code, porque se guarda como un solo string y no vamos a adivinar
  // dónde termina la característica.
  const telefonoComprador =
    comprador?.telefono?.trim() || direccionComprador?.telefono?.trim() || '';
  if (telefonoComprador) payer.phone = { number: telefonoComprador };

  // Sin código postal: no existe en la base y no se inventa.
  const calle = direccionComprador?.calle?.trim();
  const numero = direccionComprador?.numero?.trim();
  if (calle && numero) {
    payer.address = { street_name: calle, street_number: numero };
  }

  const mpResponse = await fetch('https://api.mercadopago.com/checkout/preferences', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${accessToken}`,
    },
    body: JSON.stringify({
      items: mpItems,
      payer,
      marketplace_fee: comision,
      statement_descriptor: 'BAHIASHOPS',
      back_urls: {
        success: `${SITIO_URL}/compra/exito?pedido=${pedido.id}`,
        failure: `${SITIO_URL}/compra/fallo?pedido=${pedido.id}`,
        pending: `${SITIO_URL}/compra/pendiente?pedido=${pedido.id}`,
      },
      auto_return: 'approved',
      notification_url: `${SITIO_URL}/api/mercadopago/webhook`,
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