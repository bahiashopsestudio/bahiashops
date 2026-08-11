import { NextResponse } from 'next/server';
import { getServiceRoleClient, verificarAdmin } from '@/lib/supabase/admin';

const COLORES_VALIDOS = ['#f1f29f', '#f0e0d0', '#d4e8f0', '#e8d4f0', '#d0f0e0', '#f0d4d4'];

export async function PUT(request, { params }) {
  const admin_user = await verificarAdmin();
  if (!admin_user) {
    return NextResponse.json({ error: 'No autorizado.' }, { status: 403 });
  }

  const { id } = await params;
  const body = await request.json();

  const cambios = {};
  if (typeof body.activo === 'boolean') cambios.activo = body.activo;
  if (typeof body.destacado === 'boolean') cambios.destacado = body.destacado;
  if (typeof body.color_fondo === 'string' && COLORES_VALIDOS.includes(body.color_fondo)) {
    cambios.color_fondo = body.color_fondo;
  }
  if (typeof body.quote === 'string') cambios.quote = body.quote.trim() || null;
  if (typeof body.quote_autor === 'string') cambios.quote_autor = body.quote_autor.trim() || null;

  if (Object.keys(cambios).length === 0) {
    return NextResponse.json({ error: 'No hay cambios para aplicar.' }, { status: 400 });
  }

  const admin = getServiceRoleClient();
  const { data, error } = await admin
    .from('tesoros')
    .update(cambios)
    .eq('id', id)
    .select()
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ tesoro: data });
}
