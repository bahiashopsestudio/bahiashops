'use client'

import { useState } from 'react'
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

  const [guardando, setGuardando] = useState(false)
  const [error, setError] = useState(null)

  const tienePlataforma =
    plataformaSitio !== '' && plataformaSitio !== 'no_tengo'

  function generarSlug(texto) {
    return texto
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[^a-z0-9\s-]/g, '')
      .trim()
      .replace(/\s+/g, '-')
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
      })

    if (errorInsert) {
      if (errorInsert.code === '23505') {
        setError('Ya tenés un emprendimiento creado con esta cuenta. Por ahora, cada usuario puede tener uno solo.')
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
