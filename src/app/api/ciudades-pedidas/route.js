// Quien está en otra ciudad anota cuál, desde la pregunta del principio del
// alta. No crea ni toca ninguna tienda.
//
// La tabla está cerrada al navegador (migración 044): se escribe acá, con
// service_role. La cuenta y su mail salen de la sesión, nunca del cuerpo. Una
// fila por cuenta: si vuelve, se actualiza.

import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { getServiceRoleClient } from '@/lib/supabase/admin';
import { validarCiudadPedida } from '@/lib/formulariosPublicos';

const NO_SE_PUDO = 'No pudimos guardar tu ciudad. Probá de nuevo.';

function rechazo(status, error) {
  return NextResponse.json({ error }, { status });
}

export async function POST(request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return rechazo(401, 'Iniciá sesión.');
  if (!user.email) return rechazo(400, 'Tu cuenta no tiene un mail.');

  let cuerpo;
  try {
    cuerpo = await request.json();
  } catch {
    return rechazo(400, 'No pudimos leer los datos.');
  }

  const validado = validarCiudadPedida(cuerpo);
  if (!validado.ok) return rechazo(400, validado.error);

  const admin = getServiceRoleClient();

  // El token de una cuenta eliminada sigue valiendo un rato (ver 016).
  const { data: usuario, error: errorUsuario } = await admin
    .from('usuarios')
    .select('cerrada_en')
    .eq('id', user.id)
    .maybeSingle();
  if (errorUsuario) {
    console.error('Ciudad pedida: no se pudo leer el usuario', user.id, errorUsuario.message);
    return rechazo(500, NO_SE_PUDO);
  }
  if (usuario?.cerrada_en) return rechazo(403, 'Esta cuenta fue eliminada.');

  const { error } = await admin
    .from('ciudades_pedidas')
    .upsert(
      {
        usuario_id: user.id,
        ciudad: validado.ciudad,
        email: user.email,
        origen: 'alta',
        actualizado_en: new Date().toISOString(),
      },
      { onConflict: 'usuario_id' }
    );
  if (error) {
    console.error('Ciudad pedida: no se pudo guardar', user.id, error.message);
    return rechazo(500, NO_SE_PUDO);
  }

  return NextResponse.json({ ok: true, ciudad: validado.ciudad, email: user.email });
}
