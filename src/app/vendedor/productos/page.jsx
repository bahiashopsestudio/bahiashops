'use client';

import { useState, useEffect } from 'react';
import { createClient } from '@/lib/supabase/client';
import Link from 'next/link';
import Navbar from '@/components/Navbar';
import MenuTakeover from '@/components/MenuTakeover';
import VolverAtras from '@/components/VolverAtras';

const MENU_CATEGORIAS = ['moda','belleza-y-bienestar','joyeria-y-accesorios','hogar-y-deco','artes-y-oficios','bebes-y-maternidad','juegos-y-juguetes','mascotas','libros','deporte','vintage'];

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
  const [menuOpen, setMenuOpen] = useState(false);
  const [categorias, setCategorias] = useState([]);

  useEffect(() => {
    if (menuOpen) { document.body.style.overflow = 'hidden' } else { document.body.style.overflow = '' }
    return () => { document.body.style.overflow = '' }
  }, [menuOpen]);

  useEffect(() => {
    async function cargarCats() {
      const { data } = await supabase.from('categorias').select('id, nombre, slug').eq('activa', true).order('orden');
      if (data) setCategorias(data);
    }
    cargarCats();
  }, []);

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
    const { error } = await supabase.from('productos').update({ estado: nuevoEstado }).eq('id', producto.id);
    if (error) { alert('No se pudo cambiar el estado del producto.'); return; }
    setProductos(prev => prev.map(p => p.id === producto.id ? { ...p, estado: nuevoEstado } : p));
  }

  async function eliminarProducto(producto) {
    const confirmar = window.confirm(`¿Seguro que querés eliminar "${producto.nombre}"? Esta acción no se puede deshacer.`);
    if (!confirmar) return;

    setEliminando(producto.id);
    try {
      const { data: medias } = await supabase.from('producto_media').select('url').eq('producto_id', producto.id);
      if (medias && medias.length > 0) {
        const rutas = medias.map(m => extraerRutaStorage(m.url, 'productos')).filter(Boolean);
        if (rutas.length > 0) await supabase.storage.from('productos').remove(rutas);
      }
      await supabase.from('producto_variantes').delete().eq('producto_id', producto.id);
      await supabase.from('producto_media').delete().eq('producto_id', producto.id);
      const { error: errDelete } = await supabase.from('productos').delete().eq('id', producto.id);
      if (errDelete) throw errDelete;
      setProductos(prev => prev.filter(p => p.id !== producto.id));
    } catch (err) {
      console.error(err);
      const esForeignKey = err?.message?.includes('foreign key') || err?.message?.includes('violates') || err?.code === '23503';
      if (esForeignKey) {
        alert('Este producto tiene pedidos asociados y no se puede eliminar.\n\nSi no querés que los compradores lo vean, podés pausarlo.');
      } else {
        alert('Hubo un error al eliminar. Intentá de nuevo.');
      }
    } finally {
      setEliminando(null);
    }
  }

  function puedeToggle(estado) { return estado === 'activo' || estado === 'pausado' || estado === 'agotado'; }
  function textoToggle(estado) { return estado === 'activo' ? 'Pausar' : 'Reactivar'; }

  const menuCats = MENU_CATEGORIAS.map(s => categorias.find(c => c.slug === s)).filter(Boolean);

  if (cargando) {
    return (
      <>
        <link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Inter:wght@200;300;400;500;600;700;800;900&display=swap" />
        <div className="min-h-screen bg-white flex items-center justify-center" style={{ fontFamily: "'Inter', sans-serif" }}>
          <span className="text-[#0a0a0a]/30 text-sm font-light">Cargando tus productos...</span>
        </div>
      </>
    );
  }

  return (
    <>
      <link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Inter:wght@200;300;400;500;600;700;800;900&display=swap" />

      <div className="min-h-screen bg-white" style={{ fontFamily: "'Inter', sans-serif" }}>
        {menuOpen && <MenuTakeover categorias={menuCats} onClose={() => setMenuOpen(false)} />}
        <Navbar onToggleMenu={() => setMenuOpen(!menuOpen)} variant="solid" />

        <div className="pt-20 pb-24 px-4 md:px-8">
          <div className="max-w-xl mx-auto">
            <VolverAtras href="/vendedor/perfil" texto="Volver a Mi negocio" />

            <div className="flex justify-between items-center mb-6">
              <div>
                <h1 className="text-2xl md:text-3xl font-black text-[#0a0a0a] tracking-tight m-0">Mis productos</h1>
                {!error && (
                  <p className="text-sm text-[#0a0a0a]/30 font-light mt-1 mb-0">
                    {productos.length} {productos.length === 1 ? 'producto' : 'productos'}
                  </p>
                )}
              </div>
              {productos.length > 0 && (
                <Link
                  href="/vendedor/productos/nuevo"
                  className="bg-[#0a0a0a] text-white rounded-full px-5 py-2.5 text-sm font-medium no-underline hover:bg-[#1a1a1a] transition-colors"
                >
                  + Cargar producto
                </Link>
              )}
            </div>

            {error && <p className="text-red-700 text-sm">{error}</p>}

            {/* Lista de productos */}
            {!error && productos.map((p) => {
              const estado = infoEstado(p.estado);
              const estaEliminando = eliminando === p.id;
              return (
                <div
                  key={p.id}
                  className={`flex gap-4 items-center rounded-2xl border border-[#0a0a0a]/5 p-4 mb-3 transition-opacity ${
                    estaEliminando ? 'opacity-50' : ''
                  }`}
                >
                  {/* Foto */}
                  <div className="w-[80px] h-[80px] rounded-xl shrink-0 bg-[#F5F2EC] overflow-hidden">
                    {p.foto && <img src={p.foto} alt={p.nombre} className="w-full h-full object-cover" />}
                  </div>

                  {/* Info */}
                  <div className="flex-1 min-w-0">
                    <p className="font-medium text-[#0a0a0a] m-0 mb-0.5 truncate">{p.nombre}</p>
                    <p className="text-[11px] text-[#0a0a0a]/25 font-light m-0 mb-1.5">
                      {[nombreCategoria, p.subcategoria].filter(Boolean).join(' · ')}
                    </p>
                    <p className="text-sm font-semibold text-[#0a0a0a] m-0">
                      {p.precio_anterior && (
                        <span className="text-[#0a0a0a]/25 font-light line-through text-xs mr-1.5">
                          ${formatearPrecio(p.precio_anterior)}
                        </span>
                      )}
                      ${formatearPrecio(p.precio)}
                    </p>
                    <span className={`inline-flex items-center gap-1.5 text-[10px] font-semibold px-2 py-0.5 rounded-full mt-1.5 ${estado.fondo} ${estado.color}`}>
                      <span className={`w-[6px] h-[6px] rounded-full ${estado.punto}`} />
                      {estado.texto}
                    </span>
                  </div>

                  {/* Acciones */}
                  <div className="flex flex-col gap-1.5 shrink-0">
                    <Link
                      href={`/vendedor/productos/${p.id}/editar`}
                      className="bg-white border border-[#0a0a0a]/10 rounded-full px-4 py-1.5 text-xs text-[#0a0a0a]/60 font-light no-underline whitespace-nowrap text-center hover:border-[#0a0a0a]/30 hover:text-[#0a0a0a] transition-all"
                    >
                      Editar
                    </Link>

                    {puedeToggle(p.estado) && (
                      <button
                        onClick={() => toggleEstado(p)}
                        className={`bg-white rounded-full px-4 py-1.5 text-xs cursor-pointer whitespace-nowrap transition-colors ${
                          p.estado === 'activo'
                            ? 'border border-amber-400 text-amber-600 hover:bg-amber-50'
                            : 'border border-emerald-400 text-emerald-600 hover:bg-emerald-50'
                        }`}
                      >
                        {textoToggle(p.estado)}
                      </button>
                    )}

                    <Link
                      href={`/producto/${p.id}`}
                      className="bg-white border border-[#0a0a0a]/10 rounded-full px-4 py-1.5 text-xs text-[#0a0a0a]/40 font-light no-underline whitespace-nowrap text-center hover:border-[#0a0a0a]/30 transition-all"
                    >
                      Ver
                    </Link>

                    <button
                      onClick={() => eliminarProducto(p)}
                      disabled={estaEliminando}
                      className={`bg-white border border-red-200 rounded-full px-4 py-1.5 text-xs text-red-400 whitespace-nowrap transition-colors ${
                        estaEliminando ? 'cursor-not-allowed opacity-50' : 'cursor-pointer hover:bg-red-50 hover:text-red-600'
                      }`}
                    >
                      {estaEliminando ? '...' : 'Eliminar'}
                    </button>
                  </div>
                </div>
              );
            })}

            {/* Estado vacío */}
            {!error && productos.length === 0 && (
              <div className="border border-dashed border-[#0a0a0a]/10 rounded-2xl px-8 py-12 text-center">
                <div className="text-4xl mb-2">📦</div>
                <h2 className="text-xl font-black text-[#0a0a0a] tracking-tight m-0 mb-1.5">Todavía no cargaste productos</h2>
                <p className="text-sm text-[#0a0a0a]/30 font-light m-0 mb-6">Cargá tu primer producto y va a aparecer acá.</p>
                <Link
                  href="/vendedor/productos/nuevo"
                  className="bg-[#0a0a0a] text-white rounded-full px-6 py-2.5 text-sm font-medium no-underline hover:bg-[#1a1a1a] transition-colors"
                >
                  + Cargar mi primer producto
                </Link>
              </div>
            )}
          </div>
        </div>
      </div>
    </>
  );
}