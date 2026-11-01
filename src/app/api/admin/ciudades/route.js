// Las ciudades que anotó la gente que todavía no puede abrir su tienda, para el
// panel de admin. La última actualizada, primero.

import { NextResponse } from 'next/server';
import { getServiceRoleClient, verificarAdmin } from '@/lib/supabase/admin';

export async function GET() {
  const admin_user = await verificarAdmin();
  if (!admin_user) {
    return NextResponse.json({ error: 'No autorizado.' }, { status: 403 });
  }

  const admin = getServiceRoleClient();
  const { data, error } = await admin
    .from('ciudades_pedidas')
    .select('usuario_id, ciudad, email, actualizado_en')
    .order('actualizado_en', { ascending: false });

  if (error) {
    console.error('[admin-ciudades/listar]', error.message);
    return NextResponse.json({ error: 'No pudimos cargar las ciudades.' }, { status: 500 });
  }

  return NextResponse.json({ ciudades: data });
}
