import { NextResponse } from 'next/server';
import { getServiceRoleClient, verificarAdmin } from '@/lib/supabase/admin';

export async function GET() {
  const admin_user = await verificarAdmin();
  if (!admin_user) {
    return NextResponse.json({ error: 'No autorizado.' }, { status: 403 });
  }

  const admin = getServiceRoleClient();
  const { data, error } = await admin
    .from('colecciones')
    .select('id, nombre, slug, descripcion, tipo, imagen_url, activa, orden, fecha_inicio, fecha_fin, coleccion_productos(count)')
    .order('orden');

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const colecciones = (data || []).map((c) => ({
    ...c,
    productos_count: c.coleccion_productos?.[0]?.count ?? 0,
    coleccion_productos: undefined,
  }));

  return NextResponse.json({ colecciones });
}

export async function POST(request) {
  const admin_user = await verificarAdmin();
  if (!admin_user) {
    return NextResponse.json({ error: 'No autorizado.' }, { status: 403 });
  }

  const body = await request.json();
  const { nombre, slug, descripcion, tipo, imagen_url, activa, orden, fecha_inicio, fecha_fin } = body;

  if (!nombre?.trim()) {
    return NextResponse.json({ error: 'El nombre es obligatorio.' }, { status: 400 });
  }
  if (!slug?.trim()) {
    return NextResponse.json({ error: 'El slug es obligatorio.' }, { status: 400 });
  }

  const admin = getServiceRoleClient();
  const { data, error } = await admin
    .from('colecciones')
    .insert({
      nombre: nombre.trim(),
      slug: slug.trim(),
      descripcion: descripcion?.trim() || null,
      tipo: tipo || 'curada',
      imagen_url: imagen_url || null,
      activa: !!activa,
      orden: orden ?? 0,
      fecha_inicio: tipo === 'temporada' ? (fecha_inicio || null) : null,
      fecha_fin: tipo === 'temporada' ? (fecha_fin || null) : null,
    })
    .select()
    .single();

  if (error) {
    if (error.code === '23505') {
      return NextResponse.json({ error: 'Ya existe una colección con ese slug.' }, { status: 409 });
    }
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ coleccion: data });
}
