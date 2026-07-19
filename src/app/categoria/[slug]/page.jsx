'use client';

import { useState, useEffect } from 'react';
import { useParams } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import VolverAtras from '@/components/VolverAtras';
import BotonFavorito from '@/components/BotonFavorito';

export default function CategoriaPage() {
  const supabase = createClient();
  const params = useParams();
  const slug = params.slug;

  const [cargando, setCargando] = useState(true);
  const [categoria, setCategoria] = useState(null);
  const [noExiste, setNoExiste] = useState(false);
  const [subcategorias, setSubcategorias] = useState([]);
  const [productos, setProductos] = useState([]);
  const [subActiva, setSubActiva] = useState(null);

  useEffect(() => {
    async function cargar() {
      const { data: cat, error: errorCat } = await supabase
        .from('categorias')
        .select('id, nombre, slug')
        .eq('slug', slug)
        .single();

      if (errorCat || !cat) {
        setNoExiste(true);
        setCargando(false);
        return;
      }
      setCategoria(cat);

      const { data: subs } = await supabase
        .from('subcategorias')
        .select('id, nombre')
        .eq('categoria_id', cat.id)
        .eq('activa', true)
        .order('orden');
      setSubcategorias(subs || []);

      const { data: prods, error: errorProds } = await supabase
        .from('productos')
        .select(`
          id, nombre, precio, precio_anterior, subcategoria_id,
          producto_media ( url, orden ),
          vendedores ( nombre_negocio )
        `)
        .eq('categoria_id', cat.id)
        .eq('estado', 'activo')
        .order('creado_en', { ascending: false });

      if (errorProds) {
        console.error('Error cargando productos:', errorProds);
      }

      const limpios = (prods || []).map((p) => ({
        ...p,
        fotoPrincipal: [...(p.producto_media || [])].sort((a, b) => a.orden - b.orden)[0]?.url || null,
      }));
      setProductos(limpios);

      setCargando(false);
    }
    cargar();
  }, [slug]);

  function formatearPrecio(valor) {
    if (!valor) return '';
    return Number(valor).toLocaleString('es-AR');
  }

  if (cargando) {
    return <main style={{ padding: '2rem', textAlign: 'center', color: '#666' }}>Cargando...</main>;
  }

  if (noExiste) {
    return (
      <main style={{ padding: '2rem', maxWidth: '820px', margin: '0 auto' }}>
        <VolverAtras href="/" texto="Inicio" />
        <h1 style={{ textAlign: 'center' }}>No encontramos esa categoría</h1>
        <p style={{ color: '#666', textAlign: 'center' }}>
          Puede que el link esté mal o que la categoría ya no exista.
        </p>
      </main>
    );
  }

  const productosMostrados = subActiva
    ? productos.filter((p) => p.subcategoria_id === subActiva)
    : productos;

  return (
    <main style={{ padding: '2rem', maxWidth: '900px', width: '100%', margin: '0 auto' }}>

      <VolverAtras href="/" texto="Inicio" />

      <h1 style={{ margin: 0 }}>{categoria.nombre}</h1>
      <p style={{ color: '#666', margin: '0.25rem 0 1.25rem', fontSize: '0.95rem' }}>
        {productosMostrados.length} {productosMostrados.length === 1 ? 'producto' : 'productos'}
      </p>

      {subcategorias.length > 0 && (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem', marginBottom: '1.5rem' }}>
          <button
            type="button"
            onClick={() => setSubActiva(null)}
            style={chipEstilo(subActiva === null)}
          >
            Todos
          </button>
          {subcategorias.map((sub) => (
            <button
              key={sub.id}
              type="button"
              onClick={() => setSubActiva(sub.id)}
              style={chipEstilo(subActiva === sub.id)}
            >
              {sub.nombre}
            </button>
          ))}
        </div>
      )}

      {productosMostrados.length === 0 ? (
        <div style={{ marginTop: '1rem', padding: '3rem 2rem', textAlign: 'center', border: '1px dashed #ccc', borderRadius: '12px', color: '#666' }}>
          {productos.length === 0 ? (
            <p style={{ margin: 0 }}>Todavía no hay productos en este rubro. ¡Pronto va a haber!</p>
          ) : (
            <>
              <p style={{ margin: 0 }}>No hay productos en esta subcategoría por ahora.</p>
              <button
                type="button"
                onClick={() => setSubActiva(null)}
                style={{ marginTop: '0.75rem', padding: '0.4rem 1rem', border: '1px solid #ccc', borderRadius: '8px', background: 'white', cursor: 'pointer' }}
              >
                Ver todos
              </button>
            </>
          )}
        </div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(170px, 1fr))', gap: '1rem' }}>
          {productosMostrados.map((p) => {
            const enOferta = p.precio_anterior && Number(p.precio_anterior) > Number(p.precio);
            return (
              <div key={p.id} style={{ position: 'relative', border: '1px solid #ddd', borderRadius: '12px', overflow: 'hidden', background: 'white' }}>
                <a
                  href={`/producto/${p.id}`}
                  style={{ display: 'block', textDecoration: 'none', color: 'inherit' }}
                >
                  <div style={{ height: '160px', background: '#f5f5f5', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#bbb' }}>
                    {p.fotoPrincipal ? (
                      <img src={p.fotoPrincipal} alt={p.nombre} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                    ) : (
                      <span style={{ fontSize: '0.75rem' }}>Sin foto</span>
                    )}
                  </div>
                  <div style={{ padding: '0.6rem 0.75rem 0.8rem' }}>
                    <p style={{ margin: 0, fontSize: '0.9rem', lineHeight: 1.3, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {p.nombre}
                    </p>
                    <p style={{ margin: '0.15rem 0 0.4rem', fontSize: '0.78rem', color: '#999' }}>
                      {p.vendedores?.nombre_negocio || ''}
                    </p>
                    {enOferta ? (
                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                        <span style={{ fontSize: '0.78rem', color: '#999', textDecoration: 'line-through' }}>
                          ${formatearPrecio(p.precio_anterior)}
                        </span>
                        <span style={{ fontSize: '0.95rem', fontWeight: 600, color: '#c1121f' }}>
                          ${formatearPrecio(p.precio)}
                        </span>
                      </div>
                    ) : (
                      <p style={{ margin: 0, fontSize: '0.95rem', fontWeight: 600 }}>${formatearPrecio(p.precio)}</p>
                    )}
                  </div>
                </a>
                <div style={{ position: 'absolute', top: '8px', right: '8px' }}>
                  <BotonFavorito
                    productoId={p.id}
                    className="w-8 h-8 rounded-full bg-white/80 backdrop-blur-sm flex items-center justify-center text-gray-500"
                  />
                </div>
              </div>
            );
          })}
        </div>
      )}
    </main>
  );
}

function chipEstilo(activo) {
  return {
    fontSize: '0.85rem',
    padding: '0.4rem 0.9rem',
    borderRadius: '999px',
    cursor: 'pointer',
    border: activo ? '1px solid #222' : '1px solid #ddd',
    background: activo ? '#222' : 'white',
    color: activo ? 'white' : '#555',
  };
}
