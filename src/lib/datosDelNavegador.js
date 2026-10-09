// Lo que el sitio guarda en el navegador, y qué se borra al cerrar sesión.
//
// Al cerrar sesión el sitio tiene que quedar como si nadie lo hubiese usado en
// ese dispositivo. Inventario (octubre de 2026):
//
//   localStorage
//     bahiashops_carrito    datos de la persona: el carrito (CarritoContext).
//     vendedores_seguidos   datos de la persona: las tiendas que sigue
//                           (tienda/[slug]/TiendaContent.jsx).
//   sessionStorage
//     bahiashops_cierre_propio  técnico: marca, solo en la pestaña donde se
//                               apretó «Cerrar sesión», que el cierre es de
//                               esa pestaña (ver cerrarSesion). Se borra sola.
//   cookies (las pone el sitio o Supabase)
//     sb-<proyecto>-auth-token(.0, .1…)  la sesión de Supabase: la borra el
//                                        propio signOut.
//     sb-<proyecto>-auth-token-code-verifier  técnico: la clave de un ingreso
//                                             con Google o un registro a medio
//                                             hacer (PKCE).
//     mp_oauth_state        técnico: el «state» de la conexión con
//                           MercadoPago (httpOnly, 10 minutos).
//
// Solo se borran las claves de la persona. Si se agrega otra, va en
// CLAVES_DE_LA_PERSONA.

export const CLAVES_DE_LA_PERSONA = ['bahiashops_carrito', 'vendedores_seguidos']

const CIERRE_PROPIO = 'bahiashops_cierre_propio'

// Borra del almacenamiento (localStorage) los datos de la persona. Nunca lanza:
// en modo privado o con el almacenamiento bloqueado, no hay nada que borrar.
export function borrarDatosDeLaPersona(almacen) {
  for (const clave of CLAVES_DE_LA_PERSONA) {
    try { almacen?.removeItem(clave) } catch { /* sin almacenamiento */ }
  }
}

// Cierra la sesión desde esta pestaña. Antes deja una marca en la memoria de
// ESTA pestaña (sessionStorage no se comparte), para que, cuando llegue el
// aviso de sesión cerrada, esta pestaña sepa que el cierre es suyo y no se
// recargue: la pantalla que llamó decide adónde ir. Las demás pestañas reciben
// el mismo aviso (Supabase lo reparte entre pestañas) sin la marca, y se
// recargan.
export async function cerrarSesion(supabase, opciones, almacenDeLaPestana = globalThis.sessionStorage) {
  try { almacenDeLaPestana.setItem(CIERRE_PROPIO, '1') } catch { /* sin almacenamiento */ }
  const resultado = await supabase.auth.signOut(opciones)
  // Si no se pudo cerrar, la marca no puede quedar para un cierre futuro.
  if (resultado?.error) {
    try { almacenDeLaPestana.removeItem(CIERRE_PROPIO) } catch { /* sin almacenamiento */ }
  }
  return resultado
}

// ¿El cierre de sesión lo pidió esta pestaña? Consume la marca.
export function fueCierrePropio(almacenDeLaPestana) {
  try {
    const propio = almacenDeLaPestana?.getItem(CIERRE_PROPIO) === '1'
    almacenDeLaPestana?.removeItem(CIERRE_PROPIO)
    return propio
  } catch {
    return false
  }
}

// Qué hace una pestaña cuando se entera de que la sesión se cerró: siempre
// borra los datos de la persona; si el cierre no fue suyo (otra pestaña, o la
// sesión venció), además se recarga para no seguir mostrando nada de antes.
export function alCerrarseLaSesion({ almacen, almacenDeLaPestana, vaciarMemoria, recargar }) {
  borrarDatosDeLaPersona(almacen)
  try { vaciarMemoria?.() } catch { /* que siga igual */ }
  const propio = fueCierrePropio(almacenDeLaPestana)
  if (!propio) recargar?.()
  return { propio }
}
