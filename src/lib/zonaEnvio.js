// Las zonas de envío para una dirección de quien compra: la del envío de la
// tienda y la del correo. Sólo servidor: la usan /api/envio/cotizar y
// /api/pedidos/crear, así que el checkout y el cobro calculan exactamente
// igual.
//
// Las cuentas son las de metodosEntrega.js, con el punto de la tienda
// (vendedores.latitud/longitud) y el de la dirección (direcciones.lat/lng):
//   envío de la tienda: línea recta × 1,3, hasta 20 km; más lejos no llega.
//   correo: línea recta, sin tope.
// Si falta alguno de los dos puntos, la zona es null y queda una fila en
// envio_zona_fallas (con el método) para ver qué hay que completar. Que el
// envío de la tienda no llegue por distancia no es una falla: no se registra.

import { zonaEntrePuntos, zonaCorreoEntrePuntos, puntoCompleto } from '@/lib/metodosEntrega'

// vendedor: { id, latitud, longitud }; direccion: { id, lat, lng }.
// metodos: los métodos para los que hace falta la zona ('envio_tienda',
// 'correo'). Devuelve { envio_tienda, correo }: cada uno { zona, motivo } con
// zona 1..4 o null, y motivo null, 'lejos' o el de la falla. Los métodos que
// no se piden vuelven como undefined. 'admin' es un cliente con service_role;
// sólo se usa para el registro, que nunca frena nada.
export async function zonasPara({ admin, vendedor, direccion, origen, metodos }) {
  const puntoTienda = { lat: vendedor?.latitud, lng: vendedor?.longitud }
  const puntoComprador = { lat: direccion?.lat, lng: direccion?.lng }
  const sinTienda = !puntoCompleto(puntoTienda)
  const sinComprador = !puntoCompleto(puntoComprador)
  const falta = sinTienda && sinComprador ? 'sin_ningun_punto'
    : sinTienda ? 'tienda_sin_punto'
    : sinComprador ? 'direccion_sin_punto'
    : null

  const resultado = {}
  for (const metodo of metodos) {
    if (falta) {
      resultado[metodo] = { zona: null, motivo: falta }
      const { error } = await admin.from('envio_zona_fallas').insert({
        vendedor_id: vendedor?.id ?? null,
        direccion_id: direccion?.id ?? null,
        motivo: falta,
        metodo,
        origen,
      })
      if (error) console.error('No se pudo registrar la zona sin calcular', error.message)
      console.warn('Zona de envío sin calcular', { vendedor: vendedor?.id, direccion: direccion?.id, metodo, motivo: falta, origen })
      continue
    }
    const zona = metodo === 'correo'
      ? zonaCorreoEntrePuntos(puntoTienda, puntoComprador)
      : zonaEntrePuntos(puntoTienda, puntoComprador)
    resultado[metodo] = { zona, motivo: zona === null ? 'lejos' : null }
  }
  return resultado
}
