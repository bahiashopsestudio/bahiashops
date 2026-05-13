'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'

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

  const [localidades, setLocalidades] = useState([])
  const [barrios, setBarrios] = useState([])

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

  const tieneBarrios = barriosDeLaLocalidad.length > 0

  const tienePlataforma =
    plataformaSitio !== '' && plataformaSitio !== 'no_tengo'

  const tieneRedSecundaria =
    redSecundariaTipo !== '' && redSecundariaTipo !== 'no_tengo'

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

  async function handleSubmit(e) {
    e.preventDefault()
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

  return (
    <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
      <label style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
        <span>Nombre del emprendimiento *</span>
        <input
          type="text"
          required
          maxLength={80}
          value={nombreNegocio}
          onChange={(e) => setNombreNegocio(e.target.value)}
          style={{ padding: '0.5rem', border: '1px solid #ccc', borderRadius: 4 }}
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
          style={{ padding: '0.5rem', border: '1px solid #ccc', borderRadius: 4 }}
        />
      </label>

      <label style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
        <span>Descripción larga <small style={{ color: '#666' }}>(opcional)</small></span>
        <textarea
          rows={5}
          maxLength={1000}
          value={descripcionLarga}
          onChange={(e) => setDescripcionLarga(e.target.value)}
          style={{ padding: '0.5rem', border: '1px solid #ccc', borderRadius: 4, fontFamily: 'inherit' }}
        />
      </label>

      <label style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
        <span>Instagram *</span>
        <input
          type="text"
          required
          placeholder="maraestudio (sin @)"
          value={instagram}
          onChange={(e) => setInstagram(e.target.value.replace('@', ''))}
          style={{ padding: '0.5rem', border: '1px solid #ccc', borderRadius: 4 }}
        />
      </label>

      <label style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
        <span>Sitio web propio</span>
        <select
          value={plataformaSitio}
          onChange={(e) => setPlataformaSitio(e.target.value)}
          style={{ padding: '0.5rem', border: '1px solid #ccc', borderRadius: 4, background: 'white' }}
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
            placeholder="https://maraestudio.com.ar"
            value={sitioWeb}
            onChange={(e) => setSitioWeb(e.target.value)}
            style={{ padding: '0.5rem', border: '1px solid #ccc', borderRadius: 4 }}
          />
        </label>
      )}

      <label style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
        <span>Otra red social</span>
        <select
          value={redSecundariaTipo}
          onChange={(e) => setRedSecundariaTipo(e.target.value)}
          style={{ padding: '0.5rem', border: '1px solid #ccc', borderRadius: 4, background: 'white' }}
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
            placeholder="https://facebook.com/maraestudio"
            value={redSecundariaUrl}
            onChange={(e) => setRedSecundariaUrl(e.target.value)}
            style={{ padding: '0.5rem', border: '1px solid #ccc', borderRadius: 4 }}
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
            style={{ padding: '0.5rem', border: '1px solid #ccc', borderRadius: 4, flex: 1 }}
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
            placeholder="contacto@maraestudio.com.ar"
            value={emailContacto}
            onChange={(e) => setEmailContacto(e.target.value)}
            style={{ padding: '0.5rem', border: '1px solid #ccc', borderRadius: 4 }}
          />
        </label>
      )}

      <fieldset style={{ border: '1px solid #ddd', borderRadius: 4, padding: '1rem', display: 'flex', flexDirection: 'column', gap: '1rem' }}>
        <legend style={{ padding: '0 0.5rem', fontWeight: 600 }}>Atención al público</legend>

        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
          <span>¿Recibís gente en tu local, taller o showroom? *</span>
          <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', cursor: 'pointer' }}>
            <input
              type="radio"
              name="recibe_publico"
              checked={recibePublico === true}
              onChange={() => setRecibePublico(true)}
              required
            />
            <span>Sí, recibo gente</span>
          </label>
          <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', cursor: 'pointer' }}>
            <input
              type="radio"
              name="recibe_publico"
              checked={recibePublico === false}
              onChange={() => setRecibePublico(false)}
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
                setBarrioId('')
              }}
              required
              style={{ padding: '0.5rem', border: '1px solid #ccc', borderRadius: 4, background: 'white' }}
            >
              <option value="">Elegí una localidad</option>
              {localidades.map((l) => (
                <option key={l.id} value={l.id}>{l.nombre}</option>
              ))}
            </select>
          </label>
        )}

        {recibePublico === true && (
          <label style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
            <span>Dirección *</span>
            <input
              type="text"
              required
              placeholder="Ej: Donado 1234"
              value={direccion}
              onChange={(e) => setDireccion(e.target.value)}
              style={{ padding: '0.5rem', border: '1px solid #ccc', borderRadius: 4 }}
            />
          </label>
        )}

        {localidadId && tieneBarrios && (
          <label style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
            <span>Barrio *</span>
            <select
              value={barrioId}
              onChange={(e) => setBarrioId(e.target.value)}
              required
              style={{ padding: '0.5rem', border: '1px solid #ccc', borderRadius: 4, background: 'white' }}
            >
              <option value="">Elegí un barrio</option>
              {barriosDeLaLocalidad.map((b) => (
                <option key={b.id} value={b.id}>{b.nombre}</option>
              ))}
            </select>
          </label>
        )}
      </fieldset>

      {error && (
        <div style={{ padding: '0.75rem', background: '#fee', border: '1px solid #fcc', borderRadius: 4, color: '#900' }}>
          {error}
        </div>
      )}

      <button
        type="submit"
        disabled={guardando}
        style={{
          padding: '0.75rem',
          background: guardando ? '#999' : '#000',
          color: 'white',
          border: 'none',
          borderRadius: 4,
          cursor: guardando ? 'not-allowed' : 'pointer',
          fontSize: '1rem',
        }}
      >
        {guardando ? 'Guardando...' : 'Sumar mi emprendimiento'}
      </button>
    </form>
  )
}