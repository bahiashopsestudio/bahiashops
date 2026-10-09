// Revisa las plantillas de Supabase Auth que arma scripts/armar-plantillas-auth.mjs
// (carpeta plantillas-auth/): que cada una tenga las variables de Supabase que
// le corresponden, que las imágenes sean URLs absolutas de bahiashops.com.ar/email/,
// que el título tenga como alt su mismo texto y que haya texto de respaldo.
//
//   npm run plantillas-auth && npm run probar:plantillas-auth

import { readFileSync } from 'node:fs'

let fallas = 0
const ok = (c, m) => { if (!c) { fallas++; console.log('  ✗ FALLA:', m) } else console.log('  ✓', m) }
const leer = (f) => readFileSync(new URL(`../plantillas-auth/${f}`, import.meta.url), 'utf8')

const BASE = ['{{ .SiteURL }}', '{{ .TokenHash }}']
const CASOS = [
  { archivo: 'confirmar-registro', titulo: 'Te damos la bienvenida a Bahía Shops', imagen: 'titulo-bienvenida.png', tipo: 'email', variables: [...BASE, '{{ .RedirectTo }}'] },
  { archivo: 'recuperar-contrasena', titulo: 'Elegí una contraseña nueva', imagen: 'titulo-contrasena.png', tipo: 'recovery', variables: [...BASE, '{{ .Email }}'] },
  { archivo: 'cambio-de-email', titulo: 'Confirmá tu nuevo email', imagen: 'titulo-cambio-email.png', tipo: 'email_change', variables: [...BASE, '{{ .Email }}', '{{ .NewEmail }}'] },
  { archivo: 'invitacion', titulo: 'Te invitaron a Bahía Shops', imagen: 'titulo-invitacion.png', tipo: 'invite', variables: BASE },
]

for (const c of CASOS) {
  console.log(`\n${c.archivo}`)
  const html = leer(`${c.archivo}.html`)
  const texto = leer(`${c.archivo}.txt`)
  for (const v of c.variables) ok(html.includes(v), `usa ${v}`)
  const otras = (html.match(/\{\{[^}]*\}\}/g) || []).filter((v) => !c.variables.includes(v))
  ok(otras.length === 0, `no tiene variables de más ni mal escritas${otras.length ? ': ' + otras.join(', ') : ''}`)
  const enlace = `{{ .SiteURL }}/auth/confirmar?token_hash={{ .TokenHash }}&amp;type=${c.tipo}` + (c.tipo === 'email' ? '&amp;redirect_to={{ .RedirectTo }}' : '')
  ok((html.split(`href="${enlace}"`).length - 1) === 2, `el botón y el enlace de respaldo van a /auth/confirmar con type=${c.tipo}`)
  ok(html.includes(`>${enlace}</a>`), 'el enlace se ve escrito, por si el botón no se dibuja')
  ok(!html.includes('ConfirmationURL') && !html.includes('&amp;amp;'), 'no usa {{ .ConfirmationURL }} (solo anda en el mismo navegador) ni quedó doble escapado')
  const imgs = [...html.matchAll(/<img [^>]*src="([^"]+)"[^>]*alt="([^"]*)"/g)].map((m) => ({ src: m[1], alt: m[2] }))
  ok(imgs.length === 2 && imgs.every((i) => i.src.startsWith('https://bahiashops.com.ar/email/')), 'las dos imágenes son URLs absolutas de bahiashops.com.ar/email/')
  ok(imgs.some((i) => i.src.endsWith('/logo.png') && i.alt === 'Bahía Shops'), 'el logo, con alt «Bahía Shops»')
  ok(imgs.some((i) => i.src.endsWith(`/${c.imagen}`) && i.alt === c.titulo), `el título es una imagen (${c.imagen}) con alt igual al texto`)
  ok(!html.includes('/mail/'), 'no quedó ninguna imagen de /mail/')
  ok(/font-family:Fraunces[^"]*font-size:26px/.test(html.slice(html.indexOf(c.imagen))), 'si la imagen no carga, el alt se ve con el estilo del título')
  ok(html.includes('#faf9f7') && html.includes('Poppins') && html.includes('Inter'), 'mismo fondo y tipografías que los mails del sitio')
  ok(texto.startsWith(c.titulo) && texto.includes(`/auth/confirmar?token_hash={{ .TokenHash }}&type=${c.tipo}`) && !/<[a-z]/i.test(texto) && !texto.includes('&amp;'), 'la versión en texto empieza con el título, trae el enlace (con & común) y no tiene HTML')
}

console.log(fallas === 0 ? '\nTODO OK' : `\n${fallas} FALLAS`)
process.exit(fallas ? 1 : 0)
