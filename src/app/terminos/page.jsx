// src/app/terminos/page.jsx
'use client'

import { useState } from 'react'
import Link from 'next/link'
import { EMAIL_ARREPENTIMIENTO, EMAIL_CONTACTO, EMAIL_LEGAL } from '@/lib/contacto'
import Navbar from '@/components/Navbar'
import MenuTakeover from '@/components/MenuTakeover'
import Footer from '@/components/Footer'
import VolverAtras from '@/components/VolverAtras'

export default function TerminosPage() {
  const [menuAbierto, setMenuAbierto] = useState(false)

  return (
    <>
      <link
        href="https://fonts.googleapis.com/css2?family=Inter:wght@200;300;400;500;600;700;800;900&display=swap"
        rel="stylesheet"
      />
      <div className="min-h-screen bg-white" style={{ fontFamily: "'Inter', sans-serif" }}>
        <MenuTakeover isOpen={menuAbierto} onClose={() => setMenuAbierto(false)} />
        <Navbar variant="solid" onToggleMenu={() => setMenuAbierto(!menuAbierto)} />

        <main className="pt-20 pb-24 px-4 md:px-8">
          <div className="max-w-3xl mx-auto">

            <VolverAtras />

            <h1 className="text-3xl md:text-4xl font-black tracking-tight text-[#0a0a0a] mt-6 mb-2">
              Términos y Condiciones de Uso
            </h1>
            <p className="text-sm text-[#0a0a0a]/40 mb-10">
              Última actualización: julio 2026
            </p>

            {/* 1 */}
            <Seccion titulo="1. Aceptación de los Términos">
              <p>
                Al acceder, registrarte o utilizar el sitio web bahiashops.com.ar (en adelante, "Bahía Shops", "la Plataforma" o "el Sitio"), aceptás estos Términos y Condiciones de Uso (en adelante, "Términos") y nuestra <Link href="/privacidad" className="underline underline-offset-2 hover:text-[#4164fe]">Política de Privacidad</Link>. Si no estás de acuerdo, no utilices la Plataforma.
              </p>
              <p>
                Bahía Shops se reserva el derecho de modificar estos Términos en cualquier momento. Las modificaciones serán publicadas en esta misma página con la fecha de actualización. El uso continuado de la Plataforma después de la publicación de cambios implica la aceptación de los nuevos Términos.
              </p>
            </Seccion>

            {/* 2 */}
            <Seccion titulo="2. Descripción del Servicio">
              <p>
                Bahía Shops es un marketplace que conecta a vendedores y emprendedores locales de Bahía Blanca y la zona (partido de Bahía Blanca, incluyendo Ingeniero White y General Daniel Cerri) con compradores interesados en productos locales.
              </p>
              <p>
                La Plataforma actúa como intermediaria tecnológica: facilita la publicación de productos, el procesamiento de pagos y la comunicación entre las partes. Bahía Shops no es el vendedor de los productos publicados, no posee stock ni participa de la logística de entrega, salvo que se indique expresamente lo contrario.
              </p>
            </Seccion>

            {/* 3 */}
            <Seccion titulo="3. Capacidad">
              <p>
                Para usar la Plataforma debés ser mayor de 18 años y tener capacidad legal para contratar según la legislación argentina. Al registrarte, declarás que cumplís con estos requisitos.
              </p>
            </Seccion>

            {/* 4 */}
            <Seccion titulo="4. Registro y Cuenta de Usuario">
              <p>
                Para comprar o vender en Bahía Shops es necesario registrarse y crear una cuenta. Podés hacerlo mediante tu cuenta de Google o con email y contraseña. Al registrarte te comprometés a proporcionar información veraz, actual y completa, y a mantenerla actualizada.
              </p>
              <p>
                Tu cuenta es personal e intransferible. Sos responsable de mantener la confidencialidad de tus credenciales y de todas las actividades que se realicen bajo tu cuenta. Ante cualquier uso no autorizado, debés notificarnos de inmediato a <a href={`mailto:${EMAIL_LEGAL}`} className="underline underline-offset-2 hover:text-[#4164fe]">{EMAIL_LEGAL}</a>.
              </p>
            </Seccion>

            {/* 5 */}
            <Seccion titulo="5. Vendedores">
              <p>
                Los vendedores son personas físicas o jurídicas que se registran en la Plataforma para ofrecer sus productos. Al registrarse como vendedor, el usuario acepta las siguientes condiciones:
              </p>
              <ul className="list-disc pl-5 mt-2 space-y-1.5 text-[15px] leading-relaxed text-[#0a0a0a]/80">
                <li>Toda publicación de producto está sujeta a moderación y aprobación por parte de Bahía Shops.</li>
                <li>Los productos publicados deben cumplir con la legislación vigente. Está prohibida la venta de productos ilegales, regulados, falsificados, o que infrinjan derechos de propiedad intelectual.</li>
                <li>Los precios deben ser expresados en pesos argentinos e incluir IVA cuando corresponda. No se permite la opción "a consultar": todo producto debe tener un precio visible.</li>
                <li>El vendedor es el único responsable de la veracidad de la información publicada (descripción, fotos, precio, stock, tiempos de preparación).</li>
                <li>El vendedor es responsable de la entrega del producto en las condiciones y plazos ofrecidos.</li>
                <li>El vendedor debe contar con una cuenta de MercadoPago conectada a la Plataforma para recibir los pagos.</li>
              </ul>
            </Seccion>

            {/* 6 */}
            <Seccion titulo="6. Productos Prohibidos">
              <p>
                Está prohibido publicar en Bahía Shops productos o servicios que:
              </p>
              <ul className="list-disc pl-5 mt-2 space-y-1.5 text-[15px] leading-relaxed text-[#0a0a0a]/80">
                <li>Sean ilegales o cuya comercialización esté restringida por la legislación argentina.</li>
                <li>Infrinjan derechos de propiedad intelectual, marcas registradas o patentes de terceros.</li>
                <li>Sean productos falsificados o réplicas no autorizadas.</li>
                <li>Impliquen la venta de animales vivos.</li>
                <li>Sean armas de fuego, explosivos, sustancias controladas o materiales peligrosos.</li>
                <li>Contengan información de contacto directo (teléfono, redes sociales, email) en la descripción o en las fotos, con el fin de evadir la plataforma.</li>
                <li>Contengan contenido discriminatorio, ofensivo o que incite a la violencia.</li>
              </ul>
              <p>
                Bahía Shops se reserva el derecho de rechazar, suspender o eliminar cualquier publicación que incumpla estas condiciones, sin necesidad de notificación previa.
              </p>
            </Seccion>

            {/* 7 */}
            <Seccion titulo="7. Compras y Pagos">
              <p>
                Todos los pagos se procesan a través de MercadoPago. Bahía Shops no almacena ni tiene acceso a los datos de tarjetas de crédito o débito de los usuarios. La seguridad de las transacciones está sujeta a los términos y condiciones de MercadoPago.
              </p>
              <p>
                Al realizar una compra, el comprador acepta pagar el precio del producto más los costos de envío según el método de entrega seleccionado. El pago se procesa de forma inmediata a través de MercadoPago.
              </p>
            </Seccion>

            {/* 8 */}
            <Seccion titulo="8. Comisión de la Plataforma">
              <p>
                Bahía Shops cobra una comisión del 5% sobre el subtotal de los productos vendidos (no se aplica sobre el costo de envío). Esta comisión se descuenta automáticamente del pago a través del sistema de split de MercadoPago. El vendedor recibe el monto restante directamente en su cuenta de MercadoPago.
              </p>
              <p>
                Bahía Shops se reserva el derecho de modificar el porcentaje de comisión, notificando a los vendedores con una antelación razonable.
              </p>
            </Seccion>

            {/* 9 */}
            <Seccion titulo="9. Envíos y Entregas">
              <p>
                Los métodos de envío disponibles dependen de cada vendedor y pueden incluir entrega a domicilio mediante cadetería local, envío por Correo Argentino, retiro en el local del vendedor, o coordinación directa entre comprador y vendedor.
              </p>
              <p>
                Los costos y tiempos de envío se informan durante el proceso de compra. La responsabilidad por la entrega recae en el vendedor, excepto en los casos en que se utilice Correo Argentino u otro servicio de logística de terceros.
              </p>
            </Seccion>

            {/* 10 */}
            <Seccion titulo="10. Derecho de Retracto (Arrepentimiento)">
              <p>
                De acuerdo con el artículo 34 de la Ley N° 24.240 de Defensa del Consumidor y el artículo 1.110 del Código Civil y Comercial de la Nación, el comprador tiene derecho a revocar la aceptación de la compra dentro de los 10 (diez) días corridos contados desde la recepción del producto o la celebración del contrato, lo que ocurra último.
              </p>
              <p>
                Para ejercer este derecho, el comprador puede utilizar el botón de arrepentimiento disponible en el Sitio (accesible desde el pie de página) o enviar un email a <a href={`mailto:${EMAIL_ARREPENTIMIENTO}`} className="underline underline-offset-2 hover:text-[#4164fe]">{EMAIL_ARREPENTIMIENTO}</a>. Dentro de las 24 horas, Bahía Shops informará al comprador un número de código de identificación del trámite, conforme lo dispuesto por la Resolución 424/2020 de la Secretaría de Comercio Interior.
              </p>
              <p>
                El comprador deberá poner el producto a disposición del vendedor en las mismas condiciones en que lo recibió. Los gastos de devolución corren por cuenta del vendedor.
              </p>
            </Seccion>

            {/* 11 */}
            <Seccion titulo="11. Responsabilidades y Limitaciones">
              <p>
                Bahía Shops actúa exclusivamente como intermediaria tecnológica entre vendedores y compradores. En consecuencia:
              </p>
              <ul className="list-disc pl-5 mt-2 space-y-1.5 text-[15px] leading-relaxed text-[#0a0a0a]/80">
                <li>No garantiza la calidad, seguridad, legalidad o exactitud de los productos publicados por los vendedores.</li>
                <li>No es responsable por incumplimientos del vendedor en cuanto a entrega, estado del producto o servicio post-venta.</li>
                <li>No es responsable por interrupciones temporales del servicio por mantenimiento, actualizaciones o causas de fuerza mayor.</li>
                <li>No es responsable por pérdidas o daños derivados del uso de la Plataforma cuando estos no sean atribuibles directamente a Bahía Shops.</li>
              </ul>
              <p>
                En caso de conflicto entre comprador y vendedor, Bahía Shops podrá mediar de buena fe pero no está obligada a resolver la controversia.
              </p>
            </Seccion>

            {/* 12 */}
            <Seccion titulo="12. Propiedad Intelectual">
              <p>
                Todo el contenido del Sitio (diseño, logos, textos, código fuente, marcas) es propiedad de Bahía Shops o de sus respectivos titulares y está protegido por las leyes de propiedad intelectual vigentes en la República Argentina.
              </p>
              <p>
                Los vendedores otorgan a Bahía Shops una licencia no exclusiva, gratuita y revocable para exhibir las imágenes y descripciones de sus productos dentro de la Plataforma y en materiales promocionales asociados.
              </p>
            </Seccion>

            {/* 13 */}
            <Seccion titulo="13. Suspensión y Cancelación de Cuentas">
              <p>
                Bahía Shops se reserva el derecho de suspender, limitar o cancelar la cuenta de cualquier usuario que:
              </p>
              <ul className="list-disc pl-5 mt-2 space-y-1.5 text-[15px] leading-relaxed text-[#0a0a0a]/80">
                <li>Incumpla estos Términos.</li>
                <li>Proporcione información falsa o engañosa.</li>
                <li>Realice actividades fraudulentas o ilegales.</li>
                <li>Intente evadir los mecanismos de la Plataforma para realizar transacciones por fuera de ella.</li>
                <li>Acumule reclamos o calificaciones negativas de otros usuarios.</li>
              </ul>
            </Seccion>

            {/* 14 */}
            <Seccion titulo="14. Legislación Aplicable y Jurisdicción">
              <p>
                Estos Términos se rigen por las leyes de la República Argentina. Ante cualquier controversia derivada del uso de la Plataforma, las partes se someten a la jurisdicción de los Tribunales Ordinarios de la ciudad de Bahía Blanca, provincia de Buenos Aires, renunciando a cualquier otro fuero que pudiera corresponder.
              </p>
              <p>
                Lo dispuesto en esta cláusula no limita el derecho del consumidor a iniciar acciones ante los tribunales correspondientes a su domicilio, conforme lo establece la Ley N° 24.240.
              </p>
            </Seccion>

            {/* 15 */}
            <Seccion titulo="15. Contacto">
              <p>
                Para consultas, reclamos o ejercer tus derechos como consumidor, podés contactarnos a:
              </p>
              <div className="mt-3 p-4 rounded-2xl bg-[#0a0a0a]/[0.03] text-[15px] leading-relaxed text-[#0a0a0a]/80">
                <p><strong className="text-[#0a0a0a]">Bahía Shops</strong></p>
                <p>Email: <a href={`mailto:${EMAIL_CONTACTO}`} className="underline underline-offset-2 hover:text-[#4164fe]">{EMAIL_CONTACTO}</a></p>
                <p>Sitio web: <a href="https://bahiashops.com.ar" className="underline underline-offset-2 hover:text-[#4164fe]">bahiashops.com.ar</a></p>
                <p>Bahía Blanca, Buenos Aires, Argentina</p>
              </div>
            </Seccion>

            {/* Bloque legal obligatorio */}
            <div className="mt-12 pt-8 border-t border-[#0a0a0a]/10 text-xs text-[#0a0a0a]/40 leading-relaxed space-y-3">
              <p>
                <strong className="text-[#0a0a0a]/60">Defensa del Consumidor.</strong> Para reclamos ingresá <a href="https://www.argentina.gob.ar/produccion/defensadelconsumidor/formulario" target="_blank" rel="noopener noreferrer" className="underline hover:text-[#4164fe]">acá</a>. Ley N° 24.240 de Defensa del Consumidor.
              </p>
              <p>
                Los contratos de adhesión celebrados en el marco de relaciones de consumo serán exhibidos conforme lo dispuesto por la Resolución 270/2020 de la Secretaría de Comercio Interior, bajo el nombre "Contratos de adhesión — Ley N° 24.240 de Defensa del Consumidor".
              </p>
            </div>

          </div>
        </main>

        <Footer />
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
