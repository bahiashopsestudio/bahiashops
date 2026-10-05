// Prueba la parte de JavaScript del vencimiento de los links de pago: el plazo
// (y que la variable de entorno para probar en minutos NO se respeta en
// producción), cuándo un pedido se considera vencido y las fechas que se le
// mandan a MercadoPago. No toca nada: son funciones puras.
//
//   npm run probar:vencimiento

import { PLAZO_PAGO_DIAS, plazoPagoMs, calcularVencimiento, pedidoVencido, pagableHasta, pedidoTienePago } from "../src/lib/vencimientoPago.js"
import { camposDeVencimiento, fechaAR } from "../src/lib/mercadopago/preferencias.js"

let fallas = 0
const ok = (cond, msg) => { if (!cond) { fallas++; console.log("  ✗ FALLA:", msg) } else console.log("  ✓", msg) }

const DIA = 24 * 3600 * 1000
const MIN = 60 * 1000
const ENV_ORIGINAL = { NODE_ENV: process.env.NODE_ENV, MIN: process.env.VENCIMIENTO_PAGO_MINUTOS }
function entorno(nodeEnv, minutos) {
  if (nodeEnv === undefined) delete process.env.NODE_ENV; else process.env.NODE_ENV = nodeEnv
  if (minutos === undefined) delete process.env.VENCIMIENTO_PAGO_MINUTOS; else process.env.VENCIMIENTO_PAGO_MINUTOS = minutos
}

console.log("1. El plazo")
ok(PLAZO_PAGO_DIAS === 3, "son 3 días")
entorno("production", undefined)
ok(plazoPagoMs() === 3 * DIA, "producción, sin variable: 3 días")
entorno("production", "5")
ok(plazoPagoMs() === 3 * DIA, "producción CON la variable cargada: sigue siendo 3 días")
entorno("production", "0.5")
ok(plazoPagoMs() === 3 * DIA, "producción con la variable en 0,5: sigue siendo 3 días")
entorno("development", undefined)
ok(plazoPagoMs() === 3 * DIA, "desarrollo, sin variable: 3 días")
entorno("development", "5")
ok(plazoPagoMs() === 5 * MIN, "desarrollo con 5 minutos: 5 minutos")
entorno(undefined, "2")
ok(plazoPagoMs() === 2 * MIN, "sin NODE_ENV (fuera de producción) con 2 minutos: 2 minutos")
for (const raro of ["", "abc", "0", "-5", "NaN", "Infinity"]) {
  entorno("development", raro)
  ok(plazoPagoMs() === 3 * DIA, `desarrollo con la variable "${raro}": se ignora, 3 días`)
}
entorno("development", String(10 * 24 * 60))
ok(plazoPagoMs() === 3 * DIA, "desarrollo con 10 días en minutos: nunca alarga, tope de 3 días")
entorno("production", undefined)
const t0 = 1_700_000_000_000
ok(calcularVencimiento(t0) === t0 + 3 * DIA, "calcularVencimiento suma el plazo")

console.log("\n2. Cuándo un pedido está vencido")
const ahora = t0 + 10 * DIA
const iso = (ms) => new Date(ms).toISOString()
const base = { estado: "pendiente", vence_en: iso(ahora - MIN), mp_payment_id: null, cancelado_motivo: null }
ok(pedidoVencido(base, ahora) === true, "pendiente, sin pago, con la fecha pasada: vencido")
ok(pedidoVencido({ ...base, vence_en: iso(ahora + MIN) }, ahora) === false, "con la fecha en el futuro: no")
ok(pedidoVencido({ ...base, vence_en: iso(ahora) }, ahora) === true, "justo en el instante: vencido")
ok(pedidoVencido({ ...base, vence_en: null }, ahora) === false, "sin vence_en (pedido viejo): no")
ok(pedidoVencido({ ...base, mp_payment_id: "123" }, ahora) === false, "con un pago en proceso: no (lo resuelve MercadoPago)")
for (const v of ["", "null", "undefined", "  "]) ok(pedidoVencido({ ...base, mp_payment_id: v }, ahora) === true, `mp_payment_id "${v}" cuenta como sin pago`)
ok(pedidoVencido({ ...base, estado: "pagado" }, ahora) === false, "pagado: no")
ok(pedidoVencido({ ...base, estado: "rechazado" }, ahora) === false, "rechazado: no")
ok(pedidoVencido({ estado: "cancelado", cancelado_motivo: "pago_vencido" }, ahora) === true, "cancelado por pago_vencido: vencido")
ok(pedidoVencido({ estado: "cancelado", cancelado_motivo: "cuenta_eliminada" }, ahora) === false, "cancelado por otro motivo: no")
ok(pedidoVencido({ estado: "cancelado", cancelado_motivo: null }, ahora) === false, "cancelado sin motivo: no")
ok(pedidoVencido(null, ahora) === false, "sin pedido: no")
ok(pedidoTienePago({ mp_payment_id: 5551234 }) === true, "un id numérico cuenta como pago")

console.log("\n3. Hasta cuándo se puede pagar")
ok(pagableHasta({ ...base, vence_en: iso(ahora + DIA) }, ahora)?.getTime() === ahora + DIA, "pendiente con fecha futura: devuelve la fecha")
ok(pagableHasta(base, ahora) === null, "ya pasó: null")
ok(pagableHasta({ ...base, vence_en: null }, ahora) === null, "sin vence_en: null")
ok(pagableHasta({ estado: "pagado", vence_en: iso(ahora + DIA) }, ahora) === null, "pagado: null")

console.log("\n4. Las fechas que se le mandan a MercadoPago")
ok(fechaAR(Date.UTC(2026, 9, 1, 12, 30, 0)) === "2026-10-01T09:30:00.000-03:00", "fechaAR: hora de Argentina con su desfase")
const venceEn = Date.UTC(2026, 9, 4, 15, 0, 0)
const c = camposDeVencimiento(venceEn, Date.UTC(2026, 9, 1, 15, 0, 0))
ok(c.expires === true, "expires: true")
ok(c.expiration_date_to === "2026-10-04T12:00:00.000-03:00", "expiration_date_to: la fecha de vencimiento")
ok(c.date_of_expiration === c.expiration_date_to, "date_of_expiration: la misma fecha (el ticket en efectivo no vive más que el link)")
ok(c.expiration_date_from === "2026-10-01T11:59:00.000-03:00", "expiration_date_from: un minuto antes de ahora")
ok(Object.keys(c).length === 4, "son exactamente cuatro campos")

entorno(ENV_ORIGINAL.NODE_ENV, ENV_ORIGINAL.MIN)
console.log(fallas === 0 ? "\nTODO OK" : `\n${fallas} FALLAS`)
process.exit(fallas ? 1 : 0)
