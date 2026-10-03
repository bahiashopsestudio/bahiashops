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
import { cookies } from 'next/headers';
import { createClient } from '@/lib/supabase/server';
import { getServiceRoleClient } from '@/lib/supabase/admin';
import { evaluarCuenta, eliminarCuenta, resumenDeEvaluacion, confirmacionValida } from '@/lib/eliminarCuenta';
import { enviarMailCuentaEliminada } from '@/lib/mailsCuenta';

// Cuánto se le espera a Supabase para cerrar la sesión. Es solo limpieza: la
// cuenta ya está eliminada, así que no puede frenar nada.
const TIEMPO_MAXIMO_SIGNOUT_MS = 3000;

// Cierra la sesión de esta persona sin poder trabar la respuesta. signOut es
// una llamada de red (POST /logout), y con la cuenta recién eliminada o
// bloqueada puede tardar o fallar: se le da un tiempo máximo corto, los errores
// se capturan y, pase lo que pase, las cookies de sesión se borran igual.
async function cerrarSesionSinTrabar(supabase, usuarioId) {
  let reloj;
  try {
    await Promise.race([
      supabase.auth.signOut({ scope: 'local' }),
      new Promise((resolve) => {
        reloj = setTimeout(() => {
          console.warn(`Eliminar cuenta ${usuarioId}: signOut tardó más de ${TIEMPO_MAXIMO_SIGNOUT_MS} ms; se sigue sin esperarlo.`);
          resolve();
        }, TIEMPO_MAXIMO_SIGNOUT_MS);
      }),
    ]);
  } catch (err) {
    console.warn(`Eliminar cuenta ${usuarioId}: signOut falló —`, err?.message || err);
  } finally {
    clearTimeout(reloj);
  }

  // Las cookies de sesión de Supabase (y sus fragmentos), siempre.
  try {
    const almacen = await cookies();
    for (const c of almacen.getAll()) {
      if (/^sb-.+-(auth-token|code-verifier)/.test(c.name)) almacen.delete(c.name);
    }
  } catch (err) {
    console.warn(`Eliminar cuenta ${usuarioId}: no se pudieron borrar las cookies —`, err?.message || err);
  }
}

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

  // Una copia del mail y del nombre, leída ANTES de eliminar, con la identidad
  // de la cookie. Es el respaldo para el mail final: después de eliminar ya no
  // hay de dónde sacarlos.
  const emailDeLaSesion = typeof user.email === 'string' ? user.email.trim() : '';
  let nombreAntes = null;
  try {
    const { data: perfil } = await admin.from('usuarios').select('nombre').eq('id', user.id).maybeSingle();
    nombreAntes = (perfil?.nombre || '').trim() || null;
  } catch (err) {
    console.warn(`Eliminar cuenta ${user.id}: no se pudo leer el nombre antes de eliminar —`, err?.message || err);
  }

  const resultado = await eliminarCuenta(admin, user.id);

  if (!resultado.ok) {
    if (resultado.status === 503) return MP_NO_RESPONDE();
    if (resultado.status === 409) {
      // Algo cambió entre el precheck y el botón: se devuelven los motivos nuevos.
      return NextResponse.json(resumenDeEvaluacion(resultado.evaluacion), { status: 409 });
    }
    return ERROR_INESPERADO();
  }

  // La cuenta ya está eliminada: de acá en más nada la revierte. Lo que sigue
  // (el mail y el cierre de sesión) es aviso y limpieza, y ninguno puede frenar
  // la respuesta de "listo".

  // El mail final, ANTES del cierre de sesión y esperado antes de responder (en
  // Vercel lo que queda después de la respuesta puede no ejecutarse). Va a las
  // direcciones que devolvió la base y a la de la sesión, sin repetir. Si falla,
  // el error se registra con el id del usuario (nunca la dirección).
  if (resultado.resultado !== 'ya_cerrada') {
    try {
      await enviarMailCuentaEliminada({
        emails: [...(resultado.emails || []), emailDeLaSesion],
        nombre: resultado.nombre || nombreAntes,
        usuarioId: user.id,
      });
    } catch (err) {
      console.error(`Eliminar cuenta ${user.id}: el mail final falló —`, err?.message || err);
    }
  }

  // Después, la limpieza de la sesión, con tiempo máximo.
  await cerrarSesionSinTrabar(supabase, user.id);

  return NextResponse.json({ ok: true });
}
