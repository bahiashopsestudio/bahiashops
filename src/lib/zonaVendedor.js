// La zona de una tienda que no muestra su dirección exacta: la grilla a la
// que se redondea el punto, el círculo con que se dibuja y el texto con que
// se presenta ("12 de Octubre entre Salta y Mitre").
//
// La grilla tiene que ser la misma que la del disparador
// privado.vendedores_redondear_zona (migración 018): la ruta redondea antes
// de guardar y la base vuelve a redondear como segunda barrera. Redondear un
// punto que ya está en la grilla no lo mueve, así que las dos conviven.
// scripts/probar-018.mjs compara las dos.

// ~200 m en Bahía Blanca (latitud -38.7°): 0,0018° de latitud y 0,0023° de
// longitud. Expresados en diezmillonésimas de grado, porque latitud y
// longitud son numeric(10,7) y así la cuenta se hace con enteros.
const ESCALA = 1e7
const PASO_LAT = 18000
const PASO_LNG = 23000

// Unas dos cuadras. Es más que la mitad de la diagonal de una celda (~141 m),
// así que el punto real siempre queda adentro del círculo.
export const RADIO_ZONA_M = 200

export const LARGO_MAX_CALLE = 80

// Como round() de Postgres sobre numeric: la mitad se aleja del cero.
function redondearMitad(x) {
  return Math.sign(x) * Math.round(Math.abs(x))
}

function alPaso(valor, paso) {
  const enteros = redondearMitad(valor * ESCALA) // lo que guarda numeric(10,7)
  const celdas = Math.trunc(enteros / paso)
  const resto = enteros - celdas * paso
  const celda = Math.abs(resto) * 2 >= paso ? celdas + Math.sign(resto) : celdas
  return Number(((celda * paso) / ESCALA).toFixed(7))
}

export function redondearPunto(lat, lng) {
  return { lat: alPaso(lat, PASO_LAT), lng: alPaso(lng, PASO_LNG) }
}

export function textoZona(calle, entre, y) {
  const partes = [calle, entre, y].map((p) => (p || '').trim())
  if (partes.some((p) => !p)) return null
  return `${partes[0]} entre ${partes[1]} y ${partes[2]}`
}
