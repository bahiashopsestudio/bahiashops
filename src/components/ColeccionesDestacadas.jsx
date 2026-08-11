import Link from 'next/link'

export default function ColeccionesDestacadas({ colecciones = [] }) {
  if (colecciones.length === 0) return null

  return (
    <section className="px-4 md:px-8 py-6 md:py-8">
      <div className="max-w-6xl mx-auto">
        <h2
          style={{
            fontFamily: 'Fraunces, serif',
            fontWeight: 500,
            fontSize: '28px',
            color: '#0a0a0a',
            letterSpacing: '-0.02em',
            marginBottom: '24px',
          }}
        >
          Colecciones
        </h2>

        <div className="flex flex-col gap-4">
          {colecciones.map((c) => (
            <Link
              key={c.id}
              href={`/coleccion/${c.slug}`}
              className="group flex items-center gap-5 rounded-2xl overflow-hidden border border-[#0a0a0a]/5 hover:border-[#0a0a0a]/20 transition-colors"
            >
              <div className="w-28 h-24 md:w-48 md:h-32 shrink-0 bg-[#ECEAE3] overflow-hidden">
                {c.imagen_url ? (
                  <img
                    src={c.imagen_url}
                    alt={c.nombre}
                    className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                  />
                ) : (
                  <div className="w-full h-full flex items-center justify-center text-[#0a0a0a]/15 text-xs font-light">
                    foto
                  </div>
                )}
              </div>
              <div className="py-3 pr-5 min-w-0">
                <p
                  style={{
                    fontFamily: 'Fraunces, serif',
                    fontWeight: 500,
                    fontSize: '18px',
                    color: '#0a0a0a',
                    letterSpacing: '-0.02em',
                  }}
                >
                  {c.nombre}
                </p>
                {c.descripcion && (
                  <p className="text-sm text-[#0a0a0a]/40 font-light mt-1 line-clamp-2">
                    {c.descripcion}
                  </p>
                )}
              </div>
            </Link>
          ))}
        </div>
      </div>
    </section>
  )
}
