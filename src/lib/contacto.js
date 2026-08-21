// Direcciones de correo de Bahía Shops. Única fuente de verdad: no escribir
// direcciones literales en componentes, páginas legales ni rutas de API.
//
// Este archivo se versiona, así que sólo lleva direcciones del dominio.

// Contacto general, visible al público y destino de las respuestas.
export const EMAIL_CONTACTO = 'hola@bahiashops.com.ar'

// Cuestiones legales: responsable del tratamiento de datos, uso de cuenta.
export const EMAIL_LEGAL = 'legales@bahiashops.com.ar'

// Botón de arrepentimiento — Ley 24.240, Resolución 424/2020.
export const EMAIL_ARREPENTIMIENTO = 'arrepentimiento@bahiashops.com.ar'

// Destino de los avisos internos que dispara el sitio (leads, contacto, etc.).
export const EMAIL_NOTIFICACIONES = 'notificaciones@bahiashops.com.ar'

// Remitente de los mails automáticos. Nadie lee lo que llegue acá.
export const EMAIL_NO_REPLY = 'no-reply@bahiashops.com.ar'

// Remitentes ya armados con el nombre de la marca, como los espera Resend.
export const REMITENTE_CONTACTO = `Bahía Shops <${EMAIL_CONTACTO}>`
export const REMITENTE_NO_REPLY = `Bahía Shops <${EMAIL_NO_REPLY}>`
