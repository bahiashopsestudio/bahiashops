// Prueba el formulario de contacto («Contactanos») con la sesión: que el email
// se precargue solo si hay una sesión activa, que después de cerrar sesión no
// quede el de la persona anterior, y que el mensaje salga a nombre de quien
// tiene la sesión al enviar (o de nadie). Son las funciones que usa
// src/components/ModalContacto.jsx, con un Supabase de mentira.
//
// La reproducción del problema: iniciar sesión, abrir el formulario, cerrar
// sesión y volver a abrirlo. Antes, el formulario (que vive en el layout raíz)
// leía la sesión una sola vez al montarse y la guardaba para siempre.
//
//   npm run probar:contacto

import { readFileSync } from 'node:fs'
import { sesionParaContacto, precargarEmail } from '../src/lib/formularioContacto.js'

let fallas = 0
const ok = (c, m) => { if (!c) { fallas++; console.log('  ✗ FALLA:', m) } else console.log('  ✓', m) }

// Un Supabase de mentira con una sesión que se puede abrir y cerrar.
function supabaseDeMentira() {
  let usuario = null
  let lecturas = 0
  return {
    iniciar(u) { usuario = u },
    cerrar() { usuario = null },
    get lecturas() { return lecturas },
    auth: { getUser: async () => { lecturas++; return { data: { user: usuario } } } },
  }
}

// Lo que hace el formulario al abrirse: arranca vacío y precarga con la sesión.
async function abrir(supabase, escritoMientrasCarga = '') {
  let email = escritoMientrasCarga
  const sesion = await sesionParaContacto(supabase)
  email = precargarEmail(email, sesion)
  return email
}

console.log('1. La reproducción')
const sb = supabaseDeMentira()
sb.iniciar({ id: 'u-ana', email: 'ana@correo.test' })
ok((await abrir(sb)) === 'ana@correo.test', 'con sesión: el email se precarga')
sb.cerrar()
ok((await abrir(sb)) === '', 'después de cerrar sesión, al volver a abrir el email está vacío')
ok((await sesionParaContacto(sb)).usuarioId === null, 'y el mensaje ya no sale a nombre de la cuenta anterior')
sb.iniciar({ id: 'u-beto', email: 'beto@correo.test' })
ok((await abrir(sb)) === 'beto@correo.test', 'con otra sesión: el email de la persona nueva, no el de la anterior')
ok((await sesionParaContacto(sb)).usuarioId === 'u-beto', 'y su cuenta')
ok(sb.lecturas >= 4, 'la sesión se lee cada vez, no una sola al montar')

console.log('\n2. Al enviar')
sb.iniciar({ id: 'u-ana', email: 'ana@correo.test' })
const alAbrir = await sesionParaContacto(sb)
sb.cerrar()
const alEnviar = await sesionParaContacto(sb)
ok(alAbrir.usuarioId === 'u-ana' && alEnviar.usuarioId === null, 'si la sesión se cerró con el formulario abierto, el mensaje sale sin cuenta')

console.log('\n3. Sin pisar lo que escribió la persona')
ok(precargarEmail('mio@correo.test', { email: 'ana@correo.test' }) === 'mio@correo.test', 'si escribió un email mientras se leía la sesión, se respeta')
ok(precargarEmail('   ', { email: 'ana@correo.test' }) === 'ana@correo.test', 'si solo hay espacios, se precarga')
ok(precargarEmail('', { email: '' }) === '' && precargarEmail('', null) === '', 'sin sesión no se inventa nada')

console.log('\n4. Si la lectura falla')
const roto = { auth: { getUser: async () => { throw new Error('sin red') } } }
const vacio = await sesionParaContacto(roto)
ok(vacio.email === '' && vacio.usuarioId === null, 'nunca lanza: queda vacío y sin cuenta')
ok((await sesionParaContacto({ auth: { getUser: async () => ({ data: null }) } })).usuarioId === null, 'una respuesta sin datos: sin cuenta')

console.log('\n5. El componente usa estas funciones (no un valor leído una sola vez)')
const fuente = readFileSync(new URL('../src/components/ModalContacto.jsx', import.meta.url), 'utf8')
ok(/if \(!abierto\) return null\s*\n\s*return <FormularioContacto/.test(fuente), 'cerrado no se dibuja y el formulario se monta de nuevo en cada apertura (arranca vacío)')
ok(/onAuthStateChange/.test(fuente) && /SIGNED_OUT/.test(fuente), 'escucha el cierre de sesión con el formulario abierto')
ok(/usuario_id: usuarioId/.test(fuente) && /const \{ usuarioId \} = await sesionParaContacto\(supabase\)/.test(fuente), 'al enviar vuelve a leer la sesión')
ok(!/useState\(null\)/.test(fuente) && !/setUserId/.test(fuente), 'ya no guarda la cuenta en un estado leído una sola vez')

console.log(fallas === 0 ? '\nTODO OK' : `\n${fallas} FALLAS`)
process.exit(fallas ? 1 : 0)
