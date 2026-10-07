// Qué cuenta de MercadoPago tiene conectada la tienda de quien tiene la sesión,
// para mostrarla en el panel ("MercadoPago conectado: ...").
//
// Por qué una ruta: mercadopago_cuentas guarda los tokens y el navegador no la
// puede leer. Acá la tienda sale de la sesión (nunca de un parámetro) y solo
// viaja lo que se puede mostrar: el nombre y el número de la cuenta, desde
// cuándo está conectada y cuándo vence el permiso. Nunca los tokens.

import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { getServiceRoleClient } from '@/lib/supabase/admin';

const MS_POR_DIA = 24 * 60 * 60 * 1000;

export async function GET() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: 'Iniciá sesión.' }, { status: 401 });
  }

  const admin = getServiceRoleClient();

  const { data: vendedor, error: errorVendedor } = await admin
    .from('vendedores')
    .select('id')
    .eq('usuario_id', user.id)
    .maybeSingle();
  if (errorVendedor) {
    console.error('Cuenta de MP: no se pudo leer la tienda', user.id, errorVendedor.message);
    return NextResponse.json({ error: 'No pudimos cargar tu cuenta de MercadoPago.' }, { status: 500 });
  }
  if (!vendedor) {
    return NextResponse.json({ error: 'No encontramos tu cuenta de vendedor.' }, { status: 404 });
  }

  const { data: cuenta, error } = await admin
    .from('mercadopago_cuentas')
    .select('mp_user_id, mp_nickname, conectado_en, token_expira_en')
    .eq('vendedor_id', vendedor.id)
    .maybeSingle();
  if (error) {
    console.error('Cuenta de MP: no se pudo leer la cuenta de la tienda', vendedor.id, error.message);
    return NextResponse.json({ error: 'No pudimos cargar tu cuenta de MercadoPago.' }, { status: 500 });
  }

  if (!cuenta) {
    return NextResponse.json({ conectada: false });
  }

  const vence = Date.parse(cuenta.token_expira_en);
  return NextResponse.json({
    conectada: true,
    id: cuenta.mp_user_id === null || cuenta.mp_user_id === undefined ? null : String(cuenta.mp_user_id),
    nickname: cuenta.mp_nickname || null,
    conectado_en: cuenta.conectado_en || null,
    dias_restantes: Number.isFinite(vence) ? Math.floor((vence - Date.now()) / MS_POR_DIA) : null,
  });
}
