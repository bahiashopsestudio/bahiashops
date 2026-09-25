// SOLO LECTURAS. Confirma que existen las columnas que va a leer la ruta y
// cómo viene el precio. Usa la clave publishable salvo donde se aclara.
import { createClient } from '@supabase/supabase-js'
import fs from 'node:fs'

const env = Object.fromEntries(
  fs.readFileSync('.env.local', 'utf8').split(/\r?\n/).filter(l => l.includes('='))
    .map(l => { const i = l.indexOf('='); return [l.slice(0, i).trim(), l.slice(i + 1).trim()] }))

const pub = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_ANON_KEY, { auth: { persistSession: false } })
const sec = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } })

async function columnas(cliente, tabla, cols, etiqueta) {
  const { error } = await cliente.from(tabla).select(cols).limit(0)
  console.log(`[${etiqueta}] ${tabla}(${cols}) -> ${error ? 'ERROR: ' + error.message : 'ok'}`)
}

console.log('=== columnas que lee la ruta ===')
await columnas(pub, 'productos', 'id, nombre, precio, tiene_variantes', 'publishable')
await columnas(pub, 'producto_variantes', 'producto_id, propiedad_1_valor', 'publishable')
await columnas(pub, 'producto_media', 'producto_id, url, es_principal, orden', 'publishable')
await columnas(pub, 'vendedores', 'barrio_id, metodos_entrega_default, costos_envio_zona', 'publishable')
// 'direcciones' es privada del comprador: con la publishable y sin sesión no
// devuelve filas, así que la existencia de la columna se confirma con la secreta.
await columnas(pub, 'direcciones', 'id, barrio_id', 'publishable')
await columnas(sec, 'direcciones', 'id, barrio_id', 'SECRETA (solo existencia)')

console.log('\n=== cómo viene el precio de un producto público ===')
const { data: prod, error: errProd } = await pub
  .from('productos').select('id, precio').eq('estado', 'activo').limit(1)
if (errProd) console.log('ERROR:', errProd.message)
else if (!prod.length) console.log('(sin productos visibles)')
else console.log(`  precio = ${JSON.stringify(prod[0].precio)}  (typeof ${typeof prod[0].precio})`)

console.log('\n=== costos_envio_zona: forma del JSON ===')
const { data: v } = await pub.from('vendedores').select('costos_envio_zona, metodos_entrega_default').limit(3)
for (const fila of v || []) {
  console.log(`  metodos=${JSON.stringify(fila.metodos_entrega_default)} costos=${JSON.stringify(fila.costos_envio_zona)}`)
}

console.log('\n=== calcular_zona_envio con la clave publishable ===')
const { data: barrios } = await pub.from('barrios').select('id').limit(2)
if (!barrios || barrios.length < 2) {
  console.log('  (no pude leer dos barrios para probar)')
} else {
  const [a, b] = barrios
  const { data: zona, error: errZona } = await pub.rpc('calcular_zona_envio', {
    barrio_vendedor_id: a.id, barrio_comprador_id: b.id,
  })
  console.log(errZona ? `  ERROR: ${errZona.message}` : `  barrios ${a.id} y ${b.id} -> zona ${JSON.stringify(zona)} (typeof ${typeof zona})`)
  const { data: misma } = await pub.rpc('calcular_zona_envio', {
    barrio_vendedor_id: a.id, barrio_comprador_id: a.id,
  })
  console.log(`  mismo barrio (${a.id}) -> zona ${JSON.stringify(misma)}`)
}
