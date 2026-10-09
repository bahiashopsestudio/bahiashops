// «Pagar ahora» (Mis pedidos): un link de pago NUEVO para un pedido que ya tiene
// un cupón en efectivo, para quien prefiere pagar con tarjeta o dinero en
// cuenta. Cada vez que se aprieta se arma una preferencia nueva en MercadoPago,
// con los productos y el total del pedido, que dura 2 horas y nunca pasa del
// vencimiento del cupón. La regla vive en src/lib/pagarAhora.js.
//
// Se verifica, en este orden: hay sesión; el pedido es DE QUIEN LO PIDE (uno
// ajeno responde igual que uno inexistente); sigue pendiente, con un cupón
// vigente; la tienda sigue disponible y con la misma cuenta de MercadoPago; y
// los productos guardados suman el total.
//
// POST y no GET: crea algo en MercadoPago y no tiene que quedar en ninguna
// caché.

import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { getServiceRoleClient } from '@/lib/supabase/admin';
import { getCuentaValida } from '@/lib/mercadopago/tokens';
import { vencerPreferencia } from '@/lib/mercadopago/preferencias';
import { evaluarPagarAhora, armarPreferenciaNueva } from '@/lib/pagarAhora';
import { urlParaMercadoPago } from '@/lib/sitio';

const ERROR_GENERICO = 'No pudimos abrir el pago. Probá de nuevo en un rato.';

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
    .select('id, comprador_id, vendedor_id, estado, cancelado_motivo, total, costo_envio, comision_plataforma, mp_payment_id, efectivo_vence_en, mp_user_id_cobro, comprador_nombre, comprador_apellido, comprador_telefono')
    .eq('id', Number(id))
    .maybeSingle();
  if (errorPedido) {
    console.error(`Pagar ahora, pedido ${id}: no se pudo leer el pedido —`, errorPedido.message);
    return NextResponse.json({ error: ERROR_GENERICO }, { status: 500 });
  }

  // La tienda y su cuenta de MercadoPago solo se leen si el pedido es de esta
  // persona: no hace falta consultar nada de un pedido ajeno.
  let vendedor = null;
  let cuentaMp = null;
  if (pedido && String(pedido.comprador_id) === String(user.id)) {
    const { data, error: errorVendedor } = await admin
      .from('vendedores')
      .select('id, bloqueado, estado_validacion')
      .eq('id', pedido.vendedor_id)
      .maybeSingle();
    const { data: cuenta, error: errorCuenta } = await admin
      .from('mercadopago_cuentas')
      .select('mp_user_id')
      .eq('vendedor_id', pedido.vendedor_id)
      .maybeSingle();
    if (errorVendedor || errorCuenta) {
      console.error(`Pagar ahora, pedido ${id}: no se pudo leer la tienda o su cuenta —`, (errorVendedor || errorCuenta).message);
      return NextResponse.json({ error: ERROR_GENERICO }, { status: 500 });
    }
    vendedor = data;
    cuentaMp = cuenta;
  }

  const veredicto = evaluarPagarAhora({ pedido, vendedor, cuentaMp, usuarioId: user.id });
  if (!veredicto.ok) {
    if (veredicto.status !== 404) {
      console.warn(`Pagar ahora, pedido ${id}: no se abre el pago (${veredicto.codigo}).`);
    }
    return NextResponse.json({ error: veredicto.error, codigo: veredicto.codigo }, { status: veredicto.status });
  }

  const { data: items, error: errorItems } = await admin
    .from('pedido_items')
    .select('producto_id, nombre, variante, precio, cantidad, foto_url')
    .eq('pedido_id', pedido.id);
  if (errorItems) {
    console.error(`Pagar ahora, pedido ${id}: no se pudieron leer los productos —`, errorItems.message);
    return NextResponse.json({ error: ERROR_GENERICO }, { status: 500 });
  }

  // El sitio publicado, o el túnel hacia la máquina de quien desarrolla
  // (src/lib/sitio.js: solo fuera de producción).
  const urlMp = urlParaMercadoPago();
  const armada = armarPreferenciaNueva({
    pedido,
    items,
    emailComprador: user.email,
    sitioUrl: urlMp,
    notificationUrl: `${urlMp}/api/mercadopago/webhook`,
    venceLinkMs: veredicto.venceLinkMs,
  });
  if (!armada.ok) {
    console.error(`Pagar ahora, pedido ${id}: no se puede armar el pago (${armada.motivo}).`);
    return NextResponse.json({ error: ERROR_GENERICO }, { status: 409 });
  }

  let accessToken;
  try {
    ({ accessToken } = await getCuentaValida(pedido.vendedor_id, admin));
  } catch (err) {
    console.error(`Pagar ahora, pedido ${id}: no hay token de MercadoPago de la tienda —`, err?.message || err);
    return NextResponse.json({ error: 'La tienda no puede recibir pagos por ahora.' }, { status: 409 });
  }

  let respuesta;
  let datos;
  try {
    respuesta = await fetch('https://api.mercadopago.com/checkout/preferences', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${accessToken}` },
      body: JSON.stringify(armada.cuerpo),
    });
    datos = await respuesta.json();
  } catch (err) {
    console.error(`Pagar ahora, pedido ${id}: falló la llamada a MercadoPago —`, err?.message || err);
    return NextResponse.json({ error: ERROR_GENERICO }, { status: 502 });
  }

  if (!respuesta.ok) {
    console.error(`Pagar ahora, pedido ${id}: MercadoPago rechazó la preferencia (${respuesta.status}) —`, datos?.message || datos?.error || datos);
    return NextResponse.json({ error: ERROR_GENERICO }, { status: 502 });
  }

  // Un link sin vencimiento no se entrega: se intenta vencer ya.
  const link = typeof datos?.init_point === 'string' && datos.init_point.startsWith('https://') ? datos.init_point : null;
  if (datos?.expires !== true || !datos?.expiration_date_to || !link) {
    console.error(`Pagar ahora, pedido ${id}: MercadoPago creó la preferencia ${datos?.id} sin vencimiento o sin link (expires: ${datos?.expires}); no se entrega.`);
    if (datos?.id) await vencerPreferencia(accessToken, datos.id, `pedido ${id}`, 'Pagar ahora');
    return NextResponse.json({ error: ERROR_GENERICO }, { status: 502 });
  }

  console.log(`Pagar ahora, pedido ${id}: preferencia ${datos.id} vence ${datos.expiration_date_to}.`);
  return NextResponse.json({ url: link });
}
