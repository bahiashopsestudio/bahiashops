// Borrar de Storage los archivos de una tienda que se borró o se cerró.
//
// La base (migración 031) borra las filas, pero los archivos viven en Storage:
//   · logos/<id>/      el logo        (lo sube Mi negocio)
//   · portadas/<id>/   la portada     (lo sube Mi negocio)
//   · productos/<id>/  las fotos de los productos y de sus variantes
//
// Tienda BORRADA: se borra todo lo de las tres carpetas.
// Tienda CERRADA: el logo y la portada se borran. De productos/<id>/ se borran
// solo los archivos que ya no usa ningún producto: los que se vendieron
// siguen en la base (los apuntan los pedidos) con sus fotos.
//
// Es limpieza: nunca lanza y nunca deshace nada. Si algo falla queda en el log
// (los archivos huérfanos no se ven en ninguna página).

const LIMITE = 1000

// "https://…/storage/v1/object/public/productos/14/123-0.webp?v=1" -> "14/123-0.webp"
export function rutaEnBucket(url, bucket) {
  const texto = String(url ?? '')
  const marca = `/${bucket}/`
  const i = texto.indexOf(marca)
  if (i === -1) return null
  return texto.substring(i + marca.length).split('?')[0] || null
}

// Todos los archivos de una carpeta (un nivel, que es como se guardan).
async function listar(admin, bucket, carpeta) {
  const rutas = []
  for (let offset = 0; ; offset += LIMITE) {
    const { data, error } = await admin.storage.from(bucket).list(carpeta, { limit: LIMITE, offset })
    if (error) throw new Error(`no se pudo listar ${bucket}/${carpeta}: ${error.message}`)
    // Una "carpeta" adentro viene sin id: no es un archivo.
    for (const f of data || []) if (f?.name && f.id !== null) rutas.push(`${carpeta}/${f.name}`)
    if (!data || data.length < LIMITE) return rutas
  }
}

async function borrar(admin, bucket, rutas) {
  for (let i = 0; i < rutas.length; i += LIMITE) {
    const { error } = await admin.storage.from(bucket).remove(rutas.slice(i, i + LIMITE))
    if (error) throw new Error(`no se pudo borrar en ${bucket}: ${error.message}`)
  }
  return rutas.length
}

// Las rutas (dentro del bucket productos) que siguen usando los productos que
// le quedan a la tienda: sus fotos y las de sus variantes.
async function rutasEnUso(admin, vendedorId) {
  const { data: productos, error } = await admin.from('productos').select('id').eq('vendedor_id', vendedorId)
  if (error) throw new Error(`no se pudieron leer los productos: ${error.message}`)
  const ids = (productos || []).map((p) => p.id)
  if (ids.length === 0) return { quedanProductos: false, rutas: new Set() }

  const [media, variantes] = await Promise.all([
    admin.from('producto_media').select('url').in('producto_id', ids),
    admin.from('producto_variantes').select('imagen_url').in('producto_id', ids),
  ])
  if (media.error || variantes.error) throw new Error(`no se pudieron leer las fotos: ${(media.error || variantes.error).message}`)

  const rutas = new Set()
  for (const m of media.data || []) { const r = rutaEnBucket(m.url, 'productos'); if (r) rutas.add(r) }
  for (const v of variantes.data || []) { const r = rutaEnBucket(v.imagen_url, 'productos'); if (r) rutas.add(r) }
  return { quedanProductos: true, rutas }
}

//   tienda  { id, accion: 'borrada' | 'cerrada' } (lo que devuelve cerrar_cuenta
//           o, con accion 'borrada', borrar_tienda_de_prueba)
// Devuelve { borrados, errores } (cuántos archivos y cuántas carpetas fallaron).
export async function limpiarStorageTienda(admin, tienda) {
  const resultado = { borrados: 0, errores: 0 }
  const id = Number(tienda?.id)
  if (!Number.isInteger(id) || id <= 0) return resultado
  const etiqueta = `Storage de la tienda ${id} (${tienda.accion})`

  for (const bucket of ['logos', 'portadas']) {
    try {
      resultado.borrados += await borrar(admin, bucket, await listar(admin, bucket, String(id)))
    } catch (err) {
      resultado.errores++
      console.error(`${etiqueta}: ${err?.message || err}`)
    }
  }

  try {
    const archivos = await listar(admin, 'productos', String(id))
    let aBorrar = archivos
    if (tienda.accion === 'cerrada') {
      const { quedanProductos, rutas } = await rutasEnUso(admin, id)
      if (quedanProductos) aBorrar = archivos.filter((r) => !rutas.has(r))
    }
    resultado.borrados += await borrar(admin, 'productos', aBorrar)
  } catch (err) {
    resultado.errores++
    console.error(`${etiqueta}: ${err?.message || err}`)
  }

  console.log(`${etiqueta}: ${resultado.borrados} archivo(s) borrado(s)${resultado.errores ? `, ${resultado.errores} error(es)` : ''}.`)
  return resultado
}
