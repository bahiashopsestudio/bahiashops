'use client'

// El bloque «Tu plan» de Mi negocio (/vendedor/perfil), después de «Tu link».
// Sigue el mockup aprobado (mockup-tanda-f1.html): en blanco con borde fino,
// para que no haya dos bloques verdes seguidos. Los datos los trae la página
// de /api/vendedor/plan (cargarPlan, src/lib/planDelPanel.js).
//
//   · Gratis: el plan, $0, productos, fotos y carritos, y abajo lo que trae el
//     plan siguiente con «Ver planes».
//   · Plan a medida: el tope especial, sin el precio (es una condición del
//     admin; en F3 se ve en la suscripción).
//   · Sin tope: solo cuántos productos tiene.
// La suscripción al plan (F3, migración 048) va abajo, en SuscripcionPlan,
// solo para las tiendas habilitadas (datos.suscripciones).

import Link from 'next/link'
import { LINK_PLANES, textoPrecio } from '@/lib/planes'
import SuscripcionPlan from '@/components/SuscripcionPlan'

const FUENTE_TEXTO = { fontFamily: 'Poppins, sans-serif', fontWeight: 300 }

function Uso({ valor, texto, primero }) {
  return (
    <div className="flex flex-col min-w-0" style={{ gap: '2px', padding: primero ? '0 12px 0 0' : '0 12px', borderLeft: primero ? 'none' : '1px solid rgba(10,10,10,0.06)' }}>
      <b style={{ fontSize: '17px', fontWeight: 600, color: '#0a0a0a', fontVariantNumeric: 'tabular-nums' }}>{valor}</b>
      <span style={{ fontSize: '11.5px', fontWeight: 300, lineHeight: 1.35, color: 'rgba(10,10,10,0.5)' }}>{texto}</span>
    </div>
  )
}

// datos: lo de la ruta, { error }, o null mientras carga.
// onCambio: vuelve a leer el plan (cuando la suscripción lo cambia).
export default function TuPlan({ datos, onCambio }) {
  const marco = { border: '1px solid rgba(10,10,10,0.08)', borderRadius: '16px', padding: '20px 22px', backgroundColor: '#ffffff' }

  if (!datos) {
    return <div style={marco}><p className="m-0" style={{ ...FUENTE_TEXTO, fontSize: '12.5px', color: 'rgba(10,10,10,0.4)' }}>Cargando tu plan...</p></div>
  }
  if (datos.error) {
    return <p className="m-0" style={{ ...FUENTE_TEXTO, fontSize: '12px', color: 'rgba(10,10,10,0.45)' }}>{datos.error}</p>
  }

  const nombre = datos.plan?.nombre || 'Tu plan'
  const titulo = datos.sinTope ? 'Sin tope' : datos.especial ? 'Plan a medida' : nombre
  const detalle = datos.sinTope ? `${nombre} sin tope` : datos.especial ? `${nombre} ampliado` : datos.plan?.clave === 'gratis' ? '$0' : null
  const productos = datos.sinTope ? String(datos.usados) : `${datos.usados} de ${datos.tope}`
  const sig = datos.especial ? null : datos.siguiente

  return (
    <div className="flex flex-col" style={{ ...marco, gap: '14px' }}>
      <p className="m-0" style={{ fontSize: '10px', textTransform: 'uppercase', letterSpacing: '2px', color: 'rgba(10,10,10,0.3)' }}>Tu plan</p>
      <div className="flex justify-between items-baseline flex-wrap" style={{ gap: '10px' }}>
        <h3 className="m-0" style={{ fontFamily: 'Fraunces, serif', fontWeight: 500, fontSize: '22px', color: '#0a0a0a' }}>{titulo}</h3>
        {detalle && <span style={{ fontSize: '12px', color: 'rgba(10,10,10,0.45)' }}>{detalle}</span>}
      </div>

      <div className="grid" style={{ gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', borderTop: '1px solid rgba(10,10,10,0.06)', paddingTop: '12px' }}>
        <Uso primero valor={productos} texto="productos" />
        <Uso valor={datos.fotosPorProducto ?? '—'} texto="fotos por producto" />
        <Uso valor={datos.carritos ? 'Sí' : 'No'} texto="carritos abandonados" />
      </div>

      {sig && (
        <div className="flex justify-between items-center flex-wrap"
          style={{ backgroundColor: '#f6f5f2', borderRadius: '10px', padding: '12px 14px', gap: '12px', fontSize: '13px', lineHeight: 1.55, color: 'rgba(10,10,10,0.7)' }}>
          <span>
            Con el <b style={{ fontWeight: 600, color: '#0a0a0a' }}>{sig.nombre}</b>:{' '}
            {[sig.tope && `${sig.tope} productos`, sig.fotosPorProducto && `${sig.fotosPorProducto} fotos`, sig.carritos && 'carritos abandonados']
              .filter(Boolean).join(', ').replace(/, ([^,]*)$/, ' y $1')}
            {Number.isInteger(sig.precio) ? `, por ${textoPrecio(sig.precio)} por mes.` : '.'}
          </span>
          <Link href={LINK_PLANES} className="whitespace-nowrap" style={{ color: '#015444', fontWeight: 500, textDecoration: 'underline', textUnderlineOffset: '2px' }}>
            Ver planes
          </Link>
        </div>
      )}

      {datos.suscripciones && <SuscripcionPlan onCambio={onCambio} />}
    </div>
  )
}
