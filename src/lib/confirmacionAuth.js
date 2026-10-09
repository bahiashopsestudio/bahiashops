// La confirmación de los enlaces de los mails de Supabase Auth (registro,
// recuperar contraseña, cambio de email e invitación) en una ruta propia.
//
// Por qué: con {{ .ConfirmationURL }} el enlace vuelve a /auth/callback con un
// «code» que solo se puede canjear en el navegador donde se hizo el registro
// (flujo PKCE: la clave queda en una cookie sb-…-code-verifier de ese
// navegador). Abierto en otro navegador o en la app de Gmail del celular, falla.
// Con {{ .TokenHash }}, la verificación la hace el servidor con verifyOtp y no
// necesita nada del navegador original.
//
// La página /auth/confirmar NO verifica al abrirse: muestra un botón. Algunos
// programas de mail abren los enlaces antes que la persona para revisarlos, y
// eso gastaría el enlace (sirve una sola vez). La verificación pasa recién al
// apretar el botón (POST a /auth/confirmar/verificar).
//
// Son funciones puras: las rutas leen y redirigen, acá se decide.

import { rutaInterna } from '@/lib/rutas'

// Los type de verifyOtp para cada mail, con lo que ve la persona y adónde va
// después. 'email' es la confirmación del registro.
export const TIPOS = {
  email: {
    titulo: 'Confirmá tu cuenta',
    texto: 'Tocá el botón para confirmar tu email y terminar de crear tu cuenta.',
    boton: 'Confirmar mi cuenta',
    destino: null,
  },
  recovery: {
    titulo: 'Elegí una contraseña nueva',
    texto: 'Tocá el botón para seguir y elegir tu contraseña nueva.',
    boton: 'Seguir',
    destino: '/actualizar-contrasena',
  },
  email_change: {
    titulo: 'Confirmá tu nuevo email',
    texto: 'Tocá el botón para confirmar el cambio de email de tu cuenta.',
    boton: 'Confirmar el cambio',
    destino: '/perfil',
  },
  invite: {
    titulo: 'Aceptá la invitación',
    texto: 'Tocá el botón para entrar a Bahía Shops. Después vas a poder elegir tu contraseña.',
    boton: 'Aceptar la invitación',
    destino: '/actualizar-contrasena',
  },
}

// El token_hash que manda Supabase: letras, números, guiones. Cualquier otra
// cosa se rechaza antes de llamar a Supabase.
const RE_TOKEN = /^[A-Za-z0-9_-]{10,200}$/

function primero(valor) {
  return Array.isArray(valor) ? valor[0] : valor
}

// Adónde volver después de confirmar el registro. Llega de dos formas:
//   next         una ruta interna (?next=/checkout)
//   redirect_to  lo que el sitio le pasó a Supabase al registrarse
//                ({{ .RedirectTo }}: https://bahiashops.com.ar/auth/callback?next=/checkout).
//                Solo se acepta si es de este mismo sitio; de ahí sale su next.
// Todo pasa por rutaInterna: nunca se redirige afuera.
export function siguienteDesde({ next, redirect_to: redirectTo }, origenDelSitio) {
  const directo = primero(next)
  if (typeof directo === 'string' && directo) return rutaInterna(directo)

  const crudo = primero(redirectTo)
  if (typeof crudo !== 'string' || !crudo) return '/'
  try {
    const url = new URL(crudo)
    if (url.origin !== origenDelSitio) return '/'
    // Lo normal: /auth/callback?next=/algo, y vale el next. Otra ruta del sitio
    // vale tal cual.
    const destino = url.pathname === '/auth/callback' ? (url.searchParams.get('next') || '/') : url.pathname + url.search
    return rutaInterna(destino)
  } catch {
    return '/'
  }
}

// Lee y valida lo que trae el enlace (o el formulario). Devuelve
// { ok: true, tokenHash, tipo, next } o { ok: false, motivo }.
export function leerConfirmacion(params, origenDelSitio) {
  const tokenHash = primero(params?.token_hash)
  const tipo = primero(params?.type)
  if (!Object.hasOwn(TIPOS, tipo ?? '')) return { ok: false, motivo: 'tipo' }
  if (typeof tokenHash !== 'string' || !RE_TOKEN.test(tokenHash)) return { ok: false, motivo: 'token' }
  return { ok: true, tokenHash, tipo, next: siguienteDesde(params || {}, origenDelSitio) }
}

// Adónde ir después de confirmar. Para el registro decide destinoDespuesDeEntrar
// (la bienvenida la primera vez); para los demás, un lugar fijo.
export function destinoFijo(tipo) {
  return TIPOS[tipo]?.destino ?? null
}

// Un formulario de otro sitio no puede usar esta ruta (por ejemplo, para hacer
// entrar a alguien en una cuenta ajena): el POST tiene que venir de este mismo
// origen. Sin cabecera Origin (navegadores viejos) se acepta: el token igual es
// de un solo uso y se manda en el cuerpo.
export function origenPermitido(origenDelPedido, origenDelSitio) {
  if (!origenDelPedido) return true
  return origenDelPedido === origenDelSitio
}

// El mensaje para la persona según lo que respondió Supabase.
export function mensajeDeError(motivo) {
  if (motivo === 'vencido') {
    return {
      titulo: 'Este enlace ya no sirve',
      texto: 'Venció o ya se usó: cada enlace sirve una sola vez y por un tiempo limitado. Si ya confirmaste, entrá con tu email y tu contraseña. Si no, pedí un enlace nuevo.',
    }
  }
  if (motivo === 'origen') {
    return {
      titulo: 'No pudimos confirmar',
      texto: 'La confirmación tiene que hacerse desde el enlace del mail. Abrilo de nuevo y tocá el botón.',
    }
  }
  return {
    titulo: 'El enlace no es válido',
    texto: 'Puede que se haya cortado al copiarlo. Abrí el enlace del mail de nuevo; si sigue fallando, pedí uno nuevo.',
  }
}

// Qué error de Supabase es «venció o ya se usó».
export function esVencido(error) {
  const codigo = String(error?.code || '')
  const texto = String(error?.message || '').toLowerCase()
  return codigo === 'otp_expired' || codigo === 'flow_state_expired' || /expired|invalid/.test(texto)
}
