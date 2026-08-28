// Abrir o cerrar una categoría a mano desde /admin/categorias.
//
// Cerrar no está automatizado: una categoría que se queda sin vendedores
// sigue abierta hasta que alguien decida lo contrario desde acá.

import { NextResponse } from 'next/server';
import { getServiceRoleClient, verificarAdmin } from '@/lib/supabase/admin';

export async function PUT(request, { params }) {
  const admin_user = await verificarAdmin();
  if (!admin_user) {
    return NextResponse.json({ error: 'No autorizado.' }, { status: 403 });
  }

  const { id } = await params;
  const body = await request.json().catch(() => ({}));

  if (typeof body.activa !== 'boolean') {
    return NextResponse.json({ error: 'Falta el campo activa.' }, { status: 400 });
  }

  const admin = getServiceRoleClient();
  const { data, error } = await admin
    .from('categorias')
    .update({ activa: body.activa })
    .eq('id', id)
    .select('id, nombre, slug, activa, orden')
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ categoria: data });
}
