// Prueba el tope de productos de la migración 046 CONTRA SUPABASE (la base
// real), con dos cosas que la prueba local (probar-046, PGlite) no puede
// probar:
//   · varios guardados A LA VEZ de la misma tienda: con un solo lugar libre,
//     tiene que entrar uno solo (el bloqueo de la tienda en guardar_producto);
//   · que el error del tope llegue por PostgREST como lo lee el servidor:
//     code 'BS409', message 'tope_productos' o 'tope_fotos', y details con
//     { tope, usados } en JSON.
//
//   node --env-file=.env.local scripts/probar-tope-paralelo.mjs 16
//
// Correrlo DESPUÉS de correr la 046. Solo acepta las tiendas de prueba 15, 16
// o 18. Usa la service_role (SUPABASE_SERVICE_ROLE_KEY de .env.local), como el
// servidor.
//
// Qué hace, en la tienda elegida:
//   1. Guarda cómo estaba: sus productos y su condición especial (si tenía).
//   2. Le carga una condición especial (Básico, tope = los que ya cuentan + 1,
//      motivo «probar-tope-paralelo»): queda exactamente un lugar libre.
//   3. Dispara 5 altas a la vez: tiene que entrar una y las otras 4 dar BS409
//      'tope_productos' con { tope, usados }.
//   4. Edita el que entró con 9 fotos (el Básico permite 8): BS409 'tope_fotos'.
//   5. Lo pausa, carga otro (entra), y reactiva el pausado: tope_productos.
//   6. AL FINAL, SIEMPRE (aunque algo falle): borra los productos que creó y
//      devuelve la condición especial a como estaba (o la borra si no había).
//      Verifica que quedó igual que antes.
//
// Los productos de prueba se llaman «PRUEBA tope paralelo», nacen en revisión
// (no se publican) y no tienen fotos reales (URLs .invalid): mientras corre,
// pueden aparecer un instante en la cola de Moderación.

import { createClient } from '@supabase/supabase-js'

const TIENDAS_DE_PRUEBA = [15, 16, 18]
const NOMBRE = 'PRUEBA tope paralelo'
const MOTIVO = 'probar-tope-paralelo (se borra al terminar)'
const ADMIN_DE_PRUEBA = '00000000-0000-0000-0000-000000000000'
const A_LA_VEZ = 5

const tienda = Number(process.argv[2])
if (!TIENDAS_DE_PRUEBA.includes(tienda)) {
  console.error(`Uso: node --env-file=.env.local scripts/probar-tope-paralelo.mjs <${TIENDAS_DE_PRUEBA.join(' | ')}>`)
  process.exit(1)
}
if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
  console.error('Faltan NEXT_PUBLIC_SUPABASE_URL o SUPABASE_SERVICE_ROLE_KEY: corrélo con --env-file=.env.local')
  process.exit(1)
}

const admin = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } })

let fallas = 0
const ok = (c, m) => { if (!c) { fallas++; console.log('  ✗ FALLA:', m) } else console.log('  ✓', m) }
const creados = new Set()

function datosDelProducto(categoriaId) {
  return { nombre: NOMBRE, descripcion: 'Producto de prueba del tope (se borra solo).', marca: null, precio: 100, precio_anterior: null,
    tiempo_preparacion: 'durante_el_dia', categoria_id: categoriaId, subcategoria_id: null, subcategoria_personalizada: null,
    categoria_secundaria_id: null, subcategoria_secundaria_id: null, subcategoria_secundaria_personalizada: null,
    genero: null, tiene_variantes: false, propiedad_1_nombre: null }
}
const fotos = (n, pre) => Array.from({ length: n }, (_, i) => `https://tope-paralelo.invalid/${pre}-${i}.webp`)

async function guardar(datos, productoId, urls) {
  const { data, error } = await admin.rpc('rpc_guardar_producto', {
    p_vendedor_id: tienda, p_producto_id: productoId, p_datos: datos, p_fotos: urls,
    p_variantes: [], p_sellos: [], p_avisos: [],
  })
  if (data?.id) creados.add(data.id)
  return { data, error }
}
const detalle = (error) => { try { return JSON.parse(error?.details) } catch { return null } }

async function leerEstado() {
  const [productos, especial] = await Promise.all([
    admin.from('productos').select('id, estado').eq('vendedor_id', tienda).order('id'),
    admin.from('vendedor_planes').select('*').eq('vendedor_id', tienda).maybeSingle(),
  ])
  if (productos.error || especial.error) throw new Error(`No se pudo leer la tienda ${tienda}: ${(productos.error || especial.error).message}`)
  return { productos: productos.data, especial: especial.data }
}

async function limpiar(antes) {
  console.log('\nLimpieza')
  const { data: sobrantes, error: errorSobrantes } = await admin.from('productos').select('id').eq('vendedor_id', tienda).eq('nombre', NOMBRE)
  if (errorSobrantes) console.log('  ! no se pudieron buscar los productos de prueba:', errorSobrantes.message)
  for (const s of sobrantes || []) creados.add(s.id)
  if (creados.size > 0) {
    const { error } = await admin.from('productos').delete().in('id', [...creados]).eq('vendedor_id', tienda).eq('nombre', NOMBRE)
    ok(!error, `borra los ${creados.size} productos de prueba${error ? ': ' + error.message : ''}`)
  }
  if (antes.especial) {
    const { error } = await admin.from('vendedor_planes').upsert(antes.especial)
    ok(!error, `devuelve la condición especial que tenía${error ? ': ' + error.message : ''}`)
  } else {
    const { error } = await admin.from('vendedor_planes').delete().eq('vendedor_id', tienda)
    ok(!error, `borra la condición especial de prueba${error ? ': ' + error.message : ''}`)
  }
  const despues = await leerEstado()
  ok(JSON.stringify(despues.productos) === JSON.stringify(antes.productos), 'los productos de la tienda quedaron como estaban')
  ok(JSON.stringify(despues.especial) === JSON.stringify(antes.especial), 'la condición especial quedó como estaba')
}

console.log(`Tienda ${tienda}: tope de productos contra Supabase\n`)

const { data: tiendaFila, error: errorTienda } = await admin.from('vendedores').select('id, nombre_negocio').eq('id', tienda).maybeSingle()
if (errorTienda || !tiendaFila) {
  console.error(`No encontramos la tienda ${tienda}${errorTienda ? ': ' + errorTienda.message : ''}.`)
  process.exit(1)
}
const { data: categoria, error: errorCategoria } = await admin.from('categorias').select('id').order('id').limit(1).maybeSingle()
if (errorCategoria || !categoria) {
  console.error('No se pudo leer una categoría para el producto de prueba.')
  process.exit(1)
}
const DATOS = datosDelProducto(categoria.id)

// Lo que haya quedado de una corrida anterior que se cortó, fuera antes de
// anotar cómo estaba la tienda.
await admin.from('productos').delete().eq('vendedor_id', tienda).eq('nombre', NOMBRE)
const especialesViejas = await admin.from('vendedor_planes').select('motivo').eq('vendedor_id', tienda).maybeSingle()
if (especialesViejas.data?.motivo === MOTIVO) await admin.from('vendedor_planes').delete().eq('vendedor_id', tienda)

const antes = await leerEstado()
console.log(`«${tiendaFila.nombre_negocio}»: ${antes.productos.length} productos, ${antes.especial ? 'con' : 'sin'} condición especial.`)

try {
  console.log('\n1. Un solo lugar libre')
  const { data: plan0, error: errorPlan } = await admin.rpc('rpc_plan_de_tienda', { p_vendedor_id: tienda })
  if (errorPlan) throw new Error(`rpc_plan_de_tienda: ${errorPlan.message} (¿corriste la 046?)`)
  const usados = Number(plan0.usados)
  const { error: errorEspecial } = await admin.from('vendedor_planes').upsert({
    vendedor_id: tienda, plan_clave: 'basico', tope_productos: usados + 1, sin_tope: false, precio_especial: null,
    motivo: MOTIVO, creado_por: ADMIN_DE_PRUEBA,
  })
  if (errorEspecial) throw new Error(`No se pudo cargar la condición especial: ${errorEspecial.message}`)
  const { data: plan1 } = await admin.rpc('rpc_plan_de_tienda', { p_vendedor_id: tienda })
  ok(plan1?.tope_productos === usados + 1 && Number(plan1.usados) === usados, `tope ${usados + 1} con ${usados} que cuentan: queda un lugar`)

  console.log(`\n2. ${A_LA_VEZ} altas a la vez`)
  const resultados = await Promise.all(Array.from({ length: A_LA_VEZ }, (_, i) => guardar(DATOS, null, fotos(1, `alta${i}`))))
  const entraron = resultados.filter((r) => !r.error)
  const topes = resultados.filter((r) => r.error?.code === 'BS409')
  const otros = resultados.filter((r) => r.error && r.error.code !== 'BS409')
  ok(entraron.length === 1, `entra una sola (entraron ${entraron.length})`)
  ok(topes.length === A_LA_VEZ - 1, `las otras ${A_LA_VEZ - 1} dan BS409 (dieron ${topes.length})`)
  for (const r of otros) console.log('    otro error:', r.error.code, r.error.message)
  const primero = topes[0]?.error
  ok(primero?.message === 'tope_productos', `message: '${primero?.message}'`)
  const d = detalle(primero)
  ok(d?.tope === usados + 1 && d?.usados === usados + 1, `details por PostgREST: ${primero?.details}`)
  const { data: plan2 } = await admin.rpc('rpc_plan_de_tienda', { p_vendedor_id: tienda })
  ok(Number(plan2?.usados) === usados + 1, `quedaron ${usados + 1} que cuentan (ni uno de más)`)

  const nuevoId = entraron[0]?.data?.id
  if (nuevoId) {
    console.log('\n3. Fotos de más al editar (el Básico permite 8)')
    let r = await guardar(DATOS, nuevoId, fotos(9, 'edit'))
    ok(r.error?.code === 'BS409' && r.error.message === 'tope_fotos', `9 fotos: ${r.error?.code} '${r.error?.message}'`)
    ok(detalle(r.error)?.tope === 8 && detalle(r.error)?.usados === 9, `details: ${r.error?.details}`)

    console.log('\n4. Reactivar en el tope')
    r = await admin.rpc('rpc_cambiar_estado_producto', { p_vendedor_id: tienda, p_producto_id: nuevoId, p_destino: 'pausado' })
    ok(r.error || r.data?.ok === false, `pausar uno en revisión: no se puede (motivo '${r.data?.motivo}')`)
    // Para tener un pausado: lo marcamos activo y lo pausamos (como si lo
    // hubiera aprobado el admin).
    const { error: errorAprobar } = await admin.from('productos').update({ estado: 'activo' }).eq('id', nuevoId).eq('nombre', NOMBRE)
    if (errorAprobar) throw new Error(`No se pudo aprobar el producto de prueba: ${errorAprobar.message}`)
    r = await admin.rpc('rpc_cambiar_estado_producto', { p_vendedor_id: tienda, p_producto_id: nuevoId, p_destino: 'pausado' })
    ok(r.data?.ok === true && r.data.estado === 'pausado', 'pausarlo: pasa y libera el lugar')
    r = await guardar(DATOS, null, fotos(1, 'otro'))
    ok(!r.error, 'otra alta ocupa el lugar')
    r = await admin.rpc('rpc_cambiar_estado_producto', { p_vendedor_id: tienda, p_producto_id: nuevoId, p_destino: 'activo' })
    ok(r.data?.ok === false && r.data.motivo === 'tope_productos' && r.data.tope === usados + 1 && r.data.usados === usados + 1,
      `reactivar el pausado: ${JSON.stringify(r.data)}`)
  }
} catch (err) {
  fallas++
  console.log('  ✗ FALLA:', err.message)
} finally {
  await limpiar(antes)
}

console.log(fallas === 0 ? '\nTODO OK' : `\n${fallas} FALLAS`)
process.exit(fallas ? 1 : 0)
