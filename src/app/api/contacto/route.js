// Recibe un mensaje del formulario de contacto y manda una notificación
// por email a tu casilla usando Resend.

import { NextResponse } from 'next/server';

export async function POST(request) {
  const { email, mensaje } = await request.json();

  if (!email || !mensaje) {
    return NextResponse.json(
      { error: 'Faltan datos.' },
      { status: 400 }
    );
  }

  try {
    const respuesta = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${process.env.RESEND_API_KEY}`,
      },
      body: JSON.stringify({
        from: 'Bahía Shops <no-reply@bahiashops.com.ar>',
        to: 'bahiashops.estudio@gmail.com',
        subject: `Nuevo mensaje de contacto de ${email}`,
        reply_to: email,
        html: `
          <div style="font-family: sans-serif; max-width: 500px;">
            <h2 style="color: #8B7EC8;">Nuevo mensaje de contacto</h2>
            <p><strong>De:</strong> ${email}</p>
            <hr style="border: none; border-top: 1px solid #eee; margin: 16px 0;" />
            <p style="white-space: pre-wrap;">${mensaje}</p>
          </div>
        `,
      }),
    });

    if (!respuesta.ok) {
      const error = await respuesta.json();
      console.error('Error de Resend:', error);
      return NextResponse.json(
        { error: 'No se pudo enviar el email.' },
        { status: 500 }
      );
    }

    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error('Error enviando email de contacto:', err);
    return NextResponse.json(
      { error: 'Error interno.' },
      { status: 500 }
    );
  }
}