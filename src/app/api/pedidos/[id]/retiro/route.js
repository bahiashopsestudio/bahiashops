// Dónde se retira un pedido, para Mis pedidos.
//
// La página de la tienda ya no muestra su dirección: el sitio se la muestra a
// quien tiene un pedido de Retiro pagado con ella, y solo en ese pedido. Se lee
// acá, con service role, y se pide recién cuando la persona despliega el
// pedido. (La base igual deja leer vendedores.direccion con la clave pública:
// esta ruta no la vuelve privada.)
//
// Se verifica, en este orden: hay sesión; el pedido es DE QUIEN LO PIDE (uno
// ajeno responde igual que uno inexistente); es de Retiro; está pagado, de
// 'pagado' a 'entregado' (no reembolsado). Responde { estado } con:
//   'ok'            y `direccion`: "Colón 123, Centro" (direccionDeRetiro)
//   'por_whatsapp'  la tienda no muestra su dirección (o no la cargó): la pasa
//                   por WhatsApp (RETIRO_POR_WHATSAPP)
//   'cerrada'       la tienda cerró
//
// La dirección no va a los logs.

import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { getServiceRoleClient } from '@/lib/supabase/admin';
import { ESTADOS_PARA_RECLAMAR, formaDeEntrega } from '@/lib/pedidos';
import { direccionDeRetiro } from '@/lib/metodosEntrega';

const ERROR_GENERICO = 'No pudimos traer la dirección de retiro. Probá de nuevo en un rato.';
const SIN_CACHE = { 'Cache-Control': 'no-store' };

function responder(cuerpo, status = 200) {
  return NextResponse.json(cuerpo, { status, headers: SIN_CACHE });
}

export async function GET(request, { params }) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return responder({ error: 'Iniciá sesión.' }, 401);

  const { id } = await params;
  if (!/^[1-9]\d*$/.test(String(id))) return responder({ error: 'No encontramos ese pedido.' }, 404);

  const admin = getServiceRoleClient();

  const { data: pedido, error: errorPedido } = await admin
    .from('pedidos')
    .select('id, comprador_id, vendedor_id, estado, metodo_envio')
    .eq('id', Number(id))
    .maybeSingle();
  if (errorPedido) {
    console.error(`Retiro, pedido ${id}: no se pudo leer el pedido —`, errorPedido.message);
    return responder({ error: ERROR_GENERICO }, 500);
  }
  if (!pedido || String(pedido.comprador_id) !== String(user.id)) {
    return responder({ error: 'No encontramos ese pedido.' }, 404);
  }
  if (formaDeEntrega(pedido.metodo_envio) !== 'retiro') {
    return responder({ error: 'Este pedido no es de retiro.' }, 409);
  }
  if (!ESTADOS_PARA_RECLAMAR.includes(pedido.estado)) {
    return responder({ error: 'Este pedido no está pagado.' }, 409);
  }

  const { data: vendedor, error: errorVendedor } = await admin
    .from('vendedores')
    .select('direccion_visible, direccion, cerrada_en, barrio:barrios(nombre)')
    .eq('id', pedido.vendedor_id)
    .maybeSingle();
  if (errorVendedor) {
    console.error(`Retiro, pedido ${id}: no se pudo leer la tienda —`, errorVendedor.message);
    return responder({ error: ERROR_GENERICO }, 500);
  }

  // Una tienda borrada (sin fila) es una tienda cerrada.
  if (!vendedor || vendedor.cerrada_en) return responder({ estado: 'cerrada' });

  const direccion = direccionDeRetiro(vendedor);
  if (!direccion) return responder({ estado: 'por_whatsapp' });
  return responder({ estado: 'ok', direccion });
}
