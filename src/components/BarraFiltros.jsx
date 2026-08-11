'use client'

const OPCIONES_GENERO = [
  { valor: 'mujer', label: 'Mujer' },
  { valor: 'hombre', label: 'Hombre' },
  { valor: 'ninos', label: 'Niños' },
  { valor: 'sin_genero', label: 'Sin género' },
]

const pillBase = 'shrink-0 whitespace-nowrap rounded-full border px-3 py-1.5 text-sm transition-colors cursor-pointer'
const pillInactiva = `${pillBase} bg-white text-[#0a0a0a]/60 border-[#0a0a0a]/10 hover:border-[#0a0a0a]/30`
const pillActiva = `${pillBase} bg-[#0a0a0a] text-white border-[#0a0a0a]`

function Etiqueta({ children }) {
  return (
    <span className="shrink-0 text-[11px] text-[#0a0a0a]/25 font-light uppercase tracking-wide">
      {children}
    </span>
  )
}

function Separador() {
  return <span className="shrink-0 w-px h-4 bg-[#0a0a0a]/10 mx-1" />
}

// subcategorias: [{ id, nombre, slug }] (opcional — solo en la página de categoría)
// sellos: [{ id, nombre, slug }] — ya filtrados por el llamador para mostrar solo los que tienen productos
// filtrosActivos: { sub: slug|null, genero: valor|null, sellos: [slug] }
export default function BarraFiltros({ subcategorias = [], sellos = [], filtrosActivos, onFiltroChange }) {
  const { sub, genero, sellos: sellosActivos = [] } = filtrosActivos

  const subcategoriasVisibles = subcategorias.filter((s) => s.nombre !== 'Otra')
  const haySubcategorias = subcategoriasVisibles.length > 0
  const haySellos = sellos.length > 0
  const hayFiltrosActivos = !!sub || !!genero || sellosActivos.length > 0

  function toggleSub(slug) {
    onFiltroChange({ ...filtrosActivos, sub: sub === slug ? null : slug })
  }

  function toggleGenero(valor) {
    onFiltroChange({ ...filtrosActivos, genero: genero === valor ? null : valor })
  }

  function toggleSello(slug) {
    const nuevos = sellosActivos.includes(slug)
      ? sellosActivos.filter((s) => s !== slug)
      : [...sellosActivos, slug]
    onFiltroChange({ ...filtrosActivos, sellos: nuevos })
  }

  function limpiar() {
    onFiltroChange({ sub: null, genero: null, sellos: [] })
  }

  return (
    <div
      className="no-scrollbar flex items-center gap-2 overflow-x-auto pb-1 mb-8"
      style={{ scrollbarWidth: 'none', msOverflowStyle: 'none' }}
    >
      {haySubcategorias && (
        <>
          <Etiqueta>Subcategoría</Etiqueta>
          {subcategoriasVisibles.map((s) => (
            <button
              key={s.id} type="button" onClick={() => toggleSub(s.slug)}
              className={sub === s.slug ? pillActiva : pillInactiva}
            >
              {s.nombre}
            </button>
          ))}
          <Separador />
        </>
      )}

      <Etiqueta>Género</Etiqueta>
      {OPCIONES_GENERO.map((op) => (
        <button
          key={op.valor} type="button" onClick={() => toggleGenero(op.valor)}
          className={genero === op.valor ? pillActiva : pillInactiva}
        >
          {op.label}
        </button>
      ))}

      {haySellos && (
        <>
          <Separador />
          <Etiqueta>Sellos</Etiqueta>
          {sellos.map((s) => (
            <button
              key={s.id} type="button" onClick={() => toggleSello(s.slug)}
              className={sellosActivos.includes(s.slug) ? pillActiva : pillInactiva}
            >
              {s.nombre}
            </button>
          ))}
        </>
      )}

      {hayFiltrosActivos && (
        <button
          type="button" onClick={limpiar}
          className="shrink-0 whitespace-nowrap text-[13px] text-[#0a0a0a]/40 hover:text-[#0a0a0a] underline underline-offset-2 ml-2 cursor-pointer transition-colors"
        >
          Limpiar filtros
        </button>
      )}
    </div>
  )
}
