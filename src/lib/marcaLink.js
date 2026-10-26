// El link propio de cada tienda y la marca que deja en el navegador.
//
// El link es la ficha de la tienda o de un producto con ?de=tienda. Quien
// entra por ahí queda marcado para ESA tienda durante 48 horas desde que lo
// tocó (si lo vuelve a tocar, se renueva): si compra en ella, la tienda paga
// 2,5% en lugar de 5% (src/lib/comision.js). La canónica, el sitemap y los
// metadatos no cambian: el parámetro solo lo lee el navegador
// (MarcaLinkTienda) y lo saca de la barra.
//
// La marca vive en localStorage (CLAVE_MARCA_LINK) como un mapa
// { [vendedorId]: tocadoEnMs }. Es dato de la persona: se borra al cerrar
// sesión (CLAVES_DE_LA_PERSONA, src/lib/datosDelNavegador.js). El checkout
// manda al servidor solo la de la tienda que se está comprando, y el servidor
// decide si vale.
//
// Nunca lanza: en modo privado o con el almacenamiento bloqueado no hay marca.

import { SITIO_URL } from '@/lib/sitio'
import { VIGENCIA_MARCA_MS } from '@/lib/comision'

export const CLAVE_MARCA_LINK = 'bahiashops_link_tienda'

// El parámetro y su valor: /tienda/<slug>?de=tienda.
export const PARAMETRO_LINK = 'de'
export const VALOR_LINK = 'tienda'

// localStorage, o null si el navegador lo bloquea (leerlo ya puede lanzar).
export function almacenDelNavegador() {
  try {
    return globalThis.localStorage ?? null
  } catch {
    return null
  }
}

function idValido(vendedorId) {
  const id = Number(vendedorId)
  return Number.isInteger(id) && id > 0 ? String(id) : null
}

function leer(almacen) {
  try {
    const texto = almacen?.getItem(CLAVE_MARCA_LINK)
    if (!texto) return {}
    const datos = JSON.parse(texto)
    return datos && typeof datos === 'object' && !Array.isArray(datos) ? datos : {}
  } catch {
    return {}
  }
}

// Anota (o renueva) la marca de una tienda. De paso borra las vencidas, para
// que el mapa no crezca.
export function anotarMarca(almacen, vendedorId, ahoraMs) {
  const id = idValido(vendedorId)
  if (!id) return
  const marcas = {}
  for (const [clave, valor] of Object.entries(leer(almacen))) {
    if (typeof valor === 'number' && valor >= ahoraMs - VIGENCIA_MARCA_MS) marcas[clave] = valor
  }
  marcas[id] = ahoraMs
  try {
    almacen?.setItem(CLAVE_MARCA_LINK, JSON.stringify(marcas))
  } catch { /* sin almacenamiento */ }
}

// La marca de una tienda (ms) si no venció, o null. La validación que vale es
// la del servidor (marcaVigente): acá solo se evita mandar una vieja.
export function marcaDe(almacen, vendedorId, ahoraMs) {
  const id = idValido(vendedorId)
  if (!id) return null
  const valor = leer(almacen)[id]
  if (typeof valor !== 'number' || !Number.isFinite(valor)) return null
  return valor >= ahoraMs - VIGENCIA_MARCA_MS ? valor : null
}

// El link propio, para copiar o mandar por WhatsApp.
//   linkPropio({ slug })        → https://bahiashops.com.ar/tienda/<slug>?de=tienda
//   linkPropio({ productoId })  → https://bahiashops.com.ar/producto/<id>?de=tienda
export function linkPropio({ slug, productoId } = {}) {
  const ruta = productoId !== undefined && productoId !== null
    ? `/producto/${encodeURIComponent(productoId)}`
    : `/tienda/${encodeURIComponent(slug)}`
  return `${SITIO_URL}${ruta}?${PARAMETRO_LINK}=${VALOR_LINK}`
}
