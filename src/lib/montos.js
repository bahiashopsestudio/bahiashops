// Cómo se escribe un monto en pesos: punto de miles y, sólo si tiene centavos,
// dos decimales con coma. "14.500", "3", "2,50". Sin el signo: cada pantalla
// lo pone a su manera ("$ 2,50", "-$ 2,50", "$2.500").
//
// Primero se lleva a centavos: una resta como 19,99 − 1 da 18,989999… en
// JavaScript, y tiene que verse "18,99", no "18,989" ni "19,00".
export function formatearMonto(n) {
  const centavos = Math.round(Number(n || 0) * 100)
  const decimales = centavos % 100 === 0 ? 0 : 2
  return (centavos / 100).toLocaleString('es-AR', {
    minimumFractionDigits: decimales,
    maximumFractionDigits: decimales,
  })
}
