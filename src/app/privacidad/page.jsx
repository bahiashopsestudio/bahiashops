// src/app/privacidad/page.jsx
'use client'

import { useState } from 'react'
import Link from 'next/link'
import Navbar from '@/components/Navbar'
import MenuTakeover from '@/components/MenuTakeover'
import Footer from '@/components/Footer'
import VolverAtras from '@/components/VolverAtras'

export default function PrivacidadPage() {
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
              Política de Privacidad
            </h1>
            <p className="text-sm text-[#0a0a0a]/40 mb-10">
              Última actualización: julio 2026
            </p>

            {/* Intro */}
            <div className="mb-10 text-[15px] leading-relaxed text-[#0a0a0a]/80">
              <p>
                En Bahía Shops valoramos tu privacidad. Esta Política de Privacidad describe qué datos personales recolectamos, para qué los usamos, con quién los compartimos y cómo los protegemos, en cumplimiento de la Ley N° 25.326 de Protección de Datos Personales y demás normativa aplicable en la República Argentina.
              </p>
              <p className="mt-3">
                Al registrarte o usar bahiashops.com.ar (en adelante, "la Plataforma"), aceptás las prácticas descritas en esta política. Si no estás de acuerdo, te pedimos que no utilices la Plataforma.
              </p>
            </div>

            {/* 1 */}
            <Seccion titulo="1. Responsable del Tratamiento">
              <p>
                El responsable del tratamiento de tus datos personales es Bahía Shops, con domicilio en Bahía Blanca, provincia de Buenos Aires, Argentina. Podés contactarnos en <a href="mailto:bahiashops.estudio@gmail.com" className="underline underline-offset-2 hover:text-[#e60000]">bahiashops.estudio@gmail.com</a>.
              </p>
            </Seccion>

            {/* 2 */}
            <Seccion titulo="2. Qué Datos Recolectamos">
              <p>
                Recolectamos los datos que nos proporcionás directamente y los que se generan a partir del uso de la Plataforma:
              </p>

              <h3 className="font-semibold text-[#0a0a0a] mt-4 mb-1.5">Datos de registro</h3>
              <p>Nombre, apellido, nombre de usuario, dirección de email. Si te registrás con Google, recibimos tu nombre y email asociados a tu cuenta de Google.</p>

              <h3 className="font-semibold text-[#0a0a0a] mt-4 mb-1.5">Datos de compra</h3>
              <p>Direcciones de entrega (calle, número, piso, departamento, barrio, ciudad, código postal), teléfono de contacto para la entrega, historial de pedidos.</p>

              <h3 className="font-semibold text-[#0a0a0a] mt-4 mb-1.5">Datos de vendedores</h3>
              <p>Nombre del emprendimiento, descripción, categoría, dirección del local (si aplica), barrio, horarios de atención, número de WhatsApp, redes sociales, logo e imágenes de portada. Si el vendedor conecta su cuenta de MercadoPago, almacenamos los tokens de acceso necesarios para procesar los pagos (nunca almacenamos datos de tarjeta).</p>

              <h3 className="font-semibold text-[#0a0a0a] mt-4 mb-1.5">Datos de navegación</h3>
              <p>Información técnica como dirección IP, tipo de navegador, sistema operativo, páginas visitadas y duración de la visita. Estos datos se recolectan de forma automática y no permiten identificarte personalmente.</p>
            </Seccion>

            {/* 3 */}
            <Seccion titulo="3. Para Qué Usamos tus Datos">
              <p>
                Utilizamos tus datos personales para las siguientes finalidades:
              </p>
              <ul className="list-disc pl-5 mt-2 space-y-1.5 text-[15px] leading-relaxed text-[#0a0a0a]/80">
                <li>Crear y gestionar tu cuenta de usuario.</li>
                <li>Procesar tus compras y coordinar las entregas.</li>
                <li>Facilitar la comunicación entre compradores y vendedores cuando sea necesario para completar una transacción.</li>
                <li>Enviar notificaciones relacionadas con tus pedidos (confirmación de pago, despacho, etc.).</li>
                <li>Gestionar la moderación de productos publicados.</li>
                <li>Mejorar la experiencia de uso de la Plataforma y sus funcionalidades.</li>
                <li>Cumplir con obligaciones legales y responder a requerimientos de autoridades competentes.</li>
                <li>Prevenir fraudes y actividades no autorizadas.</li>
              </ul>
              <p>
                No utilizamos tus datos para fines distintos a los mencionados. Si en el futuro necesitamos tratar tus datos para una finalidad nueva, te lo comunicaremos y solicitaremos tu consentimiento cuando sea requerido por la ley.
              </p>
            </Seccion>

            {/* 4 */}
            <Seccion titulo="4. Con Quién Compartimos tus Datos">
              <p>
                No vendemos, alquilamos ni comercializamos tus datos personales. Solo los compartimos en los siguientes casos:
              </p>

              <h3 className="font-semibold text-[#0a0a0a] mt-4 mb-1.5">Con la contraparte de una transacción</h3>
              <p>Cuando realizás una compra, compartimos con el vendedor los datos necesarios para completar la entrega (nombre, dirección de envío, teléfono de contacto). De la misma forma, el comprador recibe información del vendedor necesaria para el seguimiento del pedido. La etiqueta personal de la dirección (ej.: "Casa", "Trabajo") es privada y nunca se comparte con el vendedor.</p>

              <h3 className="font-semibold text-[#0a0a0a] mt-4 mb-1.5">Procesador de pagos</h3>
              <p>Los pagos se procesan a través de MercadoPago. Bahía Shops no almacena datos de tarjetas de crédito ni débito. La información financiera se maneja íntegramente bajo los términos y políticas de seguridad de MercadoPago.</p>

              <h3 className="font-semibold text-[#0a0a0a] mt-4 mb-1.5">Proveedores de servicios</h3>
              <p>Utilizamos servicios de terceros para el funcionamiento de la Plataforma: Supabase (base de datos y autenticación), Vercel (hosting), Google (autenticación OAuth), Resend (emails transaccionales) y Cloudflare (DNS y email routing). Estos proveedores acceden a los datos estrictamente necesarios para brindar sus servicios y están sujetos a sus propias políticas de privacidad.</p>

              <h3 className="font-semibold text-[#0a0a0a] mt-4 mb-1.5">Requerimientos legales</h3>
              <p>Podremos compartir tus datos si es requerido por ley, orden judicial o requerimiento de una autoridad competente.</p>
            </Seccion>

            {/* 5 */}
            <Seccion titulo="5. Cookies">
              <p>
                La Plataforma utiliza cookies esenciales para el funcionamiento del sitio (autenticación de sesión). No utilizamos cookies de seguimiento publicitario ni de terceros con fines de marketing.
              </p>
            </Seccion>

            {/* 6 */}
            <Seccion titulo="6. Seguridad de los Datos">
              <p>
                Implementamos medidas técnicas y organizativas razonables para proteger tus datos personales contra acceso no autorizado, alteración, divulgación o destrucción. Entre ellas: conexiones cifradas (HTTPS/TLS), políticas de acceso restringido a nivel de base de datos (Row Level Security), autenticación segura, y almacenamiento de tokens con acceso limitado al servidor.
              </p>
              <p>
                Sin embargo, ningún sistema de transmisión o almacenamiento de datos es 100% seguro. Si tenés motivos para creer que tu interacción con la Plataforma ya no es segura, contactanos de inmediato.
              </p>
            </Seccion>

            {/* 7 */}
            <Seccion titulo="7. Tus Derechos">
              <p>
                De acuerdo con la Ley N° 25.326 de Protección de Datos Personales, tenés derecho a:
              </p>
              <ul className="list-disc pl-5 mt-2 space-y-1.5 text-[15px] leading-relaxed text-[#0a0a0a]/80">
                <li><strong className="text-[#0a0a0a]">Acceso:</strong> solicitar información sobre los datos personales que tenemos sobre vos.</li>
                <li><strong className="text-[#0a0a0a]">Rectificación:</strong> corregir datos inexactos o incompletos.</li>
                <li><strong className="text-[#0a0a0a]">Supresión:</strong> solicitar la eliminación de tus datos cuando ya no sean necesarios para la finalidad para la que fueron recolectados, o cuando retires tu consentimiento.</li>
                <li><strong className="text-[#0a0a0a]">Actualización:</strong> mantener tus datos al día.</li>
              </ul>
              <p>
                Para ejercer cualquiera de estos derechos, escribinos a <a href="mailto:bahiashops.estudio@gmail.com" className="underline underline-offset-2 hover:text-[#e60000]">bahiashops.estudio@gmail.com</a>. Responderemos en un plazo de 10 días hábiles, conforme lo establece la ley.
              </p>
            </Seccion>

            {/* 8 */}
            <Seccion titulo="8. Retención de Datos">
              <p>
                Conservamos tus datos personales mientras tu cuenta esté activa o durante el tiempo necesario para cumplir con las finalidades descritas en esta política. Si solicitás la eliminación de tu cuenta, procederemos a eliminar o anonimizar tus datos, salvo aquellos que debamos conservar por obligaciones legales, fiscales o por la necesidad de resolver controversias pendientes.
              </p>
            </Seccion>

            {/* 9 */}
            <Seccion titulo="9. Menores de Edad">
              <p>
                La Plataforma no está dirigida a menores de 18 años. No recolectamos intencionalmente datos de menores. Si tomamos conocimiento de que un menor nos proporcionó datos personales, procederemos a eliminarlos.
              </p>
            </Seccion>

            {/* 10 */}
            <Seccion titulo="10. Cambios en esta Política">
              <p>
                Podemos actualizar esta Política de Privacidad periódicamente. Publicaremos la versión actualizada en esta misma página con la nueva fecha de actualización. Te recomendamos revisarla periódicamente. El uso continuado de la Plataforma después de la publicación de cambios implica la aceptación de la nueva política.
              </p>
            </Seccion>

            {/* 11 */}
            <Seccion titulo="11. Contacto">
              <p>
                Si tenés preguntas sobre esta Política de Privacidad o sobre el tratamiento de tus datos personales, contactanos:
              </p>
              <div className="mt-3 p-4 rounded-2xl bg-[#0a0a0a]/[0.03] text-[15px] leading-relaxed text-[#0a0a0a]/80">
                <p><strong className="text-[#0a0a0a]">Bahía Shops</strong></p>
                <p>Email: <a href="mailto:bahiashops.estudio@gmail.com" className="underline underline-offset-2 hover:text-[#e60000]">bahiashops.estudio@gmail.com</a></p>
                <p>Sitio web: <a href="https://bahiashops.com.ar" className="underline underline-offset-2 hover:text-[#e60000]">bahiashops.com.ar</a></p>
                <p>Bahía Blanca, Buenos Aires, Argentina</p>
              </div>
            </Seccion>

            {/* Bloque AAIP obligatorio por Ley 25.326 */}
            <div className="mt-12 pt-8 border-t border-[#0a0a0a]/10 text-xs text-[#0a0a0a]/40 leading-relaxed space-y-3">
              <p>
                <strong className="text-[#0a0a0a]/60">Agencia de Acceso a la Información Pública (AAIP).</strong> La AGENCIA DE ACCESO A LA INFORMACIÓN PÚBLICA, en su carácter de Órgano de Control de la Ley N° 25.326, tiene la atribución de atender las denuncias y reclamos que interpongan quienes resulten afectados en sus derechos por incumplimiento de las normas vigentes en materia de protección de datos personales.
              </p>
              <p>
                <strong className="text-[#0a0a0a]/60">Defensa del Consumidor.</strong> Para reclamos ingresá <a href="https://www.argentina.gob.ar/produccion/defensadelconsumidor/formulario" target="_blank" rel="noopener noreferrer" className="underline hover:text-[#e60000]">acá</a>. Ley N° 24.240 de Defensa del Consumidor.
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