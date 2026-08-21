'use client'

import { useState, useEffect } from 'react'
import Navbar from '@/components/Navbar'
import MenuTakeover from '@/components/MenuTakeover'
import VolverAtras from '@/components/VolverAtras'

const fuenteTitulo = { fontFamily: 'Fraunces, serif', fontWeight: 500, color: '#0a0a0a' }
const fuenteTexto = {
  fontFamily: 'Poppins, sans-serif',
  fontWeight: 300,
  fontSize: '15px',
  color: 'rgba(10,10,10,0.65)',
  lineHeight: 1.7,
}

const SECCIONES = [
  {
    titulo: 'Por qué existe',
    texto: 'Bahía Blanca está llena de proyectos que casi nadie conoce. Marcas que se mueven solo por redes, talleres que venden por mensaje privado, gente que hace cosas hermosas y no tiene dónde mostrarlas. Bahía Shops nace para darles un lugar y para que comprar en tu ciudad sea una opción real, no un esfuerzo.',
  },
  {
    titulo: 'Cómo funciona',
    texto: 'Cada negocio tiene su tienda dentro de la plataforma, con sus productos, sus precios y su forma de envío. Vos comprás directo a través de Bahía Shops, con los medios de pago de Mercado Pago, y el vendedor te lo hace llegar.',
  },
]

export default function SobreNosotrosContent() {
  const [menuAbierto, setMenuAbierto] = useState(false)

  useEffect(() => {
    if (menuAbierto) { document.body.style.overflow = 'hidden' } else { document.body.style.overflow = '' }
    return () => { document.body.style.overflow = '' }
  }, [menuAbierto])

  return (
    <>
      <link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Inter:wght@200;300;400;500;600;700;800;900&display=swap" />
      <link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Fraunces:opsz,wght@9..144,100..900&family=Poppins:wght@300;400;500&display=swap" />

      <div className="min-h-screen bg-white" style={{ fontFamily: "'Inter', sans-serif" }}>
        {menuAbierto && <MenuTakeover onClose={() => setMenuAbierto(false)} />}
        <Navbar onToggleMenu={() => setMenuAbierto(!menuAbierto)} variant="solid" />

        <div className="pt-20 pb-24 px-4 md:px-8">
          <div className="max-w-3xl mx-auto">
            <VolverAtras href="/" texto="Volver al inicio" />

            <p style={{ fontFamily: "'Inter', sans-serif", fontSize: '10px', textTransform: 'uppercase', letterSpacing: '2px', color: 'rgba(10,10,10,0.3)', marginBottom: '10px' }}>
              Bahía Shops
            </p>

            <h1 className="text-[26px] md:text-[34px]" style={{ ...fuenteTitulo, letterSpacing: '-0.02em', marginBottom: '16px' }}>
              Quiénes somos
            </h1>

            <p style={{ ...fuenteTexto, fontSize: '16px', color: 'rgba(10,10,10,0.75)', marginBottom: '40px' }}>
              Bahía Shops es el mercado online de Bahía Blanca. Reunimos en un solo lugar a los comercios, emprendedores y productores de la ciudad, para que encontrar lo que buscás acá sea tan fácil como buscarlo afuera.
            </p>

            {SECCIONES.map((seccion) => (
              <section key={seccion.titulo} style={{ marginBottom: '32px' }}>
                <h2 className="text-[19px] md:text-[22px]" style={{ ...fuenteTitulo, marginBottom: '8px' }}>
                  {seccion.titulo}
                </h2>
                <p style={fuenteTexto}>{seccion.texto}</p>
              </section>
            ))}

            <section style={{ marginBottom: '32px' }}>
              <h2 className="text-[19px] md:text-[22px]" style={{ ...fuenteTitulo, marginBottom: '8px' }}>
                Quiénes estamos detrás
              </h2>
              {/* TODO: texto pendiente — lo escribe Rosario */}
              <p style={fuenteTexto}>
                Próximamente.
              </p>
            </section>

          </div>
        </div>
      </div>
    </>
  )
}
