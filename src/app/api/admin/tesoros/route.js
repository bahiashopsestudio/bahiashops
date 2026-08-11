import { NextResponse } from 'next/server';
import { getServiceRoleClient, verificarAdmin } from '@/lib/supabase/admin';

export async function POST(request) {
  const admin_user = await verificarAdmin();
  if (!admin_user) {
    return NextResponse.json({ error: 'No autorizado.' }, { status: 403 });
  }

  const body = await request.json();
  const { producto_id } = body;

  if (!producto_id) {
    return NextResponse.json({ error: 'Falta producto_id.' }, { status: 400 });
  }

  const admin = getServiceRoleClient();

  const { data: existente } = await admin
    .from('tesoros')
    .select('id')
    .eq('producto_id', producto_id)
    .eq('activo', true)
    .maybeSingle();

  if (existente) {
    return NextResponse.json({ error: 'Ese producto ya es un tesoro activo.' }, { status: 409 });
  }

  const { data: ultimo } = await admin
    .from('tesoros')
    .select('orden')
    .order('orden', { ascending: false })
    .limit(1)
    .maybeSingle();

  const siguienteOrden = (ultimo?.orden ?? -1) + 1;

  const { data, error } = await admin
    .from('tesoros')
    .insert({
      producto_id,
      destacado: false,
      activo: true,
      orden: siguienteOrden,
    })
    .select()
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ tesoro: data });
}
