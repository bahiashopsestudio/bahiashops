// Teléfonos argentinos, para armar links de WhatsApp.
//
// normalizarTelefonoAR devuelve 10 dígitos (característica + número, sin 0
// ni 15) o null si no puede armarlo. Probada contra los formatos reales que
// hay en la base.

export function normalizarTelefonoAR(entrada) {
  let d = String(entrada ?? '').replace(/\D/g, '');
  if (d.startsWith('54')) d = d.slice(2);
  if (d.startsWith('9') && d.length === 11) d = d.slice(1);
  if (d.startsWith('0')) d = d.slice(1);
  if (d.length === 12) {
    for (const k of [3, 4, 2]) {
      if (d.slice(k, k + 2) === '15') { d = d.slice(0, k) + d.slice(k + 2); break; }
    }
  }
  if (d.length === 9 && d.startsWith('15')) d = '291' + d.slice(2);
  if (d.length === 7) d = '291' + d;
  return d.length === 10 ? d : null;
}

export function linkWhatsApp(telefono, mensaje) {
  const d = normalizarTelefonoAR(telefono);
  if (!d) return null;
  return `https://wa.me/549${d}` + (mensaje ? `?text=${encodeURIComponent(mensaje)}` : '');
}
