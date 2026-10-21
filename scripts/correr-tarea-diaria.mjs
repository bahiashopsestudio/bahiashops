// Corre la tarea diaria (/api/cron/diaria) contra un servidor que ya esté
// andando (`npm run dev`), con el CRON_SECRET de .env.local. Imprime el
// resumen que devuelve la ruta.
//
//   npm run tarea-diaria -- --prueba        lo que HARÍA, sin mandar ni cambiar nada
//   npm run tarea-diaria                    en serio (manda mails, renueva, cancela)
//   npm run tarea-diaria -- --sin-secreto   sin el secreto: tiene que dar 401
//   npm run tarea-diaria -- --url=https://bahiashops.com.ar --prueba
//                                           contra otro servidor (el secreto
//                                           tiene que ser el de ese servidor)
//
// OJO: corriendo en serio, la base es la real (hay una sola): los mails salen
// de verdad y las marcas quedan guardadas.

import { readFileSync } from 'node:fs'

const args = process.argv.slice(2)
const prueba = args.includes('--prueba')
const sinSecreto = args.includes('--sin-secreto')
const url = (args.find((a) => a.startsWith('--url=')) || '--url=http://localhost:3000').slice('--url='.length).replace(/\/$/, '')

// CRON_SECRET: de la variable de entorno, o si no de .env.local.
function leerSecreto() {
  if (process.env.CRON_SECRET) return process.env.CRON_SECRET.trim()
  try {
    const env = readFileSync(new URL('../.env.local', import.meta.url), 'utf8')
    const linea = env.split(/\r?\n/).find((l) => /^\s*CRON_SECRET\s*=/.test(l))
    return linea ? linea.slice(linea.indexOf('=') + 1).trim().replace(/^["']|["']$/g, '') : ''
  } catch {
    return ''
  }
}

const secreto = leerSecreto()
if (!secreto && !sinSecreto) {
  console.error('Falta CRON_SECRET en .env.local (o en el entorno).')
  process.exit(1)
}

const destino = `${url}/api/cron/diaria${prueba ? '?prueba=1' : ''}`
const modo = sinSecreto ? ' (sin secreto: tiene que dar 401)' : prueba ? ' — modo prueba: no manda ni cambia nada' : ' — EN SERIO'
console.log(`GET ${destino}${modo}\n`)

let respuesta
try {
  respuesta = await fetch(destino, { headers: sinSecreto ? {} : { Authorization: `Bearer ${secreto}` } })
} catch (err) {
  console.error(`No se pudo llegar a ${url}: ¿está corriendo \`npm run dev\`? (${err?.message || err})`)
  process.exit(1)
}

const texto = await respuesta.text()
let cuerpo
try { cuerpo = JSON.parse(texto) } catch { cuerpo = texto }
console.log(`HTTP ${respuesta.status}`)
console.log(typeof cuerpo === 'string' ? cuerpo : JSON.stringify(cuerpo, null, 2))
process.exit(respuesta.ok || (sinSecreto && respuesta.status === 401) ? 0 : 1)
