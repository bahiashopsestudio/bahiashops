// Las ciudades que nos piden, para el panel de admin: las del alta de tienda
// (ciudades_pedidas, una fila por cuenta) y las del formulario público de Local
// Shops (ciudades_local_shops, sin datos de contacto), juntas y con la más
// reciente arriba.

import { NextResponse } from 'next/server';
import { getServiceRoleClient, verificarAdmin } from '@/lib/supabase/admin';

// La tabla de Local Shops crece por pedido: alcanza con los últimos.
const MAX_LOCAL_SHOPS = 1000;

export async function GET() {
  const admin_user = await verificarAdmin();
  if (!admin_user) {
    return NextResponse.json({ error: 'No autorizado.' }, { status: 403 });
  }

  const admin = getServiceRoleClient();
  const [alta, localShops] = await Promise.all([
    admin
      .from('ciudades_pedidas')
      .select('usuario_id, ciudad, email, actualizado_en'),
    admin
      .from('ciudades_local_shops')
      .select('id, provincia, ciudad, creado_en')
      .order('creado_en', { ascending: false })
      .limit(MAX_LOCAL_SHOPS),
  ]);

  const error = alta.error || localShops.error;
  if (error) {
    console.error('[admin-ciudades/listar]', error.message);
    return NextResponse.json({ error: 'No pudimos cargar las ciudades.' }, { status: 500 });
  }

  const ciudades = [
    ...alta.data.map((c) => ({
      clave: `alta-${c.usuario_id}`, origen: 'Alta de tienda', ciudad: c.ciudad, provincia: null, email: c.email, fecha: c.actualizado_en,
    })),
    ...localShops.data.map((c) => ({
      clave: `local-shops-${c.id}`, origen: 'Local Shops', ciudad: c.ciudad, provincia: c.provincia, email: null, fecha: c.creado_en,
    })),
  ].sort((a, b) => new Date(b.fecha) - new Date(a.fecha));

  return NextResponse.json({ ciudades });
}
