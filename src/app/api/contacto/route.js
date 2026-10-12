// El formulario de contacto («Contactanos», ModalContacto.jsx): guarda el
// mensaje y avisa a nuestra casilla por mail.
//
// Desde la migración 032 el navegador no puede escribir en mensajes_contacto:
// el mensaje se guarda acá, con service_role. La cuenta a nombre de la que sale
// (usuario_id) la decide el servidor con la sesión de ESTE pedido, nunca el
// navegador: así no se puede mandar un mensaje a nombre de otra persona, y si
// la sesión se cerró con el formulario abierto, sale sin cuenta.
//
// El mail es aviso: si falla, el mensaje igual quedó guardado y la respuesta es
// ok (como antes, cuando lo guardaba el navegador).

import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { getServiceRoleClient } from '@/lib/supabase/admin';
import { EMAIL_NOTIFICACIONES, REMITENTE_NO_REPLY } from '@/lib/contacto';
import { escapar } from '@/lib/mailBase';
import { validarContacto } from '@/lib/formulariosPublicos';

export async function POST(request) {
  let cuerpo;
  try {
    cuerpo = await request.json();
  } catch {
    return NextResponse.json({ error: 'No pudimos leer el mensaje.' }, { status: 400 });
  }

  const validado = validarContacto(cuerpo);
  if (!validado.ok) {
    return NextResponse.json({ error: validado.error }, { status: 400 });
  }
  const { email, mensaje } = validado;

  // La cuenta, de la sesión de este pedido (o ninguna).
  let usuarioId = null;
  try {
    const supabase = await createClient();
    const { data } = await supabase.auth.getUser();
    usuarioId = data?.user?.id || null;
  } catch {
    usuarioId = null;
  }

  const admin = getServiceRoleClient();
  const { error: errorGuardar } = await admin
    .from('mensajes_contacto')
    .insert({ email, mensaje, usuario_id: usuarioId });
  if (errorGuardar) {
    console.error('Contacto: no se pudo guardar el mensaje —', errorGuardar.message);
    return NextResponse.json({ error: 'No se pudo enviar el mensaje.' }, { status: 500 });
  }

  // El aviso a nuestra casilla. Lo que escribe la persona va escapado: sin
  // escapar podría meter etiquetas o links propios en el mail. El email ya
  // pasó la validación (una sola línea, sin espacios), así que no puede colar
  // encabezados en el asunto.
  let avisado = false;
  try {
    const respuesta = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${process.env.RESEND_API_KEY}`,
      },
      body: JSON.stringify({
        from: REMITENTE_NO_REPLY,
        to: EMAIL_NOTIFICACIONES,
        subject: `Nuevo mensaje de contacto de ${email}`,
        reply_to: email,
        html: `
          <div style="font-family: sans-serif; max-width: 500px;">
            <h2 style="color: #4164fe;">Nuevo mensaje de contacto</h2>
            <p><strong>De:</strong> ${escapar(email)}</p>
            <hr style="border: none; border-top: 1px solid #eee; margin: 16px 0;" />
            <p style="white-space: pre-wrap;">${escapar(mensaje)}</p>
          </div>
        `,
      }),
    });
    avisado = respuesta.ok;
    if (!respuesta.ok) {
      console.error('Contacto: Resend no aceptó el aviso —', respuesta.status);
    }
  } catch (err) {
    console.error('Contacto: no se pudo mandar el aviso —', err?.message || err);
  }

  return NextResponse.json({ ok: true, avisado });
}
