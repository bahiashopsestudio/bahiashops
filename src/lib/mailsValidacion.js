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
    subject: 'Nos falta un detalle en tu tienda',
    html: `
      <div style="${BASE_ESTILO}">
        <p>¡Hola! Estuvimos mirando tu emprendimiento y necesitamos que ajustes esto:</p>
        <p style="background: #fef3c7; border-radius: 8px; padding: 14px 16px; white-space: pre-wrap; margin: 16px 0;">${escapar(notas)}</p>
        <p>Mientras tanto tu tienda queda fuera de vista. Cuando lo corrijas volvemos a revisarla y te avisamos.</p>
        <a href="${baseUrl}/vendedor/datos" style="${ESTILO_BOTON}">Editar mis datos</a>
        <p style="${ESTILO_PIE}">
          ${escapar(nombreNegocio)} · Bahía Shops<br />
          Escribinos a <a href="mailto:${EMAIL_CONTACTO}" style="color:#999;">${EMAIL_CONTACTO}</a> si necesitás una mano.
        </p>
      </div>
    `,
  }
}

// ── Bloqueo ────────────────────────────────────────────────────────────────
// El bloqueo no es parte de la revisión del alta: es una medida que se toma
// sobre una tienda que ya estaba publicada. Por eso lleva motivo escrito a
// mano y se le manda a la persona tal cual lo escribió el admin.

export function mailBloqueado({ nombreNegocio, motivo }) {
  return {
    from: REMITENTE_CONTACTO,
    reply_to: EMAIL_CONTACTO,
    subject: 'Tu tienda dejó de estar publicada en Bahía Shops',
    html: `
      <div style="${BASE_ESTILO}">
        <p>Hola. Te escribimos para avisarte que suspendimos la publicación de tu tienda en Bahía Shops.</p>
        <p>Este es el motivo:</p>
        <p style="background: #fce4e4; border-radius: 8px; padding: 14px 16px; white-space: pre-wrap; margin: 16px 0;">${escapar(motivo)}</p>
        <p>
          Mientras tanto tu tienda y tus productos no aparecen en el sitio, pero no se borró nada:
          seguís pudiendo entrar a tu panel y todo queda como estaba.
        </p>
        <p>
          Si creés que hubo un error o querés contarnos tu versión, respondé este mail y lo revisamos.
        </p>
        <p style="${ESTILO_PIE}">
          ${escapar(nombreNegocio)} · Bahía Shops<br />
          Escribinos a <a href="mailto:${EMAIL_CONTACTO}" style="color:#999;">${EMAIL_CONTACTO}</a> por cualquier duda.
        </p>
      </div>
    `,
  }
}

export function mailDesbloqueado({ nombreNegocio, slug, baseUrl }) {
  return {
    from: REMITENTE_CONTACTO,
    reply_to: EMAIL_CONTACTO,
    subject: 'Tu tienda volvió a estar publicada en Bahía Shops',
    html: `
      <div style="${BASE_ESTILO}">
        <p>¡Hola! Tu tienda volvió a estar publicada en Bahía Shops.</p>
        <p>Ya se puede encontrar de nuevo, con todos tus productos tal como los tenías.</p>
        <a href="${baseUrl}/tienda/${encodeURIComponent(slug)}" style="${ESTILO_BOTON}">Ver mi tienda</a>
        <p style="${ESTILO_PIE}">
          ${escapar(nombreNegocio)} · Bahía Shops<br />
          Escribinos a <a href="mailto:${EMAIL_CONTACTO}" style="color:#999;">${EMAIL_CONTACTO}</a> si necesitás una mano.
        </p>
      </div>
    `,
  }
}
