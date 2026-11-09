// Quienes se anotaron en /servicios, para el panel de admin: la lista (la más
// nueva arriba) y el conteo por rubro. La tabla está cerrada al navegador
// (migración 053): se lee con service_role.

import { NextResponse } from 'next/server';
import { getServiceRoleClient, verificarAdmin } from '@/lib/supabase/admin';
import { contarPorRubro } from '@/lib/serviciosInteresados';

export async function GET() {
  const admin_user = await verificarAdmin();
  if (!admin_user) {
    return NextResponse.json({ error: 'No autorizado.' }, { status: 403 });
  }

  const admin = getServiceRoleClient();
  const { data, error } = await admin
    .from('servicios_interesados')
    .select('id, email, rubro, creado_en')
    .order('creado_en', { ascending: false });

  if (error) {
    console.error('[admin-servicios/listar]', error.message);
    return NextResponse.json({ error: 'No pudimos cargar las anotaciones.' }, { status: 500 });
  }

  const anotaciones = data || [];
  return NextResponse.json({ anotaciones, por_rubro: contarPorRubro(anotaciones) });
}
