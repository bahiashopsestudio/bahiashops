// Validación de destinos de redirección (el parámetro ?next=).
//
// Cualquier valor que venga de la URL y termine en un redirect tiene que pasar
// por acá. Si no, un next apuntando afuera convierte el login en un redirect
// abierto: el atacante manda un link a nuestro dominio y la víctima termina en
// el suyo, ya habiendo pasado por una pantalla de login legítima.

const RESPALDO = '/'

/**
 * Devuelve `valor` sólo si es una ruta interna segura. Si no, el respaldo.
 *
 * Rechaza, además de lo obvio:
 *  - "//otrodominio.com"  → como URL relativa, el navegador lo lee como host
 *  - "/\otrodominio.com"  → el navegador normaliza la barra invertida a "/",
 *                           así que equivale al caso anterior
 *  - "@otrodominio.com"   → concatenado a un origin, queda como userinfo y el
 *                           host real pasa a ser otrodominio.com
 */
export function rutaInterna(valor, respaldo = RESPALDO) {
  if (typeof valor !== 'string' || valor === '') return respaldo

  // Tiene que ser relativa a la raíz.
  if (!valor.startsWith('/')) return respaldo

  // Y no puede abrir una autoridad.
  if (valor.startsWith('//') || valor.includes('\\')) return respaldo

  // Red de seguridad: resolverla contra un origen ficticio y confirmar que
  // sigue ahí. Cubre codificaciones raras que se nos hayan escapado arriba.
  try {
    const base = 'https://destino.invalid'
    if (new URL(valor, base).origin !== base) return respaldo
  } catch {
    return respaldo
  }

  return valor
}
