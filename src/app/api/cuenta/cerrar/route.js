// Eliminar mi cuenta (derecho de supresión, Ley 25.326).
//
// GET  precheck: la página lo llama al abrirse para saber si se puede eliminar
//      y, si no, por qué. No cambia nada.
// POST elimina. Repite TODAS las verificaciones: lo que dijo el GET pudo
//      cambiar mientras la persona leía.
//
// La identidad sale de la sesión, nunca del body: no hay forma de eliminar la
// cuenta de otra persona por acá. La lógica vive en lib/eliminarCuenta.js y la
// base hace el trabajo en una sola transacción (migración 016).

import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { getServiceRoleClient } from '@/lib/supabase/admin';
import { evaluarCuenta, eliminarCuenta, resumenDeEvaluacion, confirmacionValida } from '@/lib/eliminarCuenta';
import { enviarMailCuentaEliminada } from '@/lib/mailsCuenta';

const SIN_SESION = () => NextResponse.json({ error: 'Iniciá sesión.' }, { status: 401 });
const MP_NO_RESPONDE = () => NextResponse.json({ error: 'mp_no_responde' }, { status: 503 });
const ERROR_INESPERADO = () => NextResponse.json({ error: 'No pudimos revisar tu cuenta. Probá de nuevo en unos minutos.' }, { status: 500 });

export async function GET() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return SIN_SESION();

  const evaluacion = await evaluarCuenta(getServiceRoleClient(), user.id);

  if (!evaluacion.ok) {
    return evaluacion.error === 'mp_no_responde' ? MP_NO_RESPONDE() : ERROR_INESPERADO();
  }

  return NextResponse.json(resumenDeEvaluacion(evaluacion));
}

export async function POST(request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return SIN_SESION();

  let body;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'No pudimos leer lo que mandaste.' }, { status: 400 });
  }

  if (!confirmacionValida(body?.confirmacion)) {
    return NextResponse.json({ error: 'Para confirmar, escribí ELIMINAR.' }, { status: 400 });
  }

  const admin = getServiceRoleClient();
  const resultado = await eliminarCuenta(admin, user.id);

  if (!resultado.ok) {
    if (resultado.status === 503) return MP_NO_RESPONDE();
    if (resultado.status === 409) {
      // Algo cambió entre el precheck y el botón: se devuelven los motivos nuevos.
      return NextResponse.json(resumenDeEvaluacion(resultado.evaluacion), { status: 409 });
    }
    return ERROR_INESPERADO();
  }

  // La cuenta ya no existe (o quedó anónima y bloqueada): se cierra la sesión
  // de esta persona. 'local' no le pregunta nada a Supabase, que ya no la tiene.
  try {
    await supabase.auth.signOut({ scope: 'local' });
  } catch (err) {
    console.warn('Eliminar cuenta: no se pudo limpiar la sesión —', err?.message || err);
  }

  // El mail final, esperado antes de responder (en Vercel lo que queda después
  // de la respuesta puede no ejecutarse). Si falla, no cambia nada: la cuenta
  // ya está eliminada.
  if (resultado.resultado !== 'ya_cerrada') {
    await enviarMailCuentaEliminada({ emails: resultado.emails, nombre: resultado.nombre });
  }

  return NextResponse.json({ ok: true });
}
