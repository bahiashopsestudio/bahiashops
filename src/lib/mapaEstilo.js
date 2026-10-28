// El estilo del mapa público (MapaVendedores): las dos pieles, las capas del
// fondo, la casita de los pines y las reglas de los nombres de barrio.
//
// Todo sale de docs/mapa-mockup.html, que es la fuente de verdad: si cambia
// el diseño, se cambia ahí primero y se copia acá tal cual. En el mockup las
// pieles se llaman "audaz" (Claro) y "verde" (Oscuro).
//
// El fondo es OpenFreeMap (teselas vectoriales de OpenMapTiles): sin clave y
// sin tope de visitas. Su atribución la trae la propia fuente y el mapa la
// muestra plegada en el botón (i), que la despliega.

import { RADIO_ZONA_M } from '@/lib/zonaVendedor'

export const PIELES = {
  claro: {
    land: '#9cc3ea', park: '#88b4e2', water: '#4164fe', building: '#8bb6e4', minor: '#4164fe', major: '#4164fe',
    rail: '#7ea9d8', halo: '#9cc3ea', place: '#4164fe', waterLabel: '#ffffff',
    bLabel: '#4164fe', bHaloCss: '#9cc3ea',
    pin: '#015444', aro: '#015444',
  },
  oscuro: {
    land: '#015444', park: '#0d6650', water: '#4164fe', building: '#0a5f4e', minor: '#9cc3ea', major: '#9cc3ea',
    rail: '#2c7a66', halo: '#015444', place: '#9cc3ea', waterLabel: '#9cc3ea',
    bLabel: '#9cc3ea', bHaloCss: '#015444',
    pin: '#f4e9e1', aro: '#f4e9e1',
  },
}

export const PIEL_INICIAL = 'claro'

// La casita: la punta de la cola (abajo a la izquierda) marca el punto exacto.
export const CASA = 'M9.7 0 19.1 6.8V20H9.1L0 27.9V6.8Z'
export const CASA_VIEWBOX = '0 0 19.1 27.9'

// El centro de la vista y la Plaza Rivadavia.
export const CENTRO_MAPA = [-62.266, -38.715]
export const PLAZA = [-62.2663, -38.7183]

// Tamaño de letra de los nombres de las localidades del fondo (capa
// place-label). Lo usa también la reserva de lugar de «Bahía Blanca».
export const TAMANO_LOCALIDAD = { city: 22, town: 16, village: 13 }
export const ESPACIADO_LOCALIDAD = 0.06

// La zona es un aro sobre el borde de los RADIO_ZONA_M metros, que nunca
// baja de RADIO_MINIMO_PX en pantalla (con 4 px de borde, uno más chico se ve
// como un punto lleno). Con teselas de 512 px el radio en píxeles se duplica
// con cada nivel de zoom, así que una interpolación exponencial de base 2 lo
// da exacto; antes del zoom en que llega al mínimo, queda fijo en el mínimo.
//
// Al pasar el mouse (o con su ventanita abierta) el aro crece: radio un 15 %
// más grande y borde de 5 px. Lo maneja feature-state "g", de 0 a 1, que
// MapaVendedores anima: MapLibre no anima los cambios de feature-state (las
// propiedades -transition no aplican), así que el paso a paso va por código.
const RADIO_MINIMO_PX = 12
const ZOOM_MAXIMO_CIRCULO = 18
const BORDE_ARO_PX = 4
const BORDE_ARO_GRANDE_PX = 5
const CRECE_ARO = 0.15
const g = ['to-number', ['coalesce', ['feature-state', 'g'], 0]]
const BORDE_ARO =['+', BORDE_ARO_PX, ['*', g, BORDE_ARO_GRANDE_PX - BORDE_ARO_PX]]

// MapLibre dibuja el borde por fuera de circle-radius: se le resta medio
// borde para que la línea quede centrada sobre el radio de la zona. Cada
// valor es lineal en 2^zoom, así que la interpolación sigue siendo exacta.
function radioAro(radio) {
  return ['-', ['*', radio, ['+', 1, ['*', g, CRECE_ARO]]], ['/', BORDE_ARO, 2]]
}
function radioZona() {
  const metrosPorPixelZoom0 = (40075016.686 * Math.cos((PLAZA[1] * Math.PI) / 180)) / 512
  const radioZoom0 = RADIO_ZONA_M / metrosPorPixelZoom0
  const zoomDelMinimo = Math.log2(RADIO_MINIMO_PX / radioZoom0)
  return ['interpolate', ['exponential', 2], ['zoom'],
    0, radioAro(RADIO_MINIMO_PX),
    zoomDelMinimo, radioAro(RADIO_MINIMO_PX),
    ZOOM_MAXIMO_CIRCULO, radioAro(radioZoom0 * 2 ** ZOOM_MAXIMO_CIRCULO)]
}

const ZONAS_VACIAS = { type: 'FeatureCollection', features: [] }

// zonas: FeatureCollection de puntos (un punto por celda de la grilla, con
// properties.celda y un id numérico para feature-state). Las capas y los
// valores son los del mockup; la zona es un aro (capa circle) en lugar del
// polígono translúcido del mockup. El relleno va con opacidad 0: no se ve,
// pero el círculo entero sigue respondiendo al mouse y al toque.
export function buildStyle(piel, zonas = ZONAS_VACIAS) {
  const s = PIELES[piel] || PIELES[PIEL_INICIAL]
  const name = ['coalesce', ['get', 'name:es'], ['get', 'name']]
  const w = (a, b) => ['interpolate', ['exponential', 1.6], ['zoom'], 11, a, 17, b]
  const notTunnel = ['!=', ['get', 'brunnel'], 'tunnel']
  const majors = ['match', ['get', 'class'], ['motorway', 'trunk', 'primary', 'secondary'], true, false]
  const minors = ['match', ['get', 'class'], ['tertiary', 'minor', 'service'], true, false]
  return {
    version: 8,
    glyphs: 'https://tiles.openfreemap.org/fonts/{fontstack}/{range}.pbf',
    sources: {
      omt: { type: 'vector', url: 'https://tiles.openfreemap.org/planet' },
      zonas: { type: 'geojson', data: zonas },
    },
    layers: [
      { id: 'bg', type: 'background', paint: { 'background-color': s.land } },
      { id: 'park', type: 'fill', source: 'omt', 'source-layer': 'park', paint: { 'fill-color': s.park } },
      { id: 'green', type: 'fill', source: 'omt', 'source-layer': 'landcover', filter: ['match', ['get', 'class'], ['grass', 'wood'], true, false], paint: { 'fill-color': s.park, 'fill-opacity': 0.7 } },
      { id: 'water', type: 'fill', source: 'omt', 'source-layer': 'water', paint: { 'fill-color': s.water } },
      { id: 'waterway', type: 'line', source: 'omt', 'source-layer': 'waterway', paint: { 'line-color': s.water, 'line-width': 1.2 } },
      { id: 'building', type: 'fill', source: 'omt', 'source-layer': 'building', minzoom: 14, paint: { 'fill-color': s.building } },
      { id: 'road-minor', type: 'line', source: 'omt', 'source-layer': 'transportation', filter: ['all', notTunnel, minors],
        layout: { 'line-cap': 'round', 'line-join': 'round' }, paint: { 'line-color': s.minor, 'line-width': w(0.5, 3.5), 'line-opacity': 0.85 } },
      { id: 'road-major', type: 'line', source: 'omt', 'source-layer': 'transportation', filter: ['all', notTunnel, majors],
        layout: { 'line-cap': 'round', 'line-join': 'round' }, paint: { 'line-color': s.major, 'line-width': w(1.2, 7) } },
      { id: 'zonas', type: 'circle', source: 'zonas',
        paint: { 'circle-color': s.aro, 'circle-opacity': 0, 'circle-stroke-color': s.aro, 'circle-stroke-opacity': 1,
          'circle-stroke-width': BORDE_ARO, 'circle-radius': radioZona() } },
      { id: 'rail', type: 'line', source: 'omt', 'source-layer': 'transportation', filter: ['==', ['get', 'class'], 'rail'],
        paint: { 'line-color': s.rail, 'line-width': 1, 'line-dasharray': [3, 3] } },
      { id: 'water-label', type: 'symbol', source: 'omt', 'source-layer': 'water_name',
        layout: { 'text-field': name, 'text-font': ['Noto Sans Italic'], 'text-size': 13 },
        paint: { 'text-color': s.waterLabel, 'text-halo-width': 0 } },
      { id: 'place-label', type: 'symbol', source: 'omt', 'source-layer': 'place',
        filter: ['match', ['get', 'class'], ['city', 'town', 'village'], true, false],
        layout: { 'text-field': name, 'text-font': ['Noto Sans Bold'],
          'text-size': ['match', ['get', 'class'], 'city', TAMANO_LOCALIDAD.city, 'town', TAMANO_LOCALIDAD.town, TAMANO_LOCALIDAD.village],
          'text-transform': 'uppercase', 'text-letter-spacing': ESPACIADO_LOCALIDAD },
        paint: { 'text-color': s.place, 'text-halo-color': s.halo, 'text-halo-width': 2 } },
    ],
  }
}

// Barrios partidos en varios pedazos: entre los pedazos grandes (al menos
// 1/5 del mayor), el nombre va en el más cercano a la plaza, que es donde la
// gente lo espera. Devuelve { ll, area } (area: la del pedazo mayor, para que
// gane el barrio más grande cuando dos nombres se pisan).
export function centro(geom) {
  const polys = geom.type === 'Polygon' ? [geom.coordinates] : geom.coordinates
  const partes = polys.map((pg) => {
    const r = pg[0]
    let A = 0, cx = 0, cy = 0
    for (let i = 0; i < r.length - 1; i++) {
      const [x1, y1] = r[i], [x2, y2] = r[i + 1], f = x1 * y2 - x2 * y1
      A += f; cx += (x1 + x2) * f; cy += (y1 + y2) * f
    }
    return A ? { ll: [cx / (3 * A), cy / (3 * A)], area: Math.abs(A) } : null
  }).filter(Boolean)
  if (!partes.length) return { ll: polys[0][0][0], area: 0 }
  const mayor = Math.max(...partes.map((p) => p.area))
  const d = (ll) => Math.hypot((ll[0] - PLAZA[0]) * 0.78, ll[1] - PLAZA[1])
  const elegida = partes.filter((p) => p.area >= mayor / 5).sort((a, b) => d(a.ll) - d(b.ll))[0]
  return { ll: elegida.ll, area: mayor }
}

// Una palabra por renglón. Las palabras cortas (de, del, la…) viajan pegadas
// a la siguiente, los números romanos (II, III) a la anterior, y si el nombre
// tiene « y » se parte ahí en dos renglones.
export function partir(n) {
  if (/\s+y\s+/.test(n)) { const i = n.search(/\s+y\s+/); return n.slice(0, i).trim() + '\n' + n.slice(i).trim() }
  const w = n.split(/\s+/), out = []
  let pend = ''
  w.forEach((p) => {
    if (/^(de|del|la|las|los|el|e)$/i.test(p)) { pend += p + ' ' }
    else if (/^[IVX]+$/.test(p) && out.length && !pend) { out[out.length - 1] += ' ' + p }
    else { out.push(pend + p); pend = '' }
  })
  if (pend) out.push(pend.trim())
  return out.join('\n')
}
