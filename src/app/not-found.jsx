import Link from 'next/link'

export const metadata = {
  title: 'Página no encontrada | Bahía Shops',
}

export default function NotFound() {
  return (
    <>
      <link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Fraunces:opsz,wght@9..144,100..900&family=Poppins:wght@300;400;500&family=Inter:wght@200;300;400;500;600;700;800;900&display=swap" />

      <div className="min-h-screen bg-white flex items-center justify-center px-5" style={{ fontFamily: "'Inter', sans-serif" }}>
        <div className="max-w-md w-full text-center" style={{ paddingBottom: '80px' }}>
          <p style={{ fontFamily: "'Inter', sans-serif", fontSize: '10px', textTransform: 'uppercase', letterSpacing: '2px', color: 'rgba(10,10,10,0.3)', marginBottom: '10px' }}>
            Error 404
          </p>

          <h1
            className="text-[26px] md:text-[34px]"
            style={{ fontFamily: 'Fraunces, serif', fontWeight: 500, color: '#0a0a0a', letterSpacing: '-0.02em', marginBottom: '12px' }}
          >
            No encontramos esta página
          </h1>

          <p style={{ fontFamily: 'Poppins, sans-serif', fontWeight: 300, fontSize: '14px', color: 'rgba(10,10,10,0.45)', lineHeight: 1.7, marginBottom: '32px' }}>
            Puede que el link esté mal escrito, que la página se haya mudado o que la tienda que buscás todavía no esté publicada.
          </p>

          <div className="flex gap-3 justify-center flex-wrap">
            <Link
              href="/"
              className="inline-flex items-center justify-center border rounded-[4px] text-sm font-medium transition-colors no-underline bg-[#0a0a0a] border-[#0a0a0a] text-white hover:bg-white hover:text-[#0a0a0a]"
              style={{ padding: '10px 24px' }}
            >
              Volver al inicio
            </Link>
            <Link
              href="/categorias"
              className="inline-flex items-center justify-center border rounded-[4px] text-sm font-medium transition-colors no-underline bg-white border-[#0a0a0a] text-[#0a0a0a] hover:bg-[#0a0a0a] hover:text-white"
              style={{ padding: '10px 24px' }}
            >
              Ver categorías
            </Link>
          </div>
        </div>
      </div>
    </>
  )
}
