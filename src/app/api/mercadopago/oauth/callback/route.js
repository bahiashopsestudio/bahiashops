import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createClient as createAdminClient } from '@supabase/supabase-js';
import { MP_CLIENT_ID, MP_CLIENT_SECRET, MP_REDIRECT_URI } from '@/lib/mercadopago/config';

export async function GET(request) {
  const { searchParams } = new URL(request.url);
  const code = searchParams.get('code');

  if (!code) {
    return NextResponse.json(
      { error: 'No recibimos el código de autorización de MercadoPago.' },
      { status: 400 }
    );
  }

  // 1. ¿Quién es el vendedor que está conectando? (usa su sesión)
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json(
      { error: 'No hay una sesión iniciada. Iniciá sesión antes de conectar MercadoPago.' },
      { status: 401 }
    );
  }

  const { data: vendedor, error: errorVendedor } = await supabase
    .from('vendedores')
    .select('id')
    .eq('usuario_id', user.id)
    .single();

  if (errorVendedor || !vendedor) {
    return NextResponse.json(
      { error: 'No encontramos tu cuenta de vendedor.' },
      { status: 404 }
    );
  }

  // 2. Canjear el código por las llaves del vendedor.
  const respuesta = await fetch('https://api.mercadopago.com/oauth/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      client_id: MP_CLIENT_ID,
      client_secret: MP_CLIENT_SECRET,
      grant_type: 'authorization_code',
      code: code,
      redirect_uri: MP_REDIRECT_URI,
    }),
  });

  const datos = await respuesta.json();

  if (!respuesta.ok) {
    return NextResponse.json(
      { error: 'MercadoPago rechazó el canje.', detalle: datos },
      { status: 400 }
    );
  }

  // 3. Guardar las llaves con la "llave maestra" (service role).
  const admin = createAdminClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
  );

  const venceEn = new Date(Date.now() + datos.expires_in * 1000).toISOString();

  const { error: errorGuardado } = await admin
    .from('mercadopago_cuentas')
    .upsert({
      vendedor_id: vendedor.id,
      mp_user_id: String(datos.user_id),
      access_token: datos.access_token,
      refresh_token: datos.refresh_token,
      public_key: datos.public_key,
      token_expira_en: venceEn,
      actualizado_en: new Date().toISOString(),
    }, { onConflict: 'vendedor_id' });

  if (errorGuardado) {
    return NextResponse.json(
      { error: 'La conexión se hizo pero no se pudo guardar.', detalle: errorGuardado.message },
      { status: 500 }
    );
  }

  // 4. Marcar al vendedor como conectado (para la interfaz).
  await admin
    .from('vendedores')
    .update({ mercadopago_conectado: true })
    .eq('id', vendedor.id);

  // 5. Confirmación (sin exponer las llaves).
  return NextResponse.json({
    mensaje: '¡Conexión con MercadoPago guardada con éxito!',
    vendedor_id: vendedor.id,
  });
}