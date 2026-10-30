'use client'

// El bloque "Tu link" de Mi negocio (/vendedor/perfil). Sigue el mockup aprobado
// (mockup-tanda-a2.html). Los datos los trae la página de
// /api/vendedor/link-propio: { link, ventasPorLink, vendidoPorLink, ahorro, especial }.
//
//   · apagado: la tienda sin publicar o en pausa. Siempre igual, sin botón, sin
//     números y sin flechita, aunque haya quedado minimizado.
//   · abierto o minimizado: lo que eligió la tienda (se guarda en la base,
//     migración 043).
//
// Si la tienda está bloqueada, la página no lo muestra.

import { useEffect, useRef, useState } from 'react'
import CopiarLink from '@/components/CopiarLink'
import { formatearMonto } from '@/lib/montos'
import { textoPorcentaje, ultimoDiaQueVale } from '@/lib/comision'

const VERDE = '#015444'
const CELESTE = '#9cc3ea'

const FUENTE_TEXTO = { fontFamily: 'Poppins, sans-serif', fontWeight: 300 }
const FUENTE_TITULO = { fontFamily: 'Fraunces, serif', fontWeight: 500, lineHeight: 1.2 }
const EYEBROW = { fontSize: '10px', textTransform: 'uppercase', letterSpacing: '2px' }

const TITULO = 'Quien compra por tu link, te cuesta la mitad'

function Flecha({ arriba }) {
  return (
    <svg width="16" height="16" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true"
      style={{ transform: arriba ? 'rotate(180deg)' : undefined }}>
      <path d="m5 8 5 5 5-5" />
    </svg>
  )
}

// La flechita: redonda, con un fondo apenas más claro con el mouse encima.
function BotonFlecha({ arriba, etiqueta, onClick }) {
  const [encima, setEncima] = useState(false)
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={etiqueta}
      aria-expanded={arriba}
      onPointerEnter={(e) => { if (e.pointerType === 'mouse') setEncima(true) }}
      onPointerLeave={() => setEncima(false)}
      className="flex items-center justify-center shrink-0 rounded-full cursor-pointer"
      style={{
        width: '32px', height: '32px', border: 'none', color: CELESTE,
        backgroundColor: encima ? 'rgba(156,195,234,0.15)' : 'transparent',
      }}
    >
      <Flecha arriba={arriba} />
    </button>
  )
}

// El link sin el https://, con el ?de=tienda en celeste.
function TextoLink({ link }) {
  const [ruta, parametro] = link.replace(/^https?:\/\//, '').split('?')
  return <>{ruta}<span style={{ color: CELESTE }}>?{parametro}</span></>
}

// Si el portapapeles falla, deja seleccionado el texto del link.
function seleccionar(elemento) {
  if (!elemento) return
  try {
    window.getSelection()?.selectAllChildren(elemento)
  } catch { /* se copia a mano igual */ }
}

function Apagado({ texto }) {
  return (
    <div className="rounded-2xl flex flex-col" style={{ backgroundColor: '#f3f5f4', padding: '22px', gap: '14px' }}>
      <p className="m-0" style={{ ...EYEBROW, color: 'rgba(10,10,10,0.3)' }}>Tu link</p>
      <h3 className="m-0 text-[20px] md:text-[22px]" style={{ ...FUENTE_TITULO, color: 'rgba(10,10,10,0.55)' }}>{TITULO}</h3>
      <p className="m-0" style={{ ...FUENTE_TEXTO, fontSize: '13px', lineHeight: 1.6, color: 'rgba(10,10,10,0.45)' }}>{texto}</p>
    </div>
  )
}

function Minimizado({ datos, onAbrir }) {
  const textoLink = useRef(null)
  // Minimizado, el link no se ve: si el portapapeles falla, aparece para poder
  // seleccionarlo.
  const [mostrarLink, setMostrarLink] = useState(false)

  useEffect(() => {
    if (mostrarLink) seleccionar(textoLink.current)
  }, [mostrarLink])

  function alFallar() {
    setMostrarLink(true)
    seleccionar(textoLink.current)
  }

  return (
    <div className="flex items-center rounded-xl" style={{ backgroundColor: VERDE, padding: '8px 8px 8px 16px', gap: '10px' }}>
      <span className={`shrink-0 ${mostrarLink ? '' : 'flex-1'}`} style={{ ...EYEBROW, color: 'rgba(156,195,234,0.7)' }}>Tu link</span>
      <span ref={textoLink} className={`${mostrarLink ? 'block' : 'hidden'} flex-1 min-w-0 truncate`} style={{ fontSize: '12.5px', color: '#ffffff' }}>
        <TextoLink link={datos.link} />
      </span>
      {datos.especial && (
        <span className="shrink-0 rounded-full whitespace-nowrap" style={{ fontSize: '10.5px', fontWeight: 600, backgroundColor: CELESTE, color: VERDE, padding: '2px 8px' }}>
          {textoPorcentaje(Math.round(datos.especial.porcentaje * 100))} especial
        </span>
      )}
      <CopiarLink link={datos.link} variante="oscuro" onFallo={alFallar} />
      <BotonFlecha arriba={false} etiqueta="Abrir tu link" onClick={onAbrir} />
    </div>
  )
}

function Numero({ valor, texto, primero }) {
  return (
    <div className="flex flex-col min-w-0" style={{ gap: '2px', padding: primero ? '0 12px 0 0' : '0 12px', borderLeft: primero ? 'none' : '1px solid rgba(156,195,234,0.2)' }}>
      <b className="text-base md:text-[19px]" style={{ fontWeight: 600, color: '#ffffff', fontVariantNumeric: 'tabular-nums' }}>{valor}</b>
      <span style={{ fontSize: '11.5px', fontWeight: 300, lineHeight: 1.35, color: 'rgba(156,195,234,0.75)' }}>{texto}</span>
    </div>
  )
}

function Abierto({ datos, onMinimizar }) {
  const textoLink = useRef(null)
  const { especial, ventasPorLink } = datos

  return (
    <div className="relative rounded-2xl flex flex-col" style={{ backgroundColor: VERDE, padding: '22px 22px 20px', gap: '14px' }}>
      <div className="absolute" style={{ top: '14px', right: '14px' }}>
        <BotonFlecha arriba etiqueta="Minimizar tu link" onClick={onMinimizar} />
      </div>

      <p className="m-0" style={{ ...EYEBROW, color: 'rgba(156,195,234,0.65)' }}>Tu link</p>
      <h3 className="m-0 text-[20px] md:text-[22px]" style={{ ...FUENTE_TITULO, color: CELESTE, paddingRight: '36px' }}>{TITULO}</h3>
      <p className="m-0" style={{ ...FUENTE_TEXTO, fontSize: '13px', lineHeight: 1.6, color: 'rgba(156,195,234,0.85)' }}>
        Pegalo donde quieras: tu Instagram, tus historias, un WhatsApp. Si alguien entra por él y compra en tu tienda, pagás 2,5% de comisión en lugar de 5%.
      </p>

      <div className="flex items-center min-w-0" style={{ gap: '10px', backgroundColor: 'rgba(156,195,234,0.12)', borderRadius: '8px', padding: '6px 6px 6px 12px' }}>
        <span ref={textoLink} className="flex-1 min-w-0 truncate" style={{ fontSize: '13px', color: '#ffffff' }}>
          <TextoLink link={datos.link} />
        </span>
        <CopiarLink link={datos.link} variante="oscuro" onFallo={() => seleccionar(textoLink.current)} />
      </div>

      {especial && (
        <div style={{ backgroundColor: CELESTE, color: VERDE, borderRadius: '10px', padding: '11px 14px', fontSize: '13px', lineHeight: 1.5 }}>
          Tenés una <b style={{ fontWeight: 600 }}>comisión especial de {textoPorcentaje(Math.round(especial.porcentaje * 100))}</b>
          {especial.venceEn ? ` hasta el ${ultimoDiaQueVale(especial.venceEn)}.` : ', sin vencimiento.'}
          {' '}En cada venta se cobra la más baja entre esa y la normal.
        </div>
      )}

      {ventasPorLink > 0 ? (
        <div className="grid grid-cols-3" style={{ borderTop: '1px solid rgba(156,195,234,0.2)', paddingTop: '14px' }}>
          <Numero primero valor={ventasPorLink} texto={ventasPorLink === 1 ? 'venta por tu link' : 'ventas por tu link'} />
          <Numero valor={`$ ${formatearMonto(datos.vendidoPorLink)}`} texto="vendiste por tu link" />
          <Numero valor={`$ ${formatearMonto(datos.ahorro)}`} texto="te ahorraste en comisiones" />
        </div>
      ) : (
        <p className="m-0" style={{ ...FUENTE_TEXTO, borderTop: '1px solid rgba(156,195,234,0.2)', paddingTop: '14px', fontSize: '12.5px', lineHeight: 1.55, color: 'rgba(156,195,234,0.8)' }}>
          Todavía no vendiste por tu link. Cuando alguien entre por él y compre, lo vas a ver acá.
        </p>
      )}

      <p className="m-0" style={{ fontSize: '11.5px', fontWeight: 300, color: 'rgba(156,195,234,0.6)' }}>
        Cada vez que alguien lo toca, vale 48 horas. Compartilo seguido.
      </p>
    </div>
  )
}

// datos: lo de la ruta, o { error }. textoApagado: el motivo si el link no anda.
export default function BloqueLinkPropio({ datos, textoApagado, minimizado, onCambiarMinimizado }) {
  // No depende de la ruta: se ve aunque la ruta falle.
  if (textoApagado) return <Apagado texto={textoApagado} />
  if (!datos) return null

  if (datos.error) {
    return <p className="m-0" style={{ ...FUENTE_TEXTO, fontSize: '12px', color: 'rgba(10,10,10,0.45)' }}>{datos.error}</p>
  }

  return minimizado
    ? <Minimizado datos={datos} onAbrir={() => onCambiarMinimizado(false)} />
    : <Abierto datos={datos} onMinimizar={() => onCambiarMinimizado(true)} />
}
