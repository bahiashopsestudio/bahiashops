'use client'

// Pausar y reactivar la tienda, en Mi negocio (/vendedor/perfil). Sigue el
// mockup aprobado (mockup-pausar-tienda.html):
//
//   · SeccionPausar: con la tienda activa, debajo de "Cobros". El mensaje
//     para el público y el botón "Pausar mi tienda", que pide confirmación
//     con cuántos productos dejan de verse.
//   · TarjetaPausada: con la tienda en pausa, arriba, en lugar del cartel de
//     "publicada". Desde cuándo, el mensaje (editable), "Reactivar mi tienda"
//     y, si hace falta, el aviso de reconectar MercadoPago.
//
// El estado lo maneja usePausaTienda, que habla con /api/vendedor/pausa.

import { useState, useCallback } from 'react'
import Link from 'next/link'
import { validarMensajePausa, fechaDePausa, MAX_MENSAJE_PAUSA } from '@/lib/pausaTienda'

const AVISO_RECONECTAR_MP = 'Tu cuenta de MercadoPago necesita reconectarse para poder cobrar.'
const SIN_MENSAJE_PUBLICO = 'Esta tienda no está recibiendo pedidos.'

const FUENTE_TITULO = { fontFamily: 'Fraunces, serif', fontWeight: 500, color: '#0a0a0a' }
const FUENTE_TEXTO = { fontFamily: 'Poppins, sans-serif', fontWeight: 300 }
const BOTON_NEGRO = {
  fontFamily: "'Inter', sans-serif", fontWeight: 500, fontSize: '14px',
  backgroundColor: '#0a0a0a', color: '#ffffff', borderRadius: '4px', padding: '13px 22px', border: 'none',
}
const BOTON_LINEA = {
  fontFamily: "'Inter', sans-serif", fontWeight: 500, fontSize: '14px',
  backgroundColor: '#ffffff', color: '#0a0a0a', borderRadius: '4px', padding: '12px 20px', border: '1px solid rgba(10,10,10,0.25)',
}

function plural(n, uno, varios) {
  return `${n} ${n === 1 ? uno : varios}`
}

async function llamar(metodo, cuerpo) {
  const res = await fetch('/api/vendedor/pausa', {
    method: metodo,
    headers: cuerpo ? { 'Content-Type': 'application/json' } : undefined,
    body: cuerpo ? JSON.stringify(cuerpo) : undefined,
  })
  const datos = await res.json().catch(() => ({}))
  if (!res.ok) throw new Error(datos.error || 'No pudimos guardar el cambio. Probá de nuevo.')
  return datos
}

// El estado de la pausa y las acciones. `pausa` es null mientras carga o si no
// se pudo leer (entonces la sección no se muestra).
export function usePausaTienda() {
  const [pausa, setPausa] = useState(null)
  // Lo que pasó al reactivar: { mpNecesitaReconectar }.
  const [reactivada, setReactivada] = useState(null)

  const cargar = useCallback(async () => {
    try {
      const res = await fetch('/api/vendedor/pausa')
      if (!res.ok) throw new Error('respuesta ' + res.status)
      setPausa(await res.json())
    } catch (err) {
      console.error('No se pudo cargar el estado de la pausa:', err)
      setPausa(null)
    }
  }, [])

  async function pausar(mensaje) {
    const datos = await llamar('POST', { mensaje })
    setReactivada(null)
    setPausa((prev) => ({ ...prev, ...datos }))
  }

  async function guardarMensaje(mensaje) {
    const datos = await llamar('PATCH', { mensaje })
    setPausa((prev) => ({ ...prev, ...datos }))
  }

  async function reactivar() {
    const datos = await llamar('DELETE')
    setReactivada({ mpNecesitaReconectar: !!datos.mp_necesita_reconectar })
    setPausa((prev) => ({ ...prev, ...datos, mp_necesita_reconectar: !!datos.mp_necesita_reconectar }))
  }

  return { pausa, reactivada, cargar, pausar, guardarMensaje, reactivar }
}

// El campo del mensaje, con el contador.
function CampoMensaje({ id, valor, onCambiar, deshabilitado }) {
  return (
    <>
      <textarea
        id={id}
        value={valor}
        maxLength={MAX_MENSAJE_PAUSA}
        disabled={deshabilitado}
        onChange={(e) => onCambiar(e.target.value)}
        placeholder="Por ejemplo: Estamos de vacaciones, volvemos el 15 de febrero."
        rows={3}
        className="w-full resize-none rounded-lg border border-[#0a0a0a]/[0.12] bg-white px-3 py-2.5 text-sm text-[#0a0a0a] outline-none focus:border-[#0a0a0a]/40"
      />
      <div className="mt-1 flex justify-between text-[11px] font-light text-[#0a0a0a]/40">
        <span>Sin teléfonos, mails ni links.</span>
        <span>{valor.length} / {MAX_MENSAJE_PAUSA}</span>
      </div>
    </>
  )
}

// ── Tienda activa: la sección para pausar ────────────────────────────────────

export function SeccionPausar({ pausa, onPausar, reactivada }) {
  const [mensaje, setMensaje] = useState('')
  const [confirmar, setConfirmar] = useState(false)
  const [error, setError] = useState(null)
  const [pausando, setPausando] = useState(false)

  function abrir() {
    const validado = validarMensajePausa(mensaje)
    if (!validado.ok) { setError(validado.error); return }
    setError(null)
    setConfirmar(true)
  }

  async function confirmarPausa() {
    setPausando(true)
    setError(null)
    try {
      await onPausar(mensaje)
      setConfirmar(false)
      setMensaje('')
    } catch (err) {
      setError(err.message)
    } finally {
      setPausando(false)
    }
  }

  const productos = pausa?.productos_visibles
  const pedidos = pausa?.pedidos_para_entregar

  return (
    <div className="mt-4 rounded-2xl border border-[#0a0a0a]/5 px-5 py-4">
      {reactivada && (
        <div className="mb-4 rounded-xl border border-emerald-200 bg-emerald-50 p-3">
          <p className="m-0 text-sm font-medium text-emerald-800">Reactivaste tu tienda.</p>
          <p className="m-0 mt-1 text-[13px] font-light leading-relaxed text-emerald-700">Ya se ve en el sitio y puede recibir pedidos.</p>
          {reactivada.mpNecesitaReconectar && (
            <p className="m-0 mt-2 text-[13px] font-light leading-relaxed text-amber-900">{AVISO_RECONECTAR_MP}</p>
          )}
        </div>
      )}

      <div className="flex items-center gap-3">
        <span className="text-lg" aria-hidden="true">⏸</span>
        <span className="text-sm font-medium text-[#0a0a0a]">¿Cerrás por un tiempo o para siempre?</span>
      </div>
      <p className="mt-2 mb-2 text-[13px] leading-relaxed text-[#0a0a0a]/50" style={FUENTE_TEXTO}>
        Tu tienda deja de verse y de recibir pedidos. No perdés nada y la reactivás cuando quieras.
      </p>
      <p className="mt-0 mb-4 text-[12px] leading-relaxed text-[#0a0a0a]/40" style={FUENTE_TEXTO}>
        Si cerrás para siempre y querés eliminar tu cuenta, primero pausá la tienda y después andá a{' '}
        <Link href="/perfil/eliminar-cuenta" className="text-[#0a0a0a]/60 underline underline-offset-2">Eliminar mi cuenta</Link>.
      </p>

      <label htmlFor="mensaje-pausa" className="mb-1.5 block text-[13px] font-medium text-[#0a0a0a]">
        Mensaje para el público <span className="font-light text-[#0a0a0a]/40">(opcional)</span>
      </label>
      <CampoMensaje id="mensaje-pausa" valor={mensaje} onCambiar={(v) => { setError(null); setMensaje(v) }} deshabilitado={pausando} />

      {error && !confirmar && <p className="m-0 mt-3 text-sm text-red-700">{error}</p>}

      <button type="button" onClick={abrir} className="mt-4 cursor-pointer hover:bg-[#0a0a0a]/[0.03] transition-colors" style={BOTON_LINEA}>
        Pausar mi tienda
      </button>

      {confirmar && (
        <div className="fixed inset-0 z-[1000] flex items-center justify-center bg-black/50 p-4" onClick={() => !pausando && setConfirmar(false)}>
          <div role="dialog" aria-modal="true" aria-labelledby="pausar-titulo" className="w-full max-w-[440px] overflow-hidden rounded-2xl bg-white" onClick={(e) => e.stopPropagation()}>
            <div className="border-b border-[#0a0a0a]/5 px-6 py-4">
              <p id="pausar-titulo" className="m-0 text-[18px]" style={FUENTE_TITULO}>¿Pausar tu tienda?</p>
            </div>
            <div className="px-6 py-4 text-[13px] font-light leading-relaxed text-[#0a0a0a]/65">
              Mientras esté pausada:
              <ul className="mt-2 mb-0 list-disc pl-5">
                <li className="mb-1.5">
                  <span className="font-medium text-[#0a0a0a]">
                    {Number.isInteger(productos)
                      ? (productos === 0 ? 'Tu tienda se oculta.' : `Tu tienda y tus ${plural(productos, 'producto', 'productos')} dejan de verse.`)
                      : 'Tu tienda y tus productos dejan de verse.'}
                  </span>{' '}
                  No aparecen en el inicio, el mapa, las búsquedas ni las categorías, y nadie puede comprarlos.
                </li>
                <li className="mb-1.5">Quien entre con el link de tu tienda ve un cartel de que no está recibiendo pedidos, <span className="font-medium text-[#0a0a0a]">sin productos</span>.</li>
                {Number.isInteger(pedidos) && pedidos > 0 && (
                  <li className="mb-1.5">
                    Los pedidos que ya recibiste siguen en tu panel para que los entregues.{' '}
                    <span className="font-medium text-[#0a0a0a]">Tenés {plural(pedidos, 'pedido', 'pedidos')} para entregar.</span>
                  </li>
                )}
                <li><span className="font-medium text-[#0a0a0a]">No perdés nada:</span> productos, datos, historial y tu MercadoPago conectado quedan como están, y podés seguir editando.</li>
              </ul>
              {mensaje.trim() && (
                <p className="mt-3 mb-0">Quien entre a tu tienda va a ver: “{mensaje.trim()}”</p>
              )}
              <p className="mt-3 mb-0 text-[11px] text-[#0a0a0a]/40">Te mandamos un mail para confirmarlo, con los pasos para reactivarla.</p>
              {error && <div className="mt-3 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-800">{error}</div>}
            </div>
            <div className="flex justify-end gap-3 border-t border-[#0a0a0a]/5 px-6 py-4">
              <button type="button" onClick={() => setConfirmar(false)} disabled={pausando}
                className="cursor-pointer rounded-full border border-[#0a0a0a]/10 bg-white px-5 py-2.5 text-sm font-light text-[#0a0a0a]/60 transition-all hover:border-[#0a0a0a]/30 disabled:cursor-not-allowed">
                Cancelar
              </button>
              <button type="button" onClick={confirmarPausa} disabled={pausando}
                className={`rounded-full border-none px-5 py-2.5 text-sm font-medium text-white transition-colors ${pausando ? 'cursor-not-allowed bg-[#0a0a0a]/30' : 'cursor-pointer bg-[#0a0a0a] hover:bg-[#0a0a0a]/80'}`}>
                {pausando ? 'Pausando...' : 'Sí, pausar mi tienda'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

// ── Tienda en pausa: la tarjeta de arriba ────────────────────────────────────

export function TarjetaPausada({ pausa, onReactivar, onGuardarMensaje }) {
  const [editando, setEditando] = useState(false)
  const [borrador, setBorrador] = useState('')
  const [error, setError] = useState(null)
  const [ocupado, setOcupado] = useState(null) // 'reactivar' | 'mensaje'

  const desde = fechaDePausa(pausa.pausada_en)
  const pedidos = pausa.pedidos_para_entregar

  async function reactivar() {
    setOcupado('reactivar')
    setError(null)
    try { await onReactivar() } catch (err) { setError(err.message) } finally { setOcupado(null) }
  }

  async function guardar() {
    const validado = validarMensajePausa(borrador)
    if (!validado.ok) { setError(validado.error); return }
    setOcupado('mensaje')
    setError(null)
    try {
      await onGuardarMensaje(borrador)
      setEditando(false)
    } catch (err) {
      setError(err.message)
    } finally {
      setOcupado(null)
    }
  }

  return (
    <div>
      <div className="rounded-2xl p-5" style={{ backgroundColor: '#ececec', border: '1px solid #d9d9d9' }}>
        <p className="m-0 text-[17px]" style={{ ...FUENTE_TITULO, color: '#2a2a2a' }}>Tu tienda está en pausa</p>
        <p className="mt-1.5 mb-0 text-[13px] leading-relaxed text-[#0a0a0a]/65" style={FUENTE_TEXTO}>
          {desde ? `Desde el ${desde} no` : 'No'} se ve en el sitio y nadie puede comprarte. Tus productos están ocultos, pero no se borró nada.
        </p>

        {editando ? (
          <div className="mt-3 rounded-xl bg-white/75 p-3">
            <label htmlFor="editar-mensaje-pausa" className="mb-1.5 block text-[13px] font-medium text-[#0a0a0a]">
              Mensaje para el público <span className="font-light text-[#0a0a0a]/40">(opcional)</span>
            </label>
            <CampoMensaje id="editar-mensaje-pausa" valor={borrador} onCambiar={(v) => { setError(null); setBorrador(v) }} deshabilitado={ocupado === 'mensaje'} />
            <div className="mt-3 flex gap-3">
              <button type="button" onClick={guardar} disabled={!!ocupado} className="cursor-pointer disabled:cursor-not-allowed disabled:opacity-50" style={{ ...BOTON_NEGRO, padding: '10px 18px' }}>
                {ocupado === 'mensaje' ? 'Guardando...' : 'Guardar mensaje'}
              </button>
              <button type="button" onClick={() => { setEditando(false); setError(null) }} disabled={!!ocupado}
                className="cursor-pointer border-none bg-transparent p-0 text-[12px] font-light text-[#0a0a0a]/50 underline underline-offset-2">
                Cancelar
              </button>
            </div>
          </div>
        ) : (
          <div className="mt-3 rounded-xl bg-white/75 px-3.5 py-3 text-[13px] leading-relaxed text-[#0a0a0a]">
            <span className="mb-1 block text-[10px] font-medium uppercase tracking-wide text-[#0a0a0a]/40">Lo que ve quien entra a tu tienda</span>
            {pausa.mensaje_pausa ? `“${pausa.mensaje_pausa}”` : SIN_MENSAJE_PUBLICO}
          </div>
        )}

        {error && <p className="m-0 mt-3 text-sm text-red-700">{error}</p>}

        <div className="mt-3.5 flex flex-wrap items-center gap-3">
          <button type="button" onClick={reactivar} disabled={!!ocupado} className="cursor-pointer disabled:cursor-not-allowed disabled:opacity-50" style={BOTON_NEGRO}>
            {ocupado === 'reactivar' ? 'Reactivando...' : 'Reactivar mi tienda'}
          </button>
          {!editando && (
            <button type="button" onClick={() => { setBorrador(pausa.mensaje_pausa || ''); setEditando(true); setError(null) }} disabled={!!ocupado}
              className="cursor-pointer border-none bg-transparent p-0 text-[12px] font-light text-[#0a0a0a]/50 underline underline-offset-2">
              Editar el mensaje
            </button>
          )}
        </div>
      </div>

      {pausa.mp_necesita_reconectar && (
        <div className="mt-3.5 rounded-2xl border border-[#fde68a] bg-[#fffbeb] px-4 py-3.5 text-[13px] font-light leading-relaxed text-[#78350f]">
          <span className="font-medium">{AVISO_RECONECTAR_MP}</span>
        </div>
      )}

      {Number.isInteger(pedidos) && pedidos > 0 && (
        <Link href="/vendedor/pedidos" className="mt-3.5 flex items-center gap-3 rounded-2xl border border-[#0a0a0a]/5 px-4 py-3.5 text-sm font-light text-[#0a0a0a] no-underline hover:bg-[#0a0a0a]/[0.02]">
          <span aria-hidden="true">🛒</span>
          Tenés {plural(pedidos, 'pedido', 'pedidos')} para entregar
          <span className="ml-auto text-[#0a0a0a]/25" aria-hidden="true">›</span>
        </Link>
      )}
    </div>
  )
}
