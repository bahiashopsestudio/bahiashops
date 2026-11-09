// Borrar una anotación de /servicios (cuando la persona lo pide).

import { NextResponse } from 'next/server';
import { getServiceRoleClient, verificarAdmin } from '@/lib/supabase/admin';

export async function DELETE(request, { params }) {
  const admin_user = await verificarAdmin();
  if (!admin_user) {
    return NextResponse.json({ error: 'No autorizado.' }, { status: 403 });
  }

  const { id } = await params;
  if (!/^\d{1,18}$/.test(String(id ?? ''))) {
    return NextResponse.json({ error: 'Anotación inválida.' }, { status: 400 });
  }

  const admin = getServiceRoleClient();
  const { error } = await admin.from('servicios_interesados').delete().eq('id', id);

  if (error) {
    console.error('[admin-servicios/borrar]', error.message);
    return NextResponse.json({ error: 'No pudimos borrar la anotación.' }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
