import { NextResponse } from 'next/server';
import { getServiceRoleClient, verificarAdmin } from '@/lib/supabase/admin';
import {
  mailAprobado,
  mailNecesitaCambios,
  mailBloqueado,
  mailDesbloqueado,
} from '@/lib/mailsValidacion';

// Lista cerrada: cualquier otro valor se rechaza con 400.
const ESTADOS_VALIDOS = ['pendiente', 'aprobado', 'necesita_cambios'];

// Arma el mail que corresponde, o null si esta escritura no lleva aviso.
function armarMail({ vendedor, estado, bloqueo, baseUrl }) {
  if (bloqueo === 'bloquear') {
    return mailBloqueado({
      nombreNegocio: vendedor.nombre_negocio,
      motivo: vendedor.motivo_bloqueo,
    });
  }
  if (bloqueo === 'desbloquear') {
    return mailDesbloqueado({
      nombreNegocio: vendedor.nombre_negocio,
      slug: vendedor.slug,
      baseUrl,
    });
  }
  if (estado === 'aprobado') {
    return mailAprobado({ nombreNegocio: vendedor.nombre_negocio, slug: vendedor.slug, baseUrl });
  }
  if (estado === 'necesita_cambios') {
    return mailNecesitaCambios({ nombreNegocio: vendedor.nombre_negocio, notas: vendedor.notas_validacion, baseUrl });
  }
  return null;
}

// Avisa al vendedor por mail. Nunca lanza: si falla, el cambio ya quedó
// guardado y no queremos deshacerlo por un problema de envío.
async function avisarAlVendedor({ vendedor, estado, bloqueo, admin, baseUrl }) {
  const mail = armarMail({ vendedor, estado, bloqueo, baseUrl });
  if (!mail) return { enviado: false, motivo: 'sin_aviso' };

  try {
    // El mail de contacto público es opcional: si no hay, va al de la cuenta.
    let destino = vendedor.email_contacto;
    if (!destino) {
      const { data: cuenta } = await admin
        .from('usuarios')
        .select('email')
        .eq('id', vendedor.usuario_id)
        .maybeSingle();
      destino = cuenta?.email || null;
    }

    if (!destino) {
      console.error('Sin dirección para avisar al vendedor', vendedor.id);
      return { enviado: false, motivo: 'sin_destinatario' };
    }

    const respuesta = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${process.env.RESEND_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ ...mail, to: destino }),
    });

    if (!respuesta.ok) {
      const detalle = await respuesta.text();
      console.error('Resend rechazó el aviso al vendedor', vendedor.id, respuesta.status, detalle.slice(0, 300));
      return { enviado: false, motivo: 'resend_error' };
    }

    return { enviado: true };
  } catch (err) {
    console.error('Error enviando el aviso al vendedor', vendedor.id, err);
    return { enviado: false, motivo: 'excepcion' };
  }
}

export async function PUT(request, { params }) {
  const admin_user = await verificarAdmin();
  if (!admin_user) {
    return NextResponse.json({ error: 'No autorizado.' }, { status: 403 });
  }

  const { id } = await params;
  const body = await request.json();

  const cambiaBloqueo = typeof body.bloqueado === 'boolean';
  const cambiaEstado = body.estado_validacion !== undefined;

  if (!cambiaBloqueo && !cambiaEstado) {
    return NextResponse.json(
      { error: 'Falta el campo bloqueado o estado_validacion.' },
      { status: 400 }
    );
  }

  // El update se arma campo por campo: nunca un spread del body, para que
  // mandar columnas de más no tenga ningún efecto.
  const campos = {};

  // 'bloquear' | 'desbloquear' | null — decide qué mail sale al final.
  let bloqueo = null;
  let motivoBloqueo = '';

  if (cambiaBloqueo) {
    motivoBloqueo = typeof body.motivo_bloqueo === 'string' ? body.motivo_bloqueo.trim() : '';

    if (body.bloqueado && !motivoBloqueo) {
      return NextResponse.json(
        { error: 'Para bloquear hay que escribir el motivo.' },
        { status: 400 }
      );
    }

    campos.bloqueado = body.bloqueado;
    bloqueo = body.bloqueado ? 'bloquear' : 'desbloquear';
  }

  if (cambiaEstado) {
    if (!ESTADOS_VALIDOS.includes(body.estado_validacion)) {
      return NextResponse.json(
        { error: 'Estado de validación inválido.' },
        { status: 400 }
      );
    }

    const notas = typeof body.notas_validacion === 'string' ? body.notas_validacion.trim() : '';

    if (body.estado_validacion === 'necesita_cambios' && !notas) {
      return NextResponse.json(
        { error: 'Para pedir cambios hay que escribir qué falta.' },
        { status: 400 }
      );
    }

    campos.estado_validacion = body.estado_validacion;
    campos.notas_validacion = notas || null;

    // Quién y cuándo revisó. El id sale de la sesión del admin, nunca del body.
    if (body.estado_validacion === 'pendiente') {
      // Volver a pendiente es deshacer la revisión: se limpia la firma.
      campos.validado_en = null;
      campos.validado_por = null;
    } else {
      campos.validado_en = new Date().toISOString();
      campos.validado_por = admin_user.id;
    }
  }

  const admin = getServiceRoleClient();
  const { data, error } = await admin
    .from('vendedores')
    .update(campos)
    .eq('id', id)
    .select()
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  // El motivo va a su propia tabla, que no es pública. Se registra después de
  // que el flag quedó guardado: si esto fallara, el vendedor ya está bloqueado
  // —que es lo importante— y el motivo se puede reponer a mano.
  let bloqueoActual = null;

  if (bloqueo === 'bloquear') {
    const { data: fila, error: errorBloqueo } = await admin
      .from('vendedor_bloqueos')
      .insert({ vendedor_id: Number(id), motivo: motivoBloqueo, bloqueado_por: admin_user.id })
      .select('motivo, creado_en, levantado_en')
      .single();

    if (errorBloqueo) {
      console.error('No se pudo registrar el motivo del bloqueo', id, errorBloqueo.message);
    }
    bloqueoActual = fila || null;
  }

  if (bloqueo === 'desbloquear') {
    const { error: errorLevantar } = await admin
      .from('vendedor_bloqueos')
      .update({ levantado_en: new Date().toISOString() })
      .eq('vendedor_id', id)
      .is('levantado_en', null);

    if (errorLevantar) {
      console.error('No se pudo cerrar el bloqueo', id, errorLevantar.message);
    }
  }

  // El mail va DESPUÉS de que la escritura salió bien, y no puede deshacerla.
  let aviso = { enviado: false, motivo: 'sin_aviso' };
  if (cambiaEstado || cambiaBloqueo) {
    aviso = await avisarAlVendedor({
      vendedor: { ...data, motivo_bloqueo: motivoBloqueo },
      estado: campos.estado_validacion,
      bloqueo,
      admin,
      baseUrl: new URL(request.url).origin,
    });
  }

  // bloqueo_actual acompaña a la fila para que el panel pinte el motivo sin
  // recargar la lista entera.
  return NextResponse.json({
    vendedor: { ...data, bloqueo_actual: bloqueoActual },
    aviso,
  });
}
