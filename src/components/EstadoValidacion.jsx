'use client'

import Link from 'next/link'

// Cartel de estado de la tienda, para el panel del vendedor.
// Es permanente: no depende de que la persona venga recién de darse de alta.
//
// Desde que el alta se publica sola (migración 007) el caso normal es
// 'aprobado', y ese cartel es el que ve alguien que acaba de registrarse:
// ya no hay espera ni aviso por mail. Los otros estados son excepciones que
// el admin provoca a mano.

const ESTILO_BOTON_OSCURO = {
  fontFamily: "'Inter', sans-serif", fontWeight: 500, fontSize: '14px',
  backgroundColor: '#0a0a0a', color: '#ffffff',
  borderRadius: '4px', padding: '12px 24px',
}

export default function EstadoValidacion({ estado, notas, slug, bloqueado, cerrado, onCerrar }) {
  // El bloqueo manda sobre cualquier estado: la tienda no se ve, y decirle
  // que está publicada sería mentirle.
  if (bloqueado) {
    return (
      <div className="rounded-2xl p-5" style={{ backgroundColor: '#fce4e4', border: '1px solid #f5b5b5' }}>
        <p className="m-0" style={{ fontFamily: 'Fraunces, serif', fontWeight: 500, fontSize: '17px', color: '#a01020' }}>
          Tu tienda no está visible
        </p>
        <p style={{ fontFamily: 'Poppins, sans-serif', fontWeight: 300, fontSize: '13px', color: '#a01020', margin: '6px 0 0', lineHeight: 1.6 }}>
          Suspendimos la publicación de tu tienda. Te mandamos un mail explicándote por qué y qué podés hacer.
          Si tenés dudas, respondé ese mail y lo vemos.
        </p>
      </div>
    )
  }

  if (estado === 'necesita_cambios') {
    return (
      <div className="rounded-2xl p-5" style={{ backgroundColor: '#fef3c7', border: '1px solid #fde68a' }}>
        <p className="m-0" style={{ fontFamily: 'Fraunces, serif', fontWeight: 500, fontSize: '17px', color: '#92650a' }}>
          Necesitamos que ajustes algo
        </p>
        <p style={{ fontFamily: 'Poppins, sans-serif', fontWeight: 300, fontSize: '13px', color: '#92650a', margin: '6px 0 0', lineHeight: 1.6 }}>
          Revisamos tu tienda y, mientras tanto, la dejamos fuera de vista. Esto es lo que nos quedó pendiente:
        </p>

        {notas && (
          <p
            className="rounded-xl"
            style={{
              fontFamily: "'Inter', sans-serif", fontWeight: 400, fontSize: '14px',
              color: '#0a0a0a', backgroundColor: 'rgba(255,255,255,0.65)',
              padding: '12px 14px', margin: '12px 0 0', lineHeight: 1.6, whiteSpace: 'pre-wrap',
            }}
          >
            {notas}
          </p>
        )}

        <p style={{ fontFamily: 'Poppins, sans-serif', fontWeight: 300, fontSize: '13px', color: '#92650a', margin: '12px 0 0', lineHeight: 1.6 }}>
          Cuando lo corrijas lo revisamos de nuevo y te avisamos por mail.
        </p>

        <Link href="/vendedor/datos" className="inline-block no-underline" style={{ ...ESTILO_BOTON_OSCURO, marginTop: '16px' }}>
          Editar mis datos
        </Link>
      </div>
    )
  }

  if (estado === 'pendiente') {
    return (
      <div className="rounded-2xl p-5" style={{ backgroundColor: '#f1f29f', border: '1px solid #e3e48a' }}>
        <p className="m-0" style={{ fontFamily: 'Fraunces, serif', fontWeight: 500, fontSize: '17px', color: '#5a5c00' }}>
          Estamos revisando tus cambios
        </p>
        <p style={{ fontFamily: 'Poppins, sans-serif', fontWeight: 300, fontSize: '13px', color: '#5a5c00', margin: '6px 0 0', lineHeight: 1.6 }}>
          Tu tienda no está visible mientras la miramos. Te avisamos por mail apenas vuelva a estar publicada.
        </p>
      </div>
    )
  }

  // 'aprobado' y cualquier estado que no conozcamos: la tienda está publicada.
  // Cerrado con la cruz (se guarda en la base, migración 043), queda el link
  // para no perder el acceso a la tienda.
  if (cerrado) {
    if (!slug) return null
    return (
      <Link
        href={`/tienda/${slug}`}
        target="_blank"
        className="inline-block"
        style={{ fontSize: '12px', color: 'rgba(10,10,10,0.45)', textDecoration: 'underline', textUnderlineOffset: '2px' }}
      >
        Ver mi tienda ↗
      </Link>
    )
  }

  return (
    <div className="flex items-center rounded-2xl" style={{ gap: '10px', padding: '12px 16px', backgroundColor: '#ecf7f1', color: '#1f5f43', fontSize: '13px' }}>
      <span aria-hidden="true" className="shrink-0 rounded-full" style={{ width: '8px', height: '8px', backgroundColor: '#2e9e6a' }} />
      <span className="min-w-0">Tu tienda está publicada</span>
      <span className="flex items-center shrink-0" style={{ marginLeft: 'auto', gap: '10px' }}>
        {slug && (
          <Link href={`/tienda/${slug}`} className="whitespace-nowrap" style={{ fontSize: '12px', color: '#1f5f43', textDecoration: 'underline', textUnderlineOffset: '2px' }}>
            Ver mi tienda
          </Link>
        )}
        <button
          type="button"
          onClick={onCerrar}
          aria-label="Cerrar el cartel"
          className="flex items-center justify-center shrink-0 rounded-full cursor-pointer"
          style={{ width: '26px', height: '26px', margin: '-4px -6px -4px 0', border: 'none', backgroundColor: 'transparent', color: '#1f5f43' }}
        >
          <svg width="14" height="14" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
            <path d="m5 5 10 10M15 5 5 15" />
          </svg>
        </button>
      </span>
    </div>
  )
}
