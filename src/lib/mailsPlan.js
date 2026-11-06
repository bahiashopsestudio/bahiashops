// Los mails del plan pago que se deja de pagar (tanda F4a, migración 050),
// a la dirección de la cuenta de Bahía Shops de la tienda. Los manda la tarea
// diaria, una sola vez cada uno (reclama la marca en la base antes):
//
//   1. 'rechazo'     Mercado Pago no pudo cobrar (al primer rechazo).
//   2. 'fin_gracia'  te quedan 3 días (o menos).
//   3. 'caida'       tu tienda volvió al plan Gratis (con o sin productos
//                    pausados).
//
// Los textos son los del mockup (mockup-tanda-f4a.html, pantalla «Mails»),
// con la plantilla de los mails de siempre (src/lib/mailBase.js). El armado
// son funciones puras (las prueba scripts/probar-040.mjs); el envío nunca
// lanza.

import { SITIO_URL } from '@/lib/sitio'
import { GRIS, BORDE, FUENTE_TEXTO, TABLA, escapar, negrita, plantilla, lineaAzul, tituloTexto, parrafo, boton, enviarPorResend } from '@/lib/mailBase'
import { textoPrecio } from '@/lib/planes'

const LINK_MI_NEGOCIO = `${SITIO_URL}/vendedor/perfil`
const PIE = `<table ${TABLA} width="100%" style="margin:28px 0 0;"><tr><td style="border-top:1px solid ${BORDE};padding:16px 0 0;font-family:${FUENTE_TEXTO};font-size:12px;font-weight:300;line-height:1.6;color:${GRIS};">Te escribimos porque tenés una tienda en Bahía Shops. Bahía Blanca, Argentina.</td></tr></table>`

const FECHA = new Intl.DateTimeFormat('es-AR', { day: 'numeric', month: 'numeric', timeZone: 'America/Argentina/Buenos_Aires' })
export function fechaCorta(iso) {
  const ms = Date.parse(iso ?? '')
  return Number.isFinite(ms) ? FECHA.format(new Date(ms)) : ''
}

// Un párrafo armado con partes: un texto va escapado; [texto] va en negrita.
function partes(lista) {
  return {
    html: parrafo(lista.map((p) => (Array.isArray(p) ? negrita(escapar(p[0])) : escapar(p))).join('')),
    texto: lista.map((p) => (Array.isArray(p) ? p[0] : p)).join(''),
  }
}

function armar({ asunto, linea, parrafos, cta }) {
  const ps = parrafos.map(partes)
  const cuerpo = [lineaAzul(linea), tituloTexto(asunto), ...ps.map((p) => p.html), boton(cta, LINK_MI_NEGOCIO), PIE].join('\n')
  const texto = [asunto, ...ps.map((p) => p.texto), `${cta}: ${LINK_MI_NEGOCIO}`].join('\n\n')
  return { asunto, html: plantilla({ asunto, cuerpo }), texto }
}

// «tu plan Básico» / «tu plan a medida».
function nombreDelPlan({ aMedida, plan }) {
  return aMedida ? 'tu plan a medida' : `tu plan ${plan || 'Básico'}`
}

const productos = (n) => `${n} ${n === 1 ? 'producto' : 'productos'}`

// ── 1. Cobro rechazado ──
//   tienda, monto, plan ('Básico'), aMedida, hasta (ISO: el fin de la gracia),
//   topeGratis (10)
export function armarMailCobroRechazado({ tienda, monto, plan, aMedida = false, hasta, topeGratis = 10 }) {
  const nombre = nombreDelPlan({ aMedida, plan })
  const dia = fechaCorta(hasta)
  return armar({
    asunto: `Mercado Pago no pudo cobrar ${nombre}`,
    linea: 'Tu plan',
    parrafos: [
      [`Hola, ${String(tienda || '').trim() || 'tu tienda'}.`],
      ['Mercado Pago no pudo cobrar los ', [textoPrecio(monto)], ` de ${nombre} y va a volver a intentarlo en los próximos días. `, [`Tenés el plan hasta el ${dia}.`]],
      ['Revisá en tu cuenta de Mercado Pago la tarjeta o el saldo de la suscripción.'],
      [`Si el ${dia} sigue sin cobrarse, cancelamos la suscripción y tu tienda vuelve al plan Gratis: quedan publicados tus ${topeGratis} primeros productos y el resto se pausa. No se borra nada.`],
    ],
    cta: 'Ir a Mi negocio',
  })
}

// ── 2. Te quedan N días ──
//   dias (los que quedan, 1 a 3), sePausarian (cuántos se pausarían)
export function armarMailFinDeGracia({ tienda, plan, aMedida = false, hasta, dias, sePausarian = 0 }) {
  const nombre = nombreDelPlan({ aMedida, plan })
  const quedan = dias === 1 ? 'Te queda 1 día' : `Te quedan ${dias} días`
  const pausa = sePausarian > 0 ? `se pausan ${productos(sePausarian)}.` : 'no se pausa ningún producto.'
  return armar({
    asunto: `${quedan} de ${nombre}`,
    linea: 'Tu plan',
    parrafos: [
      [`Hola, ${String(tienda || '').trim() || 'tu tienda'}.`],
      ['Mercado Pago todavía no pudo cobrar tu plan. ', [`El ${fechaCorta(hasta)} cancelamos la suscripción y tu tienda vuelve al Gratis:`], ` ${pausa}`],
      ['Para evitarlo, revisá tu medio de pago en Mercado Pago.'],
    ],
    cta: 'Ir a Mi negocio',
  })
}

// ── 3. Volvió al Gratis ──
//   motivo ('falta_de_pago' | 'baja' | 'devolucion'), pausados, productos (los
//   que tiene guardados), topeGratis
export function armarMailCaida({ tienda, plan, aMedida = false, motivo, pausados = 0, productos: guardados = 0, topeGratis = 10 }) {
  const nombre = nombreDelPlan({ aMedida, plan })
  const primera = motivo === 'falta_de_pago'
    ? `Como no se pudo cobrar ${nombre}, tu tienda volvió al plan Gratis.`
    : `Terminó ${nombre} y tu tienda volvió al plan Gratis.`
  const hola = [`Hola, ${String(tienda || '').trim() || 'tu tienda'}.`]
  if (pausados > 0) {
    return armar({
      asunto: 'Tu tienda volvió al plan Gratis',
      linea: 'Tu plan',
      parrafos: [
        hola,
        [`${primera} `, [`Pausamos ${productos(pausados)}:`], ` quedaron publicados tus ${topeGratis} primeros. No se borró nada.`],
        [`Para recuperarlos, reactivá ${nombre} desde Mi negocio: se vuelven a publicar solos. Si no, podés eliminar productos hasta bajar a ${topeGratis}.`],
      ],
      cta: `Reactivar ${nombre.replace(/^tu /, 'mi ')}`,
    })
  }
  return armar({
    asunto: 'Tu tienda volvió al plan Gratis',
    linea: 'Tu plan',
    parrafos: [
      hola,
      [`${primera} Tenías ${productos(guardados)}, así que `, ['no se pausó ninguno'], '.'],
      [`Si querés volver a tener más lugar, más fotos y los carritos abandonados, podés reactivar ${nombre} desde Mi negocio.`],
    ],
    cta: 'Ir a Mi negocio',
  })
}

// ── El envío ──
// Nunca lanza. Devuelve { enviado, motivo? }.
//   tipo  'rechazo' | 'fin_gracia' | 'caida'
export async function enviarMailPlan({ para, tipo, ...datos }) {
  const etiqueta = `Mail del plan (${tipo}) a la tienda (${datos.tienda ?? 'sin nombre'})`
  try {
    if (!para) {
      console.error(`${etiqueta} no enviado: no hay dirección.`)
      return { enviado: false, motivo: 'sin_destinatario' }
    }
    if (!process.env.RESEND_API_KEY) {
      console.error(`${etiqueta} no enviado: RESEND_API_KEY no configurada.`)
      return { enviado: false, motivo: 'sin_configurar' }
    }
    const mail = tipo === 'rechazo' ? armarMailCobroRechazado(datos)
      : tipo === 'fin_gracia' ? armarMailFinDeGracia(datos)
        : armarMailCaida(datos)
    const resultado = await enviarPorResend({ para, mail })
    if (!resultado.ok) {
      console.error(`${etiqueta} falló.`)
      return { enviado: false, motivo: 'resend_error' }
    }
    console.log(`${etiqueta}: enviado.`)
    return { enviado: true }
  } catch (err) {
    console.error(`${etiqueta} falló —`, err?.message || err)
    return { enviado: false, motivo: 'excepcion' }
  }
}
