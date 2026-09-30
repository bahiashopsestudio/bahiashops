/** @type {import('next').NextConfig} */
const nextConfig = {
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
