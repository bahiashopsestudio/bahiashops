// Las fotos de producto en el navegador: comprimir, subir a Storage y, si el
// guardado falla, borrar lo recién subido. La usan el alta y la edición de
// producto (vendedor/productos/nuevo y vendedor/productos/[id]/editar).
//
// Compresión: WebP de calidad 0,8 y 1200 px como máximo, que se ve igual en
// pantalla y pesa mucho menos que el JPEG original. Si el navegador no sabe
// generar WebP (Safari puede devolver PNG), se usa JPEG 0,8.
//
// Subida: un nombre nuevo por cada subida (<tienda>/<hora>-<azar>.<ext>, sin
// pisar nada), con el tipo real del archivo y un año de caché: reemplazar una
// foto es subir otra con otro nombre, así que ninguna dirección cambia de
// contenido. Las que se sacan al editar las borra el servidor (PUT de
// /api/vendedor/productos/[id]), no esta pantalla.

import imageCompression from 'browser-image-compression'

const BUCKET = 'productos'
const CALIDAD = 0.8
const LADO_MAXIMO = 1200
const MAX_MB = 0.2
const CACHE_UN_ANIO = '31536000'

const EXTENSIONES = { 'image/webp': 'webp', 'image/jpeg': 'jpg' }

function comprimir(archivo, fileType) {
  return imageCompression(archivo, {
    maxSizeMB: MAX_MB,
    maxWidthOrHeight: LADO_MAXIMO,
    useWebWorker: true,
    fileType,
    initialQuality: CALIDAD,
  })
}

// Devuelve un File en WebP o, si el navegador no lo genera, en JPEG.
export async function comprimirFotoProducto(archivo) {
  const webp = await comprimir(archivo, 'image/webp')
  if (webp.type === 'image/webp') return webp
  return comprimir(archivo, 'image/jpeg')
}

function sufijoAlAzar() {
  try {
    return crypto.randomUUID().slice(0, 8)
  } catch {
    return Math.random().toString(36).slice(2, 10)
  }
}

// Sube una foto ya comprimida a la carpeta de la tienda. Devuelve
// { url, ruta } o lanza con un mensaje para mostrar.
export async function subirFotoProducto(supabase, vendedorId, archivo) {
  const tipo = EXTENSIONES[archivo.type] ? archivo.type : 'image/jpeg'
  const ruta = `${vendedorId}/${Date.now()}-${sufijoAlAzar()}.${EXTENSIONES[tipo]}`
  const { error } = await supabase.storage.from(BUCKET).upload(ruta, archivo, {
    contentType: tipo,
    cacheControl: CACHE_UN_ANIO,
    upsert: false,
  })
  if (error) throw new Error('Error al subir una foto: ' + error.message)
  const { data } = supabase.storage.from(BUCKET).getPublicUrl(ruta)
  return { url: data.publicUrl, ruta }
}

// Si el producto no se guardó, las fotos que se acaban de subir no las usa
// nadie: se borran. Es limpieza: nunca lanza ni frena el aviso del error.
export async function borrarFotosSubidas(supabase, rutas) {
  if (!rutas || rutas.length === 0) return
  try {
    const { error } = await supabase.storage.from(BUCKET).remove(rutas)
    if (error) console.error('No se pudieron borrar las fotos recién subidas:', error.message)
  } catch (err) {
    console.error('No se pudieron borrar las fotos recién subidas:', err?.message || err)
  }
}
