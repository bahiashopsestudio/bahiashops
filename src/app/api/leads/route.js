// Interesados en vender alimentos (el formulario de la categoría Alimentos en
// el alta de vendedor, FormularioVendedor.jsx): guarda el contacto y avisa a
// nuestra casilla por mail.
//
// Desde la migración 032 el navegador no puede escribir en leads_gastronomia:
// se guarda acá, con service_role. Reemplaza a /api/lead-gastronomia, que solo
// mandaba el mail (y, abierta a cualquiera, servía para mandarnos mails sin
// guardar nada).
//
// El mail es aviso: si falla, el contacto igual quedó guardado y la respuesta
// es ok.

import { Resend } from 'resend';
import { getServiceRoleClient } from '@/lib/supabase/admin';
import { EMAIL_CONTACTO, EMAIL_NOTIFICACIONES, REMITENTE_CONTACTO } from '@/lib/contacto';
import { escapar } from '@/lib/mailBase';
import { validarLead } from '@/lib/formulariosPublicos';

// Para el asunto: una sola línea, sin saltos que se puedan colar en el
// encabezado del mail.
function enUnaLinea(valor) {
  return String(valor ?? '').replace(/[\r\n\u2028\u2029]+/g, ' ');
}

export async function POST(request) {
  let cuerpo;
  try {
    cuerpo = await request.json();
  } catch {
    return Response.json({ ok: false, error: 'No pudimos leer los datos.' }, { status: 400 });
  }

  const validado = validarLead(cuerpo);
  if (!validado.ok) {
    return Response.json({ ok: false, error: validado.error }, { status: 400 });
  }
  const { nombre, queHace, whatsapp, email } = validado;

  const admin = getServiceRoleClient();
  const { error: errorGuardar } = await admin
    .from('leads_gastronomia')
    .insert({ nombre, whatsapp, que_hace: queHace, email });
  if (errorGuardar) {
    console.error('Lead gastronómico: no se pudo guardar —', errorGuardar.message);
    return Response.json({ ok: false, error: 'No se pudo guardar. Probá de nuevo.' }, { status: 500 });
  }

  // Lo que escribe la persona va adentro del HTML del mail interno: escapado,
  // para que no pueda meter etiquetas o links propios en nuestra casilla.
  let avisado = false;
  try {
    const resend = new Resend(process.env.RESEND_API_KEY);
    await resend.emails.send({
      from: REMITENTE_CONTACTO,
      to: EMAIL_NOTIFICACIONES,
      reply_to: EMAIL_CONTACTO,
      subject: `🍳 Nuevo lead gastronómico: ${enUnaLinea(nombre)}`,
      html: `
        <div style="font-family: sans-serif; max-width: 500px;">
          <h2 style="margin-bottom: 4px;">Nuevo interesado en planes gastronómicos</h2>
          <p style="color: #666; margin-top: 0;">Alguien quiso registrarse como vendedor de alimentos frescos/preparados.</p>
          <hr style="border: none; border-top: 1px solid #eee;" />
          <p><strong>Nombre:</strong> ${escapar(nombre)}</p>
          <p><strong>Qué hace:</strong> ${escapar(queHace)}</p>
          <p><strong>WhatsApp:</strong> ${whatsapp ? escapar(whatsapp) : 'No proporcionado'}</p>
          <p><strong>Email:</strong> ${email ? escapar(email) : 'No proporcionado'}</p>
          <hr style="border: none; border-top: 1px solid #eee;" />
          <p style="color: #999; font-size: 12px;">
            Este lead llegó desde el formulario de registro de vendedores en Bahía Shops.
          </p>
        </div>
      `,
    });
    avisado = true;
  } catch (error) {
    console.error('Lead gastronómico: no se pudo mandar el aviso —', error?.message || error);
  }

  return Response.json({ ok: true, avisado });
}
