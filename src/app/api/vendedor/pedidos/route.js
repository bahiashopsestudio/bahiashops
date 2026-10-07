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
import { pedidoTuvoPago, pedidoParaLaTienda } from '@/lib/pedidos';

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

  // Los pedidos cuyo link de pago venció sin pagarse se cancelan ACÁ, al abrir
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
      comision_plataforma, turno_preferido, franja_horaria, creado_en, actualizado_en,
      vence_en, cancelado_motivo,
      comprador_id,
      items:pedido_items ( id, nombre, variante, cantidad, precio, foto_url )
    `)
    .eq('vendedor_id', vendedor.id)
    .order('creado_en', { ascending: false });

  if (error) {
    console.error('No se pudieron leer los pedidos', vendedor.id, error.message);
    return NextResponse.json({ error: 'No se pudieron cargar los pedidos.' }, { status: 500 });
  }

  // Los datos de contacto, SOLO de los pedidos que se pagaron (una segunda
  // lectura, por la lista de ids): los de un pedido sin pagar ni se leen.
  const idsPagados = (pedidos || []).filter(pedidoTuvoPago).map((p) => p.id);
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
  }

  // El apodo de cada comprador, para la lista. Va en una segunda consulta por
  // la lista de ids y no embebido, para no depender de que exista una
  // relación declarada entre pedidos.comprador_id y usuarios. Si falla, la
  // pantalla muestra "Comprador": no es motivo para no mostrar los pedidos.
  const idsCompradores = [...new Set((pedidos || []).map((p) => p.comprador_id).filter(Boolean))];
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
  const respuesta = (pedidos || []).map(({ comprador_id, ...pedido }) => ({
    ...pedidoParaLaTienda({ ...pedido, ...(contactos.get(pedido.id) || {}) }),
    comprador_apodo: apodos.get(comprador_id) || null,
    comprador_eliminado: eliminados.has(comprador_id),
  }));

  return NextResponse.json({
    vendedor: { id: vendedor.id, nombre_negocio: vendedor.nombre_negocio },
    pedidos: respuesta,
  });
}
