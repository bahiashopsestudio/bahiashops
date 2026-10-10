// El cupón en efectivo de un pedido, para la pantalla a la que se vuelve de
// MercadoPago (/compra/pendiente): si el pago es un cupón sin pagar (Rapipago,
// Pago Fácil), hasta cuándo vale y la URL del cupón. La URL no se guarda en la
// base: se le pregunta a MercadoPago cada vez.
//
// Por qué se le pregunta a MercadoPago y no solo a la base: cuando la persona
// vuelve, el webhook puede no haber llegado todavía. Entonces el pago sale del
// ?pago= de la vuelta (MercadoPago lo agrega como payment_id), y se acepta solo
// si es de este pedido (external_reference) y se puede leer con el token de la
// tienda del pedido. Si el webhook ya guardó un pago, manda ese.
//
// Solo lee: no escribe nada en la base ni en MercadoPago. Un pedido ajeno
// responde igual que uno inexistente.

import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { getServiceRoleClient } from '@/lib/supabase/admin';
import { getCuentaValida } from '@/lib/mercadopago/tokens';
import { pedidoTienePago } from '@/lib/vencimientoPago';
import { cuponDelPago, cuponDelPedido } from '@/lib/cuponEfectivo';

const NO_EXISTE = { error: 'No encontramos ese pedido.' };

export async function GET(request, { params }) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: 'Iniciá sesión.' }, { status: 401 });
  }

  const { id } = await params;
  if (!/^[1-9]\d*$/.test(String(id))) {
    return NextResponse.json(NO_EXISTE, { status: 404 });
  }

  const admin = getServiceRoleClient();

  const { data: pedido, error } = await admin
    .from('pedidos')
    .select('id, comprador_id, vendedor_id, estado, creado_en, mp_payment_id, efectivo_vence_en')
    .eq('id', Number(id))
    .maybeSingle();
  if (error) {
    console.error(`Cupón, pedido ${id}: no se pudo leer el pedido —`, error.message);
    return NextResponse.json({ error: 'No se pudo leer el pedido.' }, { status: 500 });
  }
  if (!pedido || String(pedido.comprador_id) !== String(user.id)) {
    return NextResponse.json(NO_EXISTE, { status: 404 });
  }

  // Solo un pedido que todavía no se pagó puede tener un cupón por pagar.
  if (pedido.estado !== 'pendiente') {
    return NextResponse.json({ efectivo: false });
  }

  // El pago guardado por el webhook manda; si todavía no llegó, el de la vuelta.
  const deLaVuelta = new URL(request.url).searchParams.get('pago') ?? '';
  const pagoId = pedidoTienePago(pedido)
    ? String(pedido.mp_payment_id).trim()
    : (/^\d{1,20}$/.test(deLaVuelta) ? deLaVuelta : null);
  if (!pagoId) {
    return NextResponse.json(cuponDelPedido(pedido));
  }

  try {
    const { accessToken } = await getCuentaValida(pedido.vendedor_id, admin);
    const res = await fetch(`https://api.mercadopago.com/v1/payments/${encodeURIComponent(pagoId)}`, {
      headers: { Authorization: `Bearer ${accessToken}` },
      signal: AbortSignal.timeout(8000),
    });
    if (res.ok) {
      const cupon = cuponDelPago(await res.json(), pedido);
      if (cupon) return NextResponse.json(cupon);
      console.warn(`Cupón, pedido ${id}: el pago ${pagoId} no es de este pedido.`);
    } else {
      console.warn(`Cupón, pedido ${id}: MercadoPago respondió ${res.status} al leer el pago ${pagoId}.`);
    }
  } catch (err) {
    console.warn(`Cupón, pedido ${id}: no se pudo leer el pago ${pagoId} —`, err?.message || err);
  }

  // Sin respuesta de MercadoPago: lo que sabe la base (sin la URL del cupón).
  return NextResponse.json(cuponDelPedido(pedido));
}
