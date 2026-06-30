import { NextResponse } from 'next/server';
import { MP_CLIENT_ID, MP_REDIRECT_URI } from '@/lib/mercadopago/config';

export async function GET() {
  const url = new URL('https://auth.mercadopago.com.ar/authorization');
  url.searchParams.set('client_id', MP_CLIENT_ID);
  url.searchParams.set('response_type', 'code');
  url.searchParams.set('platform_id', 'mp');
  url.searchParams.set('redirect_uri', MP_REDIRECT_URI);

  return NextResponse.redirect(url.toString());
}