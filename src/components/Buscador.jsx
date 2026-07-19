'use client'

import { useState, useEffect, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'

// ── Fuzzy matching: distancia de Levenshtein ──
// Cuenta cuántos cambios (insertar, borrar, reemplazar letra)
// hacen falta para convertir una palabra en otra.
// "ramera" → "remera" = 1 cambio → muy parecidas

function levenshtein(a, b) {
  const m = a.length, n = b.length
  const dp = Array.from({ length: m + 1 }, (_, i) => {
    const row = new Array(n + 1)
    row[0] = i
    return row
  })
  for (let j = 0; j <= n; j++) dp[0][j] = j

  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      if (a[i - 1] === b[j - 1]) {
        dp[i][j] = dp[i - 1][j - 1]
      } else {
        dp[i][j] = 1 + Math.min(dp[i - 1][j - 1], dp[i][j - 1], dp[i - 1][j])
      }
    }
  }
  return dp[m][n]
}

// Busca entre todos los nombres de productos el que más se parece
// al término buscado. Compara palabra por palabra.
// Umbral: distancia <= 2 para que no sugiera cualquier cosa.
function encontrarSugerencia(termino, nombres) {
  const terminoLower = termino.toLowerCase().trim()
  if (terminoLower.length < 3) return null

  let mejorNombre = null
  let mejorDistancia = Infinity

  for (const nombre of nombres) {
    const palabras = nombre.toLowerCase().split(/\s+/)
    for (const palabra of palabras) {
      // Solo comparar palabras de largo similar (±2 letras)
      if (Math.abs(palabra.length - terminoLower.length) > 2) continue
      const dist = levenshtein(terminoLower, palabra)
      // Umbral: máximo 2 cambios, y tiene que ser mejor que lo anterior
      if (dist > 0 && dist <= 2 && dist < mejorDistancia) {
        mejorDistancia = dist
        mejorNombre = nombre
      }
    }
  }

  return mejorNombre
}

// ── Helpers ──

function getImageUrl(media) {
  if (!media?.length) return null
  const principal = media.find(m => m.es_principal)
  if (principal) return principal.url
  const sorted = [...media].sort((a, b) => a.orden - b.orden)
  return sorted[0]?.url || null
}

// ══════════════════════════════════════════════════════════
// COMPONENTE BUSCADOR
// ══════════════════════════════════════════════════════════

export default function Buscador({ placeholder = '¿Qué estás buscando?', mostrarFlecha = false, className = '', dropdownArriba = false, dropdownAnchoPadre = false }) {
  const supabase = createClient()
  const router = useRouter()
  const ref = useRef(null)

  const [termino, setTermino] = useState('')
  const [sugerencias, setSugerencias] = useState([])
  const [sugerenciaFuzzy, setSugerenciaFuzzy] = useState(null) // "Quizás quisiste decir: X"
  const [buscando, setBuscando] = useState(false)
  const [mostrarDropdown, setMostrarDropdown] = useState(false)
  const [nombresCache, setNombresCache] = useState(null) // Cache de nombres para fuzzy

  // ── Búsqueda con debounce ──
  useEffect(() => {
    if (termino.trim().length < 2) {
      setSugerencias([])
      setSugerenciaFuzzy(null)
      setMostrarDropdown(false)
      return
    }

    const timer = setTimeout(async () => {
      setBuscando(true)
      setSugerenciaFuzzy(null)

      // Buscar productos activos cuyo nombre contenga el texto
      const { data } = await supabase
        .from('productos')
        .select(`
          id, nombre, precio,
          vendedor:vendedores(nombre_negocio),
          media:producto_media(url, es_principal, orden)
        `)
        .eq('estado', 'activo')
        .ilike('nombre', `%${termino.trim()}%`)
        .limit(6)

      const resultados = data || []
      setSugerencias(resultados)
      setMostrarDropdown(true)
      setBuscando(false)

      // Si no hay resultados, buscar sugerencia fuzzy
      if (resultados.length === 0) {
        const nombres = await obtenerNombresProductos()
        const sugerida = encontrarSugerencia(termino, nombres)
        setSugerenciaFuzzy(sugerida)
      }
    }, 300)

    return () => clearTimeout(timer)
  }, [termino])

  // Cache de nombres de productos para fuzzy matching
  // Se carga una sola vez y se reutiliza
  async function obtenerNombresProductos() {
    if (nombresCache) return nombresCache
    const { data } = await supabase
      .from('productos')
      .select('nombre')
      .eq('estado', 'activo')
    const nombres = [...new Set((data || []).map(p => p.nombre))]
    setNombresCache(nombres)
    return nombres
  }

  // ── Cerrar dropdown al hacer click afuera ──
  useEffect(() => {
    function handleClickAfuera(e) {
      if (ref.current && !ref.current.contains(e.target)) {
        setMostrarDropdown(false)
      }
    }
    document.addEventListener('mousedown', handleClickAfuera)
    return () => document.removeEventListener('mousedown', handleClickAfuera)
  }, [])

  // ── Ir a la página de resultados ──
  function irABuscar(texto) {
    const q = (texto || termino).trim()
    if (!q) return
    setMostrarDropdown(false)
    router.push(`/buscar?q=${encodeURIComponent(q)}`)
  }

  // ── Ir directo a un producto ──
  function irAProducto(id) {
    setMostrarDropdown(false)
    setTermino('')
    router.push(`/producto/${id}`)
  }

  // ── Usar la sugerencia fuzzy ──
  function usarSugerencia(nombre) {
    setTermino(nombre)
    setSugerenciaFuzzy(null)
    // La búsqueda se dispara automáticamente por el useEffect del termino
  }

  return (
    <div ref={ref} className={`${dropdownAnchoPadre ? 'static' : 'relative'} ${className}`}>
      <div className="relative flex items-center">
        {/* Lupa */}
        <svg className="absolute left-4 w-5 h-5 text-gray-400 pointer-events-none" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <circle cx="11" cy="11" r="8" />
          <path d="m21 21-4.35-4.35" strokeLinecap="round" />
        </svg>

        <input
          type="text"
          value={termino}
          onChange={(e) => setTermino(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') irABuscar() }}
          onFocus={() => { if (sugerencias.length > 0 || sugerenciaFuzzy) setMostrarDropdown(true) }}
          placeholder={placeholder}
          className="w-full pl-12 pr-14 py-3.5 rounded-full bg-white text-sm text-black font-normal placeholder:text-gray-400 focus:outline-none"
        />

        {/* Botón flecha (opcional, para el hero) */}
        {mostrarFlecha && (
          <button
            onClick={() => irABuscar()}
            className="absolute right-2 w-9 h-9 rounded-full bg-[#fe6337] border-2 border-[#fe6337] text-white hover:bg-white hover:text-[#fe6337] flex items-center justify-center transition cursor-pointer"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M13.5 4.5 21 12m0 0-7.5 7.5M21 12H3" />
            </svg>
          </button>
        )}
      </div>

      {/* ── Dropdown de sugerencias ── */}
      {mostrarDropdown && (
        <div className={`absolute left-0 right-0 bg-white rounded-2xl border border-gray-100 overflow-hidden z-50 ${dropdownArriba ? 'bottom-full mb-3' : 'top-full mt-2'} ${dropdownAnchoPadre ? '' : 'shadow-lg'}`}>
          {buscando && (
            <div className="px-4 py-3 text-sm text-gray-400">Buscando...</div>
          )}

          {/* Sin resultados + sugerencia fuzzy */}
          {!buscando && sugerencias.length === 0 && termino.trim().length >= 2 && (
            <div className="px-4 py-3">
              <p className="text-sm text-gray-400">
                No encontramos productos con "{termino}"
              </p>
              {sugerenciaFuzzy && (
                <button
                  onClick={() => usarSugerencia(sugerenciaFuzzy)}
                  className="mt-2 text-sm text-[#8B7EC8] hover:text-[#7a6db7] transition cursor-pointer text-left"
                >
                  Quizás quisiste decir: <span className="font-semibold">{sugerenciaFuzzy}</span>
                </button>
              )}
            </div>
          )}

          {/* Productos encontrados */}
          {!buscando && sugerencias.map((prod) => {
            const imageUrl = getImageUrl(prod.media)
            return (
              <button
                key={prod.id}
                onClick={() => irAProducto(prod.id)}
                className="w-full flex items-center gap-3 px-4 py-3 hover:bg-gray-50 transition text-left cursor-pointer"
              >
                <div className="w-10 h-10 rounded-lg bg-gray-100 overflow-hidden shrink-0">
                  {imageUrl ? (
                    <img src={imageUrl} alt="" className="w-full h-full object-cover" />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center text-gray-300 text-xs">📷</div>
                  )}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-gray-900 truncate">{prod.nombre}</p>
                  <p className="text-xs text-gray-400">{prod.vendedor?.nombre_negocio}</p>
                </div>
                <span className="text-sm font-semibold text-gray-900 shrink-0">
                  ${Number(prod.precio).toLocaleString('es-AR')}
                </span>
              </button>
            )
          })}

          {/* Link a ver todos los resultados */}
          {!buscando && sugerencias.length > 0 && (
            <button
              onClick={() => irABuscar()}
              className="w-full px-4 py-3 text-sm text-[#8B7EC8] font-medium hover:bg-gray-50 transition text-center border-t border-gray-100 cursor-pointer"
            >
              Ver todos los resultados
            </button>
          )}
        </div>
      )}
    </div>
  )
}
