// Vuelta del OAuth de MercadoPago.
//
// Acá aterriza el NAVEGADOR del vendedor, no un fetch: todas las salidas son
// redirecciones. Nunca devolvemos JSON, ni en éxito ni en error, porque la
// persona vería texto crudo en pantalla.

import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createClient as createAdminClient } from '@supabase/supabase-js';
import { MP_CLIENT_ID, MP_CLIENT_SECRET, MP_REDIRECT_URI } from '@/lib/mercadopago/config';

const PERFIL = '/vendedor/perfil';

function alPerfil(request, params) {
  const url = new URL(PERFIL, request.url);
  for (const [clave, valor] of Object.entries(params)) {
    url.searchParams.set(clave, valor);
  }
  return NextResponse.redirect(url);
}

function conError(request, motivo) {
  return alPerfil(request, { mp: 'error', motivo });
}

export async function GET(request) {
  const { searchParams } = new URL(request.url);
  const code = searchParams.get('code');

  if (!code) {
    return conError(request, 'sin_codigo');
  }

  // 1. ¿Quién es el vendedor que está conectando? (usa su sesión)
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    // Perdió la cookie mientras estaba en MercadoPago. Mandarlo al perfil
    // solo lo rebotaría al login, así que va derecho ahí, con vuelta al perfil.
    const url = new URL('/login', request.url);
    url.searchParams.set('next', PERFIL);
    url.searchParams.set('motivo', 'sesion_mp');
    return NextResponse.redirect(url);
  }

  const { data: vendedor, error: errorVendedor } = await supabase
    .from('vendedores')
    .select('id')
    .eq('usuario_id', user.id)
    .maybeSingle();

  if (errorVendedor || !vendedor) {
    return conError(request, 'sin_vendedor');
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
    // El detalle queda en el log del servidor: nunca viaja al navegador.
    console.error(
      'MercadoPago rechazó el canje para el vendedor', vendedor.id,
      '| status:', respuesta.status,
      '| error:', datos?.error, '| message:', datos?.message
    );
    return conError(request, 'canje_rechazado');
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
    console.error(
      'No se pudo guardar la cuenta de MP del vendedor', vendedor.id,
      '|', errorGuardado.message
    );
    return conError(request, 'no_guardado');
  }

  // 4. Marcar al vendedor como conectado (para la interfaz).
  const { error: errorFlag } = await admin
    .from('vendedores')
    .update({ mercadopago_conectado: true })
    .eq('id', vendedor.id);

  if (errorFlag) {
    console.error(
      'Cuenta de MP guardada pero no se pudo marcar el vendedor', vendedor.id,
      '|', errorFlag.message
    );
    return conError(request, 'no_guardado');
  }

  return alPerfil(request, { mp: 'exito' });
}
