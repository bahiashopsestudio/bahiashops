'use client'

import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import Navbar from '@/components/Navbar'
import MenuTakeover from '@/components/MenuTakeover'
import { EMAIL_CONTACTO } from '@/lib/contacto'

const MENU_CATEGORIAS = ['moda','belleza-y-bienestar','joyeria-y-accesorios','hogar-y-deco','artes-y-oficios','bebes-y-maternidad','juegos-y-juguetes','mascotas','libros','deporte','vintage']

const RUTA = '/perfil/eliminar-cuenta'
const PALABRA = 'ELIMINAR'

const ROJO = '#b3261e'
const NEGRO = '#0a0a0a'
const FONDO = '#faf9f7'
const BORDE = '#e8e5df'

const MAIL_BAJA_TIENDA =
  `mailto:${EMAIL_CONTACTO}?subject=${encodeURIComponent('Quiero dar de baja mi tienda')}`

// ── Piezas de la página ──────────────────────────────────────────────────────

const estiloEtiqueta = {
  fontFamily: "'Inter', sans-serif", fontWeight: 600, fontSize: '11px',
  letterSpacing: '0.12em', textTransform: 'uppercase',
}

function LineaSuperior({ color = ROJO, children }) {
  return <p style={{ ...estiloEtiqueta, color, margin: '0 0 10px' }}>{children}</p>
}

function Titulo({ children }) {
  return (
    <h1 style={{ fontFamily: 'Fraunces, serif', fontWeight: 500, fontSize: '28px', lineHeight: 1.2, color: NEGRO, margin: '0 0 14px' }}>
      {children}
    </h1>
  )
}

function Parrafo({ children, gris = false, chico = false }) {
  return (
    <p style={{
      fontFamily: 'Poppins, sans-serif', fontWeight: 300, fontSize: chico ? '13px' : '15px', lineHeight: 1.6,
      color: gris ? 'rgba(10,10,10,0.5)' : 'rgba(10,10,10,0.75)', margin: '0 0 18px',
    }}>
      {children}
    </p>
  )
}

function Tarjeta({ etiqueta, children }) {
  return (
    <div style={{ backgroundColor: '#ffffff', border: `1px solid ${BORDE}`, borderRadius: '8px', padding: '20px', margin: '0 0 16px' }}>
      <p style={{ ...estiloEtiqueta, color: 'rgba(10,10,10,0.45)', margin: '0 0 12px' }}>{etiqueta}</p>
      {children}
    </div>
  )
}

function Caja({ fondo = '#fff6e0', color = '#7a5a12', children }) {
  return (
    <div style={{
      backgroundColor: fondo, color, borderRadius: '12px', padding: '16px', margin: '0 0 16px',
      fontFamily: 'Poppins, sans-serif', fontWeight: 300, fontSize: '15px', lineHeight: 1.6,
    }}>
      {children}
    </div>
  )
}

const negrita = { fontWeight: 500 }

const estiloBoton = {
  display: 'block', width: '100%', boxSizing: 'border-box', textAlign: 'center',
  fontFamily: "'Inter', sans-serif", fontWeight: 500, fontSize: '14px',
  borderRadius: '4px', padding: '14px 20px', border: 'none', color: '#ffffff', textDecoration: 'none', cursor: 'pointer',
}

function BotonNegro({ href, onClick, children }) {
  const estilo = { ...estiloBoton, backgroundColor: NEGRO }
  if (href) {
    return href.startsWith('mailto:')
      ? <a href={href} style={estilo}>{children}</a>
      : <Link href={href} style={estilo}>{children}</Link>
  }
  return <button type="button" onClick={onClick} style={estilo}>{children}</button>
}

function LinkVolver({ children = 'Volver a mi perfil' }) {
  return (
    <p style={{ textAlign: 'center', margin: '24px 0 0' }}>
      <Link href="/perfil" style={{ fontFamily: "'Inter', sans-serif", fontSize: '14px', color: 'rgba(10,10,10,0.6)', textDecoration: 'underline' }}>
        {children}
      </Link>
    </p>
  )
}

// Una sección por impedimento, con el texto de cada uno.
function SeccionMotivo({ motivo, datos }) {
  if (motivo === 'TIENDA') {
    return (
      <div style={{ marginBottom: '24px' }}>
        <Caja>
          Tenés una tienda en Bahía Shops: <strong style={negrita}>{datos.tienda?.nombre}</strong>. Para eliminar tu cuenta, primero hay que darla de baja.
        </Caja>
        <Parrafo>Así tus clientes no se quedan con compras sin respuesta y tu MercadoPago se desconecta bien.</Parrafo>
        <BotonNegro href={MAIL_BAJA_TIENDA}>Escribirnos para darla de baja</BotonNegro>
      </div>
    )
  }
  if (motivo === 'PEDIDO_ACTIVO') {
    return (
      <div style={{ marginBottom: '24px' }}>
        <Caja>
          {datos.pedidos.map((p) => (
            <p key={p.id} style={{ margin: 0 }}>
              Tu pedido <strong style={negrita}>#{p.id} en {p.tienda}</strong> todavía no se entregó.
            </p>
          ))}
        </Caja>
        <Parrafo>
          Si eliminamos tu cuenta ahora, la tienda se queda sin forma de contactarte para entregártelo. Cuando lo recibas, vas a poder eliminarla.
        </Parrafo>
        <BotonNegro href="/mis-pedidos">Ver mis pedidos</BotonNegro>
      </div>
    )
  }
  if (motivo === 'PAGO_EN_CURSO') {
    return (
      <div style={{ marginBottom: '24px' }}>
        <Caja>
          {datos.pagos.map((p) => (
            <p key={p.id} style={{ margin: 0 }}>
              MercadoPago todavía está procesando un pago tuyo en <strong style={negrita}>{p.tienda}</strong>, por ejemplo un pago en efectivo en Rapipago o Pago Fácil.
            </p>
          ))}
        </Caja>
        <Parrafo>Cuando se acredite o venza, vas a poder eliminar tu cuenta.</Parrafo>
        <BotonNegro href="/mis-pedidos">Ver mis pedidos</BotonNegro>
      </div>
    )
  }
  if (motivo === 'ES_ADMIN') {
    return (
      <div style={{ marginBottom: '24px' }}>
        <Caja>Para eliminarla, primero hay que quitarle el permiso de administración.</Caja>
      </div>
    )
  }
  return null
}

const TITULO_MOTIVO = {
  TIENDA: () => 'Primero, tu emprendimiento',
  PEDIDO_ACTIVO: (d) => (d.pedidos.length === 1 ? 'Tenés una compra en camino' : 'Tenés compras en camino'),
  PAGO_EN_CURSO: () => 'Tenés un pago en proceso',
  ES_ADMIN: () => 'Esta es una cuenta de administración',
}

// ── La página ────────────────────────────────────────────────────────────────

export default function EliminarCuentaPage() {
  const supabase = createClient()
  const router = useRouter()

  // 'cargando' | 'puede' | 'bloqueado' | 'mp' | 'error' | 'listo'
  const [pantalla, setPantalla] = useState('cargando')
  const [datos, setDatos] = useState(null)
  const [texto, setTexto] = useState('')
  const [eliminando, setEliminando] = useState(false)
  const [errorEnvio, setErrorEnvio] = useState('')
  const [menuOpen, setMenuOpen] = useState(false)
  const [categorias, setCategorias] = useState([])

  useEffect(() => {
    if (menuOpen) { document.body.style.overflow = 'hidden' } else { document.body.style.overflow = '' }
    return () => { document.body.style.overflow = '' }
  }, [menuOpen])

  // Muestra la pantalla que corresponde a lo que dijo el servidor.
  function mostrarSegunRespuesta(status, cuerpo) {
    if (status === 503) { setPantalla('mp'); return }
    if (status === 401) { router.replace(`/entrar?next=${encodeURIComponent(RUTA)}`); return }
    if ((status === 200 || status === 409) && cuerpo && Array.isArray(cuerpo.motivos)) {
      setDatos(cuerpo)
      setPantalla(status === 200 && cuerpo.puede ? 'puede' : 'bloqueado')
      return
    }
    setPantalla('error')
  }

  // Al abrirse (y al reintentar): ¿se puede eliminar? Si algo no responde como
  // se espera, se trata como que no se pudo revisar: nunca se muestra el
  // formulario sin haberlo confirmado.
  async function revisar() {
    try {
      const res = await fetch('/api/cuenta/cerrar')
      const cuerpo = await res.json().catch(() => null)
      mostrarSegunRespuesta(res.status, cuerpo)
    } catch {
      setPantalla('error')
    }
  }

  useEffect(() => {
    async function cargar() {
      const { data: cats } = await supabase.from('categorias').select('id, nombre, slug').eq('activa', true).order('orden')
      if (cats) setCategorias(cats)

      const { data: { user } } = await supabase.auth.getUser()
      if (!user) { router.replace(`/entrar?next=${encodeURIComponent(RUTA)}`); return }

      await revisar()
    }
    cargar()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  function reintentar() {
    setPantalla('cargando')
    revisar()
  }

  const confirmado = texto.trim().toUpperCase() === PALABRA

  async function eliminar() {
    if (!confirmado || eliminando) return
    setEliminando(true)
    setErrorEnvio('')
    try {
      const res = await fetch('/api/cuenta/cerrar', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ confirmacion: texto.trim() }),
      })
      const cuerpo = await res.json().catch(() => null)

      if (res.ok && cuerpo?.ok) {
        // La sesión ya la cerró el servidor; esto limpia lo que quedó en el
        // navegador y avisa al Navbar.
        try { await supabase.auth.signOut({ scope: 'local' }) } catch { /* ya no hay sesión */ }
        setPantalla('listo')
        router.refresh()
        setEliminando(false)
        return
      }

      if (res.status === 409 || res.status === 503 || res.status === 401) {
        mostrarSegunRespuesta(res.status, cuerpo)
      } else {
        setErrorEnvio('No pudimos eliminar tu cuenta. No se borró nada: probá de nuevo en unos minutos.')
      }
    } catch {
      setErrorEnvio('No pudimos conectarnos. No se borró nada: revisá tu conexión y probá de nuevo.')
    }
    setEliminando(false)
  }

  const menuCats = MENU_CATEGORIAS.map(s => categorias.find(c => c.slug === s)).filter(Boolean)

  return (
    <>
      <link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Inter:wght@200;300;400;500;600;700&display=swap" />
      <link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Fraunces:opsz,wght@9..144,100..900&family=Poppins:wght@300;400;500&display=swap" />

      <div className="min-h-screen" style={{ backgroundColor: FONDO, fontFamily: "'Inter', sans-serif" }}>
        {menuOpen && <MenuTakeover categorias={menuCats} onClose={() => setMenuOpen(false)} />}
        <Navbar onToggleMenu={() => setMenuOpen(!menuOpen)} variant="solid" />

        <div className="pt-24 pb-24 px-4 md:px-8">
          <div className="max-w-lg mx-auto">

            {pantalla === 'cargando' && (
              <>
                <LineaSuperior>ELIMINAR MI CUENTA</LineaSuperior>
                <p style={{ fontFamily: 'Poppins, sans-serif', fontWeight: 300, fontSize: '14px', color: 'rgba(10,10,10,0.4)' }}>Cargando…</p>
              </>
            )}

            {/* A. Se puede eliminar */}
            {pantalla === 'puede' && datos && (
              <>
                <LineaSuperior>ELIMINAR MI CUENTA</LineaSuperior>
                <Titulo>¿Querés eliminar tu cuenta?</Titulo>
                <Parrafo>Vamos a borrar tus datos de Bahía Shops. No se puede deshacer.</Parrafo>

                <Tarjeta etiqueta="QUÉ SE BORRA">
                  <ul style={{ margin: 0, paddingLeft: '18px', fontFamily: 'Poppins, sans-serif', fontWeight: 300, fontSize: '15px', lineHeight: 1.8, color: NEGRO }}>
                    <li>Tu nombre, tu mail y tu teléfono</li>
                    <li>Tus direcciones</li>
                    <li>{datos.apodo ? <>Tu apodo, <strong style={negrita}>{datos.apodo}</strong></> : 'Tu apodo'}</li>
                    <li>Tus favoritos</li>
                  </ul>
                </Tarjeta>

                {datos.tiene_pedidos && (
                  <Tarjeta etiqueta="QUÉ PASA CON TUS COMPRAS">
                    <p style={{ margin: 0, fontFamily: 'Poppins, sans-serif', fontWeight: 300, fontSize: '15px', lineHeight: 1.6, color: NEGRO }}>
                      Tus pedidos quedan en el registro de ventas de cada tienda, sin tus datos: ahí vas a figurar como «Cuenta eliminada».
                    </p>
                  </Tarjeta>
                )}

                <Parrafo gris chico>Si más adelante volvés, vas a empezar con una cuenta nueva.</Parrafo>

                <label htmlFor="confirmacion" style={{ ...estiloEtiqueta, display: 'block', color: NEGRO, margin: '0 0 8px', textTransform: 'none', letterSpacing: 0, fontWeight: 500, fontSize: '14px' }}>
                  Para confirmar, escribí ELIMINAR
                </label>
                <input
                  id="confirmacion"
                  type="text"
                  value={texto}
                  onChange={(e) => setTexto(e.target.value)}
                  placeholder="ELIMINAR"
                  autoComplete="off"
                  autoCorrect="off"
                  autoCapitalize="characters"
                  spellCheck={false}
                  disabled={eliminando}
                  style={{
                    width: '100%', boxSizing: 'border-box', padding: '12px 14px', margin: '0 0 16px',
                    border: `1px solid ${BORDE}`, borderRadius: '4px', backgroundColor: '#ffffff',
                    fontFamily: "'Inter', sans-serif", fontSize: '15px', color: NEGRO,
                  }}
                />

                <button
                  type="button"
                  onClick={eliminar}
                  disabled={!confirmado || eliminando}
                  style={{
                    ...estiloBoton, backgroundColor: ROJO,
                    opacity: !confirmado || eliminando ? 0.35 : 1,
                    cursor: !confirmado || eliminando ? 'not-allowed' : 'pointer',
                  }}
                >
                  {eliminando ? 'Eliminando…' : 'Eliminar mi cuenta'}
                </button>

                {errorEnvio && (
                  <p style={{ fontFamily: 'Poppins, sans-serif', fontWeight: 300, fontSize: '14px', color: ROJO, margin: '14px 0 0' }}>{errorEnvio}</p>
                )}

                <LinkVolver>Mejor no, volver a mi perfil</LinkVolver>
              </>
            )}

            {/* B. Con impedimentos */}
            {pantalla === 'bloqueado' && datos && (() => {
              const motivos = datos.motivos
              const titulo = motivos.length === 1 && TITULO_MOTIVO[motivos[0]]
                ? TITULO_MOTIVO[motivos[0]](datos)
                : 'Antes de eliminar tu cuenta'
              return (
                <>
                  <LineaSuperior>ELIMINAR MI CUENTA</LineaSuperior>
                  <Titulo>{titulo}</Titulo>
                  <div style={{ marginTop: '20px' }}>
                    {motivos.map((m) => <SeccionMotivo key={m} motivo={m} datos={datos} />)}
                  </div>
                  <LinkVolver />
                </>
              )
            })()}

            {/* C. MercadoPago no responde */}
            {pantalla === 'mp' && (
              <>
                <LineaSuperior>ELIMINAR MI CUENTA</LineaSuperior>
                <Titulo>No pudimos revisar tus pagos</Titulo>
                <Caja fondo="#fbe9e7" color={ROJO}>
                  MercadoPago no nos respondió a tiempo, y antes de eliminar tu cuenta necesitamos confirmar que no tenés ningún pago pendiente.
                </Caja>
                <Parrafo>No se borró nada. Probá de nuevo en unos minutos.</Parrafo>
                <BotonNegro onClick={reintentar}>Probar de nuevo</BotonNegro>
                <LinkVolver />
              </>
            )}

            {/* Un error nuestro (no pedido en el diseño: no se puede mostrar el formulario sin haber revisado) */}
            {pantalla === 'error' && (
              <>
                <LineaSuperior>ELIMINAR MI CUENTA</LineaSuperior>
                <Titulo>No pudimos revisar tu cuenta</Titulo>
                <Caja fondo="#fbe9e7" color={ROJO}>
                  Hubo un problema de nuestro lado y no pudimos confirmar si tu cuenta se puede eliminar.
                </Caja>
                <Parrafo>No se borró nada. Probá de nuevo en unos minutos.</Parrafo>
                <BotonNegro onClick={reintentar}>Probar de nuevo</BotonNegro>
                <LinkVolver />
              </>
            )}

            {/* D. Listo */}
            {pantalla === 'listo' && (
              <>
                <LineaSuperior color="#4164fe">CUENTA ELIMINADA</LineaSuperior>
                <Titulo>Listo, eliminamos tu cuenta</Titulo>
                <Parrafo>Borramos tus datos de Bahía Shops. Te mandamos un mail para confirmarlo.</Parrafo>
                <Parrafo>Gracias por haberle comprado a los emprendimientos de Bahía.</Parrafo>
                <div style={{ marginTop: '24px' }}>
                  <BotonNegro href="/">Ir al inicio</BotonNegro>
                </div>
              </>
            )}

          </div>
        </div>
      </div>
    </>
  )
}
