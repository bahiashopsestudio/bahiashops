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
    parrafos: [
      'En Bahía Blanca hay muchos negocios y proyectos que tenemos cerca, pero que no conocemos. Algunos venden por redes sociales, otros reciben pedidos por mensaje y muchos todavía no tienen un espacio propio para mostrar todo lo que ofrecen.',
      'Bahía Shops nace para conectarlos con más personas, darles un lugar donde vender y hacer que descubrir los productos de tu ciudad sea más fácil.',
    ],
  },
  {
    titulo: 'Cómo funciona',
    parrafos: [
      'Cada negocio tiene su propia tienda dentro de Bahía Shops, con sus productos, precios y opciones de envío. Podés buscar el producto que necesitás, ubicar tiendas en distintos barrios, explorarlas, elegir lo que buscás y comprar a través de la plataforma con Mercado Pago. Cada vendedor se encarga de hacerte llegar tu compra.',
    ],
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
      <link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Fraunces:opsz,wght@9..144,100..900&family=Poppins:wght@300;400;500;700;900&display=swap" />

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
              Queremos que descubrir y comprar en los negocios de Bahía Blanca sea más fácil. El objetivo de Bahía Shops es conectar a los comercios, emprendedores y productores de nuestra ciudad con las personas que buscan comprar de forma local. Queremos reunir en un mismo lugar la oferta de la ciudad y hacer que descubrir lo que tenemos cerca sea más fácil.
            </p>

            {SECCIONES.map((seccion) => (
              <section key={seccion.titulo} style={{ marginBottom: '32px' }}>
                <h2 className="text-[26px] md:text-[34px]" style={{ ...fuenteTitulo, letterSpacing: '-0.02em', marginBottom: '8px' }}>
                  {seccion.titulo}
                </h2>
                <div className="space-y-5">
                  {seccion.parrafos.map((parrafo) => (
                    <p key={parrafo} style={fuenteTexto}>{parrafo}</p>
                  ))}
                </div>
              </section>
            ))}

            <section style={{ marginBottom: '32px' }}>
              <h2 className="text-[26px] md:text-[34px]" style={{ ...fuenteTitulo, letterSpacing: '-0.02em', marginBottom: '8px' }}>
                Quién está detrás
              </h2>
              <div className="max-w-2xl space-y-5">
                <p style={fuenteTexto}>
                  Soy Rosario, diseñadora industrial y creadora de Bahía Shops.
                </p>
                <p style={fuenteTexto}>
                  Durante diez años llevé adelante una marca de calzado y marroquinería. Con Las Pulpas diseñábamos los productos, los fabricábamos, buscábamos proveedores, sacábamos las fotos y los vendíamos en el local, online y en ferias. Conocí de cerca todo lo que implica sostener un negocio y buscar maneras de llegar a las personas.
                </p>
                <p style={fuenteTexto}>
                  Cuando cerramos la marca, todavía había gente que me decía: «No las conocía». ¡Mi vecina de la esquina no sabía que mi local existía porque nunca caminaba esa cuadra!
                </p>
                <p style={fuenteTexto}>
                  Esa experiencia me dejó algo claro: no alcanza con hacer algo bueno; también tiene que haber una manera de encontrarlo.
                </p>
                <p style={fuenteTexto}>
                  De esa idea nació Bahía Shops: una plataforma pensada para que los negocios locales puedan llegar a más personas y para que quienes vivimos en Bahía Blanca descubramos todo lo que tenemos cerca.
                </p>
                <p style={fuenteTexto}>
                  Lo diseño y desarrollo desde{" "}
                  <a href="https://www.instagram.com/planmaterial" target="_blank" rel="noopener noreferrer" className="text-[#4164fe] underline underline-offset-4 hover:no-underline">
                    Plan Material
                  </a>
                  , mi estudio de diseño industrial y digital. Si tenés una duda, una idea o algo que mejorar, escribime: <span style={{ fontWeight: 500 }}>hola@bahiashops.com.ar</span>
                </p>
              </div>
            </section>

          </div>
        </div>
      </div>
    </>
  )
}
