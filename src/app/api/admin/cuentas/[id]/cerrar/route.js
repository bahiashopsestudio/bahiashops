// Eliminar una cuenta desde el admin (para las cuentas de prueba).
//
// Es EL MISMO proceso que usa la persona, con las mismas verificaciones: no
// hay atajo. Lo único distinto es que no pide la confirmación escrita ni manda
// el mail a la persona (la confirmación es el modal del admin).
//
// Un admin no puede eliminar su propia cuenta, ni la de otro admin (la base lo
// rechaza: primero hay que quitarle el permiso).

import { NextResponse } from 'next/server';
import { getServiceRoleClient, verificarAdmin } from '@/lib/supabase/admin';
import { eliminarCuenta, resumenDeEvaluacion } from '@/lib/eliminarCuenta';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function POST(request, { params }) {
  const admin_user = await verificarAdmin();
  if (!admin_user) {
    return NextResponse.json({ error: 'No autorizado.' }, { status: 403 });
  }

  const { id } = await params;
  if (!UUID.test(String(id))) {
    return NextResponse.json({ error: 'La cuenta no es válida.' }, { status: 400 });
  }
  if (id.toLowerCase() === String(admin_user.id).toLowerCase()) {
    return NextResponse.json({ error: 'No podés eliminar tu propia cuenta desde acá.' }, { status: 403 });
  }

  const resultado = await eliminarCuenta(getServiceRoleClient(), id);

  if (!resultado.ok) {
    if (resultado.status === 409) {
      return NextResponse.json(resumenDeEvaluacion(resultado.evaluacion), { status: 409 });
    }
    if (resultado.status === 503) {
      return NextResponse.json({ error: 'MercadoPago no respondió como se esperaba. No se eliminó nada.' }, { status: 503 });
    }
    return NextResponse.json({ error: 'No se pudo eliminar la cuenta.' }, { status: 500 });
  }

  console.log(`Eliminar cuenta (admin ${admin_user.id}): ${id} -> ${resultado.resultado}`);
  return NextResponse.json({ ok: true, resultado: resultado.resultado });
}
