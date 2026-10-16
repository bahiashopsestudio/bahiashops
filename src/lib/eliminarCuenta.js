// Eliminar una cuenta (derecho de supresión, Ley 25.326).
//
// La lógica que comparten las dos puertas: la persona (/api/cuenta/cerrar) y
// el admin (/api/admin/cuentas). Todo corre en el servidor con service_role.
//
// Qué hace cada parte:
//   · La base decide y borra: rpc_evaluar_eliminar_cuenta (solo lee) y
//     rpc_cerrar_cuenta (todo o nada, en una transacción). Migraciones 016 y
//     031. Si la persona tiene una tienda pausada, la base la cierra (si tiene
//     pedidos) o la borra (si no) en la misma transacción.
//   · Este archivo agrega lo que la base no puede hacer: borrar de Storage los
//     archivos de esa tienda (src/lib/storageTienda.js).
//
// Ya no se le pregunta nada a MercadoPago (antes se buscaban pagos de los
// pedidos "abandonados" y se vencían sus links): los links vencen solos, y un
// pago que llegue sobre un pedido cancelado no lo revive (el webhook avisa
// adentro). La base cancela los pendientes directamente.

import { limpiarStorageTienda } from '@/lib/storageTienda'

export const PALABRA_CONFIRMACION = 'ELIMINAR'

// El orden en que la pantalla muestra los impedimentos.
const ORDEN_MOTIVOS = ['TIENDA_ACTIVA', 'VENTA_EN_CURSO', 'PEDIDO_ACTIVO', 'PAGO_EN_CURSO', 'ES_ADMIN']

export function confirmacionValida(texto) {
  return typeof texto === 'string' && texto.trim().toUpperCase() === PALABRA_CONFIRMACION
}

function ordenarMotivos(motivos) {
  return [...new Set(motivos)].sort((a, b) => {
    const ia = ORDEN_MOTIVOS.indexOf(a)
    const ib = ORDEN_MOTIVOS.indexOf(b)
    return (ia === -1 ? 99 : ia) - (ib === -1 ? 99 : ib)
  })
}

const textoTienda = (nombre) => (String(nombre ?? '').trim() || 'la tienda')

// ¿Se puede eliminar esta cuenta, y si no, por qué?
//
// Devuelve { ok: true, existe, cerrada, puede, motivos, numeros, apodo,
//            tiene_pedidos, tienda, pedidos, pagos }
//      o { ok: false, error: 'error' }.
//
//   motivos   en el orden en que se muestran (ver ORDEN_MOTIVOS)
//   numeros   cuántos hay de cada cosa (para el admin)
//   tienda    { nombre, estado: 'activa' | 'pausada' } si tiene una sin
//             cerrar, si no null
//   pedidos   los pedidos en camino: [{ id, tienda }] — nada más
//   pagos     los pedidos con un pago en proceso: [{ id, tienda }] — nada más
export async function evaluarCuenta(admin, userId) {
  const { data, error } = await admin.rpc('rpc_evaluar_eliminar_cuenta', { p_id: userId })
  if (error || !data || typeof data !== 'object') {
    console.error('Eliminar cuenta: no se pudo evaluar —', error?.message || 'respuesta vacía')
    return { ok: false, error: 'error' }
  }
  if (!data.existe) return { ok: true, existe: false, cerrada: false, puede: false, motivos: [] }
  if (data.cerrada) return { ok: true, existe: true, cerrada: true, puede: false, motivos: [] }

  // ── Los datos que la pantalla muestra de cada impedimento ──
  const ESTADOS_TERMINADOS = '(pendiente,rechazado,cancelado,despachado,reembolsado)'
  const { data: enCamino, error: errorCamino } = await admin
    .from('pedidos').select('id, vendedor_nombre')
    .eq('comprador_id', userId).not('estado', 'in', ESTADOS_TERMINADOS).order('id')
  const { data: conPago, error: errorPagos } = await admin
    .from('pedidos').select('id, vendedor_nombre, mp_payment_id')
    .eq('comprador_id', userId).eq('estado', 'pendiente').not('mp_payment_id', 'is', null).order('id')
  if (errorCamino || errorPagos) {
    console.error('Eliminar cuenta: no se pudieron leer los pedidos —', (errorCamino || errorPagos).message)
    return { ok: false, error: 'error' }
  }

  const pagos = (conPago || [])
    .filter((p) => !['', 'null', 'undefined'].includes(String(p.mp_payment_id ?? '').trim()))
    .map((p) => ({ id: p.id, tienda: textoTienda(p.vendedor_nombre) }))

  const { data: cuenta, error: errorCuenta } = await admin.from('usuarios').select('nombre_usuario').eq('id', userId).maybeSingle()
  if (errorCuenta) console.error('[eliminar-cuenta/usuarios]', errorCuenta.message)

  const motivos = ordenarMotivos(data.motivos || [])
  const tienda = data.tienda && typeof data.tienda === 'object'
    ? { nombre: textoTienda(data.tienda.nombre), estado: data.tienda.estado === 'pausada' ? 'pausada' : 'activa' }
    : null

  return {
    ok: true,
    existe: true,
    cerrada: false,
    puede: motivos.length === 0,
    motivos,
    numeros: {
      tiendas: data.tiendas || 0,
      ventas_tienda_en_curso: data.ventas_tienda_en_curso || 0,
      pedidos_activos: data.pedidos_activos || 0,
      pagos_en_curso: Math.max(data.pagos_en_curso || 0, pagos.length),
    },
    apodo: cuenta?.nombre_usuario || null,
    tiene_pedidos: (data.pedidos_total || 0) > 0,
    tienda,
    pedidos: (enCamino || []).map((p) => ({ id: p.id, tienda: textoTienda(p.vendedor_nombre) })),
    pagos,
  }
}

// Elimina la cuenta. La base repite todas las verificaciones adentro de la
// transacción: lo que dijo el precheck pudo cambiar.
//
// Devuelve { ok: true, resultado: 'borrada' | 'anonimizada' | 'ya_cerrada',
//            emails, nombre, tienda }
//      o { ok: false, status, error?, evaluacion? }:
//   409 + evaluacion: algo lo impide (la pantalla muestra los motivos)
//   500: error inesperado
//
// tienda: { id, nombre, accion: 'cerrada' | 'borrada' } si tenía una (el
// nombre es el de antes de cerrarla, para el mail), o null.
export async function eliminarCuenta(admin, userId) {
  const { data, error } = await admin.rpc('rpc_cerrar_cuenta', { p_id: userId })
  if (error || !data || typeof data !== 'object') {
    console.error('Eliminar cuenta: la transacción falló —', error?.message || 'respuesta vacía')
    return { ok: false, status: 500, error: 'error' }
  }

  if (data.ok === false) {
    if ((data.motivos || []).includes('SIN_PERFIL')) {
      console.error('Eliminar cuenta: la cuenta de auth no tiene perfil en usuarios', userId)
      return { ok: false, status: 500, error: 'error' }
    }
    // Algo lo impide: se vuelve a evaluar para mostrar los motivos con sus datos.
    const evaluacion = await evaluarCuenta(admin, userId)
    if (evaluacion.ok && !evaluacion.puede) return { ok: false, status: 409, evaluacion }
    return { ok: false, status: 409, evaluacion: { ok: true, motivos: ordenarMotivos(data.motivos || []), pedidos: [], pagos: [], tienda: null } }
  }

  const tienda = data.tienda && typeof data.tienda === 'object' ? data.tienda : null

  // La cuenta ya está eliminada: limpiar Storage es lo que sigue, y no puede
  // deshacer nada (limpiarStorageTienda nunca lanza).
  if (tienda) await limpiarStorageTienda(admin, tienda)

  console.log(`Eliminar cuenta ${userId}: ${data.resultado}${tienda ? ` (tienda ${tienda.id} ${tienda.accion})` : ''}.`)
  return {
    ok: true,
    resultado: data.resultado,
    emails: data.emails || [],
    nombre: data.nombre || null,
    tienda,
  }
}

// Lo que cualquiera de las dos puertas devuelve como "se puede / no se puede".
// Sin los datos internos.
export function resumenDeEvaluacion(evaluacion) {
  return {
    puede: !!evaluacion.puede,
    motivos: evaluacion.motivos || [],
    apodo: evaluacion.apodo ?? null,
    tiene_pedidos: !!evaluacion.tiene_pedidos,
    tienda: evaluacion.tienda ?? null,
    pedidos: evaluacion.pedidos || [],
    pagos: evaluacion.pagos || [],
  }
}

// Busca una cuenta por mail exacto, sin distinguir mayúsculas (para el admin).
export async function buscarCuentaPorMail(admin, email) {
  const texto = String(email ?? '').trim()
  if (!texto || texto.length > 254) return { ok: true, cuenta: null }

  // ilike sin comodines: se escapan \ % _ para que sea una igualdad.
  const sinComodines = texto.replace(/[\\%_]/g, (c) => `\\${c}`)
  const { data, error } = await admin
    .from('usuarios').select('id, email, nombre_usuario, cerrada_en')
    .ilike('email', sinComodines).limit(1)

  if (error) {
    console.error('Eliminar cuenta (admin): no se pudo buscar por mail —', error.message)
    return { ok: false }
  }
  return { ok: true, cuenta: data && data.length > 0 ? data[0] : null }
}
