// Cuánto sale el envío a una dirección de quien compra, para cada método por
// zona que ofrece la tienda (envío de la tienda y correo). Lo usa el checkout
// para mostrar "Envío a tu zona: $X", "Envío por correo: $X" o que no llega.
//
// Calcula igual que /api/pedidos/crear (zonasPara y la lista de
// metodosEntrega.js): lo que se muestra acá es lo que después se cobra. El
// cobro igual vuelve a calcular todo; esto sólo informa.
//
// Responde { envio_tienda, correo, falta_codigo_postal }. Cada método es
// { estado, zona, costo }, o null si la tienda no lo ofrece:
//   'ok'          llega: zona y costo (0 = envío gratis).
//   'sin_precio'  hay zona, pero la tienda no puso precio para ella.
//   'lejos'       el envío de la tienda no llega (más de 20 km).
//   'sin_zona'    falta el punto de la tienda o el de la dirección (queda
//                 registrado).
// A quien compra nunca se le muestran la distancia ni la zona.
// falta_codigo_postal: la dirección no tiene un código postal válido; el
// correo lo necesita.

import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { getServiceRoleClient } from '@/lib/supabase/admin';
import { metodosConfigurados, zonaDe, precioDeZona } from '@/lib/metodosEntrega';
import { zonasPara } from '@/lib/zonaEnvio';
import { codigoPostalValido } from '@/lib/direcciones';

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

  const metodos = metodosConfigurados(vendedor).filter((m) => m === 'envio_tienda' || m === 'correo');
  if (metodos.length === 0) {
    return NextResponse.json({ envio_tienda: null, correo: null, falta_codigo_postal: false });
  }

  // La dirección tiene que ser de quien pregunta. Inexistente y ajena reciben
  // la misma respuesta.
  const { data: direccion, error: errorDireccion } = await admin
    .from('direcciones')
    .select('id, lat, lng, codigo_postal')
    .eq('id', direccionId)
    .eq('usuario_id', user.id)
    .maybeSingle();
  if (errorDireccion) {
    console.error('Cotizar: no se pudo leer la dirección', direccionId, errorDireccion.message);
    return rechazo(500, 'No pudimos calcular el envío.');
  }
  if (!direccion) return rechazo(403, 'La dirección no es válida.');

  let zonas;
  try {
    zonas = await zonasPara({ admin, vendedor, direccion, origen: 'cotizar', metodos });
  } catch (err) {
    console.error('Cotizar: no se pudo calcular la zona', err.message);
    return rechazo(500, 'No pudimos calcular el envío.');
  }

  const respuesta = { envio_tienda: null, correo: null, falta_codigo_postal: !codigoPostalValido(direccion.codigo_postal) };
  for (const metodo of metodos) {
    const { zona, motivo } = zonas[metodo];
    if (zona === null) {
      respuesta[metodo] = { estado: motivo === 'lejos' ? 'lejos' : 'sin_zona', zona: null, costo: null };
      continue;
    }
    const precio = precioDeZona(vendedor.costos_envio_zona, zonaDe(metodo, zona).clave);
    respuesta[metodo] = precio === null
      ? { estado: 'sin_precio', zona, costo: null }
      : { estado: 'ok', zona, costo: precio };
  }
  return NextResponse.json(respuesta);
}
