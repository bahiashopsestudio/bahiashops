import { notFound } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { vendedorPublicado } from '@/lib/vendedoresPublicos';
import ColeccionContent from '@/components/ColeccionContent';

// Si la colección no existe la página llama a notFound() y este metadata se
// descarta con ella, así que la canónica no llega a servirse en un 404.
export async function generateMetadata({ params }) {
  const { slug } = await params;
  return {
    alternates: { canonical: `/coleccion/${encodeURIComponent(slug)}` },
  };
}

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
        vendedor:vendedores ( nombre_negocio, estado_validacion, bloqueado ),
        media:producto_media ( url, es_principal, orden )
      )
    `)
    .eq('coleccion_id', coleccion.id)
    .order('orden');

  // El vendedor cuelga dos niveles adentro, así que el filtro va acá y no en
  // la query. Que un producto esté curado en una cápsula no lo hace visible:
  // si la tienda está bloqueada o despublicada, sale de la cápsula también.
  const productos = (filas || [])
    .filter((f) => f.producto && f.producto.estado === 'activo' && vendedorPublicado(f.producto.vendedor))
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
