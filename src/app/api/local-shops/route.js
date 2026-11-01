// El formulario público de /local-shops: quien quiere que Local Shops llegue a
// su ciudad. Guarda provincia, ciudad y fecha, y avisa a nuestra casilla. No
// pide sesión ni datos de contacto.
//
// La tabla está cerrada al navegador (migración 045). Como la ruta es pública,
// hay dos barreras contra la basura: un campo trampa (empresa_web, invisible
// para las personas: si llega lleno, se responde ok y no se hace nada) y un
// tope de pedidos por día, que aplica la base al guardar. Pasado el tope no se
// guarda ni sale el mail.
//
// El mail es aviso: si falla, el pedido igual quedó guardado y la respuesta es
// ok. Si no se pudo guardar, no sale, como en /api/leads y /api/contacto.

import { Resend } from 'resend';
import { getServiceRoleClient } from '@/lib/supabase/admin';
import { EMAIL_CONTACTO, EMAIL_NOTIFICACIONES, REMITENTE_CONTACTO } from '@/lib/contacto';
import { escapar, enUnaLinea } from '@/lib/mailBase';
import { validarPedidoLocalShops } from '@/lib/formulariosPublicos';

export async function POST(request) {
  let cuerpo;
  try {
    cuerpo = await request.json();
  } catch {
    return Response.json({ ok: false, error: 'No pudimos leer los datos.' }, { status: 400 });
  }

  if (cuerpo?.empresa_web) return Response.json({ ok: true });

  const validado = validarPedidoLocalShops(cuerpo);
  if (!validado.ok) {
    return Response.json({ ok: false, error: validado.error }, { status: 400 });
  }
  const { provincia, ciudad } = validado;

  const admin = getServiceRoleClient();
  const { data: resultado, error: errorGuardar } = await admin.rpc('rpc_registrar_local_shops', {
    p_provincia: provincia,
    p_ciudad: ciudad,
  });
  if (errorGuardar) {
    console.error('Local Shops: no se pudo guardar —', errorGuardar.message);
    return Response.json({ ok: false, error: 'No se pudo guardar. Probá de nuevo.' }, { status: 500 });
  }
  if (!resultado?.ok) {
    console.error('Local Shops: se llegó al tope de pedidos del día; este no se guardó.');
    return Response.json({ ok: false, error: 'Recibimos muchos pedidos hoy. Probá de nuevo mañana.' }, { status: 429 });
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
      subject: `📍 Interés en Local Shops: ${enUnaLinea(ciudad)}, ${enUnaLinea(provincia)}`,
      html: `
        <div style="font-family: sans-serif; max-width: 500px;">
          <h2 style="margin-bottom: 4px;">Nuevo interés en Local Shops</h2>
          <p style="color: #666; margin-top: 0;">Alguien quiere que Local Shops llegue a su ciudad.</p>
          <hr style="border: none; border-top: 1px solid #eee;" />
          <p><strong>Provincia:</strong> ${escapar(provincia)}</p>
          <p><strong>Ciudad:</strong> ${escapar(ciudad)}</p>
          <hr style="border: none; border-top: 1px solid #eee;" />
          <p style="color: #999; font-size: 12px;">
            Este interés llegó desde el formulario de la página /local-shops.
          </p>
        </div>
      `,
    });
    avisado = true;
  } catch (error) {
    console.error('Local Shops: no se pudo mandar el aviso —', error?.message || error);
  }

  return Response.json({ ok: true, avisado });
}
