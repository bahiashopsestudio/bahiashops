'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import Navbar from '@/components/Navbar'
import MenuTakeover from '@/components/MenuTakeover'
import { createClient } from '@/lib/supabase/client'
import { sesionParaContacto, precargarEmail } from '@/lib/formularioContacto'
import { emailValido, MAX_RUBRO } from '@/lib/formulariosPublicos'
import { EMAIL_CONTACTO } from '@/lib/contacto'
import { FONDO_BAHIA, CELESTE_BAHIA } from '@/lib/coloresBahia'

const TINTA = '#0a0a0a'
const BEIGE = '#f4e9e1'
const CELESTE_SUAVE = 'rgba(156,195,234,0.78)'
const ERROR = '#ffcdc7'
const UI = "'Inter', system-ui, sans-serif"
const TITULO = "'Fraunces', Georgia, serif"
const TEXTO = "'Poppins', system-ui, sans-serif"

// Solo de ejemplo: no son links ni filtran nada.
const RUBROS = ['Gasistas', 'Electricistas', 'Masajes', 'Manicura', 'Fotografía', 'Clases']

const MENSAJE_EMAIL = 'Revisá el email: parece que le falta algo.'
const MENSAJE_RUBRO = 'Contanos qué servicio ofrecés.'
const MENSAJE_ERROR = 'No pudimos anotarte. Probá de nuevo en un rato.'

// Copia de la de VenderContent.jsx.
function Pastilla({ children }) {
  return (
    <span
      className="px-2 py-1 rounded-full whitespace-nowrap self-start"
      style={{ fontFamily: UI, fontSize: '10.5px', fontWeight: 600, letterSpacing: '.08em', textTransform: 'uppercase', background: BEIGE, color: TINTA }}
    >
      {children}
    </span>
  )
}

const estiloEtiqueta = { fontFamily: UI, fontSize: '13px', fontWeight: 500, color: CELESTE_BAHIA }
const estiloCampo = (conError) => ({
  fontFamily: UI, fontSize: '15px', padding: '12px 14px', borderRadius: '4px', width: '100%', minWidth: 0,
  border: `1px solid ${conError ? ERROR : 'rgba(156,195,234,0.45)'}`, background: '#faf9f7', color: TINTA,
})
const estiloAviso = { fontFamily: UI, fontSize: '12.5px', fontWeight: 500, color: ERROR, margin: 0 }

function Formulario({ onListo, precargar }) {
  const [email, setEmail] = useState('')
  const [rubro, setRubro] = useState('')
  // Campo trampa: las personas no lo ven; si llega lleno, el servidor no hace nada.
  const [empresaWeb, setEmpresaWeb] = useState('')
  const [errores, setErrores] = useState({})
  const [errorGeneral, setErrorGeneral] = useState('')
  const [enviando, setEnviando] = useState(false)
  const [hover, setHover] = useState(false)

  // Con sesión, el email de la cuenta (editable). No pisa lo que ya escribieron.
  // Después de «Anotar otro email» arranca vacío.
  useEffect(() => {
    if (!precargar) return
    let vigente = true
    sesionParaContacto(createClient()).then((sesion) => {
      if (vigente) setEmail((actual) => precargarEmail(actual, sesion))
    })
    return () => { vigente = false }
  }, [precargar])

  async function enviar(e) {
    e.preventDefault()
    const nuevos = {}
    if (!emailValido(email.trim())) nuevos.email = MENSAJE_EMAIL
    if (!rubro.trim()) nuevos.rubro = MENSAJE_RUBRO
    setErrores(nuevos)
    setErrorGeneral('')
    if (Object.keys(nuevos).length) return

    setEnviando(true)
    try {
      const res = await fetch('/api/servicios', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: email.trim(), rubro: rubro.trim(), empresa_web: empresaWeb }),
      })
      if (res.ok) {
        onListo()
        return
      }
      const datos = await res.json().catch(() => ({}))
      if (res.status === 400 && (datos.campo === 'email' || datos.campo === 'rubro')) {
        setErrores({ [datos.campo]: datos.error || (datos.campo === 'email' ? MENSAJE_EMAIL : MENSAJE_RUBRO) })
      } else if (res.status === 429) {
        setErrorGeneral(datos.error || 'Hoy recibimos muchas anotaciones. Probá de nuevo mañana.')
      } else {
        setErrorGeneral(MENSAJE_ERROR)
      }
    } catch {
      setErrorGeneral(MENSAJE_ERROR)
    }
    setEnviando(false)
  }

  const botonActivo = hover && !enviando

  return (
    <>
      <h2 className="m-0" style={{ fontFamily: TITULO, fontWeight: 500, fontSize: '28px', lineHeight: 1.15, letterSpacing: '-0.02em', color: CELESTE_BAHIA }}>
        ¿Te interesaría sumarte?
      </h2>
      <p className="m-0" style={{ fontFamily: TEXTO, fontWeight: 300, fontSize: '14.5px', color: CELESTE_SUAVE, marginTop: '-8px' }}>
        Dejanos tu email y qué hacés. Te avisamos apenas abramos.
      </p>

      <form onSubmit={enviar} noValidate className="flex flex-col gap-4">
        <div className="flex flex-col gap-1.5">
          <label htmlFor="servicios-email" style={estiloEtiqueta}>Tu email</label>
          <input
            id="servicios-email"
            type="email"
            autoComplete="email"
            placeholder="nombre@mail.com"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            disabled={enviando}
            aria-invalid={errores.email ? 'true' : undefined}
            aria-describedby={errores.email ? 'servicios-email-error' : undefined}
            style={estiloCampo(!!errores.email)}
          />
          {errores.email && <p id="servicios-email-error" style={estiloAviso}>{errores.email}</p>}
        </div>

        <div className="flex flex-col gap-1.5">
          <label htmlFor="servicios-rubro" style={estiloEtiqueta}>¿Qué servicio ofrecés?</label>
          <input
            id="servicios-rubro"
            type="text"
            maxLength={MAX_RUBRO}
            placeholder="Ej.: gasista, masajes, fotografía"
            value={rubro}
            onChange={(e) => setRubro(e.target.value)}
            disabled={enviando}
            aria-invalid={errores.rubro ? 'true' : undefined}
            aria-describedby={errores.rubro ? 'servicios-rubro-error servicios-rubro-ayuda' : 'servicios-rubro-ayuda'}
            style={estiloCampo(!!errores.rubro)}
          />
          {errores.rubro && <p id="servicios-rubro-error" style={estiloAviso}>{errores.rubro}</p>}
          <p id="servicios-rubro-ayuda" className="m-0" style={{ fontFamily: UI, fontSize: '12px', color: CELESTE_SUAVE }}>
            Con tus palabras. Hasta {MAX_RUBRO} caracteres.
          </p>
        </div>

        <input
          type="text"
          name="empresa_web"
          value={empresaWeb}
          onChange={(e) => setEmpresaWeb(e.target.value)}
          tabIndex={-1}
          autoComplete="off"
          aria-hidden="true"
          style={{ position: 'absolute', left: '-9999px', width: '1px', height: '1px' }}
        />

        <button
          type="submit"
          disabled={enviando}
          onMouseEnter={() => setHover(true)}
          onMouseLeave={() => setHover(false)}
          className="self-start transition-colors"
          style={{
            fontFamily: UI, fontSize: '14px', fontWeight: 600, padding: '13px 22px', borderRadius: '4px',
            border: `1px solid ${CELESTE_BAHIA}`,
            background: botonActivo ? 'transparent' : CELESTE_BAHIA,
            color: botonActivo ? CELESTE_BAHIA : FONDO_BAHIA,
            cursor: enviando ? 'not-allowed' : 'pointer',
            opacity: enviando ? 0.7 : 1,
          }}
        >
          {enviando ? 'Anotando…' : 'Anotarme'}
        </button>

        {errorGeneral && <p role="alert" style={estiloAviso}>{errorGeneral}</p>}
      </form>

      <p className="m-0" style={{ fontFamily: UI, fontSize: '12px', lineHeight: 1.5, color: CELESTE_SUAVE }}>
        Usamos tu email solo para avisarte cuando abramos Servicios. Podés pedirnos que lo borremos cuando quieras.{' '}
        <Link href="/privacidad" className="underline underline-offset-2" style={{ color: CELESTE_BAHIA }}>
          Política de privacidad
        </Link>
      </p>
    </>
  )
}

function Listo({ onOtro }) {
  return (
    <div role="status" className="flex flex-col gap-2.5 py-3">
      <p className="m-0" style={{ fontFamily: TITULO, fontWeight: 500, fontSize: '26px', lineHeight: 1.15, color: CELESTE_BAHIA }}>
        ¡Listo! Te avisamos cuando abramos Servicios.
      </p>
      <p className="m-0" style={{ fontFamily: TEXTO, fontWeight: 300, fontSize: '14.5px', color: CELESTE_SUAVE }}>
        Si querés cambiar el rubro o que borremos tu email, escribinos a{' '}
        <a href={`mailto:${EMAIL_CONTACTO}`} className="underline underline-offset-2" style={{ color: CELESTE_BAHIA }}>{EMAIL_CONTACTO}</a>.
      </p>
      <button
        type="button"
        onClick={onOtro}
        className="self-start underline underline-offset-[3px] cursor-pointer"
        style={{ background: 'none', border: 'none', padding: 0, fontFamily: UI, fontSize: '13px', color: CELESTE_BAHIA }}
      >
        Anotar otro email
      </button>
    </div>
  )
}

export default function ServiciosContent() {
  const [menuAbierto, setMenuAbierto] = useState(false)
  const [listo, setListo] = useState(false)
  // Cambia la key del formulario: vuelve a montarse vacío.
  const [vuelta, setVuelta] = useState(0)

  useEffect(() => {
    if (menuAbierto) { document.body.style.overflow = 'hidden' } else { document.body.style.overflow = '' }
    return () => { document.body.style.overflow = '' }
  }, [menuAbierto])

  return (
    <>
      <link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Inter:wght@200;300;400;500;600;700;800;900&display=swap" />
      <link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Fraunces:opsz,wght@9..144,100..900&family=Poppins:wght@300;400;500&display=swap" />

      <div className="min-h-screen" style={{ fontFamily: UI, background: '#faf9f7' }}>
        {menuAbierto && <MenuTakeover onClose={() => setMenuAbierto(false)} />}
        <Navbar onToggleMenu={() => setMenuAbierto(!menuAbierto)} variant="solid" />

        <div className="pt-20 pb-24 px-4 md:px-8">
          <div className="max-w-[1040px] mx-auto grid grid-cols-1 lg:grid-cols-2 gap-9 lg:gap-14 items-start pt-10 lg:pt-[72px]">

            <div className="flex flex-col gap-5 min-w-0 lg:pt-2">
              <Pastilla>Próximamente</Pastilla>
              <h1 className="m-0 text-[44px] md:text-[56px] lg:text-[68px]" style={{ fontFamily: TITULO, fontWeight: 500, lineHeight: 1, letterSpacing: '-0.03em', color: TINTA }}>
                Servicios
              </h1>
              <p className="m-0 text-[15px] md:text-[17px]" style={{ fontFamily: TEXTO, fontWeight: 300, lineHeight: 1.6, color: 'rgba(10,10,10,0.62)', maxWidth: '42ch' }}>
                Lo estamos desarrollando: muy pronto vas a encontrar acá oficios, profesionales y personas que ofrecen sus servicios en Bahía.
              </p>
              <div className="flex flex-wrap gap-2 mt-1">
                {RUBROS.map((r) => (
                  <span
                    key={r}
                    className="rounded-full"
                    style={{ fontFamily: UI, fontSize: '12.5px', color: 'rgba(10,10,10,0.62)', border: '1px solid rgba(10,10,10,0.10)', padding: '5px 11px' }}
                  >
                    {r}
                  </span>
                ))}
              </div>
            </div>

            <div className="rounded-2xl flex flex-col gap-5 min-w-0 px-4 py-5 md:px-7 md:py-8 relative" style={{ background: FONDO_BAHIA, color: CELESTE_BAHIA }}>
              {listo ? (
                <Listo onOtro={() => { setVuelta((v) => v + 1); setListo(false) }} />
              ) : (
                <Formulario key={vuelta} precargar={vuelta === 0} onListo={() => setListo(true)} />
              )}
            </div>
          </div>
        </div>
      </div>
    </>
  )
}
