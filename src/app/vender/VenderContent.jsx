'use client'

// La página /vender (ver page.jsx). Copia mockup-vender.html: la estructura,
// los textos y los cortes de pantalla (820, 760, 680, 640 y 1024 px), con los
// cambios de después: la portada con video (HeroVideo) en lugar del mapa, el
// plan a medida en una franja debajo de los planes y las preguntas a todo el
// ancho.
//
//   planes   lo que arma planesParaLaVenta (src/lib/planes.js), o null si no
//            se pudieron leer: entonces la sección de planes sale sin números.
//   comision { base, link, linkEsLaMitad }, de src/lib/comision.js.
//
// Si quien entra ya tiene tienda, los botones dicen «Ir a Mi negocio». Se
// sabe después de cargar (la página es fija); si la consulta falla quedan los
// botones de siempre, y el alta igual la manda a su tienda. «Sumarme con el
// Básico» (F3.2): con tienda abre el alta de la suscripción ahí mismo; sin
// tienda va al alta de tienda con ?suscribirme=basico, y al terminar el panel
// abre el alta de la suscripción.

import { useState, useEffect } from 'react'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'
import Navbar from '@/components/Navbar'
import HeroVideo from '@/components/HeroVideo'
import PastillaComision from '@/components/PastillaComision'
import LineaToldo from '@/components/LineaToldo'
import MenuTakeover from '@/components/MenuTakeover'
import ModalContacto from '@/components/ModalContacto'
import ModalSuscripcion from '@/components/ModalSuscripcion'
import { FONDO_BAHIA, CELESTE_BAHIA, CELESTE_CLARO, AMARILLO_BAHIA, LADRILLO_BAHIA } from '@/lib/coloresBahia'
import { estiloCuadrille } from '@/lib/cuadrille'

const ALTA = '/vendedor/nuevo'
// Sin tienda, «Sumarme con el Básico» pasa por el alta de tienda y al terminar
// el panel abre el alta de la suscripción (SuscripcionPlan).
const ALTA_CON_BASICO = '/vendedor/nuevo?suscribirme=basico'
const MI_NEGOCIO = '/vendedor/perfil'
const COSTOS_MP = 'https://www.mercadopago.com.ar/ayuda/recibir-pagos-costos_220'

const TINTA = '#0a0a0a'
const SUAVE = 'rgba(10,10,10,0.62)'
const TENUE = 'rgba(10,10,10,0.42)'
const BEIGE = '#f4e9e1'
const AZUL = '#4164fe'
const NARANJA_BAHIA = '#ff5a1f'

const DISPLAY = "'Fraunces', Georgia, 'Times New Roman', serif"
const TEXTO = "'Poppins', system-ui, sans-serif"
const UI = "'Inter', system-ui, sans-serif"

const MARCO = 'pl-[max(16px,env(safe-area-inset-left))] pr-[max(16px,env(safe-area-inset-right))]'
const COL = 'max-w-[1080px] mx-auto'
// Lo que va casi de punta a punta (la tarjeta de los beneficios): 10 px a
// los costados en el celular y 16 px desde md.
const MARGEN_TARJETA = 'mx-[10px] md:mx-4'
const FOCO ='focus-visible:outline-2 focus-visible:outline-[#4164fe] focus-visible:outline-offset-[3px]'

const titulo = { fontFamily: DISPLAY, fontWeight: 500, letterSpacing: '-0.02em', margin: 0, textWrap: 'balance' }
const etiqueta = { fontFamily: UI, fontSize: '11px', fontWeight: 600, letterSpacing: '.12em', textTransform: 'uppercase', color: TENUE }
const bajada = { color: SUAVE, margin: 0, maxWidth: '58ch', fontSize: '16px' }

function Boton({ href, children }) {
  return (
    <Link
      href={href}
      className={`inline-flex items-center justify-center px-[22px] py-[13px] rounded-[4px] border border-[#0a0a0a] bg-[#0a0a0a] text-white hover:bg-transparent hover:text-[#0a0a0a] transition-colors motion-reduce:transition-none ${FOCO}`}
      style={{ fontFamily: UI, fontSize: '14px', fontWeight: 600 }}
    >
      {children}
    </Link>
  )
}

// El botón de la portada, sobre el video: blanco con texto negro; con el
// mouse encima se invierte (transparente, borde y texto blancos). Los colores
// van en línea, así que el hover es un estado.
//   fondoEncima  el fondo con el mouse encima (transparente en la portada;
//                azul en el cierre, para que no se vea el cuadrillé detrás)
//   contorno     el color del foco de teclado (azul; blanco sobre la tarjeta azul)
function BotonHero({ href, children, fondoEncima = 'transparent', contorno = AZUL }) {
  const [encima, setEncima] = useState(false)
  return (
    <Link
      href={href}
      onMouseEnter={() => setEncima(true)}
      onMouseLeave={() => setEncima(false)}
      className="inline-block text-[13px] md:text-[14px] px-6 py-3 md:px-7 md:py-3.5 rounded-[4px] transition-colors duration-200 motion-reduce:transition-none focus-visible:outline-2 focus-visible:outline-offset-[3px]"
      style={{
        // El contorno solo aparece con foco de teclado (las clases); el color, acá.
        outlineColor: contorno,
        fontFamily: UI,
        fontWeight: 500,
        border: '1px solid #fff',
        background: encima ? fondoEncima : '#fff',
        color: encima ? '#fff' : TINTA,
      }}
    >
      {children}
    </Link>
  )
}

// La capa de oscurecido de la portada: más fuerte en el centro, donde va el
// texto, y más suave hacia los bordes.
const OSCURECIDO = 'radial-gradient(ellipse 70% 65% at 50% 52%, rgba(0,0,0,0.45) 0%, rgba(0,0,0,0.30) 55%, rgba(0,0,0,0.18) 100%)'

// El mismo botón, cuando abre algo en la página en vez de llevar a otra.
function BotonAccion({ onClick, children }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`inline-flex items-center justify-center px-[22px] py-[13px] rounded-[4px] border border-[#0a0a0a] bg-[#0a0a0a] text-white hover:bg-transparent hover:text-[#0a0a0a] transition-colors motion-reduce:transition-none cursor-pointer ${FOCO}`}
      style={{ fontFamily: UI, fontSize: '14px', fontWeight: 600 }}
    >
      {children}
    </button>
  )
}

function Cabeza({ etiqueta: texto, children, bajada: b, claro = false }) {
  return (
    <div className="flex flex-col gap-3 mb-9">
      <span style={{ ...etiqueta, color: claro ? 'rgba(156,195,234,0.7)' : TINTA }}>{texto}</span>
      <h2 className="text-[clamp(28px,4vw,38px)] leading-[1.15]" style={{ ...titulo, ...(claro ? { color: CELESTE_BAHIA } : {}) }}>
        {children}
      </h2>
      {b && <p style={{ ...bajada, ...(claro ? { color: 'rgba(156,195,234,0.82)' } : {}) }}>{b}</p>}
    </div>
  )
}

// Los ítems, las pastillas, las tarjetas y los precios de «Planes»: van sobre
// tarjetas de color, así que todo en negro (tildes, rayitas y bordes también).
function Item({ si = true, children }) {
  return (
    <li className="grid grid-cols-[18px_1fr] gap-2 items-start text-[14px]" style={{ color: TINTA }}>
      {si ? (
        <span aria-hidden="true" className="mt-[7px] w-[9px] h-[5px] -rotate-45" style={{ borderLeft: `1.5px solid ${TINTA}`, borderBottom: `1.5px solid ${TINTA}` }} />
      ) : (
        <span aria-hidden="true" className="mt-[10px] w-[9px] h-[1.5px]" style={{ background: TINTA }} />
      )}
      <span>{!si && <span className="sr-only">No incluye: </span>}{children}</span>
    </li>
  )
}

// Sobre las tarjetas de color: sin relleno, con borde y texto negros.
function Pastilla({ children }) {
  return (
    <span
      className="px-2 py-1 rounded-full whitespace-nowrap"
      style={{ fontFamily: UI, fontSize: '10.5px', fontWeight: 600, letterSpacing: '.08em', textTransform: 'uppercase', background: 'transparent', border: `1px solid ${TINTA}`, color: TINTA }}
    >
      {children}
    </span>
  )
}

// Cada plan es una tarjeta de color, sin borde ni sombra. La lista ocupa el
// espacio que sobra, así el botón queda abajo de todo en las tres.
function Plan({ nombre, pastilla, precio, para, fondo, children, boton, nota }) {
  return (
    <article
      className="rounded-[20px] md:rounded-[24px] px-6 py-7 md:px-9 md:py-10 flex flex-col gap-[18px] min-w-0"
      style={{ background: fondo, color: TINTA }}
    >
      <div className="flex flex-col gap-1.5">
        <div className="flex items-baseline justify-between gap-2.5 flex-wrap">
          <h3 className="text-[26px]" style={titulo}>{nombre}</h3>
          {pastilla}
        </div>
        {precio}
        <p className="m-0 text-[14px]" style={{ color: TINTA }}>{para}</p>
      </div>
      <ul className="list-none p-0 m-0 flex flex-col gap-2.5 flex-1">{children}</ul>
      {boton}
      {nota}
    </article>
  )
}

function Precio({ children, chico = false }) {
  return (
    <div
      style={chico
        ? { fontFamily: UI, fontSize: '20px', fontWeight: 700, letterSpacing: '-0.02em', color: TINTA }
        : { fontFamily: UI, fontSize: '30px', fontWeight: 700, letterSpacing: '-0.02em', fontVariantNumeric: 'tabular-nums' }}
    >
      {children}
    </div>
  )
}

function Pregunta({ pregunta, children }) {
  return (
    <details className="group border-b border-[rgba(10,10,10,0.10)]">
      <summary
        className={`list-none [&::-webkit-details-marker]:hidden cursor-pointer py-5 pr-9 relative ${FOCO}`}
        style={{ fontFamily: UI, fontWeight: 500, fontSize: '16px' }}
      >
        {pregunta}
        <span aria-hidden="true" className="absolute right-1 top-4 text-[22px] font-light transition-transform motion-reduce:transition-none group-open:rotate-45" style={{ color: SUAVE }}>+</span>
      </summary>
      <p className="mt-0 mb-5 max-w-[64ch] [&_a]:text-[#0a0a0a] [&_a]:underline" style={{ color: SUAVE }}>{children}</p>
    </details>
  )
}

// La cabeza de «Cómo funciona» y «Qué te da»: etiqueta en negro y título del
// tamaño del de la portada. Las otras secciones siguen con Cabeza.
function CabezaGrande({ etiqueta: texto, children }) {
  return (
    <div className="flex flex-col gap-3 mb-9">
      <span style={{ ...etiqueta, color: TINTA }}>{texto}</span>
      <h2 className="text-[28px] md:text-[42px]" style={{ ...titulo, lineHeight: 1.12, color: TINTA }}>
        {children}
      </h2>
    </div>
  )
}

// Una etiqueta de sección escrita sobre media curva (la de «Cuánto cuesta»):
// la letra de las etiquetas (Inter 600, 11 px, mayúsculas) sobre un arco,
// centrada. El arco es un círculo de radio 100 con el centro abajo; el texto
// usa solo su parte de arriba, así que la caja recorta lo que no se ve.
function EtiquetaEnArco({ color, children }) {
  return (
    <svg width="200" height="32" viewBox="0 0 200 32" role="img" aria-label={children} style={{ overflow: 'visible' }}>
      <path id="arco-etiqueta" d="M 0 110 A 100 100 0 0 1 200 110" fill="none" />
      <text
        aria-hidden="true"
        style={{ fontFamily: UI, fontSize: '11px', fontWeight: 600, letterSpacing: '.12em', textTransform: 'uppercase' }}
        fill={color}
      >
        <textPath href="#arco-etiqueta" startOffset="50%" textAnchor="middle">{children}</textPath>
      </text>
    </svg>
  )
}

// La letra de los títulos del panel («Mis productos»): Inter 900,
// tracking-tight. La usan los títulos de los pasos y de los beneficios.
const tituloInter = { fontFamily: UI, fontWeight: 900, letterSpacing: '-0.025em', margin: 0 }
const tituloItem = { ...tituloInter, lineHeight: 1.2, color: TINTA }
// Sus descripciones, del tamaño de la bajada de la portada (con text-[13px] md:text-[15px]).
const textoItem = { lineHeight: 1.6, color: SUAVE, margin: 0 }

function Beneficio({ titulo: t, children }) {
  return (
    // Va sobre la tarjeta naranja: líneas en negro (abajo en celular y tablet,
    // arriba en las 5 columnas) y descripción en negro al 80 %, no gris.
    <div className="py-5 flex flex-col gap-1.5 min-w-0 border-b lg:pb-0 lg:border-b-0 lg:border-t" style={{ borderColor: TINTA }}>
      {/* Más chicos que en «Cómo funciona»: acá son 5 columnas. */}
      <h3 style={{ ...tituloItem, fontSize: '15px' }}>{t}</h3>
      <p style={{ ...textoItem, fontSize: '14px', color: 'rgba(10,10,10,0.8)' }}>{children}</p>
    </div>
  )
}

export default function VenderContent({ planes, comision }) {
  const [menuAbierto, setMenuAbierto] = useState(false)
  const [tieneTienda, setTieneTienda] = useState(false)
  const [contactoAbierto, setContactoAbierto] = useState(false)
  const [altaAbierta, setAltaAbierta] = useState(false)

  useEffect(() => {
    if (menuAbierto) { document.body.style.overflow = 'hidden' } else { document.body.style.overflow = '' }
    return () => { document.body.style.overflow = '' }
  }, [menuAbierto])

  // ¿Quien entra ya tiene tienda? La misma consulta que hace el alta
  // (vendedor/nuevo/page.jsx). Si falla, quedan los botones de siempre.
  useEffect(() => {
    let vigente = true
    async function verificar() {
      try {
        const supabase = createClient()
        const { data: { user } } = await supabase.auth.getUser()
        if (!user) return
        const { data } = await supabase.from('vendedores').select('id').eq('usuario_id', user.id).maybeSingle()
        if (vigente && data) setTieneTienda(true)
      } catch {
        // Sin dato: los botones de siempre.
      }
    }
    verificar()
    return () => { vigente = false }
  }, [])

  const destino = tieneTienda ? MI_NEGOCIO : ALTA
  const textoBoton = (texto) => (tieneTienda ? 'Ir a Mi negocio' : texto)

  const { gratis, basico, pro } = planes || {}
  const proElegible = pro && !pro.proximamente
  const masDe = basico ? `más de ${basico.tope} productos` : 'más productos'

  const sinValores = (
    <button
      type="button"
      onClick={() => setContactoAbierto(true)}
      className={`self-start text-left underline underline-offset-[3px] cursor-pointer ${FOCO}`}
      style={{ fontFamily: UI, fontSize: '14px', fontWeight: 500, color: SUAVE }}
    >
      Escribinos y te contamos los valores de hoy
    </button>
  )

  return (
    <>
      <link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Inter:wght@200;300;400;500;600;700;800;900&display=swap" />
      <link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Fraunces:opsz,wght@9..144,100..900&family=Poppins:wght@300;400;500;700;900&display=swap" />

      <div className="min-h-screen" style={{ background: '#faf9f7', color: TINTA, fontFamily: TEXTO, fontWeight: 300, lineHeight: 1.6 }}>
        {menuAbierto && <MenuTakeover onClose={() => setMenuAbierto(false)} />}
        {/* Transparente sobre el video; pasa a blanco cuando el hero (100vh) sale de pantalla. */}
        <Navbar onToggleMenu={() => setMenuAbierto(!menuAbierto)} />

        <main>
          {/* 1. Portada: video a pantalla completa, desde arriba (debajo del navbar), con todo centrado */}
          <HeroVideo
            src="/images/hero-vender.mp4"
            srcCelu="/images/hero-vender-celu.mp4"
            poster="/images/hero-vender-poster.jpg"
            posterCelu="/images/hero-vender-poster-celu.jpg"
            overlay={OSCURECIDO}
          >
            <div className="h-full flex flex-col justify-center items-center text-center mx-auto max-w-[480px] md:max-w-[620px] pt-28 pb-14 px-5 md:px-12">
              <span
                style={{ fontFamily: UI, fontWeight: 600, fontSize: '11px', letterSpacing: '0.12em', textTransform: 'uppercase', color: '#fff', marginBottom: '14px' }}
              >
                Para emprendimientos y comercios
              </span>
              <h1
                className="text-[28px] md:text-[42px]"
                style={{ fontFamily: DISPLAY, fontWeight: 500, lineHeight: 1.12, letterSpacing: '-0.02em', color: '#fff', textWrap: 'balance', margin: '0 0 16px' }}
              >
                Tu negocio, en el mapa de Bahía Blanca
              </h1>
              <p
                className="text-[13px] md:text-[15px]"
                style={{ fontFamily: TEXTO, fontWeight: 300, lineHeight: 1.6, color: 'rgba(255,255,255,0.9)', maxWidth: '520px', textWrap: 'balance', margin: '0 0 28px' }}
              >
                Sumarte es gratis. Cobrás con Mercado Pago, aparecés en el mapa y en tu barrio, y te encuentran vecinos que todavía no te conocían.
              </p>
              <div className="flex flex-col items-center gap-5">
                <BotonHero href={destino}>{textoBoton('Sumá tu tienda gratis')}</BotonHero>
                <a
                  href="#costos"
                  className="text-[12px] md:text-[13px] underline underline-offset-[3px] focus-visible:outline-2 focus-visible:outline-offset-[3px]"
                  style={{ fontFamily: UI, fontWeight: 400, color: 'rgba(255,255,255,0.85)', outlineColor: AZUL }}
                >
                  Ver cuánto cuesta
                </a>
              </div>
            </div>
          </HeroVideo>

          {/* 2. Cómo funciona */}
          {/* Abajo, poco: la tarjeta naranja de «Qué te da» arranca cerca. */}
          <section className={`${MARCO} pt-[72px] pb-8 md:pb-10`}>
            <div className={COL}>
              <CabezaGrande etiqueta="Cómo funciona">Abrís tu tienda en tres pasos</CabezaGrande>
              <ol className="grid grid-cols-3 gap-7 list-none p-0 m-0 max-[760px]:grid-cols-1">
                {[
                  ['Creá tu tienda', 'Es gratis y te lleva unos minutos: nombre, logo, categoría y dónde estás.'],
                  ['Cargá tus productos', 'Con fotos, precio y talles. Revisamos cada producto nuevo antes de publicarlo.'],
                  ['Vendé', 'La plata de cada venta va directo a tu cuenta de Mercado Pago. Vos elegís cómo entregás.'],
                ].map(([t, texto], i) => (
                  <li key={t} className="flex flex-col gap-2.5 pt-5 border-t border-[#0a0a0a] min-w-0">
                    <span style={{ fontFamily: UI, fontSize: '12px', fontWeight: 400, color: TINTA }}>Paso {i + 1}</span>
                    <h3 className="text-[18px] md:text-[20px]" style={tituloItem}>{t}</h3>
                    <p className="text-[13px] md:text-[15px]" style={textoItem}>{texto}</p>
                  </li>
                ))}
              </ol>
            </div>
          </section>

          {/* 3. Qué te da (5 columnas desde 1024 px): una tarjeta naranja casi de
              punta a punta (10 px a los costados y abajo; 16 px desde md). Adentro,
              la misma columna que el resto de la página. */}
          <section
            className={`${MARCO} ${MARGEN_TARJETA} mb-[10px] md:mb-4 rounded-[20px] md:rounded-[24px] py-14 md:py-20`}
            style={{ background: NARANJA_BAHIA, color: TINTA }}
          >
            <div className={COL}>
              <CabezaGrande etiqueta="Qué te da Bahía Shops">Lo que tenés desde el primer día</CabezaGrande>
              <div className="grid grid-cols-1 border-t lg:grid-cols-5 lg:gap-6 lg:border-t-0" style={{ borderColor: TINTA }}>
                <Beneficio titulo="Tu lugar en el mapa">Con dirección exacta o solo la zona, como prefieras.</Beneficio>
                <Beneficio titulo="Compradores nuevos">Vecinos que buscan en el sitio, en el mapa o en Tesoros.</Beneficio>
                <Beneficio titulo="Reseñas reales">Solo de quien te compró, y podés responderlas.</Beneficio>
                <Beneficio titulo="Tu link propio">
                  Para compartir en tus redes. Por ahí pagás {comision.linkEsLaMitad ? 'la mitad' : 'menos'}.
                </Beneficio>
                <Beneficio titulo="Pedidos y envíos ordenados">Un panel con cada pedido, sus pasos y tus reglas de envío.</Beneficio>
              </div>
            </div>
          </section>

          {/* 4. Cuánto cuesta: banda de punta a punta con el cuadrillé (verde
              footer, líneas beige al 45 %) y los textos en beige. Las dos
              comisiones van en tarjetas beige con el texto en verde. */}
          <section
            id="costos"
            className={`${MARCO} py-14 md:py-20 scroll-mt-20`}
            style={{ ...estiloCuadrille({ fondo: FONDO_BAHIA, linea: 'rgba(244,233,225,0.45)', grosor: 1 }), color: BEIGE }}
          >
            <div className={COL}>
              {/* Cabecera centrada: la etiqueta en arco, el título en Fraunces
                  como el resto de los títulos de sección. */}
              <div className="flex flex-col items-center text-center gap-3 mb-9">
                <EtiquetaEnArco color={BEIGE}>Cuánto cuesta</EtiquetaEnArco>
                <h2 className="text-[28px] md:text-[42px]" style={{ ...titulo, lineHeight: 1.12, color: BEIGE }}>
                  Pagás solo cuando vendés
                </h2>
                <p style={{ ...bajada, color: 'rgba(244,233,225,0.9)', textWrap: 'balance' }}>
                  Una comisión sobre los productos, nunca sobre el envío. Es la misma en todos los planes.
                </p>
              </div>
              {/* Los dos casos de comisión, en una pastilla que alterna sola.
                  Mismo ancho que tenían las tarjetas (hasta 760 px, centrada). */}
              <div className="max-w-[760px] mx-auto">
                <PastillaComision
                  casos={[
                    { porcentaje: comision.base, quien: 'Cliente nuevo que te trae Bahía Shops', explicacion: 'Te encontró buscando en el sitio, en el mapa o en Tesoros.' },
                    { porcentaje: comision.link, quien: 'Tu propio cliente, por tu link', explicacion: 'Llegó desde el link que compartiste en tus redes o por WhatsApp.' },
                  ]}
                />
              </div>
              {/* Con el mismo ancho que la pastilla, para que arranque y termine donde ella; justificado. */}
              <div className="max-w-[760px] mx-auto mt-[22px] flex flex-col gap-1.5 text-[14px]" style={{ textAlign: 'justify' }}>
                <span style={{ fontFamily: UI, fontWeight: 600, fontSize: '15px', color: BEIGE }}>+ Comisión de Mercado Pago</span>
                <span style={{ fontFamily: TEXTO, fontWeight: 300, color: 'rgba(244,233,225,0.9)' }}>
                  La cobra Mercado Pago en cualquier venta online y depende del plazo en que elegís recibir la plata.{' '}
                  <a href={COSTOS_MP} target="_blank" rel="noopener noreferrer" className={`underline ${FOCO}`} style={{ color: BEIGE }}>
                    Revisá cuáles son las de tu negocio
                  </a>.
                </span>
              </div>
            </div>
          </section>

          {/* 5. Planes */}
          {/* Las tarjetas van en la columna de la página (hasta 1080 px), como
              antes. El encabezado se alinea con el texto de adentro de las
              tarjetas: el relleno de la tarjeta (24 px en el celular, 36 px
              desde md, como la del plan a medida). */}
          <section id="planes" className={`${MARCO} pt-[72px] scroll-mt-20`}>
            <div className={`${COL} px-6 md:px-9 mb-7 md:mb-10 flex flex-col`}>
              <span style={{ ...etiqueta, color: TINTA, marginBottom: '10px' }}>Planes</span>
              <h2 className="text-[28px] md:text-[42px]" style={{ ...titulo, lineHeight: 1.12, color: TINTA }}>
                Empezá gratis y crecé cuando quieras
              </h2>
              <p style={{ ...bajada, maxWidth: '420px', marginTop: '12px' }}>
                Los planes definen cuántos productos mostrás. La comisión sigue igual en todos.
              </p>
            </div>
            <div className={COL}>
              {/* Tres columnas desde 1024 px; abajo, la del plan a medida a todo el ancho. 4 px entre todas. */}
              <div className="grid grid-cols-1 lg:grid-cols-3 gap-1 items-stretch">
                <Plan
                  fondo={CELESTE_CLARO}
                  nombre={gratis?.nombre || 'Gratis'}
                  precio={<Precio>{gratis?.precio || '$0'}</Precio>}
                  para="Para empezar a vender."
                  boton={<Boton href={destino}>{textoBoton('Empezar gratis')}</Boton>}
                >
                  {gratis && <Item>Hasta <b className="font-medium">{gratis.tope} productos</b></Item>}
                  {gratis && <Item>Hasta <b className="font-medium">{gratis.fotos} fotos</b> por producto</Item>}
                  <Item>Tu lugar en el mapa y tus reseñas</Item>
                  <Item>Tu link propio</Item>
                  {gratis && <Item si={gratis.carritos}>Carritos abandonados</Item>}
                  {!gratis && <li className="list-none">{sinValores}</li>}
                </Plan>

                <Plan
                  fondo={AMARILLO_BAHIA}
                  nombre={basico?.nombre || 'Básico'}
                  pastilla={<Pastilla>Más productos</Pastilla>}
                  precio={basico
                    ? <Precio>{basico.precio} <small className="text-[14px] font-medium tracking-normal" style={{ color: TINTA }}>por mes</small></Precio>
                    : null}
                  para="Para mostrar tu catálogo completo."
                  boton={tieneTienda
                    ? <BotonAccion onClick={() => setAltaAbierta(true)}>{`Sumarme con el ${basico?.nombre || 'Básico'}`}</BotonAccion>
                    : <Boton href={ALTA_CON_BASICO}>{`Sumarme con el ${basico?.nombre || 'Básico'}`}</Boton>}
                >
                  {basico && <Item>Hasta <b className="font-medium">{basico.tope} productos</b></Item>}
                  {basico && <Item>Hasta <b className="font-medium">{basico.fotos} fotos</b> por producto</Item>}
                  <Item>Tu lugar en el mapa y tus reseñas</Item>
                  <Item>Tu link propio</Item>
                  {basico && (basico.carritos
                    ? <Item><b className="font-medium">Carritos abandonados:</b> ves quién dejó algo sin pagar y le mandás un recordatorio</Item>
                    : <Item si={false}>Carritos abandonados</Item>)}
                  {!basico && <li className="list-none">{sinValores}</li>}
                </Plan>

                {proElegible ? (
                  <Plan
                    fondo={LADRILLO_BAHIA}
                    nombre={pro.nombre}
                    precio={<Precio>{pro.precio} <small className="text-[14px] font-medium tracking-normal" style={{ color: TINTA }}>por mes</small></Precio>}
                    para="Para tiendas con catálogos grandes."
                    boton={<Boton href={destino}>{textoBoton(`Sumarme con el ${pro.nombre}`)}</Boton>}
                  >
                    <Item>{pro.tope ? <>Hasta <b className="font-medium">{pro.tope} productos</b></> : 'Productos sin tope'}</Item>
                    {pro.fotos && <Item>Hasta <b className="font-medium">{pro.fotos} fotos</b> por producto</Item>}
                    <Item si={pro.carritos}>Carritos abandonados</Item>
                  </Plan>
                ) : (
                  <Plan
                    fondo={LADRILLO_BAHIA}
                    nombre={pro?.nombre || 'Pro'}
                    pastilla={<Pastilla>Próximamente</Pastilla>}
                    precio={<Precio chico>Lo estamos desarrollando</Precio>}
                    para="Para tiendas con catálogos grandes."
                    boton={
                      // Apagado: en negro con opacidad.
                      <span
                        aria-disabled="true"
                        className="inline-flex items-center justify-center px-[22px] py-[13px] rounded-[4px] border cursor-not-allowed"
                        style={{ fontFamily: UI, fontSize: '14px', fontWeight: 600, color: 'rgba(10,10,10,0.45)', borderColor: 'rgba(10,10,10,0.35)' }}
                      >
                        Próximamente
                      </span>
                    }
                  >
                    <Item>Productos sin tope</Item>
                    <Item>Más herramientas para tu tienda</Item>
                  </Plan>
                )}

                {/* El plan a medida: a todo el ancho de las tres, mientras no se pueda elegir el Pro.
                    Texto a la izquierda y «Escribinos» a la derecha; en el celular, debajo. */}
                {!proElegible && (
                  <aside
                    className="lg:col-span-3 rounded-[20px] md:rounded-[24px] flex flex-col items-start gap-3 md:flex-row md:items-center md:justify-between md:gap-6"
                    style={{ background: NARANJA_BAHIA, color: TINTA, padding: '32px 36px' }}
                  >
                    <div className="flex flex-col gap-1.5 min-w-0">
                      <b style={{ fontFamily: DISPLAY, fontWeight: 500, fontSize: '20px', lineHeight: 1.2, letterSpacing: '-0.01em' }}>
                        ¿Tenés {masDe}?
                      </b>
                      <p className="m-0 text-[14px]" style={{ color: TINTA }}>Escribinos y te armamos un plan a medida mientras llega el Pro.</p>
                    </div>
                    {/* El botón negro de las otras tarjetas; abre el formulario de contacto. */}
                    <div className="shrink-0">
                      <BotonAccion onClick={() => setContactoAbierto(true)}>Plan a medida</BotonAccion>
                    </div>
                  </aside>
                )}
              </div>
            </div>

            {/* La letra chica, en la columna de la página y centrada. */}
            <div>
              <div className={`${COL} mt-[22px] text-[13px] flex flex-col gap-1 text-center`} style={{ color: SUAVE }}>
                <span>Cuentan todos tus productos, también los pausados. Los talles y colores de un producto cuentan como uno solo.</span>
                <span>El precio se revisa cada 3 meses y te avisamos antes de cualquier cambio. Te das de baja cuando quieras desde tu panel.</span>
              </div>
            </div>
          </section>

          {/* La línea de toldo entre «Planes» y «Preguntas»: medios círculos
              verdes a lo ancho de la columna de texto (tantos como entren,
              centrados), con todo el espacio entre las dos secciones (56 / 80
              px arriba y abajo; ninguna de las dos suma relleno de ese lado). */}
          <div className={`${MARCO} my-14 md:my-20`}>
            <div className={COL}>
              <LineaToldo curvas="llenar" onda={25} alto={11} color={FONDO_BAHIA} />
            </div>
          </div>

          {/* 6. Preguntas */}
          <section className={`${MARCO} pb-[72px]`}>
            <div className={COL}>
              <Cabeza etiqueta="Preguntas frecuentes">¿Qué te estás preguntando?</Cabeza>
              <div className="border-t border-[rgba(10,10,10,0.10)]">
                <Pregunta pregunta="¿Necesito cuenta de Mercado Pago?">
                  Elegimos abrir nuestra web con la billetera virtual más popular y confiable de nuestro país. Por eso, <strong className="font-medium">sí, necesitás una billetera de Mercado Pago</strong>. La conectás desde tu panel y cada venta se cobra directo en tu cuenta. A Bahía Shops solo le llega su comisión.
                </Pregunta>
                <Pregunta pregunta="¿Cómo y cuándo me llega la plata?">
                  Entrá a tu cuenta de Mercado Pago y <a href={COSTOS_MP} target="_blank" rel="noopener noreferrer">revisá los plazos que tenés configurados</a>.
                </Pregunta>
                <Pregunta pregunta="¿Qué puedo vender?">
                  Productos de emprendimientos y comercios de la ciudad. En gastronomía, solo productos envasados y no perecederos. Cada producto nuevo se revisa antes de publicarse.
                </Pregunta>
                <Pregunta pregunta="¿Quién hace los envíos?">
                  Vos elegís cómo y cuándo hacer tus envíos: retiro en tu local, tu propio envío con precios por distancia, correo, o coordinar con quien compra.
                </Pregunta>
                <Pregunta pregunta="¿Puedo pausar mi tienda?">
                  Sí, cuando quieras y con un mensaje para tus clientes. No perdés nada y la reactivás con un clic.
                </Pregunta>
                <Pregunta pregunta={`¿Qué pasa si dejo de pagar el ${basico?.nombre || 'Básico'}?`}>
                  Te avisaremos por 10 días si dejás de pagar tu plan. Si se desactiva, podés reactivarlo sin problema y tus productos van a estar nuevamente disponibles. Mientras tanto, {gratis
                    ? `tus primeros ${gratis.tope} productos siguen a la venta.`
                    : 'tus primeros productos, hasta el tope del plan Gratis, siguen a la venta.'}
                </Pregunta>
                <Pregunta pregunta="¿Puedo dar de baja mi plan?">
                  Sí, desde tu panel, igual de fácil que el alta. Seguís con el plan elegido hasta que termina el mes que pagaste.
                </Pregunta>
                <Pregunta pregunta="¿Tengo que estar en Bahía Blanca?">
                  Si sos vendedor, sí. Si tenés un emprendimiento en otra ciudad, contanos dónde: ¡queremos llegar!
                </Pregunta>
              </div>
            </div>
          </section>

          {/* Cierre: una tarjeta azul casi de punta a punta (como la de los
              beneficios), con el título arriba y el cuadrillé abajo, recortado
              por las esquinas; el botón va encima del cuadrillé, centrado. */}
          <section
            className={`${MARGEN_TARJETA} mb-[10px] md:mb-4 rounded-[20px] md:rounded-[24px] overflow-hidden flex flex-col`}
            style={{ background: AZUL }}
          >
            {/* Más aire abajo (40 / 48 px), para que el cuadrillé no quede pegado al título. */}
            <div className="px-6 pt-14 pb-10 md:px-12 md:pt-[82px] md:pb-12 flex flex-col items-center text-center">
              <h2 className="text-[clamp(28px,4vw,38px)] leading-[1.15]" style={{ ...titulo, color: '#fff' }}>
                <span className="block md:whitespace-nowrap">Bahía está llena de proyectos por conocer.</span>
                {/* Un poco más chica que la frase de arriba (el 65 %), en la letra de los títulos de los pasos y los beneficios. */}
                <span className="block" style={{ ...tituloInter, fontSize: '0.65em', marginTop: '14px' }}>¡Sumá el tuyo!</span>
              </h2>
            </div>
            {/* El cuadrillé: celeste sobre el azul de la tarjeta. Arranca con las
                verticales sueltas (las líneas van en el medio de cada cuadro, así
                la primera horizontal queda 24 px más abajo). Una franja baja
                (120 / 130 px); encima, el botón, centrado y un poco más arriba
                que el medio (20 px en el celular, 28 px desde md). */}
            <div className="relative shrink-0 h-[120px] md:h-[130px] flex items-center justify-center px-6">
              <div
                aria-hidden="true"
                className="absolute inset-0"
                style={estiloCuadrille({ fondo: 'transparent', linea: 'rgba(156,195,234,0.75)' })}
              />
              <div className="relative [--sube:-20px] md:[--sube:-28px]" style={{ transform: 'translateY(var(--sube))' }}>
                <BotonHero href={destino} fondoEncima={AZUL} contorno="#fff">{textoBoton('Sumá tu tienda gratis')}</BotonHero>
              </div>
            </div>
          </section>
        </main>
      </div>

      <ModalContacto
        abierto={contactoAbierto}
        onClose={() => setContactoAbierto(false)}
        titulo="Un plan a medida"
        subtitulo="Contanos cuántos productos tenés."
        mensajeInicial={`Quiero un plan con ${masDe}.`}
        contexto="Plan a medida — /vender"
      />
      <ModalSuscripcion abierto={altaAbierta} onClose={() => setAltaAbierta(false)} />
    </>
  )
}
