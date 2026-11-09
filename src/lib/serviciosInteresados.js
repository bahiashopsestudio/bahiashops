// Las anotaciones de /servicios, para el panel de admin. Funciones puras.

// Para agrupar rubros: minúsculas, sin tildes, espacios colapsados.
// «Gasista» y «gasista » cuentan juntos; «gas» queda aparte.
export function normalizarRubro(rubro) {
  return String(rubro ?? '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
}

// [{ rubro, cantidad }], de mayor a menor (a igual cantidad, alfabético).
export function contarPorRubro(anotaciones) {
  const cuentas = new Map()
  for (const a of anotaciones || []) {
    const clave = normalizarRubro(a.rubro)
    if (!clave) continue
    cuentas.set(clave, (cuentas.get(clave) || 0) + 1)
  }
  return [...cuentas]
    .map(([rubro, cantidad]) => ({ rubro, cantidad }))
    .sort((a, b) => b.cantidad - a.cantidad || a.rubro.localeCompare(b.rubro, 'es'))
}
