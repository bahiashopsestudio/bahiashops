// Las direcciones de quien compra: de Bahía Blanca (con barrio) o de cualquier
// otra ciudad de Argentina. Módulo puro: lo usan el formulario, el checkout,
// el servidor y las pantallas que muestran una dirección.
//
// Una dirección es de Bahía si tiene barrio: el formulario lo exige en Bahía
// y no lo pide en otra ciudad. No hay otra columna que diga lo mismo y se
// pueda desfasar.

export const CIUDAD_BAHIA = 'Bahía Blanca'
export const PROVINCIA_BAHIA = 'Buenos Aires'

// Las 24 jurisdicciones. La migración 021 exige estos mismos textos.
export const PROVINCIAS = [
  'Buenos Aires', 'Ciudad Autónoma de Buenos Aires', 'Catamarca', 'Chaco', 'Chubut', 'Córdoba',
  'Corrientes', 'Entre Ríos', 'Formosa', 'Jujuy', 'La Pampa', 'La Rioja', 'Mendoza', 'Misiones',
  'Neuquén', 'Río Negro', 'Salta', 'San Juan', 'San Luis', 'Santa Cruz', 'Santa Fe',
  'Santiago del Estero', 'Tierra del Fuego', 'Tucumán',
]

// Argentina continental e islas, con margen. Sólo descarta puntos absurdos.
const AREA_ARGENTINA = { latMin: -56, latMax: -21, lngMin: -74, lngMax: -53 }

export const LARGO_CIUDAD = 80

export function esDeBahia(direccion) {
  return direccion?.barrio_id !== null && direccion?.barrio_id !== undefined
}

// "b8000 abc" -> "B8000ABC"; "8000" -> "8000". Vacío -> ''.
export function normalizarCodigoPostal(valor) {
  return String(valor ?? '').toUpperCase().replace(/[\s.-]/g, '')
}

// El CPA (una letra, cuatro números, tres letras) o el código viejo de cuatro
// números. Es el mismo formato que exige la base.
export function codigoPostalValido(valor) {
  return /^([A-Z]\d{4}[A-Z]{3}|\d{4})$/.test(normalizarCodigoPostal(valor))
}

// Las mayúsculas, los acentos y los espacios no cuentan: "bahia  blanca" es
// Bahía Blanca.
export function mismaCiudad(a, b) {
  const plano = (t) => String(t ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '')
    .toLowerCase().replace(/\s+/g, ' ').trim()
  return plano(a) !== '' && plano(a) === plano(b)
}

// ── Comparar lo que devuelve el buscador con lo que escribió la persona ──
//
// Nominatim nombra las ciudades a su manera: "Ciudad de Mendoza", "Distrito
// Ciudad de San Martín", "Ciudad del Libertador General San Martín". La ciudad
// escrita coincide si aparece entera, como frase, en alguno de los nombres de
// localidad que devuelve (sin mayúsculas, acentos ni espacios de más). Así
// "Mendoza" coincide con "Ciudad de Mendoza" pero no con "Distrito Ciudad de
// San Martín", aunque los dos estén en la provincia de Mendoza.

const plano = (t) => String(t ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '')
  .toLowerCase().replace(/[^a-z0-9ñ]+/g, ' ').trim()

const contieneFrase = (texto, frase) => {
  const t = plano(texto)
  const f = plano(frase)
  return f !== '' && ` ${t} `.includes(` ${f} `)
}

// Los campos de address de Nominatim que nombran la localidad.
const CAMPOS_LOCALIDAD = ['city', 'town', 'village', 'hamlet', 'municipality', 'suburb', 'city_district']

// "Distrito Ciudad de San Martín" -> "San Martín", para mostrar.
function nombreParaMostrar(nombre) {
  return String(nombre ?? '').replace(/^Distrito\s+/i, '').replace(/^Ciudad de\s+/i, '').trim()
}

// address: el objeto address de un resultado de Nominatim.
// Devuelve { ok, ciudadEncontrada, provinciaEncontrada }: ok es false si la
// ciudad o la provincia que devolvió no son las que se escribieron. Sin
// address no hay con qué comparar: ok.
export function coincideLugar({ ciudad, provincia }, address) {
  if (!address) return { ok: true, ciudadEncontrada: null, provinciaEncontrada: null }
  const localidades = CAMPOS_LOCALIDAD.map((c) => address[c]).filter(Boolean)
  const principal = address.city || address.town || address.village || address.hamlet || address.municipality || null
  const ciudadOk = localidades.some((n) => contieneFrase(n, ciudad))
  const provinciaOk = !address.state || !provincia ||
    contieneFrase(address.state, provincia) || contieneFrase(provincia, address.state)
  return {
    ok: ciudadOk && provinciaOk,
    ciudadEncontrada: principal ? nombreParaMostrar(principal) : null,
    provinciaEncontrada: address.state || null,
  }
}

// El aviso de arriba del mapa cuando no coinciden, o null.
export function avisoLugar({ ciudad, provincia }, address) {
  const r = coincideLugar({ ciudad, provincia }, address)
  if (r.ok) return null
  const escrita = String(ciudad ?? '').trim()
  const provinciaDistinta = r.provinciaEncontrada && provincia &&
    !contieneFrase(r.provinciaEncontrada, provincia) && !contieneFrase(provincia, r.provinciaEncontrada)
  const encontrada = [r.ciudadEncontrada, provinciaDistinta ? r.provinciaEncontrada : null].filter(Boolean).join(', ') ||
    r.provinciaEncontrada || 'otro lugar'
  const pedida = provinciaDistinta ? `${escrita}, ${provincia}` : escrita
  return `Encontramos esta dirección en ${encontrada}, no en ${pedida}. Revisá los datos o mové el pin hasta tu casa.`
}

// Lo que el formulario guarda. Devuelve el error para mostrar, o null.
//   d: { enBahia, calle, numero, telefono, ciudad, provincia, codigoPostal,
//        barrioId, lat, lng }
export function errorDireccion(d) {
  if (!String(d.calle ?? '').trim() || !String(d.numero ?? '').trim() || !String(d.telefono ?? '').trim()) {
    return 'Completá calle, número y teléfono.'
  }
  if (!d.enBahia) {
    const ciudad = String(d.ciudad ?? '').trim()
    if (!PROVINCIAS.includes(d.provincia)) return 'Elegí la provincia.'
    if (!ciudad) return 'Escribí la ciudad.'
    if (ciudad.length > LARGO_CIUDAD) return 'El nombre de la ciudad es demasiado largo.'
    if (mismaCiudad(ciudad, CIUDAD_BAHIA)) {
      return 'Si es en Bahía Blanca, elegí "Sí, en Bahía Blanca": así cargás tu barrio.'
    }
  }
  if (!codigoPostalValido(d.codigoPostal)) {
    return 'Escribí el código postal: 4 números (8000) o el de 8 caracteres (B8000ABC).'
  }
  const lat = Number(d.lat)
  const lng = Number(d.lng)
  if (d.lat === null || d.lat === undefined || d.lng === null || d.lng === undefined ||
      !Number.isFinite(lat) || !Number.isFinite(lng)) {
    return 'Ubicá la dirección en el mapa con el botón "Ubicar en el mapa": la usamos para calcular el costo de envío.'
  }
  if (lat < AREA_ARGENTINA.latMin || lat > AREA_ARGENTINA.latMax || lng < AREA_ARGENTINA.lngMin || lng > AREA_ARGENTINA.lngMax) {
    return 'El punto del mapa quedó fuera de Argentina. Movelo hasta tu puerta.'
  }
  if (d.enBahia && !d.barrioId) {
    return 'Necesitamos saber tu barrio para calcular el costo de envío. Usá el botón "Ubicar en el mapa" o elegí tu barrio de la lista.'
  }
  return null
}

// "Alsina 235, 2B" a partir de una fila de direcciones (o su copia).
export function calleNumeroDepto(direccion) {
  const calle = [direccion?.calle, direccion?.numero]
    .map((v) => (v == null ? '' : String(v).trim()))
    .filter(Boolean)
    .join(' ')
  const depto = direccion?.piso_depto ? String(direccion.piso_depto).trim() : ''
  return [calle, depto].filter(Boolean).join(', ')
}

// "Punta Alta, Buenos Aires (B8109)" o "Bahía Blanca (8000)". Vacío si la
// dirección no tiene ciudad (las viejas de Bahía antes de la 021).
export function ciudadProvinciaCodigo(direccion) {
  const ciudad = String(direccion?.ciudad ?? '').trim()
  const provincia = String(direccion?.provincia ?? '').trim()
  const cp = normalizarCodigoPostal(direccion?.codigo_postal)
  const lugar = ciudad && provincia && !(mismaCiudad(ciudad, CIUDAD_BAHIA) && provincia === PROVINCIA_BAHIA)
    ? `${ciudad}, ${provincia}`
    : ciudad
  return [lugar, cp ? `(${cp})` : ''].filter(Boolean).join(' ')
}
