// Los pedidos de una tienda, para el panel del vendedor.
//
// Por qué existe esta ruta y no un puñado de policies: la pantalla necesita
// tres tablas que el vendedor no puede leer desde el navegador —'pedidos' sólo
// la ve el comprador, 'pedido_items' cuelga de ella, y 'direcciones' es del
// comprador—. Resolverlo con RLS eran tres policies nuevas, y la de escritura
// además no alcanzaba: RLS decide qué filas se tocan, no a qué valor, así que
// un vendedor podría marcarse un pedido como 'pagado'. Acá el permiso se
// verifica una vez y la regla de negocio queda en un archivo que se puede leer.
//
// El vendedor sale de la sesión, nunca del body: no hay forma de pedir los
// pedidos de otra tienda.

import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { getServiceRoleClient } from '@/lib/supabase/admin';

export async function GET() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: 'Iniciá sesión.' }, { status: 401 });
  }

  const admin = getServiceRoleClient();

  const { data: vendedor, error: errorVendedor } = await admin
    .from('vendedores')
    .select('id, nombre_negocio')
    .eq('usuario_id', user.id)
    .maybeSingle();

  if (errorVendedor) {
    console.error('No se pudo leer el vendedor', user.id, errorVendedor.message);
    return NextResponse.json({ error: 'No se pudieron cargar los pedidos.' }, { status: 500 });
  }

  if (!vendedor) {
    return NextResponse.json({ error: 'No encontramos tu cuenta de vendedor.' }, { status: 403 });
  }

  // Sólo los suyos. El filtro va acá, no en el cliente.
  const { data: pedidos, error } = await admin
    .from('pedidos')
    .select(`
      id, estado, metodo_envio, subtotal_productos, costo_envio, total,
      comision_plataforma, turno_preferido, franja_horaria, creado_en, actualizado_en,
      items:pedido_items ( id, nombre, variante, cantidad, precio, foto_url ),
      direccion:direcciones ( calle, numero, piso_depto, telefono, barrio_id )
    `)
    .eq('vendedor_id', vendedor.id)
    .order('creado_en', { ascending: false });

  if (error) {
    console.error('No se pudieron leer los pedidos', vendedor.id, error.message);
    return NextResponse.json({ error: 'No se pudieron cargar los pedidos.' }, { status: 500 });
  }

  // De la dirección del comprador sale sólo lo que hace falta para entregar y
  // para escribirle por WhatsApp. Nada más de su ficha viaja hasta acá: el
  // select de arriba ya nombra las cinco columnas.
  return NextResponse.json({
    vendedor: { id: vendedor.id, nombre_negocio: vendedor.nombre_negocio },
    pedidos: pedidos || [],
  });
}
