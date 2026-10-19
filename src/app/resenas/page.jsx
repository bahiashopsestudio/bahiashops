// src/app/resenas/page.jsx
// "Cómo funcionan las reseñas": la política de reseñas, pública. El mismo
// diseño que /terminos y /privacidad. El texto es el de politica-resenas.md,
// tal cual. La enlazan la sección Reseñas de cada tienda, el formulario de
// reseña en Mis pedidos, el panel de reseñas de la tienda y el footer.
'use client'

import { useState, useEffect } from 'react'
import Navbar from '@/components/Navbar'
import MenuTakeover from '@/components/MenuTakeover'
import VolverAtras from '@/components/VolverAtras'

export default function ResenasPage() {
  const [menuAbierto, setMenuAbierto] = useState(false)

  useEffect(() => {
    if (menuAbierto) { document.body.style.overflow = 'hidden' } else { document.body.style.overflow = '' }
    return () => { document.body.style.overflow = '' }
  }, [menuAbierto])

  return (
    <>
      <link
        href="https://fonts.googleapis.com/css2?family=Inter:wght@200;300;400;500;600;700;800;900&display=swap"
        rel="stylesheet"
      />
      <link
        href="https://fonts.googleapis.com/css2?family=Fraunces:opsz,wght@9..144,100..900&display=swap"
        rel="stylesheet"
      />
      <div className="min-h-screen bg-white" style={{ fontFamily: "'Inter', sans-serif" }}>
        {menuAbierto && <MenuTakeover onClose={() => setMenuAbierto(false)} />}
        <Navbar variant="solid" onToggleMenu={() => setMenuAbierto(!menuAbierto)} />

        <main className="pt-20 pb-24 px-4 md:px-8">
          <div className="max-w-3xl mx-auto">

            <VolverAtras />

            <h1
              className="text-3xl md:text-4xl mt-6 mb-10"
              style={{ fontFamily: 'Fraunces, serif', fontWeight: 500, color: '#0a0a0a', letterSpacing: '-0.02em' }}
            >
              Cómo funcionan las reseñas
            </h1>

            <Seccion titulo="Quién puede dejar una reseña">
              <p>Solo quien compró y pagó dentro de Bahía Shops.</p>
              <p>
                No aceptamos reseñas de compras coordinadas por fuera de la plataforma. No es un capricho: es la única forma que tenemos de saber que la compra existió de verdad. Así nadie puede inventar una reseña buena para sí mismo ni una mala para la competencia.
              </p>
              <p>
                La reseña se habilita cuando la tienda marca el pedido como entregado, y podés dejarla hasta 30 días después. Si la tienda nunca lo marca, igual se habilita a los 14 días del pago, para que puedas contar cómo te fue aunque el pedido no haya llegado.
              </p>
            </Seccion>

            <Seccion titulo="Qué se puede poner">
              <p>Una calificación de 1 a 5 estrellas y, si querés, un comentario corto.</p>
              <p>
                La reseña es sobre <strong>tu experiencia con esa tienda</strong>: cómo fue la atención, si el producto era como se mostraba, si la entrega salió bien.
              </p>
              <p>Una vez publicada, la reseña no se puede editar ni borrar. Tomate un momento antes de enviarla.</p>
            </Seccion>

            <Seccion titulo="Cómo aparece">
              <p>
                Tu reseña se firma con tu <strong>apodo</strong>, no con tu nombre. Podés cambiarlo desde tu perfil una vez cada 30 días.
              </p>
              <p>
                El puntaje promedio de una tienda se publica recién cuando tiene <strong>5 reseñas o más</strong>. Hasta entonces figura como «Tienda nueva». Con una sola reseña, un 5 perfecto o un 1 no dicen nada real sobre cómo trabaja esa persona.
              </p>
            </Seccion>

            <Seccion titulo="Si vendés en Bahía Shops">
              <p>
                <strong>Podés responder públicamente a cualquier reseña de tu perfil.</strong> Te lo recomendamos, sobre todo cuando la reseña es mala.
              </p>
              <p>
                Una respuesta tranquila que explique qué pasó dice más de vos que la reseña que la generó. Quien la lea después va a ver cómo resolvés los problemas, y eso construye más confianza que un perfil sin ninguna crítica.
              </p>
              <p>
                <strong>Si creés que una reseña no corresponde, podés pedir que la revisemos</strong> y la miramos a mano.
              </p>
              <p>
                Mientras la revisamos, la reseña sigue visible. Si la ocultáramos apenas se pide la revisión, cualquiera podría hacer desaparecer temporalmente una crítica legítima con solo apretar un botón.
              </p>
            </Seccion>

            <Seccion titulo="Qué revisamos y qué no">
              <p>
                Somos claros con esto para que nadie sienta que las decisiones se toman según el caso o según quién reclama.
              </p>
              <Subtitulo>Ocultamos una reseña si:</Subtitulo>
              <Lista items={[
                'Tiene insultos, agresiones o lenguaje discriminatorio',
                'Expone datos personales de alguien',
                'No habla de la compra (publicidad, reclamos de otra cosa, texto sin sentido)',
                'Comprobamos que no hubo una compra real',
              ]} />
              <Subtitulo>No ocultamos una reseña porque:</Subtitulo>
              <Lista items={[
                'Sea negativa',
                'La tienda no esté de acuerdo con lo que dice',
                'A la tienda le parezca injusta o exagerada',
              ]} />
              <p>
                <strong>Una reseña mala no es una reseña que incumpla las reglas.</strong> Un cliente disconforme tiene derecho a contar que quedó disconforme, aunque del otro lado se haya hecho todo bien. Para eso está la opción de responder.
              </p>
              <p>Una reseña oculta deja de verse y deja de contar para el puntaje.</p>
            </Seccion>

            <Seccion titulo="Pedir la revisión de una reseña">
              <p>
                Desde tu panel de vendedor, en la reseña que querés que revisemos. Vas a tener que elegir un motivo:
              </p>
              <Lista items={[
                'Insultos o agresiones',
                'Contiene datos personales',
                'No es sobre esta compra',
                'Es falsa, esta persona nunca me compró',
              ]} />
              <p>
                Se puede pedir una sola vez por reseña. En tu panel vas a ver cuándo la revisamos y qué decidimos.
              </p>
            </Seccion>

            <Seccion titulo="Una última cosa">
              <p>
                Bahía Shops es de acá. Es muy probable que quien vende y quien compra se crucen en el supermercado.
              </p>
              <p>
                Eso es lo mejor que tiene y también lo que obliga a cuidarlo. Escribí la reseña que te gustaría recibir si estuvieras del otro lado: honesta, incluso cuando duele, pero sin ensañarse.
              </p>
            </Seccion>

          </div>
        </main>

      </div>
    </>
  )
}

function Seccion({ titulo, children }) {
  return (
    <section className="mb-10">
      <h2 className="text-lg font-bold tracking-tight text-[#0a0a0a] mb-3">
        {titulo}
      </h2>
      <div className="space-y-3 text-[15px] leading-relaxed text-[#0a0a0a]/80">
        {children}
      </div>
    </section>
  )
}

function Subtitulo({ children }) {
  return <h3 className="text-[15px] font-semibold text-[#0a0a0a] pt-2">{children}</h3>
}

function Lista({ items }) {
  return (
    <ul className="list-disc pl-5 space-y-1">
      {items.map((item) => <li key={item}>{item}</li>)}
    </ul>
  )
}
