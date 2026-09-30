// Votos de las preguntas "¿te gustaría…?".
//
// La tabla votos_funciones está cerrada al navegador (RLS sin permisos para
// anon ni authenticated), así que todo pasa por acá. La identidad sale de la
// cookie: cada persona ve y cambia sólo su propio voto.

import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { getServiceRoleClient } from '@/lib/supabase/admin';
import { preguntaPorId } from '@/lib/preguntas';

async function usuarioDeLaSesion() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  return user;
}

const SIN_SESION = () => NextResponse.json({ error: 'Iniciá sesión.' }, { status: 401 });
const FUNCION_INVALIDA = () => NextResponse.json({ error: 'Esa pregunta no existe.' }, { status: 400 });

export async function GET(request) {
  const user = await usuarioDeLaSesion();
  if (!user) return SIN_SESION();

  const funcion = new URL(request.url).searchParams.get('funcion');
  if (!preguntaPorId(funcion)) return FUNCION_INVALIDA();

  const admin = getServiceRoleClient();
  const { data, error } = await admin
    .from('votos_funciones')
    .select('voto')
    .eq('usuario_id', user.id)
    .eq('funcion', funcion)
    .maybeSingle();

  if (error) {
    console.error('No se pudo leer el voto', user.id, funcion, error.message);
    return NextResponse.json({ error: 'No pudimos leer tu voto.' }, { status: 500 });
  }

  return NextResponse.json({ voto: data ? data.voto : null });
}

export async function POST(request) {
  const user = await usuarioDeLaSesion();
  if (!user) return SIN_SESION();

  let body;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'No pudimos leer los datos.' }, { status: 400 });
  }

  const funcion = body?.funcion;
  if (!preguntaPorId(funcion)) return FUNCION_INVALIDA();

  if (typeof body?.voto !== 'boolean') {
    return NextResponse.json({ error: 'El voto tiene que ser sí o no.' }, { status: 400 });
  }

  const admin = getServiceRoleClient();
  const { data, error } = await admin
    .from('votos_funciones')
    .upsert(
      { usuario_id: user.id, funcion, voto: body.voto, actualizado_en: new Date().toISOString() },
      { onConflict: 'usuario_id,funcion' }
    )
    .select('voto')
    .maybeSingle();

  if (error) {
    console.error('No se pudo guardar el voto', user.id, funcion, error.message);
    return NextResponse.json({ error: 'No pudimos guardar tu voto.' }, { status: 500 });
  }

  return NextResponse.json({ voto: data ? data.voto : body.voto });
}
