import { NextResponse } from 'next/server';
import { getServiceRoleClient, verificarAdmin } from '@/lib/supabase/admin';

export async function GET() {
  const admin_user = await verificarAdmin();
  if (!admin_user) {
    return NextResponse.json({ error: 'No autorizado.' }, { status: 403 });
  }

  const admin = getServiceRoleClient();
  const { data, error } = await admin
    .from('vendedores')
    .select(`
      id, nombre_negocio, slug, descripcion_corta, mercadopago_conectado, creado_en, bloqueado,
      barrios ( nombre ),
      categorias ( nombre ),
      usuarios!vendedores_usuario_id_fkey ( email ),
      productos ( id )
    `)
    .order('creado_en', { ascending: false });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const vendedores = (data || []).map((v) => ({
    ...v,
    productos_count: v.productos?.length ?? 0,
    productos: undefined,
  }));

  return NextResponse.json({ vendedores });
}
