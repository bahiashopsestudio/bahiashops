// Las 18 categorías con el dato con el que se decide: cuántos vendedores
// tiene cada una.
//
// Los conteos se hacen acá y no en el navegador. Con RLS, el navegador sólo ve
// los vendedores publicados y no bloqueados, así que contar del lado del
// cliente daría de menos y sin avisar.

import { NextResponse } from 'next/server';
import { getServiceRoleClient, verificarAdmin } from '@/lib/supabase/admin';

export async function GET() {
  const admin_user = await verificarAdmin();
  if (!admin_user) {
    return NextResponse.json({ error: 'No autorizado.' }, { status: 403 });
  }

  const admin = getServiceRoleClient();

  const { data: categorias, error } = await admin
    .from('categorias')
    .select('id, nombre, slug, activa, orden')
    .order('orden');

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const { data: vendedores, error: errorVendedores } = await admin
    .from('vendedores')
    .select('id, categoria_id, estado_validacion, bloqueado');

  if (errorVendedores) {
    return NextResponse.json({ error: errorVendedores.message }, { status: 500 });
  }

  const { data: productos, error: errorProductos } = await admin
    .from('productos')
    .select('id, categoria_id, categoria_secundaria_id');

  if (errorProductos) {
    return NextResponse.json({ error: errorProductos.message }, { status: 500 });
  }

  const filas = (categorias || []).map((c) => {
    const suyos = (vendedores || []).filter((v) => v.categoria_id === c.id);
    return {
      ...c,
      vendedores: suyos.length,
      // Los que efectivamente se ven en el sitio. La diferencia importa: una
      // categoría con un solo vendedor bloqueado tiene la página vacía.
      vendedores_visibles: suyos.filter(
        (v) => v.estado_validacion === 'aprobado' && !v.bloqueado
      ).length,
      productos: (productos || []).filter(
        (p) => p.categoria_id === c.id || p.categoria_secundaria_id === c.id
      ).length,
    };
  });

  return NextResponse.json({ categorias: filas });
}
