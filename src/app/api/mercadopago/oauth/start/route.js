import { NextResponse } from 'next/server';
import { MP_CLIENT_ID, MP_REDIRECT_URI } from '@/lib/mercadopago/config';
import { COOKIE_ESTADO_MP, VIDA_ESTADO_MP_SEGUNDOS, generarEstadoMp } from '@/lib/mercadopago/estado';

export async function GET() {
  // El "state": un valor al azar que va a MercadoPago y a una cookie de este
  // navegador. El callback exige que vuelva igual (src/lib/mercadopago/estado.js).
  const estado = generarEstadoMp();

  const url = new URL('https://auth.mercadopago.com.ar/authorization');
  url.searchParams.set('client_id', MP_CLIENT_ID);
  url.searchParams.set('response_type', 'code');
  url.searchParams.set('platform_id', 'mp');
  url.searchParams.set('state', estado);
  url.searchParams.set('redirect_uri', MP_REDIRECT_URI);

  const respuesta = NextResponse.redirect(url.toString());
  respuesta.cookies.set(COOKIE_ESTADO_MP, estado, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/api/mercadopago/oauth',
    maxAge: VIDA_ESTADO_MP_SEGUNDOS,
  });
  return respuesta;
}
