'use client'

// La única puerta de entrada: reemplaza a /login y /registro, que ahora sólo
// redirigen acá conservando la query.
//
// Query que entiende:
//   next    adónde volver después de entrar (validado con rutaInterna)
//   modo    'nuevo' (por defecto) o 'cuenta': qué pestaña abre
//   error   'auth' cuando /auth/callback no pudo completar el ingreso
//   motivo  'sesion_mp' cuando se perdió la sesión yendo a MercadoPago

import { useState, useEffect, Suspense } from 'react'
import { useSearchParams, useRouter } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'
import { rutaInterna } from '@/lib/rutas'
import { destinoDespuesDeEntrar } from '@/lib/destinoIngreso'
import Navbar from '@/components/Navbar'
import MenuTakeover from '@/components/MenuTakeover'

const MENU_CATEGORIAS = ['moda','belleza-y-bienestar','joyeria-y-accesorios','hogar-y-deco','artes-y-oficios','bebes-y-maternidad','juegos-y-juguetes','mascotas','libros','deporte','vintage']

const LARGO_MINIMO_CONTRASENA = 8

// El párrafo de arriba depende de dónde viene la persona.
function textoSegunNext(next) {
  if (next.startsWith('/checkout') || next.startsWith('/carrito')) {
    return 'Entrá para terminar tu compra. Después volvés al carrito, tal como lo dejaste.'
  }
  if (next.startsWith('/vendedor')) {
    return 'Entrá con tu cuenta y seguís directo con el alta de tu emprendimiento.'
  }
  return 'Comprale a emprendimientos de tu ciudad y seguí tus pedidos en un solo lugar.'
}

// ── Estilos del sitio ──
const estiloTitulo = { fontFamily: 'Fraunces, serif', fontWeight: 500, fontSize: '28px', color: '#0a0a0a', letterSpacing: '-0.02em', lineHeight: 1.15, margin: 0 }
const estiloParrafo = { fontFamily: 'Poppins, sans-serif', fontWeight: 300, fontSize: '15px', color: 'rgba(10,10,10,0.55)', lineHeight: 1.6 }
const estiloBoton = { fontFamily: "'Inter', sans-serif", fontWeight: 500, fontSize: '14px', borderRadius: '4px', padding: '14px 24px' }
const claseEtiqueta = 'block text-sm text-[#0a0a0a]/50 font-light mb-1.5'
const claseCampo = 'w-full px-4 py-3 rounded-xl border border-[#0a0a0a]/10 text-sm text-[#0a0a0a] focus:outline-none focus:border-[#4164fe]/60 transition bg-white'

function claseBotonNegro(habilitado) {
  return `w-full transition-colors border ${
    habilitado
      ? 'bg-[#0a0a0a] text-white border-[#0a0a0a] hover:bg-[#2a2a2a] cursor-pointer'
      : 'bg-[#0a0a0a]/10 text-[#0a0a0a]/30 border-transparent cursor-not-allowed'
  }`
}

function Aviso({ children, tono = 'error' }) {
  const colores = tono === 'error'
    ? 'bg-red-50 border-red-200 text-red-800'
    : 'bg-amber-50 border-amber-200 text-amber-900'
  return (
    <div className={`mb-6 p-4 rounded-lg border text-[13px] font-light leading-relaxed ${colores}`}>
      {children}
    </div>
  )
}

function EntrarContenido() {
  const supabase = createClient()
  const router = useRouter()
  const params = useSearchParams()

  const next = rutaInterna(params.get('next'))
  const errorAuth = params.get('error') === 'auth'
  const motivoMp = params.get('motivo') === 'sesion_mp'

  const [pestana, setPestana] = useState(params.get('modo') === 'cuenta' ? 'cuenta' : 'nuevo')
  const [nombre, setNombre] = useState('')
  const [apellido, setApellido] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [cargando, setCargando] = useState(false)
  // Mail al que se mandó la confirmación, cuando el alta queda esperando.
  const [mailEnviado, setMailEnviado] = useState('')

  const [menuOpen, setMenuOpen] = useState(false)
  const [categorias, setCategorias] = useState([])

  useEffect(() => {
    if (menuOpen) { document.body.style.overflow = 'hidden' } else { document.body.style.overflow = '' }
    return () => { document.body.style.overflow = '' }
  }, [menuOpen])

  useEffect(() => {
    async function cargar() {
      // Con sesión ya iniciada no hay nada que hacer acá: directo a next.
      const { data: { user } } = await supabase.auth.getUser()
      if (user) {
        router.replace(next)
        return
      }
      const { data } = await supabase.from('categorias').select('id, nombre, slug').eq('activa', true).order('orden')
      if (data) setCategorias(data)
    }
    cargar()
  }, [])

  function cambiarPestana(nueva) {
    setPestana(nueva)
    setError('')
  }

  // Después de entrar, adónde sigue lo decide destinoDespuesDeEntrar.
  async function seguir(user) {
    const destino = await destinoDespuesDeEntrar(supabase, user, next)
    router.push(destino)
    router.refresh()
  }

  const vueltaAlSitio = () => `${window.location.origin}/auth/callback?next=${encodeURIComponent(next)}`

  async function entrarConGoogle() {
    setError('')
    const { error: errorGoogle } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: { redirectTo: vueltaAlSitio() },
    })
    if (errorGoogle) setError('No pudimos conectar con Google. Probá de nuevo.')
  }

  async function crearCuenta(e) {
    e.preventDefault()
    setError('')

    const datos = {
      nombre: nombre.trim(),
      apellido: apellido.trim(),
      email: email.trim(),
    }

    if (!datos.nombre || !datos.apellido || !datos.email || !password) {
      setError('Completá nombre, apellido, mail y contraseña.')
      return
    }
    if (password.length < LARGO_MINIMO_CONTRASENA) {
      setError(`La contraseña tiene que tener ${LARGO_MINIMO_CONTRASENA} caracteres o más.`)
      return
    }

    setCargando(true)
    const { data, error: errorAlta } = await supabase.auth.signUp({
      email: datos.email,
      password,
      options: {
        data: { nombre: datos.nombre, apellido: datos.apellido },
        emailRedirectTo: vueltaAlSitio(),
      },
    })

    // Con la confirmación por mail activada, Supabase no devuelve error para un
    // mail que ya tiene cuenta: devuelve un usuario sin identidades.
    const yaExiste =
      errorAlta?.message?.toLowerCase().includes('already registered') ||
      (data?.user && Array.isArray(data.user.identities) && data.user.identities.length === 0)

    if (yaExiste) {
      setError('Ese mail ya tiene una cuenta. Entrá desde "Ya tengo cuenta".')
      setCargando(false)
      return
    }

    if (errorAlta) {
      setError('No pudimos crear la cuenta. Revisá los datos y probá de nuevo.')
      console.error('signUp:', errorAlta.message)
      setCargando(false)
      return
    }

    // Sin sesión: el alta espera que confirme el mail.
    if (!data?.session) {
      setMailEnviado(datos.email)
      setCargando(false)
      return
    }

    await seguir(data.user)
  }

  async function entrarConMail(e) {
    e.preventDefault()
    setError('')

    if (!email.trim() || !password) {
      setError('Escribí tu mail y tu contraseña.')
      return
    }

    setCargando(true)
    const { data, error: errorIngreso } = await supabase.auth.signInWithPassword({
      email: email.trim(),
      password,
    })

    if (errorIngreso) {
      const mensaje = errorIngreso.message || ''
      if (mensaje === 'Invalid login credentials') setError('Mail o contraseña incorrectos.')
      else if (mensaje.toLowerCase().includes('not confirmed')) setError('Todavía no confirmaste tu mail. Buscá el mail que te mandamos y abrilo desde este dispositivo.')
      else setError('No pudimos entrar. Probá de nuevo.')
      setCargando(false)
      return
    }

    await seguir(data.user)
  }

  const menuCats = MENU_CATEGORIAS.map((s) => categorias.find((c) => c.slug === s)).filter(Boolean)

  return (
    <>
      <link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Inter:wght@200;300;400;500;600;700;800;900&display=swap" />
      <link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Fraunces:opsz,wght@9..144,100..900&family=Poppins:wght@300;400;500&display=swap" />

      <div className="min-h-screen" style={{ backgroundColor: '#faf9f7', fontFamily: "'Inter', sans-serif" }}>
        {menuOpen && <MenuTakeover categorias={menuCats} onClose={() => setMenuOpen(false)} />}
        <Navbar onToggleMenu={() => setMenuOpen(!menuOpen)} variant="solid" />

        <div className="pt-24 pb-24 px-4">
          <div className="max-w-sm mx-auto">

            {errorAuth && <Aviso>No pudimos completar el ingreso. Probá de nuevo.</Aviso>}
            {motivoMp && (
              <Aviso tono="atencion">
                Se cerró tu sesión mientras estabas en MercadoPago, así que la conexión quedó sin terminar. Entrá de nuevo y volvé a tocar &quot;Conectar con MercadoPago&quot;.
              </Aviso>
            )}

            <h1 style={estiloTitulo}>Entrá a Bahía Shops</h1>
            <p style={{ ...estiloParrafo, margin: '10px 0 28px' }}>{textoSegunNext(next)}</p>

            {mailEnviado ? (
              <div className="rounded-lg border border-[#0a0a0a]/10 bg-white p-5">
                <p style={{ ...estiloParrafo, color: '#0a0a0a', margin: 0 }}>
                  Te mandamos un mail a <strong style={{ fontWeight: 500 }}>{mailEnviado}</strong> para confirmar tu cuenta. Abrilo desde este mismo dispositivo.
                </p>
              </div>
            ) : (
              <>
                {/* Google */}
                <button type="button" onClick={entrarConGoogle}
                  className={`${claseBotonNegro(true)} flex items-center justify-center gap-3`} style={estiloBoton}>
                  <span className="w-6 h-6 rounded-full bg-white flex items-center justify-center shrink-0">
                    <svg className="w-4 h-4" viewBox="0 0 24 24" aria-hidden="true">
                      <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z" fill="#4285F4"/>
                      <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
                      <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05"/>
                      <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/>
                    </svg>
                  </span>
                  Continuar con Google
                </button>

                {/* Separador */}
                <div className="flex items-center gap-4 my-6">
                  <div className="flex-1 h-px bg-[#0a0a0a]/10" />
                  <span className="text-xs text-[#0a0a0a]/40 font-light">o con tu mail</span>
                  <div className="flex-1 h-px bg-[#0a0a0a]/10" />
                </div>

                {/* Pestañas */}
                <div className="flex mb-6 border-b border-[#0a0a0a]/10" role="tablist">
                  {[['nuevo', 'Soy nuevo'], ['cuenta', 'Ya tengo cuenta']].map(([id, texto]) => {
                    const activa = pestana === id
                    return (
                      <button key={id} type="button" role="tab" aria-selected={activa} onClick={() => cambiarPestana(id)}
                        className={`flex-1 pb-3 text-sm cursor-pointer transition-colors -mb-px border-b-2 ${
                          activa ? 'border-[#4164fe] text-[#0a0a0a] font-medium' : 'border-transparent text-[#0a0a0a]/40 font-light hover:text-[#0a0a0a]/70'
                        }`}>
                        {texto}
                      </button>
                    )
                  })}
                </div>

                {pestana === 'nuevo' ? (
                  <form onSubmit={crearCuenta} noValidate>
                    <div className="grid grid-cols-2 gap-3 mb-4">
                      <div>
                        <label className={claseEtiqueta} htmlFor="nombre">Nombre</label>
                        <input id="nombre" type="text" autoComplete="given-name" value={nombre}
                          onChange={(e) => setNombre(e.target.value)} className={claseCampo} />
                      </div>
                      <div>
                        <label className={claseEtiqueta} htmlFor="apellido">Apellido</label>
                        <input id="apellido" type="text" autoComplete="family-name" value={apellido}
                          onChange={(e) => setApellido(e.target.value)} className={claseCampo} />
                      </div>
                    </div>
                    <div className="mb-4">
                      <label className={claseEtiqueta} htmlFor="mail-nuevo">Mail</label>
                      <input id="mail-nuevo" type="email" autoComplete="email" value={email}
                        onChange={(e) => setEmail(e.target.value)} className={claseCampo} />
                    </div>
                    <div className="mb-6">
                      <label className={claseEtiqueta} htmlFor="clave-nueva">Contraseña</label>
                      <input id="clave-nueva" type="password" autoComplete="new-password" value={password}
                        onChange={(e) => setPassword(e.target.value)} className={claseCampo} placeholder="Mínimo 8 caracteres" />
                    </div>

                    {error && <Aviso>{error}</Aviso>}

                    <button type="submit" disabled={cargando} className={claseBotonNegro(!cargando)} style={estiloBoton}>
                      {cargando ? 'Creando cuenta...' : 'Crear cuenta'}
                    </button>
                  </form>
                ) : (
                  <form onSubmit={entrarConMail} noValidate>
                    <div className="mb-4">
                      <label className={claseEtiqueta} htmlFor="mail-cuenta">Mail</label>
                      <input id="mail-cuenta" type="email" autoComplete="email" value={email}
                        onChange={(e) => setEmail(e.target.value)} className={claseCampo} />
                    </div>
                    <div className="mb-2">
                      <label className={claseEtiqueta} htmlFor="clave">Contraseña</label>
                      <input id="clave" type="password" autoComplete="current-password" value={password}
                        onChange={(e) => setPassword(e.target.value)} className={claseCampo} />
                    </div>
                    <div className="text-right mb-6">
                      <Link href="/recuperar-contrasena" className="text-xs text-[#4164fe] font-light hover:underline underline-offset-2">
                        Me olvidé la contraseña
                      </Link>
                    </div>

                    {error && <Aviso>{error}</Aviso>}

                    <button type="submit" disabled={cargando} className={claseBotonNegro(!cargando)} style={estiloBoton}>
                      {cargando ? 'Entrando...' : 'Entrar'}
                    </button>
                  </form>
                )}
              </>
            )}

            <p className="mt-8 text-[12px] text-[#0a0a0a]/45 font-light leading-relaxed">
              Con Google usamos tu nombre y tu mail para crear la cuenta. Tu nombre real no aparece en el sitio: ahí te ven con un apodo.{' '}
              <Link href="/terminos" className="text-[#4164fe] hover:underline underline-offset-2">Términos</Link>
              {' · '}
              <Link href="/privacidad" className="text-[#4164fe] hover:underline underline-offset-2">Privacidad</Link>
            </p>
          </div>
        </div>
      </div>
    </>
  )
}

export default function EntrarPage() {
  return (
    <Suspense fallback={<div className="min-h-screen" style={{ backgroundColor: '#faf9f7' }} />}>
      <EntrarContenido />
    </Suspense>
  )
}
