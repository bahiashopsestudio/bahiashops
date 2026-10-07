// src/lib/mercadopago/tokens.js
// "Guardián" de tokens: se asegura de que el access_token del vendedor
// esté vigente antes de usarlo. Si está por vencer, lo renueva solo.

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
    throw new Error('VENDEDOR_SIN_MP');
  }

  // 2. ¿El token todavía tiene vida útil?
  const ahora = new Date();
  const vence = new Date(cuenta.token_expira_en);
  const diasRestantes = (vence - ahora) / (1000 * 60 * 60 * 24);

  const mpUserId = idDeCuenta(cuenta.mp_user_id);

  if (diasRestantes > MARGEN_DIAS) {
    // Tranqui, todavía le queda. Devolvemos el que hay.
    return { accessToken: cuenta.access_token, mpUserId };
  }

  // 3. Le quedan menos de 7 días (o ya venció). Toca renovar.
  if (!cuenta.refresh_token) {
    // No hay refresh_token → el vendedor tiene que reconectar a mano.
    await marcarDesconectado(vendedorId, admin);
    throw new Error('TOKEN_SIN_REFRESH');
  }

  // 4. Pedirle a MercadoPago llaves nuevas con el refresh_token.
  const respuesta = await fetch('https://api.mercadopago.com/oauth/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      client_secret: MP_CLIENT_SECRET,
      grant_type: 'refresh_token',
      refresh_token: cuenta.refresh_token,
    }),
  });

  const datos = await respuesta.json();

  if (!respuesta.ok) {
    // MercadoPago rechazó: el vendedor revocó el permiso, o algo raro pasó.
    console.error('Error renovando token MP para vendedor', vendedorId, datos);
    await marcarDesconectado(vendedorId, admin);
    throw new Error('REFRESH_RECHAZADO');
  }

  // 5. Guardar las llaves nuevas en la base.
  //    ¡Ojo! MercadoPago da un refresh_token NUEVO cada vez que renovás,
  //    así que hay que guardar ese también, no solo el access_token.
  const nuevoVencimiento = new Date(
    Date.now() + datos.expires_in * 1000
  ).toISOString();

  const { error: errorUpdate } = await admin
    .from('mercadopago_cuentas')
    .update({
      access_token: datos.access_token,
      refresh_token: datos.refresh_token,
      token_expira_en: nuevoVencimiento,
      actualizado_en: new Date().toISOString(),
    })
    .eq('vendedor_id', vendedorId);

  if (errorUpdate) {
    // Si no se pudo guardar, igual devolvemos el token nuevo.
    // La próxima vez va a volver a intentar renovar.
    console.error('Token renovado pero no se pudo guardar:', errorUpdate);
  }

  return { accessToken: datos.access_token, mpUserId };
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
  await admin
    .from('vendedores')
    .update({ mercadopago_conectado: false })
    .eq('id', vendedorId);
}