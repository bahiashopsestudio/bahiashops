// src/lib/mercadopago/tokens.js
// "Guardián" de tokens: se asegura de que el access_token del vendedor
// esté vigente antes de usarlo. Si está por vencer, lo renueva solo.
//
// Una renovación que falla NO desconecta la cuenta mientras el token siga
// vigente: se sigue usando y se marca mercadopago_cuentas.renovacion_fallida_en
// (migración 040). El aviso a la tienda lo manda la tarea diaria, una vez
// (src/lib/tareaDiaria.js). Solo con el token ya vencido se desconecta, como
// antes.

import { MP_CLIENT_SECRET } from './config';

// Margen de seguridad: si faltan menos de 7 días para que venza, renovamos.
const MARGEN_DIAS = 7;

/**
 * Devuelve un access_token válido para el vendedor.
 * Si el token está por vencer (menos de 7 días), lo renueva automáticamente
 * usando el refresh_token que MercadoPago nos dio al conectar.
 *
 * @param {number} vendedorId - ID del vendedor en la tabla vendedores
 * @param {object} admin - Cliente de Supabase con service role key
 * @returns {string} access_token válido
 */
export async function getValidAccessToken(vendedorId, admin) {
  return (await getCuentaValida(vendedorId, admin)).accessToken;
}

/**
 * Lo mismo, pero devuelve también QUÉ cuenta de MercadoPago es (su mp_user_id),
 * leída en la MISMA consulta que el token: así el token y el id no pueden ser de
 * cuentas distintas aunque la tienda cambie de cuenta justo en ese momento.
 * Lo usa /api/pedidos/crear para guardar en el pedido qué cuenta lo cobra.
 *
 * @returns {{ accessToken: string, mpUserId: string|null }}
 */
export async function getCuentaValida(vendedorId, admin) {
  // 1. Buscar las llaves del vendedor en la base.
  const { data: cuenta, error } = await admin
    .from('mercadopago_cuentas')
    .select('access_token, refresh_token, token_expira_en, mp_user_id')
    .eq('vendedor_id', vendedorId)
    .single();

  if (error || !cuenta) {
    // PGRST116 es "no hay fila": una tienda sin MercadoPago conectado, no un error.
    if (error && error.code !== 'PGRST116') console.error('[mp-tokens/mercadopago_cuentas]', error.message);
    throw new Error('VENDEDOR_SIN_MP');
  }

  // 2. ¿El token todavía tiene vida útil?
  const ahora = Date.now();
  const vence = Date.parse(cuenta.token_expira_en);
  const diasRestantes = (vence - ahora) / (1000 * 60 * 60 * 24);

  const mpUserId = idDeCuenta(cuenta.mp_user_id);

  if (diasRestantes > MARGEN_DIAS) {
    // Tranqui, todavía le queda. Devolvemos el que hay.
    return { accessToken: cuenta.access_token, mpUserId };
  }

  // 3. Le quedan menos de 7 días (o ya venció). Toca renovar.
  const renovacion = await renovarToken({ admin, vendedorId, refreshToken: cuenta.refresh_token });
  if (renovacion.ok) return { accessToken: renovacion.accessToken, mpUserId };

  // 4. No se pudo. Si el token todavía sirve, se usa y queda la marca: la
  //    tarea diaria avisa a la tienda (una vez). Ningún mail desde acá. Si
  //    MercadoPago ni respondió (red), no se marca: se reintenta la próxima.
  const vigente = Number.isFinite(vence) && vence > ahora;
  if (vigente) {
    if (renovacion.codigo !== 'MP_SIN_RESPUESTA') {
      await marcarRenovacionFallida({ admin, vendedorId, error: renovacion.error });
    }
    return { accessToken: cuenta.access_token, mpUserId };
  }

  // 5. Ya venció de verdad: como siempre, se desconecta. Si MercadoPago ni
  //    respondió (red caída), no se desconecta: como antes, falla y se
  //    reintenta la próxima vez.
  if (renovacion.codigo === 'MP_SIN_RESPUESTA') throw new Error('MP_SIN_RESPUESTA');
  await marcarDesconectado(vendedorId, admin);
  throw new Error(renovacion.codigo);
}

/**
 * Le pide a MercadoPago llaves nuevas con el refresh_token y las guarda. No
 * desconecta ni marca nada: eso lo decide quien llama. Nunca lanza.
 *
 * Guarda solo si el refresh_token de la fila sigue siendo el que se usó: si
 * otra renovación (la compra y la tarea diaria a la vez) o una reconexión ya
 * guardó otro, no lo pisa.
 *
 * @returns {{ ok: true, accessToken: string, expiraEn: string }
 *         | { ok: false, codigo: 'TOKEN_SIN_REFRESH'|'REFRESH_RECHAZADO'|'MP_SIN_RESPUESTA', error: string }}
 *   error: para el log y la base, sin tokens.
 */
export async function renovarToken({ admin, vendedorId, refreshToken }) {
  if (!refreshToken) {
    return { ok: false, codigo: 'TOKEN_SIN_REFRESH', error: 'La cuenta no tiene refresh_token.' };
  }

  let respuesta;
  let datos;
  try {
    respuesta = await fetch('https://api.mercadopago.com/oauth/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        client_secret: MP_CLIENT_SECRET,
        grant_type: 'refresh_token',
        refresh_token: refreshToken,
      }),
      signal: AbortSignal.timeout(10000),
    });
    datos = await respuesta.json().catch(() => ({}));
  } catch (err) {
    console.error('No se pudo llamar a MercadoPago para renovar el token del vendedor', vendedorId, err?.message || err);
    return { ok: false, codigo: 'MP_SIN_RESPUESTA', error: `MercadoPago no respondió: ${String(err?.message || err).slice(0, 200)}` };
  }

  if (!respuesta.ok || !datos?.access_token || !Number.isFinite(Number(datos?.expires_in))) {
    // MercadoPago rechazó: el vendedor revocó el permiso, o algo raro pasó.
    const detalle = [datos?.error, datos?.message].filter(Boolean).join(' · ') || 'sin detalle';
    console.error('Error renovando token MP para vendedor', vendedorId, respuesta.status, detalle);
    return { ok: false, codigo: 'REFRESH_RECHAZADO', error: `MercadoPago respondió ${respuesta.status}: ${detalle}`.slice(0, 300) };
  }

  // Guardar las llaves nuevas en la base.
  // ¡Ojo! MercadoPago da un refresh_token NUEVO cada vez que renovás, así que
  // hay que guardar ese también, no solo el access_token. Al cambiar los
  // tokens, la base limpia la marca de renovación fallida (040).
  const expiraEn = new Date(Date.now() + Number(datos.expires_in) * 1000).toISOString();

  const { data: guardada, error: errorUpdate } = await admin
    .from('mercadopago_cuentas')
    .update({
      access_token: datos.access_token,
      refresh_token: datos.refresh_token,
      token_expira_en: expiraEn,
      actualizado_en: new Date().toISOString(),
    })
    .eq('vendedor_id', vendedorId)
    .eq('refresh_token', refreshToken)
    .select('vendedor_id')
    .maybeSingle();

  if (errorUpdate) {
    // Si no se pudo guardar, igual devolvemos el token nuevo.
    // La próxima vez va a volver a intentar renovar.
    console.error('Token renovado pero no se pudo guardar:', errorUpdate.message);
  } else if (!guardada) {
    console.warn('Token renovado pero la cuenta ya tenía otro refresh_token (otra renovación o una reconexión): no se pisa. Vendedor', vendedorId);
  }

  return { ok: true, accessToken: datos.access_token, expiraEn };
}

/**
 * Deja la marca de renovación fallida (040). renovacion_fallida_en guarda la
 * PRIMERA falla desde la última renovación buena; renovacion_error, la última.
 * Nunca lanza.
 */
export async function marcarRenovacionFallida({ admin, vendedorId, error }) {
  const texto = String(error ?? 'sin detalle').slice(0, 500);
  try {
    const { data, error: errorMarca } = await admin
      .from('mercadopago_cuentas')
      .update({ renovacion_fallida_en: new Date().toISOString(), renovacion_error: texto })
      .eq('vendedor_id', vendedorId)
      .is('renovacion_fallida_en', null)
      .select('vendedor_id')
      .maybeSingle();
    if (errorMarca) {
      console.error('[mp-tokens/marcar-renovacion-fallida]', vendedorId, errorMarca.message);
      return;
    }
    if (!data) {
      const { error: errorTexto } = await admin
        .from('mercadopago_cuentas')
        .update({ renovacion_error: texto })
        .eq('vendedor_id', vendedorId);
      if (errorTexto) console.error('[mp-tokens/marcar-renovacion-fallida]', vendedorId, errorTexto.message);
    }
  } catch (err) {
    console.error('[mp-tokens/marcar-renovacion-fallida]', vendedorId, err?.message || err);
  }
}

// El id de la cuenta, o null si falta o quedó guardado como el texto "null" o
// "undefined" (lo mismo que trata como vacío validarPago.js).
function idDeCuenta(valor) {
  const texto = valor === null || valor === undefined ? '' : String(valor).trim();
  return texto === '' || texto === 'null' || texto === 'undefined' ? null : texto;
}

/**
 * Marca al vendedor como desconectado de MercadoPago.
 * En la UI le va a aparecer el botón de "Reconectar".
 */
async function marcarDesconectado(vendedorId, admin) {
  const { error } = await admin
    .from('vendedores')
    .update({ mercadopago_conectado: false })
    .eq('id', vendedorId);
  if (error) console.error('[mp-tokens/marcar-desconectado]', error.message);
}
