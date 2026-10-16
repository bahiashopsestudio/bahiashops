// Denunciar un producto desde su ficha.
//
//   POST { producto_id, motivo, comentario? } -> { ok, resultado: 'creada' | 'ya_existia' }
//
// Pide sesión. La regla entera la decide la base, en una sola transacción
// (migración 035, privado.registrar_denuncia): que el producto esté
// publicado, que no sea de la propia tienda, una sola denuncia pendiente por
// persona y producto, y hasta 10 por persona en 24 horas.
//
// La tienda nunca se entera: la tabla no tiene permisos para nadie más que el
// servidor, y nada de esto se le muestra al vendedor. Con la PRIMERA denuncia
// pendiente de un producto sale un mail a notificaciones@ (no con cada una).

import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { getServiceRoleClient } from '@/lib/supabase/admin'
import { validarDenuncia, LIMITE_DENUNCIAS_POR_DIA } from '@/lib/denuncias'
import { enviarMailDenuncia } from '@/lib/mailsDenuncias'

const NO_SE_PUDO = 'No pudimos enviar la denuncia. Probá de nuevo en un momento.'

export async function POST(request) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Iniciá sesión para denunciar un producto.' }, { status: 401 })

  const validado = validarDenuncia(await request.json().catch(() => null))
  if (!validado.ok) return NextResponse.json({ error: validado.error }, { status: 400 })

  const admin = getServiceRoleClient()
  const { data, error } = await admin.rpc('rpc_registrar_denuncia', {
    p_usuario_id: user.id,
    p_producto_id: validado.productoId,
    p_motivo: validado.motivo,
    p_comentario: validado.comentario,
  })
  if (error) {
    console.error('[denuncias/registrar]', error.code, error.message)
    if (error.code === '23514') return NextResponse.json({ error: 'Revisá la denuncia: algún dato no es válido.' }, { status: 400 })
    return NextResponse.json({ error: NO_SE_PUDO }, { status: 500 })
  }

  switch (data?.resultado) {
    case 'creada':
      if (data.primera) await avisar(admin, validado)
      return NextResponse.json({ ok: true, resultado: 'creada' })
    case 'ya_existia':
      return NextResponse.json({ ok: true, resultado: 'ya_existia' })
    case 'propio':
      return NextResponse.json({ error: 'No podés denunciar un producto de tu tienda.' }, { status: 403 })
    case 'no_disponible':
      return NextResponse.json({ error: 'Este producto ya no está publicado.' }, { status: 404 })
    case 'limite':
      return NextResponse.json({ error: `Llegaste al límite de ${LIMITE_DENUNCIAS_POR_DIA} denuncias por día. Probá mañana.` }, { status: 429 })
    default:
      console.error('[denuncias/registrar] resultado inesperado', data)
      return NextResponse.json({ error: NO_SE_PUDO }, { status: 500 })
  }
}

// El mail a notificaciones@. Si no se pudo leer el producto, sale igual con
// lo que haya: la denuncia ya está guardada.
async function avisar(admin, { productoId, motivo, comentario }) {
  const { data: producto, error } = await admin
    .from('productos')
    .select('nombre, vendedores ( nombre_negocio )')
    .eq('id', productoId)
    .maybeSingle()
  if (error) console.error('[denuncias/mail/producto]', productoId, error.message)
  await enviarMailDenuncia({
    productoId,
    producto: producto?.nombre,
    tienda: producto?.vendedores?.nombre_negocio,
    motivo,
    comentario,
  })
}
