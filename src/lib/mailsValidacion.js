// Mails que se le mandan al vendedor cuando el admin revisa su emprendimiento.
// El envío vive en la ruta de administración: acá solo se arma el contenido.

import { EMAIL_CONTACTO, REMITENTE_CONTACTO } from '@/lib/contacto'

const BASE_ESTILO = 'font-family: sans-serif; max-width: 520px; color: #0a0a0a; line-height: 1.6;'
const ESTILO_BOTON =
  'display: inline-block; background: #0a0a0a; color: #ffffff; text-decoration: none; ' +
  'font-weight: 500; font-size: 14px; border-radius: 4px; padding: 14px 28px; margin: 24px 0;'
const ESTILO_PIE = 'color: #999; font-size: 12px; margin-top: 32px;'

function escapar(texto) {
  return String(texto)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

export function mailAprobado({ nombreNegocio, slug, baseUrl }) {
  return {
    from: REMITENTE_CONTACTO,
    reply_to: EMAIL_CONTACTO,
    subject: 'Tu tienda ya está publicada en Bahía Shops',
    html: `
      <div style="${BASE_ESTILO}">
        <p>¡Hola! Revisamos tu emprendimiento y tu tienda ya está publicada.</p>
        <p>Desde ahora cualquiera en Bahía Blanca puede encontrarte, ver tus productos y comprarte.</p>
        <a href="${baseUrl}/tienda/${encodeURIComponent(slug)}" style="${ESTILO_BOTON}">Ver mi tienda</a>
        <p>Si querés sumar más productos o cambiar algo, entrá a tu panel cuando quieras.</p>
        <p style="${ESTILO_PIE}">
          ${escapar(nombreNegocio)} · Bahía Shops<br />
          Escribinos a <a href="mailto:${EMAIL_CONTACTO}" style="color:#999;">${EMAIL_CONTACTO}</a> si necesitás una mano.
        </p>
      </div>
    `,
  }
}

export function mailNecesitaCambios({ nombreNegocio, notas, baseUrl }) {
  return {
    from: REMITENTE_CONTACTO,
    reply_to: EMAIL_CONTACTO,
    subject: 'Nos falta un detalle para publicar tu tienda',
    html: `
      <div style="${BASE_ESTILO}">
        <p>¡Hola! Estuvimos mirando tu emprendimiento y antes de publicarlo necesitamos que ajustes esto:</p>
        <p style="background: #fef3c7; border-radius: 8px; padding: 14px 16px; white-space: pre-wrap; margin: 16px 0;">${escapar(notas)}</p>
        <p>Cuando lo corrijas volvemos a revisarlo y te avisamos.</p>
        <a href="${baseUrl}/vendedor/datos" style="${ESTILO_BOTON}">Editar mis datos</a>
        <p style="${ESTILO_PIE}">
          ${escapar(nombreNegocio)} · Bahía Shops<br />
          Escribinos a <a href="mailto:${EMAIL_CONTACTO}" style="color:#999;">${EMAIL_CONTACTO}</a> si necesitás una mano.
        </p>
      </div>
    `,
  }
}
