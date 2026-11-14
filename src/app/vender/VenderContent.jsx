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
import MenuTakeover from '@/components/MenuTakeover'
import ModalContacto from '@/components/ModalContacto'
import ModalSuscripcion from '@/components/ModalSuscripcion'
import { EMAIL_CONTACTO } from '@/lib/contacto'
import { FONDO_BAHIA, CELESTE_BAHIA } from '@/lib/coloresBahia'

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

const DISPLAY = "'Fraunces', Georgia, 'Times New Roman', serif"
const TEXTO = "'Poppins', system-ui, sans-serif"
const UI = "'Inter', system-ui, sans-serif"

const MARCO = 'pl-[max(16px,env(safe-area-inset-left))] pr-[max(16px,env(safe-area-inset-right))]'
const COL = 'max-w-[1080px] mx-auto'
const FOCO = 'focus-visible:outline-2 focus-visible:outline-[#4164fe] focus-visible:outline-offset-[3px]'

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
function BotonHero({ href, children }) {
  const [encima, setEncima] = useState(false)
  return (
    <Link
      href={href}
      onMouseEnter={() => setEncima(true)}
      onMouseLeave={() => setEncima(false)}
      className="inline-block text-[13px] md:text-[14px] px-6 py-3 md:px-7 md:py-3.5 rounded-[4px] transition-colors duration-200 motion-reduce:transition-none focus-visible:outline-2 focus-visible:outline-offset-[3px]"
      style={{
        // El contorno solo aparece con foco de teclado (las clases); el color, acá.
        outlineColor: AZUL,
        fontFamily: UI,
        fontWeight: 500,
        border: '1px solid #fff',
        background: encima ? 'transparent' : '#fff',
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
      <span style={{ ...etiqueta, ...(claro ? { color: 'rgba(156,195,234,0.7)' } : {}) }}>{texto}</span>
      <h2 className="text-[clamp(28px,4vw,38px)] leading-[1.15]" style={{ ...titulo, ...(claro ? { color: CELESTE_BAHIA } : {}) }}>
        {children}
      </h2>
      {b && <p style={{ ...bajada, ...(claro ? { color: 'rgba(156,195,234,0.82)' } : {}) }}>{b}</p>}
    </div>
  )
}

function Item({ si = true, children }) {
  return (
    <li className="grid grid-cols-[18px_1fr] gap-2 items-start text-[14px]" style={{ color: si ? TINTA : TENUE }}>
      {si ? (
        <span aria-hidden="true" className="mt-[7px] w-[9px] h-[5px] -rotate-45" style={{ borderLeft: `1.5px solid ${FONDO_BAHIA}`, borderBottom: `1.5px solid ${FONDO_BAHIA}` }} />
      ) : (
        <span aria-hidden="true" className="mt-[10px] w-[9px] h-[1.5px]" style={{ background: TENUE }} />
      )}
      <span>{!si && <span className="sr-only">No incluye: </span>}{children}</span>
    </li>
  )
}

function Pastilla({ azul = false, children }) {
  return (
    <span
      className="px-2 py-1 rounded-full whitespace-nowrap"
      style={{ fontFamily: UI, fontSize: '10.5px', fontWeight: 600, letterSpacing: '.08em', textTransform: 'uppercase', background: azul ? AZUL : BEIGE, color: azul ? '#fff' : TINTA }}
    >
      {children}
    </span>
  )
}

function Plan({ nombre, pastilla, precio, para, destacado = false, pro = false, children, boton, nota }) {
  return (
    <article
      className={`rounded-2xl px-6 py-7 flex flex-col gap-[18px] min-w-0 border ${pro ? 'border-dashed' : ''}`}
      style={{ background: pro ? 'transparent' : '#fff', borderColor: destacado ? TINTA : 'rgba(10,10,10,0.10)' }}
    >
      <div className="flex flex-col gap-1.5">
        <div className="flex items-baseline justify-between gap-2.5 flex-wrap">
          <h3 className="text-[26px]" style={titulo}>{nombre}</h3>
          {pastilla}
        </div>
        {precio}
        <p className="m-0 text-[14px]" style={{ color: SUAVE }}>{para}</p>
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
        ? { fontFamily: UI, fontSize: '20px', fontWeight: 700, letterSpacing: '-0.02em', color: TENUE }
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

function Beneficio({ titulo: t, children }) {
  return (
    <div className="py-5 flex flex-col gap-1.5 min-w-0 border-b border-[rgba(10,10,10,0.10)] lg:pb-0 lg:border-b-0 lg:border-t lg:border-t-[#0a0a0a]">
      <b style={{ fontFamily: UI, fontWeight: 600, fontSize: '15px' }}>{t}</b>
      <span className="text-[14px]" style={{ color: SUAVE }}>{children}</span>
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

  const escribinos = (
    <button
      type="button"
      onClick={() => setContactoAbierto(true)}
      className={`shrink-0 underline underline-offset-[3px] cursor-pointer ${FOCO}`}
      style={{ fontFamily: UI, fontSize: '14px', fontWeight: 500 }}
    >
      Escribinos
    </button>
  )
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
          <section className={`${MARCO} py-[72px]`}>
            <div className={COL}>
              <Cabeza etiqueta="Cómo funciona">Abrís tu tienda en tres pasos</Cabeza>
              <ol className="grid grid-cols-3 gap-7 list-none p-0 m-0 max-[760px]:grid-cols-1">
                {[
                  ['Creá tu tienda', 'Es gratis y te lleva unos minutos: nombre, logo, categoría y dónde estás.'],
                  ['Cargá tus productos', 'Con fotos, precio y talles. Revisamos cada producto nuevo antes de publicarlo.'],
                  ['Vendé', 'La plata de cada venta va directo a tu cuenta de Mercado Pago. Vos elegís cómo entregás.'],
                ].map(([t, texto], i) => (
                  <li key={t} className="flex flex-col gap-2.5 pt-5 border-t border-[#0a0a0a] min-w-0">
                    <span style={{ fontFamily: UI, fontSize: '12px', fontWeight: 600, color: AZUL }}>Paso {i + 1}</span>
                    <h3 className="text-[22px]" style={titulo}>{t}</h3>
                    <p className="m-0" style={{ color: SUAVE }}>{texto}</p>
                  </li>
                ))}
              </ol>
            </div>
          </section>

          {/* 3. Qué te da (5 columnas desde 1024 px) */}
          <section className={`${MARCO} pb-[72px]`}>
            <div className={COL}>
              <Cabeza etiqueta="Qué te da Bahía Shops">Lo que tenés desde el primer día</Cabeza>
              <div className="grid grid-cols-1 border-t border-[rgba(10,10,10,0.10)] lg:grid-cols-5 lg:gap-6 lg:border-t-0">
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

          {/* 4. Cuánto cuesta */}
          <section id="costos" className={`${MARCO} py-[72px] scroll-mt-20`} style={{ background: FONDO_BAHIA, color: CELESTE_BAHIA }}>
            <div className={COL}>
              <Cabeza etiqueta="Cuánto cuesta" claro bajada="Una comisión sobre los productos, nunca sobre el envío. Es la misma en todos los planes.">
                Pagás solo cuando vendés
              </Cabeza>
              <div className="grid grid-cols-2 gap-px rounded-2xl overflow-hidden max-[680px]:grid-cols-1" style={{ background: 'rgba(156,195,234,0.28)' }}>
                {[
                  [comision.base, 'Cliente nuevo que te trae Bahía Shops', 'Te encontró buscando en el sitio, en el mapa o en Tesoros.'],
                  [comision.link, 'Tu propio cliente, por tu link', 'Llegó desde el link que compartiste en tus redes o por WhatsApp.'],
                ].map(([num, quien, texto]) => (
                  <div key={quien} className="px-7 py-8 flex flex-col gap-2.5 min-w-0" style={{ background: FONDO_BAHIA }}>
                    <span className="text-[clamp(56px,9vw,84px)] leading-none" style={{ fontFamily: DISPLAY, fontWeight: 500, letterSpacing: '-0.03em', fontVariantNumeric: 'tabular-nums' }}>{num}</span>
                    <span style={{ fontFamily: UI, fontWeight: 600, fontSize: '16px' }}>{quien}</span>
                    <p className="m-0 text-[14px]" style={{ color: 'rgba(156,195,234,0.82)' }}>{texto}</p>
                  </div>
                ))}
              </div>
              <div className="mt-[22px] flex flex-col gap-1.5 text-[14px]">
                <span style={{ fontFamily: UI, fontWeight: 600, fontSize: '15px' }}>+ Comisión de Mercado Pago</span>
                <span>
                  La cobra Mercado Pago en cualquier venta online y depende del plazo en que elegís recibir la plata.{' '}
                  <a href={COSTOS_MP} target="_blank" rel="noopener noreferrer" className={`underline ${FOCO}`} style={{ color: CELESTE_BAHIA }}>
                    Revisá cuáles son las de tu negocio
                  </a>.
                </span>
              </div>
            </div>
          </section>

          {/* 5. Planes */}
          <section id="planes" className={`${MARCO} py-[72px] scroll-mt-20`}>
            <div className={COL}>
              <Cabeza etiqueta="Planes" bajada="Los planes definen cuántos productos mostrás. La comisión sigue igual en todos.">
                Empezá gratis y crecé cuando quieras
              </Cabeza>
              <div className="grid grid-cols-3 gap-4 items-stretch max-[760px]:grid-cols-1">
                <Plan
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
                  nombre={basico?.nombre || 'Básico'}
                  destacado
                  pastilla={<Pastilla azul>Más productos</Pastilla>}
                  precio={basico
                    ? <Precio>{basico.precio} <small className="text-[14px] font-medium tracking-normal" style={{ color: SUAVE }}>por mes</small></Precio>
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
                    nombre={pro.nombre}
                    precio={<Precio>{pro.precio} <small className="text-[14px] font-medium tracking-normal" style={{ color: SUAVE }}>por mes</small></Precio>}
                    para="Para tiendas con catálogos grandes."
                    boton={<Boton href={destino}>{textoBoton(`Sumarme con el ${pro.nombre}`)}</Boton>}
                  >
                    <Item>{pro.tope ? <>Hasta <b className="font-medium">{pro.tope} productos</b></> : 'Productos sin tope'}</Item>
                    {pro.fotos && <Item>Hasta <b className="font-medium">{pro.fotos} fotos</b> por producto</Item>}
                    <Item si={pro.carritos}>Carritos abandonados</Item>
                  </Plan>
                ) : (
                  <Plan
                    nombre={pro?.nombre || 'Pro'}
                    pro
                    pastilla={<Pastilla>Próximamente</Pastilla>}
                    precio={<Precio chico>Lo estamos desarrollando</Precio>}
                    para="Para tiendas con catálogos grandes."
                    boton={
                      <span
                        aria-disabled="true"
                        className="inline-flex items-center justify-center px-[22px] py-[13px] rounded-[4px] border cursor-not-allowed"
                        style={{ fontFamily: UI, fontSize: '14px', fontWeight: 600, color: TENUE, borderColor: 'rgba(10,10,10,0.10)' }}
                      >
                        Próximamente
                      </span>
                    }
                  >
                    <Item>Productos sin tope</Item>
                    <Item>Más herramientas para tu tienda</Item>
                  </Plan>
                )}
              </div>

              {/* El plan a medida: una franja debajo de los tres planes, mientras no se pueda elegir el Pro */}
              {!proElegible && (
                <aside
                  className="mt-4 rounded-2xl px-7 py-6 flex items-center justify-between gap-6 max-[640px]:flex-col max-[640px]:items-start max-[640px]:gap-3 max-[640px]:px-5"
                  style={{ background: BEIGE }}
                >
                  <div className="flex flex-col gap-1.5 min-w-0">
                    <b style={{ fontFamily: DISPLAY, fontWeight: 500, fontSize: '20px', lineHeight: 1.2, letterSpacing: '-0.01em' }}>
                      ¿Tenés {masDe}?
                    </b>
                    <p className="m-0 text-[14px]" style={{ color: SUAVE }}>Escribinos y te armamos un plan a medida mientras llega el Pro.</p>
                  </div>
                  {escribinos}
                </aside>
              )}

              <div className="mt-[22px] text-[13px] flex flex-col gap-1" style={{ color: SUAVE }}>
                <span>Cuentan todos tus productos, también los pausados. Los talles y colores de un producto cuentan como uno solo.</span>
                <span>El precio se revisa cada 3 meses y te avisamos antes de cualquier cambio.</span>
                <span>Te das de baja cuando quieras desde tu panel.</span>
              </div>
            </div>
          </section>

          {/* 6. Preguntas */}
          <section className={`${MARCO} pb-[72px]`}>
            <div className={COL}>
              <Cabeza etiqueta="Preguntas frecuentes">Lo que nos suelen preguntar</Cabeza>
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

          {/* Cierre */}
          <section className={`${MARCO} py-[72px] text-center`} style={{ background: BEIGE }}>
            <div className={`${COL} flex flex-col items-center gap-[18px]`}>
              <h2 className="text-[clamp(28px,4vw,38px)] leading-[1.15]" style={titulo}>
                Bahía está llena de proyectos por conocer. Sumá el tuyo.
              </h2>
              <Boton href={destino}>{textoBoton('Sumá tu tienda gratis')}</Boton>
              <p className="text-center" style={bajada}>
                ¿Dudas? Escribinos a{' '}
                <a href={`mailto:${EMAIL_CONTACTO}`} className={`underline underline-offset-2 ${FOCO}`} style={{ fontFamily: UI, fontWeight: 500, color: TINTA }}>
                  {EMAIL_CONTACTO}
                </a>
              </p>
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
