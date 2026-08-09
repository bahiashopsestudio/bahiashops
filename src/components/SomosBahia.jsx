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
            src="/somos-bahia.jpg"
            alt="Vendedores de Bahía Shops"
            style={{ width: '100%', height: '300px', objectFit: 'cover', borderRadius: '6px', display: 'block' }}
          />
          <div style={{ position: 'absolute', left: '16px', bottom: '16px' }}>
            <p
              style={{
                fontFamily: "'Inter', sans-serif",
                fontWeight: 500,
                fontSize: '13px',
                color: 'rgba(255,255,255,0.9)',
              }}
            >
              Marina y Tomás
            </p>
            <p
              style={{
                fontFamily: "'Inter', sans-serif",
                fontWeight: 300,
                fontSize: '13px',
                color: 'rgba(255,255,255,0.9)',
              }}
            >
              Aroma Casa · Barrio Universitario
            </p>
          </div>
        </div>

        {/* ── Línea inferior ── */}
        <div style={{ padding: '20px 36px 36px' }}>
          <span style={{ fontFamily: "'Inter', sans-serif", fontWeight: 300, fontSize: '13px', color: '#777' }}>
            Vendedores reales.{' '}
          </span>
          <a
            href="#"
            style={{
              fontFamily: "'Inter', sans-serif",
              fontWeight: 400,
              fontSize: '13px',
              color: '#0a0a0a',
              textDecoration: 'underline',
              textUnderlineOffset: '3px',
            }}
          >
            Conocé sus historias
          </a>
        </div>
      </div>
    </section>
  )
}
