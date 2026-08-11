import { notFound } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import ColeccionContent from '@/components/ColeccionContent';

export default async function ColeccionPage({ params }) {
  const { slug } = await params;
  const supabase = await createClient();

  const { data: coleccion } = await supabase
    .from('colecciones')
    .select('id, nombre, slug, descripcion, imagen_url, tipo')
    .eq('slug', slug)
    .eq('activa', true)
    .single();

  if (!coleccion) notFound();

  const { data: filas } = await supabase
    .from('coleccion_productos')
    .select(`
      orden,
      producto:productos (
        id, nombre, precio, precio_anterior, estado,
        vendedor:vendedores ( nombre_negocio ),
        media:producto_media ( url, es_principal, orden )
      )
    `)
    .eq('coleccion_id', coleccion.id)
    .order('orden');

  const productos = (filas || [])
    .filter((f) => f.producto && f.producto.estado === 'activo')
    .map((f) => ({
      id: f.producto.id,
      nombre: f.producto.nombre,
      precio: f.producto.precio,
      precio_anterior: f.producto.precio_anterior,
      vendedor: f.producto.vendedor,
      media: f.producto.media,
    }));

  return <ColeccionContent coleccion={coleccion} productos={productos} />;
}
