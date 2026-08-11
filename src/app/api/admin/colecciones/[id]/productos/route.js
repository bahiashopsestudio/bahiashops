import { NextResponse } from 'next/server';
import { getServiceRoleClient, verificarAdmin } from '@/lib/supabase/admin';

export async function POST(request, { params }) {
  const admin_user = await verificarAdmin();
  if (!admin_user) {
    return NextResponse.json({ error: 'No autorizado.' }, { status: 403 });
  }

  const { id } = await params;
  const { producto_id } = await request.json();
  if (!producto_id) {
    return NextResponse.json({ error: 'Falta producto_id.' }, { status: 400 });
  }

  const admin = getServiceRoleClient();

  const { data: existentes } = await admin
    .from('coleccion_productos')
    .select('orden')
    .eq('coleccion_id', id)
    .order('orden', { ascending: false })
    .limit(1);

  const siguienteOrden = existentes?.length ? existentes[0].orden + 1 : 0;

  const { error } = await admin
    .from('coleccion_productos')
    .insert({ coleccion_id: Number(id), producto_id: Number(producto_id), orden: siguienteOrden });

  if (error) {
    if (error.code === '23505') {
      return NextResponse.json({ error: 'Ese producto ya está en la colección.' }, { status: 409 });
    }
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}

export async function DELETE(request, { params }) {
  const admin_user = await verificarAdmin();
  if (!admin_user) {
    return NextResponse.json({ error: 'No autorizado.' }, { status: 403 });
  }

  const { id } = await params;
  const { producto_id } = await request.json();
  if (!producto_id) {
    return NextResponse.json({ error: 'Falta producto_id.' }, { status: 400 });
  }

  const admin = getServiceRoleClient();
  const { error } = await admin
    .from('coleccion_productos')
    .delete()
    .eq('coleccion_id', id)
    .eq('producto_id', producto_id);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}

export async function PUT(request, { params }) {
  const admin_user = await verificarAdmin();
  if (!admin_user) {
    return NextResponse.json({ error: 'No autorizado.' }, { status: 403 });
  }

  const { id } = await params;
  const { producto_id, orden } = await request.json();
  if (!producto_id || orden === undefined) {
    return NextResponse.json({ error: 'Faltan producto_id u orden.' }, { status: 400 });
  }

  const admin = getServiceRoleClient();
  const { error } = await admin
    .from('coleccion_productos')
    .update({ orden })
    .eq('coleccion_id', id)
    .eq('producto_id', producto_id);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
