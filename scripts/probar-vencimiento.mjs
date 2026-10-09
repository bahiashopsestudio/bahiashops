// Prueba la parte de JavaScript de los plazos de pago: el del LINK (2 horas) y
// el del CUPÓN en efectivo (3 días), que no dependen uno del otro; que la
// variable de entorno para probar en minutos NO se respeta en producción;
// cuándo un pedido se considera vencido; la fecha del cupón (instante absoluto,
// respaldo y cómo se muestra) y las fechas que se le mandan a MercadoPago. No
// toca nada: son funciones puras.
//
//   npm run probar:vencimiento

import {
  PLAZO_LINK_HORAS, PLAZO_CUPON_DIAS, plazoLinkMs, plazoCuponMs, calcularVencimiento, calcularVencimientoCupon,
  finDelDiaAR, vencimientoDeCupon, esCuponEnEfectivo, fechaDeCupon, pedidoVencido, pagableHasta, pedidoTienePago,
  esPagoEnEfectivoPendiente, vencimientoDeLinkNuevo,
} from "../src/lib/vencimientoPago.js"
import { camposDeVencimiento, fechaAR, SIN_MEDIOS_EN_EFECTIVO } from "../src/lib/mercadopago/preferencias.js"

let fallas = 0
const ok = (cond, msg) => { if (!cond) { fallas++; console.log("  ✗ FALLA:", msg) } else console.log("  ✓", msg) }

const HORA = 3600 * 1000
const DIA = 24 * HORA
const MIN = 60 * 1000
const ENV_ORIGINAL = { NODE_ENV: process.env.NODE_ENV, MIN: process.env.VENCIMIENTO_PAGO_MINUTOS }
function entorno(nodeEnv, minutos) {
  if (nodeEnv === undefined) delete process.env.NODE_ENV; else process.env.NODE_ENV = nodeEnv
  if (minutos === undefined) delete process.env.VENCIMIENTO_PAGO_MINUTOS; else process.env.VENCIMIENTO_PAGO_MINUTOS = minutos
}

console.log("1. Los dos plazos")
ok(PLAZO_LINK_HORAS === 2 && PLAZO_CUPON_DIAS === 3, "el link vale 2 horas y el cupón 3 días")
ok(plazoCuponMs() === 3 * DIA, "el plazo del cupón son 3 días")
entorno("production", undefined)
ok(plazoLinkMs() === 2 * HORA, "producción, sin variable: 2 horas")
entorno("production", "5")
ok(plazoLinkMs() === 2 * HORA, "producción CON la variable cargada: sigue siendo 2 horas")
entorno("production", "0.5")
ok(plazoLinkMs() === 2 * HORA, "producción con la variable en 0,5: sigue siendo 2 horas")
entorno("development", undefined)
ok(plazoLinkMs() === 2 * HORA, "desarrollo, sin variable: 2 horas")
entorno("development", "5")
ok(plazoLinkMs() === 5 * MIN, "desarrollo con 5 minutos: 5 minutos")
ok(plazoCuponMs() === 3 * DIA, "y el cupón sigue en 3 días: la variable solo toca el link")
entorno(undefined, "2")
ok(plazoLinkMs() === 2 * MIN, "sin NODE_ENV (fuera de producción) con 2 minutos: 2 minutos")
for (const raro of ["", "abc", "0", "-5", "NaN", "Infinity"]) {
  entorno("development", raro)
  ok(plazoLinkMs() === 2 * HORA, `desarrollo con la variable "${raro}": se ignora, 2 horas`)
}
entorno("development", String(10 * 24 * 60))
ok(plazoLinkMs() === 2 * HORA, "desarrollo con 10 días en minutos: nunca alarga, tope de 2 horas")
entorno("production", undefined)
const t0 = 1_700_000_000_000
ok(calcularVencimiento(t0) === t0 + 2 * HORA, "calcularVencimiento (el link) suma 2 horas")
ok(calcularVencimientoCupon(t0) === t0 + 3 * DIA, "calcularVencimientoCupon suma 3 días")

console.log("\n2. La fecha del cupón")
const delPago = { date_of_expiration: "2026-10-12T22:59:59.000-04:00" }
ok(vencimientoDeCupon(delPago, {}) === "2026-10-13T02:59:59.000Z", "sale de date_of_expiration del pago, como instante absoluto (el desfase con que venga no importa)")
ok(vencimientoDeCupon({ date_of_expiration: "2026-10-13T02:59:59.000Z" }, {}) === "2026-10-13T02:59:59.000Z", "el mismo instante en UTC da lo mismo")
const creado = "2026-10-09T15:00:00.000Z"
ok(vencimientoDeCupon({}, { creado_en: creado }) === "2026-10-13T02:59:59.000Z", "respaldo: final del día argentino de la creación + 3 días (12/10 23:59:59)")
ok(vencimientoDeCupon({ date_of_expiration: "basura" }, { creado_en: creado }) === "2026-10-13T02:59:59.000Z", "una fecha que no se entiende cae al respaldo")
ok(vencimientoDeCupon(null, null, t0) === new Date(finDelDiaAR(t0 + 3 * DIA)).toISOString(), "sin pedido ni pago: respaldo desde ahora")
ok(finDelDiaAR(Date.UTC(2026, 9, 12, 12, 0, 0)) === Date.UTC(2026, 9, 13, 2, 59, 59), "finDelDiaAR: 23:59:59 de Argentina")
ok(finDelDiaAR(Date.UTC(2026, 9, 13, 2, 59, 59)) === Date.UTC(2026, 9, 13, 2, 59, 59), "justo en el último segundo del día, sigue siendo ese día")
ok(finDelDiaAR(Date.UTC(2026, 9, 13, 3, 0, 0)) === Date.UTC(2026, 9, 14, 2, 59, 59), "a las 00:00 de Argentina empieza el día siguiente")
ok(fechaDeCupon("2026-10-13T02:59:59.000Z") === "12 de octubre", "al comprador solo la fecha, en hora de Argentina (02:59 UTC del 13 es el 12)")
ok(fechaDeCupon("2026-10-13T03:00:00.000Z") === "13 de octubre", "a las 00:00 de Argentina ya es el día siguiente")
ok(fechaDeCupon("basura") === "" && fechaDeCupon(null) === "", "sin fecha válida, texto vacío")
ok(esCuponEnEfectivo({ status: "pending", payment_type_id: "ticket" }) && esCuponEnEfectivo({ status: "pending", payment_type_id: "atm" }), "un pago pendiente de tipo ticket o atm es un cupón")
ok(!esCuponEnEfectivo({ status: "approved", payment_type_id: "ticket" }) && !esCuponEnEfectivo({ status: "pending", payment_type_id: "credit_card" }) && !esCuponEnEfectivo(null), "pagado, o pendiente con tarjeta, o nada: no es un cupón")

console.log("\n3. Cuándo un pedido está vencido")
const ahora = t0 + 10 * DIA
const iso = (ms) => new Date(ms).toISOString()
const base = { estado: "pendiente", vence_en: iso(ahora - MIN), mp_payment_id: null, cancelado_motivo: null, efectivo_vence_en: null }
ok(pedidoVencido(base, ahora) === true, "pendiente, sin pago, con el link vencido: vencido")
ok(pedidoVencido({ ...base, vence_en: iso(ahora + MIN) }, ahora) === false, "con el link vigente: no")
ok(pedidoVencido({ ...base, vence_en: iso(ahora) }, ahora) === true, "justo en el instante: vencido")
ok(pedidoVencido({ ...base, vence_en: null }, ahora) === false, "sin vence_en (pedido viejo): no")
ok(pedidoVencido({ ...base, mp_payment_id: "123" }, ahora) === false, "con un pago en proceso sin cupón: no (lo resuelve MercadoPago)")
for (const v of ["", "null", "undefined", "  "]) ok(pedidoVencido({ ...base, mp_payment_id: v }, ahora) === true, `mp_payment_id "${v}" cuenta como sin pago`)
const conCupon = { ...base, mp_payment_id: "555", vence_en: iso(ahora - 5 * HORA), efectivo_vence_en: iso(ahora + DIA) }
ok(pedidoVencido(conCupon, ahora) === false, "con un cupón vigente NO está vencido aunque el link ya haya vencido")
ok(pedidoVencido({ ...conCupon, efectivo_vence_en: iso(ahora - MIN) }, ahora) === true, "con el cupón vencido: vencido")
ok(pedidoVencido({ ...base, estado: "pagado" }, ahora) === false, "pagado: no")
ok(pedidoVencido({ ...base, estado: "rechazado" }, ahora) === false, "rechazado: no")
ok(pedidoVencido({ estado: "cancelado", cancelado_motivo: "pago_vencido" }, ahora) === true, "cancelado por pago_vencido: vencido")
ok(pedidoVencido({ estado: "cancelado", cancelado_motivo: "cuenta_eliminada" }, ahora) === false, "cancelado por otro motivo: no")
ok(pedidoVencido({ estado: "cancelado", cancelado_motivo: null }, ahora) === false, "cancelado sin motivo: no")
ok(pedidoVencido(null, ahora) === false, "sin pedido: no")
ok(pedidoTienePago({ mp_payment_id: 5551234 }) === true, "un id numérico cuenta como pago")
ok(esPagoEnEfectivoPendiente(conCupon) === true, "pendiente con pago y fecha de cupón: es un pago en efectivo pendiente")
ok(esPagoEnEfectivoPendiente(base) === false && esPagoEnEfectivoPendiente({ ...conCupon, estado: "pagado" }) === false && esPagoEnEfectivoPendiente({ ...conCupon, mp_payment_id: null }) === false, "sin pago, sin fecha de cupón o ya pagado: no lo es")

console.log("\n4. Hasta cuándo se puede pagar")
ok(pagableHasta({ ...base, vence_en: iso(ahora + DIA) }, ahora)?.getTime() === ahora + DIA, "pendiente con link vigente: devuelve la fecha del link")
ok(pagableHasta(base, ahora) === null, "ya pasó: null")
ok(pagableHasta({ ...base, vence_en: null }, ahora) === null, "sin vence_en: null")
ok(pagableHasta({ estado: "pagado", vence_en: iso(ahora + DIA) }, ahora) === null, "pagado: null")
ok(pagableHasta(conCupon, ahora)?.getTime() === ahora + DIA, "con cupón: la fecha del cupón, no la del link (que ya pasó)")
ok(vencimientoDeLinkNuevo(conCupon, ahora) === ahora + 2 * HORA, "un link nuevo para un cupón vigente dura 2 horas")
ok(vencimientoDeLinkNuevo({ ...conCupon, efectivo_vence_en: iso(ahora + 30 * MIN) }, ahora) === ahora + 30 * MIN, "pero nunca más allá del vencimiento del cupón")
ok(vencimientoDeLinkNuevo({ ...conCupon, efectivo_vence_en: iso(ahora - MIN) }, ahora) === null, "con el cupón vencido: no hay link nuevo")
ok(vencimientoDeLinkNuevo({ ...conCupon, estado: "pagado" }, ahora) === null, "ya pagado: no hay link nuevo")

console.log("\n5. Las fechas que se le mandan a MercadoPago")
ok(fechaAR(Date.UTC(2026, 9, 1, 12, 30, 0)) === "2026-10-01T09:30:00.000-03:00", "fechaAR: hora de Argentina con su desfase")
const ahoraMp = Date.UTC(2026, 9, 1, 15, 0, 0)
const c = camposDeVencimiento(ahoraMp + 2 * HORA, ahoraMp + 3 * DIA, ahoraMp)
ok(c.expires === true, "expires: true")
ok(c.expiration_date_to === "2026-10-01T14:00:00.000-03:00", "expiration_date_to: el link vence a las 2 horas")
ok(c.date_of_expiration === "2026-10-04T12:00:00.000-03:00", "date_of_expiration: el cupón vence a los 3 días")
ok(c.expiration_date_from === "2026-10-01T11:59:00.000-03:00", "expiration_date_from: un minuto antes de ahora")
ok(Object.keys(c).length === 4, "son exactamente cuatro campos")
ok(JSON.stringify(SIN_MEDIOS_EN_EFECTIVO) === JSON.stringify({ excluded_payment_types: [{ id: "ticket" }, { id: "atm" }] }), "un link nuevo para un cupón excluye ticket y atm")

entorno(ENV_ORIGINAL.NODE_ENV, ENV_ORIGINAL.MIN)
console.log(fallas === 0 ? "\nTODO OK" : `\n${fallas} FALLAS`)
process.exit(fallas ? 1 : 0)
