'use client'

// Buscar una cuenta por mail y eliminarla (pensado para las cuentas de prueba).
//
// Es el mismo proceso que usa la persona desde su perfil, con las mismas
// verificaciones: si hay una tienda, un pedido en camino o un pago en proceso,
// no se puede. La confirmación es el modal; no se le manda mail a la persona.

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'
import Navbar from '@/components/Navbar'

const ROJO = '#b3261e'

const TEXTO_MOTIVO = {
  TIENDA: (n) => `Tiene ${n.tiendas || 1} ${n.tiendas === 1 || !n.tiendas ? 'tienda' : 'tiendas'}: hay que darla de baja primero.`,
  PEDIDO_ACTIVO: (n) => `${n.pedidos_activos} ${n.pedidos_activos === 1 ? 'pedido en camino' : 'pedidos en camino'}.`,
  PAGO_EN_CURSO: (n) => `${n.pagos_en_curso} ${n.pagos_en_curso === 1 ? 'pago en proceso' : 'pagos en proceso'} en MercadoPago.`,
  ES_ADMIN: () => 'Es una cuenta de administración: primero hay que quitarle el permiso.',
}

function ModalEliminar({ cuenta, procesando, error, onCancelar, onConfirmar }) {
  return (
    <div
      className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-[1000]"
      onClick={procesando ? undefined : onCancelar}
    >
      <div className="bg-white rounded-2xl w-full max-w-[440px] overflow-hidden" onClick={(e) => e.stopPropagation()}>
        <div className="px-6 py-4 border-b border-[#0a0a0a]/5">
          <p className="m-0" style={{ fontFamily: 'Fraunces, serif', fontWeight: 500, color: '#0a0a0a' }}>
            ¿Eliminar esta cuenta?
          </p>
        </div>

        <div className="px-6 py-4">
          <p className="text-sm text-[#0a0a0a]/60 font-light leading-relaxed m-0">
            Vas a eliminar la cuenta <strong style={{ fontWeight: 500, color: '#0a0a0a' }}>{cuenta.email}</strong>. No se puede deshacer y no se le avisa por mail.
          </p>
          {error && (
            <div className="mt-4 p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-800">{error}</div>
          )}
        </div>

        <div className="flex justify-end gap-3 px-6 py-4 border-t border-[#0a0a0a]/5">
          <button
            type="button"
            onClick={onCancelar}
            disabled={procesando}
            className="px-5 py-2.5 border border-[#0a0a0a]/10 rounded-full bg-white cursor-pointer text-sm text-[#0a0a0a]/60 font-light hover:border-[#0a0a0a]/30 transition-all disabled:cursor-not-allowed"
          >
            Cancelar
          </button>
          <button
            type="button"
            onClick={onConfirmar}
            disabled={procesando}
            className="px-5 py-2.5 border-none rounded-full text-white text-sm font-medium transition-colors"
            style={{ backgroundColor: ROJO, opacity: procesando ? 0.5 : 1, cursor: procesando ? 'not-allowed' : 'pointer' }}
          >
            {procesando ? 'Eliminando...' : 'Eliminar'}
          </button>
        </div>
      </div>
    </div>
  )
}

export default function AdminCuentasPage() {
  const [esAdmin, setEsAdmin] = useState(null)
  const [cargando, setCargando] = useState(true)

  const [email, setEmail] = useState('')
  const [buscando, setBuscando] = useState(false)
  const [resultado, setResultado] = useState(null) // la respuesta de GET /api/admin/cuentas
  const [error, setError] = useState('')
  const [aviso, setAviso] = useState('')

  const [confirmando, setConfirmando] = useState(false)
  const [eliminando, setEliminando] = useState(false)
  const [errorModal, setErrorModal] = useState('')

  useEffect(() => {
    const supabase = createClient()

    async function iniciar() {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) { setEsAdmin(false); setCargando(false); return }

      const { data: perfil } = await supabase.from('usuarios').select('es_admin').eq('id', user.id).single()
      setEsAdmin(!!perfil?.es_admin)
      setCargando(false)
    }
    iniciar()
  }, [])

  async function buscar(e) {
    e?.preventDefault()
    if (!email.trim() || buscando) return
    setBuscando(true)
    setError('')
    setAviso('')
    setResultado(null)
    try {
      const res = await fetch(`/api/admin/cuentas?email=${encodeURIComponent(email.trim())}`)
      const data = await res.json().catch(() => ({}))
      if (!res.ok) setError(data.error || 'No se pudo buscar. Probá de nuevo.')
      else setResultado(data)
    } catch {
      setError('No pudimos conectarnos. Probá de nuevo.')
    }
    setBuscando(false)
  }

  async function confirmarEliminar() {
    if (!resultado?.id || eliminando) return
    setEliminando(true)
    setErrorModal('')
    try {
      const res = await fetch(`/api/admin/cuentas/${resultado.id}/cerrar`, { method: 'POST' })
      const data = await res.json().catch(() => ({}))

      if (res.ok && data.ok) {
        setConfirmando(false)
        setResultado(null)
        setEmail('')
        setAviso(data.resultado === 'borrada'
          ? 'Cuenta eliminada: se borró por completo.'
          : data.resultado === 'ya_cerrada'
            ? 'Esa cuenta ya estaba eliminada.'
            : 'Cuenta eliminada: quedó anónima porque tenía pedidos.')
      } else if (res.status === 409) {
        // Algo cambió desde la búsqueda: se vuelve a mostrar el resultado.
        setConfirmando(false)
        await buscar()
        setError('Algo cambió y ya no se puede eliminar. Revisá los motivos.')
      } else {
        setErrorModal(data.error || 'No se pudo eliminar la cuenta.')
      }
    } catch {
      setErrorModal('No pudimos conectarnos. Probá de nuevo.')
    }
    setEliminando(false)
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

  return (
    <>
      <link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Inter:wght@200;300;400;500;600;700&display=swap" />
      <link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Fraunces:opsz,wght@9..144,100..900&family=Poppins:wght@300;400;500&display=swap" />

      <div className="min-h-screen bg-[#faf9f7]" style={{ fontFamily: "'Inter', sans-serif" }}>
        <Navbar variant="solid" />

        <div className="pt-20">
          <div className="max-w-[640px] mx-auto px-5 md:px-8" style={{ paddingTop: '48px', paddingBottom: '100px' }}>
            <Link href="/admin" style={{ fontFamily: "'Inter', sans-serif", fontSize: '12px', fontWeight: 400, color: 'rgba(10,10,10,0.4)', display: 'inline-block', marginBottom: '24px' }}>
              ← Panel
            </Link>
            <h1 style={{ fontFamily: 'Fraunces, serif', fontWeight: 500, fontSize: '26px', color: '#0a0a0a' }}>Cuentas</h1>
            <p style={{ fontFamily: 'Poppins, sans-serif', fontWeight: 300, fontSize: '13px', color: 'rgba(10,10,10,0.45)', marginTop: '8px' }}>
              Buscá una cuenta por su mail para ver si se puede eliminar. Sirve para las cuentas de prueba.
            </p>

            <form onSubmit={buscar} style={{ display: 'flex', gap: '8px', marginTop: '24px' }}>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="mail@ejemplo.com"
                autoComplete="off"
                style={{
                  fontFamily: "'Inter', sans-serif", fontSize: '13px', fontWeight: 300, flex: 1,
                  padding: '10px 14px', borderRadius: '8px', border: '1px solid rgba(10,10,10,0.1)', outline: 'none', backgroundColor: '#fff',
                }}
              />
              <button
                type="submit"
                disabled={buscando || !email.trim()}
                style={{
                  fontFamily: "'Inter', sans-serif", fontSize: '13px', fontWeight: 500, color: '#fff', backgroundColor: '#0a0a0a',
                  padding: '10px 18px', borderRadius: '8px', border: 'none',
                  opacity: buscando || !email.trim() ? 0.4 : 1, cursor: buscando || !email.trim() ? 'not-allowed' : 'pointer',
                }}
              >
                {buscando ? 'Buscando...' : 'Buscar'}
              </button>
            </form>

            {error && (
              <p style={{ fontFamily: "'Inter', sans-serif", fontSize: '12px', fontWeight: 400, color: '#cc152b', backgroundColor: '#fce4e4', borderRadius: '6px', padding: '10px 14px', marginTop: '16px' }}>
                {error}
              </p>
            )}
            {aviso && (
              <p style={{ fontFamily: "'Inter', sans-serif", fontSize: '12px', fontWeight: 400, color: '#1a7a4a', backgroundColor: '#d0f0e0', borderRadius: '6px', padding: '10px 14px', marginTop: '16px' }}>
                {aviso}
              </p>
            )}

            {resultado && resultado.encontrada === false && (
              <p style={{ fontFamily: "'Inter', sans-serif", fontSize: '13px', fontWeight: 300, color: 'rgba(10,10,10,0.45)', marginTop: '24px' }}>
                No hay ninguna cuenta con ese mail.
              </p>
            )}

            {resultado && resultado.encontrada && (
              <div style={{ backgroundColor: '#fff', border: '1px solid rgba(10,10,10,0.06)', borderRadius: '10px', padding: '24px', marginTop: '24px' }}>
                <p style={{ fontFamily: "'Inter', sans-serif", fontSize: '15px', fontWeight: 500, color: '#0a0a0a', margin: 0, wordBreak: 'break-all' }}>{resultado.email}</p>
                <p style={{ fontFamily: 'Poppins, sans-serif', fontWeight: 300, fontSize: '13px', color: 'rgba(10,10,10,0.5)', margin: '4px 0 0' }}>
                  Apodo: {resultado.apodo || 'sin apodo'} · {resultado.eliminada ? 'Ya eliminada' : 'Activa'}
                </p>

                {resultado.eliminada ? (
                  <p style={{ fontFamily: 'Poppins, sans-serif', fontWeight: 300, fontSize: '13px', color: 'rgba(10,10,10,0.5)', marginTop: '16px' }}>
                    Esta cuenta ya se eliminó.
                  </p>
                ) : (
                  <>
                    <p style={{
                      fontFamily: "'Inter', sans-serif", fontSize: '12px', fontWeight: 500, display: 'inline-block', marginTop: '16px',
                      padding: '4px 10px', borderRadius: '999px',
                      color: resultado.puede ? '#1a7a4a' : '#7a5a12', backgroundColor: resultado.puede ? '#d0f0e0' : '#fff6e0',
                    }}>
                      {resultado.puede ? 'Se puede eliminar' : 'No se puede eliminar'}
                    </p>

                    {!resultado.puede && (
                      <ul style={{ margin: '12px 0 0', paddingLeft: '18px', fontFamily: 'Poppins, sans-serif', fontWeight: 300, fontSize: '13px', lineHeight: 1.7, color: '#0a0a0a' }}>
                        {resultado.motivos.map((m) => (
                          <li key={m}>{TEXTO_MOTIVO[m] ? TEXTO_MOTIVO[m](resultado.numeros || {}) : m}</li>
                        ))}
                      </ul>
                    )}

                    <button
                      type="button"
                      onClick={() => { setErrorModal(''); setConfirmando(true) }}
                      disabled={!resultado.puede}
                      style={{
                        display: 'block', marginTop: '20px', fontFamily: "'Inter', sans-serif", fontSize: '13px', fontWeight: 500,
                        color: '#fff', backgroundColor: ROJO, padding: '10px 18px', borderRadius: '8px', border: 'none',
                        opacity: resultado.puede ? 1 : 0.35, cursor: resultado.puede ? 'pointer' : 'not-allowed',
                      }}
                    >
                      Eliminar cuenta
                    </button>
                  </>
                )}
              </div>
            )}
          </div>
        </div>
      </div>

      {confirmando && resultado && (
        <ModalEliminar
          cuenta={resultado}
          procesando={eliminando}
          error={errorModal}
          onCancelar={() => setConfirmando(false)}
          onConfirmar={confirmarEliminar}
        />
      )}
    </>
  )
}
