// La zona del envío de la tienda para una dirección de quien compra. Sólo
// servidor: la usan /api/envio/cotizar y /api/pedidos/crear, así que el
// checkout y el cobro calculan exactamente igual.
//
// La cuenta es zonaEntrePuntos(), de metodosEntrega.js: la línea recta entre
// el punto de la tienda (vendedores.latitud/longitud) y el de la dirección
// (direcciones.lat/lng), por el factor de calles. Si falta alguno de los dos
// puntos devuelve null: el envío de la tienda no se ofrece para esa dirección,
// y queda una fila en envio_zona_fallas para ver qué hay que completar.

import { zonaEntrePuntos } from '@/lib/metodosEntrega'

// vendedor: { id, latitud, longitud }; direccion: { id, lat, lng }.
// Devuelve la zona (1..4) o null. 'admin' es un cliente con service_role;
// sólo se usa para el registro, que nunca frena nada.
export async function zonaTiendaPara({ admin, vendedor, direccion, origen }) {
  const puntoTienda = { lat: vendedor?.latitud, lng: vendedor?.longitud }
  const puntoComprador = { lat: direccion?.lat, lng: direccion?.lng }
  const zona = zonaEntrePuntos(puntoTienda, puntoComprador)

  if (zona === null) {
    const sinTienda = zonaEntrePuntos(puntoTienda, puntoTienda) === null
    const sinComprador = zonaEntrePuntos(puntoComprador, puntoComprador) === null
    const motivo = sinTienda && sinComprador ? 'sin_ningun_punto'
      : sinTienda ? 'tienda_sin_punto'
      : 'direccion_sin_punto'

    const { error } = await admin.from('envio_zona_fallas').insert({
      vendedor_id: vendedor?.id ?? null,
      direccion_id: direccion?.id ?? null,
      motivo,
      origen,
    })
    if (error) console.error('No se pudo registrar la zona sin calcular', error.message)
    console.warn('Envío de la tienda: zona sin calcular', {
      vendedor: vendedor?.id, direccion: direccion?.id, motivo, origen,
    })
  }

  return zona
}
