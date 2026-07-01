import { NextResponse } from 'next/server';
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

  return NextResponse.json({
    mensaje: '¡Conexión con MercadoPago exitosa!',
    id_del_vendedor_en_mercadopago: datos.user_id,
    access_token: datos.access_token ? 'recibido ✓' : 'no vino',
    refresh_token: datos.refresh_token ? 'recibido ✓' : 'no vino',
    vence_en_dias: datos.expires_in ? Math.round(datos.expires_in / 86400) : null,
  });
}
