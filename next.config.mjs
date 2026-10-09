// En desarrollo, Next bloquea los pedidos a sus recursos de desarrollo (la
// recarga en caliente, entre otros) que vengan de un dominio que no sea
// localhost. Al probar pagos por un túnel (URL_PUBLICA_DESARROLLO, ver
// src/lib/sitio.js), la página llega pero no se vuelve interactiva. Se habilita
// solo el dominio de ese túnel, y solo fuera de producción (allowedDevOrigins,
// además, solo lo usa `next dev`).
function origenesDeDesarrollo() {
  if (process.env.NODE_ENV === 'production') return []
  try {
    const url = new URL(String(process.env.URL_PUBLICA_DESARROLLO || '').trim())
    return url.protocol === 'https:' ? [url.hostname] : []
  } catch {
    return []
  }
}

/** @type {import('next').NextConfig} */
const nextConfig = {
  allowedDevOrigins: origenesDeDesarrollo(),
  // /login y /registro ya no son pantallas: la única puerta es /entrar. Los
  // links viejos (mails, favoritos del navegador) siguen andando. La query que
  // traen (next, motivo, error) pasa sola al destino; modo abre la pestaña.
  async redirects() {
    return [
      { source: '/login', destination: '/entrar?modo=cuenta', permanent: false },
      { source: '/registro', destination: '/entrar?modo=nuevo', permanent: false },
    ];
  },
};

export default nextConfig;
