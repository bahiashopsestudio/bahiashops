// El fondo de todos los mapas del sitio: de dónde salen los tiles y qué
// atribución se muestra. Es el único lugar que lo sabe.
//
// Desde fines de agosto de 2026 CARTO no sirve tiles sin clave: devuelve una
// imagen que dice "API KEY REQUIRED". Con la clave (NEXT_PUBLIC_CARTO_KEY)
// se usa CARTO; sin ella, el OpenStreetMap estándar, que no pide clave.
//
// La clave va en la URL de cada tile, así que el navegador la ve igual: no
// es un secreto. NEXT_PUBLIC_ se incrusta al compilar, por eso cargarla o
// cambiarla en Vercel no hace efecto hasta el próximo deploy. Y tiene que
// leerse escrita así, entera: Next no reemplaza accesos armados en runtime.
//
// Las dos atribuciones son obligatorias por las condiciones de cada
// proveedor. Ningún mapa puede apagar el control de atribución.
//
// Política de OSM (operations.osmfoundation.org/policies/tiles): sin
// subdominios ({s} está deprecado), Referer válido (el navegador lo manda
// solo; no tocar referrerPolicy), nada de descargar tiles por adelantado y
// zoom máximo 19.

const CARTO_KEY = process.env.NEXT_PUBLIC_CARTO_KEY

const ATRIBUCION_OSM =
  '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'

const ATRIBUCION_CARTO =
  `${ATRIBUCION_OSM}, &copy; <a href="https://carto.com/attributions">CARTO</a>`

// URL tal como la documenta CARTO para usar con clave: sin subdominios y
// sin @2x, que no confirman que anden con clave.
function tilesCarto(estilo) {
  return {
    url: `https://basemaps.cartocdn.com/rastertiles/${estilo}/{z}/{x}/{y}.png?key=${encodeURIComponent(CARTO_KEY)}`,
    attribution: ATRIBUCION_CARTO,
  }
}

const TILES_OSM = {
  url: 'https://tile.openstreetmap.org/{z}/{x}/{y}.png',
  attribution: ATRIBUCION_OSM,
  maxZoom: 19,
}

// Mapas públicos de vendedores (home y /mapa): fondo sin nombres de calles.
// OSM estándar no tiene esa versión: con OSM se ven los nombres.
export const TILES_VENDEDORES = CARTO_KEY ? tilesCarto('voyager_nolabels') : TILES_OSM

// Mapa para ubicar un punto (alta de vendedor, /vendedor/ubicacion y
// direcciones): con nombres de calles, para que la persona se oriente.
export const TILES_UBICACION = CARTO_KEY ? tilesCarto('voyager') : TILES_OSM
