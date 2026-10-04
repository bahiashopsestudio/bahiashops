// Cuánto sale el envío de la tienda a una dirección de quien compra. Lo usa
// el checkout para mostrar "Envío a tu zona: $X", o que la tienda no llega.
//
// Calcula igual que /api/pedidos/crear (zonaTiendaPara y la lista de
// metodosEntrega.js): lo que se muestra acá es lo que después se cobra. El
// cobro igual vuelve a calcular todo; esto sólo informa.
//
// Responde { estado, zona, costo }:
//   'ok'          la tienda llega: zona y costo (0 = envío gratis).
//   'sin_precio'  hay zona, pero la tienda no puso precio para ella.
//   'sin_zona'    falta el punto de la tienda o el de la dirección (queda
//                 registrado). A quien compra nunca se le muestra la distancia.
//   'no_ofrece'   la tienda no hace envíos propios.

import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { getServiceRoleClient } from '@/lib/supabase/admin';
import { metodosConfigurados, zonaDe, precioDeZona } from '@/lib/metodosEntrega';
import { zonaTiendaPara } from '@/lib/zonaEnvio';

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

  const vendedorId = Number(cuerpo?.vendedorId);
  const direccionId = Number(cuerpo?.direccionId);
  if (!Number.isInteger(vendedorId) || vendedorId <= 0 || !Number.isInteger(direccionId) || direccionId <= 0) {
    return rechazo(400, 'Faltan datos para calcular el envío.');
  }

  const admin = getServiceRoleClient();

  const { data: vendedor, error: errorVendedor } = await admin
    .from('vendedores')
    .select('id, latitud, longitud, bloqueado, estado_validacion, metodos_entrega_default, costos_envio_zona')
    .eq('id', vendedorId)
    .maybeSingle();
  if (errorVendedor) {
    console.error('Cotizar: no se pudo leer la tienda', vendedorId, errorVendedor.message);
    return rechazo(500, 'No pudimos calcular el envío.');
  }
  if (!vendedor || vendedor.bloqueado || vendedor.estado_validacion !== 'aprobado') {
    return rechazo(404, 'Esta tienda no está disponible.');
  }

  if (!metodosConfigurados(vendedor).includes('envio_tienda')) {
    return NextResponse.json({ estado: 'no_ofrece', zona: null, costo: null });
  }

  // La dirección tiene que ser de quien pregunta. Inexistente y ajena reciben
  // la misma respuesta.
  const { data: direccion, error: errorDireccion } = await admin
    .from('direcciones')
    .select('id, lat, lng')
    .eq('id', direccionId)
    .eq('usuario_id', user.id)
    .maybeSingle();
  if (errorDireccion) {
    console.error('Cotizar: no se pudo leer la dirección', direccionId, errorDireccion.message);
    return rechazo(500, 'No pudimos calcular el envío.');
  }
  if (!direccion) return rechazo(403, 'La dirección no es válida.');

  let zona;
  try {
    zona = await zonaTiendaPara({ admin, vendedor, direccion, origen: 'cotizar' });
  } catch (err) {
    console.error('Cotizar: no se pudo calcular la zona', err.message);
    return rechazo(500, 'No pudimos calcular el envío.');
  }

  if (zona === null) {
    return NextResponse.json({ estado: 'sin_zona', zona: null, costo: null });
  }

  const precio = precioDeZona(vendedor.costos_envio_zona, zonaDe('envio_tienda', zona).clave);
  if (precio === null) {
    return NextResponse.json({ estado: 'sin_precio', zona, costo: null });
  }
  return NextResponse.json({ estado: 'ok', zona, costo: precio });
}
