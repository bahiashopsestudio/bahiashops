'use client'

import Link from 'next/link'

// Cartel de estado de la tienda, para el panel del vendedor.
// Es permanente: no depende de que la persona venga recién de darse de alta.
// Cuando está aprobada no muestra nada.

export default function EstadoValidacion({ estado, notas }) {
  if (estado === 'aprobado') return null

  if (estado === 'necesita_cambios') {
    return (
      <div className="rounded-2xl p-5" style={{ backgroundColor: '#fef3c7', border: '1px solid #fde68a' }}>
        <p className="m-0" style={{ fontFamily: 'Fraunces, serif', fontWeight: 500, fontSize: '17px', color: '#92650a' }}>
          Necesitamos que ajustes algo
        </p>
        <p style={{ fontFamily: 'Poppins, sans-serif', fontWeight: 300, fontSize: '13px', color: '#92650a', margin: '6px 0 0', lineHeight: 1.6 }}>
          Antes de publicar tu tienda revisamos tu emprendimiento y nos quedó esto pendiente:
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

        <Link
          href="/vendedor/datos"
          className="inline-block no-underline"
          style={{
            fontFamily: "'Inter', sans-serif", fontWeight: 500, fontSize: '14px',
            backgroundColor: '#0a0a0a', color: '#ffffff',
            borderRadius: '4px', padding: '12px 24px', marginTop: '16px',
          }}
        >
          Editar mis datos
        </Link>
      </div>
    )
  }

  // 'pendiente' y cualquier estado que no conozcamos: el mensaje de bienvenida.
  return (
    <div className="rounded-2xl p-5" style={{ backgroundColor: '#f1f29f', border: '1px solid #e3e48a' }}>
      <p className="m-0" style={{ fontFamily: 'Fraunces, serif', fontWeight: 500, fontSize: '17px', color: '#5a5c00' }}>
        ¡Listo! Ya recibimos tu emprendimiento.
      </p>
      <p style={{ fontFamily: 'Poppins, sans-serif', fontWeight: 300, fontSize: '13px', color: '#5a5c00', margin: '6px 0 0', lineHeight: 1.6 }}>
        Te avisamos por mail cuando tu tienda esté publicada. Mientras tanto podés ir cargando tus productos, así el día que salga ya está todo listo.
      </p>

      <Link
        href="/vendedor/productos/nuevo"
        className="inline-block no-underline"
        style={{
          fontFamily: "'Inter', sans-serif", fontWeight: 500, fontSize: '14px',
          backgroundColor: '#0a0a0a', color: '#ffffff',
          borderRadius: '4px', padding: '12px 24px', marginTop: '16px',
        }}
      >
        Cargar mis productos
      </Link>
    </div>
  )
}
