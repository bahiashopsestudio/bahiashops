import Link from 'next/link'

export default function SomosBahia() {
  return (
    <section className="py-6 md:py-8">
      <div style={{ background: '#f1f29f', borderRadius: 0, overflow: 'hidden' }}>
        {/* ── Fila superior: texto ── */}
        <div
          className="flex flex-col md:flex-row md:justify-between md:items-start gap-6"
          style={{ padding: '44px 36px 32px' }}
        >
          <div>
            <h2
              style={{
                fontFamily: 'Fraunces, serif',
                fontStyle: 'normal',
                fontWeight: 500,
                fontSize: '34px',
                color: '#0a0a0a',
                letterSpacing: '-0.02em',
                lineHeight: 1.1,
                marginBottom: '8px',
              }}
            >
              Somos Bahía.
            </h2>
            <p
              style={{
                fontFamily: 'Poppins, sans-serif',
                fontWeight: 300,
                fontSize: '15px',
                color: '#333',
              }}
            >
              El marketplace de tu ciudad.
            </p>
          </div>

          <p
            style={{
              fontFamily: 'Poppins, sans-serif',
              fontWeight: 300,
              fontSize: '13px',
              color: '#555',
              lineHeight: 1.65,
              maxWidth: '280px',
            }}
          >
            Te ayudamos a encontrar eso que buscás en tu ciudad. No hace falta que busques afuera.
            Lo que buscás ya está acá.
          </p>
        </div>

        {/* ── Foto grande ── */}
        <div style={{ margin: '0 36px', position: 'relative' }}>
          <img
            src="/images/somos-bahia.png"
            alt="Vendedores de Bahía Shops"
            style={{ width: '100%', height: '300px', objectFit: 'cover', objectPosition: 'center 28%', borderRadius: '6px', display: 'block' }}
          />
          {/* Degradado: sin esto el texto blanco se pierde sobre la parte
              clara de la foto. */}
          <div
            style={{
              position: 'absolute',
              inset: 0,
              borderRadius: '6px',
              background: 'linear-gradient(to top, rgba(0,0,0,0.65) 0%, rgba(0,0,0,0.3) 40%, rgba(0,0,0,0) 70%)',
              pointerEvents: 'none',
            }}
          />

          <div style={{ position: 'absolute', left: '16px', right: '16px', bottom: '16px', maxWidth: '440px' }}>
            <p
              style={{
                fontFamily: "'Inter', sans-serif",
                fontWeight: 500,
                fontSize: '13px',
                color: 'rgba(255,255,255,0.95)',
              }}
            >
              Ella es Sofía. Hace cerámica.
            </p>
            <p
              style={{
                fontFamily: "'Inter', sans-serif",
                fontWeight: 300,
                fontSize: '13px',
                color: 'rgba(255,255,255,0.9)',
              }}
            >
              Bueno… en realidad no existe.
            </p>
          </div>
        </div>

        {/* ── Línea inferior ── */}
        <div style={{ padding: '20px 36px 36px' }}>
          <p
            style={{
              fontFamily: "'Inter', sans-serif",
              fontWeight: 300,
              fontSize: '13px',
              color: '#777',
              lineHeight: 1.6,
              marginBottom: '4px',
            }}
          >
            Pero nos encantaría que pronto haya muchas Sofías reales en Bahía Shops.
          </p>
          <span style={{ fontFamily: "'Inter', sans-serif", fontWeight: 300, fontSize: '13px', color: '#777' }}>
            ¿Tenés un emprendimiento?{' '}
          </span>
          <Link
            href="/vendedor/nuevo"
            style={{
              fontFamily: "'Inter', sans-serif",
              fontWeight: 700,
              fontSize: '13px',
              color: '#0a0a0a',
              textDecoration: 'underline',
              textUnderlineOffset: '3px',
            }}
          >
            Contanos tu historia.
          </Link>
        </div>
      </div>
    </section>
  )
}
