// Guarda cómo entrega la tienda de quien tiene la sesión: los métodos
// (metodos_entrega_default) y los precios por zona (costos_envio_zona). Es el
// único lugar que los escribe: lo llaman el alta y "Cómo entregás".
//
// La regla es validarEntrega(), de src/lib/metodosEntrega.js: la misma que la
// pantalla usa para avisar antes de mandar. Acá decide. La base la vuelve a
// exigir con los CHECK de la migración 020.
//
// La tienda sale de la sesión, nunca de un parámetro. Escribe con
// service_role, que saltea el disparador de la 006: por eso acá se reabre a
// mano la revisión de una tienda a la que se le pidieron cambios, como hace
// /api/vendedor/ubicacion.

import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { getServiceRoleClient } from '@/lib/supabase/admin';
import { validarEntrega } from '@/lib/metodosEntrega';

function rechazo(status, error) {
  return NextResponse.json({ error }, { status });
}

export async function POST(request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return rechazo(401, 'Iniciá sesión.');

  let cuerpo;
  try {
    cuerpo = await request.json();
  } catch {
    return rechazo(400, 'Pedido inválido.');
  }

  const admin = getServiceRoleClient();

  // El token de una cuenta eliminada sigue valiendo un rato (ver 016).
  const { data: usuario, error: errorUsuario } = await admin
    .from('usuarios')
    .select('cerrada_en')
    .eq('id', user.id)
    .maybeSingle();
  if (errorUsuario) {
    console.error('Entrega: no se pudo leer el usuario', user.id, errorUsuario.message);
    return rechazo(500, 'No pudimos guardar tus formas de entrega.');
  }
  if (usuario?.cerrada_en) return rechazo(403, 'Esta cuenta fue eliminada.');

  const { data: vendedor, error: errorVendedor } = await admin
    .from('vendedores')
    .select('id, latitud, longitud, estado_validacion')
    .eq('usuario_id', user.id)
    .maybeSingle();
  if (errorVendedor) {
    console.error('Entrega: no se pudo leer el vendedor', user.id, errorVendedor.message);
    return rechazo(500, 'No pudimos guardar tus formas de entrega.');
  }
  if (!vendedor) return rechazo(404, 'No encontramos tu cuenta de vendedor.');

  const validado = validarEntrega({
    metodos: cuerpo?.metodos,
    costos: cuerpo?.costos,
    tienePunto: vendedor.latitud !== null && vendedor.latitud !== undefined &&
      vendedor.longitud !== null && vendedor.longitud !== undefined,
  });
  if (!validado.ok) return rechazo(400, validado.error);

  const campos = {
    metodos_entrega_default: validado.metodos,
    costos_envio_zona: validado.costos,
  };
  // Lo que hacía la 006 cuando el vendedor guardaba desde el navegador.
  if (vendedor.estado_validacion === 'necesita_cambios') campos.estado_validacion = 'pendiente';

  const { error: errorGuardar } = await admin
    .from('vendedores')
    .update(campos)
    .eq('id', vendedor.id);

  if (errorGuardar) {
    console.error('Entrega: no se pudo guardar', vendedor.id, errorGuardar.message);
    return rechazo(500, 'No pudimos guardar tus formas de entrega.');
  }

  return NextResponse.json({ ok: true, metodos: validado.metodos, costos: validado.costos });
}
