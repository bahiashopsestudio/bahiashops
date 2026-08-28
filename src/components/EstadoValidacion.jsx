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

export default function EstadoValidacion({ estado, notas, slug, bloqueado }) {
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
  return (
    <div className="rounded-2xl p-5" style={{ backgroundColor: '#f1f29f', border: '1px solid #e3e48a' }}>
      <p className="m-0" style={{ fontFamily: 'Fraunces, serif', fontWeight: 500, fontSize: '17px', color: '#5a5c00' }}>
        ¡Listo! Tu tienda ya está publicada.
      </p>
      <p style={{ fontFamily: 'Poppins, sans-serif', fontWeight: 300, fontSize: '13px', color: '#5a5c00', margin: '6px 0 0', lineHeight: 1.6 }}>
        Cargá tus productos para que la gente pueda encontrarte y comprarte.
      </p>

      <div className="flex gap-3 flex-wrap" style={{ marginTop: '16px' }}>
        <Link href="/vendedor/productos/nuevo" className="inline-block no-underline" style={ESTILO_BOTON_OSCURO}>
          Cargar mis productos
        </Link>

        {slug && (
          <Link
            href={`/tienda/${slug}`}
            className="inline-block no-underline"
            style={{
              fontFamily: "'Inter', sans-serif", fontWeight: 500, fontSize: '14px',
              backgroundColor: 'transparent', color: '#5a5c00',
              border: '1px solid rgba(90,92,0,0.35)', borderRadius: '4px', padding: '12px 24px',
            }}
          >
            Ver mi tienda
          </Link>
        )}
      </div>
    </div>
  )
}
