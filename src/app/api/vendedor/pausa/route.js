// Pausar y reactivar la tienda de quien tiene la sesión.
//
//   GET     el estado: { pausada, pausada_en, mensaje_pausa, ... }
//   POST    pausar, con { mensaje } opcional (hasta 200 caracteres)
//   PATCH   cambiar el mensaje, solo con la tienda pausada
//   DELETE  reactivar
//
// La tienda sale de la sesión, nunca del cuerpo: no hay forma de pausar una
// tienda ajena. Escribe con service_role: el navegador no puede tocar
// pausada_en ni mensaje_pausa (un disparador de la migración 030 lo rechaza).
// La pausa la decide solo el vendedor: el admin no tiene una ruta para esto.
//
// Pausar NO toca los pedidos (los que están en curso se siguen entregando), ni
// los links de pago (vencen solos), ni MercadoPago (queda conectado).

import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { getServiceRoleClient } from '@/lib/supabase/admin';
import { getValidAccessToken } from '@/lib/mercadopago/tokens';
import { validarMensajePausa, mpNecesitaReconectar, ESTADOS_PARA_ENTREGAR } from '@/lib/pausaTienda';
import { enviarMailPausa } from '@/lib/mailsPausa';

const NO_SE_PUDO = 'No pudimos guardar el cambio. Probá de nuevo en un momento.';

// La sesión y su tienda. Devuelve { user, vendedor, admin } o { respuesta }.
async function tiendaDeLaSesion() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { respuesta: NextResponse.json({ error: 'Iniciá sesión.' }, { status: 401 }) };

  const admin = getServiceRoleClient();
  const { data: vendedor, error } = await admin
    .from('vendedores')
    .select('id, nombre_negocio, pausada_en, mensaje_pausa')
    .eq('usuario_id', user.id)
    .maybeSingle();
  if (error) {
    console.error('Pausa: no se pudo leer la tienda', user.id, error.message);
    return { respuesta: NextResponse.json({ error: NO_SE_PUDO }, { status: 500 }) };
  }
  if (!vendedor) {
    return { respuesta: NextResponse.json({ error: 'No encontramos tu cuenta de vendedor.' }, { status: 404 }) };
  }
  return { user, vendedor, admin };
}

async function leerCuerpo(request) {
  try { return await request.json(); } catch { return null; }
}

function estado(vendedor) {
  return {
    pausada: !!vendedor.pausada_en,
    pausada_en: vendedor.pausada_en || null,
    mensaje_pausa: vendedor.mensaje_pausa || null,
  };
}

export async function GET() {
  const { respuesta, vendedor, admin } = await tiendaDeLaSesion();
  if (respuesta) return respuesta;

  // Para el cartel de "¿Pausar tu tienda?" (cuántos productos dejan de verse y
  // cuántos pedidos le quedan por entregar) y el aviso de MercadoPago. Si algo
  // de esto falla, el estado sale igual, sin el número.
  const [productos, pedidos, cuenta] = await Promise.all([
    admin.from('productos').select('id', { count: 'exact', head: true })
      .eq('vendedor_id', vendedor.id).eq('estado', 'activo'),
    admin.from('pedidos').select('id', { count: 'exact', head: true })
      .eq('vendedor_id', vendedor.id).in('estado', ESTADOS_PARA_ENTREGAR),
    admin.from('mercadopago_cuentas').select('token_expira_en')
      .eq('vendedor_id', vendedor.id).maybeSingle(),
  ]);
  for (const r of [productos, pedidos, cuenta]) {
    if (r.error) console.error('Pausa: no se pudo leer un dato del estado', vendedor.id, r.error.message);
  }

  return NextResponse.json({
    ...estado(vendedor),
    productos_visibles: productos.error ? null : productos.count ?? 0,
    pedidos_para_entregar: pedidos.error ? null : pedidos.count ?? 0,
    mp_necesita_reconectar: cuenta.error ? false : mpNecesitaReconectar(cuenta.data),
  });
}

export async function POST(request) {
  const { respuesta, user, vendedor, admin } = await tiendaDeLaSesion();
  if (respuesta) return respuesta;

  const cuerpo = await leerCuerpo(request);
  const validado = validarMensajePausa(cuerpo?.mensaje);
  if (!validado.ok) return NextResponse.json({ error: validado.error }, { status: 400 });

  if (vendedor.pausada_en) {
    return NextResponse.json({ error: 'Tu tienda ya está pausada.', ...estado(vendedor) }, { status: 409 });
  }

  // El WHERE repite "no pausada": dos clics a la vez pausan una sola vez (y
  // mandan un solo mail).
  const { data: pausada, error } = await admin
    .from('vendedores')
    .update({ pausada_en: new Date().toISOString(), mensaje_pausa: validado.mensaje })
    .eq('id', vendedor.id)
    .is('pausada_en', null)
    .select('id, pausada_en, mensaje_pausa')
    .maybeSingle();
  if (error) {
    console.error('Pausa: no se pudo pausar la tienda', vendedor.id, error.message);
    return NextResponse.json({ error: NO_SE_PUDO }, { status: 500 });
  }
  if (!pausada) {
    return NextResponse.json({ error: 'Tu tienda ya está pausada.' }, { status: 409 });
  }

  console.log(`Pausa: tienda ${vendedor.id} pausada.`);
  await enviarMailPausa({ para: user.email, tienda: vendedor.nombre_negocio, mensaje: pausada.mensaje_pausa });

  return NextResponse.json({ ok: true, ...estado(pausada) });
}

export async function PATCH(request) {
  const { respuesta, vendedor, admin } = await tiendaDeLaSesion();
  if (respuesta) return respuesta;

  const cuerpo = await leerCuerpo(request);
  const validado = validarMensajePausa(cuerpo?.mensaje);
  if (!validado.ok) return NextResponse.json({ error: validado.error }, { status: 400 });

  const { data: actualizada, error } = await admin
    .from('vendedores')
    .update({ mensaje_pausa: validado.mensaje })
    .eq('id', vendedor.id)
    .not('pausada_en', 'is', null)
    .select('id, pausada_en, mensaje_pausa')
    .maybeSingle();
  if (error) {
    console.error('Pausa: no se pudo cambiar el mensaje', vendedor.id, error.message);
    return NextResponse.json({ error: NO_SE_PUDO }, { status: 500 });
  }
  if (!actualizada) {
    return NextResponse.json({ error: 'Tu tienda no está pausada.' }, { status: 409 });
  }
  return NextResponse.json({ ok: true, ...estado(actualizada) });
}

export async function DELETE() {
  const { respuesta, vendedor, admin } = await tiendaDeLaSesion();
  if (respuesta) return respuesta;

  if (!vendedor.pausada_en) {
    return NextResponse.json({ error: 'Tu tienda no está pausada.', ...estado(vendedor) }, { status: 409 });
  }

  // Antes de reactivar, ¿MercadoPago sigue sirviendo? Si el permiso venció
  // durante la pausa (y no se pudo renovar), se avisa: la reactivación se hace
  // igual. getValidAccessToken lo renueva solo si está por vencer. Sin ninguna
  // cuenta no hay nada que reconectar: el panel ya muestra "Conectar".
  let mpNecesitaReconectarAhora = false;
  try {
    await getValidAccessToken(vendedor.id, admin);
  } catch (err) {
    if (err?.message !== 'VENDEDOR_SIN_MP') {
      console.warn(`Pausa: al reactivar la tienda ${vendedor.id}, MercadoPago no da un token válido (${err?.message || err}).`);
      mpNecesitaReconectarAhora = true;
    }
  }

  const { data: activa, error } = await admin
    .from('vendedores')
    .update({ pausada_en: null, mensaje_pausa: null })
    .eq('id', vendedor.id)
    .not('pausada_en', 'is', null)
    .select('id, pausada_en, mensaje_pausa')
    .maybeSingle();
  if (error) {
    console.error('Pausa: no se pudo reactivar la tienda', vendedor.id, error.message);
    return NextResponse.json({ error: NO_SE_PUDO }, { status: 500 });
  }
  if (!activa) {
    return NextResponse.json({ error: 'Tu tienda no está pausada.' }, { status: 409 });
  }

  console.log(`Pausa: tienda ${vendedor.id} reactivada.`);
  return NextResponse.json({ ok: true, ...estado(activa), mp_necesita_reconectar: mpNecesitaReconectarAhora });
}
