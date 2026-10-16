// El aviso interno de una denuncia: a notificaciones@, solo con la PRIMERA
// denuncia pendiente de cada producto (lo decide la base, migración 035).
// No dice quién denunció.

import { plantilla, tituloTexto, parrafo, tarjeta, filaMonto, boton, escapar, TABLA, enviarPorResend } from '@/lib/mailBase'
import { EMAIL_NOTIFICACIONES, REMITENTE_NO_REPLY } from '@/lib/contacto'
import { SITIO_URL } from '@/lib/sitio'
import { textoMotivoDenuncia } from '@/lib/denuncias'

export function armarMailDenuncia({ productoId, producto, tienda, motivo, comentario }) {
  const asunto = `Denunciaron un producto: ${producto || `#${productoId}`}`
  const titulo = 'Denunciaron un producto'
  const explicacion = 'Es la primera denuncia de este producto. Sigue publicado hasta que lo revises. ' +
    'Si llegan más denuncias del mismo producto, se suman en el panel sin otro mail.'
  const datos = [
    ['Producto', producto || `#${productoId}`],
    ['Tienda', tienda || 'Sin nombre'],
    ['Motivo', textoMotivoDenuncia(motivo)],
  ]
  const enlace = `${SITIO_URL}/admin/denuncias`

  const cuerpo = [
    tituloTexto(titulo),
    parrafo(escapar(explicacion)),
    tarjeta('La denuncia', `<table ${TABLA} width="100%">${datos.map(([e, v]) => filaMonto(escapar(e), escapar(v))).join('\n')}</table>`
      + (comentario ? `<p style="margin:12px 0 0;white-space:pre-wrap;">“${escapar(comentario)}”</p>` : '')),
    boton('Ver las denuncias', enlace),
  ].join('\n')

  const texto = [
    titulo,
    explicacion,
    datos.map(([e, v]) => `${e}: ${v}`).join('\n') + (comentario ? `\nComentario: “${comentario}”` : ''),
    `Ver las denuncias: ${enlace}`,
  ].join('\n\n')

  return { asunto, html: plantilla({ asunto, cuerpo }), texto }
}

// Nunca lanza: la denuncia ya está guardada, el mail es un aviso.
export async function enviarMailDenuncia(datos) {
  try {
    const r = await enviarPorResend({
      para: EMAIL_NOTIFICACIONES,
      mail: armarMailDenuncia(datos),
      desde: REMITENTE_NO_REPLY,
      responderA: EMAIL_NOTIFICACIONES,
    })
    if (!r.ok) console.error('[denuncias/mail]', datos.productoId, r.motivo)
    return r.ok
  } catch (err) {
    console.error('[denuncias/mail]', datos.productoId, err?.message || err)
    return false
  }
}
