'use client'

import { useEffect, useState } from 'react'
import { useParams } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'
import Navbar from '@/components/Navbar'

const ESTADOS = {
  pendiente:        { etiqueta: 'Pendiente',        color: '#6b6d00', fondo: '#f1f29f' },
  necesita_cambios: { etiqueta: 'Necesita cambios', color: '#92650a', fondo: '#fef3c7' },
  aprobado:         { etiqueta: 'Aprobado',         color: '#1a7a4a', fondo: '#d0f0e0' },
}

const DIAS = [
  ['lunes', 'Lunes'], ['martes', 'Martes'], ['miercoles', 'Miércoles'], ['jueves', 'Jueves'],
  ['viernes', 'Viernes'], ['sabado', 'Sábado'], ['domingo', 'Domingo'],
]

const ETIQUETAS_DESPACHO = {
  mismo_dia: 'Mismo día', '24_48hs': '24 a 48 hs hábiles',
  '2_5_dias': '2 a 5 días hábiles', mas_5_dias: 'Más de 5 días / a coordinar',
}

const ETIQUETAS_ENTREGA = {
  retiro: 'Retiro en el local', coordinar: 'A coordinar', envio_propio: 'Envío propio',
  flash_pedidos: 'Uber Flash / PedidosYa', correo: 'Correo / encomienda',
}

const ETIQUETAS_PLATAFORMA = {
  no_tengo: 'No tiene', tienda_nube: 'Tienda Nube', empretienda: 'Empretienda',
  mercado_shops: 'Mercado Shops', shopify: 'Shopify', wordpress: 'WordPress / WooCommerce',
  wix: 'Wix', hecho_a_medida: 'Hecho a medida', otro: 'Otro',
}

function fecha(f) {
  if (!f) return '—'
  return new Date(f).toLocaleDateString('es-AR', { day: '2-digit', month: '2-digit', year: 'numeric' })
}

function urlInstagram(usuario) {
  if (!usuario) return null
  const limpio = String(usuario).trim().replace(/^@/, '')
  if (/^https?:\/\//i.test(limpio)) return limpio
  return `https://instagram.com/${limpio}`
}

function conProtocolo(u) {
  if (!u) return null
  return /^https?:\/\//i.test(u) ? u : `https://${u}`
}

// ── Piezas de presentación ─────────────────────────────────────────────

function Seccion({ titulo, children }) {
  return (
    <section style={{ marginBottom: '28px' }}>
      <h2 style={{ fontFamily: 'Fraunces, serif', fontWeight: 500, fontSize: '17px', color: '#0a0a0a', marginBottom: '12px' }}>
        {titulo}
      </h2>
      <div style={{ backgroundColor: '#ffffff', border: '1px solid rgba(10,10,10,0.06)', borderRadius: '8px', padding: '4px 20px' }}>
        {children}
      </div>
    </section>
  )
}

function Dato({ etiqueta, children, destacado }) {
  return (
    <div
      className="flex flex-col md:flex-row md:items-baseline gap-1 md:gap-4"
      style={{ padding: '12px 0', borderBottom: '1px solid rgba(10,10,10,0.05)' }}
    >
      <span style={{ fontFamily: "'Inter', sans-serif", fontSize: '12px', fontWeight: 400, color: 'rgba(10,10,10,0.4)', minWidth: '150px' }}>
        {etiqueta}
      </span>
      <span
        style={{
          fontFamily: "'Inter', sans-serif", fontSize: destacado ? '14px' : '13px',
          fontWeight: destacado ? 500 : 300, color: '#0a0a0a', flex: 1, lineHeight: 1.6,
          whiteSpace: 'pre-wrap',
        }}
      >
        {children ?? '—'}
      </span>
    </div>
  )
}

function LinkExterno({ href, children }) {
  if (!href) return <span style={{ color: 'rgba(10,10,10,0.3)' }}>—</span>
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      style={{ color: '#4164fe', textDecoration: 'underline', textUnderlineOffset: '3px', wordBreak: 'break-all' }}
    >
      {children}
    </a>
  )
}

function Horarios({ valor, notas }) {
  if (!valor || typeof valor !== 'object') return <span>—</span>
  const abiertos = DIAS.filter(([clave]) => valor[clave]?.abierto)
  if (abiertos.length === 0) return <span>Sin horarios cargados{notas ? ` · ${notas}` : ''}</span>
  return (
    <span>
      {abiertos.map(([clave, label]) => (
        <span key={clave} style={{ display: 'block' }}>
          {label}: {valor[clave].turnos.map((t) => `${t[0]} a ${t[1]}`).join(' y ')}
        </span>
      ))}
      {notas && <span style={{ display: 'block', marginTop: '6px', color: 'rgba(10,10,10,0.5)' }}>{notas}</span>}
    </span>
  )
}

// ── Página ─────────────────────────────────────────────────────────────

export default function AdminVendedorDetallePage() {
  const { id } = useParams()

  const [esAdmin, setEsAdmin] = useState(null)
  const [cargando, setCargando] = useState(true)
  const [vendedor, setVendedor] = useState(null)
  const [productos, setProductos] = useState([])
  const [error, setError] = useState('')
  const [procesando, setProcesando] = useState(false)
  const [pidiendoCambios, setPidiendoCambios] = useState(false)
  const [notas, setNotas] = useState('')

  useEffect(() => {
    const supabase = createClient()

    async function iniciar() {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) { setEsAdmin(false); setCargando(false); return }

      const { data: perfil } = await supabase
        .from('usuarios').select('es_admin').eq('id', user.id).single()

      if (!perfil?.es_admin) { setEsAdmin(false); setCargando(false); return }
      setEsAdmin(true)

      const res = await fetch(`/api/admin/vendedores/${id}/detalle`)
      const data = await res.json().catch(() => ({}))
      if (res.ok) {
        setVendedor(data.vendedor)
        setProductos(data.productos || [])
      } else {
        setError(data.error || 'No se pudo cargar el vendedor.')
      }
      setCargando(false)
    }
    iniciar()
  }, [id])

  async function cambiarEstado(estado, texto) {
    setProcesando(true)
    setError('')

    const res = await fetch(`/api/admin/vendedores/${id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ estado_validacion: estado, notas_validacion: texto ?? null }),
    })
    const data = await res.json().catch(() => ({}))

    if (res.ok) {
      setVendedor((v) => ({ ...v, ...data.vendedor }))
      setPidiendoCambios(false)
      setNotas('')
      if (data.aviso && !data.aviso.enviado) {
        setError('Guardamos el estado, pero no se pudo enviar el mail al vendedor. Avisale vos.')
      }
    } else {
      setError(data.error || 'No se pudo actualizar el estado.')
    }
    setProcesando(false)
  }

  if (cargando) {
    return (
      <>
        <Navbar variant="solid" />
        <main className="pt-28 px-6 text-center text-[#0a0a0a]/30 text-sm font-light">Cargando...</main>
      </>
    )
  }

  if (!esAdmin) {
    return (
      <>
        <Navbar variant="solid" />
        <main className="pt-28 px-6 text-center">
          <h1 className="text-2xl font-semibold text-[#0a0a0a]">Acceso restringido</h1>
          <p className="text-[#0a0a0a]/40 font-light">Esta página es solo para administradores.</p>
        </main>
      </>
    )
  }

  if (!vendedor) {
    return (
      <>
        <Navbar variant="solid" />
        <main className="pt-28 px-6 text-center text-[#0a0a0a]/40 text-sm font-light">
          {error || 'No encontramos ese vendedor.'}
        </main>
      </>
    )
  }

  const estado = ESTADOS[vendedor.estado_validacion] || ESTADOS.pendiente

  return (
    <>
      <link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Inter:wght@200;300;400;500;600;700;800;900&display=swap" />
      <link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Fraunces:opsz,wght@9..144,100..900&family=Poppins:wght@300;400;500&display=swap" />

      <div className="min-h-screen bg-[#faf9f7]" style={{ fontFamily: "'Inter', sans-serif" }}>
        <Navbar variant="solid" />

        <div className="pt-20">
          <div className="max-w-[820px] mx-auto px-5 md:px-8" style={{ paddingTop: '48px', paddingBottom: '100px' }}>

            <Link
              href="/admin/vendedores"
              style={{ fontFamily: "'Inter', sans-serif", fontSize: '12px', fontWeight: 400, color: 'rgba(10,10,10,0.4)', display: 'inline-block', marginBottom: '24px' }}
            >
              ← Vendedores
            </Link>

            {/* ── Encabezado ── */}
            <div className="flex items-center gap-3 flex-wrap" style={{ marginBottom: '6px' }}>
              <h1 style={{ fontFamily: 'Fraunces, serif', fontWeight: 500, fontSize: '26px', color: '#0a0a0a', margin: 0 }}>
                {vendedor.nombre_negocio}
              </h1>
              <span style={{ fontSize: '11px', fontWeight: 500, color: estado.color, backgroundColor: estado.fondo, borderRadius: '999px', padding: '3px 11px' }}>
                {estado.etiqueta}
              </span>
              {vendedor.bloqueado && (
                <span style={{ fontSize: '11px', fontWeight: 500, color: '#ffffff', backgroundColor: '#cc152b', borderRadius: '999px', padding: '3px 11px' }}>
                  Bloqueado
                </span>
              )}
            </div>
            <p style={{ fontFamily: 'Poppins, sans-serif', fontWeight: 300, fontSize: '13px', color: 'rgba(10,10,10,0.45)', marginTop: 0 }}>
              Alta {fecha(vendedor.creado_en)}
              {vendedor.validado_en && ` · Última revisión ${fecha(vendedor.validado_en)}`}
            </p>

            <a
              href={`/tienda/${vendedor.slug}?preview=1`}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-block no-underline"
              style={{
                fontFamily: "'Inter', sans-serif", fontSize: '13px', fontWeight: 500,
                color: '#0a0a0a', backgroundColor: '#ffffff',
                border: '1px solid #0a0a0a', borderRadius: '4px', padding: '9px 18px', marginTop: '8px',
              }}
            >
              Previsualizar la tienda ↗
            </a>

            {error && (
              <p style={{ fontFamily: "'Inter', sans-serif", fontSize: '12px', fontWeight: 400, color: '#cc152b', backgroundColor: '#fce4e4', borderRadius: '6px', padding: '10px 14px', marginTop: '16px' }}>
                {error}
              </p>
            )}

            {/* ── Acciones ── */}
            <div style={{ backgroundColor: '#ffffff', border: '1px solid rgba(10,10,10,0.06)', borderRadius: '8px', padding: '18px 20px', margin: '24px 0 32px' }}>
              {vendedor.notas_validacion && !pidiendoCambios && (
                <div style={{ backgroundColor: '#fef3c7', borderRadius: '6px', padding: '10px 12px', marginBottom: '14px' }}>
                  <p style={{ fontSize: '10px', fontWeight: 500, color: '#92650a', margin: 0, textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                    Cambios pedidos
                  </p>
                  <p style={{ fontSize: '13px', fontWeight: 300, color: 'rgba(10,10,10,0.75)', margin: '4px 0 0', lineHeight: 1.5, whiteSpace: 'pre-wrap' }}>
                    {vendedor.notas_validacion}
                  </p>
                </div>
              )}

              {pidiendoCambios ? (
                <div>
                  <textarea
                    value={notas}
                    onChange={(e) => setNotas(e.target.value)}
                    placeholder="¿Qué le falta o qué tiene que corregir? Este texto lo va a leer el vendedor."
                    rows={3}
                    autoFocus
                    style={{
                      fontFamily: "'Inter', sans-serif", fontSize: '13px', fontWeight: 300,
                      width: '100%', padding: '10px 12px', borderRadius: '8px',
                      border: '1px solid rgba(10,10,10,0.1)', outline: 'none', resize: 'vertical',
                    }}
                  />
                  <div className="flex gap-3 items-center" style={{ marginTop: '8px' }}>
                    <button
                      type="button"
                      onClick={() => cambiarEstado('necesita_cambios', notas.trim())}
                      disabled={procesando || !notas.trim()}
                      style={{
                        fontFamily: "'Inter', sans-serif", fontSize: '12px', fontWeight: 500, color: '#ffffff',
                        backgroundColor: !notas.trim() ? 'rgba(10,10,10,0.2)' : '#0a0a0a',
                        border: 'none', borderRadius: '4px', padding: '8px 16px',
                        cursor: procesando || !notas.trim() ? 'default' : 'pointer',
                      }}
                    >
                      {procesando ? 'Enviando...' : 'Enviar pedido de cambios'}
                    </button>
                    <button
                      type="button"
                      onClick={() => { setPidiendoCambios(false); setNotas('') }}
                      disabled={procesando}
                      style={{ fontFamily: "'Inter', sans-serif", fontSize: '12px', fontWeight: 400, color: 'rgba(10,10,10,0.45)', background: 'none', border: 'none', padding: 0, cursor: 'pointer' }}
                    >
                      Cancelar
                    </button>
                  </div>
                </div>
              ) : (
                <div className="flex gap-3 items-center flex-wrap">
                  {vendedor.estado_validacion !== 'aprobado' && (
                    <button
                      type="button"
                      onClick={() => cambiarEstado('aprobado')}
                      disabled={procesando}
                      style={{
                        fontFamily: "'Inter', sans-serif", fontSize: '13px', fontWeight: 500, color: '#ffffff',
                        backgroundColor: '#1a7a4a', border: 'none', borderRadius: '4px', padding: '10px 20px',
                        cursor: procesando ? 'default' : 'pointer',
                      }}
                    >
                      {procesando ? '...' : 'Aprobar'}
                    </button>
                  )}
                  {vendedor.estado_validacion !== 'necesita_cambios' && (
                    <button
                      type="button"
                      onClick={() => { setNotas(vendedor.notas_validacion || ''); setPidiendoCambios(true) }}
                      disabled={procesando}
                      style={{
                        fontFamily: "'Inter', sans-serif", fontSize: '13px', fontWeight: 400, color: '#92650a',
                        backgroundColor: '#fef3c7', border: 'none', borderRadius: '4px', padding: '10px 20px',
                        cursor: procesando ? 'default' : 'pointer',
                      }}
                    >
                      Pedir cambios
                    </button>
                  )}
                </div>
              )}
            </div>

            {/* ── Verificación: lo primero que se mira ── */}
            <Seccion titulo="Presencia online">
              <Dato etiqueta="Instagram" destacado>
                <LinkExterno href={urlInstagram(vendedor.instagram)}>
                  {vendedor.instagram ? `@${String(vendedor.instagram).replace(/^@/, '')}` : null}
                </LinkExterno>
              </Dato>
              <Dato etiqueta="Sitio web" destacado>
                <LinkExterno href={conProtocolo(vendedor.sitio_web)}>{vendedor.sitio_web}</LinkExterno>
              </Dato>
              <Dato etiqueta="Plataforma">
                {ETIQUETAS_PLATAFORMA[vendedor.plataforma_sitio] || vendedor.plataforma_sitio}
              </Dato>
              <Dato etiqueta="Otra red">
                {vendedor.red_social_secundaria_url ? (
                  <>
                    <LinkExterno href={conProtocolo(vendedor.red_social_secundaria_url)}>
                      {vendedor.red_social_secundaria_url}
                    </LinkExterno>
                    {vendedor.red_social_secundaria_tipo && (
                      <span style={{ color: 'rgba(10,10,10,0.4)' }}> · {vendedor.red_social_secundaria_tipo}</span>
                    )}
                  </>
                ) : null}
              </Dato>
            </Seccion>

            <Seccion titulo="El emprendimiento">
              <Dato etiqueta="Nombre">{vendedor.nombre_negocio}</Dato>
              <Dato etiqueta="Categoría">{vendedor.categorias?.nombre}</Dato>
              <Dato etiqueta="Descripción corta">{vendedor.descripcion_corta}</Dato>
              <Dato etiqueta="Descripción larga">{vendedor.descripcion_larga}</Dato>
              <Dato etiqueta="CUIT">{vendedor.cuit}</Dato>
            </Seccion>

            <Seccion titulo="Contacto">
              <Dato etiqueta="Mail de la cuenta">{vendedor.usuarios?.email}</Dato>
              <Dato etiqueta="Mail de contacto">{vendedor.email_contacto}</Dato>
              <Dato etiqueta="Teléfono">{vendedor.telefono_contacto}</Dato>
            </Seccion>

            <Seccion titulo="Ubicación">
              <Dato etiqueta="Recibe público">{vendedor.recibe_publico ? 'Sí' : 'No'}</Dato>
              <Dato etiqueta="Localidad">{vendedor.localidades?.nombre}</Dato>
              <Dato etiqueta="Barrio">{vendedor.barrios?.nombre}</Dato>
              <Dato etiqueta="Dirección">{vendedor.direccion}</Dato>
            </Seccion>

            <Seccion titulo="Disponibilidad y despacho">
              <Dato etiqueta="Horarios">
                <Horarios valor={vendedor.horarios_estructurados} notas={vendedor.notas_horarios} />
              </Dato>
              <Dato etiqueta="Tiempo de despacho">
                {ETIQUETAS_DESPACHO[vendedor.tiempo_despacho] || vendedor.tiempo_despacho}
              </Dato>
              <Dato etiqueta="Métodos de entrega">
                {vendedor.metodos_entrega_default?.length
                  ? vendedor.metodos_entrega_default.map((m) => ETIQUETAS_ENTREGA[m] || m).join(' · ')
                  : null}
              </Dato>
              <Dato etiqueta="MercadoPago">
                {vendedor.mercadopago_conectado ? 'Conectado' : 'Sin conectar'}
              </Dato>
            </Seccion>

            {/* ── Productos ── */}
            <h2 style={{ fontFamily: 'Fraunces, serif', fontWeight: 500, fontSize: '17px', color: '#0a0a0a', marginBottom: '12px' }}>
              Productos ({productos.length})
            </h2>

            {productos.length === 0 ? (
              <p style={{ fontFamily: "'Inter', sans-serif", fontSize: '13px', fontWeight: 300, color: 'rgba(10,10,10,0.35)' }}>
                Todavía no cargó ningún producto.
              </p>
            ) : (
              <div className="grid grid-cols-2 md:grid-cols-4" style={{ gap: '12px' }}>
                {productos.map((p) => {
                  const media = (p.producto_media || []).slice().sort((a, b) => (b.es_principal ? 1 : 0) - (a.es_principal ? 1 : 0) || a.orden - b.orden)
                  const foto = media[0]?.url
                  return (
                    <div key={p.id} style={{ backgroundColor: '#ffffff', border: '1px solid rgba(10,10,10,0.06)', borderRadius: '8px', overflow: 'hidden' }}>
                      <div style={{ aspectRatio: '1 / 1', backgroundColor: '#F5F2EC' }} className="flex items-center justify-center">
                        {foto ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img src={foto} alt={p.nombre} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                        ) : (
                          <span style={{ fontSize: '11px', color: 'rgba(10,10,10,0.25)' }}>Sin foto</span>
                        )}
                      </div>
                      <div style={{ padding: '10px 12px' }}>
                        <p style={{ fontFamily: "'Inter', sans-serif", fontSize: '12px', fontWeight: 500, color: '#0a0a0a', margin: 0 }}>
                          {p.nombre}
                        </p>
                        <p style={{ fontFamily: "'Inter', sans-serif", fontSize: '12px', fontWeight: 300, color: 'rgba(10,10,10,0.5)', margin: '2px 0 0' }}>
                          ${p.precio?.toLocaleString('es-AR')}
                          <span style={{ color: 'rgba(10,10,10,0.3)' }}> · {p.estado}</span>
                        </p>
                      </div>
                    </div>
                  )
                })}
              </div>
            )}

          </div>
        </div>
      </div>
    </>
  )
}
