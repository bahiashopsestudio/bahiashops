// El dominio oficial del sitio, escrito una sola vez en todo el repo.
//
// No es una variable de entorno a propósito: hay una sola base de datos, así
// que en desarrollo también tiene que valer este dominio. Si el webhook de
// MercadoPago apuntara a localhost, una compra de prueba local nunca se
// confirmaría, porque MercadoPago no puede alcanzar esa dirección.
export const SITIO_URL = 'https://bahiashops.com.ar'

// Adónde manda MercadoPago el aviso del pago (notification_url) y adónde vuelve
// la persona después de pagar (back_urls).
//
// Siempre SITIO_URL, salvo para probar pagos en la máquina de quien desarrolla:
// con un túnel HTTPS hacia localhost (por ejemplo `cloudflared tunnel --url
// http://localhost:3000`) y URL_PUBLICA_DESARROLLO=https://<el-túnel> en
// .env.local, los avisos y la vuelta llegan al código local y no al sitio
// publicado. SOLO se respeta fuera de producción (NODE_ENV distinto de
// 'production', o sea `npm run dev`), igual que VENCIMIENTO_PAGO_MINUTOS: en
// producción, y en cualquier build, es siempre SITIO_URL aunque la variable esté
// cargada. Tiene que ser una dirección https sin ruta; si no, se ignora.
//
// Solo para MercadoPago: los links de los mails y el resto del sitio siguen
// usando SITIO_URL.
export function urlParaMercadoPago(entorno = process.env) {
  if (entorno.NODE_ENV === 'production') return SITIO_URL

  const valor = typeof entorno.URL_PUBLICA_DESARROLLO === 'string' ? entorno.URL_PUBLICA_DESARROLLO.trim() : ''
  if (!valor) return SITIO_URL

  try {
    const url = new URL(valor)
    const sinRuta = (url.pathname === '/' || url.pathname === '') && !url.search && !url.hash
    if (url.protocol === 'https:' && sinRuta && !url.username && !url.password) return url.origin
  } catch { /* no es una dirección */ }

  console.warn('URL_PUBLICA_DESARROLLO no es una dirección https sin ruta: se usa el dominio del sitio para MercadoPago.')
  return SITIO_URL
}

// El origen (https://dominio) desde el que la persona hizo el pedido, para armar
// redirecciones y comparar el Origin de un formulario.
//
// Normalmente es el de request.url. Pero detrás del túnel de desarrollo,
// `next dev` arma request.url con su propio host y el protocolo del túnel
// (https://localhost:3000), y una redirección ahí da ERR_SSL_PROTOCOL_ERROR. Por
// eso, SOLO fuera de producción, con URL_PUBLICA_DESARROLLO cargada y si el
// pedido llegó por el túnel (Cloudflare le pone la cabecera cf-ray), se usa la
// dirección del túnel. En producción es siempre el de request.url, sin cambios.
export function origenPublico(request, entorno = process.env) {
  const propio = new URL(request.url).origin
  if (entorno.NODE_ENV === 'production') return propio

  const tunel = urlParaMercadoPago(entorno)
  if (tunel === SITIO_URL) return propio

  const porElTunel = !!request.headers?.get?.('cf-ray')
  return porElTunel ? tunel : propio
}
