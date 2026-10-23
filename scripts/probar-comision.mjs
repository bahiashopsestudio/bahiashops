// Prueba la comisión de la plataforma redondeada al centavo
// (src/lib/precioPedido.js), que «Pagar ahora» la mande tal cual a MercadoPago
// (src/lib/pagarAhora.js) y cómo se escriben los montos con centavos
// (src/lib/montos.js, el panel y los mails).
//
//   npm run probar:comision
//
// No toca MercadoPago ni Supabase.
//
// Los montos esperados están escritos para el 5%: si se cambia
// COMISION_PRODUCTOS, esta prueba avisa, y hay que poner los nuevos.

import { register } from "node:module"

// Node no conoce el alias '@/' de jsconfig.json: se resuelve a src/.
const raiz = new URL("../", import.meta.url)
register("data:text/javascript," + encodeURIComponent(`
const src = ${JSON.stringify(new URL("src/", raiz).href)}
export function resolve(especificador, contexto, siguiente) {
  if (especificador.startsWith('@/')) {
    const ruta = src + especificador.slice(2)
    return siguiente(/\\.[a-z]+$/.test(ruta) ? ruta : ruta + '.js', contexto)
  }
  return siguiente(especificador, contexto)
}
`))

const { calcularPedido, COMISION_PRODUCTOS } = await import("../src/lib/precioPedido.js")
const { armarPreferenciaNueva } = await import("../src/lib/pagarAhora.js")
const { formatearMonto } = await import("../src/lib/montos.js")
const { pesos } = await import("../src/lib/mailBase.js")

let fallas = 0
const ok = (cond, msg) => { if (!cond) { fallas++; console.log("  ✗ FALLA:", msg) } else console.log("  ✓", msg) }

const HORA = 3600 * 1000
const ahoraMs = Date.now()

const vendedor = {
  metodos_entrega_default: ["retiro", "envio_tienda"],
  costos_envio_zona: { zona_1: 0, zona_2: 2500 },
}

// Un pedido de retiro (sin envío) con estos productos: [{ precio, cantidad }].
function pedido(lineas, extra = {}) {
  return calcularPedido({
    items: lineas.map((l, i) => ({ productoId: i + 1, cantidad: l.cantidad, precio: l.precio })),
    productos: lineas.map((l, i) => ({ id: i + 1, nombre: `Producto ${i + 1}`, precio: l.precio, tiene_variantes: false })),
    variantes: [], medias: [], vendedor,
    metodoEnvio: "retiro", costoEnvioVisto: 0,
    ...extra,
  })
}

console.log(`\n1. La comisión, al centavo (COMISION_PRODUCTOS = ${COMISION_PRODUCTOS})`)
{
  ok(COMISION_PRODUCTOS === 0.05, "el porcentaje de estas cuentas es el 5%")

  let r = pedido([{ precio: 50, cantidad: 1 }])
  ok(r.ok && r.comision === 2.5, `$ 50 → 2,50 (antes se redondeaba a 3); dio ${r.comision}`)

  r = pedido([{ precio: 19.99, cantidad: 1 }])
  ok(r.ok && r.comision === 1, `$ 19,99 → 1,00 (99,95 centavos redondean a 100); dio ${r.comision}`)

  r = pedido([{ precio: 1000, cantidad: 2 }])
  ok(r.ok && r.comision === 100, `$ 2000 → 100; dio ${r.comision}`)

  r = pedido([{ precio: 0.1, cantidad: 1 }, { precio: 0.1, cantidad: 1 }])
  ok(r.ok && r.comision === 0.01, `dos productos de $ 0,10 → 0,01; dio ${r.comision}`)

  r = pedido([{ precio: 1000, cantidad: 1 }], {
    metodoEnvio: "envio_tienda", hayDireccion: true, zonaTienda: 2, costoEnvioVisto: 2500,
  })
  ok(r.ok && r.total === 3500 && r.costoEnvio === 2500 && r.comision === 50,
    `productos $ 1000 + envío $ 2500 → la comisión sigue en 50 (el envío no suma); dio ${r.comision}`)
}

console.log("\n2. «Pagar ahora» manda la comisión guardada, con centavos")
{
  const armada = armarPreferenciaNueva({
    pedido: {
      id: 58, total: 50, costo_envio: 0, comision_plataforma: 2.5,
      efectivo_vence_en: new Date(ahoraMs + 48 * HORA).toISOString(),
      comprador_nombre: "Rosario", comprador_apellido: null, comprador_telefono: null,
    },
    items: [{ producto_id: 7, nombre: "Producto de prueba", variante: null, precio: 50, cantidad: 1, foto_url: null }],
    emailComprador: "compradora@correo.test", sitioUrl: "https://bahiashops.com.ar",
    notificationUrl: "https://bahiashops.com.ar/api/mercadopago/webhook", venceLinkMs: ahoraMs + 2 * HORA, ahoraMs,
  })
  ok(armada.ok && armada.cuerpo.marketplace_fee === 2.5, `marketplace_fee 2.5, no 2 ni 3; dio ${armada.cuerpo?.marketplace_fee}`)
}

console.log("\n3. Cómo se escriben los montos")
{
  ok(formatearMonto(2.5) === "2,50", `2.5 → "2,50"; dio "${formatearMonto(2.5)}"`)
  ok(formatearMonto(3) === "3", `3 → "3", sin decimales; dio "${formatearMonto(3)}"`)
  ok(formatearMonto(14500) === "14.500", `14500 → "14.500"; dio "${formatearMonto(14500)}"`)
  ok(formatearMonto(1234.5) === "1.234,50", `1234.5 → "1.234,50"; dio "${formatearMonto(1234.5)}"`)
  ok(formatearMonto(19.99 - 1) === "18,99", `lo que recibe la tienda, 19,99 − 1 → "18,99"; dio "${formatearMonto(19.99 - 1)}"`)
  ok(formatearMonto(100.1 - 0.1) === "100", `una resta que da 99,999… → "100"; dio "${formatearMonto(100.1 - 0.1)}"`)
  ok(formatearMonto(null) === "0", `sin monto → "0"; dio "${formatearMonto(null)}"`)
  ok(pesos(2.5) === "$ 2,50" && pesos(3) === "$ 3", `en los mails: "${pesos(2.5)}" y "${pesos(3)}"`)
}

console.log(fallas === 0 ? "\nTODO OK" : `\n${fallas} FALLAS`)
// exitCode y no exit(): con el cargador del alias registrado, exit() corta un hilo
// a mitad de cerrarse y Node avisa con un "Assertion failed" en Windows.
process.exitCode = fallas ? 1 : 0
