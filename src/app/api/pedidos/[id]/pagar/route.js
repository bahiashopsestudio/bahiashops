// Devuelve el link para pagar un pedido pendiente (el botón "Pagar" de Mis
// pedidos). El link es el init_point de producción que guardó /api/pedidos/crear
// en pedidos.link_de_pago: el navegador no lo arma ni lo adivina.
//
// Se verifica, en este orden: hay sesión; el pedido es DE QUIEN LO PIDE (uno
// ajeno responde igual que uno inexistente); sigue pendiente y sin ningún pago;
// tiene vencimiento y todavía no pasó; la tienda sigue disponible; y hay un link
// guardado. La regla vive en src/lib/pagarPedido.js.
//
// POST y no GET: pide algo que depende del momento y no tiene que quedar
// guardado en ninguna caché.

import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { getServiceRoleClient } from '@/lib/supabase/admin';
import { evaluarPagoDePedido } from '@/lib/pagarPedido';

export async function POST(request, { params }) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: 'Iniciá sesión.' }, { status: 401 });
  }

  const { id } = await params;
  if (!/^[1-9]\d*$/.test(String(id))) {
    return NextResponse.json({ error: 'No encontramos ese pedido.', codigo: 'NO_EXISTE' }, { status: 404 });
  }

  const admin = getServiceRoleClient();

  const { data: pedido, error: errorPedido } = await admin
    .from('pedidos')
    .select('id, comprador_id, vendedor_id, estado, cancelado_motivo, vence_en, mp_payment_id, link_de_pago')
    .eq('id', Number(id))
    .maybeSingle();
  if (errorPedido) {
    console.error(`Pagar pedido ${id}: no se pudo leer el pedido —`, errorPedido.message);
    return NextResponse.json({ error: 'No pudimos abrir el pago. Probá de nuevo en un rato.' }, { status: 500 });
  }

  // La tienda solo se lee si el pedido es de esta persona: no hace falta
  // consultar nada de un pedido ajeno.
  let vendedor = null;
  if (pedido && String(pedido.comprador_id) === String(user.id)) {
    const { data, error: errorVendedor } = await admin
      .from('vendedores')
      .select('id, bloqueado, estado_validacion')
      .eq('id', pedido.vendedor_id)
      .maybeSingle();
    if (errorVendedor) {
      console.error(`Pagar pedido ${id}: no se pudo leer la tienda —`, errorVendedor.message);
      return NextResponse.json({ error: 'No pudimos abrir el pago. Probá de nuevo en un rato.' }, { status: 500 });
    }
    vendedor = data;
  }

  const veredicto = evaluarPagoDePedido({ pedido, vendedor, usuarioId: user.id });

  if (!veredicto.ok) {
    if (veredicto.status !== 404) {
      console.warn(`Pagar pedido ${id}: no se abre el pago (${veredicto.codigo}).`);
    }
    return NextResponse.json({ error: veredicto.error, codigo: veredicto.codigo }, { status: veredicto.status });
  }

  return NextResponse.json({ url: veredicto.url });
}
