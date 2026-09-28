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

// Parte un teléfono de 10 dígitos en característica y número, sólo para
// mostrarlo o precargar un formulario. Los 10 dígitos no dicen dónde termina
// la característica: se reconocen 291 y 11, y el resto se parte en 4 + 6, que
// es lo más común en el interior. Para validar, siempre normalizarTelefonoAR.
export function separarTelefonoAR(diezDigitos) {
  const d = String(diezDigitos ?? '')
  if (d.length !== 10) return { caracteristica: '', numero: d }
  const largo = d.startsWith('291') ? 3 : d.startsWith('11') ? 2 : 4
  return { caracteristica: d.slice(0, largo), numero: d.slice(largo) }
}

// "+54 9 291 512-3456". Si se sabe cuántos dígitos son característica (lo
// que escribió la persona), se usa eso; si no, separarTelefonoAR.
export function formatearTelefonoAR(diezDigitos, largoCaracteristica) {
  const d = String(diezDigitos ?? '')
  if (d.length !== 10) return d
  const largo = largoCaracteristica || separarTelefonoAR(d).caracteristica.length
  const caracteristica = d.slice(0, largo)
  const numero = d.slice(largo)
  return `+54 9 ${caracteristica} ${numero.slice(0, -4)}-${numero.slice(-4)}`
}

export function linkWhatsApp(telefono, mensaje) {
  const d = normalizarTelefonoAR(telefono);
  if (!d) return null;
  return `https://wa.me/549${d}` + (mensaje ? `?text=${encodeURIComponent(mensaje)}` : '');
}
