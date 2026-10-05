import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createClient as createAdminClient } from '@supabase/supabase-js';
import { getValidAccessToken } from '@/lib/mercadopago/tokens';
import { camposDeVencimiento, vencerPreferencia } from '@/lib/mercadopago/preferencias';
import { calcularVencimiento } from '@/lib/vencimientoPago';
import { SITIO_URL } from '@/lib/sitio';
import { calcularPedido } from '@/lib/precioPedido';
import { metodoPideDireccion, normalizarMetodo, metodosConfigurados } from '@/lib/metodosEntrega';
import { zonasPara } from '@/lib/zonaEnvio';
import { codigoPostalValido, normalizarCodigoPostal } from '@/lib/direcciones';
import { normalizarTelefonoAR } from '@/lib/telefono';
import { datosContactoComprador } from '@/lib/contactoComprador';

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
  //
  // El navegador propone, el servidor decide: de acá se acepta SÓLO qué se
  // compra, cómo se entrega y a dónde. Los valores de plata (subtotal, total)
  // ni se leen. El precio de cada ítem y el costo de envío sí se leen, pero
  // únicamente para comparar contra lo que dice la base: son "lo que la
  // persona vio en pantalla", no lo que se cobra.
  const body = await request.json();
  const {
    vendedorId, items, metodoEnvio,
    direccionId, turnoPreferido,
    costoEnvio: costoEnvioVisto,
  } = body;
  // La zona del correo ya no la elige quien compra: si una pestaña vieja la
  // manda, se ignora. La calcula el servidor (paso 3d).

  if (!vendedorId || !Array.isArray(items) || items.length === 0 || !metodoEnvio) {
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
    .select(
      'id, nombre_negocio, bloqueado, estado_validacion, ' +
      // Para recalcular el envío del lado del servidor.
      'latitud, longitud, metodos_entrega_default, costos_envio_zona'
    )
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
  // vendedor. De la misma lectura salen el precio, el nombre y si tiene
  // variantes: nada de eso se le cree al navegador.
  const idsPedidos = [...new Set(items.map((i) => Number(i.productoId)).filter(Boolean))];

  const { data: vigentes, error: errorProductos } = await admin
    .from('productos')
    .select('id, nombre, precio, tiene_variantes')
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
  //
  // Si el método no usa dirección (retiro, coordinar), el pedido queda con
  // direccion_id null: el vendedor no tiene por qué ver la dirección de alguien
  // que retira o coordina aparte. Hay un solo caso en que se lee igual: el
  // respaldo "coordinar" de una tienda con envío propio o correo, que se
  // ofrece porque ninguno llega a esa dirección. Ahí la dirección sirve para
  // comprobar eso, y después no se guarda.
  let direccionIdVerificada = null;
  // La fila entera sale de la misma lectura: el punto hace falta para la zona
  // del envío, y el resto para la copia de la dirección y el payer.
  let direccionVerificada = null;

  const metodoPedido = normalizarMetodo(metodoEnvio);
  const pideDireccion = metodoPideDireccion(metodoPedido);
  // Los métodos por zona que ofrece la tienda: los que necesitan la zona de
  // la dirección.
  const metodosPorZona = metodosConfigurados(vendedor).filter((m) => m === 'envio_tienda' || m === 'correo');
  const hayDireccionId = direccionId !== null && direccionId !== undefined && direccionId !== '';
  const leerDireccion = hayDireccionId &&
    (pideDireccion || (metodoPedido === 'coordinar' && metodosPorZona.length > 0));

  if (leerDireccion) {
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
      .select('*')
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
    direccionVerificada = direccionPropia;
  }

  // 3c. Lo que hace falta para poner los precios: variantes y fotos.
  const { data: variantes, error: errorVariantes } = await admin
    .from('producto_variantes')
    .select('producto_id, propiedad_1_valor')
    .in('producto_id', idsPedidos);

  if (errorVariantes) {
    console.error('No se pudieron leer las variantes', errorVariantes.message);
    return NextResponse.json({ error: 'No se pudo verificar el pedido.' }, { status: 500 });
  }

  const { data: medias, error: errorMedias } = await admin
    .from('producto_media')
    .select('producto_id, url, es_principal, orden')
    .in('producto_id', idsPedidos);

  if (errorMedias) {
    console.error('No se pudieron leer las fotos de los productos', errorMedias.message);
    return NextResponse.json({ error: 'No se pudo verificar el pedido.' }, { status: 500 });
  }

  // 3d. Las zonas (envío de la tienda y correo) las calcula el servidor, con
  // la misma función que usa /api/envio/cotizar: lo que se cobra es lo que se
  // mostró. undefined = no se calculó (no hace falta, o no hay dirección).
  let zonaTienda;
  let zonaCorreo;

  const metodosACalcular = metodoPedido === 'coordinar'
    ? metodosPorZona
    : metodosPorZona.filter((m) => m === metodoPedido);

  if (direccionVerificada && metodosACalcular.length > 0) {
    try {
      const zonas = await zonasPara({
        admin, vendedor, direccion: direccionVerificada, origen: 'crear', metodos: metodosACalcular,
      });
      zonaTienda = zonas.envio_tienda?.zona;
      zonaCorreo = zonas.correo?.zona;
    } catch (err) {
      console.error('No se pudo calcular la zona de envío', err.message);
      return NextResponse.json({ error: 'No se pudo calcular el costo de envío.' }, { status: 500 });
    }
  }

  // 4. La plata: toda calculada acá, con lo leído de la base.
  const calculo = calcularPedido({
    items,
    productos: vigentes,
    variantes,
    medias,
    vendedor,
    metodoEnvio,
    hayDireccion: pideDireccion && direccionIdVerificada !== null,
    zonaTienda,
    zonaCorreo,
    codigoPostalOk: codigoPostalValido(direccionVerificada?.codigo_postal),
    costoEnvioVisto,
  });

  if (!calculo.ok) {
    const { ok, status, ...respuesta } = calculo;
    console.warn('Compra rechazada al calcular el pedido', {
      usuario: user.id, vendedorId, codigo: calculo.codigo,
    });
    return NextResponse.json(respuesta, { status });
  }

  const comision = calculo.comision;

  // 4b. Los datos de contacto de quien compra, congelados en el pedido.
  //
  // Nadie compra sin nombre, apellido y teléfono: el vendedor tiene que poder
  // escribirle.
  // Va antes del token del vendedor (que puede salir a MercadoPago a
  // renovarse) y antes del INSERT: sin datos no se toca nada. La misma lectura
  // de usuarios sirve después para el payer.
  const { data: comprador, error: errorComprador } = await admin
    .from('usuarios')
    .select('nombre, apellido, telefono')
    .eq('id', user.id)
    .maybeSingle();

  // Sin esta lectura no se puede saber si hay datos: no se crea el pedido.
  if (errorComprador) {
    console.error('Compra rechazada: no se pudieron leer los datos del comprador', user.id, errorComprador.message);
    return NextResponse.json(
      { error: 'No pudimos verificar tus datos. Probá de nuevo.' },
      { status: 500 }
    );
  }

  // En retiro y coordinar no se usa la dirección. Si la cuenta no tiene un
  // teléfono usable, se busca el número en la dirección más reciente. Esta
  // lectura sigue siendo de respaldo: si falla, el teléfono queda en null y
  // la compra se frena abajo por falta de datos.
  let direccionReciente = null;
  if (!pideDireccion && !normalizarTelefonoAR(comprador?.telefono)) {
    const { data, error: errorReciente } = await admin
      .from('direcciones')
      .select('telefono')
      .eq('usuario_id', user.id)
      .order('creada_en', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (errorReciente) {
      console.error('No se pudo leer la dirección más reciente del comprador', user.id, errorReciente.message);
    }
    direccionReciente = data || null;
  }

  const { telefonoParaCuenta, ...contactoComprador } = datosContactoComprador({
    cuenta: comprador,
    pideDireccion,
    direccionVerificada,
    direccionReciente,
  });

  if (
    !contactoComprador.comprador_nombre ||
    !contactoComprador.comprador_apellido ||
    !contactoComprador.comprador_telefono
  ) {
    console.warn('Compra rechazada: faltan datos del comprador', {
      usuario: user.id,
      nombre: !!contactoComprador.comprador_nombre,
      apellido: !!contactoComprador.comprador_apellido,
      telefono: !!contactoComprador.comprador_telefono,
    });
    return NextResponse.json(
      { codigo: 'faltan_datos', error: 'Completá tus datos para seguir.' },
      { status: 400 }
    );
  }

  // La cuenta no tenía teléfono y apareció uno en una dirección: se guarda
  // también en la cuenta, para la próxima.
  if (telefonoParaCuenta) {
    const { error: errorGuardarTelefono } = await admin
      .from('usuarios')
      .update({ telefono: telefonoParaCuenta })
      .eq('id', user.id);

    if (errorGuardarTelefono) {
      console.error('No se pudo guardar el teléfono en la cuenta', user.id, errorGuardarTelefono.message);
    }
  }

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
  //
  // El link de pago vence a los PLAZO_PAGO_DIAS (src/lib/vencimientoPago.js).
  // La misma fecha se guarda en el pedido y se le manda a MercadoPago en el
  // paso 8: lo que dice vence_en es lo que de verdad vale el link.
  const ahoraMs = Date.now();
  const venceEnMs = calcularVencimiento(ahoraMs);

  const { data: pedido, error: errorPedido } = await admin
    .from('pedidos')
    .insert({
      comprador_id: user.id,
      vence_en: new Date(venceEnMs).toISOString(),
      // comprador_nombre, comprador_apellido, comprador_telefono y
      // direccion_copia (esta última sólo si el método pide dirección).
      ...contactoComprador,
      vendedor_id: vendedorId,
      // Copia congelada: el historial del comprador tiene que poder nombrar la
      // tienda aunque después se bloquee o cambie de nombre.
      vendedor_nombre: vendedor.nombre_negocio,
      // Sólo la dirección verificada en el paso 3b: es exactamente el id que se
      // comprobó, no el valor crudo que mandó el navegador. Y sólo si el
      // método la usa.
      direccion_id: pideDireccion ? direccionIdVerificada : null,
      // El id de la lista, nunca un nombre viejo.
      metodo_envio: calculo.metodo,
      // La zona cobrada (envío de la tienda o correo), o null.
      zona_envio: calculo.zonaEnvio,
      turno_preferido: turnoPreferido || null,
      subtotal_productos: calculo.subtotal,
      costo_envio: calculo.costoEnvio,
      total: calculo.total,
      comision_plataforma: comision,
      estado: 'pendiente',
    })
    .select()
    .single();

  if (errorPedido) {
    // El disparador de la base rechaza pedidos a nombre de una cuenta eliminada
    // (sesión que sigue viva un rato después de eliminarla).
    if (String(errorPedido.message || '').includes('cuenta_cerrada')) {
      return NextResponse.json(
        { error: 'Esta cuenta fue eliminada.', codigo: 'cuenta_cerrada' },
        { status: 403 }
      );
    }
    return NextResponse.json(
      { error: 'No se pudo crear el pedido.', detalle: errorPedido.message },
      { status: 500 }
    );
  }

  // 7. Guardar la "foto" de los productos (nombre y precio de este momento).
  // Todo sale del cálculo del servidor, no del carrito.
  const itemsParaGuardar = calculo.lineas.map((linea) => ({
    pedido_id: pedido.id,
    producto_id: linea.productoId,
    nombre: linea.nombre,
    variante: linea.variante,
    precio: linea.precio,
    cantidad: linea.cantidad,
    foto_url: linea.foto,
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
  // El título, la imagen y el precio que ve la persona en MercadoPago salen
  // del cálculo del servidor: si vinieran del carrito, cualquiera podría poner
  // el nombre y la imagen que quisiera en la pantalla de pago.
  const mpItems = calculo.lineas.map((linea) => {
    const mpItem = {
      id: String(linea.productoId),
      title: linea.nombre + (linea.variante ? ` (${linea.variante})` : ''),
      description: linea.nombre,
      quantity: linea.cantidad,
      unit_price: linea.precio,
      currency_id: 'ARS',
      category_id: 'others',
    };
    // Sin foto no va la clave: nada de picture_url vacío.
    if (linea.foto) mpItem.picture_url = linea.foto;
    return mpItem;
  });

  // Si hay costo de envío, lo sumamos como un item más al pago.
  if (calculo.costoEnvio > 0) {
    mpItems.push({
      title: 'Envío',
      quantity: 1,
      unit_price: calculo.costoEnvio,
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

  // Nombre, apellido y teléfono son los mismos que quedaron en el pedido (paso
  // 4b): nada de volver a leerlos. Con registro por Google puede faltar el
  // apellido; el vacío ya llega como null.
  if (contactoComprador.comprador_nombre) payer.name = contactoComprador.comprador_nombre;
  if (contactoComprador.comprador_apellido) payer.surname = contactoComprador.comprador_apellido;

  // Teléfono ya normalizado a 10 dígitos. Sin area_code: no se separa la
  // característica.
  if (contactoComprador.comprador_telefono) {
    payer.phone = { number: contactoComprador.comprador_telefono };
  }

  // La dirección sólo existe si el método de entrega la pidió: es la fila que
  // se verificó en el paso 3b. El código postal va sólo si es válido (las
  // direcciones viejas pueden no tenerlo): no se inventa.
  const direccionDelPago = pideDireccion ? direccionVerificada : null;
  const calle = direccionDelPago?.calle?.trim();
  const numero = direccionDelPago?.numero?.trim();
  const codigoPostal = codigoPostalValido(direccionDelPago?.codigo_postal)
    ? normalizarCodigoPostal(direccionDelPago.codigo_postal)
    : null;
  if (calle && numero) {
    payer.address = { street_name: calle, street_number: numero };
    if (codigoPostal) payer.address.zip_code = codigoPostal;
  }

  // Nunca queda un link vivo sin fecha de vencimiento: la preferencia se crea
  // CON las cuatro fechas (camposDeVencimiento), y si MercadoPago la rechaza, o
  // la acepta sin devolver el vencimiento, el pedido se cancela en el acto.
  // Un pedido pendiente sin preferencia no se puede pagar, y uno cancelado
  // tampoco: no queda nada colgado esperando.
  async function cancelarPedidoSinLink() {
    const { error } = await admin
      .from('pedidos')
      .update({ estado: 'cancelado', cancelado_motivo: 'pago_vencido', actualizado_en: new Date().toISOString() })
      .eq('id', pedido.id)
      .eq('estado', 'pendiente');
    if (error) console.error(`Pedido ${pedido.id}: no se pudo cancelar después de la falla con MercadoPago —`, error.message);
  }

  const ERROR_MP = 'No se pudo crear el pago en MercadoPago.';

  let mpResponse;
  let mpData;
  try {
    mpResponse = await fetch('https://api.mercadopago.com/checkout/preferences', {
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
        // expires, expiration_date_from, expiration_date_to y date_of_expiration
        // (este último es el del ticket en efectivo).
        ...camposDeVencimiento(venceEnMs, ahoraMs),
      }),
    });
    mpData = await mpResponse.json();
  } catch (err) {
    console.error(`Pedido ${pedido.id}: falló la llamada a MercadoPago para crear la preferencia —`, err?.message || err);
    await cancelarPedidoSinLink();
    return NextResponse.json({ error: ERROR_MP }, { status: 500 });
  }

  if (!mpResponse.ok) {
    console.error(`Pedido ${pedido.id}: MercadoPago rechazó la preferencia (${mpResponse.status}) —`, mpData?.message || mpData?.error || mpData);
    await cancelarPedidoSinLink();
    return NextResponse.json(
      { error: ERROR_MP, detalle: mpData },
      { status: 500 }
    );
  }

  // MercadoPago la aceptó, pero si no devuelve el vencimiento no se puede
  // confiar en que el link venza: se intenta vencerla ya y se cancela el pedido.
  if (mpData?.expires !== true || !mpData?.expiration_date_to) {
    console.error(`Pedido ${pedido.id}: MercadoPago creó la preferencia ${mpData?.id} SIN devolver el vencimiento (expires: ${mpData?.expires}, hasta: ${mpData?.expiration_date_to}); se vence y se cancela el pedido.`);
    if (mpData?.id) await vencerPreferencia(accessToken, mpData.id, `pedido ${pedido.id}`, 'Crear pedido');
    await cancelarPedidoSinLink();
    return NextResponse.json({ error: ERROR_MP }, { status: 500 });
  }

  // Queda en el log (Vercel) lo que MercadoPago devolvió: es la forma de
  // comprobar, con un pedido real, que el link y el ticket llevan fecha.
  console.log(`Pedido ${pedido.id}: preferencia ${mpData.id} vence ${mpData.expiration_date_to}; ticket en efectivo ${mpData.date_of_expiration ?? 'sin dato en la respuesta'}.`);

  // 9. Guardar el id de la preferencia en el pedido (para rastrearlo después) y
  // el link de pago TAL CUAL lo devolvió MercadoPago (init_point, el de
  // producción; nunca sandbox_init_point). Con ese link, Mis pedidos puede
  // volver a abrir el pago mientras no venza (/api/pedidos/[id]/pagar).
  // (La base solo acepta links https: algo distinto se guarda como null, para
  // que no se pierda también mp_preference_id.)
  const linkDePago = typeof mpData.init_point === 'string' && mpData.init_point.startsWith('https://')
    ? mpData.init_point
    : null;
  if (!linkDePago) console.error(`Pedido ${pedido.id}: MercadoPago no devolvió un init_point https (${mpData.init_point}); el pedido queda sin botón "Pagar".`);

  const { error: errorPreferencia } = await admin
    .from('pedidos')
    .update({ mp_preference_id: mpData.id, link_de_pago: linkDePago })
    .eq('id', pedido.id);
  if (errorPreferencia) {
    console.error(`Pedido ${pedido.id}: no se pudo guardar la preferencia ni el link de pago —`, errorPreferencia.message);
  }

  // 10. Devolver el link de pago al checkout para que mande al comprador.
  return NextResponse.json({
    checkout_url: mpData.init_point,
    pedido_id: pedido.id,
  });
}