// Abre una categoría: la marca como activa para que aparezca en el menú y en
// el listado de /categorias.
//
// Por qué existe esta ruta: las pantallas del vendedor hacían el UPDATE
// directo desde el navegador y la base lo rechazaba por permisos —en silencio,
// porque nadie miraba el error. Escribir 'categorias' necesita service_role, y
// service_role no puede salir del servidor.
//
// A QUIÉN LE ABRE LA PUERTA. Ojo acá: esta ruta NO la llama un admin, la llama
// un vendedor cualquiera. Con verificar que haya sesión no alcanza: cualquiera
// con una cuenta podría encender las 18 categorías del sitio de un saque. Así
// que se verifica, del lado del servidor y contra la base, que la categoría
// pedida sea una que quien llama efectivamente usa:
//
//   a) es la categoría de su propia tienda, o
//   b) es la categoría —principal o secundaria— de alguno de sus productos.
//
// El caso (b) hace falta porque las pantallas de producto también abren
// categorías, y la de un producto no tiene por qué coincidir con la de la
// tienda. Las seis llamadas ocurren después de guardar, así que para cuando
// esto corre la fila ya está escrita y la comprobación la encuentra.

import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { getServiceRoleClient } from '@/lib/supabase/admin';

export async function POST(request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: 'Iniciá sesión.' }, { status: 401 });
  }

  const body = await request.json().catch(() => ({}));
  const categoriaId = Number(body.categoria_id);

  if (!Number.isInteger(categoriaId) || categoriaId <= 0) {
    return NextResponse.json({ error: 'Falta categoria_id.' }, { status: 400 });
  }

  const admin = getServiceRoleClient();

  // ── ¿Quién es? Tiene que ser un vendedor, y no uno bloqueado: abrir una
  // categoría es hacerla visible en el sitio, y lo de un vendedor bloqueado no
  // se muestra.
  const { data: vendedor, error: errorVendedor } = await admin
    .from('vendedores')
    .select('id, categoria_id, bloqueado')
    .eq('usuario_id', user.id)
    .maybeSingle();

  if (errorVendedor) {
    console.error('No se pudo verificar el vendedor al activar categoría', user.id, errorVendedor.message);
    return NextResponse.json({ error: 'No se pudo verificar el pedido.' }, { status: 500 });
  }

  if (!vendedor || vendedor.bloqueado) {
    return NextResponse.json({ error: 'No autorizado.' }, { status: 403 });
  }

  // ── ¿La categoría es suya? Primero la de su tienda; si no, la de alguno de
  // sus productos.
  let leCorresponde = vendedor.categoria_id === categoriaId;

  if (!leCorresponde) {
    const { data: producto, error: errorProducto } = await admin
      .from('productos')
      .select('id')
      .eq('vendedor_id', vendedor.id)
      .or(`categoria_id.eq.${categoriaId},categoria_secundaria_id.eq.${categoriaId}`)
      .limit(1)
      .maybeSingle();

    if (errorProducto) {
      console.error('No se pudo verificar el producto al activar categoría', vendedor.id, errorProducto.message);
      return NextResponse.json({ error: 'No se pudo verificar el pedido.' }, { status: 500 });
    }

    leCorresponde = !!producto;
  }

  if (!leCorresponde) {
    return NextResponse.json({ error: 'No autorizado.' }, { status: 403 });
  }

  // ── Abrirla. Si ya estaba abierta no se escribe nada.
  const { data: categoria, error: errorLectura } = await admin
    .from('categorias')
    .select('id, activa')
    .eq('id', categoriaId)
    .maybeSingle();

  if (errorLectura || !categoria) {
    return NextResponse.json({ error: 'Esa categoría no existe.' }, { status: 404 });
  }

  if (categoria.activa) {
    return NextResponse.json({ ok: true, activada: false });
  }

  const { error: errorUpdate } = await admin
    .from('categorias')
    .update({ activa: true })
    .eq('id', categoriaId);

  if (errorUpdate) {
    console.error('No se pudo activar la categoría', categoriaId, errorUpdate.message);
    return NextResponse.json({ error: 'No se pudo activar la categoría.' }, { status: 500 });
  }

  return NextResponse.json({ ok: true, activada: true });
}
