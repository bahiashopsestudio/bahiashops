'use client'

import { useState, useEffect, useCallback } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useRouter } from 'next/navigation'
import Navbar from '@/components/Navbar'
import MenuTakeover from '@/components/MenuTakeover'
import VolverAtras from '@/components/VolverAtras'
import BloqueUbicacion, { guardarUbicacion } from '@/components/BloqueUbicacion'
import { fuenteTitulo, fuenteAyuda, btnNegro, btnNegroInactivo } from '@/lib/estilosVendedor'

const MENU_CATEGORIAS = ['moda','belleza-y-bienestar','joyeria-y-accesorios','hogar-y-deco','artes-y-oficios','bebes-y-maternidad','juegos-y-juguetes','mascotas','libros','deporte','vintage']

export default function UbicacionVendedorPage() {
  const supabase = createClient()
  const router = useRouter()

  const [menuOpen, setMenuOpen] = useState(false)
  const [categorias, setCategorias] = useState([])

  const [cargando, setCargando] = useState(true)
  const [vendedor, setVendedor] = useState(null)
  const [localidades, setLocalidades] = useState([])
  const [barrios, setBarrios] = useState([])

  // Lo que armó el bloque (BloqueUbicacion): se guarda por la ruta del
  // servidor; desde la migración 018 el navegador no escribe estas columnas.
  const [ubicacion, setUbicacion] = useState(null)
  const [guardando, setGuardando] = useState(false)
  const [guardado, setGuardado] = useState(false)
  const [error, setError] = useState(null)

  useEffect(() => {
    if (menuOpen) { document.body.style.overflow = 'hidden' } else { document.body.style.overflow = '' }
    return () => { document.body.style.overflow = '' }
  }, [menuOpen])

  // ── Cargar datos actuales ──
  useEffect(() => {
    async function cargar() {
      const { data: cats } = await supabase.from('categorias').select('id, nombre, slug').eq('activa', true).order('orden')
      if (cats) setCategorias(cats)

      const { data: { user } } = await supabase.auth.getUser()
      if (!user) { router.replace('/entrar?next=%2Fvendedor%2Fubicacion'); return }

      const { data: fila } = await supabase
        .from('vendedores')
        .select('id, localidad_id, direccion_visible, direccion, latitud, longitud, barrio_id')
        .eq('usuario_id', user.id)
        .single()

      if (!fila) { setCargando(false); return }

      // Las activas (migración 017), más la que la tienda ya tenga aunque esté
      // inactiva: si no, el selector la mostraría vacía. La base solo rechaza
      // pasarse a una inactiva, no quedarse en la que ya estaba.
      const { data: locs } = await supabase
        .from('localidades')
        .select('id, nombre')
        .or(`activa.eq.true${fila.localidad_id ? `,id.eq.${Number(fila.localidad_id)}` : ''}`)
        .order('nombre')
      const { data: brs } = await supabase.from('barrios').select('id, nombre, localidad_id').order('nombre')
      if (locs) setLocalidades(locs)
      if (brs) setBarrios(brs)

      setVendedor(fila)
      setCargando(false)
    }
    cargar()
  }, [])

  // Cualquier cambio en el bloque borra el "Listo" de un guardado anterior.
  // Estable (useCallback): el bloque lo tiene en las dependencias de su efecto.
  const alCambiarUbicacion = useCallback((datos) => {
    setUbicacion(datos)
    setGuardado(false)
  }, [])

  async function guardar() {
    setError(null)
    if (!ubicacion?.completo) {
      setError(ubicacion?.faltante || 'Completá tu ubicación.')
      return
    }

    setGuardando(true)
    const resultado = await guardarUbicacion(ubicacion)
    setGuardando(false)

    if (!resultado.ok) {
      setError(resultado.error)
      return
    }
    setGuardado(true)
  }

  // ── Render ──
  // Un único árbol: si el <link> y el Navbar cambiaran de posición según el
  // estado, el HTML del servidor y el del cliente no coincidirían (hydration).

  const menuCats = MENU_CATEGORIAS.map((s) => categorias.find((c) => c.slug === s)).filter(Boolean)

  return (
    <>
      <link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Fraunces:opsz,wght@9..144,100..900&family=Poppins:wght@300;400;500&family=Inter:wght@200;300;400;500;600;700;800;900&display=swap" />

      <div className="min-h-screen bg-white" style={{ fontFamily: "'Inter', sans-serif" }}>
        {menuOpen && <MenuTakeover categorias={menuCats} onClose={() => setMenuOpen(false)} />}
        <Navbar onToggleMenu={() => setMenuOpen(!menuOpen)} variant="solid" />

      <main className="pt-28 pb-12 px-6 max-w-[700px] w-full mx-auto">
        {cargando ? (
          <p className="text-center text-[#0a0a0a]/30 text-sm font-light">Cargando...</p>
        ) : !vendedor ? (
          <p className="text-center text-[#0a0a0a]/30 text-sm font-light">No encontramos tu cuenta de vendedor.</p>
        ) : (
        <>
        <VolverAtras href="/vendedor/perfil" texto="Volver a Mi negocio" />
        <h1 className="text-2xl md:text-3xl mt-2 mb-2" style={fuenteTitulo}>Mi ubicación</h1>
        <p style={{ ...fuenteAyuda, fontSize: '14px', color: 'rgba(10,10,10,0.45)', marginBottom: '32px' }}>
          Elegí cómo te ven en el mapa: con tu dirección exacta o con una zona aproximada.
        </p>

        <div className="mb-8">
          <BloqueUbicacion localidades={localidades} barrios={barrios} inicial={vendedor} onChange={alCambiarUbicacion} />
        </div>

        {guardado && (
          <div className="mb-4 p-3 bg-emerald-50 border border-emerald-200 rounded-lg text-sm text-emerald-800">
            ✓ Listo, guardamos tus cambios.
          </div>
        )}

        {error && (
          <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-800">
            {error}
          </div>
        )}

        <button
          type="button"
          onClick={guardar}
          disabled={guardando}
          className={`px-6 py-2.5 ${guardando ? btnNegroInactivo : btnNegro}`}
        >
          {guardando ? 'Guardando...' : 'Guardar cambios'}
        </button>
        </>
        )}
      </main>
      </div>
    </>
  )
}
