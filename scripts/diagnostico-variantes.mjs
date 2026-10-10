// Diagnóstico de los talles repetidos: ¿hay filas duplicadas en
// producto_variantes para los productos de una tienda que coinciden con un
// nombre? SOLO LECTURAS (dos select). No escribe nada.
//
//   node --env-file=.env.local scripts/diagnostico-variantes.mjs 14 remera
//
// Usa la clave pública (NEXT_PUBLIC_SUPABASE_ANON_KEY): ve lo mismo que
// cualquier visitante de la tienda, que es justo lo que se ve repetido. Un
// producto que no esté 'activo' no aparece con esta clave.

import { createClient } from '@supabase/supabase-js'

const vendedorId = Number(process.argv[2])
const nombre = process.argv[3] || ''
if (!Number.isInteger(vendedorId) || vendedorId <= 0) {
  console.error('Uso: node --env-file=.env.local scripts/diagnostico-variantes.mjs <id de tienda> [parte del nombre]')
  process.exit(1)
}

const publico = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY)

// Consulta 1: los productos de la tienda que coinciden con el nombre.
const { data: productos, error } = await publico
  .from('productos')
  .select('id, nombre, estado, tiene_variantes, propiedad_1_nombre, propiedad_2_nombre')
  .eq('vendedor_id', vendedorId)
  .ilike('nombre', `%${nombre}%`)

if (error) { console.error('No se pudieron leer los productos:', error.message); process.exit(1) }
if (!productos?.length) { console.log('Ningún producto visible con ese nombre en esa tienda.'); process.exit(0) }

for (const prod of productos) {
  console.log(`\nProducto ${prod.id} «${prod.nombre}» — estado ${prod.estado}, propiedad 1: ${prod.propiedad_1_nombre}, propiedad 2: ${prod.propiedad_2_nombre}`)

  // Consulta 2: sus variantes, en orden de creación.
  const { data: vars, error: errVars } = await publico
    .from('producto_variantes')
    .select('id, propiedad_1_valor, propiedad_2_valor, stock, creada_en')
    .eq('producto_id', prod.id)
    .order('id')
  if (errVars) { console.log('  No se pudieron leer las variantes:', errVars.message); continue }

  console.log(`  ${vars.length} filas:`)
  for (const v of vars) console.log(`   id ${v.id}  ${v.propiedad_1_valor} / ${v.propiedad_2_valor ?? '—'}  stock ${v.stock}  creada ${v.creada_en}`)

  const cuenta = {}
  for (const v of vars) {
    const clave = `${v.propiedad_1_valor} / ${v.propiedad_2_valor ?? '—'}`
    cuenta[clave] = (cuenta[clave] || 0) + 1
  }
  const repetidas = Object.entries(cuenta).filter(([, n]) => n > 1)
  console.log(repetidas.length ? `  Repetidas: ${repetidas.map(([k, n]) => `${k} ×${n}`).join(', ')}` : '  Sin filas repetidas.')
  const tandas = [...new Set(vars.map((v) => String(v.creada_en).slice(0, 19)))]
  console.log(`  Tandas de creación (al segundo): ${tandas.length} → ${tandas.join(' | ')}`)

  // Consulta 3: sus fotos (producto_media), para ver si se duplican igual.
  const { data: fotos, error: errFotos } = await publico
    .from('producto_media')
    .select('*')
    .eq('producto_id', prod.id)
    .order('orden')
  if (errFotos) { console.log('  No se pudieron leer las fotos:', errFotos.message); continue }
  console.log(`  Fotos: ${fotos.length} filas`)
  for (const f of fotos) {
    const archivo = String(f.url).split('/').pop()
    console.log(`   id ${f.id}  orden ${f.orden}  principal ${f.es_principal}  ${archivo}  ${f.creada_en ?? f.creado_en ?? ''}`)
  }
  const urlsRepetidas = fotos.length - new Set(fotos.map((f) => f.url)).size
  const ordenesRepetidos = fotos.length - new Set(fotos.map((f) => f.orden)).size
  console.log(`  URLs repetidas: ${urlsRepetidas} · órdenes repetidos: ${ordenesRepetidos} · principales: ${fotos.filter((f) => f.es_principal).length}`)
}
