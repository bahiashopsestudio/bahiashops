'use client';

import { useState, useEffect, useRef } from 'react';
import { createClient } from '@/lib/supabase/client';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import Navbar from '@/components/Navbar';
import MenuTakeover from '@/components/MenuTakeover';
import VolverAtras from '@/components/VolverAtras';
import CopiarLink from '@/components/CopiarLink';
import { textoMotivoRechazo } from '@/lib/productos';
import { linkPropio } from '@/lib/marcaLink';

const MENU_CATEGORIAS = ['moda','belleza-y-bienestar','joyeria-y-accesorios','hogar-y-deco','artes-y-oficios','bebes-y-maternidad','juegos-y-juguetes','mascotas','libros','deporte','vintage'];

function infoEstado(estado) {
  if (estado === 'en_revision') return { texto: 'En revisión', fondo: 'bg-amber-100', color: 'text-amber-700', punto: 'bg-amber-500' };
  if (estado === 'activo')     return { texto: 'Publicado',   fondo: 'bg-emerald-100', color: 'text-emerald-700', punto: 'bg-emerald-500' };
  if (estado === 'pausado')    return { texto: 'Pausado',     fondo: 'bg-gray-100', color: 'text-gray-500', punto: 'bg-gray-400' };
  if (estado === 'agotado')    return { texto: 'Agotado',     fondo: 'bg-red-100', color: 'text-red-700', punto: 'bg-red-400' };
  if (estado === 'rechazado')  return { texto: 'No publicado', fondo: 'bg-[#fbe8da]', color: 'text-[#8a3410]', punto: 'bg-[#8a3410]' };
  return { texto: estado, fondo: 'bg-gray-100', color: 'text-gray-500', punto: 'bg-gray-400' };
}

function formatearPrecio(valor) {
  if (valor === null || valor === undefined) return '';
  return Number(valor).toLocaleString('es-AR');
}

// El link propio del producto, al pie de la tarjeta. Si el portapapeles falla,
// aparece el link ya seleccionado para copiarlo a mano.
function FranjaCompartir({ productoId }) {
  const link = linkPropio({ productoId });
  const [mostrarLink, setMostrarLink] = useState(false);
  const campo = useRef(null);

  useEffect(() => {
    if (mostrarLink) campo.current?.select();
  }, [mostrarLink]);

  function alFallar() {
    setMostrarLink(true);
    campo.current?.select();
  }

  return (
    <div className="mt-3.5 pt-3" style={{ borderTop: '1px solid rgba(10,10,10,0.05)' }}>
      <div className="flex items-center flex-wrap gap-2">
        <span className="mr-1" style={{ fontSize: '11px', color: 'rgba(10,10,10,0.35)' }}>Compartir</span>
        <CopiarLink link={link} variante="claro" onFallo={alFallar} onCopiado={() => setMostrarLink(false)} />
        <span className="w-full md:w-auto md:ml-auto" style={{ fontSize: '11px', fontWeight: 300, color: 'rgba(10,10,10,0.3)' }}>
          Si compran por acá, pagás 2,5%
        </span>
      </div>
      {mostrarLink && (
        <input
          ref={campo}
          type="text"
          readOnly
          value={link}
          aria-label="Link del producto"
          onFocus={(e) => e.target.select()}
          className="w-full mt-2 rounded-lg"
          style={{ fontSize: '12px', padding: '8px 10px', color: '#0a0a0a', border: '1px solid rgba(10,10,10,0.12)', outline: 'none' }}
        />
      )}
    </div>
  );
}

export default function MisProductosPage() {
  const supabase = createClient();
  const router = useRouter();

  const [cargando, setCargando] = useState(true);
  const [productos, setProductos] = useState([]);
  const [nombreCategoria, setNombreCategoria] = useState('');
  const [error, setError] = useState(null);
  const [eliminando, setEliminando] = useState(null);
  const [menuOpen, setMenuOpen] = useState(false);
  const [categorias, setCategorias] = useState([]);
  // El link solo sirve con la tienda publicada y sin pausa.
  const [puedeCompartir, setPuedeCompartir] = useState(false);

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
        if (!user) { router.replace('/entrar?next=%2Fvendedor%2Fproductos'); return; }

        const { data: vendedor, error: errVendedor } = await supabase
          .from('vendedores')
          .select('id, categoria_id, estado_validacion, bloqueado, pausada_en')
          .eq('usuario_id', user.id)
          .single();

        if (errVendedor || !vendedor) {
          setError('No se pudo identificar tu cuenta de vendedor.');
          setCargando(false);
          return;
        }

        setPuedeCompartir(vendedor.estado_validacion === 'aprobado' && !vendedor.bloqueado && !vendedor.pausada_en);

        const { data: categoria } = await supabase
          .from('categorias')
          .select('nombre')
          .eq('id', vendedor.categoria_id)
          .single();
        if (categoria) setNombreCategoria(categoria.nombre);

        const { data: lista, error: errProductos } = await supabase
          .from('productos')
          .select('id, nombre, precio, precio_anterior, estado, motivo_rechazo, subcategoria_id')
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

  // Pausar, reactivar y borrar van por el servidor (migración 033: el
  // navegador no puede escribir en productos). El servidor verifica el estado
  // actual y borra también las fotos de Storage.
  async function toggleEstado(producto) {
    const nuevoEstado = producto.estado === 'activo' ? 'pausado' : 'activo';
    try {
      const res = await fetch(`/api/vendedor/productos/${producto.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ estado: nuevoEstado }),
      });
      const datos = await res.json().catch(() => ({}));
      if (datos.estado) setProductos(prev => prev.map(p => p.id === producto.id ? { ...p, estado: datos.estado } : p));
      if (!res.ok) alert(datos.error || 'No se pudo cambiar el estado del producto.');
    } catch {
      alert('No se pudo cambiar el estado del producto.');
    }
  }

  async function eliminarProducto(producto) {
    const confirmar = window.confirm(`¿Seguro que querés eliminar "${producto.nombre}"? Esta acción no se puede deshacer.`);
    if (!confirmar) return;

    setEliminando(producto.id);
    try {
      const res = await fetch(`/api/vendedor/productos/${producto.id}`, { method: 'DELETE' });
      const datos = await res.json().catch(() => ({}));
      if (!res.ok) {
        alert(datos.error || 'Hubo un error al eliminar. Intentá de nuevo.');
        return;
      }
      setProductos(prev => prev.filter(p => p.id !== producto.id));
    } catch (err) {
      console.error(err);
      alert('Hubo un error al eliminar. Intentá de nuevo.');
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
        <link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Inter:wght@200;300;400;500;600;700;800;900&family=Poppins:wght@300&display=swap" />
        <div className="min-h-screen bg-white flex items-center justify-center" style={{ fontFamily: "'Inter', sans-serif" }}>
          <span className="text-[#0a0a0a]/30 text-sm font-light">Cargando tus productos...</span>
        </div>
      </>
    );
  }

  return (
    <>
      <link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Inter:wght@200;300;400;500;600;700;800;900&family=Poppins:wght@300&display=swap" />

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
              const rechazado = p.estado === 'rechazado';
              return (
                <div
                  key={p.id}
                  className={`rounded-2xl border p-4 mb-3 transition-opacity ${
                    rechazado ? 'border-[#ecd2bf]' : 'border-[#0a0a0a]/5'
                  } ${estaEliminando ? 'opacity-50' : ''}`}
                >
                <div className="flex gap-4 items-center">
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
                    {p.estado === 'en_revision' && (
                      <p className="text-xs text-[#0a0a0a]/40 m-0 mt-1" style={{ fontFamily: 'Poppins, sans-serif', fontWeight: 300 }}>
                        Lo estamos revisando.
                      </p>
                    )}
                    <span className={`inline-flex items-center gap-1.5 text-[10px] font-semibold px-2 py-0.5 rounded-full mt-1.5 ${estado.fondo} ${estado.color}`}>
                      <span className={`w-[6px] h-[6px] rounded-full ${estado.punto}`} />
                      {estado.texto}
                    </span>
                  </div>

                  {/* Acciones (un rechazado tiene las suyas en el recuadro de abajo) */}
                  {!rechazado && (
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
                  )}
                </div>

                {puedeCompartir && p.estado === 'activo' && <FranjaCompartir productoId={p.id} />}

                {/* Por qué no se publicó (solo mientras está rechazado: al
                    reenviarlo pasa a en revisión y esto deja de verse) */}
                {rechazado && (
                  <div className="mt-3 rounded-xl bg-[#fdf3ec] p-4">
                    <p className="m-0 text-[13px] font-semibold text-[#6e2a0c]">Por qué no lo publicamos</p>
                    <p className="m-0 mt-1 text-[15px] text-[#2b1a10] whitespace-pre-line" style={{ fontFamily: 'Poppins, sans-serif', fontWeight: 300 }}>
                      {textoMotivoRechazo(p.motivo_rechazo)}
                    </p>
                    <div className="flex gap-2 flex-wrap mt-3">
                      <Link
                        href={`/vendedor/productos/${p.id}/editar`}
                        className="bg-[#0a0a0a] text-white rounded-full px-5 py-2.5 text-sm font-medium no-underline hover:bg-[#1a1a1a] transition-colors"
                      >
                        Corregir y reenviar
                      </Link>
                      <button
                        onClick={() => eliminarProducto(p)}
                        disabled={estaEliminando}
                        className={`bg-white border border-[#0a0a0a]/10 rounded-full px-5 py-2.5 text-sm text-[#0a0a0a]/60 font-light transition-all ${
                          estaEliminando ? 'cursor-not-allowed opacity-50' : 'cursor-pointer hover:border-[#0a0a0a]/30 hover:text-[#0a0a0a]'
                        }`}
                      >
                        {estaEliminando ? '...' : 'Borrar'}
                      </button>
                    </div>
                  </div>
                )}
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