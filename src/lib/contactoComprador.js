// Los datos de contacto de quien compra que quedan congelados en el pedido.
//
// Es una función pura, como precioPedido.js: la ruta hace las lecturas y le
// pasa las filas. Así la regla se puede probar entera sin levantar nada.
//
// El teléfono sale, en este orden:
//   1. de la cuenta (usuarios.telefono), normalizado a 10 dígitos;
//   2. si el método pide dirección, de la dirección ya verificada;
//   3. si no la pide, de la dirección más reciente de quien compra. De esa
//      dirección se usa sólo el número: la dirección no se guarda.
//
// Si la cuenta no tenía teléfono y apareció uno en una dirección, se devuelve
// en telefonoParaCuenta para guardarlo también en usuarios.

import { normalizarTelefonoAR } from '@/lib/telefono'

// Vacío o sólo espacios cuenta como que no hay dato.
function textoONull(valor) {
  const t = typeof valor === 'string' ? valor.trim() : ''
  return t || null
}

export function datosContactoComprador({ cuenta, pideDireccion, direccionVerificada, direccionReciente }) {
  const telefonoCuenta = normalizarTelefonoAR(cuenta?.telefono)

  const direccionDelTelefono = pideDireccion ? direccionVerificada : direccionReciente
  const telefonoDireccion = telefonoCuenta ? null : normalizarTelefonoAR(direccionDelTelefono?.telefono)

  // Sólo si la cuenta no tenía nada: un teléfono cargado que no se pudo
  // normalizar no se pisa.
  const cuentaSinTelefono = !textoONull(cuenta?.telefono)

  // La copia es la fila tal como se verificó, sin el dueño.
  let direccionCopia = null
  if (pideDireccion && direccionVerificada) {
    const { usuario_id, ...resto } = direccionVerificada
    direccionCopia = resto
  }

  return {
    comprador_nombre: textoONull(cuenta?.nombre),
    comprador_apellido: textoONull(cuenta?.apellido),
    comprador_telefono: telefonoCuenta || telefonoDireccion,
    direccion_copia: direccionCopia,
    telefonoParaCuenta: cuentaSinTelefono && telefonoDireccion ? telefonoDireccion : null,
  }
}
