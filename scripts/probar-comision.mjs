// Prueba la comisión de la plataforma redondeada al centavo
// (src/lib/precioPedido.js), que «Pagar ahora» la mande tal cual a MercadoPago
// (src/lib/pagarAhora.js) y cómo se escriben los montos con centavos
// (src/lib/montos.js, el panel y los mails).
//
//   npm run probar:comision
//
// No toca MercadoPago ni Supabase.
//
// Los montos de la sección 1 están escritos para el 5%: si se cambia
// COMISION_BASE_BP, esta prueba avisa, y hay que poner los nuevos. Las
// secciones 4 a 6 prueban la comisión doble (src/lib/comision.js) y la marca
// del link propio (src/lib/marcaLink.js).

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

const { calcularPedido } = await import("../src/lib/precioPedido.js")
const { COMISION_BASE_BP, COMISION_LINK_BP, marcaVigente, especialVigente, elegirComision, porcentajeABp, estadoDeComision, textoPorcentaje, ahorroAlCinco, venceEnDesdeDia, hoyEnArgentina, fechaDeComision, ultimoDiaQueVale } = await import("../src/lib/comision.js")
const { CLAVE_MARCA_LINK, anotarMarca, marcaDe, linkPropio } = await import("../src/lib/marcaLink.js")
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

console.log(`\n1. La comisión, al centavo (COMISION_BASE_BP = ${COMISION_BASE_BP})`)
{
  ok(COMISION_BASE_BP === 500 && COMISION_LINK_BP === 250, "base 500 (5%) y link 250 (2,5%), en puntos básicos")

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

console.log("\n4. La comisión con otro porcentaje (puntos básicos, cuenta en enteros)")
{
  let r = pedido([{ precio: 50, cantidad: 1 }], { comisionBp: 250 })
  ok(r.ok && r.comision === 1.25 && r.comisionBp === 250, `$ 50 al 2,5% → 1,25; dio ${r.comision}`)

  r = pedido([{ precio: 19.99, cantidad: 1 }], { comisionBp: 250 })
  ok(r.ok && r.comision === 0.5, `$ 19,99 al 2,5% → 0,50 (49,975 centavos redondean a 50); dio ${r.comision}`)

  r = pedido([{ precio: 0.1, cantidad: 1 }, { precio: 0.1, cantidad: 1 }], { comisionBp: 250 })
  ok(r.ok && r.comision === 0.01, `dos de $ 0,10 al 2,5% → 0,01 (medio centavo redondea para arriba); dio ${r.comision}`)

  r = pedido([{ precio: 1000, cantidad: 1 }], {
    comisionBp: 250, metodoEnvio: "envio_tienda", hayDireccion: true, zonaTienda: 2, costoEnvioVisto: 2500,
  })
  ok(r.ok && r.total === 3500 && r.comision === 25, `$ 1000 + envío $ 2500 al 2,5% → 25 (el envío no suma); dio ${r.comision}`)

  r = pedido([{ precio: 1000, cantidad: 1 }], { comisionBp: 0 })
  ok(r.ok && r.comision === 0, `al 0% → 0; dio ${r.comision}`)

  r = pedido([{ precio: 1000, cantidad: 1 }])
  ok(r.ok && r.comisionBp === 500 && r.comision === 50, "sin comisionBp: 500 por defecto")

  for (const malo of [-1, 10001, 2.5, "250", null, NaN]) {
    r = pedido([{ precio: 1000, cantidad: 1 }], { comisionBp: malo })
    ok(!r.ok && r.codigo === "COMISION_INVALIDA" && r.status === 500, `comisionBp ${JSON.stringify(malo)}: rechazo COMISION_INVALIDA`)
  }
}

console.log("\n5. Qué comisión toca (elegirComision)")
{
  const ahora = Date.parse("2026-10-27T15:00:00-03:00")
  const MIN = 60 * 1000
  const elegir = (linkTocadoEn, especiales = []) => elegirComision({ linkTocadoEn, especiales, ahoraMs: ahora })
  const especial = (bp, extra = {}) => ({ comision_bp: bp, desde: new Date(ahora - 24 * HORA).toISOString(), vence_en: null, terminada_en: null, ...extra })
  const es = (r, bp, motivo, origen) => r.bp === bp && r.motivo === motivo && r.origen === origen

  let r = elegir(null)
  ok(es(r, 500, "base", "directo") && r.linkTocadoEn === null, "sin link ni especial: 500 · base · directo")

  r = elegir(ahora - HORA)
  ok(es(r, 250, "link", "link_tienda") && r.linkTocadoEn === ahora - HORA, "link tocado hace 1 h: 250 · link · link_tienda, con la marca")
  r = elegir(ahora - 47 * HORA - 59 * MIN)
  ok(es(r, 250, "link", "link_tienda"), "link tocado hace 47 h 59 min: 250")
  r = elegir(ahora - 48 * HORA - MIN)
  ok(es(r, 500, "base", "directo") && r.linkTocadoEn === null, "link vencido (48 h 1 min): 500 · directo, sin marca")
  r = elegir(ahora + 4 * MIN)
  ok(es(r, 250, "link", "link_tienda"), "marca 4 min en el futuro (reloj adelantado): 250")
  r = elegir(ahora + 6 * MIN)
  ok(es(r, 500, "base", "directo"), "marca 6 min en el futuro: 500")

  for (const malo of ["1729990000000", -5, 0, 1.5, undefined, {}, NaN]) {
    ok(es(elegir(malo), 500, "base", "directo"), `marca ${JSON.stringify(malo) ?? "undefined"}: 500`)
  }
  ok(!marcaVigente(String(ahora), ahora) && marcaVigente(ahora, ahora), "marcaVigente: solo números")

  r = elegir(null, [especial(100)])
  ok(es(r, 100, "especial", "directo"), "especial 1% sin link: 100 · especial · directo")
  r = elegir(ahora - HORA, [especial(300)])
  ok(es(r, 250, "link", "link_tienda"), "especial 3% con link: gana el link (250)")
  r = elegir(null, [especial(300)])
  ok(es(r, 300, "especial", "directo"), "especial 3% sin link: 300 · especial")
  r = elegir(ahora - HORA, [especial(100)])
  ok(es(r, 100, "especial", "link_tienda") && r.linkTocadoEn === ahora - HORA, "especial 1% con link: 100 · especial, pero el origen sigue siendo link_tienda")
  r = elegir(ahora - HORA, [especial(250)])
  ok(es(r, 250, "link", "link_tienda"), "especial 2,5% con link (empate): queda el motivo link")
  r = elegir(null, [especial(0)])
  ok(es(r, 0, "especial", "directo"), "especial 0% sin vencimiento: 0")
  r = elegir(null, [especial(100, { vence_en: new Date(ahora - MIN).toISOString() })])
  ok(es(r, 500, "base", "directo"), "especial vencida: se ignora")
  r = elegir(null, [especial(100, { vence_en: new Date(ahora + HORA).toISOString() })])
  ok(es(r, 100, "especial", "directo"), "especial que vence en 1 h: vale")
  r = elegir(null, [especial(100, { terminada_en: new Date(ahora - MIN).toISOString() })])
  ok(es(r, 500, "base", "directo"), "especial terminada: se ignora")
  r = elegir(null, [especial(100, { desde: new Date(ahora + HORA).toISOString() })])
  ok(es(r, 500, "base", "directo"), "especial que todavía no empezó: se ignora")
  ok(especialVigente([especial(300), especial(150)], ahora)?.comision_bp === 150, "dos vigentes por un choque: la más baja")
  ok(especialVigente([], ahora) === null && especialVigente(null, ahora) === null, "sin filas: ninguna")

  const bien = [["0", 0], [0, 0], ["1,5", 150], [1.5, 150], ["2.25", 225], ["4,99", 499], [" 3 ", 300]]
  for (const [valor, bp] of bien) ok(porcentajeABp(valor) === bp, `porcentaje ${JSON.stringify(valor)} → ${bp} bp`)
  for (const malo of ["5", 5, "4,999", "-1", "1,5%", "", null, "abc", "1e2"]) {
    ok(porcentajeABp(malo) === null, `porcentaje ${JSON.stringify(malo)}: no se acepta`)
  }
  ok(estadoDeComision(especial(100), ahora) === "vigente", "estado: vigente")
  ok(estadoDeComision(especial(100, { vence_en: new Date(ahora - MIN).toISOString() }), ahora) === "vencida", "estado: vencida")
  ok(estadoDeComision(especial(100, { terminada_en: new Date(ahora).toISOString() }), ahora) === "terminada", "estado: terminada")
}

console.log("\n6. La marca del link en el navegador (marcaLink)")
{
  const ahora = Date.parse("2026-10-27T15:00:00-03:00")
  const memoria = () => {
    const datos = new Map()
    return {
      getItem: (k) => (datos.has(k) ? datos.get(k) : null),
      setItem: (k, v) => datos.set(k, String(v)),
      removeItem: (k) => datos.delete(k),
    }
  }

  const local = memoria()
  anotarMarca(local, 15, ahora - HORA)
  ok(marcaDe(local, 15, ahora) === ahora - HORA, "la tienda 15 tiene su marca")
  ok(marcaDe(local, 16, ahora) === null, "link de otra tienda: la 16 no tiene marca → 500")
  ok(marcaDe(local, "15", ahora) === ahora - HORA, "el id como texto (de la URL) también vale")

  anotarMarca(local, 15, ahora)
  ok(marcaDe(local, 15, ahora) === ahora, "volver a tocar el link renueva la marca")

  anotarMarca(local, 16, ahora - 49 * HORA)
  ok(marcaDe(local, 16, ahora) === null, "una marca de hace 49 h no se devuelve")
  anotarMarca(local, 18, ahora)
  ok(!JSON.parse(local.getItem(CLAVE_MARCA_LINK))["16"], "al anotar otra, las vencidas se borran")

  const roto = memoria()
  roto.setItem(CLAVE_MARCA_LINK, "{no es json")
  ok(marcaDe(roto, 15, ahora) === null, "lo guardado roto: sin marca, sin error")
  anotarMarca(roto, 15, ahora)
  ok(marcaDe(roto, 15, ahora) === ahora, "y anotar arriba de lo roto lo arregla")

  const bloqueado = { getItem() { throw new Error("bloqueado") }, setItem() { throw new Error("bloqueado") } }
  ok(marcaDe(bloqueado, 15, ahora) === null, "almacenamiento bloqueado (modo privado): sin marca, sin error")
  anotarMarca(bloqueado, 15, ahora)
  ok(true, "anotar con el almacenamiento bloqueado no lanza")
  ok(marcaDe(null, 15, ahora) === null, "sin almacenamiento: sin marca")

  anotarMarca(local, 0, ahora)
  anotarMarca(local, "abc", ahora)
  const guardado = JSON.parse(local.getItem(CLAVE_MARCA_LINK))
  ok(!("0" in guardado) && !("abc" in guardado), "un id inválido no se anota")

  ok(linkPropio({ slug: "la tienda" }) === "https://bahiashops.com.ar/tienda/la%20tienda?de=tienda", `link de la tienda: ${linkPropio({ slug: "la tienda" })}`)
  ok(linkPropio({ productoId: 42 }) === "https://bahiashops.com.ar/producto/42?de=tienda", `link del producto: ${linkPropio({ productoId: 42 })}`)
}

console.log("\n7. Cómo se escriben una comisión y sus fechas (las pantallas de la tanda A2)")
{
  ok(textoPorcentaje(250) === "2,5%", "250 bp: 2,5%")
  ok(textoPorcentaje(100) === "1%", "100 bp: 1%")
  ok(textoPorcentaje(0) === "0%", "0 bp: 0%")
  ok(textoPorcentaje(125) === "1,25%", "125 bp: 1,25%")

  ok(ahorroAlCinco(22800, 570) === 570, "al 5% serían 1.140; pagó 570: se ahorró 570")
  ok(ahorroAlCinco(18500, 925) === 0, "pagó el 5%: no se ahorró nada")
  ok(ahorroAlCinco(100.1, 2.5) === 2.51, "medio centavo para arriba: 5,005 redondea a 5,01")

  ok(venceEnDesdeDia("2026-12-31") === "2027-01-01T00:00:00-03:00", "vence el 31/12: se guarda el 1/1 a las 00:00 de Argentina")
  ok(venceEnDesdeDia("2028-02-28") === "2028-02-29T00:00:00-03:00", "año bisiesto")
  ok(venceEnDesdeDia("2026-02-31") === null, "un día que no existe: null")
  ok(venceEnDesdeDia("") === null && venceEnDesdeDia(null) === null, "vacío: null")

  const octubre2026 = Date.parse("2026-10-30T12:00:00-03:00")
  ok(hoyEnArgentina(octubre2026) === "2026-10-30", "hoy en Argentina")
  ok(hoyEnArgentina(Date.parse("2026-10-31T01:00:00Z")) === "2026-10-30", "a las 22 de Argentina ya es otro día en UTC, pero acá sigue siendo hoy")

  ok(ultimoDiaQueVale("2026-12-31T23:59:00-03:00", octubre2026) === "31 de diciembre", "mismo año: sin el año")
  ok(ultimoDiaQueVale("2027-01-01T00:00:00-03:00", octubre2026) === "31 de diciembre", "vence el 1/1 a las 00:00: el último día es el 31/12 de este año")
  ok(ultimoDiaQueVale("2027-01-01T03:00:00.000Z", octubre2026) === "31 de diciembre", "el mismo instante, como lo devuelve la base")
  ok(ultimoDiaQueVale("2028-01-01T00:00:00-03:00", octubre2026) === "31 de diciembre de 2027", "otro año: con el año")
  ok(ultimoDiaQueVale("no es fecha", octubre2026) === "", "una fecha ilegible: vacío")

  ok(fechaDeComision("2026-11-01T10:00:00-03:00", octubre2026) === "1 de noviembre", "desde, este año")
  ok(fechaDeComision("2025-11-01T10:00:00-03:00", octubre2026) === "1 de noviembre de 2025", "desde, otro año")
  ok(fechaDeComision("2027-01-01T01:00:00Z", octubre2026) === "31 de diciembre", "el año también se mira en Argentina")
}

console.log(fallas === 0 ? "\nTODO OK" : `\n${fallas} FALLAS`)
// exitCode y no exit(): con el cargador del alias registrado, exit() corta un hilo
// a mitad de cerrarse y Node avisa con un "Assertion failed" en Windows.
process.exitCode = fallas ? 1 : 0
