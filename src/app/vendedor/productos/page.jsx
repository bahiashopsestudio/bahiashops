'use client';

import { useState, useEffect } from 'react';
import { createClient } from '@/lib/supabase/client';
import Link from 'next/link';
import VolverAtras from '@/components/VolverAtras';

function infoEstado(estado) {
  if (estado === 'en_revision') return { texto: 'En revisión', fondo: '#fff3d6', color: '#8a6d00', punto: '#e0a800' };
  if (estado === 'activo') return { texto: 'Publicado', fondo: '#e2f5e6', color: '#1e6b34', punto: '#2faa55' };
  if (estado === 'pausado') return { texto: 'Pausado', fondo: '#eef0f2', color: '#555', punto: '#999' };
  if (estado === 'agotado') return { texto: 'Agotado', fondo: '#fdeaea', color: '#a33', punto: '#d35' };
  if (estado === 'rechazado') return { texto: 'Rechazado', fondo: '#f3f3f3', color: '#888', punto: '#aaa' };
  return { texto: estado, fondo: '#eee', color: '#666', punto: '#999' };
}

function formatearPrecio(valor) {
  if (valor === null || valor === undefined) return '';
  return Number(valor).toLocaleString('es-AR');
}

function extraerRutaStorage(url, bucket) {
  const marker = `/${bucket}/`;
  const idx = url.indexOf(marker);
  if (idx === -1) return null;
  return url.substring(idx + marker.length).split('?')[0];
}

export default function MisProductosPage() {
  const supabase = createClient();

  const [cargando, setCargando] = useState(true);
  const [productos, setProductos] = useState([]);
  const [nombreCategoria, setNombreCategoria] = useState('');
  const [error, setError] = useState(null);
  const [eliminando, setEliminando] = useState(null);

  useEffect(() => {
    async function cargarProductos() {
      try {
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) { setError('No hay una sesión iniciada.'); setCargando(false); return; }

        const { data: vendedor, error: errVendedor } = await supabase
          .from('vendedores')
          .select('id, categoria_id')
          .eq('usuario_id', user.id)
          .single();

        if (errVendedor || !vendedor) {
          setError('No se pudo identificar tu cuenta de vendedor.');
          setCargando(false);
          return;
        }

        const { data: categoria } = await supabase
          .from('categorias')
          .select('nombre')
          .eq('id', vendedor.categoria_id)
          .single();
        if (categoria) setNombreCategoria(categoria.nombre);

        const { data: lista, error: errProductos } = await supabase
          .from('productos')
          .select('id, nombre, precio, precio_anterior, estado, subcategoria_id')
          .eq('vendedor_id', vendedor.id)
          .order('id', { ascending: false });

        if (errProductos) { setError('No se pudieron cargar tus productos.'); setCargando(false); return; }
        if (!lista || lista.length === 0) { setProductos([]); setCargando(false); return; }

        const ids = lista.map((p) => p.id);
        const subIds = [...new Set(lista.map((p) => p.subcategoria_id).filter(Boolean))];

        const { data: medias } = await supabase
          .from('producto_media')
          .select('producto_id, url, es_principal, orden')
          .in('producto_id', ids)
          .eq('tipo', 'foto');

        const nombresSub = {};
        if (subIds.length > 0) {
          const { data: subs } = await supabase.from('subcategorias').select('id, nombre').in('id', subIds);
          if (subs) subs.forEach((s) => { nombresSub[s.id] = s.nombre; });
        }

        const completos = lista.map((p) => {
          const fotosDeEste = (medias || []).filter((m) => m.producto_id === p.id);
          const principal = fotosDeEste.find((m) => m.es_principal) || fotosDeEste.sort((a, b) => a.orden - b.orden)[0];
          return { ...p, foto: principal ? principal.url : null, subcategoria: p.subcategoria_id ? nombresSub[p.subcategoria_id] : null };
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

  // ── Pausar / Reactivar ──
  // Solo aplica a productos activos, pausados o agotados.
  // Los que están en_revision o rechazados no son visibles de todas formas.

  async function toggleEstado(producto) {
    const nuevoEstado = producto.estado === 'activo' ? 'pausado' : 'activo';

    const { error } = await supabase
      .from('productos')
      .update({ estado: nuevoEstado })
      .eq('id', producto.id);

    if (error) {
      alert('No se pudo cambiar el estado del producto.');
      return;
    }

    setProductos(prev =>
      prev.map(p => p.id === producto.id ? { ...p, estado: nuevoEstado } : p)
    );
  }

  // ── Eliminar ──

  async function eliminarProducto(producto) {
    const confirmar = window.confirm(
      `¿Seguro que querés eliminar "${producto.nombre}"? Esta acción no se puede deshacer.`
    );
    if (!confirmar) return;

    setEliminando(producto.id);

    try {
      // 1. Traer las fotos para limpiar el storage
      const { data: medias } = await supabase
        .from('producto_media')
        .select('url')
        .eq('producto_id', producto.id);

      // 2. Eliminar archivos del storage
      if (medias && medias.length > 0) {
        const rutas = medias.map(m => extraerRutaStorage(m.url, 'productos')).filter(Boolean);
        if (rutas.length > 0) {
          await supabase.storage.from('productos').remove(rutas);
        }
      }

      // 3. Eliminar variantes, media, producto
      await supabase.from('producto_variantes').delete().eq('producto_id', producto.id);
      await supabase.from('producto_media').delete().eq('producto_id', producto.id);

      const { error: errDelete } = await supabase
        .from('productos')
        .delete()
        .eq('id', producto.id);

      if (errDelete) throw errDelete;

      setProductos(prev => prev.filter(p => p.id !== producto.id));

    } catch (err) {
      console.error(err);

      // Detectar error de foreign key (tiene pedidos asociados)
      const esForeignKey =
        err?.message?.includes('foreign key') ||
        err?.message?.includes('violates') ||
        err?.code === '23503';

      if (esForeignKey) {
        alert(
          'Este producto tiene pedidos asociados y no se puede eliminar.\n\n' +
          'Si no querés que los compradores lo vean, podés pausarlo con el botón "Pausar" en la lista de productos.'
        );
      } else {
        alert('Hubo un error al eliminar. Intentá de nuevo.');
      }
    } finally {
      setEliminando(null);
    }
  }

  // ── Helpers de UI ──

  // Muestra el botón Pausar/Reactivar solo para estados donde tiene sentido
  function puedeToggle(estado) {
    return estado === 'activo' || estado === 'pausado' || estado === 'agotado';
  }

  function textoToggle(estado) {
    return estado === 'activo' ? 'Pausar' : 'Reactivar';
  }

  return (
    <main style={{ padding: '2rem', maxWidth: '800px', width: '100%', margin: '0 auto' }}>
      <VolverAtras href="/perfil" texto="Volver a Mi perfil" />

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

      {cargando && <p style={{ color: '#888' }}>Cargando tus productos...</p>}
      {!cargando && error && <p style={{ color: '#c00' }}>{error}</p>}

      {!cargando && !error && productos.map((p) => {
        const estado = infoEstado(p.estado);
        const estaEliminando = eliminando === p.id;
        return (
          <div
            key={p.id}
            style={{
              display: 'flex', gap: '1rem', alignItems: 'center', background: '#fff',
              border: '1px solid #e3e3e3', borderRadius: '10px', padding: '0.9rem', marginBottom: '0.9rem',
              opacity: estaEliminando ? 0.5 : 1, transition: 'opacity 0.2s',
            }}
          >
            {/* Foto */}
            <div style={{ width: '84px', height: '84px', borderRadius: '8px', flexShrink: 0, background: '#f0f0f0', overflow: 'hidden' }}>
              {p.foto && <img src={p.foto} alt={p.nombre} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />}
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

            {/* Acciones */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem', flexShrink: 0 }}>
              <Link
                href={`/vendedor/productos/${p.id}/editar`}
                style={{ background: '#fff', border: '1px solid #222', borderRadius: '7px', padding: '0.4rem 0.9rem', fontSize: '0.85rem', color: '#222', textDecoration: 'none', whiteSpace: 'nowrap', textAlign: 'center' }}
              >
                Editar
              </Link>

              {puedeToggle(p.estado) && (
                <button
                  onClick={() => toggleEstado(p)}
                  style={{
                    background: '#fff',
                    border: `1px solid ${p.estado === 'activo' ? '#e0a800' : '#2faa55'}`,
                    borderRadius: '7px', padding: '0.4rem 0.9rem', fontSize: '0.85rem',
                    color: p.estado === 'activo' ? '#8a6d00' : '#1e6b34',
                    cursor: 'pointer', whiteSpace: 'nowrap',
                  }}
                >
                  {textoToggle(p.estado)}
                </button>
              )}

              <Link
                href={`/producto/${p.id}`}
                style={{ background: '#fff', border: '1px solid #ccc', borderRadius: '7px', padding: '0.4rem 0.9rem', fontSize: '0.85rem', color: '#222', textDecoration: 'none', whiteSpace: 'nowrap', textAlign: 'center' }}
              >
                Ver
              </Link>

              <button
                onClick={() => eliminarProducto(p)}
                disabled={estaEliminando}
                style={{
                  background: '#fff', border: '1px solid #e0c0c0', borderRadius: '7px',
                  padding: '0.4rem 0.9rem', fontSize: '0.85rem', color: '#c44',
                  cursor: estaEliminando ? 'not-allowed' : 'pointer', whiteSpace: 'nowrap',
                }}
              >
                {estaEliminando ? '...' : 'Eliminar'}
              </button>
            </div>
          </div>
        );
      })}

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
