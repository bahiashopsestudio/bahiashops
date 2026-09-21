// El dominio oficial del sitio, escrito una sola vez en todo el repo.
//
// No es una variable de entorno a propósito: hay una sola base de datos, así
// que en desarrollo también tiene que valer este dominio. Si el webhook de
// MercadoPago apuntara a localhost, una compra de prueba local nunca se
// confirmaría, porque MercadoPago no puede alcanzar esa dirección.
export const SITIO_URL = 'https://bahiashops.com.ar'
