// Fechas en hora de Argentina, escritas como se leen en el sitio: "15 de oct"
// (reseñas) y "15 de octubre" (el límite del apodo). '' si la fecha no se
// puede leer. Funciones puras: las usan el navegador, el servidor y las
// pruebas.

const ZONA = 'America/Argentina/Buenos_Aires'
const MESES = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre']
const MESES_CORTOS = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic']

// El día y el mes (0 a 11) de un instante, en Argentina.
function diaYMes(valor) {
  const ms = valor instanceof Date ? valor.getTime() : Date.parse(valor)
  if (!Number.isFinite(ms)) return null
  const partes = new Intl.DateTimeFormat('en-US', { timeZone: ZONA, day: 'numeric', month: 'numeric' })
    .formatToParts(new Date(ms))
  const dia = Number(partes.find((p) => p.type === 'day')?.value)
  const mes = Number(partes.find((p) => p.type === 'month')?.value) - 1
  if (!Number.isInteger(dia) || !Number.isInteger(mes) || mes < 0 || mes > 11) return null
  return { dia, mes }
}

// "15 de oct"
export function fechaCorta(valor) {
  const f = diaYMes(valor)
  return f ? `${f.dia} de ${MESES_CORTOS[f.mes]}` : ''
}

// "15 de octubre"
export function fechaLarga(valor) {
  const f = diaYMes(valor)
  return f ? `${f.dia} de ${MESES[f.mes]}` : ''
}
