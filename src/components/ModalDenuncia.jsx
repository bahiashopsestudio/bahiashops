'use client'

import { useState, useEffect } from 'react'
import { MOTIVOS_DENUNCIA, MAX_COMENTARIO_DENUNCIA } from '@/lib/denuncias'

const FUENTE_TITULO = { fontFamily: 'Fraunces, serif', fontWeight: 500, color: '#0a0a0a' }
const FUENTE_TEXTO = { fontFamily: 'Poppins, sans-serif', fontWeight: 300 }

// El cuadro para denunciar un producto desde su ficha. Se monta cada vez que
// se abre (quien lo usa lo dibuja solo abierto): arranca siempre vacío.
// Guarda por /api/denuncias, que pide sesión (la ficha ya la verificó antes
// de abrirlo).
export default function ModalDenuncia({ productoId, onClose }) {
  const [motivo, setMotivo] = useState('')
  const [comentario, setComentario] = useState('')
  const [enviando, setEnviando] = useState(false)
  const [resultado, setResultado] = useState(null) // 'creada' | 'ya_existia'
  const [error, setError] = useState('')

  useEffect(() => {
    function alApretar(e) { if (e.key === 'Escape' && !enviando) onClose() }
    document.addEventListener('keydown', alApretar)
    document.body.style.overflow = 'hidden'
    return () => { document.removeEventListener('keydown', alApretar); document.body.style.overflow = '' }
  }, [enviando, onClose])

  async function enviar() {
    if (!motivo || enviando) return
    setEnviando(true)
    setError('')
    try {
      const res = await fetch('/api/denuncias', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ producto_id: productoId, motivo, comentario }),
      })
      const datos = await res.json().catch(() => ({}))
      if (!res.ok) {
        if (res.status === 401) {
          window.location.href = `/entrar?next=${encodeURIComponent(`/producto/${productoId}?denunciar=1`)}`
          return
        }
        setError(datos.error || 'No pudimos enviar la denuncia. Probá de nuevo en un momento.')
        return
      }
      setResultado(datos.resultado === 'ya_existia' ? 'ya_existia' : 'creada')
    } catch {
      setError('No pudimos conectarnos. Probá de nuevo en un momento.')
    } finally {
      setEnviando(false)
    }
  }

  return (
    <>
      <link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Fraunces:opsz,wght@9..144,500&family=Poppins:wght@300;500&display=swap" />
      <div className="fixed inset-0 z-[1000] flex items-center justify-center bg-black/50 p-4" onClick={() => !enviando && onClose()}>
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="denuncia-titulo"
          className="w-full max-w-[480px] max-h-[90vh] overflow-y-auto rounded-2xl bg-white"
          onClick={(e) => e.stopPropagation()}
        >
          {resultado ? (
            <div className="px-6 py-8 text-center">
              <p id="denuncia-titulo" className="m-0 text-[22px]" style={FUENTE_TITULO}>
                {resultado === 'ya_existia' ? 'Ya nos avisaste' : 'Gracias por avisarnos'}
              </p>
              <p className="mt-2 mb-6 text-[15px] text-[#0a0a0a]/70" style={FUENTE_TEXTO}>
                {resultado === 'ya_existia'
                  ? 'Lo estamos revisando.'
                  : 'Lo vamos a revisar. Si el producto no cumple las reglas, lo sacamos del sitio.'}
              </p>
              <button
                type="button"
                onClick={onClose}
                className="w-full py-3 bg-[#0a0a0a] text-white rounded-full text-sm font-medium hover:bg-[#2a2a2a] transition cursor-pointer"
              >
                Listo
              </button>
            </div>
          ) : (
            <div className="px-6 py-6">
              <div className="flex items-start justify-between gap-4">
                <p id="denuncia-titulo" className="m-0 text-[22px]" style={FUENTE_TITULO}>Denunciar producto</p>
                <button
                  type="button"
                  onClick={onClose}
                  disabled={enviando}
                  aria-label="Cerrar"
                  className="w-8 h-8 shrink-0 border border-[#0a0a0a]/10 rounded-full bg-white cursor-pointer text-lg leading-none text-[#0a0a0a]/50 hover:text-[#0a0a0a]"
                >
                  ×
                </button>
              </div>
              <p className="mt-1.5 mb-5 text-[14px] text-[#0a0a0a]/60" style={FUENTE_TEXTO}>
                Lo revisamos nosotros. La tienda no se entera de quién lo denunció.
              </p>

              <p className="m-0 mb-2 text-sm font-medium text-[#0a0a0a]">¿Qué pasa con este producto?</p>
              <div role="radiogroup" className="flex flex-col gap-2">
                {MOTIVOS_DENUNCIA.map((m) => {
                  const elegido = motivo === m.valor
                  return (
                    <label
                      key={m.valor}
                      className={`flex items-center gap-3 px-4 py-3 rounded-xl cursor-pointer text-sm transition-colors ${
                        elegido ? 'border-2 border-[#4164fe] bg-[#f3f5ff] text-[#0a0a0a]' : 'border border-[#0a0a0a]/10 bg-white text-[#0a0a0a]/75 hover:border-[#0a0a0a]/25'
                      }`}
                    >
                      <input
                        type="radio"
                        name="motivo-denuncia"
                        value={m.valor}
                        checked={elegido}
                        onChange={() => setMotivo(m.valor)}
                        className="m-0 accent-[#4164fe]"
                      />
                      {m.texto}
                    </label>
                  )
                })}
              </div>

              <label htmlFor="denuncia-comentario" className="block mt-5 mb-1.5 text-sm font-medium text-[#0a0a0a]">
                Contanos más (opcional)
              </label>
              <textarea
                id="denuncia-comentario"
                value={comentario}
                onChange={(e) => setComentario(e.target.value)}
                maxLength={MAX_COMENTARIO_DENUNCIA}
                rows={3}
                placeholder="Por ejemplo: en la segunda foto hay un número de teléfono."
                className="w-full px-3 py-2 rounded-xl border border-[#0a0a0a]/15 resize-y outline-none focus:border-[#0a0a0a] text-sm"
                style={FUENTE_TEXTO}
              />

              {error && <p role="alert" className="mt-3 mb-0 text-sm text-red-700">{error}</p>}

              <button
                type="button"
                onClick={enviar}
                disabled={!motivo || enviando}
                className={`mt-5 w-full py-3 rounded-full text-sm font-medium transition ${
                  !motivo || enviando ? 'bg-[#0a0a0a]/30 text-white cursor-not-allowed' : 'bg-[#0a0a0a] text-white hover:bg-[#2a2a2a] cursor-pointer'
                }`}
              >
                {enviando ? 'Enviando...' : 'Enviar denuncia'}
              </button>
            </div>
          )}
        </div>
      </div>
    </>
  )
}
