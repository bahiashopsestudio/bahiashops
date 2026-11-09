// El formulario de /servicios («Próximamente»): quien quiere sumarse cuando
// abra la sección deja su email y su rubro. No pide sesión ni manda mails.
//
// La tabla está cerrada al navegador (migración 053). Como la ruta es pública,
// tiene las mismas dos barreras que /api/local-shops: un campo trampa
// (empresa_web, invisible para las personas: si llega lleno, se responde ok y
// no se hace nada) y un tope de anotaciones nuevas por día, que aplica la base
// al guardar.
//
// Nuevo o repetido, la respuesta es la misma ({ ok: true }): no se puede
// averiguar si un email ya estaba anotado.

import { getServiceRoleClient } from '@/lib/supabase/admin';
import { validarInteresServicios } from '@/lib/formulariosPublicos';

export async function POST(request) {
  let cuerpo;
  try {
    cuerpo = await request.json();
  } catch {
    return Response.json({ ok: false, error: 'No pudimos leer los datos.' }, { status: 400 });
  }

  if (cuerpo?.empresa_web) return Response.json({ ok: true });

  const validado = validarInteresServicios(cuerpo);
  if (!validado.ok) {
    return Response.json({ ok: false, campo: validado.campo, error: validado.error }, { status: 400 });
  }

  const admin = getServiceRoleClient();
  const { data: resultado, error } = await admin.rpc('rpc_registrar_interes_servicios', {
    p_email: validado.email,
    p_rubro: validado.rubro,
  });
  if (error) {
    console.error('Servicios: no se pudo guardar la anotación —', error.message);
    return Response.json({ ok: false, error: 'No pudimos anotarte. Probá de nuevo en un rato.' }, { status: 500 });
  }
  if (!resultado?.ok) {
    console.error('Servicios: se llegó al tope de anotaciones del día; esta no se guardó.');
    return Response.json({ ok: false, error: 'Hoy recibimos muchas anotaciones. Probá de nuevo mañana.' }, { status: 429 });
  }

  return Response.json({ ok: true });
}
