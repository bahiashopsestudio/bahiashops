import { Resend } from 'resend';
import { EMAIL_CONTACTO, EMAIL_NOTIFICACIONES, REMITENTE_CONTACTO } from '@/lib/contacto';

const resend = new Resend(process.env.RESEND_API_KEY);

export async function POST(request) {
  try {
    const { nombre, whatsapp, queHace, email } = await request.json();

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
      subject: `🍳 Nuevo lead gastronómico: ${nombre}`,
      html: `
        <div style="font-family: sans-serif; max-width: 500px;">
          <h2 style="margin-bottom: 4px;">Nuevo interesado en planes gastronómicos</h2>
          <p style="color: #666; margin-top: 0;">Alguien quiso registrarse como vendedor de alimentos frescos/preparados.</p>
          <hr style="border: none; border-top: 1px solid #eee;" />
          <p><strong>Nombre:</strong> ${nombre}</p>
          <p><strong>Qué hace:</strong> ${queHace}</p>
          <p><strong>WhatsApp:</strong> ${whatsapp || 'No proporcionado'}</p>
          <p><strong>Email:</strong> ${email || 'No proporcionado'}</p>
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