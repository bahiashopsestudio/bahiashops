// Los datos de la tienda que sólo puede ver su dueño: el mensaje del admin
// cuando pide cambios y el contacto que el vendedor cargó.
//
// Por qué una ruta: esas columnas de 'vendedores' no se pueden leer con el
// cliente de sesión (la tabla es pública y RLS decide filas, no columnas).
// Acá la tienda sale de la sesión, nunca de un parámetro: no hay forma de
// pedir los datos de otra.

import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { getServiceRoleClient } from '@/lib/supabase/admin';

export async function GET() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: 'Iniciá sesión.' }, { status: 401 });
  }

  const admin = getServiceRoleClient();

  const { data: vendedor, error } = await admin
    .from('vendedores')
    .select('notas_validacion, telefono_contacto, email_contacto')
    .eq('usuario_id', user.id)
    .maybeSingle();

  if (error) {
    console.error('No se pudieron leer los datos privados del vendedor', user.id, error.message);
    return NextResponse.json({ error: 'No pudimos cargar tus datos.' }, { status: 500 });
  }

  if (!vendedor) {
    return NextResponse.json({ error: 'No encontramos tu cuenta de vendedor.' }, { status: 404 });
  }

  return NextResponse.json({
    notas_validacion: vendedor.notas_validacion ?? null,
    telefono_contacto: vendedor.telefono_contacto ?? null,
    email_contacto: vendedor.email_contacto ?? null,
  });
}
