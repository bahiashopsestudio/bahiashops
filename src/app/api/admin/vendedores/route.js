import { NextResponse } from 'next/server';
import { getServiceRoleClient, verificarAdmin } from '@/lib/supabase/admin';

// Ventana de "vendedor nuevo". Es la misma que usa la etiqueta "Nuevo" de la
// lista (/admin/vendedores), así que el número del panel y las etiquetas de
// la lista siempre coinciden.
const DIAS_NUEVO = 7;

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
      estado_validacion, notas_validacion, validado_en, validado_por,
      barrios ( nombre ),
      categorias ( nombre ),
      usuarios!vendedores_usuario_id_fkey ( email ),
      productos ( id ),
      vendedor_bloqueos ( motivo, creado_en, levantado_en )
    `)
    .order('creado_en', { ascending: false });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  // El motivo vive en vendedor_bloqueos (no es público). Al panel le
  // interesa el bloqueo vigente: el que todavía no se levantó.
  const bloqueoVigente = (bloqueos) =>
    (bloqueos || [])
      .filter((b) => !b.levantado_en)
      .sort((a, b) => new Date(b.creado_en) - new Date(a.creado_en))[0] || null;

  const vendedores = (data || []).map((v) => ({
    ...v,
    productos_count: v.productos?.length ?? 0,
    productos: undefined,
    bloqueo_actual: bloqueoVigente(v.vendedor_bloqueos),
    vendedor_bloqueos: undefined,
  }));

  // El conteo se hace acá y no en el navegador: es una cuenta de la base, no
  // un filtro sobre la lista que le mandamos al cliente.
  const desde = new Date(Date.now() - DIAS_NUEVO * 24 * 60 * 60 * 1000).toISOString();
  const { count: nuevos, error: errorConteo } = await admin
    .from('vendedores')
    .select('*', { count: 'exact', head: true })
    .gte('creado_en', desde);

  if (errorConteo) {
    return NextResponse.json({ error: errorConteo.message }, { status: 500 });
  }

  return NextResponse.json({
    vendedores,
    resumen: { total: vendedores.length, nuevos: nuevos ?? 0, dias_nuevo: DIAS_NUEVO },
  });
}
