// Regulariza los pedidos pendientes sin pago que se crearon ANTES de que los
// links de pago vencieran (no tienen pedidos.vence_en, y su link de MercadoPago
// no tiene fecha). Solo admin. Se usa una vez, después de publicar el
// vencimiento de pedidos (migración 022); queda por si un pedido se cuela entre
// la migración y la publicación.
//
// Por cada pedido pendiente, sin pago y sin vence_en, el vencimiento es
// creado_en + el plazo (src/lib/vencimientoPago.js):
//   · Si ya pasó: se vence el link en MercadoPago con el token de la tienda y el
//     pedido se cancela con motivo 'pago_vencido'.
//   · Si no pasó: se le pone el vencimiento al link en MercadoPago y se guarda
//     vence_en. Desde ahí lo cancela el flujo normal cuando venza.
//
// Dos modos, según el cuerpo (JSON):
//   { }                          SIMULACIÓN: solo lista qué haría, sin tocar
//                                nada (ni MercadoPago ni la base).
//   { "ejecutar": true }         lo hace.
//   { "vendedorId": 15 }         (opcional, en cualquiera de los dos) limita a
//                                una tienda.
//
// Si MercadoPago falla en un pedido, ese pedido se deja como está y se sigue
// con el resto. La respuesta trae el resultado pedido por pedido. Cada llamada
// procesa hasta MAXIMO_POR_LLAMADA pedidos: si hay más, "hay_mas" es true y se
// vuelve a llamar.
//
// Un pedido que tiene un pago (aunque sea en proceso) no se toca nunca.

import { NextResponse } from 'next/server';
import { getServiceRoleClient, verificarAdmin } from '@/lib/supabase/admin';
import { getValidAccessToken } from '@/lib/mercadopago/tokens';
import { vencerPreferencia, ponerVencimientoPreferencia } from '@/lib/mercadopago/preferencias';
import { calcularVencimiento, pedidoTienePago } from '@/lib/vencimientoPago';

// Cada pedido puede tardar hasta unos 16 segundos con MercadoPago.
export const maxDuration = 60;

const MAXIMO_POR_LLAMADA = 40;
const CONTEXTO = 'Regularizar pedidos';

export async function POST(request) {
  const admin_user = await verificarAdmin();
  if (!admin_user) {
    return NextResponse.json({ error: 'No autorizado.' }, { status: 403 });
  }

  const cuerpo = await request.json().catch(() => ({}));
  const ejecutar = cuerpo?.ejecutar === true;

  let vendedorId = null;
  if (cuerpo?.vendedorId !== undefined && cuerpo?.vendedorId !== null) {
    vendedorId = Number(cuerpo.vendedorId);
    if (!Number.isInteger(vendedorId) || vendedorId <= 0) {
      return NextResponse.json({ error: 'vendedorId tiene que ser un número entero.' }, { status: 400 });
    }
  }

  const admin = getServiceRoleClient();

  // ── Qué hay que regularizar ──
  let consulta = admin
    .from('pedidos')
    .select('id, vendedor_id, creado_en, mp_preference_id, mp_payment_id')
    .eq('estado', 'pendiente')
    .is('vence_en', null)
    .order('id')
    .limit(500);
  if (vendedorId !== null) consulta = consulta.eq('vendedor_id', vendedorId);

  const { data: filas, error: errorLectura } = await consulta;
  if (errorLectura) {
    console.error(`${CONTEXTO}: no se pudieron leer los pedidos —`, errorLectura.message);
    return NextResponse.json({ error: 'No se pudieron leer los pedidos.' }, { status: 500 });
  }

  // "Sin pago" se decide acá con la misma regla que la base (vacío, "null" o
  // "undefined"); un pedido con un pago en proceso no se toca.
  const candidatos = (filas || []).filter((p) => !pedidoTienePago(p));
  const lote = candidatos.slice(0, MAXIMO_POR_LLAMADA);
  const hayMas = candidatos.length > lote.length;

  const ahora = Date.now();
  const plan = lote.map((p) => {
    const creadoMs = Date.parse(p.creado_en);
    const venceMs = Number.isFinite(creadoMs) ? calcularVencimiento(creadoMs) : null;
    return {
      pedido: p.id,
      tienda: p.vendedor_id,
      creado_en: p.creado_en,
      vence_en: venceMs === null ? null : new Date(venceMs).toISOString(),
      accion: venceMs === null ? 'sin_fecha' : venceMs <= ahora ? 'vencer_y_cancelar' : 'poner_vencimiento',
      tiene_link: !!p.mp_preference_id,
      _preferencia: p.mp_preference_id,
      _venceMs: venceMs,
    };
  });

  // Qué tiendas tienen la cuenta de MercadoPago conectada (solo se mira si la
  // fila existe; en la simulación no se le pide ningún token a nadie).
  const tiendas = [...new Set(plan.map((x) => x.tienda))];
  const conectadas = new Set();
  if (tiendas.length > 0) {
    const { data: cuentas, error: errorCuentas } = await admin
      .from('mercadopago_cuentas')
      .select('vendedor_id')
      .in('vendedor_id', tiendas);
    if (errorCuentas) {
      console.error(`${CONTEXTO}: no se pudo leer qué tiendas tienen MercadoPago —`, errorCuentas.message);
      return NextResponse.json({ error: 'No se pudo revisar la conexión con MercadoPago de las tiendas.' }, { status: 500 });
    }
    for (const c of cuentas || []) conectadas.add(c.vendedor_id);
  }
  for (const x of plan) x.conexion_mp = conectadas.has(x.tienda);

  const limpio = ({ _preferencia, _venceMs, ...resto }) => resto;

  // ── Simulación: solo lista ──
  if (!ejecutar) {
    const resultados = plan.map((x) => ({
      ...limpio(x),
      resultado: x.accion === 'sin_fecha'
        ? 'se_deja_sin_fecha'
        : x.tiene_link && !x.conexion_mp ? 'no_se_podria_(sin_MercadoPago_conectado)' : 'se_haria',
    }));
    return NextResponse.json({
      simulacion: true,
      total_pendientes: candidatos.length,
      procesados: resultados.length,
      hay_mas: hayMas,
      resumen: contar(resultados),
      resultados,
    });
  }

  // ── De verdad ──
  console.log(`${CONTEXTO} (admin ${admin_user.id}): ${plan.length} pedido(s)${vendedorId !== null ? ` de la tienda ${vendedorId}` : ''}.`);

  // El token de cada tienda, una sola vez.
  const tokens = new Map();
  async function tokenDe(tienda) {
    if (tokens.has(tienda)) return tokens.get(tienda);
    let token = null;
    try {
      token = await getValidAccessToken(tienda, admin);
    } catch (err) {
      console.warn(`${CONTEXTO}: sin token de MercadoPago para la tienda ${tienda} (${err.message}).`);
    }
    tokens.set(tienda, token);
    return token;
  }

  const resultados = [];
  const aCancelar = []; // los que quedaron con vence_en vencido: los cancela la base

  for (const x of plan) {
    const salida = { ...limpio(x), resultado: 'error' };
    resultados.push(salida);

    try {
      if (x.accion === 'sin_fecha') {
        salida.resultado = 'se_deja_sin_fecha';
        continue;
      }

      // 1. El link en MercadoPago (si el pedido tiene uno).
      if (x._preferencia) {
        const token = await tokenDe(x.tienda);
        if (!token) { salida.resultado = 'sin_token'; continue; }

        const etiqueta = `pedido ${x.pedido}`;
        const hecho = x.accion === 'vencer_y_cancelar'
          ? await vencerPreferencia(token, x._preferencia, etiqueta, CONTEXTO)
          : await ponerVencimientoPreferencia(token, x._preferencia, x._venceMs, etiqueta, CONTEXTO);
        if (!hecho) { salida.resultado = 'mp_fallo'; continue; }
      }

      // 2. Guardar el vencimiento. Solo si el pedido sigue pendiente y sin
      // vencimiento: si cambió mientras tanto, no se pisa.
      const { data: guardado, error: errorGuardar } = await admin
        .from('pedidos')
        .update({ vence_en: x.vence_en })
        .eq('id', x.pedido)
        .eq('estado', 'pendiente')
        .is('vence_en', null)
        .select('id')
        .maybeSingle();
      if (errorGuardar) {
        console.error(`${CONTEXTO}: pedido ${x.pedido}: no se pudo guardar vence_en —`, errorGuardar.message);
        salida.resultado = 'error';
        continue;
      }
      if (!guardado) { salida.resultado = 'cambio_en_el_medio'; continue; }

      if (x.accion === 'poner_vencimiento') {
        salida.resultado = 'vencimiento_puesto';
      } else {
        salida.resultado = 'pendiente_de_cancelar';
        aCancelar.push(salida);
      }
    } catch (err) {
      console.error(`${CONTEXTO}: pedido ${x.pedido}:`, err?.message || err);
      salida.resultado = 'error';
    }
  }

  // 3. Cancelar los vencidos. Lo hace la misma función de la base que usa el
  // panel del vendedor (privado.cancelar_pedidos_vencidos): una sola regla, con
  // su propia guarda de "sin ningún pago" al momento de escribir.
  if (aCancelar.length > 0) {
    for (const tienda of new Set(aCancelar.map((s) => s.tienda))) {
      const { error } = await admin.rpc('rpc_cancelar_pedidos_vencidos', { p_vendedor_id: tienda });
      if (error) console.error(`${CONTEXTO}: no se pudieron cancelar los vencidos de la tienda ${tienda} —`, error.message);
    }

    const { data: despues, error: errorDespues } = await admin
      .from('pedidos')
      .select('id, estado, cancelado_motivo')
      .in('id', aCancelar.map((s) => s.pedido));
    if (errorDespues) console.error(`${CONTEXTO}: no se pudo confirmar la cancelación —`, errorDespues.message);

    for (const s of aCancelar) {
      const fila = (despues || []).find((f) => f.id === s.pedido);
      s.resultado = fila?.estado === 'cancelado' && fila?.cancelado_motivo === 'pago_vencido'
        ? 'vencido_y_cancelado'
        : fila ? 'cambio_en_el_medio' : 'error';
    }
  }

  const resumen = contar(resultados);
  console.log(`${CONTEXTO}: terminó`, JSON.stringify(resumen));
  return NextResponse.json({
    simulacion: false,
    total_pendientes: candidatos.length,
    procesados: resultados.length,
    hay_mas: hayMas,
    resumen,
    resultados,
  });
}

function contar(resultados) {
  const resumen = {};
  for (const r of resultados) resumen[r.resultado] = (resumen[r.resultado] || 0) + 1;
  return resumen;
}
