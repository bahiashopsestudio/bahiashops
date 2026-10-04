// Corregir la empresa y el número de seguimiento de un pedido por correo que
// ya se despachó. No cambia el estado ni vuelve a mandar el mail de despacho:
// quien compra ve el dato nuevo en Mis pedidos.
//
// Lo que se valida, en este orden: hay sesión, quien llama es un vendedor, el
// pedido es SUYO, es por correo y ya está despachado. Un pedido ajeno se
// responde igual que uno inexistente.

import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { getServiceRoleClient } from '@/lib/supabase/admin';
import { tipoEntregaDe, validarSeguimiento } from '@/lib/metodosEntrega';

export async function POST(request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Iniciá sesión.' }, { status: 401 });

  const body = await request.json().catch(() => ({}));
  const pedidoId = Number(body.pedido_id);
  if (!Number.isInteger(pedidoId) || pedidoId <= 0) {
    return NextResponse.json({ error: 'Falta pedido_id.' }, { status: 400 });
  }

  const admin = getServiceRoleClient();

  const { data: vendedor, error: errorVendedor } = await admin
    .from('vendedores')
    .select('id')
    .eq('usuario_id', user.id)
    .maybeSingle();
  if (errorVendedor) {
    console.error('Seguimiento: no se pudo leer el vendedor', user.id, errorVendedor.message);
    return NextResponse.json({ error: 'No se pudo guardar el seguimiento.' }, { status: 500 });
  }
  if (!vendedor) return NextResponse.json({ error: 'No encontramos tu cuenta de vendedor.' }, { status: 403 });

  const { data: pedido, error: errorPedido } = await admin
    .from('pedidos')
    .select('id, estado, vendedor_id, metodo_envio')
    .eq('id', pedidoId)
    .maybeSingle();
  if (errorPedido) {
    console.error('Seguimiento: no se pudo leer el pedido', pedidoId, errorPedido.message);
    return NextResponse.json({ error: 'No se pudo guardar el seguimiento.' }, { status: 500 });
  }
  if (!pedido || pedido.vendedor_id !== vendedor.id) {
    return NextResponse.json({ error: 'No encontramos ese pedido.' }, { status: 404 });
  }
  if (tipoEntregaDe(pedido.metodo_envio) !== 'correo' || pedido.estado !== 'despachado') {
    return NextResponse.json({ error: 'Solo se corrige el seguimiento de un pedido por correo ya despachado.' }, { status: 409 });
  }

  const seguimiento = validarSeguimiento(body);
  if (!seguimiento.ok) return NextResponse.json({ error: seguimiento.error }, { status: 400 });

  const { data: actualizado, error: errorUpdate } = await admin
    .from('pedidos')
    .update(seguimiento.campos)
    .eq('id', pedidoId)
    .eq('vendedor_id', vendedor.id)
    .eq('estado', 'despachado')
    .select('id, envio_empresa, envio_empresa_otra, envio_seguimiento')
    .maybeSingle();
  if (errorUpdate || !actualizado) {
    console.error('Seguimiento: no se pudo guardar', pedidoId, errorUpdate?.message);
    return NextResponse.json({ error: 'No se pudo guardar el seguimiento.' }, { status: 500 });
  }

  return NextResponse.json({ pedido: actualizado });
}
