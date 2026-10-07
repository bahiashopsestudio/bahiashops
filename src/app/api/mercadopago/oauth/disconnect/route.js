// Desconecta la cuenta de MercadoPago del vendedor que está logueado.
//
// El vendedor NUNCA viaja en el request: se resuelve desde la sesión. Así no
// hay forma de pedir la desconexión de una cuenta ajena.

import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createClient as createAdminClient } from '@supabase/supabase-js';
import { getCuentaValida } from '@/lib/mercadopago/tokens';
import { cancelarPendientesDeTienda } from '@/lib/mercadopago/cuenta';
import { enviarMailCuentaMp, avisarLinksSinVencer } from '@/lib/mailsCuentaMp';

export async function POST() {
  // 1. ¿Hay sesión?
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json(
      { error: 'No hay una sesión iniciada.' },
      { status: 401 }
    );
  }

  // 2. ¿Qué vendedor es? Sale de la sesión, no de lo que mande el cliente.
  const { data: vendedor } = await supabase
    .from('vendedores')
    .select('id, nombre_negocio')
    .eq('usuario_id', user.id)
    .maybeSingle();

  if (!vendedor) {
    return NextResponse.json(
      { error: 'No encontramos tu cuenta de vendedor.' },
      { status: 404 }
    );
  }

  const admin = createAdminClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
  );

  // 3a. Los pedidos sin pagar de esta tienda tienen links que cobran para la
  // cuenta que se va a desconectar, y sin cuenta conectada nadie podría
  // verificar un pago ahí. Antes de borrar los tokens (hacen falta para vencer
  // los links) se cancelan esos pedidos. Es mejor esfuerzo: si algo falla, la
  // desconexión sigue igual (es lo que la persona pidió).
  let cuentaAnterior = null;
  let cancelados = 0;
  let pagosEnProceso = 0;
  try {
    const { data: previa } = await admin
      .from('mercadopago_cuentas')
      .select('mp_user_id, mp_nickname')
      .eq('vendedor_id', vendedor.id)
      .maybeSingle();

    if (previa) {
      const id = previa.mp_user_id === null || previa.mp_user_id === undefined ? '' : String(previa.mp_user_id).trim();
      cuentaAnterior = id ? { id, nickname: previa.mp_nickname || null } : null;

      let tokenViejo = null;
      try {
        ({ accessToken: tokenViejo } = await getCuentaValida(vendedor.id, admin));
      } catch (err) {
        console.warn('Desconexión de MP: sin token para vencer los links de la tienda', vendedor.id, '|', err.message);
      }

      const resultado = await cancelarPendientesDeTienda({
        admin, vendedorId: vendedor.id, motivo: 'cuenta_mp_cambiada', cuentaAConservar: null, tokenViejo,
        contexto: 'Desconexión de MercadoPago',
      });
      cancelados = resultado.cancelados;
      pagosEnProceso = resultado.en_proceso;
      if (resultado.sin_vencer.length > 0) {
        await avisarLinksSinVencer({ tiendaId: vendedor.id, tienda: vendedor.nombre_negocio, pedidos: resultado.sin_vencer });
      }
    }
  } catch (err) {
    console.error('Desconexión de MP: falló la limpieza de pedidos de la tienda', vendedor.id, '|', err?.message || err);
  }

  // 3. Primero borrar los tokens, después marcar el booleano.
  //    El orden importa: si se cayera en el medio, preferimos quedar con
  //    "conectado: true" y sin tokens (se ve mal pero no guarda nada) antes
  //    que con "conectado: false" y los tokens todavía en la base.
  const { data: borradas, error: errorBorrado } = await admin
    .from('mercadopago_cuentas')
    .delete()
    .eq('vendedor_id', vendedor.id)
    .select('vendedor_id');

  if (errorBorrado) {
    console.error('Error borrando la cuenta de MP del vendedor', vendedor.id, errorBorrado.message);
    return NextResponse.json(
      { error: 'No pudimos desconectar tu cuenta. Probá de nuevo en un momento.' },
      { status: 500 }
    );
  }

  // 4. Recién ahora, con los tokens ya fuera de la base, apagamos el flag.
  const { error: errorFlag } = await admin
    .from('vendedores')
    .update({ mercadopago_conectado: false })
    .eq('id', vendedor.id);

  if (errorFlag) {
    // Los tokens ya no están, así que no se puede cobrar con esta cuenta:
    // la desconexión real ya ocurrió. Lo que quedó mal es el cartel.
    console.error('Tokens borrados pero no se pudo apagar el flag del vendedor', vendedor.id, errorFlag.message);
    return NextResponse.json(
      { error: 'Desconectamos tu cuenta, pero no pudimos actualizar el estado. Recargá la página.' },
      { status: 500 }
    );
  }

  // El mail al vendedor, a la dirección de su cuenta (solo si había una cuenta
  // conectada): lo protege si alguien más desconectó con su sesión.
  if ((borradas?.length ?? 0) > 0) {
    await enviarMailCuentaMp({
      para: user.email,
      tipo: 'desconexion',
      tienda: vendedor.nombre_negocio,
      anterior: cuentaAnterior,
      pedidosCancelados: cancelados,
      pagosEnProceso,
    });
  }

  return NextResponse.json({
    ok: true,
    pedidosCancelados: cancelados,
    // false cuando no había ninguna conexión guardada (por ejemplo, si tocó
    // desconectar dos veces): igual dejamos todo consistente.
    habiaConexion: (borradas?.length ?? 0) > 0,
    mensaje: 'Desconectamos tu cuenta de MercadoPago.',
  });
}
