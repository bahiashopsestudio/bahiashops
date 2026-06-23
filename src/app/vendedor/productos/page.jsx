'use client';

import { useState, useEffect } from 'react';
import { createClient } from '@/lib/supabase/client';
import Link from 'next/link';

// Traduce el estado que guardamos en la base a una etiqueta visible + colores.
function infoEstado(estado) {
  if (estado === 'en_revision') {
    return { texto: 'En revisión', fondo: '#fff3d6', color: '#8a6d00', punto: '#e0a800' };
  }
  if (estado === 'activo') {
    return { texto: 'Publicado', fondo: '#e2f5e6', color: '#1e6b34', punto: '#2faa55' };
  }
  if (estado === 'pausado') {
    return { texto: 'Pausado', fondo: '#eef0f2', color: '#555', punto: '#999' };
  }
  if (estado === 'agotado') {
    return { texto: 'Agotado', fondo: '#fdeaea', color: '#a33', punto: '#d35' };
  }
  // Por las dudas: si apareciera un estado inesperado, lo mostramos tal cual.
  return { texto: estado, fondo: '#eee', color: '#666', punto: '#999' };
}

function formatearPrecio(valor) {
  if (valor === null || valor === undefined) return '';
  return Number(valor).toLocaleString('es-AR');
}

export default function MisProductosPage() {
  const supabase = createClient();

  const [cargando, setCargando] = useState(true);
  const [productos, setProductos] = useState([]);
  const [nombreCategoria, setNombreCategoria] = useState('');
  const [error, setError] = useState(null);

  useEffect(() => {
    async function cargarProductos() {
      try {
        // 1. Quién es el vendedor logueado (mismo patrón que en el alta de producto)
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) {
          setError('No hay una sesión iniciada.');
          setCargando(false);
          return;
        }

        const { data: vendedor, error: errVendedor } = await supabase
          .from('vendedores')
          .select('id, categoria_id')
          .eq('usuario_id', user.id)
          .single();

        if (errVendedor || !vendedor) {
          console.error('Error cargando el vendedor:', errVendedor);
          setError('No se pudo identificar tu cuenta de vendedor.');
          setCargando(false);
          return;
        }

        // 2. Nombre de la categoría del vendedor (es una sola, vale para todos sus productos).
        //    Si esta consulta falla no rompe nada: simplemente no mostramos la categoría.
        const { data: categoria } = await supabase
          .from('categorias')
          .select('nombre')
          .eq('id', vendedor.categoria_id)
          .single();
        if (categoria) setNombreCategoria(categoria.nombre);

        // 3. Los productos del vendedor, del más nuevo al más viejo.
        //    Ordenamos por id descendente: el id más alto es el último que se cargó.
        const { data: lista, error: errProductos } = await supabase
          .from('productos')
          .select('id, nombre, precio, precio_anterior, estado, subcategoria_id')
          .eq('vendedor_id', vendedor.id)
          .order('id', { ascending: false });

        if (errProductos) {
          console.error('Error cargando productos:', errProductos);
          setError('No se pudieron cargar tus productos.');
          setCargando(false);
          return;
        }

        if (!lista || lista.length === 0) {
          setProductos([]);
          setCargando(false);
          return;
        }

        const ids = lista.map((p) => p.id);
        const subIds = [...new Set(lista.map((p) => p.subcategoria_id).filter(Boolean))];

        // 4. La foto principal de cada producto, en UNA sola consulta para todos.
        const { data: medias } = await supabase
          .from('producto_media')
          .select('producto_id, url, es_principal, orden')
          .in('producto_id', ids)
          .eq('tipo', 'foto');

        // 5. Los nombres de las subcategorías usadas, también en una sola consulta.
        const nombresSub = {};
        if (subIds.length > 0) {
          const { data: subs } = await supabase
            .from('subcategorias')
            .select('id, nombre')
            .in('id', subIds);
          if (subs) subs.forEach((s) => { nombresSub[s.id] = s.nombre; });
        }

        // 6. Armamos cada producto con su foto principal y su subcategoría.
        const completos = lista.map((p) => {
          const fotosDeEste = (medias || []).filter((m) => m.producto_id === p.id);
          const principal =
            fotosDeEste.find((m) => m.es_principal) ||
            fotosDeEste.sort((a, b) => a.orden - b.orden)[0];
          return {
            ...p,
            foto: principal ? principal.url : null,
            subcategoria: p.subcategoria_id ? nombresSub[p.subcategoria_id] : null,
          };
        });

        setProductos(completos);
        setCargando(false);
      } catch (err) {
        console.error(err);
        setError('Hubo un error al cargar la página.');
        setCargando(false);
      }
    }
    cargarProductos();
  }, []);

  return (
    <main style={{ padding: '2rem', maxWidth: '800px', width: '100%', margin: '0 auto' }}>

      {/* Encabezado */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem' }}>
        <h1 style={{ margin: 0 }}>Mis productos</h1>
        {productos.length > 0 && (
          <Link
            href="/vendedor/productos/nuevo"
            style={{ background: '#222', color: '#fff', borderRadius: '8px', padding: '0.6rem 1.1rem', fontSize: '0.95rem', textDecoration: 'none' }}
          >
            + Cargar producto
          </Link>
        )}
      </div>

      {/* Cargando */}
      {cargando && (
        <p style={{ color: '#888' }}>Cargando tus productos...</p>
      )}

      {/* Error */}
      {!cargando && error && (
        <p style={{ color: '#c00' }}>{error}</p>
      )}

      {/* Lista de productos */}
      {!cargando && !error && productos.map((p) => {
        const estado = infoEstado(p.estado);
        return (
          <div
            key={p.id}
            style={{ display: 'flex', gap: '1rem', alignItems: 'center', background: '#fff', border: '1px solid #e3e3e3', borderRadius: '10px', padding: '0.9rem', marginBottom: '0.9rem' }}
          >
            {/* Foto */}
            <div style={{ width: '84px', height: '84px', borderRadius: '8px', flexShrink: 0, background: '#f0f0f0', overflow: 'hidden' }}>
              {p.foto && (
                <img src={p.foto} alt={p.nombre} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
              )}
            </div>

            {/* Info */}
            <div style={{ flex: 1, minWidth: 0 }}>
              <p style={{ fontWeight: 600, fontSize: '1.05rem', margin: '0 0 0.15rem' }}>{p.nombre}</p>
              <p style={{ fontSize: '0.82rem', color: '#888', margin: '0 0 0.45rem' }}>
                {[nombreCategoria, p.subcategoria].filter(Boolean).join(' · ')}
              </p>
              <p style={{ fontSize: '1rem', fontWeight: 600, margin: 0 }}>
                {p.precio_anterior && (
                  <span style={{ color: '#aaa', fontWeight: 400, textDecoration: 'line-through', fontSize: '0.85rem', marginRight: '0.4rem' }}>
                    ${formatearPrecio(p.precio_anterior)}
                  </span>
                )}
                ${formatearPrecio(p.precio)}
              </p>
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: '0.35rem', fontSize: '0.78rem', fontWeight: 600, padding: '0.25rem 0.6rem', borderRadius: '999px', marginTop: '0.5rem', background: estado.fondo, color: estado.color }}>
                <span style={{ width: '7px', height: '7px', borderRadius: '50%', background: estado.punto }} />
                {estado.texto}
              </span>
            </div>

            {/* Acción: por ahora sólo "Ver" */}
            <div>
              <Link
                href={`/producto/${p.id}`}
                style={{ background: '#fff', border: '1px solid #ccc', borderRadius: '7px', padding: '0.4rem 0.9rem', fontSize: '0.85rem', color: '#222', textDecoration: 'none', whiteSpace: 'nowrap' }}
              >
                Ver
              </Link>
            </div>
          </div>
        );
      })}

      {/* Estado vacío */}
      {!cargando && !error && productos.length === 0 && (
        <div style={{ background: '#fff', border: '1px dashed #d0d0d0', borderRadius: '12px', padding: '3rem 2rem', textAlign: 'center' }}>
          <div style={{ fontSize: '2.5rem', marginBottom: '0.5rem' }}>📦</div>
          <h2 style={{ margin: '0 0 0.4rem', fontSize: '1.2rem' }}>Todavía no cargaste productos</h2>
          <p style={{ margin: '0 0 1.4rem', color: '#777' }}>Cargá tu primer producto y va a aparecer acá.</p>
          <Link
            href="/vendedor/productos/nuevo"
            style={{ background: '#222', color: '#fff', borderRadius: '8px', padding: '0.6rem 1.1rem', fontSize: '0.95rem', textDecoration: 'none' }}
          >
            + Cargar mi primer producto
          </Link>
        </div>
      )}

    </main>
  );
}