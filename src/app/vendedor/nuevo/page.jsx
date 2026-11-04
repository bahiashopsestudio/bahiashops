'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import Navbar from '@/components/Navbar'
import MenuTakeover from '@/components/MenuTakeover'
import VolverAtras from '@/components/VolverAtras'
import FormularioVendedor from './FormularioVendedor'

const MENU_CATEGORIAS = ['moda','belleza-y-bienestar','joyeria-y-accesorios','hogar-y-deco','artes-y-oficios','bebes-y-maternidad','juegos-y-juguetes','mascotas','libros','deporte','vintage']

export default function NuevoVendedorPage() {
  const supabase = createClient()
  const router = useRouter()
  const [menuOpen, setMenuOpen] = useState(false)
  const [categorias, setCategorias] = useState([])
  const [userId, setUserId] = useState(null)
  const [verificando, setVerificando] = useState(true)
  const [suscribirme, setSuscribirme] = useState(false)

  useEffect(() => {
    if (menuOpen) { document.body.style.overflow = 'hidden' } else { document.body.style.overflow = '' }
    return () => { document.body.style.overflow = '' }
  }, [menuOpen])

  useEffect(() => {
    // Desde «Sumarme con el Básico» de /vender: al terminar, el panel abre el
    // alta de la suscripción. Se lleva por /entrar y hasta el panel. Se lee
    // antes de esperar nada: después, la dirección ya puede ser otra.
    const conBasico = new URLSearchParams(window.location.search).get('suscribirme') === 'basico'

    async function cargar() {
      setSuscribirme(conBasico)
      const { data } = await supabase.from('categorias').select('id, nombre, slug').eq('activa', true).order('orden')
      if (data) setCategorias(data)

      // Sin sesión no hay alta posible: a /entrar, con vuelta acá mismo.
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) {
        router.replace(`/entrar?next=${encodeURIComponent(conBasico ? '/vendedor/nuevo?suscribirme=basico' : '/vendedor/nuevo')}`)
        return
      }

      const { data: vendedorExistente } = await supabase
        .from('vendedores')
        .select('id')
        .eq('usuario_id', user.id)
        .maybeSingle()

      if (vendedorExistente) {
        router.replace(conBasico ? '/vendedor/perfil?suscribirme=basico' : '/vendedor/perfil')
        return
      }

      setUserId(user.id)
      setVerificando(false)
    }
    cargar()
  }, [])

  const menuCats = MENU_CATEGORIAS.map(s => categorias.find(c => c.slug === s)).filter(Boolean)

  return (
    <>
      <link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Fraunces:opsz,wght@9..144,100..900&family=Poppins:wght@300;400;500&family=Inter:wght@200;300;400;500;600;700;800;900&display=swap" />

      <div className="min-h-screen bg-white" style={{ fontFamily: "'Inter', sans-serif" }}>
        {menuOpen && <MenuTakeover categorias={menuCats} onClose={() => setMenuOpen(false)} />}
        <Navbar onToggleMenu={() => setMenuOpen(!menuOpen)} variant="solid" />

        <div className="pt-20 pb-24 px-4 md:px-8">
          <div className="max-w-xl mx-auto">
            <VolverAtras href="/vender" texto="Volver" />

            {!verificando && (
              <>
                <h1
                  className="text-2xl md:text-3xl mb-2"
                  style={{ fontFamily: "'Fraunces', serif", fontWeight: 500, color: '#0a0a0a', letterSpacing: '-0.02em' }}
                >
                  Sumar mi emprendimiento
                </h1>
                {userId &&<FormularioVendedor userId={userId} panel={suscribirme ? '/vendedor/perfil?suscribirme=basico' : '/vendedor/perfil'} />}
              </>
            )}
          </div>
        </div>
      </div>
    </>
  )
}