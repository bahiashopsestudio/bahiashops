'use client'

import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'
import Navbar from '@/components/Navbar'
import MenuTakeover from '@/components/MenuTakeover'
import VolverAtras from '@/components/VolverAtras'
import FormularioDireccion from '@/components/FormularioDireccion'

const MENU_CATEGORIAS = ['moda','belleza-y-cuidado-personal','gastronomia','hogar-deco-y-jardin','diseno-y-artesanias','tecnologia','salud-y-bienestar','arte-e-ilustracion']

export default function MisDireccionesPage() {
  const supabase = createClient()
  const [direcciones, setDirecciones] = useState([])
  const [cargando, setCargando] = useState(true)
  const [mostrarForm, setMostrarForm] = useState(false)
  const [menuOpen, setMenuOpen] = useState(false)
  const [categorias, setCategorias] = useState([])

  useEffect(() => {
    if (menuOpen) { document.body.style.overflow = 'hidden' } else { document.body.style.overflow = '' }
    return () => { document.body.style.overflow = '' }
  }, [menuOpen])

  useEffect(() => {
    async function cargar() {
      const { data: cats } = await supabase.from('categorias').select('id, nombre, slug').eq('activa', true).order('orden')
      if (cats) setCategorias(cats)
      await cargarDirecciones()
    }
    cargar()
  }, [])

  async function cargarDirecciones() {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) { setCargando(false); return }

    const { data } = await supabase
      .from('direcciones')
      .select('*')
      .eq('usuario_id', user.id)
      .order('creada_en', { ascending: true })

    setDirecciones(data || [])
    setCargando(false)
  }

  function alGuardar(nueva) {
    setDirecciones((actual) => [...actual, nueva])
    setMostrarForm(false)
  }

  const menuCats = MENU_CATEGORIAS.map(s => categorias.find(c => c.slug === s)).filter(Boolean)

  if (cargando) {
    return (
      <>
        <link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Inter:wght@200;300;400;500;600;700;800;900&display=swap" />
        <div className="min-h-screen bg-white flex items-center justify-center" style={{ fontFamily: "'Inter', sans-serif" }}>
          <span className="text-[#0a0a0a]/30 text-sm font-light">Cargando...</span>
        </div>
      </>
    )
  }

  return (
    <>
      <link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Inter:wght@200;300;400;500;600;700;800;900&display=swap" />

      <div className="min-h-screen bg-white" style={{ fontFamily: "'Inter', sans-serif" }}>
        {menuOpen && <MenuTakeover categorias={menuCats} onClose={() => setMenuOpen(false)} />}
        <Navbar onToggleMenu={() => setMenuOpen(!menuOpen)} variant="solid" />

        <div className="pt-20 pb-24 px-4 md:px-8">
          <div className="max-w-xl mx-auto">

            <VolverAtras href="/perfil" texto="Volver al perfil" />

            <h1 className="text-2xl md:text-3xl font-black text-[#0a0a0a] tracking-tight mb-1">
              Mis direcciones
            </h1>
            <p className="text-sm text-[#0a0a0a]/30 font-light mb-6">
              Guardá tus direcciones para usarlas al comprar.
            </p>

            {/* Lista */}
            {direcciones.map((dir) => (
              <div key={dir.id} className="rounded-2xl border border-[#0a0a0a]/5 p-5 mb-3">
                <div className="flex items-center gap-2 mb-2">
                  <svg className="w-4 h-4 text-[#0a0a0a]/25 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M15 10.5a3 3 0 1 1-6 0 3 3 0 0 1 6 0Z" />
                    <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 10.5c0 7.142-7.5 11.25-7.5 11.25S4.5 17.642 4.5 10.5a7.5 7.5 0 1 1 15 0Z" />
                  </svg>
                  <span className="text-sm font-medium text-[#0a0a0a]">{dir.etiqueta || 'Sin etiqueta'}</span>
                  {dir.es_principal && (
                    <span className="text-[10px] bg-[#F5F2EC] text-[#0a0a0a]/50 px-2 py-0.5 rounded-full font-light">
                      Principal
                    </span>
                  )}
                </div>
                <p className="text-sm text-[#0a0a0a]/40 font-light leading-relaxed ml-6">
                  {dir.calle} {dir.numero}{dir.piso_depto ? `, ${dir.piso_depto}` : ''}
                  {dir.referencia && <><br /><span className="text-[#0a0a0a]/25">{dir.referencia}</span></>}
                  <br />Tel. {dir.telefono}
                </p>
              </div>
            ))}

            {/* Formulario o botón */}
            {mostrarForm ? (
              <div className="rounded-2xl border border-[#0a0a0a]/5 p-5 mt-2">
                <h2 className="text-lg font-black text-[#0a0a0a] tracking-tight mb-4">Nueva dirección</h2>
                <FormularioDireccion
                  esPrimera={direcciones.length === 0}
                  onGuardada={alGuardar}
                  onCancelar={() => setMostrarForm(false)}
                />
              </div>
            ) : (
              <button
                type="button"
                onClick={() => setMostrarForm(true)}
                className="w-full py-3.5 border border-dashed border-[#0a0a0a]/15 rounded-2xl text-sm text-[#0a0a0a]/40 font-light cursor-pointer hover:border-[#0a0a0a]/30 hover:text-[#0a0a0a]/60 transition mt-2"
              >
                + Agregar dirección
              </button>
            )}
          </div>
        </div>
      </div>
    </>
  )
}