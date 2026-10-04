// Arma los mails de pedidos con datos inventados y los guarda como HTML (y
// .txt, la versión sin HTML) en vista-mails/, para abrirlos en el navegador.
// No manda nada ni toca la base.
//
//   node scripts/preview-mails.mjs

import { register } from 'node:module'
import { mkdir, writeFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'

const raiz = new URL('../', import.meta.url)

// Node no conoce el alias '@/' de jsconfig.json: se resuelve a src/.
const alias = `
const src = ${JSON.stringify(new URL('src/', raiz).href)}
export function resolve(especificador, contexto, siguiente) {
  if (especificador.startsWith('@/')) {
    const ruta = src + especificador.slice(2)
    return siguiente(/\\.[a-z]+$/.test(ruta) ? ruta : ruta + '.js', contexto)
  }
  return siguiente(especificador, contexto)
}
`
register('data:text/javascript,' + encodeURIComponent(alias))

const { armarMailVenta, armarMailCompra, armarMailDespacho, armarMailPagoTardio } =
  await import('../src/lib/mailsPedidos.js')
const { armarMailCuentaEliminada } = await import('../src/lib/mailsCuenta.js')

const base = {
  pedidoId: 1042,
  tienda: 'Cerámica del Puerto',
  nombre: 'Lucía',
  apellido: 'Fernández',
  telefono: '2915123456',
  apodo: 'Nutria Curiosa',
  items: [
    { nombre: 'Taza esmaltada', variante: 'Azul', cantidad: 2, precio: 6500 },
    { nombre: 'Plato playo', variante: null, cantidad: 1, precio: 9800 },
  ],
  costoEnvio: 0,
  total: 22800,
  comision: 1140,
  direccion: null,
  turno: null,
}

const direccion = { calle: 'Alsina', numero: '235', piso_depto: '2B', barrio: 'Centro' }

const casos = {
  retiro: { ...base, metodoEnvio: 'retiro', direccionVisible: true },
  'retiro-sin-direccion': { ...base, metodoEnvio: 'retiro', direccionVisible: false },
  envio: {
    ...base, metodoEnvio: 'envio_tienda', zonaEnvio: 2, costoEnvio: 2500, total: 25300, direccion, turno: 'Tarde',
  },
  'envio-gratis': {
    ...base, metodoEnvio: 'envio_tienda', zonaEnvio: 1, costoEnvio: 0, direccion, turno: null,
  },
  coordinar: { ...base, metodoEnvio: 'coordinar' },
  // Un nombre viejo: se tiene que leer igual que el nuevo.
  'nombre-viejo': { ...base, metodoEnvio: 'acordar' },
  // Todo lo que viene de la base tiene que verse como texto, no como HTML.
  escapado: {
    ...base,
    metodoEnvio: 'envio_tienda',
    zonaEnvio: 3,
    tienda: '<b>Lo de "Pepa" & Co</b>',
    nombre: 'Ana <i>María</i>',
    apellido: "O'Connor & Hnos",
    apodo: 'Zorro <script>',
    items: [{ nombre: 'Mate "imperial" <XL>', variante: 'Rojo & negro', cantidad: 1, precio: 14500 }],
    costoEnvio: 1800,
    total: 16300,
    comision: 725,
    direccion: { calle: 'Av. "Colón"', numero: '80', piso_depto: '<3° A>', barrio: 'Villa Mitre & Co' },
    turno: 'Mañana',
  },
  'sin-apodo': { ...base, metodoEnvio: 'retiro', apodo: null },
  correo: {
    ...base, metodoEnvio: 'correo', zonaEnvio: 1, costoEnvio: 4200, total: 27000,
    direccion: { ...direccion, piso_depto: null, ciudad: 'Bahía Blanca', provincia: 'Buenos Aires', codigo_postal: '8000' }, turno: null,
  },
  // Correo a otra ciudad: la dirección va con ciudad, provincia y código postal.
  'correo-otra-ciudad': {
    ...base, metodoEnvio: 'correo', zonaEnvio: 4, costoEnvio: 9000, total: 31800,
    direccion: { calle: 'Av. San Martín', numero: '1200', piso_depto: null, barrio: null,
      ciudad: 'Mendoza', provincia: 'Mendoza', codigo_postal: 'M5500ABC' },
    turno: null,
  },
}

const mails = {}
for (const [caso, datos] of Object.entries(casos)) {
  mails[`venta-${caso}`] = armarMailVenta(datos)
  mails[`compra-${caso}`] = armarMailCompra(datos)
}
mails.despacho = armarMailDespacho({
  pedido: { id: 1042, metodo_envio: 'envio_tienda', subtotal_productos: 22800, costo_envio: 2500, total: 25300 },
  nombreVendedor: 'Cerámica del Puerto',
  direccion: 'Alsina 235, 2B',
  franja: 'Tarde',
})
// Por correo: sin "Franja de entrega" y con la tarjeta de seguimiento.
mails['despacho-correo'] = armarMailDespacho({
  pedido: {
    id: 1043, metodo_envio: 'correo', subtotal_productos: 22800, costo_envio: 9000, total: 31800,
    envio_empresa: 'andreani', envio_empresa_otra: null, envio_seguimiento: '360002157889',
  },
  nombreVendedor: 'Cerámica del Puerto',
  direccion: 'Av. San Martín 1200, Mendoza, Mendoza (M5500ABC)',
  franja: 'Tarde',
})
mails['despacho-correo-otra'] = armarMailDespacho({
  pedido: {
    id: 1044, metodo_envio: 'correo', subtotal_productos: 22800, costo_envio: 4200, total: 27000,
    envio_empresa: 'otra', envio_empresa_otra: 'Vía <Cargo> & Co', envio_seguimiento: 'VC-"1"',
  },
  nombreVendedor: 'Cerámica del Puerto',
  direccion: 'Colón 10, Punta Alta, Buenos Aires (B8109ABC)',
  franja: 'Mañana',
})

// Eliminar mi cuenta: con nombre y sin nombre ("Hola:").
mails['cuenta-eliminada'] = armarMailCuentaEliminada({ nombre: 'Lucía' })
mails['cuenta-eliminada-sin-nombre'] = armarMailCuentaEliminada({ nombre: null })
mails['cuenta-eliminada-escapado'] = armarMailCuentaEliminada({ nombre: '<b>Ana</b> & "Co"' })

// Aviso interno de un pago sobre un pedido cancelado (a notificaciones@).
mails['interno-pago-tardio'] = armarMailPagoTardio({
  pedidoId: 1042, tienda: '<b>Lo de "Pepa" & Co</b>', monto: 22800, pagoId: 123456789, estado: 'approved',
})

const carpeta = new URL('vista-mails/', raiz)
await mkdir(carpeta, { recursive: true })

for (const [nombre, mail] of Object.entries(mails)) {
  await writeFile(new URL(`${nombre}.html`, carpeta), mail.html)
  await writeFile(new URL(`${nombre}.txt`, carpeta), `Asunto: ${mail.asunto}\n\n${mail.texto}\n`)
  console.log(`${nombre}.html — ${mail.asunto}`)
}
console.log(`\n${Object.keys(mails).length} mails en ${fileURLToPath(carpeta)}`)
