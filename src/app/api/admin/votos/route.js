// Resultados de las preguntas "¿te gustaría…?", para el panel de admin.
// Devuelve cada pregunta activa con la cantidad de Sí, de No y el total.

import { NextResponse } from 'next/server';
import { getServiceRoleClient, verificarAdmin } from '@/lib/supabase/admin';
import { PREGUNTAS } from '@/lib/preguntas';

export async function GET() {
  const admin_user = await verificarAdmin();
  if (!admin_user) {
    return NextResponse.json({ error: 'No autorizado.' }, { status: 403 });
  }

  const admin = getServiceRoleClient();

  // Cuenta en la base, sin traer los votos: no hace falta saber de quién son.
  async function contar(funcion, voto) {
    const { count, error } = await admin
      .from('votos_funciones')
      .select('usuario_id', { count: 'exact', head: true })
      .eq('funcion', funcion)
      .eq('voto', voto);
    if (error) throw new Error(error.message);
    return count || 0;
  }

  try {
    const preguntas = await Promise.all(
      PREGUNTAS.map(async (pregunta) => {
        const [si, no] = await Promise.all([contar(pregunta.id, true), contar(pregunta.id, false)]);
        return { id: pregunta.id, texto: pregunta.texto, si, no, total: si + no };
      })
    );
    return NextResponse.json({ preguntas });
  } catch (err) {
    console.error('No se pudieron contar los votos', err.message);
    return NextResponse.json({ error: 'No se pudieron contar los votos.' }, { status: 500 });
  }
}
