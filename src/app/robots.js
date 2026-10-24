import { SITIO_URL } from '@/lib/sitio'

// /robots.txt: qué no tiene que recorrer Google. Son las pantallas de cuenta,
// compra, paneles y la búsqueda con resultados (que además son noindex). Lo
// público y su lista completa están en /sitemap.xml.
export default function robots() {
  return {
    rules: {
      userAgent: '*',
      allow: '/',
      disallow: [
        '/api/',
        '/admin',
        '/vendedor',
        '/carrito',
        '/checkout',
        '/compra',
        '/perfil',
        '/mis-pedidos',
        '/mis-direcciones',
        '/favoritos',
        '/bienvenida',
        '/auth/',
        '/actualizar-contrasena',
        '/buscar?',
      ],
    },
    sitemap: `${SITIO_URL}/sitemap.xml`,
  }
}
