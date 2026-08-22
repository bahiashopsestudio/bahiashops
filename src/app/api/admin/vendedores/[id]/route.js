import { NextResponse } from 'next/server';
import { getServiceRoleClient, verificarAdmin } from '@/lib/supabase/admin';
import { mailAprobado, mailNecesitaCambios } from '@/lib/mailsValidacion';

// Lista cerrada: cualquier otro valor se rechaza con 400.
const ESTADOS_VALIDOS = ['pendiente', 'aprobado', 'necesita_cambios'];

// Avisa al vendedor por mail. Nunca lanza: si falla, la revisión ya quedó
// guardada y no queremos deshacerla por un problema de envío.
async function avisarAlVendedor({ vendedor, estado, admin, baseUrl }) {
  if (estado !== 'aprobado' && estado !== 'necesita_cambios') return { enviado: false, motivo: 'sin_aviso' };

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

    const mail = estado === 'aprobado'
      ? mailAprobado({ nombreNegocio: vendedor.nombre_negocio, slug: vendedor.slug, baseUrl })
      : mailNecesitaCambios({ nombreNegocio: vendedor.nombre_negocio, notas: vendedor.notas_validacion, baseUrl });

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

  if (cambiaBloqueo) {
    campos.bloqueado = body.bloqueado;
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

  // El mail va DESPUÉS de que la escritura salió bien, y no puede deshacerla.
  let aviso = { enviado: false, motivo: 'sin_aviso' };
  if (cambiaEstado) {
    aviso = await avisarAlVendedor({
      vendedor: data,
      estado: campos.estado_validacion,
      admin,
      baseUrl: new URL(request.url).origin,
    });
  }

  return NextResponse.json({ vendedor: data, aviso });
}
