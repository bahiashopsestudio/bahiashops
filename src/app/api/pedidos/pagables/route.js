// Qué pedidos pendientes de quien tiene la sesión se pueden pagar AHORA: la
// lista que usa Mis pedidos para decidir en cuáles mostrar el botón "Pagar".
//
// La decisión es la misma que toma /api/pedidos/[id]/pagar al apretar el botón
// (src/lib/pagarPedido.js), y se toma acá, en el servidor: el navegador no puede
// saber si la tienda cambió de cuenta de MercadoPago, y no tiene por qué
// conocer ni el link ni la cuenta que cobra. Devuelve solo los ids.
//
// Solo se miran los pedidos de quien pide (el id sale de la sesión, nunca de un
// parámetro) y los que están pendientes.

import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { getServiceRoleClient } from '@/lib/supabase/admin';
import { evaluarPagoDePedido } from '@/lib/pagarPedido';

export async function GET() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: 'Iniciá sesión.' }, { status: 401 });
  }

  const admin = getServiceRoleClient();

  const { data: pedidos, error } = await admin
    .from('pedidos')
    .select('id, comprador_id, vendedor_id, estado, cancelado_motivo, vence_en, mp_payment_id, link_de_pago, mp_user_id_cobro')
    .eq('comprador_id', user.id)
    .eq('estado', 'pendiente');
  if (error) {
    console.error('Pedidos pagables: no se pudieron leer los pedidos —', error.message);
    return NextResponse.json({ error: 'No pudimos revisar tus pedidos.' }, { status: 500 });
  }
  if (!pedidos || pedidos.length === 0) {
    return NextResponse.json({ ids: [] });
  }

  const tiendas = [...new Set(pedidos.map((p) => p.vendedor_id))];

  const { data: vendedores, error: errorVendedores } = await admin
    .from('vendedores')
    .select('id, bloqueado, estado_validacion')
    .in('id', tiendas);
  const { data: cuentas, error: errorCuentas } = await admin
    .from('mercadopago_cuentas')
    .select('vendedor_id, mp_user_id')
    .in('vendedor_id', tiendas);
  if (errorVendedores || errorCuentas) {
    console.error('Pedidos pagables: no se pudieron leer las tiendas —', (errorVendedores || errorCuentas).message);
    return NextResponse.json({ error: 'No pudimos revisar tus pedidos.' }, { status: 500 });
  }

  const ids = pedidos
    .filter((pedido) => evaluarPagoDePedido({
      pedido,
      vendedor: (vendedores || []).find((v) => v.id === pedido.vendedor_id) || null,
      cuentaMp: (cuentas || []).find((c) => c.vendedor_id === pedido.vendedor_id) || null,
      usuarioId: user.id,
    }).ok)
    .map((p) => p.id);

  return NextResponse.json({ ids });
}
