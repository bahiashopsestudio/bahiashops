// Productos de prueba «Prueba F4 N» para probar los planes en una tienda (por
// defecto Ludoméstica, la 15). Usa la base REAL (hay una sola), con la
// service_role de .env.local.
//
//   node scripts/productos-de-prueba.mjs --ver
//       lista los «Prueba F4» de la tienda (solo lee)
//   node scripts/productos-de-prueba.mjs --cargar [--cantidad=26]
//       carga hasta que la tienda tenga esa cantidad de productos guardados
//       (cuentan todos, como el tope), numerados después del último que haya
//   node scripts/productos-de-prueba.mjs --borrar
//       borra todos los «Prueba F4» de la tienda, con sus fotos
//   --tienda=15   otra tienda (el id de vendedores)
//
// Cargar va por el mismo camino que la pantalla de alta: sube una foto a
// Storage (productos/<tienda>/…, como fotosProducto.js), la valida con
// validarProducto, pasa la moderación (moderarProducto) y guarda con
// guardarProducto (rpc_guardar_producto: la base cuenta el tope del plan y el
// producto nace en revisión). Si el plan no deja cargar más (el 409 del tope),
// para y lo dice.
//
// Borrar va por el mismo camino que «Eliminar» en Mis productos:
// rpc_eliminar_producto y después las fotos de la carpeta de la tienda que no
// usa ningún pedido. Si una foto no se puede borrar, queda en el log (no se ve
// en ninguna página).
//
// La foto es un cuadrado WebP de un color liso (unos pocos KB), distinta para
// cada producto: si dos compartieran archivo, borrar uno le sacaría la foto al
// otro.

import { register } from 'node:module'
import { readFileSync } from 'node:fs'
import { pathToFileURL } from 'node:url'

const raiz = new URL('../', import.meta.url)
// Node no conoce el alias '@/' de jsconfig.json: se resuelve a src/.
const loader = `
const src = ${JSON.stringify(new URL('src/', raiz).href)}
export function resolve(esp, ctx, sig) {
  if (esp.startsWith('@/')) { const r = src + esp.slice(2); return sig(/\\.[a-z]+$/.test(r) ? r : r + '.js', ctx) }
  return sig(esp, ctx)
}`
register('data:text/javascript,' + encodeURIComponent(loader))

export const PREFIJO = 'Prueba F4'
const DESCRIPCION = 'Producto de prueba para probar los planes de la tienda. Se borra al terminar la prueba.'

// "Prueba F4 12" -> 12; otro nombre -> null.
export function numeroDePrueba(nombre) {
  const m = String(nombre ?? '').match(/^Prueba F4 (\d+)$/)
  return m ? Number(m[1]) : null
}

// Un cuadrado de 600 px de un color que cambia con n.
async function fotoLiviana(n) {
  const { default: sharp } = await import('sharp')
  const tono = (n * 47) % 360
  const [r, g, b] = hslARgb(tono, 0.45, 0.72)
  return sharp({ create: { width: 600, height: 600, channels: 3, background: { r, g, b } } }).webp({ quality: 60 }).toBuffer()
}
function hslARgb(h, s, l) {
  const k = (n) => (n + h / 30) % 12
  const a = s * Math.min(l, 1 - l)
  const f = (n) => l - a * Math.max(-1, Math.min(k(n) - 3, Math.min(9 - k(n), 1)))
  return [f(0), f(8), f(4)].map((x) => Math.round(x * 255))
}

// Los «Prueba F4» de la tienda: [{ id, nombre, estado, n }], por número.
export async function productosDePrueba(admin, tienda) {
  const { data, error } = await admin.from('productos').select('id, nombre, estado, pausado_por_plan_en')
    .eq('vendedor_id', tienda).like('nombre', `${PREFIJO} %`)
  if (error) throw new Error(`no se pudieron leer los productos: ${error.message}`)
  return (data || []).map((p) => ({ ...p, n: numeroDePrueba(p.nombre) })).filter((p) => p.n !== null).sort((a, b) => a.n - b.n)
}

// Carga hasta que la tienda tenga `cantidad` productos guardados.
// Devuelve { cargados, frenado? } (frenado: el texto del tope si la base no dejó).
export async function cargar(admin, { tienda, cantidad, baseSupabase, log = console.log }) {
  const [{ validarProducto, moderarProducto }, { guardarProducto }] = await Promise.all([
    import('../src/lib/productos.js'),
    import('../src/lib/guardarProducto.js'),
  ])

  const { data: vendedor, error: errorTienda } = await admin.from('vendedores').select('id, nombre_negocio, categoria_id').eq('id', tienda).maybeSingle()
  if (errorTienda) throw new Error(`no se pudo leer la tienda: ${errorTienda.message}`)
  if (!vendedor) throw new Error(`no existe la tienda ${tienda}`)
  let categoria = vendedor.categoria_id
  if (!categoria) {
    const { data: cat, error } = await admin.from('categorias').select('id').eq('activa', true).order('orden').limit(1).maybeSingle()
    if (error || !cat) throw new Error('no hay una categoría para los productos de prueba')
    categoria = cat.id
  }

  const { count: guardados, error: errorConteo } = await admin.from('productos').select('id', { count: 'exact', head: true }).eq('vendedor_id', tienda)
  if (errorConteo) throw new Error(`no se pudieron contar los productos: ${errorConteo.message}`)
  const faltan = Math.max(0, cantidad - (guardados ?? 0))
  log(`${vendedor.nombre_negocio} (tienda ${tienda}): ${guardados} productos guardados; se cargan ${faltan} para llegar a ${cantidad}.`)
  if (faltan === 0) return { cargados: 0 }

  const existentes = await productosDePrueba(admin, tienda)
  let siguiente = (existentes.at(-1)?.n ?? 0) + 1
  let cargados = 0
  for (let i = 0; i < faltan; i++, siguiente++) {
    const nombre = `${PREFIJO} ${siguiente}`
    const ruta = `${tienda}/${Date.now()}-prueba-f4-${siguiente}.webp`
    const { error: errorSubida } = await admin.storage.from('productos').upload(ruta, await fotoLiviana(siguiente), {
      contentType: 'image/webp', cacheControl: '31536000', upsert: false,
    })
    if (errorSubida) throw new Error(`no se pudo subir la foto de «${nombre}»: ${errorSubida.message}`)
    const { data: { publicUrl } } = admin.storage.from('productos').getPublicUrl(ruta)
    const borrarFoto = () => admin.storage.from('productos').remove([ruta])

    const validado = validarProducto({
      nombre, descripcion: DESCRIPCION, precio: 1000 + siguiente, tiempo_preparacion: 'inmediata',
      categoria_id: categoria, fotos: [publicUrl],
    }, { vendedorId: tienda, baseSupabase })
    if (!validado.ok) { await borrarFoto(); throw new Error(`«${nombre}» no pasa la validación: ${validado.error}`) }

    const moderacion = moderarProducto(validado.datos)
    if (moderacion.nivel === 'bloqueo') { await borrarFoto(); throw new Error(`«${nombre}» lo bloquea la moderación`) }

    const r = await guardarProducto(admin, { vendedorId: tienda, validado, avisos: moderacion.avisos })
    if (!r.ok) {
      await borrarFoto()
      if (r.motivo) { log(`Frenado en «${nombre}»: ${r.error}`); return { cargados, frenado: r.error } }
      throw new Error(`no se pudo guardar «${nombre}»: ${r.error}`)
    }
    cargados++
    log(`  ✓ ${nombre} (id ${r.id}, ${r.estado})`)
  }
  return { cargados }
}

// Borra todos los «Prueba F4» de la tienda con sus fotos.
// Devuelve { borrados, fotos, errores }.
export async function borrar(admin, { tienda, log = console.log }) {
  const { rutaEnBucket } = await import('../src/lib/storageTienda.js')
  const lista = await productosDePrueba(admin, tienda)
  log(`Tienda ${tienda}: ${lista.length} productos «${PREFIJO}» para borrar.`)
  let borrados = 0
  let fotos = 0
  let errores = 0
  for (const p of lista) {
    const { data, error } = await admin.rpc('rpc_eliminar_producto', { p_vendedor_id: tienda, p_producto_id: p.id })
    if (error || !data?.ok) {
      errores++
      log(`  ✗ ${p.nombre} (id ${p.id}): ${error?.message || 'la base no lo encontró'}`)
      continue
    }
    borrados++
    // Las de la carpeta de la tienda, menos las que usa un pedido (como la ruta).
    const enPedidos = new Set((Array.isArray(data.fotos_en_pedidos) ? data.fotos_en_pedidos : []).map((u) => rutaEnBucket(u, 'productos')))
    const rutas = [...new Set((Array.isArray(data.fotos) ? data.fotos : []).map((u) => rutaEnBucket(u, 'productos')))]
      .filter((r) => r && r.startsWith(`${tienda}/`) && !enPedidos.has(r))
    if (rutas.length) {
      const { error: errorStorage } = await admin.storage.from('productos').remove(rutas)
      if (errorStorage) { errores++; log(`  ! ${p.nombre}: borrado, pero sus fotos no (${errorStorage.message})`) } else fotos += rutas.length
    }
    log(`  ✓ ${p.nombre} (id ${p.id})`)
  }
  return { borrados, fotos, errores }
}

// ── Desde la línea de comandos ──

function leerEnv() {
  const env = {}
  try {
    for (const linea of readFileSync(new URL('../.env.local', import.meta.url), 'utf8').split(/\r?\n/)) {
      const m = linea.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/)
      if (m) env[m[1]] = m[2].replace(/^["']|["']$/g, '')
    }
  } catch { /* sin .env.local: lo del entorno */ }
  return { ...env, ...process.env }
}

async function main() {
  const args = process.argv.slice(2)
  const valor = (nombre, porDefecto) => {
    const a = args.find((x) => x.startsWith(`--${nombre}=`))
    return a ? a.slice(nombre.length + 3) : porDefecto
  }
  const modo = ['--ver', '--cargar', '--borrar'].find((m) => args.includes(m))
  if (!modo) {
    console.log('Uso: node scripts/productos-de-prueba.mjs --ver | --cargar [--cantidad=26] | --borrar  [--tienda=15]')
    process.exit(1)
  }
  const tienda = Number(valor('tienda', '15'))
  const cantidad = Number(valor('cantidad', '26'))
  if (!Number.isInteger(tienda) || tienda <= 0 || !Number.isInteger(cantidad) || cantidad < 1 || cantidad > 200) {
    console.error('La tienda y la cantidad tienen que ser enteros (cantidad de 1 a 200).')
    process.exit(1)
  }

  const env = leerEnv()
  if (!env.NEXT_PUBLIC_SUPABASE_URL || !env.SUPABASE_SERVICE_ROLE_KEY) {
    console.error('Faltan NEXT_PUBLIC_SUPABASE_URL o SUPABASE_SERVICE_ROLE_KEY en .env.local.')
    process.exit(1)
  }
  const { createClient } = await import('@supabase/supabase-js')
  const admin = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } })

  if (modo === '--ver') {
    const lista = await productosDePrueba(admin, tienda)
    console.log(`Tienda ${tienda}: ${lista.length} productos «${PREFIJO}».`)
    for (const p of lista) console.log(`  ${p.nombre} (id ${p.id}) · ${p.estado}${p.pausado_por_plan_en ? ' · pausado por el plan' : ''}`)
    return
  }
  if (modo === '--cargar') {
    const r = await cargar(admin, { tienda, cantidad, baseSupabase: env.NEXT_PUBLIC_SUPABASE_URL })
    console.log(r.frenado ? `\nSe cargaron ${r.cargados}; el resto no entra en el plan.` : `\nListo: ${r.cargados} cargados.`)
    return
  }
  const r = await borrar(admin, { tienda })
  console.log(`\nListo: ${r.borrados} borrados, ${r.fotos} fotos borradas${r.errores ? `, ${r.errores} con error` : ''}.`)
  if (r.errores) process.exit(1)
}

if (import.meta.url === pathToFileURL(process.argv[1] || '').href) {
  main().catch((err) => { console.error('Error:', err?.message || err); process.exit(1) })
}
