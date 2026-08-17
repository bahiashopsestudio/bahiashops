import { Resend } from 'resend';

const resend = new Resend(process.env.RESEND_API_KEY);

export async function POST(request) {
  try {
    const { provincia, ciudad } = await request.json();

    if (!provincia || !ciudad) {
      return Response.json(
        { ok: false, error: 'Provincia y ciudad son obligatorias.' },
        { status: 400 }
      );
    }

    await resend.emails.send({
      from: 'Bahía Shops <hola@bahiashops.com.ar>',
      to: 'bahiashops.estudio@gmail.com',
      subject: `📍 Interés en Local Shops: ${ciudad}, ${provincia}`,
      html: `
        <div style="font-family: sans-serif; max-width: 500px;">
          <h2 style="margin-bottom: 4px;">Nuevo interés en Local Shops</h2>
          <p style="color: #666; margin-top: 0;">Alguien quiere que Local Shops llegue a su ciudad.</p>
          <hr style="border: none; border-top: 1px solid #eee;" />
          <p><strong>Provincia:</strong> ${provincia}</p>
          <p><strong>Ciudad:</strong> ${ciudad}</p>
          <hr style="border: none; border-top: 1px solid #eee;" />
          <p style="color: #999; font-size: 12px;">
            Este interés llegó desde el formulario de la página /local-shops.
          </p>
        </div>
      `,
    });

    return Response.json({ ok: true });
  } catch (error) {
    console.error('Error enviando email de interés en Local Shops:', error);
    return Response.json(
      { ok: false, error: 'No se pudo enviar el email.' },
      { status: 500 }
    );
  }
}
