'use client';

import { useState, useEffect } from 'react';
import { createClient } from '@/lib/supabase/client';
import Link from 'next/link';
import Navbar from '@/components/Navbar';
import VolverAtras from '@/components/VolverAtras';

function infoEstado(estado) {
  if (estado === 'en_revision') return { texto: 'En revisión', fondo: 'bg-amber-100', color: 'text-amber-700', punto: 'bg-amber-500' };
  if (estado === 'activo')     return { texto: 'Publicado',   fondo: 'bg-emerald-100', color: 'text-emerald-700', punto: 'bg-emerald-500' };
  if (estado === 'pausado')    return { texto: 'Pausado',     fondo: 'bg-gray-100', color: 'text-gray-500', punto: 'bg-gray-400' };
  if (estado === 'agotado')    return { texto: 'Agotado',     fondo: 'bg-red-100', color: 'text-red-700', punto: 'bg-red-400' };
  if (estado === 'rechazado')  return { texto: 'Rechazado',   fondo: 'bg-gray-100', color: 'text-gray-400', punto: 'bg-gray-300' };
  return { texto: estado, fondo: 'bg-gray-100', color: 'text-gray-500', punto: 'bg-gray-400' };
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

  async function eliminarProducto(producto) {
    const confirmar = window.confirm(
      `¿Seguro que querés eliminar "${producto.nombre}"? Esta acción no se puede deshacer.`
    );
    if (!confirmar) return;

    setEliminando(producto.id);

    try {
      const { data: medias } = await supabase
        .from('producto_media')
        .select('url')
        .eq('producto_id', producto.id);

      if (medias && medias.length > 0) {
        const rutas = medias.map(m => extraerRutaStorage(m.url, 'productos')).filter(Boolean);
        if (rutas.length > 0) {
          await supabase.storage.from('productos').remove(rutas);
        }
      }

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

  function puedeToggle(estado) {
    return estado === 'activo' || estado === 'pausado' || estado === 'agotado';
  }

  function textoToggle(estado) {
    return estado === 'activo' ? 'Pausar' : 'Reactivar';
  }

  return (
    <>
      <Navbar variant="solid" />

      <main className="pt-28 pb-12 px-6 max-w-[800px] w-full mx-auto">
        <VolverAtras href="/perfil" texto="Volver a Mi perfil" />

        <div className="flex justify-between items-center mb-6">
          <h1 className="text-2xl font-semibold text-[#0a0a0a] m-0">Mis productos</h1>
          {productos.length > 0 && (
            <Link
              href="/vendedor/productos/nuevo"
              className="bg-[#0a0a0a] text-white rounded-lg px-5 py-2.5 text-[0.95rem] no-underline hover:bg-[#1a1a1a] transition-colors"
            >
              + Cargar producto
            </Link>
          )}
        </div>

        {cargando && <p className="text-gray-400">Cargando tus productos...</p>}
        {!cargando && error && <p className="text-red-700">{error}</p>}

        {/* Lista de productos */}
        {!cargando && !error && productos.map((p) => {
          const estado = infoEstado(p.estado);
          const estaEliminando = eliminando === p.id;
          return (
            <div
              key={p.id}
              className={`flex gap-4 items-center bg-white border border-gray-200 rounded-xl p-4 mb-3 transition-opacity ${
                estaEliminando ? 'opacity-50' : ''
              }`}
            >
              {/* Foto */}
              <div className="w-[84px] h-[84px] rounded-lg shrink-0 bg-[#F5F2EC] overflow-hidden">
                {p.foto && <img src={p.foto} alt={p.nombre} className="w-full h-full object-cover" />}
              </div>

              {/* Info */}
              <div className="flex-1 min-w-0">
                <p className="font-semibold text-[1.05rem] text-[#0a0a0a] m-0 mb-0.5 truncate">{p.nombre}</p>
                <p className="text-xs text-gray-400 m-0 mb-2">
                  {[nombreCategoria, p.subcategoria].filter(Boolean).join(' · ')}
                </p>
                <p className="text-base font-semibold text-[#0a0a0a] m-0">
                  {p.precio_anterior && (
                    <span className="text-gray-400 font-normal line-through text-sm mr-1.5">
                      ${formatearPrecio(p.precio_anterior)}
                    </span>
                  )}
                  ${formatearPrecio(p.precio)}
                </p>
                <span className={`inline-flex items-center gap-1.5 text-xs font-semibold px-2.5 py-1 rounded-full mt-2 ${estado.fondo} ${estado.color}`}>
                  <span className={`w-[7px] h-[7px] rounded-full ${estado.punto}`} />
                  {estado.texto}
                </span>
              </div>

              {/* Acciones */}
              <div className="flex flex-col gap-1.5 shrink-0">
                <Link
                  href={`/vendedor/productos/${p.id}/editar`}
                  className="bg-white border border-[#0a0a0a] rounded-lg px-4 py-1.5 text-sm text-[#0a0a0a] no-underline whitespace-nowrap text-center hover:bg-[#0a0a0a] hover:text-white transition-colors"
                >
                  Editar
                </Link>

                {puedeToggle(p.estado) && (
                  <button
                    onClick={() => toggleEstado(p)}
                    className={`bg-white rounded-lg px-4 py-1.5 text-sm cursor-pointer whitespace-nowrap transition-colors ${
                      p.estado === 'activo'
                        ? 'border border-amber-500 text-amber-700 hover:bg-amber-50'
                        : 'border border-emerald-500 text-emerald-700 hover:bg-emerald-50'
                    }`}
                  >
                    {textoToggle(p.estado)}
                  </button>
                )}

                <Link
                  href={`/producto/${p.id}`}
                  className="bg-white border border-gray-300 rounded-lg px-4 py-1.5 text-sm text-[#0a0a0a] no-underline whitespace-nowrap text-center hover:bg-gray-50 transition-colors"
                >
                  Ver
                </Link>

                <button
                  onClick={() => eliminarProducto(p)}
                  disabled={estaEliminando}
                  className={`bg-white border border-red-200 rounded-lg px-4 py-1.5 text-sm text-red-500 whitespace-nowrap transition-colors ${
                    estaEliminando ? 'cursor-not-allowed opacity-50' : 'cursor-pointer hover:bg-red-50'
                  }`}
                >
                  {estaEliminando ? '...' : 'Eliminar'}
                </button>
              </div>
            </div>
          );
        })}

        {/* Estado vacío */}
        {!cargando && !error && productos.length === 0 && (
          <div className="bg-white border border-dashed border-gray-300 rounded-xl px-8 py-12 text-center">
            <div className="text-4xl mb-2">📦</div>
            <h2 className="text-xl font-semibold text-[#0a0a0a] m-0 mb-1.5">Todavía no cargaste productos</h2>
            <p className="text-gray-500 m-0 mb-6">Cargá tu primer producto y va a aparecer acá.</p>
            <Link
              href="/vendedor/productos/nuevo"
              className="bg-[#0a0a0a] text-white rounded-lg px-5 py-2.5 text-[0.95rem] no-underline hover:bg-[#1a1a1a] transition-colors"
            >
              + Cargar mi primer producto
            </Link>
          </div>
        )}
      </main>
    </>
  );
}
