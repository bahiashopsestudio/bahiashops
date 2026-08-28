// Ficha completa de un vendedor, para decidir si se aprueba.
// Devuelve todo lo que cargó en el alta más sus productos.

import { NextResponse } from 'next/server';
import { getServiceRoleClient, verificarAdmin } from '@/lib/supabase/admin';

export async function GET(request, { params }) {
  const admin_user = await verificarAdmin();
  if (!admin_user) {
    return NextResponse.json({ error: 'No autorizado.' }, { status: 403 });
  }

  const { id } = await params;
  const admin = getServiceRoleClient();

  const { data: vendedor, error } = await admin
    .from('vendedores')
    .select(`
      *,
      categorias ( nombre ),
      barrios ( nombre ),
      localidades ( nombre ),
      usuarios!vendedores_usuario_id_fkey ( email ),
      vendedor_bloqueos ( motivo, creado_en, levantado_en )
    `)
    .eq('id', id)
    .maybeSingle();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  if (!vendedor) {
    return NextResponse.json({ error: 'No encontramos ese vendedor.' }, { status: 404 });
  }

  // El bloqueo vigente, si lo hay: el motivo no está en la fila del vendedor.
  vendedor.bloqueo_actual =
    (vendedor.vendedor_bloqueos || [])
      .filter((b) => !b.levantado_en)
      .sort((a, b) => new Date(b.creado_en) - new Date(a.creado_en))[0] || null;

  const { data: productos } = await admin
    .from('productos')
    .select('id, nombre, precio, estado, creado_en, producto_media ( url, es_principal, orden )')
    .eq('vendedor_id', id)
    .order('creado_en', { ascending: false });

  return NextResponse.json({ vendedor, productos: productos || [] });
}
