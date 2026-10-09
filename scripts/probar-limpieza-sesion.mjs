// Prueba que al cerrar sesión el sitio queda «como nuevo» en el navegador:
// se borran el carrito y las tiendas seguidas, en esta pestaña y en las otras,
// las otras pestañas se recargan, y no queda ninguna clave de la persona sin
// inventariar. Con un navegador de mentira (dos pestañas que comparten
// localStorage y tienen cada una su sessionStorage) y un Supabase de mentira que
// reparte el aviso de sesión cerrada entre pestañas, como hace el de verdad.
//
//   npm run probar:limpieza-sesion

import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { CLAVES_DE_LA_PERSONA, borrarDatosDeLaPersona, cerrarSesion, alCerrarseLaSesion } from '../src/lib/datosDelNavegador.js'
import { guardarCarrito } from '../src/lib/carrito.js'

let fallas = 0
const ok = (c, m) => { if (!c) { fallas++; console.log('  ✗ FALLA:', m) } else console.log('  ✓', m) }

class Almacen {
  constructor() { this.m = new Map() }
  getItem(k) { return this.m.has(k) ? this.m.get(k) : null }
  setItem(k, v) { this.m.set(k, String(v)) }
  removeItem(k) { this.m.delete(k) }
  get claves() { return [...this.m.keys()].sort() }
}

// Un navegador con dos pestañas y un Supabase que avisa a todas (BroadcastChannel).
function navegador() {
  const local = new Almacen()
  const oyentes = []
  const pestanas = ['A', 'B'].map((nombre) => {
    const p = { nombre, sesion: new Almacen(), recargas: 0, memoriaVaciada: 0 }
    const handler = (evento) => {
      if (evento !== 'SIGNED_OUT') return
      alCerrarseLaSesion({ almacen: local, almacenDeLaPestana: p.sesion, vaciarMemoria: () => p.memoriaVaciada++, recargar: () => p.recargas++ })
    }
    oyentes.push(handler)
    p.supabase = { auth: { signOut: async () => { for (const o of oyentes) o('SIGNED_OUT'); return { error: null } } } }
    return p
  })
  const vencer = () => { for (const o of oyentes) o('SIGNED_OUT') }
  return { local, pestanas, vencer }
}

function cargarDatos(local) {
  local.setItem('bahiashops_carrito', JSON.stringify([{ vendedorId: 15, items: [{ productoId: 1, cantidad: 2 }] }]))
  local.setItem('vendedores_seguidos', JSON.stringify([15, 22]))
  local.setItem('otra-cosa-tecnica', '1')
}

console.log('1. Cerrar sesión en la pestaña A')
{
  const { local, pestanas: [A, B] } = navegador()
  cargarDatos(local)
  await cerrarSesion(A.supabase, undefined, A.sesion)
  ok(local.getItem('bahiashops_carrito') === null, 'el carrito se borró')
  ok(local.getItem('vendedores_seguidos') === null, 'las tiendas seguidas se borraron')
  ok(local.getItem('otra-cosa-tecnica') === '1', 'lo que no es de la persona no se toca')
  ok(A.memoriaVaciada === 1 && B.memoriaVaciada === 1, 'el carrito en memoria se vacía en las dos pestañas')
  ok(A.recargas === 0, 'la pestaña que cerró la sesión no se recarga (la pantalla decide adónde ir)')
  ok(B.recargas === 1, 'la otra pestaña se recarga: no sigue mostrando nada de antes')
  ok(A.sesion.claves.length === 0 && B.sesion.claves.length === 0, 'la marca de «cierre propio» no queda guardada')
}

console.log('\n2. La sesión vence (nadie apretó «Cerrar sesión»)')
{
  const { local, pestanas: [A, B], vencer } = navegador()
  cargarDatos(local)
  vencer()
  ok(local.getItem('bahiashops_carrito') === null && local.getItem('vendedores_seguidos') === null, 'se borran igual')
  ok(A.recargas === 1 && B.recargas === 1, 'y las dos pestañas se recargan')
}

console.log('\n3. Cerrar sesión desde la pestaña B, después de haberla cerrado en A')
{
  const { local, pestanas: [A, B] } = navegador()
  cargarDatos(local)
  await cerrarSesion(A.supabase, undefined, A.sesion)
  cargarDatos(local)
  await cerrarSesion(B.supabase, undefined, B.sesion)
  ok(B.recargas === 1 && A.recargas === 1, 'cada pestaña recarga solo cuando el cierre es de la otra')
  ok(local.getItem('bahiashops_carrito') === null, 'y el carrito queda borrado')
}

console.log('\n4. Sin almacenamiento (modo privado o bloqueado)')
{
  const roto = { removeItem() { throw new Error('bloqueado') }, getItem() { throw new Error('bloqueado') } }
  let recargas = 0
  let error = null
  try { alCerrarseLaSesion({ almacen: roto, almacenDeLaPestana: roto, vaciarMemoria: () => {}, recargar: () => recargas++ }) } catch (e) { error = e }
  ok(error === null, 'no lanza')
  ok(recargas === 1, 'y como no puede saber si el cierre fue suyo, se recarga')
  borrarDatosDeLaPersona(null)
  ok(true, 'sin almacenamiento no se rompe')
}

console.log('\n5. El carrito vacío no deja rastro')
{
  const local = new Almacen()
  guardarCarrito(local, 'bahiashops_carrito', [{ vendedorId: 1, items: [] }])
  ok(local.getItem('bahiashops_carrito') !== null, 'con algo, se guarda')
  guardarCarrito(local, 'bahiashops_carrito', [])
  ok(local.getItem('bahiashops_carrito') === null, 'vacío, la clave se borra (no queda un «[]»)')
}

console.log('\n6. Inventario: toda clave que el código guarda en el navegador está clasificada')
const raiz = fileURLToPath(new URL('../src/', import.meta.url))
const archivos = []
const recorrer = (dir) => { for (const n of readdirSync(dir)) { const r = join(dir, n); if (statSync(r).isDirectory()) recorrer(r); else if (/\.(js|jsx)$/.test(n)) archivos.push(r) } }
recorrer(raiz)
const TECNICAS = ['bahiashops_cierre_propio']
const encontradas = new Set()
for (const f of archivos) {
  const s = readFileSync(f, 'utf8')
  for (const m of s.matchAll(/(?:localStorage|sessionStorage)\.(?:getItem|setItem|removeItem)\(\s*['"`]([^'"`]+)['"`]/g)) encontradas.add(m[1])
  for (const m of s.matchAll(/const CLAVE\w*\s*=\s*['"]([^'"]+)['"]/g)) encontradas.add(m[1])
  for (const m of s.matchAll(/const CIERRE_PROPIO\s*=\s*['"]([^'"]+)['"]/g)) encontradas.add(m[1])
}
const sinClasificar = [...encontradas].filter((k) => !CLAVES_DE_LA_PERSONA.includes(k) && !TECNICAS.includes(k))
ok(encontradas.has('bahiashops_carrito') && encontradas.has('vendedores_seguidos'), `encontradas: ${[...encontradas].sort().join(', ')}`)
ok(sinClasificar.length === 0, `ninguna clave sin clasificar${sinClasificar.length ? ': ' + sinClasificar.join(', ') : ''}`)

console.log('\n7. Dónde está conectado')
const layout = readFileSync(join(raiz, 'app/layout.js'), 'utf8')
ok(/<CarritoProvider>\s*<LimpiezaDeSesion \/>/.test(layout), 'LimpiezaDeSesion está en el layout raíz, adentro del CarritoProvider (en todas las pestañas)')
const directos = archivos.filter((f) => !/api[\\/]/.test(f) && !/datosDelNavegador\.js$/.test(f)).filter((f) => /auth\.signOut\(/.test(readFileSync(f, 'utf8')))
ok(directos.length === 0, `en el navegador nadie llama a signOut directo: se usa cerrarSesion${directos.length ? ' (' + directos.join(', ') + ')' : ''}`)

console.log(fallas === 0 ? '\nTODO OK' : `\n${fallas} FALLAS`)
process.exit(fallas ? 1 : 0)
