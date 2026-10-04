'use client'

import { useState, useEffect, Suspense } from 'react'
import { useSearchParams, useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { idsDisponibles, itemsNoDisponibles } from '@/lib/disponibilidad'
import {
  METODOS, ORDEN_METODOS, metodosParaComprador, metodosConfigurados,
  metodoPideDireccion, etiquetaMetodo, textoCostoEnvio,
} from '@/lib/metodosEntrega'
import {
  esDeBahia, codigoPostalValido, normalizarCodigoPostal, calleNumeroDepto, ciudadProvinciaCodigo,
} from '@/lib/direcciones'
import { useCarrito } from '@/context/CarritoContext'
import Navbar from '@/components/Navbar'
import MenuTakeover from '@/components/MenuTakeover'
import VolverAtras from '@/components/VolverAtras'
import FormularioDireccion from '@/components/FormularioDireccion'
import { rutaInterna } from '@/lib/rutas'
import { normalizarTelefonoAR, separarTelefonoAR, formatearTelefonoAR } from '@/lib/telefono'

const MENU_CATEGORIAS = [
  'moda', 'belleza-y-bienestar', 'joyeria-y-accesorios',
  'hogar-y-deco', 'artes-y-oficios', 'bebes-y-maternidad',
  'juegos-y-juguetes', 'mascotas', 'libros',
  'deporte', 'vintage',
]

// Los tres pasos del checkout, en orden.
const PASO_DATOS = 1
const PASO_ENTREGA = 2
const PASO_PAGAR = 3
const PASOS = ['Tus datos', 'Entrega', 'Pagar']

const soloDigitos = (v) => String(v ?? '').replace(/\D/g, '')

// Cómo va el celular que se está escribiendo, para la caja de abajo.
// Si es válido o no lo decide normalizarTelefonoAR; acá sólo se cuenta cuántos
// números faltan o sobran para el mensaje. Para contar se descartan el 54 y el
// 0 de adelante, que la regla ignora igual.
function estadoCelular(caracteristica, numero) {
  if (!soloDigitos(numero)) return { tipo: 'vacio' }

  const crudo = soloDigitos(caracteristica) + soloDigitos(numero)
  const normalizado = normalizarTelefonoAR(caracteristica + numero)

  if (normalizado) {
    // Si el resultado no está tal cual al final de lo que escribieron, la regla
    // sacó un 15 del medio.
    const saco15 = !crudo.endsWith(normalizado) && crudo.length - normalizado.length >= 2 && crudo.includes('15')
    // Para mostrarlo partido como lo escribió la persona.
    const caracteristicaSin0 = soloDigitos(caracteristica).replace(/^0/, '')
    const largo = caracteristicaSin0.length >= 2 && caracteristicaSin0.length <= 4 && normalizado.startsWith(caracteristicaSin0)
      ? caracteristicaSin0.length
      : undefined
    return { tipo: 'valido', telefono: normalizado, texto: formatearTelefonoAR(normalizado, largo), saco15 }
  }

  let contados = crudo
  if (contados.startsWith('54')) contados = contados.slice(2)
  if (contados.startsWith('0')) contados = contados.slice(1)

  if (contados.length < 10) return { tipo: 'faltan', cantidad: 10 - contados.length }
  return { tipo: 'sobran', cantidad: Math.max(contados.length - 10, 1) }
}

function CheckoutContenido() {
  const searchParams = useSearchParams()
  const router = useRouter()
  const supabase = createClient()
  const vendedorId = Number(searchParams.get('vendedor'))

  const { locales, subtotalLocal, quitar, actualizarPrecios, listo: carritoListo } = useCarrito()
  const local = locales.find((l) => l.vendedorId === vendedorId)
  // Firma de los items del local: cambia cuando se agrega o se saca algo.
  const firmaItems = (local?.items || []).map((it) => it.productoId).join(',')

  const [paso, setPaso] = useState(PASO_DATOS)

  // Paso 1: los datos de quien compra. datosCuenta son los que ya están
  // guardados y completos; el formulario se abre si falta algo o si tocan
  // "Cambiar".
  const [datosCuenta, setDatosCuenta] = useState(null)
  const [editandoDatos, setEditandoDatos] = useState(false)
  const [formNombre, setFormNombre] = useState('')
  const [formApellido, setFormApellido] = useState('')
  const [formCaracteristica, setFormCaracteristica] = useState('291')
  const [formNumero, setFormNumero] = useState('')
  const [guardandoDatos, setGuardandoDatos] = useState(false)
  const [errorDatos, setErrorDatos] = useState('')

  const [direcciones, setDirecciones] = useState([])
  const [direccionElegida, setDireccionElegida] = useState(null)
  const [mostrarFormDir, setMostrarFormDir] = useState(false)
  const [metodoElegido, setMetodoElegido] = useState(null)
  const [turno, setTurno] = useState('Indistinto')
  const [cargando, setCargando] = useState(true)
  const [pagando, setPagando] = useState(false)
  const [menuOpen, setMenuOpen] = useState(false)
  const [categorias, setCategorias] = useState([])

  // Ids del carrito que ya no se pueden comprar. Salen de la base al entrar y
  // se rehacen si el servidor rechaza el pago.
  const [idsCaidos, setIdsCaidos] = useState([])
  const [revisandoStock, setRevisandoStock] = useState(true)
  const [errorPago, setErrorPago] = useState('')
  // Aviso de que cambió un precio o el envío: no es un error, es que hay que
  // volver a mirar los números.
  const [avisoPrecios, setAvisoPrecios] = useState('')

  // Lo que la tienda configuró: métodos, precios y si muestra su dirección
  // (si no, el retiro se coordina con ella).
  const [entregaTienda, setEntregaTienda] = useState({ metodos_entrega_default: [], costos_envio_zona: {} })
  const [direccionVisibleTienda, setDireccionVisibleTienda] = useState(null)
  // La cotización de los envíos por zona para la dirección elegida, de
  // /api/envio/cotizar: { direccionId, envio_tienda, correo,
  // falta_codigo_postal }, cada método { estado, zona, costo } o null; con
  // error, { direccionId, error: true }. Si es de otra dirección, todavía no
  // llegó la de la elegida.
  const [cotizacion, setCotizacion] = useState(null)
  // Sube para volver a cotizar la misma dirección (después de guardarle el
  // código postal).
  const [vueltaCotizar, setVueltaCotizar] = useState(0)
  // Para cambiar de dirección cuando un envío no llega a la elegida (la
  // opción está deshabilitada y no abre las direcciones).
  const [mostrarDirecciones, setMostrarDirecciones] = useState(false)
  // El código postal que se le agrega a una dirección vieja para el correo.
  const [cpTexto, setCpTexto] = useState('')
  const [guardandoCp, setGuardandoCp] = useState(false)
  const [errorCp, setErrorCp] = useState('')

  useEffect(() => {
    if (menuOpen) { document.body.style.overflow = 'hidden' } else { document.body.style.overflow = '' }
    return () => { document.body.style.overflow = '' }
  }, [menuOpen])

  // ── Qué métodos ve quien compra ──
  // La regla es metodosParaComprador(), de src/lib/metodosEntrega.js: la
  // misma con la que el servidor valida. Acá sólo se decide cómo se ven.
  const metodosPorZona = metodosConfigurados(entregaTienda).filter((m) => m === 'envio_tienda' || m === 'correo')
  const cotizacionVigente = cotizacion && cotizacion.direccionId === direccionElegida ? cotizacion : null
  const cotizacionDe = (metodo) => (cotizacionVigente && !cotizacionVigente.error ? cotizacionVigente[metodo] : null)

  // Lo que se sabe de la dirección elegida para cada envío por zona:
  // undefined todavía no se sabe; null no llega o no se pudo calcular; 1..4 la
  // zona (con o sin precio: eso lo mira metodosParaComprador).
  function zonaSabida(metodo) {
    const c = cotizacionDe(metodo)
    if (!direccionElegida || !c) return undefined
    if (c.estado === 'ok' || c.estado === 'sin_precio') return c.zona
    if (c.estado === 'lejos' || c.estado === 'sin_zona') return null
    return undefined
  }
  const { disponibles, noDisponibles, respaldo } = metodosParaComprador(entregaTienda, {
    zonaTienda: zonaSabida('envio_tienda'),
    zonaCorreo: zonaSabida('correo'),
  })
  const visibles = ORDEN_METODOS.filter((id) => disponibles.includes(id) || noDisponibles.includes(id))
  const elegido = visibles.includes(metodoElegido) ? metodoElegido : null

  function costoEnvioActual() {
    const c = elegido ? cotizacionDe(elegido) : null
    return c?.estado === 'ok' ? c.costo : 0
  }

  const costoEnvio = costoEnvioActual()
  const subtotal = subtotalLocal(vendedorId)
  const total = subtotal + costoEnvio

  const metodoPideDir = !!elegido && metodoPideDireccion(elegido)
  // El respaldo "coordinar" que aparece porque ningún envío llega a esta
  // dirección: el servidor necesita la dirección para comprobarlo (no la
  // guarda).
  const respaldoPorDireccion = elegido === 'coordinar' && respaldo && noDisponibles.length > 0
  const envioListo = !metodosPorZona.includes(elegido) || cotizacionDe(elegido)?.estado === 'ok'
  // El correo necesita el código postal: a las direcciones viejas se les pide
  // acá mismo.
  const correoSinCp = elegido === 'correo' && cotizacionVigente?.falta_codigo_postal === true
  const entregaLista = !!elegido && disponibles.includes(elegido) &&
    (!metodoPideDir || !!direccionElegida) && envioListo && !correoSinCp

  const celular = estadoCelular(formCaracteristica, formNumero)
  const datosListos = !!formNombre.trim() && !!formApellido.trim() && celular.tipo === 'valido'

  useEffect(() => {
    async function cargar() {
      const { data: cats } = await supabase.from('categorias').select('id, nombre, slug').eq('activa', true).order('orden')
      if (cats) setCategorias(cats)

      // La sesión se pide al entrar, no al final: sin cuenta no hay a quién
      // guardarle los datos ni las direcciones. Vuelve acá mismo después de
      // entrar, con el vendedor en la query.
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) {
        const aca = rutaInterna(window.location.pathname + window.location.search, '/carrito')
        router.replace(`/entrar?next=${encodeURIComponent(aca)}`)
        return
      }

      // Los datos de la propia cuenta: la policy deja leer sólo la fila propia.
      const { data: cuenta } = await supabase
        .from('usuarios')
        .select('nombre, apellido, telefono')
        .eq('id', user.id)
        .maybeSingle()

      const nombre = cuenta?.nombre?.trim() || ''
      const apellido = cuenta?.apellido?.trim() || ''
      const telefono = normalizarTelefonoAR(cuenta?.telefono)

      setFormNombre(nombre)
      setFormApellido(apellido)
      if (telefono) {
        const partes = separarTelefonoAR(telefono)
        setFormCaracteristica(partes.caracteristica)
        setFormNumero(partes.numero)
      }

      if (nombre && apellido && telefono) {
        setDatosCuenta({ nombre, apellido, telefono })
      } else {
        setEditandoDatos(true)
      }

      const { data: dirs } = await supabase.from('direcciones').select('*').eq('usuario_id', user.id).order('creada_en')
      if (dirs && dirs.length > 0) {
        setDirecciones(dirs)
        const principal = dirs.find((d) => d.es_principal)
        setDireccionElegida(principal ? principal.id : dirs[0].id)
      }

      await cargarVendedor()
      setCargando(false)
    }
    cargar()
  }, [])

  // El carrito vive en el localStorage y no se entera de nada: un producto
  // pudo pausarse, borrarse, o su tienda pudo dejar de estar publicada. Se
  // revisa al entrar, antes de que la persona cargue una dirección y elija un
  // envío para nada. El servidor lo vuelve a revisar antes de cobrar.
  useEffect(() => {
    if (!carritoListo) return

    let cancelado = false
    async function revisarDisponibilidad() {
      // Sin local no hay nada que revisar: la pantalla de "no está en tu
      // carrito" se encarga.
      if (local) {
        const disponibles = await idsDisponibles(supabase, local.items.map((it) => it.productoId))
        if (cancelado) return
        setIdsCaidos(itemsNoDisponibles(local.items, disponibles).map((it) => Number(it.productoId)))
      }
      if (!cancelado) setRevisandoStock(false)
    }
    revisarDisponibilidad()
    return () => { cancelado = true }
  }, [carritoListo, vendedorId, firmaItems])

  // La cotización de los envíos por zona: cada vez que cambian la dirección,
  // los precios de la tienda o el código postal. La respuesta de una
  // dirección vieja no pisa la de la nueva; mientras no llega la de la
  // dirección elegida, se ve "Calculando..." (cotizacionVigente es null).
  const tienePorZona = metodosPorZona.length > 0
  useEffect(() => {
    if (!tienePorZona || !direccionElegida) return
    let cancelado = false
    async function cotizar() {
      try {
        const res = await fetch('/api/envio/cotizar', {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ vendedorId, direccionId: direccionElegida }),
        })
        const data = await res.json().catch(() => ({}))
        if (cancelado) return
        setCotizacion(res.ok
          ? { direccionId: direccionElegida, envio_tienda: data.envio_tienda ?? null, correo: data.correo ?? null, falta_codigo_postal: data.falta_codigo_postal === true }
          : { direccionId: direccionElegida, error: true })
      } catch {
        if (!cancelado) setCotizacion({ direccionId: direccionElegida, error: true })
      }
    }
    cotizar()
    return () => { cancelado = true }
  }, [tienePorZona, direccionElegida, vendedorId, entregaTienda, vueltaCotizar])

  // Le guarda el código postal a la dirección elegida (las viejas no lo
  // tienen) y vuelve a cotizar. La política deja editar sólo las propias.
  async function guardarCodigoPostal() {
    setErrorCp('')
    if (!codigoPostalValido(cpTexto)) {
      setErrorCp('Escribí 4 números (8000) o el código de 8 caracteres (B8000ABC).')
      return
    }
    setGuardandoCp(true)
    const { data, error } = await supabase
      .from('direcciones')
      .update({ codigo_postal: normalizarCodigoPostal(cpTexto) })
      .eq('id', direccionElegida)
      .select()
      .single()
    setGuardandoCp(false)
    if (error || !data) { setErrorCp('No pudimos guardar el código postal. Probá de nuevo.'); return }
    setDirecciones((actual) => actual.map((d) => (d.id === data.id ? data : d)))
    setCpTexto('')
    setVueltaCotizar((n) => n + 1)
  }

  function fmt(n) { return Number(n).toLocaleString('es-AR') }

  function alGuardarDireccion(nueva) {
    setDirecciones((actual) => [...actual, nueva])
    setDireccionElegida(nueva.id)
    setMostrarFormDir(false)
  }

  // Guarda los datos del formulario en la cuenta y, si salió bien, pasa a la
  // entrega. Si falla, el error queda arriba del botón y no se avanza.
  async function guardarDatos() {
    setGuardandoDatos(true)
    setErrorDatos('')
    try {
      const res = await fetch('/api/cuenta/datos', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          nombre: formNombre,
          apellido: formApellido,
          caracteristica: formCaracteristica,
          numero: formNumero,
        }),
      })
      const data = await res.json().catch(() => ({}))

      if (!res.ok) {
        setErrorDatos(data.error || 'No pudimos guardar tus datos. Probá de nuevo.')
        setGuardandoDatos(false)
        return
      }

      setDatosCuenta({ nombre: data.nombre, apellido: data.apellido, telefono: data.telefono })
      setEditandoDatos(false)
      setGuardandoDatos(false)
      setPaso(PASO_ENTREGA)
    } catch {
      setErrorDatos('No pudimos conectarnos. Revisá tu conexión y probá de nuevo.')
      setGuardandoDatos(false)
    }
  }

  // Los costos de envío del vendedor. Se recargan si el servidor avisa que el
  // envío cambió mientras la persona estaba en esta pantalla.
  async function cargarVendedor() {
    const { data: vendedor } = await supabase.from('vendedores').select('direccion_visible, metodos_entrega_default, costos_envio_zona').eq('id', vendedorId).single()
    if (vendedor) {
      setDireccionVisibleTienda(vendedor.direccion_visible)
      setEntregaTienda({
        metodos_entrega_default: vendedor.metodos_entrega_default || [],
        costos_envio_zona: vendedor.costos_envio_zona || {},
      })
    }
  }

  async function pagar() {
    setPagando(true)
    setErrorPago('')
    setAvisoPrecios('')
    try {
      const res = await fetch('/api/pedidos/crear', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        // El precio de cada ítem y el costo de envío van sólo para que el
        // servidor los compare con los suyos. El subtotal y el total ya no se
        // mandan: los calcula él.
        body: JSON.stringify({
          vendedorId: local.vendedorId,
          items: local.items,
          metodoEnvio: elegido,
          // Retiro y coordinar no usan dirección: no se manda, salvo en el
          // respaldo por dirección, donde el servidor la usa para comprobar
          // que la tienda no llega (y no la guarda).
          direccionId: metodoPideDir || respaldoPorDireccion ? direccionElegida : null,
          // La preferencia de turno sólo existe en los métodos que la piden.
          turnoPreferido: METODOS[elegido]?.pideTurno ? turno : null,
          costoEnvio,
        }),
      })
      const data = await res.json()

      // El servidor tiene la última palabra: si algo dejó de estar disponible
      // entre que entramos y apretamos pagar, se muestra la misma pantalla.
      if (data?.codigo === 'NO_DISPONIBLE') {
        setIdsCaidos(data.productos_no_disponibles || local.items.map((it) => Number(it.productoId)))
        setPagando(false)
        return
      }

      // Cambió un precio o el costo de envío desde que se armó el carrito. No
      // se cobró nada: se corrige lo que hay en pantalla y la persona vuelve a
      // confirmar con los números nuevos.
      // Al servidor le faltan nombre o teléfono (por ejemplo, se borraron en
      // otra pestaña): de vuelta al primer paso, con el formulario abierto.
      if (data?.codigo === 'faltan_datos') {
        setErrorDatos(data.error || '')
        setEditandoDatos(true)
        setPaso(PASO_DATOS)
        setPagando(false)
        return
      }

      if (data?.codigo === 'PRECIO_CAMBIO') {
        await aplicarCambiosDePrecio(data)
        setPagando(false)
        return
      }

      if (!res.ok) { setErrorPago(data.error || 'No se pudo procesar el pago. Probá de nuevo.'); setPagando(false); return }
      window.location.href = data.checkout_url
    } catch { setErrorPago('No pudimos conectarnos. Revisá tu conexión y probá de nuevo.'); setPagando(false) }
  }

  // Actualiza el carrito con los precios que confirmó el servidor y arma el
  // aviso que se le muestra a la persona.
  async function aplicarCambiosDePrecio(data) {
    const cambios = data.cambios || []

    if (cambios.length > 0) {
      const precios = {}
      cambios.forEach((c) => { precios[c.producto_id] = c.precio_nuevo })
      actualizarPrecios(local.vendedorId, precios)
    }

    // El envío se recalcula solo al recargar los costos del vendedor.
    if (data.envio) await cargarVendedor()

    // El aviso nombra a la tienda: el precio lo cambió el vendedor, no la
    // plataforma, y sin decirlo queda la sospecha de que fuimos nosotros.
    const tienda = local.vendedorNombre || 'La tienda'

    const textos = cambios.map((c) => (
      c.precio_anterior === null
        ? `${tienda} cambió el precio de "${c.nombre}": ahora $${fmt(c.precio_nuevo)}.`
        : `${tienda} cambió el precio de "${c.nombre}": antes $${fmt(c.precio_anterior)}, ahora $${fmt(c.precio_nuevo)}.`
    ))

    if (data.envio) {
      textos.push(
        data.envio.anterior === null
          ? `${tienda} cambió el costo de envío: ahora $${fmt(data.envio.nuevo)}.`
          : `${tienda} cambió el costo de envío: antes $${fmt(data.envio.anterior)}, ahora $${fmt(data.envio.nuevo)}.`
      )
    }

    textos.push('Actualizamos tu carrito. Revisá el total y volvé a confirmar.')
    setAvisoPrecios(textos.join(' '))
  }

  // Saca del carrito lo que ya no está y sigue con el resto. Si no queda nada
  // de este local, no hay checkout que hacer: vuelve al carrito.
  function quitarCaidos() {
    const quedan = local.items.filter((it) => !idsCaidos.includes(Number(it.productoId)))
    idsCaidos.forEach((id) => quitar(local.vendedorId, id))
    setIdsCaidos([])
    if (quedan.length === 0) router.push('/carrito')
  }

  const menuCats = MENU_CATEGORIAS.map(s => categorias.find(c => c.slug === s)).filter(Boolean)

  if (cargando || !carritoListo || revisandoStock) {
    return (
      <>
        <link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Inter:wght@200;300;400;500;600;700;800;900&display=swap" />
        <div className="min-h-screen bg-white flex items-center justify-center" style={{ fontFamily: "'Inter', sans-serif" }}>
          <span className="text-[#0a0a0a]/30 text-sm font-light">Cargando...</span>
        </div>
      </>
    )
  }

  if (!local) {
    return (
      <>
        <link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Inter:wght@200;300;400;500;600;700;800;900&display=swap" />
        <div className="min-h-screen bg-white" style={{ fontFamily: "'Inter', sans-serif" }}>
          <Navbar onToggleMenu={() => setMenuOpen(!menuOpen)} variant="solid" />
          {menuOpen && <MenuTakeover categorias={menuCats} onClose={() => setMenuOpen(false)} />}
          <div className="pt-20 px-4 text-center">
            <p className="text-[#0a0a0a]/40 font-light mt-8">No encontramos ese local en tu carrito.</p>
            <button onClick={() => router.push('/carrito')} className="mt-4 bg-[#0a0a0a] text-white px-6 py-3 rounded-full text-sm font-medium hover:bg-[#2a2a2a] transition cursor-pointer">
              Volver al carrito
            </button>
          </div>
        </div>
      </>
    )
  }

  // ═══ ALGO DEL PEDIDO YA NO ESTÁ ═══
  // Reemplaza al checkout entero: no tiene sentido elegir envío para algo que
  // no se puede comprar. No decimos por qué —si el vendedor está bloqueado eso
  // es asunto nuestro y de él—, sólo que ya no está disponible.
  if (idsCaidos.length > 0) {
    const caidos = local.items.filter((it) => idsCaidos.includes(Number(it.productoId)))
    const quedan = local.items.filter((it) => !idsCaidos.includes(Number(it.productoId)))
    const todos = quedan.length === 0

    return (
      <>
        <link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Inter:wght@200;300;400;500;600;700;800;900&display=swap" />
        <link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Fraunces:opsz,wght@9..144,100..900&family=Poppins:wght@300;400;500&display=swap" />

        <div className="min-h-screen bg-white" style={{ fontFamily: "'Inter', sans-serif" }}>
          {menuOpen && <MenuTakeover categorias={menuCats} onClose={() => setMenuOpen(false)} />}
          <Navbar onToggleMenu={() => setMenuOpen(!menuOpen)} variant="solid" />

          <div className="pt-20 pb-24 px-4 md:px-8">
            <div className="max-w-xl mx-auto">
              <VolverAtras href="/carrito" texto="Volver al carrito" />

              <h1 className="text-[24px] md:text-[28px]" style={{ fontFamily: 'Fraunces, serif', fontWeight: 500, color: '#0a0a0a', marginTop: '8px', marginBottom: '8px' }}>
                {caidos.length === 1 ? 'Este producto ya no está disponible' : 'Estos productos ya no están disponibles'}
              </h1>
              <p style={{ fontFamily: 'Poppins, sans-serif', fontWeight: 300, fontSize: '14px', color: 'rgba(10,10,10,0.5)', lineHeight: 1.7, marginBottom: '24px' }}>
                {todos
                  ? 'Lo que tenías en el carrito de este local dejó de estar a la venta, así que no podemos completar la compra.'
                  : caidos.length === 1
                    ? 'Dejó de estar a la venta mientras lo tenías en el carrito. Sacalo y seguí con el resto del pedido.'
                    : 'Dejaron de estar a la venta mientras los tenías en el carrito. Sacalos y seguí con el resto del pedido.'}
              </p>

              <div className="rounded-2xl border border-[#0a0a0a]/5 overflow-hidden mb-6">
                {caidos.map((item) => (
                  <div key={item.productoId} className="flex items-center gap-3 p-4 border-b border-[#0a0a0a]/5 last:border-b-0">
                    <div className="w-14 h-14 rounded-xl bg-[#ECEAE3] shrink-0 overflow-hidden opacity-40">
                      {item.foto && <img src={item.foto} alt="" className="w-full h-full object-cover" />}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-[#0a0a0a]/40 truncate line-through m-0">{item.nombre}</p>
                      {item.variante && <p className="text-xs text-[#0a0a0a]/25 font-light mt-0.5 m-0">{item.variante}</p>}
                    </div>
                    <span
                      className="shrink-0"
                      style={{ fontSize: '11px', fontWeight: 500, color: 'rgba(10,10,10,0.5)', backgroundColor: 'rgba(10,10,10,0.05)', borderRadius: '999px', padding: '4px 10px' }}
                    >
                      Ya no está disponible
                    </span>
                  </div>
                ))}
              </div>

              <div className="flex gap-3 flex-wrap">
                <button
                  type="button"
                  onClick={quitarCaidos}
                  className="bg-[#0a0a0a] text-white border border-[#0a0a0a] hover:bg-transparent hover:text-[#0a0a0a] transition-colors cursor-pointer"
                  style={{ fontFamily: "'Inter', sans-serif", fontWeight: 500, fontSize: '14px', borderRadius: '4px', padding: '14px 28px' }}
                >
                  {todos
                    ? (caidos.length === 1 ? 'Quitarlo del carrito' : 'Quitarlos del carrito')
                    : 'Quitar y seguir con el resto'}
                </button>
                <button
                  type="button"
                  onClick={() => router.push('/carrito')}
                  className="bg-white text-[#0a0a0a] border border-[#0a0a0a]/15 hover:border-[#0a0a0a] transition-colors cursor-pointer"
                  style={{ fontFamily: "'Inter', sans-serif", fontWeight: 500, fontSize: '14px', borderRadius: '4px', padding: '14px 28px' }}
                >
                  Volver al carrito
                </button>
              </div>
            </div>
          </div>
        </div>
      </>
    )
  }

  // Cómo se ve cada método. Cuáles se ofrecen ya lo decidió
  // metodosParaComprador() más arriba.
  const tienda = local.vendedorNombre || 'La tienda'
  const dirElegida = direcciones.find((d) => d.id === direccionElegida)
  const sinDireccionVisible = direccionVisibleTienda === false

  function vistaMetodo(id) {
    const def = METODOS[id]
    const base = {
      id,
      label: etiquetaMetodo(id, 'comprador', { direccionVisible: direccionVisibleTienda }),
      sub: def.detalleComprador,
      deshabilitado: noDisponibles.includes(id),
      pideDireccion: def.pideDireccion,
      pideTurno: def.pideTurno,
    }

    if (id === 'retiro') {
      return { ...base, sub: sinDireccionVisible ? def.detalleCompradorSinDireccion : def.detalleComprador, costoLabel: 'Gratis' }
    }

    // Envío de la tienda y correo: lo que diga la cotización del servidor. A
    // quien compra nunca se le muestran la distancia ni la zona.
    if (id === 'envio_tienda' || id === 'correo') {
      const c = cotizacionDe(id)
      // "a Punta Alta" cuando la dirección es de otra ciudad.
      const destino = dirElegida && !esDeBahia(dirElegida) && dirElegida.ciudad ? dirElegida.ciudad : null
      const etiquetaPrecio = id === 'envio_tienda' ? 'Envío a tu zona' : (destino ? `Envío a ${destino}` : 'Envío por correo')
      let costoLabel = 'Según tu dirección'
      let sub = id === 'correo' && destino ? `A ${destino}` : base.sub
      if (direccionElegida && !cotizacionVigente) costoLabel = 'Calculando...'
      else if (cotizacionVigente?.error) costoLabel = 'No pudimos calcular'
      else if (c?.estado === 'ok') costoLabel = c.costo === 0 ? 'Envío gratis' : `${etiquetaPrecio}: $${fmt(c.costo)}`
      else if (c?.estado === 'sin_precio' || c?.estado === 'lejos') {
        costoLabel = 'No llega'
        const donde = destino ? `a ${destino}` : 'a tu dirección'
        sub = id === 'correo' ? `${tienda} no envía por correo ${donde}` : `${tienda} no llega ${donde}`
      }
      else if (c?.estado === 'sin_zona') {
        costoLabel = 'No disponible'
        sub = dirElegida && (dirElegida.lat == null || dirElegida.lng == null)
          ? 'Tu dirección no está ubicada en el mapa: no podemos calcular el envío'
          : 'No pudimos calcular el envío a tu dirección'
      }
      return { ...base, sub, costoLabel }
    }

    // coordinar
    let sub = def.detalleComprador
    if (respaldo) {
      sub = noDisponibles.length > 0
        ? `${tienda} no llega a tu dirección: arreglan la entrega por WhatsApp`
        : def.detalleCompradorRespaldo
    }
    return { ...base, sub, costoLabel: 'A coordinar' }
  }

  const metodos = visibles.map(vistaMetodo)
  const metodoActual = metodos.find((m) => m.id === elegido)
  // Las direcciones se muestran con un método que las pide, o cuando un envío
  // no llega a la elegida y se quiere probar con otra.
  const verDirecciones = metodoActual?.pideDireccion || (mostrarDirecciones && noDisponibles.length > 0)
  // Estilos del paso "Tus datos": los mismos del resto del sitio.
  const estiloTitulo = { fontFamily: 'Fraunces, serif', fontWeight: 500, fontSize: '24px', color: '#0a0a0a', letterSpacing: '-0.02em', marginBottom: '6px' }
  const estiloParrafo = { fontFamily: 'Poppins, sans-serif', fontWeight: 300, fontSize: '14px', color: 'rgba(10,10,10,0.5)', lineHeight: 1.6 }
  const estiloBoton = { fontFamily: "'Inter', sans-serif", fontWeight: 500, fontSize: '14px', borderRadius: '4px', padding: '14px 28px' }
  const claseEtiqueta = 'block text-sm text-[#0a0a0a]/40 font-light mb-1.5'
  const claseCampo = 'w-full px-4 py-3 rounded-xl border text-sm text-[#0a0a0a] focus:outline-none transition bg-white'
  const bordeNormal = 'border-[#0a0a0a]/10 focus:border-[#0a0a0a]/30'
  const numeroConError = celular.tipo === 'faltan' || celular.tipo === 'sobran'

  function claseBotonNegro(habilitado) {
    return `w-full transition-colors border ${
      habilitado
        ? 'bg-[#0a0a0a] text-white border-[#0a0a0a] hover:bg-transparent hover:text-[#0a0a0a] cursor-pointer'
        : 'bg-[#0a0a0a]/10 text-[#0a0a0a]/20 border-transparent cursor-not-allowed'
    }`
  }

  return (
    <>
      <link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Inter:wght@200;300;400;500;600;700;800;900&display=swap" />
      <link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Fraunces:opsz,wght@9..144,100..900&family=Poppins:wght@300;400;500&display=swap" />
      <div className="min-h-screen bg-white" style={{ fontFamily: "'Inter', sans-serif" }}>
        {menuOpen && <MenuTakeover categorias={menuCats} onClose={() => setMenuOpen(false)} />}
        <Navbar onToggleMenu={() => setMenuOpen(!menuOpen)} variant="solid" />

        <div className="pt-20 pb-24 px-4 md:px-8">
          <div className="max-w-xl mx-auto">

            {/* Progreso: tres barritas, la activa en azul */}
            <div className="flex gap-2 mb-8">
              {PASOS.map((nombre, i) => {
                const num = i + 1
                const activo = num === paso
                const listo = num < paso
                return (
                  <div key={nombre} className="flex-1">
                    <div
                      className="h-1 rounded-full"
                      style={{ backgroundColor: activo ? '#4164fe' : listo ? '#0a0a0a' : 'rgba(10,10,10,0.1)' }}
                    />
                    <span className={`block mt-2 text-xs ${activo ? 'text-[#0a0a0a] font-medium' : 'text-[#0a0a0a]/30 font-light'}`}>
                      {num} · {nombre}
                    </span>
                  </div>
                )
              })}
            </div>

            {/* ═══ PASO 1: TUS DATOS ═══ */}
            {paso === PASO_DATOS && (
              <div>
                <h2 style={estiloTitulo}>Tus datos para esta compra</h2>

                {!editandoDatos && datosCuenta ? (
                  <>
                    <div className="rounded-2xl border border-[#0a0a0a]/5 p-5 mt-4 mb-6 flex items-start justify-between gap-4">
                      <div>
                        <p className="m-0 text-sm font-medium text-[#0a0a0a]">{datosCuenta.nombre} {datosCuenta.apellido}</p>
                        <p className="m-0 mt-1 text-sm text-[#0a0a0a]/50 font-light">{formatearTelefonoAR(datosCuenta.telefono)}</p>
                      </div>
                      <button
                        type="button"
                        onClick={() => { setErrorDatos(''); setEditandoDatos(true) }}
                        className="text-sm text-[#0a0a0a] font-medium underline underline-offset-2 cursor-pointer shrink-0"
                      >
                        Cambiar
                      </button>
                    </div>

                    <button type="button" onClick={() => setPaso(PASO_ENTREGA)} className={claseBotonNegro(true)} style={estiloBoton}>
                      Seguir a la entrega
                    </button>
                  </>
                ) : (
                  <>
                    <p style={{ ...estiloParrafo, marginBottom: '24px' }}>
                      Estos datos sólo los verá el vendedor y los usará para comunicarse con vos y/o completar tus pedidos.
                    </p>

                    <div className="grid grid-cols-2 gap-3 mb-4">
                      <div>
                        <label className={claseEtiqueta}>Nombre</label>
                        <input type="text" value={formNombre} maxLength={60} autoComplete="given-name"
                          onChange={(e) => setFormNombre(e.target.value)} className={`${claseCampo} ${bordeNormal}`} />
                      </div>
                      <div>
                        <label className={claseEtiqueta}>Apellido</label>
                        <input type="text" value={formApellido} maxLength={60} autoComplete="family-name"
                          onChange={(e) => setFormApellido(e.target.value)} className={`${claseCampo} ${bordeNormal}`} />
                      </div>
                    </div>

                    <label className={claseEtiqueta}>Celular con WhatsApp</label>
                    <div className="flex gap-2 items-stretch">
                      <span className="px-3 flex items-center rounded-xl border border-[#0a0a0a]/10 bg-[#F5F2EC] text-sm text-[#0a0a0a]/40 font-light shrink-0">
                        +54 9
                      </span>
                      <input type="tel" inputMode="numeric" value={formCaracteristica} maxLength={5} aria-label="Característica"
                        onChange={(e) => setFormCaracteristica(soloDigitos(e.target.value))}
                        className={`${claseCampo} ${bordeNormal} !w-20 shrink-0 text-center`} />
                      <input type="tel" inputMode="numeric" value={formNumero} maxLength={12} aria-label="Número" autoComplete="tel-local"
                        onChange={(e) => setFormNumero(soloDigitos(e.target.value))}
                        className={`${claseCampo} flex-1 min-w-0 ${numeroConError ? 'border-red-400 focus:border-red-500' : bordeNormal}`} />
                    </div>
                    <div className="flex justify-between mt-1.5 text-[11px] text-[#0a0a0a]/35 font-light">
                      <span>Característica sin el 0</span>
                      <span>Número sin el 15</span>
                    </div>

                    {/* Cómo lo va a ver el vendedor, mientras se escribe */}
                    <div className={`mt-3 p-3 rounded-lg text-sm font-light ${
                      celular.tipo === 'valido' ? 'bg-green-50 text-green-800'
                        : numeroConError ? 'bg-red-50 text-red-700'
                          : 'bg-[#0a0a0a]/[0.04] text-[#0a0a0a]/50'
                    }`}>
                      {celular.tipo === 'vacio' && 'Escribí tu número y te mostramos cómo lo va a ver el vendedor.'}
                      {celular.tipo === 'faltan' && `Faltan ${celular.cantidad} ${celular.cantidad === 1 ? 'número' : 'números'}. Entre característica y número son 10.`}
                      {celular.tipo === 'sobran' && `Sobran ${celular.cantidad} ${celular.cantidad === 1 ? 'número' : 'números'}. ¿Pusiste el 0 o el 15?`}
                      {celular.tipo === 'valido' && `Así lo va a ver el vendedor: ${celular.texto}${celular.saco15 ? ' (le sacamos el 15)' : ''}`}
                    </div>

                    <p className="mt-4 mb-6 text-xs text-[#0a0a0a]/40 font-light">
                      Se guardan en tu cuenta: la próxima vez ya aparecen completos.
                    </p>

                    {errorDatos && (
                      <div className="mb-3 p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-800">
                        {errorDatos}
                      </div>
                    )}

                    <button type="button" disabled={!datosListos || guardandoDatos} onClick={guardarDatos}
                      className={claseBotonNegro(datosListos && !guardandoDatos)} style={estiloBoton}>
                      {guardandoDatos ? 'Guardando...' : 'Seguir a la entrega'}
                    </button>
                  </>
                )}
              </div>
            )}

            {/* ═══ PASO 2: ENTREGA ═══ */}
            {paso === PASO_ENTREGA && (
              <div>
                <h2 className="text-xl font-black text-[#0a0a0a] tracking-tight mb-1">¿Cómo lo recibís?</h2>
                <p className="text-sm text-[#0a0a0a]/30 font-light mb-6">Comprando en {local.vendedorNombre}.</p>

                {/* Métodos */}
                <div className="mb-6">
                  {metodos.map((m) => {
                    const sel = elegido === m.id
                    // Deshabilitada: se ve, pero no se elige. Si ya estaba
                    // elegida (se cambió la dirección), queda marcada para que
                    // se pueda volver a cambiar la dirección.
                    const bloqueada = m.deshabilitado && !sel
                    return (
                      <div key={m.id}>
                        <div
                          onClick={() => { if (!bloqueada) setMetodoElegido(m.id) }}
                          aria-disabled={m.deshabilitado}
                          className={`flex items-center gap-3 p-4 rounded-xl mb-2 transition ${
                            bloqueada ? 'cursor-not-allowed opacity-60' : 'cursor-pointer'
                          } ${
                            sel ? 'border-2 border-[#0a0a0a]' : 'border border-[#0a0a0a]/10 hover:border-[#0a0a0a]/20'
                          }`}
                        >
                          <div className={`w-4 h-4 rounded-full border-[1.5px] flex items-center justify-center shrink-0 ${sel ? 'border-[#0a0a0a]' : 'border-[#0a0a0a]/20'}`}>
                            {sel && <div className="w-2 h-2 rounded-full bg-[#0a0a0a]" />}
                          </div>
                          <div className="flex-1">
                            <div className="text-sm font-medium text-[#0a0a0a]">{m.label}</div>
                            {m.sub && <div className={`text-xs font-light ${m.deshabilitado ? 'text-red-700/70' : 'text-[#0a0a0a]/30'}`}>{m.sub}</div>}
                          </div>
                          <span className={`text-sm font-light text-right ${m.costoLabel === 'Gratis' || m.costoLabel === 'Envío gratis' ? 'text-green-600' : 'text-[#0a0a0a]/60'}`}>{m.costoLabel}</span>
                        </div>

                        {/* Un envío que no llega: se puede probar otra dirección */}
                        {bloqueada && (m.id === 'envio_tienda' || m.id === 'correo') && !verDirecciones && (
                          <button type="button" onClick={() => setMostrarDirecciones(true)}
                            className="ml-10 -mt-1 mb-3 text-xs text-[#0a0a0a]/50 underline underline-offset-2 cursor-pointer bg-transparent border-none p-0">
                            Probar con otra dirección
                          </button>
                        )}

                        {/* Correo con una dirección vieja sin código postal: se pide acá */}
                        {sel && m.id === 'correo' && correoSinCp && !m.deshabilitado && (
                          <div className="ml-10 mb-3 p-3 bg-amber-50 rounded-lg">
                            <label className="block text-xs text-amber-800 font-light mb-2">
                              Para enviar por correo necesitamos el código postal de esta dirección.
                            </label>
                            <div className="flex gap-2">
                              <input type="text" value={cpTexto} maxLength={10} placeholder="8000 o B8000ABC"
                                onChange={(e) => { setErrorCp(''); setCpTexto(e.target.value) }}
                                className="flex-1 min-w-0 px-3 py-2 rounded-lg border border-amber-200 text-sm bg-white focus:outline-none focus:border-amber-400" />
                              <button type="button" onClick={guardarCodigoPostal} disabled={guardandoCp}
                                className="px-4 py-2 rounded-lg bg-[#0a0a0a] text-white text-sm cursor-pointer disabled:opacity-40">
                                {guardandoCp ? 'Guardando...' : 'Guardar'}
                              </button>
                            </div>
                            {errorCp && <p className="mt-2 mb-0 text-xs text-red-700">{errorCp}</p>}
                          </div>
                        )}

                        {sel && m.deshabilitado && (
                          <div className="ml-10 mb-3 p-3 bg-red-50 rounded-lg text-xs text-red-700">
                            {m.sub}. Elegí otra dirección u otra forma de entrega.
                          </div>
                        )}
                      </div>
                    )
                  })}
                </div>

                {/* Turno */}
                {metodoActual?.pideTurno && (
                  <div className="mb-6">
                    <label className="block text-sm text-[#0a0a0a]/40 font-light mb-2">¿Cuándo te queda mejor?</label>
                    <div className="flex gap-2">
                      {['Mañana', 'Tarde', 'Indistinto'].map((t) => (
                        <button key={t} type="button" onClick={() => setTurno(t)} className={`flex-1 py-2.5 rounded-full text-sm cursor-pointer transition ${turno === t ? 'bg-[#0a0a0a] text-white font-medium' : 'border border-[#0a0a0a]/10 text-[#0a0a0a]/40 font-light'}`}>
                          {t}
                        </button>
                      ))}
                    </div>
                    <p className="text-[10px] text-[#0a0a0a]/20 font-light mt-2">Es una preferencia; el vendedor la usa para coordinar.</p>
                  </div>
                )}

                {/* Dirección */}
                {verDirecciones && (
                  <div className="mb-6">
                    <label className="block text-sm text-[#0a0a0a]/40 font-light mb-3">¿A dónde lo enviamos?</label>

                    {direcciones.length === 0 && !mostrarFormDir ? (
                      <div className="border border-[#0a0a0a]/10 rounded-2xl p-4">
                        <p className="text-sm text-[#0a0a0a]/30 font-light mb-3">Es tu primera compra. Cargá una dirección.</p>
                        <FormularioDireccion esPrimera={true} onGuardada={alGuardarDireccion} />
                      </div>
                    ) : (
                      <>
                        {direcciones.map((dir) => {
                          const sel = direccionElegida === dir.id
                          return (
                            <div key={dir.id} onClick={() => setDireccionElegida(dir.id)} className={`flex gap-3 items-start p-4 rounded-xl cursor-pointer mb-2 transition ${sel ? 'border-2 border-[#0a0a0a]' : 'border border-[#0a0a0a]/10'}`}>
                              <div className={`w-4 h-4 rounded-full border-[1.5px] flex items-center justify-center shrink-0 mt-0.5 ${sel ? 'border-[#0a0a0a]' : 'border-[#0a0a0a]/20'}`}>
                                {sel && <div className="w-2 h-2 rounded-full bg-[#0a0a0a]" />}
                              </div>
                              <div>
                                <div className="flex items-center gap-2">
                                  <span className="text-sm font-medium text-[#0a0a0a]">{dir.etiqueta || 'Sin etiqueta'}</span>
                                  {dir.es_principal && <span className="text-[10px] bg-[#F5F2EC] text-[#0a0a0a]/50 px-2 py-0.5 rounded-full font-light">Principal</span>}
                                  {(dir.lat == null || dir.lng == null) && <span className="text-[10px] bg-amber-50 text-amber-600 px-2 py-0.5 rounded-full font-light">Sin ubicar en el mapa</span>}
                                </div>
                                <p className="text-xs text-[#0a0a0a]/40 font-light mt-1">
                                  {[calleNumeroDepto(dir), ciudadProvinciaCodigo(dir), `Tel. ${dir.telefono}`].filter(Boolean).join(' · ')}
                                </p>
                              </div>
                            </div>
                          )
                        })}

                        {mostrarFormDir ? (
                          <div className="border border-[#0a0a0a]/10 rounded-2xl p-4 mt-2">
                            <FormularioDireccion esPrimera={direcciones.length === 0} onGuardada={alGuardarDireccion} onCancelar={() => setMostrarFormDir(false)} />
                          </div>
                        ) : (
                          <button type="button" onClick={() => setMostrarFormDir(true)} className="w-full py-3 border border-dashed border-[#0a0a0a]/15 rounded-xl text-sm text-[#0a0a0a]/40 font-light cursor-pointer hover:border-[#0a0a0a]/30 transition">
                            + Usar otra dirección
                          </button>
                        )}
                      </>
                    )}
                    <p className="text-[10px] text-[#0a0a0a]/20 font-light mt-2">Tus datos se comparten solo con {local.vendedorNombre}, solo para este pedido.</p>
                  </div>
                )}

                {elegido === 'coordinar' && (
                  <div className="flex gap-3 items-start bg-[#F5F2EC] rounded-xl p-4 mb-4">
                    <span className="text-sm">💬</span>
                    <p className="text-xs text-[#0a0a0a]/40 font-light leading-relaxed">Pagás solo los productos ahora. La entrega la coordinás con {local.vendedorNombre} por WhatsApp después.</p>
                  </div>
                )}

                <button type="button" disabled={!entregaLista} onClick={() => setPaso(PASO_PAGAR)} className={`w-full py-3.5 rounded-full text-sm font-medium transition cursor-pointer mt-2 ${entregaLista ? 'bg-[#0a0a0a] text-white hover:bg-[#2a2a2a]' : 'bg-[#0a0a0a]/10 text-[#0a0a0a]/20 cursor-not-allowed'}`}>
                  Continuar
                </button>
              </div>
            )}

            {/* ═══ PASO 3: PAGAR ═══ */}
            {paso === PASO_PAGAR && (
              <div>
                <VolverAtras href="#" texto="Volver a entrega" />
                <div className="-mt-4 mb-6" onClick={(e) => { e.preventDefault(); setPaso(PASO_ENTREGA) }} />

                <button type="button" onClick={() => setPaso(PASO_ENTREGA)} className="text-sm text-[#0a0a0a]/30 font-light mb-6 flex items-center gap-2 cursor-pointer hover:text-[#0a0a0a] transition">
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M10.5 19.5 3 12m0 0 7.5-7.5M3 12h18" />
                  </svg>
                  Volver a entrega
                </button>

                <h2 className="text-xl font-black text-[#0a0a0a] tracking-tight mb-4">Revisá tu compra</h2>

                {/* Productos */}
                <div className="rounded-2xl border border-[#0a0a0a]/5 p-5 mb-3">
                  <div className="font-medium text-sm text-[#0a0a0a] mb-3">{local.vendedorNombre}</div>
                  {local.items.map((item) => (
                    <div key={item.productoId + (item.variante || '')} className="flex justify-between py-2 border-t border-[#0a0a0a]/5 text-sm">
                      <span className="text-[#0a0a0a]/50 font-light">{item.nombre}{item.variante ? ` · ${item.variante}` : ''} × {item.cantidad}</span>
                      <span className="text-[#0a0a0a]">${fmt(item.precio * item.cantidad)}</span>
                    </div>
                  ))}
                </div>

                {/* Entrega */}
                <div className="rounded-2xl border border-[#0a0a0a]/5 p-5 mb-3">
                  <div className="font-medium text-sm text-[#0a0a0a] mb-2">Entrega</div>
                  <p className="text-sm text-[#0a0a0a]/50 font-light">{metodoActual?.label}</p>
                  {metodoActual?.pideTurno && <p className="text-xs text-[#0a0a0a]/30 font-light mt-1">Preferencia: {turno.toLowerCase()}</p>}
                  {metodoPideDir && dirElegida && (
                    <p className="text-xs text-[#0a0a0a]/40 font-light mt-2">
                      {[calleNumeroDepto(dirElegida), ciudadProvinciaCodigo(dirElegida), `Tel. ${dirElegida.telefono}`].filter(Boolean).join(' · ')}
                    </p>
                  )}
                </div>

                {/* Totales */}
                <div className="rounded-2xl border border-[#0a0a0a]/5 p-5 mb-6">
                  <div className="flex justify-between text-sm py-1">
                    <span className="text-[#0a0a0a]/40 font-light">Productos</span>
                    <span className="text-[#0a0a0a]">${fmt(subtotal)}</span>
                  </div>
                  <div className="flex justify-between text-sm py-1">
                    <span className="text-[#0a0a0a]/40 font-light">
                      {elegido === 'envio_tienda' ? 'Envío a tu zona' : elegido === 'correo' ? 'Envío por correo' : 'Envío'}
                    </span>
                    <span className="text-[#0a0a0a]">{elegido === 'retiro' ? 'Gratis' : textoCostoEnvio(elegido, costoEnvio)}</span>
                  </div>
                  <div className="flex justify-between text-base font-black text-[#0a0a0a] pt-3 mt-1 border-t border-[#0a0a0a]/5">
                    <span>Total</span>
                    <span>${fmt(total)}</span>
                  </div>
                </div>

                {avisoPrecios && (
                  <div className="mb-3 p-3 bg-amber-50 border border-amber-200 rounded-lg text-sm text-amber-900">
                    {avisoPrecios}
                  </div>
                )}

                {errorPago && (
                  <div className="mb-3 p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-800">
                    {errorPago}
                  </div>
                )}

                <button type="button" disabled={pagando} onClick={pagar} className={`w-full py-3.5 rounded-full text-sm font-medium transition cursor-pointer ${pagando ? 'bg-[#0a0a0a]/30 text-white cursor-not-allowed' : 'bg-[#009ee3] text-white hover:bg-[#0087c7]'}`}>
                  {pagando ? 'Procesando...' : 'Pagar con MercadoPago'}
                </button>
              </div>
            )}
          </div>
        </div>
      </div>
    </>
  )
}

export default function CheckoutPage() {
  return (
    <Suspense fallback={
      <>
        <link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Inter:wght@200;300;400;500;600;700;800;900&display=swap" />
        <div className="min-h-screen bg-white flex items-center justify-center" style={{ fontFamily: "'Inter', sans-serif" }}>
          <span className="text-[#0a0a0a]/30 text-sm font-light">Cargando...</span>
        </div>
      </>
    }>
      <CheckoutContenido />
    </Suspense>
  )
}