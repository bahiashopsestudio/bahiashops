import { NextResponse } from 'next/server';
import { getServiceRoleClient, verificarAdmin } from '@/lib/supabase/admin';

function fotoPrincipal(media) {
  if (!media?.length) return null;
  const principal = media.find((m) => m.es_principal);
  if (principal) return principal.url;
  const ordenadas = [...media].sort((a, b) => a.orden - b.orden);
  return ordenadas[0]?.url || null;
}

export async function GET(request, { params }) {
  const admin_user = await verificarAdmin();
  if (!admin_user) {
    return NextResponse.json({ error: 'No autorizado.' }, { status: 403 });
  }

  const { id } = await params;
  const admin = getServiceRoleClient();

  const { data: coleccion, error: errColeccion } = await admin
    .from('colecciones')
    .select('*')
    .eq('id', id)
    .single();

  if (errColeccion || !coleccion) {
    return NextResponse.json({ error: 'No se encontró la colección.' }, { status: 404 });
  }

  const { data: filas, error: errProductos } = await admin
    .from('coleccion_productos')
    .select(`
      orden,
      producto:productos (
        id, nombre, precio, estado,
        vendedor:vendedores ( nombre_negocio ),
        media:producto_media ( url, es_principal, orden )
      )
    `)
    .eq('coleccion_id', id)
    .order('orden');

  if (errProductos) {
    return NextResponse.json({ error: errProductos.message }, { status: 500 });
  }

  const productos = (filas || [])
    .filter((f) => f.producto)
    .map((f) => ({
      id: f.producto.id,
      nombre: f.producto.nombre,
      precio: f.producto.precio,
      estado: f.producto.estado,
      vendedor_nombre: f.producto.vendedor?.nombre_negocio || '',
      foto: fotoPrincipal(f.producto.media),
      orden: f.orden,
    }));

  return NextResponse.json({ coleccion, productos });
}

export async function PUT(request, { params }) {
  const admin_user = await verificarAdmin();
  if (!admin_user) {
    return NextResponse.json({ error: 'No autorizado.' }, { status: 403 });
  }

  const { id } = await params;
  const body = await request.json();

  const campos = ['nombre', 'slug', 'descripcion', 'tipo', 'imagen_url', 'activa', 'orden', 'fecha_inicio', 'fecha_fin'];
  const actualizacion = {};
  for (const campo of campos) {
    if (campo in body) actualizacion[campo] = body[campo];
  }

  if ('nombre' in actualizacion && !actualizacion.nombre?.trim()) {
    return NextResponse.json({ error: 'El nombre es obligatorio.' }, { status: 400 });
  }
  if ('slug' in actualizacion && !actualizacion.slug?.trim()) {
    return NextResponse.json({ error: 'El slug es obligatorio.' }, { status: 400 });
  }
  if (actualizacion.tipo && actualizacion.tipo !== 'temporada') {
    actualizacion.fecha_inicio = null;
    actualizacion.fecha_fin = null;
  }

  const admin = getServiceRoleClient();
  const { data, error } = await admin
    .from('colecciones')
    .update(actualizacion)
    .eq('id', id)
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

export async function DELETE(request, { params }) {
  const admin_user = await verificarAdmin();
  if (!admin_user) {
    return NextResponse.json({ error: 'No autorizado.' }, { status: 403 });
  }

  const { id } = await params;
  const admin = getServiceRoleClient();
  const { error } = await admin.from('colecciones').delete().eq('id', id);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
