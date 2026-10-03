// Guarda la ubicación de la tienda de quien tiene la sesión. Es el único
// lugar que escribe esas columnas de 'vendedores': desde la migración 018 el
// navegador no tiene permiso.
//
// Con "Sí" (direccionVisible) se guarda la dirección y el punto exacto. Con
// "No", la calle y las dos entrecalles, y el punto redondeado a la grilla de
// ~200 m: el exacto no se guarda nunca, ni se escribe en ningún log. El
// barrio sale del punto exacto, antes de redondear, para que el redondeo no
// cambie el barrio ni la zona de cadetería. La base vuelve a redondear como
// segunda barrera (disparador redondear_zona).
//
// La tienda sale de la sesión, nunca de un parámetro. Escribe con
// service_role, que saltea el disparador de la 006: por eso acá se reabre a
// mano la revisión de una tienda a la que se le pidieron cambios.

import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { getServiceRoleClient } from '@/lib/supabase/admin';
import { redondearPunto, LARGO_MAX_CALLE } from '@/lib/zonaVendedor';

// El partido de Bahía Blanca, con margen. Solo descarta puntos absurdos; el
// control fino es que el barrio sea de la localidad elegida.
const AREA = { latMin: -39.5, latMax: -38.3, lngMin: -63.0, lngMax: -61.5 };

function rechazo(status, error) {
  return NextResponse.json({ error }, { status });
}

function texto(valor, largoMax) {
  if (typeof valor !== 'string') return null;
  const limpio = valor.trim().replace(/\s+/g, ' ');
  if (!limpio || limpio.length > largoMax) return null;
  return limpio;
}

function numero(valor) {
  return typeof valor === 'number' && Number.isFinite(valor) ? valor : null;
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
    console.error('Ubicación: no se pudo leer el usuario', user.id, errorUsuario.message);
    return rechazo(500, 'No pudimos guardar tu ubicación.');
  }
  if (usuario?.cerrada_en) return rechazo(403, 'Esta cuenta fue eliminada.');

  const { data: vendedor, error: errorVendedor } = await admin
    .from('vendedores')
    .select('id, localidad_id, estado_validacion, direccion_visible, latitud, longitud, barrio_id, barrio_detectado_automaticamente')
    .eq('usuario_id', user.id)
    .maybeSingle();
  if (errorVendedor) {
    console.error('Ubicación: no se pudo leer el vendedor', user.id, errorVendedor.message);
    return rechazo(500, 'No pudimos guardar tu ubicación.');
  }
  if (!vendedor) return rechazo(404, 'No encontramos tu cuenta de vendedor.');

  // ── Localidad: activa, o la que la tienda ya tenía (017) ──
  const localidadId = Number(cuerpo.localidadId);
  if (!Number.isInteger(localidadId)) return rechazo(400, 'Elegí tu localidad.');
  const { data: localidad } = await admin
    .from('localidades')
    .select('id, activa')
    .eq('id', localidadId)
    .maybeSingle();
  if (!localidad) return rechazo(400, 'Elegí tu localidad.');
  if (!localidad.activa && localidad.id !== vendedor.localidad_id) {
    return rechazo(400, 'Por ahora Bahía Shops no está disponible en esa localidad.');
  }

  // ── Qué se muestra ──
  const direccionVisible = cuerpo.direccionVisible === true;
  let direccion = null;
  let zona = { zona_calle: null, zona_entre: null, zona_y: null };
  if (direccionVisible) {
    direccion = texto(cuerpo.direccion, 200);
    if (!direccion) return rechazo(400, 'Escribí tu dirección.');
  } else {
    const calle = texto(cuerpo.zonaCalle, LARGO_MAX_CALLE);
    const entre = texto(cuerpo.zonaEntre, LARGO_MAX_CALLE);
    const y = texto(cuerpo.zonaY, LARGO_MAX_CALLE);
    if (!calle || !entre || !y) return rechazo(400, 'Completá la calle y las dos entrecalles.');
    zona = { zona_calle: calle, zona_entre: entre, zona_y: y };
  }

  // ── El punto y el barrio ──
  let latitud, longitud, barrioId, barrioAuto;

  // Quien ya tenía su zona guardada y no volvió a marcar: se queda con el
  // punto y el barrio que tenía. Volver a detectar el barrio desde el punto
  // redondeado podría cambiarlo.
  const mantener = cuerpo.mantenerPunto === true
    && !direccionVisible
    && vendedor.direccion_visible === false
    && vendedor.latitud !== null && vendedor.longitud !== null
    && localidadId === vendedor.localidad_id;

  if (mantener) {
    latitud = Number(vendedor.latitud);
    longitud = Number(vendedor.longitud);
    barrioId = vendedor.barrio_id;
    barrioAuto = vendedor.barrio_detectado_automaticamente;
  } else {
    const lat = numero(cuerpo.lat);
    const lng = numero(cuerpo.lng);
    if (lat === null || lng === null) {
      return rechazo(400, direccionVisible ? 'Marcá tu dirección en el mapa.' : 'Marcá tu cuadra en el mapa.');
    }
    if (lat < AREA.latMin || lat > AREA.latMax || lng < AREA.lngMin || lng > AREA.lngMax) {
      return rechazo(400, 'El punto que marcaste está fuera de la zona de Bahía Shops.');
    }

    // El barrio, con el punto exacto. Con el cliente de la sesión: es el
    // mismo permiso que usa el mapa del navegador.
    const { data: detectados, error: errorBarrio } = await supabase.rpc('barrio_en_punto', { lat, lng });
    if (errorBarrio) {
      console.error('Ubicación: no se pudo detectar el barrio', vendedor.id, errorBarrio.message);
      return rechazo(500, 'No pudimos detectar tu barrio. Probá de nuevo.');
    }
    const detectado = detectados && detectados.length > 0 ? detectados[0] : null;
    barrioId = detectado ? detectado.id : Number(cuerpo.barrioId);
    barrioAuto = !!detectado;
    if (!Number.isInteger(barrioId)) return rechazo(400, 'Elegí tu barrio.');

    const { data: barrio } = await admin
      .from('barrios')
      .select('id, localidad_id')
      .eq('id', barrioId)
      .maybeSingle();
    if (!barrio || barrio.localidad_id !== localidadId) {
      return rechazo(400, detectado
        ? 'El punto que marcaste no está en la localidad elegida.'
        : 'Elegí un barrio de tu localidad.');
    }

    if (direccionVisible) {
      latitud = lat;
      longitud = lng;
    } else {
      ({ lat: latitud, lng: longitud } = redondearPunto(lat, lng));
    }
  }

  const campos = {
    direccion_visible: direccionVisible,
    // Mientras exista, recibe_publico acompaña a la elección nueva.
    recibe_publico: direccionVisible,
    localidad_id: localidadId,
    direccion,
    ...zona,
    barrio_id: barrioId,
    barrio_detectado_automaticamente: barrioAuto,
    latitud,
    longitud,
  };
  // Lo que hacía la 006 cuando el vendedor guardaba desde el navegador.
  if (vendedor.estado_validacion === 'necesita_cambios') campos.estado_validacion = 'pendiente';

  const { data: guardado, error: errorGuardar } = await admin
    .from('vendedores')
    .update(campos)
    .eq('id', vendedor.id)
    .select('latitud, longitud, barrio:barrios(id, nombre)')
    .single();

  if (errorGuardar) {
    if (/no está disponible/.test(errorGuardar.message)) return rechazo(400, errorGuardar.message);
    console.error('Ubicación: no se pudo guardar', vendedor.id, errorGuardar.message);
    return rechazo(500, 'No pudimos guardar tu ubicación.');
  }

  return NextResponse.json({
    ok: true,
    barrio: guardado.barrio,
    latitud: Number(guardado.latitud),
    longitud: Number(guardado.longitud),
  });
}
