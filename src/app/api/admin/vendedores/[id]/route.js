import { NextResponse } from 'next/server';
import { getServiceRoleClient, verificarAdmin } from '@/lib/supabase/admin';

export async function PUT(request, { params }) {
  const admin_user = await verificarAdmin();
  if (!admin_user) {
    return NextResponse.json({ error: 'No autorizado.' }, { status: 403 });
  }

  const { id } = await params;
  const body = await request.json();

  if (typeof body.bloqueado !== 'boolean') {
    return NextResponse.json({ error: 'Falta el campo bloqueado.' }, { status: 400 });
  }

  const admin = getServiceRoleClient();
  const { data, error } = await admin
    .from('vendedores')
    .update({ bloqueado: body.bloqueado })
    .eq('id', id)
    .select()
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ vendedor: data });
}
