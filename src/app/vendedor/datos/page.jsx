'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'
import Navbar from '@/components/Navbar'
import MenuTakeover from '@/components/MenuTakeover'
import VolverAtras from '@/components/VolverAtras'
import ModalContacto from '@/components/ModalContacto'
import BloqueHorarios, { HORARIOS_INICIALES } from '../nuevo/BloqueHorarios'
import {
  inputClasses, selectClasses, fuenteTitulo, fuenteAyuda, ayudaClasses, labelClasses,
  btnNegro, btnNegroInactivo, btnAmarillo, pillActiva, pillInactiva, fuentePill,
} from '@/lib/estilosVendedor'

const MENU_CATEGORIAS = ['moda','belleza-y-bienestar','joyeria-y-accesorios','hogar-y-deco','artes-y-oficios','bebes-y-maternidad','juegos-y-juguetes','mascotas','libros','deporte','vintage']

const EJEMPLOS_RED = {
  facebook: 'https://facebook.com/bahiashops',
  tiktok: 'https://tiktok.com/@bahiashops',
  otro: 'https://ejemplo.com/bahiashops',
}

const OPCIONES_DESPACHO = [
  { valor: 'mismo_dia',  label: 'Mismo día (si se compra dentro del horario)' },
  { valor: '24_48hs',    label: '24 a 48 horas hábiles' },
  { valor: '2_5_dias',   label: '2 a 5 días hábiles' },
  { valor: 'mas_5_dias', label: 'Más de 5 días / a coordinar' },
]

const OPCIONES_ENTREGA = [
  { valor: 'retiro',        label: 'Retiro en mi local / domicilio' },
  { valor: 'coordinar',     label: 'A coordinar con el comprador' },
  { valor: 'envio_propio',  label: 'Envío propio (yo lo llevo)' },
  { valor: 'flash_pedidos', label: 'Uber Flash / PedidosYa Envíos' },
  { valor: 'correo',        label: 'Correo / encomienda' },
]

// El número se guarda como +549XXXXXXXXXX; en el campo se edita sin ese prefijo
function quitarPrefijo(telefono) {
  if (!telefono) return ''
  return telefono.replace(/\D/g, '').replace(/^549/, '')
}

function armarTelefonoCompleto(numero) {
  if (!numero) return null
  return '+549' + numero.replace(/\D/g, '')
}

export default function MisDatosVendedorPage() {
  const supabase = createClient()
  const router = useRouter()

  const [menuOpen, setMenuOpen] = useState(false)
  const [categoriasMenu, setCategoriasMenu] = useState([])

  const [cargando, setCargando] = useState(true)
  const [vendedorId, setVendedorId] = useState(null)
  const [guardando, setGuardando] = useState(false)
  const [error, setError] = useState(null)
  const [guardado, setGuardado] = useState(false)
  const [modalCategoria, setModalCategoria] = useState(false)

  // ── Catálogos ──
  const [categorias, setCategorias] = useState([])
  const [sellos, setSellos] = useState([])

  // ── Campos editables ──
  const [nombreNegocio, setNombreNegocio] = useState('')
  const [categoriaId, setCategoriaId] = useState('')
  const [sellosSeleccionados, setSellosSeleccionados] = useState([])
  const [sellosOriginales, setSellosOriginales] = useState([])
  const [descripcionCorta, setDescripcionCorta] = useState('')
  const [descripcionLarga, setDescripcionLarga] = useState('')
  const [instagram, setInstagram] = useState('')
  const [plataformaSitio, setPlataformaSitio] = useState('')
  const [sitioWeb, setSitioWeb] = useState('')
  const [redSecundariaTipo, setRedSecundariaTipo] = useState('')
  const [redSecundariaUrl, setRedSecundariaUrl] = useState('')
  const [whatsapp, setWhatsapp] = useState('')
  const [usarOtroEmail, setUsarOtroEmail] = useState(false)
  const [emailContacto, setEmailContacto] = useState('')
  const [horarios, setHorarios] = useState(HORARIOS_INICIALES)
  const [notasHorarios, setNotasHorarios] = useState('')
  const [tiempoDespacho, setTiempoDespacho] = useState('')
  const [metodosEntrega, setMetodosEntrega] = useState([])

  useEffect(() => {
    if (menuOpen) { document.body.style.overflow = 'hidden' } else { document.body.style.overflow = '' }
    return () => { document.body.style.overflow = '' }
  }, [menuOpen])

  useEffect(() => {
    async function cargar() {
      const { data: cats } = await supabase.from('categorias').select('id, nombre, slug, activa').order('orden')
      if (cats) {
        setCategorias(cats)
        setCategoriasMenu(cats.filter((c) => c.activa))
      }

      const { data: slls } = await supabase.from('sellos').select('id, nombre').eq('activa', true).order('orden')
      if (slls) setSellos(slls)

      const { data: { user } } = await supabase.auth.getUser()
      if (!user) { router.push('/login'); return }

      const { data: vendedor } = await supabase
        .from('vendedores')
        .select('id, nombre_negocio, categoria_id, descripcion_corta, descripcion_larga, instagram, plataforma_sitio, sitio_web, red_social_secundaria_tipo, red_social_secundaria_url, telefono_contacto, email_contacto, horarios_estructurados, notas_horarios, tiempo_despacho, metodos_entrega_default')
        .eq('usuario_id', user.id)
        .maybeSingle()

      if (!vendedor) { setCargando(false); return }

      setVendedorId(vendedor.id)
      setNombreNegocio(vendedor.nombre_negocio || '')
      setCategoriaId(vendedor.categoria_id ? String(vendedor.categoria_id) : '')
      setDescripcionCorta(vendedor.descripcion_corta || '')
      setDescripcionLarga(vendedor.descripcion_larga || '')
      setInstagram(vendedor.instagram || '')
      setPlataformaSitio(vendedor.plataforma_sitio || '')
      setSitioWeb(vendedor.sitio_web || '')
      setRedSecundariaTipo(vendedor.red_social_secundaria_tipo || '')
      setRedSecundariaUrl(vendedor.red_social_secundaria_url || '')
      setWhatsapp(quitarPrefijo(vendedor.telefono_contacto))
      setUsarOtroEmail(Boolean(vendedor.email_contacto))
      setEmailContacto(vendedor.email_contacto || '')
      setHorarios(vendedor.horarios_estructurados || HORARIOS_INICIALES)
      setNotasHorarios(vendedor.notas_horarios || '')
      setTiempoDespacho(vendedor.tiempo_despacho || '')
      setMetodosEntrega(vendedor.metodos_entrega_default || [])

      const { data: sellosVendedor } = await supabase
        .from('vendedor_sellos')
        .select('sello_id')
        .eq('vendedor_id', vendedor.id)
      const ids = sellosVendedor ? sellosVendedor.map((s) => s.sello_id) : []
      setSellosSeleccionados(ids)
      setSellosOriginales(ids)

      setCargando(false)
    }
    cargar()
  }, [])

  const menuCats = MENU_CATEGORIAS.map((s) => categoriasMenu.find((c) => c.slug === s)).filter(Boolean)
  const tienePlataforma = plataformaSitio !== '' && plataformaSitio !== 'no_tengo'
  const tieneRedSecundaria = redSecundariaTipo !== '' && redSecundariaTipo !== 'no_tengo'
  const placeholderRed = EJEMPLOS_RED[redSecundariaTipo] || 'https://...'

  function toggleSello(selloId) {
    setGuardado(false)
    setSellosSeleccionados((actuales) =>
      actuales.includes(selloId) ? actuales.filter((id) => id !== selloId) : [...actuales, selloId]
    )
  }

  function toggleMetodo(metodo) {
    setGuardado(false)
    setMetodosEntrega((actuales) =>
      actuales.includes(metodo) ? actuales.filter((m) => m !== metodo) : [...actuales, metodo]
    )
  }

  async function handleSubmit(e) {
    e.preventDefault()
    if (!vendedorId) return

    setError(null); setGuardado(false); setGuardando(true)

    // El slug no se regenera al renombrar: la tienda ya está publicada en /tienda/<slug>
    const { error: errorUpdate } = await supabase
      .from('vendedores')
      .update({
        nombre_negocio: nombreNegocio,
        categoria_id: categoriaId ? Number(categoriaId) : null,
        descripcion_corta: descripcionCorta,
        descripcion_larga: descripcionLarga || null,
        instagram,
        plataforma_sitio: plataformaSitio || null,
        sitio_web: tienePlataforma ? sitioWeb : null,
        red_social_secundaria_tipo: redSecundariaTipo || null,
        red_social_secundaria_url: tieneRedSecundaria ? redSecundariaUrl : null,
        telefono_contacto: armarTelefonoCompleto(whatsapp),
        email_contacto: usarOtroEmail ? emailContacto : null,
        horarios_estructurados: horarios,
        notas_horarios: notasHorarios || null,
        tiempo_despacho: tiempoDespacho || null,
        metodos_entrega_default: metodosEntrega,
      })
      .eq('id', vendedorId)

    if (errorUpdate) {
      setError(errorUpdate.message)
      setGuardando(false)
      return
    }

    // Activar la categoría si estaba inactiva (mismo criterio que el alta)
    if (categoriaId) {
      const catElegida = categorias.find((c) => c.id === Number(categoriaId))
      if (catElegida && !catElegida.activa) {
        await supabase.from('categorias').update({ activa: true }).eq('id', Number(categoriaId))
      }
    }

    // Sincronizar sellos: borrar los que sacó, insertar los que agregó
    const quitados = sellosOriginales.filter((id) => !sellosSeleccionados.includes(id))
    const agregados = sellosSeleccionados.filter((id) => !sellosOriginales.includes(id))

    if (quitados.length > 0) {
      const { error: errorBorrar } = await supabase
        .from('vendedor_sellos')
        .delete()
        .eq('vendedor_id', vendedorId)
        .in('sello_id', quitados)
      if (errorBorrar) console.error('Error al quitar sellos:', errorBorrar.message)
    }

    if (agregados.length > 0) {
      const { error: errorAgregar } = await supabase
        .from('vendedor_sellos')
        .insert(agregados.map((selloId) => ({ vendedor_id: vendedorId, sello_id: selloId })))
      if (errorAgregar) console.error('Error al agregar sellos:', errorAgregar.message)
    }

    setSellosOriginales(sellosSeleccionados)
    setGuardando(false)
    setGuardado(true)
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  // ── Render ──

  const fuentes = (
    <link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Fraunces:opsz,wght@9..144,100..900&family=Poppins:wght@300;400;500&family=Inter:wght@200;300;400;500;600;700;800;900&display=swap" />
  )

  if (cargando) {
    return (
      <>
        {fuentes}
        <div className="min-h-screen bg-white flex items-center justify-center" style={{ fontFamily: "'Inter', sans-serif" }}>
          <span className="text-[#0a0a0a]/30 text-sm font-light">Cargando...</span>
        </div>
      </>
    )
  }

  if (!vendedorId) {
    return (
      <>
        {fuentes}
        <div className="min-h-screen bg-white flex items-center justify-center" style={{ fontFamily: "'Inter', sans-serif" }}>
          <span className="text-[#0a0a0a]/30 text-sm font-light">No encontramos tu cuenta de vendedor.</span>
        </div>
      </>
    )
  }

  return (
    <>
      {fuentes}

      <div className="min-h-screen bg-white" style={{ fontFamily: "'Inter', sans-serif" }}>
        {menuOpen && <MenuTakeover categorias={menuCats} onClose={() => setMenuOpen(false)} />}
        <Navbar onToggleMenu={() => setMenuOpen(!menuOpen)} variant="solid" />

        <div className="pt-20 pb-24 px-4 md:px-8">
          <div className="max-w-xl mx-auto">
            <VolverAtras href="/perfil" texto="Volver a Mi perfil" />

            <h1 className="text-2xl md:text-3xl mb-2" style={fuenteTitulo}>
              Mis datos
            </h1>
            <p style={{ ...fuenteAyuda, fontSize: '14px', color: 'rgba(10,10,10,0.45)', marginBottom: '32px' }}>
              Todo lo que cargaste al sumar tu emprendimiento. Podés cambiarlo cuando quieras.
            </p>

            {guardado && (
              <div className="mb-6 p-3 bg-emerald-50 border border-emerald-200 rounded-lg text-sm text-emerald-800">
                ✓ Listo, guardamos tus cambios.
              </div>
            )}

            <form onSubmit={handleSubmit} className="flex flex-col gap-6" onChange={() => setGuardado(false)}>

              {/* ═══ TU EMPRENDIMIENTO ═══ */}
              <h2 className="text-lg md:text-xl m-0" style={fuenteTitulo}>Tu emprendimiento</h2>

              <label className="flex flex-col gap-1.5">
                <span className={labelClasses}>Nombre del emprendimiento *</span>
                <span className={ayudaClasses} style={fuenteAyuda}>
                  La dirección pública de tu tienda no cambia aunque cambies el nombre.
                </span>
                <input type="text" required maxLength={80} value={nombreNegocio}
                  onChange={(e) => setNombreNegocio(e.target.value)} className={inputClasses} />
              </label>

              <label className="flex flex-col gap-1.5">
                <span className={labelClasses}>Categoría / rubro *</span>
                <span className={ayudaClasses} style={fuenteAyuda}>El rubro principal de tu emprendimiento.</span>
                <select required value={categoriaId} onChange={(e) => setCategoriaId(e.target.value)} className={selectClasses}>
                  <option value="">Elegí tu rubro</option>
                  {categorias.map((c) => <option key={c.id} value={c.id}>{c.nombre}</option>)}
                </select>
              </label>

              <button type="button" onClick={() => setModalCategoria(true)}
                className={`self-start -mt-2 ${btnAmarillo}`}>
                ¿No encontrás tu categoría?
              </button>

              <div className="flex flex-col gap-1.5 py-3">
                <span className={labelClasses}>
                  Sellos <span className={ayudaClasses} style={fuenteAyuda}>(opcional)</span>
                </span>
                <span className={ayudaClasses} style={fuenteAyuda}>
                  ¿Tu emprendimiento tiene alguno de estos sellos? Elegí los que apliquen.
                </span>
                <div className="flex flex-wrap gap-2 mt-1.5">
                  {sellos.map((s) => (
                    <button key={s.id} type="button" onClick={() => toggleSello(s.id)}
                      className={sellosSeleccionados.includes(s.id) ? pillActiva : pillInactiva}
                      style={fuentePill}>
                      {s.nombre}
                    </button>
                  ))}
                </div>
              </div>

              <label className="flex flex-col gap-1.5">
                <span className={labelClasses}>
                  Descripción corta * <span className={ayudaClasses} style={fuenteAyuda}>(una línea, es lo primero que van a leer los compradores sobre tu emprendimiento)</span>
                </span>
                <input type="text" required maxLength={140} value={descripcionCorta}
                  onChange={(e) => setDescripcionCorta(e.target.value)} className={inputClasses} />
              </label>

              <label className="flex flex-col gap-1.5">
                <span className={labelClasses}>
                  Descripción larga <span className={ayudaClasses} style={fuenteAyuda}>(opcional)</span>
                </span>
                <textarea rows={5} maxLength={1000} value={descripcionLarga}
                  onChange={(e) => setDescripcionLarga(e.target.value)}
                  className={`${inputClasses} font-[inherit]`} />
              </label>

              {/* ═══ CONTACTO Y REDES ═══ */}
              <h2 className="text-lg md:text-xl m-0 mt-4" style={fuenteTitulo}>Contacto y redes</h2>

              <label className="flex flex-col gap-1.5">
                <span className={labelClasses}>Instagram *</span>
                <input type="text" required placeholder="bahiashops (sin @)" value={instagram}
                  onChange={(e) => setInstagram(e.target.value.replace('@', ''))} className={inputClasses} />
              </label>

              <label className="flex flex-col gap-1.5">
                <span className={labelClasses}>Sitio web propio</span>
                <select value={plataformaSitio} onChange={(e) => setPlataformaSitio(e.target.value)} className={selectClasses}>
                  <option value="">Elegí una opción</option>
                  <option value="no_tengo">No tengo sitio web</option>
                  <option value="tienda_nube">Tienda Nube</option>
                  <option value="empretienda">Empretienda</option>
                  <option value="mercado_shops">Mercado Shops</option>
                  <option value="shopify">Shopify</option>
                  <option value="wordpress">WordPress / WooCommerce</option>
                  <option value="wix">Wix</option>
                  <option value="hecho_a_medida">Hecho a medida</option>
                  <option value="otro">Otro</option>
                </select>
              </label>

              {tienePlataforma && (
                <label className="flex flex-col gap-1.5">
                  <span className={labelClasses}>URL del sitio *</span>
                  <input type="url" required placeholder="https://bahiashops.com.ar" value={sitioWeb}
                    onChange={(e) => setSitioWeb(e.target.value)} className={inputClasses} />
                </label>
              )}

              <label className="flex flex-col gap-1.5">
                <span className={labelClasses}>Otra red social</span>
                <select value={redSecundariaTipo} onChange={(e) => setRedSecundariaTipo(e.target.value)} className={selectClasses}>
                  <option value="">Elegí una opción</option>
                  <option value="no_tengo">No tengo otra red</option>
                  <option value="facebook">Facebook</option>
                  <option value="tiktok">TikTok</option>
                  <option value="otro">Otro</option>
                </select>
              </label>

              {tieneRedSecundaria && (
                <label className="flex flex-col gap-1.5">
                  <span className={labelClasses}>URL o usuario *</span>
                  <input type="text" required placeholder={placeholderRed} value={redSecundariaUrl}
                    onChange={(e) => setRedSecundariaUrl(e.target.value)} className={inputClasses} />
                </label>
              )}

              <label className="flex flex-col gap-1.5">
                <span className={labelClasses}>
                  WhatsApp <span className={ayudaClasses} style={fuenteAyuda}>(recomendado)</span>
                </span>
                <div className="flex gap-2 items-stretch">
                  <span className="px-3 py-2.5 border border-gray-300 rounded-lg bg-[#F5F2EC] text-[#0a0a0a]/40 flex items-center text-sm font-light">
                    +54 9
                  </span>
                  <input type="tel" placeholder="291 555 1234 (sin 0 y sin 15)" value={whatsapp}
                    onChange={(e) => setWhatsapp(e.target.value.replace(/\D/g, ''))}
                    className={`${inputClasses} flex-1`} />
                </div>
              </label>

              <label className="flex items-center gap-2 cursor-pointer">
                <input type="checkbox" checked={usarOtroEmail}
                  onChange={(e) => setUsarOtroEmail(e.target.checked)} className="accent-[#0a0a0a]" />
                <span className={labelClasses}>Usar otro email (diferente al del registro) para contacto público</span>
              </label>

              {usarOtroEmail && (
                <label className="flex flex-col gap-1.5">
                  <span className={labelClasses}>Email de contacto *</span>
                  <input type="email" required placeholder="contacto@bahiashops.com.ar" value={emailContacto}
                    onChange={(e) => setEmailContacto(e.target.value)} className={inputClasses} />
                </label>
              )}

              {/* ═══ DISPONIBILIDAD Y DESPACHO ═══ */}
              <h2 className="text-lg md:text-xl m-0 mt-4" style={fuenteTitulo}>Disponibilidad y despacho</h2>

              <div className="rounded-2xl border border-[#0a0a0a]/5 p-5 flex flex-col gap-6">
                <div>
                  <span className={`block mb-2 ${labelClasses}`}>Horarios de atención</span>
                  <BloqueHorarios valor={horarios} onChange={setHorarios} notas={notasHorarios} onNotasChange={setNotasHorarios} />
                </div>

                <div className="flex flex-col gap-2.5">
                  <span className={labelClasses}>Tiempo de despacho *</span>
                  <span className={`${ayudaClasses} mb-1`} style={fuenteAyuda}>Cuánto te lleva en general despachar un pedido.</span>
                  {OPCIONES_DESPACHO.map((opcion) => (
                    <label key={opcion.valor} className="flex items-center gap-2 cursor-pointer">
                      <input type="radio" name="tiempo_despacho" value={opcion.valor}
                        checked={tiempoDespacho === opcion.valor}
                        onChange={(e) => setTiempoDespacho(e.target.value)} required className="accent-[#0a0a0a]" />
                      <span className="text-sm">{opcion.label}</span>
                    </label>
                  ))}
                </div>

                <div className="flex flex-col gap-2.5">
                  <span className={labelClasses}>Métodos de entrega típicos</span>
                  <span className={`${ayudaClasses} mb-1`} style={fuenteAyuda}>Los que usás habitualmente. Después podés ajustar producto por producto.</span>
                  {OPCIONES_ENTREGA.map((opcion) => (
                    <label key={opcion.valor} className="flex items-center gap-2 cursor-pointer">
                      <input type="checkbox" checked={metodosEntrega.includes(opcion.valor)}
                        onChange={() => toggleMetodo(opcion.valor)} className="accent-[#0a0a0a]" />
                      <span className="text-sm">{opcion.label}</span>
                    </label>
                  ))}
                </div>
              </div>

              {/* Ubicación: vive en su propia página porque necesita el mapa */}
              <Link href="/vendedor/ubicacion"
                className="flex items-center gap-3 px-5 py-4 rounded-2xl border border-[#0a0a0a]/5 hover:bg-[#F5F2EC] transition-colors no-underline">
                <span className="text-lg">📍</span>
                <div className="flex-1">
                  <span className="block text-sm text-[#0a0a0a]">Mi ubicación</span>
                  <span className={ayudaClasses} style={fuenteAyuda}>
                    Localidad, dirección y barrio se editan acá, con el mapa.
                  </span>
                </div>
                <svg className="w-4 h-4 text-[#0a0a0a]/15 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="m8.25 4.5 7.5 7.5-7.5 7.5" />
                </svg>
              </Link>

              {error && (
                <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-red-800 text-sm">
                  {error}
                </div>
              )}

              <div className="flex justify-end mt-2">
                <button type="submit" disabled={guardando}
                  className={`px-6 py-2.5 ${guardando ? btnNegroInactivo : btnNegro}`}>
                  {guardando ? 'Guardando...' : 'Guardar cambios'}
                </button>
              </div>
            </form>
          </div>
        </div>
      </div>

      <ModalContacto
        abierto={modalCategoria}
        onClose={() => setModalCategoria(false)}
        titulo="¿No encontrás tu categoría?"
        subtitulo="Contanos cuál te falta y la evaluamos."
        contexto="Categoría faltante — datos del vendedor"
      />
    </>
  )
}
