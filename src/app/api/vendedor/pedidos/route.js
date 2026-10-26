// Los pedidos de una tienda, para el panel del vendedor.
//
// Por qué existe esta ruta y no un puñado de policies: la pantalla necesita
// tres tablas que el vendedor no puede leer desde el navegador —'pedidos' sólo
// la ve el comprador, 'pedido_items' cuelga de ella, y 'direcciones' es del
// comprador—. Resolverlo con RLS eran tres policies nuevas, y la de escritura
// además no alcanzaba: RLS decide qué filas se tocan, no a qué valor, así que
// un vendedor podría marcarse un pedido como 'pagado'. Acá el permiso se
// verifica una vez y la regla de negocio queda en un archivo que se puede leer.
//
// El vendedor sale de la sesión, nunca del body: no hay forma de pedir los
// pedidos de otra tienda.

import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { getServiceRoleClient } from '@/lib/supabase/admin';
import { pedidoTuvoPago, pedidoParaLaTienda, pestanaDePedido, esCarritoAbandonado } from '@/lib/pedidos';

export async function GET() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: 'Iniciá sesión.' }, { status: 401 });
  }

  const admin = getServiceRoleClient();

  const { data: vendedor, error: errorVendedor } = await admin
    .from('vendedores')
    .select('id, nombre_negocio')
    .eq('usuario_id', user.id)
    .maybeSingle();

  if (errorVendedor) {
    console.error('No se pudo leer el vendedor', user.id, errorVendedor.message);
    return NextResponse.json({ error: 'No se pudieron cargar los pedidos.' }, { status: 500 });
  }

  if (!vendedor) {
    return NextResponse.json({ error: 'No encontramos tu cuenta de vendedor.' }, { status: 403 });
  }

  // Los pedidos cuyo link o cupón venció sin pagarse se cancelan ACÁ, al abrir
  // el panel: no hay tarea programada. Es mejor esfuerzo: si falla, la lista
  // sale igual (con el pedido todavía pendiente) y se reintenta la próxima vez.
  const { error: errorVencidos } = await admin.rpc('rpc_cancelar_pedidos_vencidos', { p_vendedor_id: vendedor.id });
  if (errorVencidos) {
    console.error('No se pudieron cancelar los pedidos vencidos', vendedor.id, errorVencidos.message);
  }

  // Sólo los suyos. El filtro va acá, no en el cliente.
  //
  // Esta primera lectura NO trae ningún dato de contacto de quien compra: la
  // tienda los recibe recién cuando el pedido se pagó (ver pedidoTuvoPago en
  // src/lib/pedidos.js). Antes del pago, solo ve el apodo.
  const { data: pedidos, error } = await admin
    .from('pedidos')
    .select(`
      id, estado, metodo_envio, zona_envio, subtotal_productos, costo_envio, total,
      envio_empresa, envio_empresa_otra, envio_seguimiento,
      comision_plataforma, origen, comision_bp, comision_motivo, turno_preferido, franja_horaria, creado_en, actualizado_en, entregado_at, pagado_en,
      vence_en, efectivo_vence_en, cancelado_motivo, mp_payment_id,
      recordatorio_enviado_en,
      comprador_id,
      items:pedido_items ( id, nombre, variante, cantidad, precio, foto_url )
    `)
    .eq('vendedor_id', vendedor.id)
    .order('creado_en', { ascending: false });

  if (error) {
    console.error('No se pudieron leer los pedidos', vendedor.id, error.message);
    return NextResponse.json({ error: 'No se pudieron cargar los pedidos.' }, { status: 500 });
  }

  // Una venta existe solo cuando se paga. La tienda ve las ventas y los pagos en
  // efectivo en proceso con el cupón vigente (ventas en curso); un pedido que
  // nunca se pagó, o un cupón que venció sin pagarse, es un carrito abandonado y
  // no es una venta: va aparte, a la pestaña de carritos abandonados, solo con
  // el apodo. El filtro va acá, en el servidor (pestanaDePedido y
  // esCarritoAbandonado en src/lib/pedidos.js dicen qué es cada uno).
  const ahoraMs = Date.now();
  const ventas = [];
  const carritos = [];
  for (const p of pedidos || []) {
    if (pestanaDePedido(p, ahoraMs) !== null) ventas.push(p);
    else if (esCarritoAbandonado(p, ahoraMs)) carritos.push(p);
  }

  // Los datos de contacto, SOLO de los pedidos que se pagaron (una segunda
  // lectura, por la lista de ids): los de un pedido sin pagar ni se leen.
  const idsPagados = ventas.filter(pedidoTuvoPago).map((p) => p.id);
  const contactos = new Map();

  if (idsPagados.length > 0) {
    const { data: filasContacto, error: errorContacto } = await admin
      .from('pedidos')
      .select(`
        id, comprador_nombre, comprador_apellido, comprador_telefono, direccion_copia,
        direccion:direcciones ( calle, numero, piso_depto, telefono, barrio_id )
      `)
      .in('id', idsPagados)
      .eq('vendedor_id', vendedor.id);

    if (errorContacto) {
      // Sin esto no se puede mostrar un pedido pagado completo: mejor un error
      // que una lista a medias que parezca que la persona no dejó datos.
      console.error('No se pudieron leer los datos de contacto de los pedidos pagados', vendedor.id, errorContacto.message);
      return NextResponse.json({ error: 'No se pudieron cargar los pedidos.' }, { status: 500 });
    }
    for (const { id, ...contacto } of filasContacto || []) contactos.set(id, contacto);

    // El nombre del barrio, para el envío de la tienda: la dirección guarda
    // solo el id. Primero la copia congelada en el pedido, después la
    // embebida. Si la lectura falla, el pedido sale sin barrio (no es motivo
    // para no mostrarlo).
    const idsBarrios = [...new Set([...contactos.values()]
      .map((c) => c.direccion_copia?.barrio_id ?? c.direccion?.barrio_id)
      .filter((b) => b !== null && b !== undefined))];
    if (idsBarrios.length > 0) {
      const { data: barrios, error: errorBarrios } = await admin
        .from('barrios')
        .select('id, nombre')
        .in('id', idsBarrios);
      if (errorBarrios) {
        console.error('No se pudieron leer los barrios de los pedidos', vendedor.id, errorBarrios.message);
      }
      const nombres = new Map((barrios || []).map((b) => [b.id, b.nombre]));
      for (const contacto of contactos.values()) {
        const barrioId = contacto.direccion_copia?.barrio_id ?? contacto.direccion?.barrio_id;
        contacto.barrio_nombre = nombres.get(barrioId) || null;
      }
    }
  }

  // El apodo de cada comprador, para la lista. Va en una segunda consulta por
  // la lista de ids y no embebido, para no depender de que exista una
  // relación declarada entre pedidos.comprador_id y usuarios. Si falla, la
  // pantalla muestra "Comprador": no es motivo para no mostrar los pedidos.
  const idsCompradores = [...new Set([...ventas, ...carritos].map((p) => p.comprador_id).filter(Boolean))];
  const apodos = new Map();
  // Las cuentas eliminadas: en sus pedidos la persona figura como "Cuenta
  // eliminada" (sus datos ya no existen, ni en el pedido).
  const eliminados = new Set();

  if (idsCompradores.length > 0) {
    const { data: compradores, error: errorApodos } = await admin
      .from('usuarios')
      .select('id, nombre_usuario, cerrada_en')
      .in('id', idsCompradores);

    if (errorApodos) {
      console.error('No se pudieron leer los apodos de los compradores', vendedor.id, errorApodos.message);
    }
    for (const c of compradores || []) {
      apodos.set(c.id, c.nombre_usuario || null);
      if (c.cerrada_en) eliminados.add(c.id);
    }
  }

  // Del comprador viaja siempre su apodo. Lo que quedó congelado en el pedido
  // (nombre, apellido, teléfono y, si el método pedía dirección,
  // direccion_copia) y las columnas de la dirección embebida viajan SOLO si el
  // pedido se pagó. pedidoParaLaTienda es la última barrera: aunque algo de
  // arriba cambie, un pedido sin pagar sale con esos campos en null. El
  // comprador_id no sale de acá: sólo se usó para buscar el apodo.
  const respuesta = ventas.map((venta) => {
    // mp_payment_id se usa solo para decidir qué es una venta: no viaja. Por
    // eso la pestaña se calcula acá, con el pedido completo (la pantalla no
    // puede: le falta mp_payment_id; ver pestanaEnElPanel).
    const { comprador_id, mp_payment_id, ...pedido } = venta;
    return {
      ...pedidoParaLaTienda({ ...pedido, ...(contactos.get(pedido.id) || {}) }),
      pestana: pestanaDePedido(venta, ahoraMs),
      comprador_apodo: apodos.get(comprador_id) || null,
      comprador_eliminado: eliminados.has(comprador_id),
    };
  });

  // Los carritos abandonados: nunca se pagaron, así que sus datos de contacto
  // ni se leyeron (pedidoParaLaTienda los deja en null igual). Solo el apodo.
  const carritosRespuesta = carritos.map((carrito) => {
    const { comprador_id, mp_payment_id, ...pedido } = carrito;
    return {
      ...pedidoParaLaTienda(pedido),
      pestana: 'carritos',
      comprador_apodo: apodos.get(comprador_id) || null,
      comprador_eliminado: eliminados.has(comprador_id),
    };
  });

  // ¿La tienda tiene una cuenta de MercadoPago conectada? Sin cuenta nadie puede
  // pagarle, así que "Recordarle" un carrito no sirve: la pantalla muestra un
  // cartel en vez de mandar el mail (la ruta de recordar lo vuelve a verificar).
  // Se mira la fila de mercadopago_cuentas y no vendedores.mercadopago_conectado:
  // la fila (los tokens) es lo que de verdad permite cobrar. Si la lectura
  // falla, va null y la pantalla deja intentar: decide la ruta de recordar.
  const { data: cuentaMp, error: errorCuentaMp } = await admin
    .from('mercadopago_cuentas')
    .select('vendedor_id')
    .eq('vendedor_id', vendedor.id)
    .maybeSingle();
  if (errorCuentaMp) {
    console.error('No se pudo leer la cuenta de MercadoPago de la tienda', vendedor.id, errorCuentaMp.message);
  }

  return NextResponse.json({
    vendedor: { id: vendedor.id, nombre_negocio: vendedor.nombre_negocio },
    mp_conectado: errorCuentaMp ? null : !!cuentaMp,
    pedidos: [...respuesta, ...carritosRespuesta],
  });
}
