// Las reglas de un producto, del lado del servidor: qué datos se aceptan, qué
// fotos, qué dice la moderación y a qué estado puede pasar.
//
// Las usan /api/vendedor/productos (alta, edición, pausa y borrado) y
// guardarProducto.js. Nada de esto se le cree al navegador: las pantallas
// hacen las mismas verificaciones para avisar antes, pero la que vale es esta.
//
// No toca la base: recibe datos y devuelve resultados.

import { revisarPublicacion } from '@/lib/moderacion'

export const MAX_FOTOS = 5

// Los del CHECK productos_tiempo_preparacion_check.
export const TIEMPOS_PREPARACION = ['inmediata', 'durante_el_dia', 'manana', '2_a_4_dias', '1_a_2_semanas', 'mas_2_semanas']
export const GENEROS = ['mujer', 'hombre', 'ninos', 'sin_genero']

// Las únicas transiciones de estado que decide el vendedor (Pausar y
// Reactivar en Mis productos). Destino -> desde dónde se puede llegar.
// 'en_revision' y 'rechazado' nunca pasan a activo por acá: eso lo decide la
// moderación.
export const TRANSICIONES = {
  pausado: ['activo'],
  activo: ['pausado', 'agotado'],
}

// Ya aprobados: editarlos no los vuelve a moderar.
export const ESTADOS_APROBADOS = ['activo', 'pausado', 'agotado']

// Lo que ve el vendedor de un producto rechazado: el motivo tal como lo
// guardó la moderación, o este texto si no tiene (productos viejos).
export function textoMotivoRechazo(motivo) {
  const texto = typeof motivo === 'string' ? motivo.trim() : ''
  return texto || 'No pudimos publicarlo. Revisá el texto y las fotos y volvé a enviarlo.'
}

export const MENSAJE_CON_PEDIDOS =
  'Este producto tiene pedidos asociados y no se puede eliminar.\n\nSi no querés que los compradores lo vean, podés pausarlo.'

const LIMITES = { nombre: 300, descripcion: 10000, marca: 200, personalizada: 200, propiedad: 100, valor: 100, valores: 100 }

const texto = (v) => (typeof v === 'string' ? v.trim() : '')
const idPositivo = (v) => {
  if (v === null || v === undefined || v === '') return null
  const n = Number(v)
  return Number.isInteger(n) && n > 0 ? n : NaN
}
const numero = (v) => {
  if (v === null || v === undefined || v === '') return null
  const n = Number(v)
  return Number.isFinite(n) ? n : NaN
}

// La URL pública de una foto de la tienda: <supabase>/storage/v1/object/public/productos/<vendedorId>/<archivo>
export function esFotoDeLaTienda(url, vendedorId, baseSupabase) {
  if (typeof url !== 'string' || !baseSupabase) return false
  const base = String(baseSupabase).replace(/\/+$/, '')
  const prefijo = `${base}/storage/v1/object/public/productos/${vendedorId}/`
  if (!url.startsWith(prefijo)) return false
  const archivo = url.slice(prefijo.length)
  return /^[^/?#\\]+$/.test(archivo) && !archivo.includes('..')
}

// Valida el cuerpo que manda la pantalla. Devuelve
//   { ok: true, datos, fotos, variantes, sellos }
//   { ok: false, error }  (un texto para mostrarle a la persona)
//
//   fotosExistentes  las URL que el producto ya tiene (en una edición): se
//                    aceptan aunque no sigan la carpeta de la tienda, para no
//                    trabar un producto viejo.
export function validarProducto(cuerpo, { vendedorId, baseSupabase, fotosExistentes = [] } = {}) {
  const c = cuerpo && typeof cuerpo === 'object' ? cuerpo : {}
  const error = (e) => ({ ok: false, error: e })

  const nombre = texto(c.nombre)
  const descripcion = texto(c.descripcion)
  const marca = texto(c.marca) || null
  if (!nombre) return error('Poné un nombre al producto.')
  if (!descripcion) return error('Escribí una descripción.')
  if (nombre.length > LIMITES.nombre) return error('El nombre es demasiado largo.')
  if (descripcion.length > LIMITES.descripcion) return error('La descripción es demasiado larga.')
  if (marca && marca.length > LIMITES.marca) return error('La marca es demasiado larga.')

  const precio = numero(c.precio)
  const precioAnterior = numero(c.precio_anterior)
  if (precio === null || Number.isNaN(precio) || precio <= 0) return error('El precio es obligatorio.')
  if (Number.isNaN(precioAnterior)) return error('El precio anterior no es un número.')
  if (precioAnterior !== null && precioAnterior <= precio) return error('El precio anterior tiene que ser mayor al precio actual.')

  const tiempo = texto(c.tiempo_preparacion)
  if (!TIEMPOS_PREPARACION.includes(tiempo)) return error('Elegí el tiempo de preparación.')

  const categoria = idPositivo(c.categoria_id)
  if (!categoria) return error('Elegí una categoría para el producto.')
  const ids = {
    subcategoria_id: idPositivo(c.subcategoria_id),
    categoria_secundaria_id: idPositivo(c.categoria_secundaria_id),
    subcategoria_secundaria_id: idPositivo(c.subcategoria_secundaria_id),
  }
  if (Object.values(ids).some(Number.isNaN)) return error('Revisá las categorías elegidas.')

  const personalizada = texto(c.subcategoria_personalizada) || null
  const personalizadaSec = texto(c.subcategoria_secundaria_personalizada) || null
  if ((personalizada?.length || 0) > LIMITES.personalizada || (personalizadaSec?.length || 0) > LIMITES.personalizada) {
    return error('La subcategoría es demasiado larga.')
  }

  const genero = Array.isArray(c.genero) ? [...new Set(c.genero.filter((g) => GENEROS.includes(g)))] : []

  // Variantes: nombre de la propiedad y al menos una opción, o ninguna de las dos.
  const propiedad = texto(c.propiedad_1_nombre)
  const vistos = new Set()
  const valores = []
  for (const v of Array.isArray(c.variantes) ? c.variantes : []) {
    const limpio = texto(v)
    if (!limpio || vistos.has(limpio.toLowerCase())) continue
    vistos.add(limpio.toLowerCase())
    valores.push(limpio)
  }
  if (!!propiedad !== valores.length > 0) return error('Si cargás variantes, completá el nombre (ej: Talle) y al menos una opción.')
  if (propiedad.length > LIMITES.propiedad || valores.length > LIMITES.valores || valores.some((v) => v.length > LIMITES.valor)) {
    return error('Revisá las variantes: hay demasiadas o son muy largas.')
  }

  const fotos = Array.isArray(c.fotos) ? c.fotos : []
  if (fotos.length === 0) return error('Subí al menos una foto.')
  if (fotos.length > MAX_FOTOS) return error(`Podés subir hasta ${MAX_FOTOS} fotos.`)
  const existentes = new Set(fotosExistentes)
  if (new Set(fotos).size !== fotos.length) return error('Hay una foto repetida.')
  if (!fotos.every((u) => existentes.has(u) || esFotoDeLaTienda(u, vendedorId, baseSupabase))) {
    return error('Alguna de las fotos no es válida. Volvé a subirla.')
  }

  const sellos = [...new Set((Array.isArray(c.sellos) ? c.sellos : []).map(Number).filter((n) => Number.isInteger(n) && n > 0))]

  return {
    ok: true,
    datos: {
      nombre, descripcion, marca,
      precio, precio_anterior: precioAnterior,
      tiempo_preparacion: tiempo,
      categoria_id: categoria,
      ...ids,
      subcategoria_personalizada: personalizada,
      subcategoria_secundaria_personalizada: personalizadaSec,
      genero: genero.length > 0 ? genero : null,
      tiene_variantes: valores.length > 0,
      propiedad_1_nombre: valores.length > 0 ? propiedad : null,
    },
    fotos,
    variantes: valores,
    sellos,
  }
}

// La moderación del texto, la misma que muestra la pantalla mientras se
// escribe (nombre + descripción + marca).
export function moderarProducto(datos) {
  return revisarPublicacion(`${datos.nombre} ${datos.descripcion} ${datos.marca || ''}`)
}

// En qué estado queda un producto al guardarlo (la misma regla que
// privado.guardar_producto de la migración 033; esta la usa el guardado paso a
// paso, cuando la función todavía no existe).
//   estadoActual  null en el alta
export function estadoAlGuardar(estadoActual) {
  if (!estadoActual) return 'en_revision'
  return ESTADOS_APROBADOS.includes(estadoActual) ? estadoActual : 'en_revision'
}

// Desde qué estados se puede llegar a 'destino', o null si el vendedor no
// puede pedirlo.
export function origenesPermitidos(destino) {
  return Object.hasOwn(TRANSICIONES, destino) ? TRANSICIONES[destino] : null
}
