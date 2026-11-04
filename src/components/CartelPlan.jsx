'use client'

// El cartel del plan (tanda F1), uno solo para todos los lugares: en el verde
// del footer con el celeste, como los mensajes de la marca. Sigue el mockup
// aprobado (mockup-tanda-f1.html).
//
//   motivo   'productos'  llegó al tope (Nuevo producto, en lugar del formulario)
//            'superado'   activar o reenviar con la tienda por encima del tope
//                         (Mis productos y Editar); accion 'activar' | 'reenviar'
//            'fotos'      llegó a las fotos por producto (el cartel chico)
//   datos    el plan de /api/vendedor/plan
//   tope, usados  los del 409, si llegaron
//   onCerrar si viene, lleva la cruz
//   volverHref    si viene, el link «Volver a Mis productos»
//
// Los textos salen de textosDelCartel (src/lib/planes.js), con los valores de
// la tabla planes. Desde F3.2, en el Gratis el botón es «Pasarme al Básico» y
// abre el alta ahí mismo (ModalSuscripcion), con «Ver los planes» al lado; con
// un plan a medida sin pagar, «Suscribirme por $X por mes». Si las
// suscripciones están cerradas (SUSCRIPCIONES_TIENDAS), vuelve el link a
// /vender#planes. Con el plan a medida activo, «Escribinos si necesitás más
// lugar» abre el formulario de contacto, como en /vender.

import { useState } from 'react'
import Link from 'next/link'
import ModalContacto from '@/components/ModalContacto'
import ModalSuscripcion from '@/components/ModalSuscripcion'
import { textosDelCartel } from '@/lib/planes'

const CELESTE = '#9cc3ea'

export default function CartelPlan({ motivo = 'productos', accion, datos, tope, usados, onCerrar, volverHref }) {
  const [contactoAbierto, setContactoAbierto] = useState(false)
  const [altaAbierta, setAltaAbierta] = useState(false)
  const t = textosDelCartel({ motivo, accion, datos, tope, usados })
  const chico = motivo === 'fotos'

  return (
    <>
      {/* Las páginas del panel cargan Inter; el cartel usa también Fraunces y Poppins. */}
      <link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Fraunces:opsz,wght@9..144,100..900&family=Poppins:wght@300;400;500&display=swap" />
      <div role="status" aria-live="polite" className="relative flex flex-col"
        style={{ backgroundColor: '#015444', color: CELESTE, borderRadius: '16px', padding: chico ? '16px 18px' : '22px', gap: chico ? '8px' : '12px', marginBottom: '18px' }}>
        {onCerrar && (
          <button type="button" onClick={onCerrar} aria-label="Cerrar"
            className="absolute flex items-center justify-center rounded-full border-0 bg-transparent cursor-pointer hover:bg-[#9cc3ea]/15"
            style={{ top: '12px', right: '12px', width: '30px', height: '30px', color: CELESTE }}>
            <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="2" style={{ width: '15px', height: '15px' }} aria-hidden="true">
              <path d="m5 5 10 10M15 5 5 15" />
            </svg>
          </button>
        )}

        <p className="m-0" style={{ fontSize: '10px', textTransform: 'uppercase', letterSpacing: '2px', color: 'rgba(156,195,234,0.65)' }}>{t.eyebrow}</p>
        <h3 className="m-0" style={{ fontFamily: 'Fraunces, serif', fontWeight: 500, fontSize: chico ? '17px' : '22px', lineHeight: 1.2, color: CELESTE, textWrap: 'balance', paddingRight: onCerrar ? '30px' : 0 }}>
          {t.titulo}
        </h3>

        {t.intro && (
          <p className="m-0" style={{ fontFamily: 'Poppins, sans-serif', fontWeight: 300, fontSize: '13.5px', lineHeight: 1.6, color: 'rgba(156,195,234,0.88)' }}>{t.intro}</p>
        )}
        {t.chips.length > 0 && (
          <div className="flex flex-wrap" style={{ gap: '8px' }}>
            {t.chips.map((chip) => (
              <span key={chip} style={{ fontSize: '12px', fontWeight: 500, border: '1px solid rgba(156,195,234,0.4)', borderRadius: '999px', padding: '4px 10px', color: '#ffffff' }}>
                {chip}
              </span>
            ))}
          </div>
        )}
        {t.cierre && (
          <p className="m-0" style={{ fontFamily: 'Poppins, sans-serif', fontWeight: 300, fontSize: '13.5px', lineHeight: 1.6, color: 'rgba(156,195,234,0.88)' }}>{t.cierre}</p>
        )}

        {(t.boton || t.secundario || t.contacto || volverHref) && (
          <div className="flex flex-wrap items-center" style={{ gap: '14px' }}>
            {t.boton?.modal && (
              <button type="button" onClick={() => setAltaAbierta(true)}
                className="cursor-pointer transition-colors bg-[#9cc3ea] text-[#015444] hover:bg-transparent hover:text-[#9cc3ea]"
                style={{ fontFamily: "'Inter', sans-serif", fontSize: '13px', fontWeight: 500, borderRadius: '4px', padding: '10px 16px', border: `1px solid ${CELESTE}` }}>
                {t.boton.texto}
              </button>
            )}
            {t.boton?.href && (
              <Link href={t.boton.href}
                className="no-underline transition-colors bg-[#9cc3ea] text-[#015444] hover:bg-transparent hover:text-[#9cc3ea]"
                style={{ fontFamily: "'Inter', sans-serif", fontSize: '13px', fontWeight: 500, borderRadius: '4px', padding: '10px 16px', border: `1px solid ${CELESTE}` }}>
                {t.boton.texto}
              </Link>
            )}
            {t.contacto && (
              <button type="button" onClick={() => setContactoAbierto(true)}
                className="cursor-pointer transition-colors bg-[#9cc3ea] text-[#015444] hover:bg-transparent hover:text-[#9cc3ea]"
                style={{ fontFamily: "'Inter', sans-serif", fontSize: '13px', fontWeight: 500, borderRadius: '4px', padding: '10px 16px', border: `1px solid ${CELESTE}` }}>
                Escribinos si necesitás más lugar
              </button>
            )}
            {t.secundario && (
              <Link href={t.secundario.href} style={{ fontSize: '12.5px', color: CELESTE, textDecoration: 'underline', textUnderlineOffset: '2px' }}>
                {t.secundario.texto}
              </Link>
            )}
            {volverHref && !t.secundario && (
              <Link href={volverHref} style={{ fontSize: '12.5px', color: CELESTE, textDecoration: 'underline', textUnderlineOffset: '2px' }}>
                Volver a Mis productos
              </Link>
            )}
          </div>
        )}
      </div>

      <ModalSuscripcion abierto={altaAbierta} onClose={() => setAltaAbierta(false)} />

      <ModalContacto
        abierto={contactoAbierto}
        onClose={() => setContactoAbierto(false)}
        titulo="Tu plan a medida"
        subtitulo="Contanos cuántos productos más necesitás."
        mensajeInicial="Quiero ampliar mi plan a medida."
        contexto="Plan a medida — panel"
      />
    </>
  )
}
