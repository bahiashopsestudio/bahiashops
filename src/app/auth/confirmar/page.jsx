// A donde llevan los enlaces de los mails de Supabase Auth (registro, recuperar
// contraseña, cambio de email, invitación). Al abrirse NO confirma nada: muestra
// un botón, y la confirmación pasa en /auth/confirmar/verificar al apretarlo.
// Así un programa de mail que abre los enlaces para revisarlos no gasta el
// enlace. La regla está en src/lib/confirmacionAuth.js.
//
// También muestra los errores que devuelve la verificación (?error=…).

import Link from 'next/link'
import { leerConfirmacion, mensajeDeError, TIPOS } from '@/lib/confirmacionAuth'

export const metadata = {
  title: 'Confirmar · Bahía Shops',
  robots: { index: false, follow: false },
}

function texto(valor) {
  return typeof valor === 'string' ? valor : Array.isArray(valor) ? valor[0] : undefined
}

function Marco({ titulo, children }) {
  return (
    <>
      <link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Fraunces:opsz,wght@9..144,500&family=Poppins:wght@300;400;500&display=swap" />
      <main className="min-h-screen bg-white flex items-center justify-center px-4 py-16" style={{ fontFamily: "'Inter', sans-serif" }}>
        <div className="w-full max-w-md">
          <Link href="/" className="no-underline text-[#0a0a0a]" style={{ fontWeight: 800, fontSize: '11px', letterSpacing: '3px', textTransform: 'uppercase' }}>
            Bahía Shops
          </Link>
          <h1 className="mt-6 mb-3 text-[26px] text-[#0a0a0a]" style={{ fontFamily: 'Fraunces, serif', fontWeight: 500 }}>
            {titulo}
          </h1>
          {children}
        </div>
      </main>
    </>
  )
}

const PARRAFO = { fontFamily: 'Poppins, sans-serif', fontWeight: 300, fontSize: '14px', lineHeight: 1.65, color: 'rgba(10,10,10,0.65)' }
const BOTON = { fontFamily: "'Inter', sans-serif", fontWeight: 500, fontSize: '14px', borderRadius: '4px', padding: '14px 28px' }

export default async function ConfirmarPage({ searchParams }) {
  const params = await searchParams

  const error = texto(params?.error)
  if (error) {
    const m = mensajeDeError(error)
    const tipo = texto(params?.type)
    return (
      <Marco titulo={m.titulo}>
        <p className="m-0 mb-6" style={PARRAFO}>{m.texto}</p>
        <div className="flex flex-wrap gap-3">
          <Link href="/entrar" className="inline-block bg-[#0a0a0a] text-white no-underline" style={BOTON}>
            Ir a entrar
          </Link>
          {tipo === 'recovery' ? (
            <Link href="/recuperar-contrasena" className="inline-block bg-white text-[#0a0a0a] border border-[#0a0a0a]/25 no-underline" style={BOTON}>
              Pedir otro enlace
            </Link>
          ) : null}
        </div>
      </Marco>
    )
  }

  // Acá solo se revisa el formato, para no mostrar un botón que no puede andar.
  // El origen real lo valida la verificación.
  const pedido = leerConfirmacion(params, '')
  if (!pedido.ok) {
    const m = mensajeDeError('invalido')
    return (
      <Marco titulo={m.titulo}>
        <p className="m-0 mb-6" style={PARRAFO}>{m.texto}</p>
        <Link href="/entrar" className="inline-block bg-[#0a0a0a] text-white no-underline" style={BOTON}>
          Ir a entrar
        </Link>
      </Marco>
    )
  }

  const t = TIPOS[pedido.tipo]
  return (
    <Marco titulo={t.titulo}>
      <p className="m-0 mb-6" style={PARRAFO}>{t.texto}</p>
      <form method="post" action="/auth/confirmar/verificar">
        <input type="hidden" name="token_hash" value={pedido.tokenHash} />
        <input type="hidden" name="type" value={pedido.tipo} />
        {texto(params?.next) ? <input type="hidden" name="next" value={texto(params.next)} /> : null}
        {texto(params?.redirect_to) ? <input type="hidden" name="redirect_to" value={texto(params.redirect_to)} /> : null}
        <button type="submit" className="bg-[#0a0a0a] text-white border border-[#0a0a0a] cursor-pointer hover:bg-transparent hover:text-[#0a0a0a] transition-colors" style={BOTON}>
          {t.boton}
        </button>
      </form>
    </Marco>
  )
}
