import { Resend } from 'resend';
import { EMAIL_CONTACTO, EMAIL_NOTIFICACIONES, REMITENTE_CONTACTO } from '@/lib/contacto';
import { escapar } from '@/lib/mailBase';

const resend = new Resend(process.env.RESEND_API_KEY);

// Lo que escribe la persona va adentro del HTML del mail interno: sin escapar,
// podría meter etiquetas o links propios en nuestra casilla (igual que en
// /api/contacto). Llega como JSON, así que puede no ser un texto: se pasa a
// texto antes de usarlo.
function comoTexto(valor) {
  return valor === null || valor === undefined ? '' : String(valor).trim();
}

// Para el asunto: una sola línea, sin saltos que se puedan colar en el
// encabezado del mail.
function enUnaLinea(valor) {
  return comoTexto(valor).replace(/[\r\n\u2028\u2029]+/g, ' ');
}

export async function POST(request) {
  try {
    const cuerpo = await request.json();
    const nombre = comoTexto(cuerpo?.nombre);
    const whatsapp = comoTexto(cuerpo?.whatsapp);
    const queHace = comoTexto(cuerpo?.queHace);
    const email = comoTexto(cuerpo?.email);

    if (!nombre || !queHace) {
      return Response.json(
        { ok: false, error: 'Nombre y actividad son obligatorios.' },
        { status: 400 }
      );
    }

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

    return Response.json({ ok: true });
  } catch (error) {
    console.error('Error enviando email de lead gastronómico:', error);
    return Response.json(
      { ok: false, error: 'No se pudo enviar el email.' },
      { status: 500 }
    );
  }
}