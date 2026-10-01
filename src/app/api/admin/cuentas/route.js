// Buscar una cuenta por mail y ver si se puede eliminar (para las cuentas de
// prueba). Solo admin. No cambia nada.
//
// Devuelve lo mínimo para decidir: mail, apodo, estado y el resultado de
// evaluar con sus números. Nada de nombre, teléfono ni pedidos.

import { NextResponse } from 'next/server';
import { getServiceRoleClient, verificarAdmin } from '@/lib/supabase/admin';
import { buscarCuentaPorMail, evaluarCuenta } from '@/lib/eliminarCuenta';

export async function GET(request) {
  const admin_user = await verificarAdmin();
  if (!admin_user) {
    return NextResponse.json({ error: 'No autorizado.' }, { status: 403 });
  }

  const email = new URL(request.url).searchParams.get('email');
  if (!email || !email.trim()) {
    return NextResponse.json({ error: 'Escribí un mail.' }, { status: 400 });
  }

  const admin = getServiceRoleClient();

  const busqueda = await buscarCuentaPorMail(admin, email);
  if (!busqueda.ok) {
    return NextResponse.json({ error: 'No se pudo buscar. Probá de nuevo.' }, { status: 500 });
  }
  if (!busqueda.cuenta) {
    return NextResponse.json({ encontrada: false });
  }

  const { id, email: mail, nombre_usuario, cerrada_en } = busqueda.cuenta;
  const base = { encontrada: true, id, email: mail, apodo: nombre_usuario || null, eliminada: !!cerrada_en };

  if (cerrada_en) {
    return NextResponse.json({ ...base, puede: false, motivos: [], numeros: null });
  }

  const evaluacion = await evaluarCuenta(admin, id);

  if (!evaluacion.ok) {
    const sinMp = evaluacion.error === 'mp_no_responde';
    return NextResponse.json(
      { error: sinMp
          ? 'MercadoPago no respondió como se esperaba. No se puede confirmar que no haya pagos pendientes.'
          : 'No se pudo revisar la cuenta. Probá de nuevo.' },
      { status: sinMp ? 503 : 500 }
    );
  }

  return NextResponse.json({
    ...base,
    puede: evaluacion.puede,
    motivos: evaluacion.motivos,
    numeros: evaluacion.numeros || null,
  });
}
