// El WhatsApp de la tienda, para "Reclamar" (Mis pedidos).
//
// vendedores.telefono_contacto no se puede leer desde el navegador (nadie tiene
// SELECT sobre esa columna). Esta ruta se lo da SOLO a quien tiene un pedido
// pagado con esa tienda, y solo el de ese pedido. Se pide recién cuando la
// persona aprieta "Reclamar". Bahía Shops no registra el reclamo: lo único que
// hace es devolver el número para armar el link de WhatsApp.
//
// Se verifica, en este orden: hay sesión; el pedido es DE QUIEN LO PIDE (uno
// ajeno responde igual que uno inexistente); está pagado, de 'pagado' a
// 'entregado' (no reembolsado). Responde { estado } con:
//   'ok'            y `telefono`: los 10 dígitos (característica + número)
//   'sin_telefono'  la tienda no cargó un WhatsApp (o no se puede armar el link)
//   'cerrada'       la tienda cerró
//
// El número no va a los logs.

import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { getServiceRoleClient } from '@/lib/supabase/admin';
import { ESTADOS_PARA_RECLAMAR } from '@/lib/pedidos';
import { normalizarTelefonoAR } from '@/lib/telefono';

const ERROR_GENERICO = 'No pudimos traer el WhatsApp de la tienda. Probá de nuevo en un rato.';
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
    .select('id, comprador_id, vendedor_id, estado')
    .eq('id', Number(id))
    .maybeSingle();
  if (errorPedido) {
    console.error(`WhatsApp de la tienda, pedido ${id}: no se pudo leer el pedido —`, errorPedido.message);
    return responder({ error: ERROR_GENERICO }, 500);
  }
  if (!pedido || String(pedido.comprador_id) !== String(user.id)) {
    return responder({ error: 'No encontramos ese pedido.' }, 404);
  }
  if (!ESTADOS_PARA_RECLAMAR.includes(pedido.estado)) {
    return responder({ error: 'Este pedido no está pagado: no hay nada para reclamarle a la tienda.' }, 409);
  }

  const { data: vendedor, error: errorVendedor } = await admin
    .from('vendedores')
    .select('telefono_contacto, cerrada_en')
    .eq('id', pedido.vendedor_id)
    .maybeSingle();
  if (errorVendedor) {
    console.error(`WhatsApp de la tienda, pedido ${id}: no se pudo leer la tienda —`, errorVendedor.message);
    return responder({ error: ERROR_GENERICO }, 500);
  }

  // Una tienda borrada (sin fila) es una tienda cerrada.
  if (!vendedor || vendedor.cerrada_en) return responder({ estado: 'cerrada' });

  const telefono = normalizarTelefonoAR(vendedor.telefono_contacto);
  if (!telefono) {
    if (vendedor.telefono_contacto) {
      console.warn(`WhatsApp de la tienda, pedido ${id}: el teléfono de la tienda ${pedido.vendedor_id} no se puede convertir en un link.`);
    }
    return responder({ estado: 'sin_telefono' });
  }

  return responder({ estado: 'ok', telefono });
}
