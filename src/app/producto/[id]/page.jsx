'use client';

import { useState, useEffect } from 'react';
import { useParams } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { useCarrito } from '@/context/CarritoContext';

export default function PaginaProducto() {
  const supabase = createClient();
  const { agregar } = useCarrito();
  const params = useParams();
  const productoId = params.id;

  const [producto, setProducto] = useState(null);
  const [fotos, setFotos] = useState([]);
  const [variantes, setVariantes] = useState([]);
  const [vendedor, setVendedor] = useState(null);
  const [categoria, setCategoria] = useState(null);
  const [fotoActiva, setFotoActiva] = useState(0);
  const [varianteElegida, setVarianteElegida] = useState('');
  const [cargando, setCargando] = useState(true);
  const [noEncontrado, setNoEncontrado] = useState(false);

  useEffect(() => {
    async function cargarProducto() {
      // 1. El producto
      const { data: prod, error } = await supabase
        .from('productos')
        .select('*')
        .eq('id', productoId)
        .single();

      if (error || !prod) {
        setNoEncontrado(true);
        setCargando(false);
        return;
      }
      setProducto(prod);

      // 2. Las fotos (ordenadas)
      const { data: media } = await supabase
        .from('producto_media')
        .select('url, orden, es_principal')
        .eq('producto_id', productoId)
        .order('orden');
      if (media) setFotos(media);

      // 3. Las variantes
      const { data: vars } = await supabase
        .from('producto_variantes')
        .select('propiedad_1_valor')
        .eq('producto_id', productoId);
      if (vars) setVariantes(vars);

      // 4. El vendedor
      const { data: vend } = await supabase
        .from('vendedores')
        .select('nombre_negocio, slug')
        .eq('id', prod.vendedor_id)
        .single();
      if (vend) setVendedor(vend);

      // 5. La categoría (para las migas)
      const { data: cat } = await supabase
        .from('categorias')
        .select('nombre, slug')
        .eq('id', prod.categoria_id)
        .single();
      if (cat) setCategoria(cat);

      setCargando(false);
    }
    cargarProducto();
  }, [productoId]);

  function formatearPrecio(valor) {
    if (!valor) return '';
    return Number(valor).toLocaleString('es-AR');
  }

  if (cargando) {
    return <main style={{ padding: '2rem', textAlign: 'center' }}>Cargando producto...</main>;
  }

  if (noEncontrado) {
    return <main style={{ padding: '2rem', textAlign: 'center' }}>No encontramos este producto.</main>;
  }

  const hayOferta = producto.precio_anterior && Number(producto.precio_anterior) > Number(producto.precio);

  return (
    <main style={{ padding: '2rem', maxWidth: '1000px', width: '100%', margin: '0 auto' }}>

      {/* Dos columnas: fotos | info */}
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '2rem' }}>

        {/* COLUMNA IZQUIERDA: galería */}
        <div style={{ flex: '1 1 360px', minWidth: '300px' }}>
          {fotos.length > 0 ? (
            <>
              <img
                src={fotos[fotoActiva].url}
                alt={producto.nombre}
                style={{ width: '100%', borderRadius: '8px', border: '1px solid #eee', aspectRatio: '1 / 1', objectFit: 'cover' }}
              />
              {fotos.length > 1 && (
                <div style={{ display: 'flex', gap: '0.5rem', marginTop: '0.75rem', flexWrap: 'wrap' }}>
                  {fotos.map((foto, index) => (
                    <img
                      key={foto.url}
                      src={foto.url}
                      alt={`Vista ${index + 1}`}
                      onClick={() => setFotoActiva(index)}
                      style={{
                        width: '70px', height: '70px', objectFit: 'cover', borderRadius: '6px', cursor: 'pointer',
                        border: index === fotoActiva ? '2px solid #222' : '1px solid #ddd',
                      }}
                    />
                  ))}
                </div>
              )}
            </>
          ) : (
            <div style={{ width: '100%', aspectRatio: '1 / 1', background: '#f5f5f5', borderRadius: '8px', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#999' }}>
              Sin foto
            </div>
          )}
        </div>

        {/* COLUMNA DERECHA: info */}
        <div style={{ flex: '1 1 320px', minWidth: '280px' }}>
          {/* Migas de pan */}
          <p style={{ fontSize: '0.85rem', color: '#666', margin: '0 0 1rem' }}>
            <a href="/" style={{ color: '#666', textDecoration: 'none' }}>Inicio</a>
            {categoria && (
              <>
                {' · '}
                <a href={`/categoria/${categoria.slug}`} style={{ color: '#666', textDecoration: 'underline' }}>
                  {categoria.nombre}
                </a>
              </>
            )}
            {' · '}{producto.nombre}
          </p>

          {vendedor && (
            <p style={{ fontSize: '0.9rem', color: '#666', margin: '0 0 0.5rem' }}>
              {vendedor.nombre_negocio}
            </p>
          )}

          <h1 style={{ margin: '0 0 1rem', fontSize: '1.8rem' }}>{producto.nombre}</h1>

          {/* Precio */}
          <div style={{ marginBottom: '1.5rem' }}>
            {hayOferta && (
              <span style={{ textDecoration: 'line-through', color: '#999', marginRight: '0.5rem' }}>
                ${formatearPrecio(producto.precio_anterior)}
              </span>
            )}
            <span style={{ fontSize: '1.6rem', fontWeight: 'bold' }}>
              ${formatearPrecio(producto.precio)}
            </span>
            {hayOferta && (
              <span style={{ marginLeft: '0.5rem', background: '#e63946', color: 'white', fontSize: '0.8rem', padding: '2px 8px', borderRadius: '4px' }}>
                Oferta
              </span>
            )}
          </div>

          {/* Marca */}
          {producto.marca && (
            <p style={{ margin: '0 0 1rem', color: '#444' }}>
              <strong>Marca:</strong> {producto.marca}
            </p>
          )}

          {/* Variantes */}
          {variantes.length > 0 && producto.propiedad_1_nombre && (
            <div style={{ marginBottom: '1.5rem' }}>
              <label style={{ display: 'block', marginBottom: '0.4rem', fontWeight: 600 }}>
                {producto.propiedad_1_nombre}
              </label>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem' }}>
                {variantes.map((v) => (
                  <button
                    key={v.propiedad_1_valor}
                    type="button"
                    onClick={() => setVarianteElegida(v.propiedad_1_valor)}
                    style={{
                      padding: '0.4rem 0.9rem', borderRadius: '6px', cursor: 'pointer',
                      border: varianteElegida === v.propiedad_1_valor ? '2px solid #222' : '1px solid #ccc',
                      background: varianteElegida === v.propiedad_1_valor ? '#222' : 'white',
                      color: varianteElegida === v.propiedad_1_valor ? 'white' : '#222',
                    }}
                  >
                    {v.propiedad_1_valor}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Botón de agregar al carrito */}
          <button
            type="button"
            onClick={() => {
              // Si hay variantes y no eligió ninguna, se lo pedimos.
              if (variantes.length > 0 && producto.propiedad_1_nombre && !varianteElegida) {
                alert(`Elegí ${producto.propiedad_1_nombre.toLowerCase()} antes de agregar.`);
                return;
              }

              // Armamos el producto para la canasta.
              const itemParaCarrito = {
                productoId: producto.id,
                nombre: producto.nombre,
                precio: Number(producto.precio),
                foto: fotos.length > 0 ? fotos[0].url : null,
                variante: varianteElegida || null,
                cantidad: 1,
              };

              const vendedorParaCarrito = {
                id: producto.vendedor_id,
                nombre: vendedor ? vendedor.nombre_negocio : 'Local',
              };

              agregar(itemParaCarrito, vendedorParaCarrito);
              alert('¡Agregado al carrito!');
            }}
            style={{ width: '100%', padding: '0.9rem', fontSize: '1.05rem', background: '#222', color: 'white', border: 'none', borderRadius: '8px', cursor: 'pointer' }}
          >
            Agregar al carrito
          </button>
          
          {/* Tiempo de preparación */}
          {producto.tiempo_preparacion && (
            <p style={{ marginTop: '1rem', fontSize: '0.9rem', color: '#555' }}>
              ⏱ Tiempo de preparación: {producto.tiempo_preparacion.replaceAll('_', ' ')}
            </p>
          )}
        </div>
      </div>

      {/* Descripción (abajo, ancho completo) */}
      <div style={{ marginTop: '2.5rem', paddingTop: '1.5rem', borderTop: '1px solid #eee' }}>
        <h2 style={{ fontSize: '1.2rem' }}>Descripción</h2>
        <p style={{ whiteSpace: 'pre-line', lineHeight: 1.6, color: '#333' }}>
          {producto.descripcion}
        </p>
      </div>
    </main>
  );
}