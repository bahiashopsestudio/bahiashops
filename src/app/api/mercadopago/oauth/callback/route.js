// Vuelta del OAuth de MercadoPago.
//
// Acá aterriza el NAVEGADOR del vendedor, no un fetch: todas las salidas son
// redirecciones. Nunca devolvemos JSON, ni en éxito ni en error, porque la
// persona vería texto crudo en pantalla.

import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createClient as createAdminClient } from '@supabase/supabase-js';
import { MP_CLIENT_ID, MP_CLIENT_SECRET, MP_REDIRECT_URI } from '@/lib/mercadopago/config';
import { leerCuentaDeMp, contarPagosEnProceso } from '@/lib/mercadopago/cuenta';
import { enviarMailCuentaMp } from '@/lib/mailsCuentaMp';
import { COOKIE_ESTADO_MP, estadoMpValido } from '@/lib/mercadopago/estado';

const PERFIL = '/vendedor/perfil';

// Toda salida borra la cookie del "state": sirve una sola vez.
function limpiarEstado(respuesta) {
  respuesta.cookies.delete(COOKIE_ESTADO_MP);
  return respuesta;
}

function alPerfil(request, params) {
  const url = new URL(PERFIL, request.url);
  for (const [clave, valor] of Object.entries(params)) {
    url.searchParams.set(clave, valor);
  }
  return limpiarEstado(NextResponse.redirect(url));
}

function conError(request, motivo) {
  return alPerfil(request, { mp: 'error', motivo });
}

export async function GET(request) {
  const { searchParams } = new URL(request.url);
  const code = searchParams.get('code');

  if (!code) {
    return conError(request, 'sin_codigo');
  }

  // 0. ¿Esta conexión la empezó este navegador? El "state" que devuelve
  // MercadoPago tiene que ser el de la cookie que se guardó al empezar. Sin esto,
  // alguien podría armar un link con SU código y hacer que se conecte su cuenta
  // a la tienda de otra persona. Va antes de canjear el código.
  const guardado = request.cookies?.get(COOKIE_ESTADO_MP)?.value;
  if (!estadoMpValido(searchParams.get('state'), guardado)) {
    console.warn('Conexión de MercadoPago rechazada: el state no coincide o no hay cookie.');
    return conError(request, 'state_invalido');
  }

  // 1. ¿Quién es el vendedor que está conectando? (usa su sesión)
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    // Perdió la cookie mientras estaba en MercadoPago. Mandarlo al perfil
    // solo lo rebotaría a /entrar, así que va derecho ahí, con vuelta al
    // perfil. Ya tiene cuenta: se abre "Ya tengo cuenta".
    const url = new URL('/entrar', request.url);
    url.searchParams.set('next', PERFIL);
    url.searchParams.set('motivo', 'sesion_mp');
    url.searchParams.set('modo', 'cuenta');
    return limpiarEstado(NextResponse.redirect(url));
  }

  const { data: vendedor, error: errorVendedor } = await supabase
    .from('vendedores')
    .select('id, nombre_negocio')
    .eq('usuario_id', user.id)
    .maybeSingle();

  if (errorVendedor || !vendedor) {
    return conError(request, 'sin_vendedor');
  }

  // 2. Canjear el código por las llaves del vendedor.
  const respuesta = await fetch('https://api.mercadopago.com/oauth/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      client_id: MP_CLIENT_ID,
      client_secret: MP_CLIENT_SECRET,
      grant_type: 'authorization_code',
      code: code,
      redirect_uri: MP_REDIRECT_URI,
    }),
  });

  const datos = await respuesta.json();

  if (!respuesta.ok) {
    // El detalle queda en el log del servidor: nunca viaja al navegador.
    console.error(
      'MercadoPago rechazó el canje para el vendedor', vendedor.id,
      '| status:', respuesta.status,
      '| error:', datos?.error, '| message:', datos?.message
    );
    return conError(request, 'canje_rechazado');
  }

  // Sin el id de la cuenta de MercadoPago no se guarda nada: el webhook lo usa
  // para confirmar que un pago lo cobró este vendedor, y sin él ninguna de
  // sus ventas se marcaría como pagada. Mejor que reintente ahora.
  const mpUserId = datos?.user_id === undefined || datos?.user_id === null
    ? ''
    : String(datos.user_id).trim();

  if (!mpUserId) {
    console.error('MercadoPago no devolvió user_id al conectar el vendedor', vendedor.id);
    return conError(request, 'canje_rechazado');
  }

  // 3. Guardar las llaves con la "llave maestra" (service role).
  const admin = createAdminClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
  );

  // La cuenta que había antes, si había. Hace falta ANTES de pisarla, para saber
  // si la tienda conectó la misma o una DISTINTA (y avisárselo por mail). Si no
  // se puede saber qué había, no se guarda nada: es mejor que reintente a pisar
  // a ciegas.
  const { data: previa, error: errorPrevia } = await admin
    .from('mercadopago_cuentas')
    .select('mp_user_id, mp_nickname')
    .eq('vendedor_id', vendedor.id)
    .maybeSingle();

  if (errorPrevia) {
    console.error('No se pudo leer la cuenta de MP anterior del vendedor', vendedor.id, '|', errorPrevia.message);
    return conError(request, 'no_guardado');
  }

  const idAnterior = previa && previa.mp_user_id !== null && previa.mp_user_id !== undefined
    ? String(previa.mp_user_id).trim()
    : '';
  const cuentaAnterior = previa ? { id: idAnterior || null, nickname: previa.mp_nickname || null } : null;
  const cambioDeCuenta = !!previa && idAnterior !== mpUserId;

  // Cómo se llama la cuenta nueva (para el panel y el mail). A mejor esfuerzo:
  // sin el nombre se conecta igual. Nunca se guarda el mail de la cuenta.
  const cuentaNueva = await leerCuentaDeMp(datos.access_token);
  // Si esta vez no se pudo leer y es la MISMA cuenta de siempre, se conserva el
  // nombre que ya se tenía (no se lo pisa con null).
  const nickname = (cuentaNueva && cuentaNueva.id === mpUserId ? cuentaNueva.nickname : null)
    ?? (!cambioDeCuenta && previa ? previa.mp_nickname || null : null);
  if (cuentaNueva && cuentaNueva.id !== mpUserId) {
    console.warn('MercadoPago devolvió otro id en /users/me que en el canje', vendedor.id);
  }

  const ahora = new Date().toISOString();
  const venceEn = new Date(Date.now() + datos.expires_in * 1000).toISOString();

  const fila = {
    vendedor_id: vendedor.id,
    mp_user_id: mpUserId,
    mp_nickname: nickname,
    access_token: datos.access_token,
    refresh_token: datos.refresh_token,
    public_key: datos.public_key,
    token_expira_en: venceEn,
    actualizado_en: ahora,
  };

  // conectado_en tiene que decir desde cuándo está conectada la cuenta ACTUAL.
  // La columna ya existía (timestamptz not null, default now()) y este upsert no
  // la mandaba: al conectar por primera vez nace con la hora de ahora, pero al
  // reconectar sobre la misma fila se quedaba con la fecha de la primera
  // conexión, aunque la cuenta fuera otra. Ahora se escribe cuando la cuenta es
  // nueva (primera conexión o cuenta distinta). Al volver a conectar la MISMA
  // cuenta no se manda: sigue siendo la misma cuenta conectada desde entonces, y
  // el upsert deja la columna como está.
  if (!previa || cambioDeCuenta) fila.conectado_en = ahora;

  const { error: errorGuardado } = await admin
    .from('mercadopago_cuentas')
    .upsert(fila, { onConflict: 'vendedor_id' });

  if (errorGuardado) {
    console.error(
      'No se pudo guardar la cuenta de MP del vendedor', vendedor.id,
      '|', errorGuardado.message
    );
    return conError(request, 'no_guardado');
  }

  // 4. Marcar al vendedor como conectado (para la interfaz).
  const { error: errorFlag } = await admin
    .from('vendedores')
    .update({ mercadopago_conectado: true })
    .eq('id', vendedor.id);

  if (errorFlag) {
    console.error(
      'Cuenta de MP guardada pero no se pudo marcar el vendedor', vendedor.id,
      '|', errorFlag.message
    );
    return conError(request, 'no_guardado');
  }

  // 5. La conexión ya quedó hecha. Lo que sigue es aviso: nada de esto puede
  // hacer fallar la conexión.
  //
  // Cambiar de cuenta no cancela ningún pedido: una venta existe solo cuando se
  // paga. Los links de pago sin usar vencen solos a las 2 horas, y los pagos en
  // efectivo en proceso se acreditan en la cuenta con la que se generaron.
  const pagosEnProceso = cambioDeCuenta ? await contarPagosEnProceso(admin, vendedor.id) : 0;

  // El mail al vendedor, a la dirección de su cuenta: lo protege si alguien más
  // conectó una cuenta con su sesión.
  await enviarMailCuentaMp({
    para: user.email,
    tipo: !previa ? 'primera' : cambioDeCuenta ? 'cambio' : 'misma',
    tienda: vendedor.nombre_negocio,
    cuenta: { id: mpUserId, nickname },
    anterior: cuentaAnterior && cuentaAnterior.id ? cuentaAnterior : null,
    pagosEnProceso,
  });

  return alPerfil(request, {
    mp: 'exito',
    ...(cambioDeCuenta ? { cambio: '1' } : {}),
  });
}
