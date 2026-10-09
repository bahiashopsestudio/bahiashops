// Arma las plantillas de los mails de Supabase Auth (confirmar registro,
// recuperar contraseña, cambio de email e invitación) con el mismo diseño que
// los mails del sitio (src/lib/mailBase.js) y las guarda en plantillas-auth/,
// para copiarlas a mano en el panel de Supabase. No manda nada ni toca Supabase.
//
//   npm run plantillas-auth
//
// Las variables ({{ .SiteURL }}, {{ .TokenHash }}, {{ .RedirectTo }}, {{ .Email }}
// y {{ .NewEmail }}) las completa Supabase al mandar cada mail. Las imágenes
// (logo y títulos) se sirven desde https://bahiashops.com.ar/email/: los PNG
// están en public/email/.
//
// El enlace NO es {{ .ConfirmationURL }}: ese vuelve con un «code» que solo se
// puede canjear en el navegador donde se hizo el registro (PKCE). Va a
// /auth/confirmar con el {{ .TokenHash }}, y el servidor confirma con verifyOtp
// desde cualquier navegador o dispositivo (src/lib/confirmacionAuth.js).

import { register } from 'node:module'
import { mkdir, writeFile } from 'node:fs/promises'

const raiz = new URL('../', import.meta.url)
const alias = `
const src = ${JSON.stringify(new URL('src/', raiz).href)}
export function resolve(especificador, contexto, siguiente) {
  if (especificador.startsWith('@/')) {
    const ruta = src + especificador.slice(2)
    return siguiente(/\\.[a-z]+$/.test(ruta) ? ruta : ruta + '.js', contexto)
  }
  return siguiente(especificador, contexto)
}
`
register('data:text/javascript,' + encodeURIComponent(alias))

const {
  plantilla, lineaAzul, parrafo, boton, escapar, negrita,
  ESTILO_TITULO, FUENTE_TEXTO, GRIS, BORDE, TABLA, ACENTO,
} = await import('../src/lib/mailBase.js')
const { SITIO_URL } = await import('../src/lib/sitio.js')

const IMAGENES = `${SITIO_URL}/email`

// El título va como imagen (con la tipografía del sitio). Si el programa de mail
// no muestra imágenes, se ve el alt con el estilo del título: es el mismo texto.
function tituloImagen(archivo, texto) {
  return `<img src="${IMAGENES}/${archivo}" width="500" height="40" alt="${escapar(texto)}" style="display:block;border:0;max-width:100%;height:auto;margin:0 0 20px;${ESTILO_TITULO}">`
}

// El texto que muestran algunos programas al lado del asunto, antes de abrir.
function previa(texto) {
  return `<div style="display:none;max-height:0;overflow:hidden;opacity:0;mso-hide:all;">${escapar(texto)}</div>`
}

// Si el botón no anda (o el programa no lo dibuja), el enlace a la vista.
function enlaceDeRespaldo(enlace) {
  return `<p style="margin:20px 0 0;font-family:${FUENTE_TEXTO};font-size:13px;font-weight:300;line-height:1.6;color:${GRIS};">` +
    `Si el botón no funciona, copiá este enlace y pegalo en tu navegador:<br>` +
    `<a href="${enlace}" style="color:${ACENTO};word-break:break-all;">${enlace}</a></p>`
}

// El enlace de cada mail: la página propia de confirmación, con el token y el
// type de verifyOtp. El & va como &amp; (HTML válido; el navegador lo lee como &).
// Al registro se le suma el redirect_to, para volver a donde estaba la persona.
function enlaceDeConfirmacion(tipo, { conRedirect = false } = {}) {
  return `{{ .SiteURL }}/auth/confirmar?token_hash={{ .TokenHash }}&amp;type=${tipo}` +
    (conRedirect ? '&amp;redirect_to={{ .RedirectTo }}' : '')
}

function pie(aviso) {
  return [
    `<p style="margin:20px 0 0;font-family:${FUENTE_TEXTO};font-size:13px;font-weight:300;line-height:1.6;color:${GRIS};">${escapar(aviso)}</p>`,
    `<table ${TABLA} width="100%" style="margin:28px 0 0;"><tr><td style="border-top:1px solid ${BORDE};padding:16px 0 0;font-family:${FUENTE_TEXTO};font-size:12px;font-weight:300;line-height:1.6;color:${GRIS};">Bahía Shops · Bahía Blanca, Argentina. Este mail lo mandamos automáticamente: no hace falta responderlo.</td></tr></table>`,
  ].join('\n')
}

// La plantilla de mailBase usa el logo de /mail/; estas usan el de /email/.
function conLogoDeEmail(html) {
  const viejo = `${SITIO_URL}/mail/logo.png`
  if (!html.includes(viejo)) throw new Error('No encontré el logo en la plantilla de mailBase: revisá conLogoDeEmail.')
  return html.split(viejo).join(`${IMAGENES}/logo.png`)
}

const PLANTILLAS = [
  {
    archivo: 'confirmar-registro',
    panel: 'Confirm signup',
    asunto: 'Confirmá tu cuenta en Bahía Shops',
    linea: 'Tu cuenta',
    imagen: 'titulo-bienvenida.png',
    titulo: 'Te damos la bienvenida a Bahía Shops',
    previa: 'Confirmá tu email para terminar de crear tu cuenta.',
    parrafos: [
      'Gracias por sumarte. Para terminar de crear tu cuenta, confirmá que este email es tuyo.',
    ],
    boton: 'Confirmar mi email',
    enlace: enlaceDeConfirmacion('email', { conRedirect: true }),
    aviso: 'Si no creaste una cuenta en Bahía Shops, ignorá este mail: sin la confirmación la cuenta no se activa.',
  },
  {
    archivo: 'recuperar-contrasena',
    panel: 'Reset Password',
    asunto: 'Cambiá tu contraseña de Bahía Shops',
    linea: 'Tu cuenta',
    imagen: 'titulo-contrasena.png',
    titulo: 'Elegí una contraseña nueva',
    previa: 'Recibimos un pedido para cambiar tu contraseña.',
    parrafos: [
      `Recibimos un pedido para cambiar la contraseña de tu cuenta (${negrita('{{ .Email }}')}). Tocá el botón para elegir una nueva.`,
      'El enlace sirve una sola vez y por un tiempo limitado.',
    ],
    parrafosConHtml: true,
    boton: 'Elegir contraseña nueva',
    enlace: enlaceDeConfirmacion('recovery'),
    aviso: 'Si no lo pediste vos, ignorá este mail: tu contraseña sigue siendo la misma.',
  },
  {
    archivo: 'cambio-de-email',
    panel: 'Change Email Address',
    asunto: 'Confirmá tu nuevo email en Bahía Shops',
    linea: 'Tu cuenta',
    imagen: 'titulo-cambio-email.png',
    titulo: 'Confirmá tu nuevo email',
    previa: 'Confirmá el cambio de email de tu cuenta.',
    parrafos: [
      `Pediste cambiar el email de tu cuenta de ${negrita('{{ .Email }}')} a ${negrita('{{ .NewEmail }}')}. Para que el cambio quede hecho, confirmalo con el botón.`,
    ],
    parrafosConHtml: true,
    boton: 'Confirmar el cambio',
    enlace: enlaceDeConfirmacion('email_change'),
    aviso: 'Si no pediste este cambio, no toques el botón y escribinos respondiendo a hola@bahiashops.com.ar.',
  },
  {
    archivo: 'invitacion',
    panel: 'Invite user',
    asunto: 'Te invitaron a Bahía Shops',
    linea: 'Invitación',
    imagen: 'titulo-invitacion.png',
    titulo: 'Te invitaron a Bahía Shops',
    previa: 'Aceptá la invitación para entrar a Bahía Shops.',
    parrafos: [
      'Te invitaron a sumarte a Bahía Shops, el mercado online de emprendimientos de Bahía Blanca. Tocá el botón para aceptar la invitación y entrar.',
    ],
    boton: 'Aceptar la invitación',
    enlace: enlaceDeConfirmacion('invite'),
    aviso: 'Si no esperabas esta invitación, ignorá este mail.',
  },
]

// El botón de mailBase escapa el href (y convertiría &amp; en &amp;amp;): acá el
// enlace ya viene armado y con las variables de Supabase, así que se arma igual
// pero sin volver a escapar.
function botonConEnlace(texto, enlace) {
  const html = boton(texto, 'ENLACE')
  if (!html.includes('href="ENLACE"')) throw new Error('El botón de mailBase cambió: revisá botonConEnlace.')
  return html.replace('href="ENLACE"', `href="${enlace}"`)
}

function armarHtml(p) {
  const cuerpo = [
    previa(p.previa),
    lineaAzul(p.linea),
    tituloImagen(p.imagen, p.titulo),
    ...p.parrafos.map((t) => parrafo(p.parrafosConHtml ? t : escapar(t))),
    botonConEnlace(p.boton, p.enlace),
    enlaceDeRespaldo(p.enlace),
    pie(p.aviso),
  ].join('\n')
  return conLogoDeEmail(plantilla({ asunto: p.asunto, cuerpo }))
}

// La versión en texto: para leer o para un programa que no muestra HTML.
function armarTexto(p) {
  const sinEtiquetas = (t) => t.replace(/<[^>]+>/g, '')
  return [
    p.titulo,
    ...p.parrafos.map(sinEtiquetas),
    `${p.boton}: ${p.enlace.split('&amp;').join('&')}`,
    p.aviso,
    'Bahía Shops · Bahía Blanca, Argentina.',
  ].join('\n\n') + '\n'
}

const destino = new URL('plantillas-auth/', raiz)
await mkdir(destino, { recursive: true })
for (const p of PLANTILLAS) {
  await writeFile(new URL(`${p.archivo}.html`, destino), armarHtml(p))
  await writeFile(new URL(`${p.archivo}.txt`, destino), armarTexto(p))
  console.log(`${p.archivo}.html / .txt  →  Supabase: «${p.panel}», asunto: «${p.asunto}», imagen: ${IMAGENES}/${p.imagen}`)
}
console.log(`\nLogo: ${IMAGENES}/logo.png`)

export { PLANTILLAS, armarHtml, armarTexto }
