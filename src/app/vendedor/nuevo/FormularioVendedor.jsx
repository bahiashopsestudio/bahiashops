'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import dynamic from 'next/dynamic'
import { createClient } from '@/lib/supabase/client'
import BloqueHorarios, { HORARIOS_INICIALES } from './BloqueHorarios'

const MapaUbicacion = dynamic(() => import('./MapaUbicacion'), {
  ssr: false,
  loading: () => <p style={{ color: '#666' }}>Cargando mapa...</p>,
})

const CENTRO_BB = { lat: -38.7183, lng: -62.2663 }

const EJEMPLOS_RED = {
  facebook: 'https://facebook.com/bahiashops',
  tiktok: 'https://tiktok.com/@bahiashops',
  otro: 'https://ejemplo.com/bahiashops',
}

const TITULOS_PASOS = {
  1: 'Tu emprendimiento',
  2: 'Ubicación',
  3: 'Disponibilidad y despacho',
}

export default function FormularioVendedor({ userId }) {
  const router = useRouter()
  const supabase = createClient()

  const [nombreNegocio, setNombreNegocio] = useState('')
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

  const [recibePublico, setRecibePublico] = useState(null)
  const [localidadId, setLocalidadId] = useState('')
  const [direccion, setDireccion] = useState('')
  const [barrioId, setBarrioId] = useState('')

  const [latitud, setLatitud] = useState(null)
  const [longitud, setLongitud] = useState(null)
  const [barrioAuto, setBarrioAuto] = useState(false)
  const [barrioDetectado, setBarrioDetectado] = useState(null)
  const [mapaVisible, setMapaVisible] = useState(false)
  const [posicionBuscada, setPosicionBuscada] = useState(null)
  const [buscando, setBuscando] = useState(false)
  const [avisoMapa, setAvisoMapa] = useState(null)

  const [localidades, setLocalidades] = useState([])
  const [barrios, setBarrios] = useState([])

  // Disponibilidad y despacho
  const [horarios, setHorarios] = useState(HORARIOS_INICIALES)
  const [notasHorarios, setNotasHorarios] = useState('')
  const [tiempoDespacho, setTiempoDespacho] = useState('')
  const [metodosEntrega, setMetodosEntrega] = useState([])

  function toggleMetodo(metodo) {
    setMetodosEntrega((actuales) =>
      actuales.includes(metodo)
        ? actuales.filter((m) => m !== metodo)
        : [...actuales, metodo]
    )
  }

  // Wizard
  const [paso, setPaso] = useState(1)

  const [guardando, setGuardando] = useState(false)
  const [error, setError] = useState(null)

  useEffect(() => {
    async function cargarUbicaciones() {
      const { data: locs } = await supabase
        .from('localidades')
        .select('id, nombre')
        .order('nombre')

      const { data: brs } = await supabase
        .from('barrios')
        .select('id, nombre, localidad_id')
        .order('nombre')

      if (locs) setLocalidades(locs)
      if (brs) setBarrios(brs)
    }
    cargarUbicaciones()
  }, [])

  const barriosDeLaLocalidad = localidadId
    ? barrios.filter((b) => b.localidad_id === Number(localidadId))
    : []
  const localidadTieneBarrios = barriosDeLaLocalidad.length > 0

  const tienePlataforma =
    plataformaSitio !== '' && plataformaSitio !== 'no_tengo'

  const tieneRedSecundaria =
    redSecundariaTipo !== '' && redSecundariaTipo !== 'no_tengo'

  const placeholderRed = EJEMPLOS_RED[redSecundariaTipo] || 'https://...'

  function resetearUbicacion() {
    setBarrioId('')
    setLatitud(null)
    setLongitud(null)
    setBarrioAuto(false)
    setBarrioDetectado(null)
    setMapaVisible(false)
    setPosicionBuscada(null)
    setAvisoMapa(null)
  }

  async function buscarDireccion() {
    if (!direccion) return
    setBuscando(true)
    setAvisoMapa(null)

    const nombreLocalidad =
      localidades.find((l) => l.id === Number(localidadId))?.nombre || 'Bahía Blanca'
    const consulta = `${direccion}, ${nombreLocalidad}, Argentina`

    try {
      const url =
        'https://nominatim.openstreetmap.org/search?format=jsonv2&limit=1&q=' +
        encodeURIComponent(consulta)
      const respuesta = await fetch(url)
      const datos = await respuesta.json()

      setMapaVisible(true)

      if (datos && datos.length > 0) {
        const lat = parseFloat(datos[0].lat)
        const lng = parseFloat(datos[0].lon)
        setPosicionBuscada({ lat, lng, zoom: 16, nonce: Date.now() })
      } else {
        setAvisoMapa('No pudimos ubicar esa dirección exacta. Arrastrá el pin hasta tu local.')
        setPosicionBuscada({ ...CENTRO_BB, zoom: 13, nonce: Date.now() })
      }
    } catch (e) {
      setMapaVisible(true)
      setAvisoMapa('Hubo un problema al buscar la dirección. Arrastrá el pin hasta tu local.')
      setPosicionBuscada({ ...CENTRO_BB, zoom: 13, nonce: Date.now() })
    }

    setBuscando(false)
  }

  function manejarUbicacion({ lat, lng, barrioDetectado: detectado }) {
    setLatitud(lat)
    setLongitud(lng)
    setBarrioDetectado(detectado)

    if (detectado) {
      setBarrioId(String(detectado.id))
      setBarrioAuto(true)
    } else {
      setBarrioAuto(false)
    }
  }

  function generarSlug(texto) {
    return texto
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[^a-z0-9\s-]/g, '')
      .trim()
      .replace(/\s+/g, '-')
  }

  function armarTelefonoCompleto(numero) {
    if (!numero) return null
    const soloDigitos = numero.replace(/\D/g, '')
    return '+549' + soloDigitos
  }

  function irAlAnterior() {
    setPaso((p) => p - 1)
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  async function handleSubmit(e) {
    e.preventDefault()

    // Si no estamos en el último paso, el "submit" significa "siguiente".
    // El navegador ya validó los required visibles antes de llamarnos.
    if (paso < 3) {
      setPaso((p) => p + 1)
      window.scrollTo({ top: 0, behavior: 'smooth' })
      return
    }

    setError(null)
    setGuardando(true)

    const slug = generarSlug(nombreNegocio)

    const { error: errorInsert } = await supabase
      .from('vendedores')
      .insert({
        usuario_id: userId,
        nombre_negocio: nombreNegocio,
        slug: slug,
        descripcion_corta: descripcionCorta,
        descripcion_larga: descripcionLarga || null,
        instagram: instagram,
        plataforma_sitio: plataformaSitio || null,
        sitio_web: tienePlataforma ? sitioWeb : null,
        red_social_secundaria_tipo: redSecundariaTipo || null,
        red_social_secundaria_url: tieneRedSecundaria ? redSecundariaUrl : null,
        telefono_contacto: armarTelefonoCompleto(whatsapp),
        email_contacto: usarOtroEmail ? emailContacto : null,
        recibe_publico: recibePublico,
        localidad_id: localidadId ? Number(localidadId) : null,
        direccion: recibePublico ? direccion : null,
        barrio_id: barrioId ? Number(barrioId) : null,
        latitud: recibePublico ? latitud : null,
        longitud: recibePublico ? longitud : null,
        barrio_detectado_automaticamente: barrioAuto,
        horarios_estructurados: horarios,
        notas_horarios: notasHorarios || null,
        tiempo_despacho: tiempoDespacho || null,
        metodos_entrega_default: metodosEntrega,
      })

    if (errorInsert) {
      if (errorInsert.code === '23505') {
        setError('Ya tenés un emprendimiento creado con esta cuenta. Por ahora cada usuario puede tener uno solo.')
      } else {
        setError(errorInsert.message)
      }
      setGuardando(false)
      return
    }

    router.push('/')
  }

  const inputStyle = { padding: '0.5rem', border: '1px solid #ccc', borderRadius: 4 }
  const selectStyle = { ...inputStyle, background: 'white' }
  const botonPrimario = {
    padding: '0.75rem 1.25rem',
    background: guardando ? '#999' : '#000',
    color: 'white',
    border: 'none',
    borderRadius: 4,
    cursor: guardando ? 'not-allowed' : 'pointer',
    fontSize: '1rem',
  }
  const botonSecundario = {
    padding: '0.75rem 1.25rem',
    background: 'white',
    color: '#333',
    border: '1px solid #ccc',
    borderRadius: 4,
    cursor: 'pointer',
    fontSize: '1rem',
  }

  return (
    <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
      <div style={{ marginBottom: '0.5rem' }}>
        <h2 style={{ margin: 0, fontSize: '1.5rem' }}>{TITULOS_PASOS[paso]}</h2>
        <small style={{ color: '#666' }}>Paso {paso} de 3</small>
      </div>

      {paso === 1 && (
        <>
          <label style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
            <span>Nombre del emprendimiento *</span>
            <input
              type="text"
              required
              maxLength={80}
              value={nombreNegocio}
              onChange={(e) => setNombreNegocio(e.target.value)}
              style={inputStyle}
            />
          </label>

          <label style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
            <span>Descripción corta * <small style={{ color: '#666' }}>(una línea)</small></span>
            <input
              type="text"
              required
              maxLength={140}
              value={descripcionCorta}
              onChange={(e) => setDescripcionCorta(e.target.value)}
              style={inputStyle}
            />
          </label>

          <label style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
            <span>Descripción larga <small style={{ color: '#666' }}>(opcional)</small></span>
            <textarea
              rows={5}
              maxLength={1000}
              value={descripcionLarga}
              onChange={(e) => setDescripcionLarga(e.target.value)}
              style={{ ...inputStyle, fontFamily: 'inherit' }}
            />
          </label>

          <label style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
            <span>Instagram *</span>
            <input
              type="text"
              required
              placeholder="bahiashops (sin @)"
              value={instagram}
              onChange={(e) => setInstagram(e.target.value.replace('@', ''))}
              style={inputStyle}
            />
          </label>

          <label style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
            <span>Sitio web propio</span>
            <select
              value={plataformaSitio}
              onChange={(e) => setPlataformaSitio(e.target.value)}
              style={selectStyle}
            >
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
            <label style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
              <span>URL del sitio *</span>
              <input
                type="url"
                required
                placeholder="https://bahiashops.com.ar"
                value={sitioWeb}
                onChange={(e) => setSitioWeb(e.target.value)}
                style={inputStyle}
              />
            </label>
          )}

          <label style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
            <span>Otra red social</span>
            <select
              value={redSecundariaTipo}
              onChange={(e) => setRedSecundariaTipo(e.target.value)}
              style={selectStyle}
            >
              <option value="">Elegí una opción</option>
              <option value="no_tengo">No tengo otra red</option>
              <option value="facebook">Facebook</option>
              <option value="tiktok">TikTok</option>
              <option value="otro">Otro</option>
            </select>
          </label>

          {tieneRedSecundaria && (
            <label style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
              <span>URL o usuario *</span>
              <input
                type="text"
                required
                placeholder={placeholderRed}
                value={redSecundariaUrl}
                onChange={(e) => setRedSecundariaUrl(e.target.value)}
                style={inputStyle}
              />
            </label>
          )}

          <label style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
            <span>
              WhatsApp <small style={{ color: '#666' }}>(recomendado, te facilita mucho que te contacten)</small>
            </span>
            <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'stretch' }}>
              <span style={{
                padding: '0.5rem 0.75rem',
                border: '1px solid #ccc',
                borderRadius: 4,
                background: '#f5f5f5',
                color: '#666',
                display: 'flex',
                alignItems: 'center',
                fontSize: '0.95rem',
              }}>
                +54 9
              </span>
              <input
                type="tel"
                placeholder="291 555 1234 (sin 0 y sin 15)"
                value={whatsapp}
                onChange={(e) => setWhatsapp(e.target.value.replace(/\D/g, ''))}
                style={{ ...inputStyle, flex: 1 }}
              />
            </div>
          </label>

          <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', cursor: 'pointer' }}>
            <input
              type="checkbox"
              checked={usarOtroEmail}
              onChange={(e) => setUsarOtroEmail(e.target.checked)}
            />
            <span>Usar otro email para contacto público</span>
          </label>

          {usarOtroEmail && (
            <label style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
              <span>Email de contacto *</span>
              <input
                type="email"
                required
                placeholder="contacto@bahiashops.com.ar"
                value={emailContacto}
                onChange={(e) => setEmailContacto(e.target.value)}
                style={inputStyle}
              />
            </label>
          )}
        </>
      )}

      {paso === 2 && (
        <fieldset style={{ border: '1px solid #ddd', borderRadius: 4, padding: '1rem', display: 'flex', flexDirection: 'column', gap: '1rem' }}>
          <legend style={{ padding: '0 0.5rem', fontWeight: 600 }}>Ubicación</legend>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
            <span>¿Recibís gente en tu local, taller o showroom? *</span>
            <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', cursor: 'pointer' }}>
              <input
                type="radio"
                name="recibe_publico"
                checked={recibePublico === true}
                onChange={() => { setRecibePublico(true); resetearUbicacion() }}
                required
              />
              <span>Sí, recibo gente</span>
            </label>
            <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', cursor: 'pointer' }}>
              <input
                type="radio"
                name="recibe_publico"
                checked={recibePublico === false}
                onChange={() => { setRecibePublico(false); resetearUbicacion() }}
              />
              <span>No, vendo desde casa o solo despacho</span>
            </label>
          </div>

          {recibePublico !== null && (
            <label style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
              <span>Localidad *</span>
              <select
                value={localidadId}
                onChange={(e) => {
                  setLocalidadId(e.target.value)
                  resetearUbicacion()
                }}
                required
                style={selectStyle}
              >
                <option value="">Elegí una localidad</option>
                {localidades.map((l) => (
                  <option key={l.id} value={l.id}>{l.nombre}</option>
                ))}
              </select>
            </label>
          )}

          {recibePublico !== null && localidadId && localidadTieneBarrios && (
            <>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
                <span>Dirección *</span>
                <span style={{ fontSize: '0.85rem', color: '#666' }}>
                  {recibePublico
                    ? 'Escribí la dirección de tu local y tocá "Ubicar".'
                    : 'La usamos solo para detectar tu barrio. No la guardamos: tu dirección exacta no queda registrada ni se muestra.'}
                </span>
                <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'stretch' }}>
                  <input
                    type="text"
                    required
                    placeholder="Ej: Donado 1234"
                    value={direccion}
                    onChange={(e) => setDireccion(e.target.value)}
                    style={{ ...inputStyle, flex: 1 }}
                  />
                  <button
                    type="button"
                    onClick={buscarDireccion}
                    disabled={buscando || !direccion}
                    style={{
                      padding: '0.5rem 0.9rem',
                      background: buscando || !direccion ? '#ccc' : '#2563eb',
                      color: 'white',
                      border: 'none',
                      borderRadius: 4,
                      cursor: buscando || !direccion ? 'not-allowed' : 'pointer',
                      whiteSpace: 'nowrap',
                    }}
                  >
                    {buscando ? 'Buscando...' : 'Ubicar 📍'}
                  </button>
                </div>
              </div>

              {mapaVisible && (
                <>
                  {avisoMapa && (
                    <div style={{ padding: '0.6rem', background: '#fff7ed', border: '1px solid #fed7aa', borderRadius: 4, fontSize: '0.9rem' }}>
                      {avisoMapa}
                    </div>
                  )}

                  <MapaUbicacion
                    posicionBuscada={posicionBuscada}
                    onUbicacionChange={manejarUbicacion}
                  />

                  {barrioDetectado ? (
                    <p style={{ margin: 0, fontSize: '0.95rem' }}>
                      📍 Tu local está en <strong>{barrioDetectado.nombre}</strong>. Si la ubicación no es exacta, arrastrá el pin hasta tu puerta.
                    </p>
                  ) : latitud ? (
                    <label style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
                      <span>No pudimos detectar el barrio desde el pin. Elegilo vos:</span>
                      <select
                        value={barrioId}
                        onChange={(e) => { setBarrioId(e.target.value); setBarrioAuto(false) }}
                        required
                        style={selectStyle}
                      >
                        <option value="">Elegí un barrio</option>
                        {barriosDeLaLocalidad.map((b) => (
                          <option key={b.id} value={b.id}>{b.nombre}</option>
                        ))}
                      </select>
                    </label>
                  ) : null}

                  {recibePublico && latitud && longitud && (
                    <span style={{ fontSize: '0.8rem', color: '#999', fontFamily: 'monospace' }}>
                      📍 {latitud.toFixed(6)}, {longitud.toFixed(6)}
                    </span>
                  )}
                </>
              )}
            </>
          )}
        </fieldset>
      )}

      {paso === 3 && (
        <fieldset style={{ border: '1px solid #ddd', borderRadius: 4, padding: '1rem', display: 'flex', flexDirection: 'column', gap: '1rem' }}>
          <legend style={{ padding: '0 0.5rem', fontWeight: 600 }}>Disponibilidad y despacho</legend>

          <div>
            <span style={{ display: 'block', marginBottom: '0.5rem' }}>Horarios de atención</span>
            <BloqueHorarios
              valor={horarios}
              onChange={setHorarios}
              notas={notasHorarios}
              onNotasChange={setNotasHorarios}
            />
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
            <span>Tiempo de despacho *</span>
            <small style={{ color: '#666' }}>Cuánto te lleva en general despachar un pedido.</small>
            {[
              { valor: 'mismo_dia',  label: 'Mismo día (si se compra dentro del horario)' },
              { valor: '24_48hs',    label: '24 a 48 horas hábiles' },
              { valor: '2_5_dias',   label: '2 a 5 días hábiles' },
              { valor: 'mas_5_dias', label: 'Más de 5 días / a coordinar' },
            ].map((opcion) => (
              <label key={opcion.valor} style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', cursor: 'pointer' }}>
                <input
                  type="radio"
                  name="tiempo_despacho"
                  value={opcion.valor}
                  checked={tiempoDespacho === opcion.valor}
                  onChange={(e) => setTiempoDespacho(e.target.value)}
                  required
                />
                <span>{opcion.label}</span>
              </label>
            ))}
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
            <span>Métodos de entrega típicos</span>
            <small style={{ color: '#666' }}>Los que usás habitualmente. Después podés ajustar producto por producto.</small>
            {[
              { valor: 'retiro',        label: 'Retiro en mi local / domicilio' },
              { valor: 'coordinar',     label: 'A coordinar con el comprador' },
              { valor: 'envio_propio',  label: 'Envío propio (yo lo llevo)' },
              { valor: 'flash_pedidos', label: 'Uber Flash / PedidosYa Envíos' },
              { valor: 'correo',        label: 'Correo / encomienda' },
            ].map((opcion) => (
              <label key={opcion.valor} style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', cursor: 'pointer' }}>
                <input
                  type="checkbox"
                  checked={metodosEntrega.includes(opcion.valor)}
                  onChange={() => toggleMetodo(opcion.valor)}
                />
                <span>{opcion.label}</span>
              </label>
            ))}
          </div>
        </fieldset>
      )}

      {error && (
        <div style={{ padding: '0.75rem', background: '#fee', border: '1px solid #fcc', borderRadius: 4, color: '#900' }}>
          {error}
        </div>
      )}

      <div style={{ display: 'flex', gap: '0.5rem', justifyContent: 'space-between', marginTop: '0.5rem' }}>
        {paso > 1 ? (
          <button type="button" onClick={irAlAnterior} style={botonSecundario}>
            ← Anterior
          </button>
        ) : (
          <div />
        )}

        <button type="submit" disabled={guardando} style={botonPrimario}>
          {paso < 3
            ? 'Siguiente →'
            : (guardando ? 'Guardando...' : 'Sumar mi emprendimiento')}
        </button>
      </div>
    </form>
  )
}