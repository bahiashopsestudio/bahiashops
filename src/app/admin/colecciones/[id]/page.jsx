'use client';

import { useState, useEffect, useRef } from 'react';
import { useRouter, useParams } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import Navbar from '@/components/Navbar';
import VolverAtras from '@/components/VolverAtras';

const TIPOS = [
  { valor: 'curada', label: 'Curada' },
  { valor: 'temporada', label: 'Temporada' },
  { valor: 'tematica', label: 'Temática' },
];

const inputClasses =
  'w-full px-3 py-2 border border-gray-300 rounded-lg outline-none focus:border-[#0a0a0a] focus:ring-1 focus:ring-[#0a0a0a]/20 transition-colors';
const selectClasses = `${inputClasses} bg-white`;

function generarSlug(texto) {
  return texto.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9\s-]/g, '').trim().replace(/\s+/g, '-');
}

function formatearPrecio(valor) {
  if (!valor) return '';
  return Number(valor).toLocaleString('es-AR');
}

export default function EditarColeccionPage() {
  const supabase = createClient();
  const router = useRouter();
  const { id } = useParams();
  const esNueva = id === 'nueva';

  const [esAdmin, setEsAdmin] = useState(null);
  const [cargandoPagina, setCargandoPagina] = useState(true);
  const [guardando, setGuardando] = useState(false);
  const [subiendoImagen, setSubiendoImagen] = useState(false);

  const [datos, setDatos] = useState({
    nombre: '', slug: '', descripcion: '', tipo: 'curada',
    fecha_inicio: '', fecha_fin: '', imagen_url: '', activa: false, orden: 0,
  });
  const slugTocadoManualmente = useRef(false);

  const [productos, setProductos] = useState([]);
  const [busqueda, setBusqueda] = useState('');
  const [resultados, setResultados] = useState([]);
  const [buscando, setBuscando] = useState(false);
  const [procesandoProducto, setProcesandoProducto] = useState(null);

  useEffect(() => {
    async function iniciar() {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) { setEsAdmin(false); setCargandoPagina(false); return; }

      const { data: perfil } = await supabase
        .from('usuarios')
        .select('es_admin')
        .eq('id', user.id)
        .single();

      if (!perfil?.es_admin) { setEsAdmin(false); setCargandoPagina(false); return; }
      setEsAdmin(true);

      if (!esNueva) {
        const res = await fetch(`/api/admin/colecciones/${id}`);
        const data = await res.json();
        if (res.ok) {
          slugTocadoManualmente.current = true;
          setDatos({
            nombre: data.coleccion.nombre || '',
            slug: data.coleccion.slug || '',
            descripcion: data.coleccion.descripcion || '',
            tipo: data.coleccion.tipo || 'curada',
            fecha_inicio: data.coleccion.fecha_inicio || '',
            fecha_fin: data.coleccion.fecha_fin || '',
            imagen_url: data.coleccion.imagen_url || '',
            activa: !!data.coleccion.activa,
            orden: data.coleccion.orden ?? 0,
          });
          setProductos(data.productos || []);
        }
      }
      setCargandoPagina(false);
    }
    iniciar();
  }, [id]);

  // ── Buscador de productos (debounced) ──
  useEffect(() => {
    if (!busqueda.trim()) { setResultados([]); return; }
    setBuscando(true);
    const timer = setTimeout(async () => {
      const { data } = await supabase
        .from('productos')
        .select(`
          id, nombre, precio,
          vendedor:vendedores ( nombre_negocio ),
          media:producto_media ( url, es_principal, orden )
        `)
        .eq('estado', 'activo')
        .ilike('nombre', `%${busqueda.trim()}%`)
        .limit(10);

      const idsYaAgregados = new Set(productos.map((p) => p.id));
      const limpios = (data || [])
        .filter((p) => !idsYaAgregados.has(p.id))
        .map((p) => {
          const media = p.media || [];
          const principal = media.find((m) => m.es_principal) || [...media].sort((a, b) => a.orden - b.orden)[0];
          return {
            id: p.id, nombre: p.nombre, precio: p.precio,
            vendedor_nombre: p.vendedor?.nombre_negocio || '',
            foto: principal?.url || null,
          };
        });
      setResultados(limpios);
      setBuscando(false);
    }, 350);
    return () => clearTimeout(timer);
  }, [busqueda, productos]);

  function actualizarCampo(campo, valor) {
    setDatos((prev) => ({ ...prev, [campo]: valor }));
  }

  function onChangeNombre(valor) {
    setDatos((prev) => ({
      ...prev,
      nombre: valor,
      slug: slugTocadoManualmente.current ? prev.slug : generarSlug(valor),
    }));
  }

  function onChangeSlug(valor) {
    slugTocadoManualmente.current = true;
    actualizarCampo('slug', generarSlug(valor));
  }

  async function subirImagen(e) {
    const file = e.target.files?.[0];
    if (!file) return;
    setSubiendoImagen(true);
    try {
      const formData = new FormData();
      formData.append('file', file);
      const res = await fetch('/api/admin/colecciones/imagen', { method: 'POST', body: formData });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Error al subir la imagen.');
      actualizarCampo('imagen_url', data.url);
    } catch (err) {
      alert(err.message);
    } finally {
      setSubiendoImagen(false);
      e.target.value = '';
    }
  }

  async function guardar() {
    if (!datos.nombre.trim()) { alert('Poné un nombre para la colección.'); return; }
    if (!datos.slug.trim()) { alert('El slug no puede estar vacío.'); return; }

    setGuardando(true);
    try {
      if (esNueva) {
        const res = await fetch('/api/admin/colecciones', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(datos),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || 'No se pudo crear la colección.');
        router.push(`/admin/colecciones/${data.coleccion.id}`);
        return;
      }

      const res = await fetch(`/api/admin/colecciones/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(datos),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'No se pudo guardar.');
      alert('¡Colección guardada!');
    } catch (err) {
      alert(err.message);
    } finally {
      setGuardando(false);
    }
  }

  async function eliminar() {
    if (!confirm(`¿Eliminar la colección "${datos.nombre}"? Esta acción no se puede deshacer.`)) return;
    setGuardando(true);
    const res = await fetch(`/api/admin/colecciones/${id}`, { method: 'DELETE' });
    if (res.ok) {
      router.push('/admin/colecciones');
    } else {
      const data = await res.json();
      alert(data.error || 'No se pudo eliminar.');
      setGuardando(false);
    }
  }

  async function agregarProducto(producto) {
    setProcesandoProducto(producto.id);
    const res = await fetch(`/api/admin/colecciones/${id}/productos`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ producto_id: producto.id }),
    });
    if (res.ok) {
      setProductos((prev) => [...prev, { ...producto, orden: prev.length }]);
      setBusqueda('');
      setResultados([]);
    } else {
      const data = await res.json();
      alert(data.error || 'No se pudo agregar el producto.');
    }
    setProcesandoProducto(null);
  }

  async function quitarProducto(productoId) {
    setProcesandoProducto(productoId);
    const res = await fetch(`/api/admin/colecciones/${id}/productos`, {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ producto_id: productoId }),
    });
    if (res.ok) {
      setProductos((prev) => prev.filter((p) => p.id !== productoId));
    } else {
      const data = await res.json();
      alert(data.error || 'No se pudo quitar el producto.');
    }
    setProcesandoProducto(null);
  }

  async function moverProducto(index, direccion) {
    const destino = index + direccion;
    if (destino < 0 || destino >= productos.length) return;

    const actual = productos[index];
    const otro = productos[destino];
    setProcesandoProducto(actual.id);

    const [resA, resB] = await Promise.all([
      fetch(`/api/admin/colecciones/${id}/productos`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ producto_id: actual.id, orden: otro.orden }),
      }),
      fetch(`/api/admin/colecciones/${id}/productos`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ producto_id: otro.id, orden: actual.orden }),
      }),
    ]);

    if (resA.ok && resB.ok) {
      const nuevos = [...productos];
      nuevos[index] = { ...otro, orden: actual.orden };
      nuevos[destino] = { ...actual, orden: otro.orden };
      setProductos(nuevos);
    } else {
      alert('No se pudo reordenar.');
    }
    setProcesandoProducto(null);
  }

  if (cargandoPagina) {
    return (
      <>
        <Navbar variant="solid" />
        <main className="pt-28 px-6 text-center text-[#0a0a0a]/30 text-sm font-light">Cargando...</main>
      </>
    );
  }

  if (!esAdmin) {
    return (
      <>
        <Navbar variant="solid" />
        <main className="pt-28 px-6 text-center">
          <h1 className="text-2xl font-semibold text-[#0a0a0a]">Acceso restringido</h1>
          <p className="text-[#0a0a0a]/40 font-light">Esta página es solo para administradores.</p>
        </main>
      </>
    );
  }

  return (
    <>
      <Navbar variant="solid" />

      <div className="pt-20 pb-24 px-4 md:px-8" style={{ fontFamily: "'Inter', sans-serif" }}>
        <div className="max-w-xl mx-auto">
          <VolverAtras href="/admin/colecciones" texto="Volver a Colecciones" />
          <h1 className="text-2xl md:text-3xl font-black text-[#0a0a0a] tracking-tight mb-1">
            {esNueva ? 'Nueva colección' : 'Editar colección'}
          </h1>
          <p className="text-sm text-[#0a0a0a]/30 font-light mb-6">
            Cápsulas y agrupaciones curadas de productos
          </p>

          <section className="rounded-2xl border border-[#0a0a0a]/5 p-5">
            <h2 className="text-lg font-black text-[#0a0a0a] tracking-tight mb-4">Datos de la colección</h2>

            <div className="mb-4">
              <label htmlFor="nombre" className="block text-sm text-[#0a0a0a]/60 font-light mb-1">Nombre *</label>
              <input id="nombre" type="text" value={datos.nombre}
                onChange={(e) => onChangeNombre(e.target.value)}
                placeholder="Ej: Regalos para mamá" className={inputClasses} />
            </div>

            <div className="mb-4">
              <label htmlFor="slug" className="block text-sm text-[#0a0a0a]/60 font-light mb-1">Slug</label>
              <input id="slug" type="text" value={datos.slug}
                onChange={(e) => onChangeSlug(e.target.value)}
                placeholder="regalos-para-mama" className={inputClasses} />
              <span className="block text-[11px] text-[#0a0a0a]/25 font-light mt-1">
                Se autogenera del nombre. /coleccion/{datos.slug || '...'}
              </span>
            </div>

            <div className="mb-4">
              <label htmlFor="descripcion" className="block text-sm text-[#0a0a0a]/60 font-light mb-1">
                Descripción <span className="text-[#0a0a0a]/25">(opcional)</span>
              </label>
              <textarea id="descripcion" value={datos.descripcion}
                onChange={(e) => actualizarCampo('descripcion', e.target.value)}
                rows={3} className={`${inputClasses} font-[inherit]`} />
            </div>

            <div className="mb-4">
              <label htmlFor="tipo" className="block text-sm text-[#0a0a0a]/60 font-light mb-1">Tipo</label>
              <select id="tipo" value={datos.tipo}
                onChange={(e) => actualizarCampo('tipo', e.target.value)} className={selectClasses}>
                {TIPOS.map((t) => <option key={t.valor} value={t.valor}>{t.label}</option>)}
              </select>
            </div>

            {datos.tipo === 'temporada' && (
              <div className="mb-4 flex gap-3">
                <div className="flex-1">
                  <label htmlFor="fecha_inicio" className="block text-sm text-[#0a0a0a]/60 font-light mb-1">Fecha inicio</label>
                  <input id="fecha_inicio" type="date" value={datos.fecha_inicio || ''}
                    onChange={(e) => actualizarCampo('fecha_inicio', e.target.value)} className={inputClasses} />
                </div>
                <div className="flex-1">
                  <label htmlFor="fecha_fin" className="block text-sm text-[#0a0a0a]/60 font-light mb-1">Fecha fin</label>
                  <input id="fecha_fin" type="date" value={datos.fecha_fin || ''}
                    onChange={(e) => actualizarCampo('fecha_fin', e.target.value)} className={inputClasses} />
                </div>
              </div>
            )}

            <div className="mb-4">
              <label className="block text-sm text-[#0a0a0a]/60 font-light mb-1">Imagen de portada</label>
              {datos.imagen_url && (
                <div className="w-full h-32 rounded-lg overflow-hidden bg-[#F5F2EC] mb-2">
                  <img src={datos.imagen_url} alt="Portada" className="w-full h-full object-cover" />
                </div>
              )}
              <input type="file" accept="image/jpeg,image/png,image/webp"
                onChange={subirImagen} disabled={subiendoImagen} />
              {subiendoImagen && <p className="text-[11px] text-[#0a0a0a]/25 font-light mt-1">Subiendo imagen...</p>}
            </div>

            <div className="mb-4 flex items-center justify-between">
              <div>
                <label htmlFor="activa" className="block text-sm text-[#0a0a0a]/60 font-light">Activa</label>
                <span className="block text-[11px] text-[#0a0a0a]/25 font-light">
                  Si está apagada, no aparece en el sitio aunque tenga productos.
                </span>
              </div>
              <button
                id="activa" type="button"
                onClick={() => actualizarCampo('activa', !datos.activa)}
                className={`relative w-11 h-6 rounded-full transition-colors cursor-pointer shrink-0 ${datos.activa ? 'bg-[#0a0a0a]' : 'bg-[#0a0a0a]/15'}`}
                aria-pressed={datos.activa}
              >
                <span className={`absolute top-0.5 w-5 h-5 rounded-full bg-white transition-transform ${datos.activa ? 'translate-x-5' : 'translate-x-0.5'}`} />
              </button>
            </div>

            <div className="mb-2">
              <label htmlFor="orden" className="block text-sm text-[#0a0a0a]/60 font-light mb-1">Orden</label>
              <input id="orden" type="number" value={datos.orden}
                onChange={(e) => actualizarCampo('orden', Number(e.target.value))}
                className={`${inputClasses} w-24`} />
            </div>
          </section>

          <div className="mt-6 flex gap-3 flex-wrap">
            <button type="button" onClick={() => router.push('/admin/colecciones')} disabled={guardando}
              className="px-5 py-2.5 border border-[#0a0a0a]/10 rounded-full text-sm text-[#0a0a0a]/40 font-light cursor-pointer hover:border-[#0a0a0a]/30 transition-all">
              Cancelar
            </button>
            {!esNueva && (
              <button type="button" onClick={eliminar} disabled={guardando}
                className="px-5 py-2.5 border border-red-200 rounded-full text-sm text-red-600 font-light cursor-pointer hover:bg-red-50 transition-all">
                Eliminar colección
              </button>
            )}
            <button type="button" onClick={guardar} disabled={guardando}
              className={`px-6 py-2.5 border-none rounded-full text-sm text-white font-medium transition-colors ${
                guardando ? 'bg-[#0a0a0a]/30 cursor-not-allowed' : 'bg-[#0a0a0a] cursor-pointer hover:bg-[#1a1a1a]'
              }`}>
              {guardando ? 'Guardando...' : esNueva ? 'Crear colección' : 'Guardar cambios'}
            </button>
          </div>

          {/* ───── PRODUCTOS ───── */}
          <section className="rounded-2xl border border-[#0a0a0a]/5 p-5 mt-8">
            <h2 className="text-lg font-black text-[#0a0a0a] tracking-tight mb-1">Productos en esta colección</h2>

            {esNueva ? (
              <p className="text-sm text-[#0a0a0a]/30 font-light">
                Guardá la colección primero para poder agregarle productos.
              </p>
            ) : (
              <>
                <p className="text-sm text-[#0a0a0a]/30 font-light mb-4">
                  {productos.length} {productos.length === 1 ? 'producto' : 'productos'}
                </p>

                {productos.length > 0 && (
                  <div className="flex flex-col gap-2 mb-5">
                    {productos.map((p, index) => (
                      <div key={p.id} className="flex items-center gap-3 border border-[#0a0a0a]/5 rounded-xl p-2.5">
                        <div className="flex flex-col gap-0.5 shrink-0">
                          <button type="button" onClick={() => moverProducto(index, -1)}
                            disabled={index === 0 || procesandoProducto === p.id}
                            className="w-5 h-5 flex items-center justify-center rounded border border-[#0a0a0a]/10 text-[#0a0a0a]/40 disabled:opacity-20 disabled:cursor-not-allowed cursor-pointer">
                            <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                              <path strokeLinecap="round" strokeLinejoin="round" d="m4.5 15.75 7.5-7.5 7.5 7.5" />
                            </svg>
                          </button>
                          <button type="button" onClick={() => moverProducto(index, 1)}
                            disabled={index === productos.length - 1 || procesandoProducto === p.id}
                            className="w-5 h-5 flex items-center justify-center rounded border border-[#0a0a0a]/10 text-[#0a0a0a]/40 disabled:opacity-20 disabled:cursor-not-allowed cursor-pointer">
                            <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                              <path strokeLinecap="round" strokeLinejoin="round" d="m19.5 8.25-7.5 7.5-7.5-7.5" />
                            </svg>
                          </button>
                        </div>

                        <div className="w-12 h-12 shrink-0 rounded-lg overflow-hidden bg-[#F5F2EC]">
                          {p.foto ? (
                            <img src={p.foto} alt={p.nombre} className="w-full h-full object-cover" />
                          ) : (
                            <div className="w-full h-full flex items-center justify-center text-[9px] text-[#0a0a0a]/20">foto</div>
                          )}
                        </div>

                        <div className="flex-1 min-w-0">
                          <p className="m-0 text-sm font-medium text-[#0a0a0a] truncate">{p.nombre}</p>
                          <p className="m-0 text-[11px] text-[#0a0a0a]/30 font-light">
                            {p.vendedor_nombre}{p.vendedor_nombre ? ' · ' : ''}${formatearPrecio(p.precio)}
                          </p>
                        </div>

                        <button type="button" onClick={() => quitarProducto(p.id)}
                          disabled={procesandoProducto === p.id}
                          className="shrink-0 px-3 py-1.5 rounded-full text-[11px] text-red-600 border border-red-200 hover:bg-red-50 transition-colors cursor-pointer disabled:opacity-50">
                          Quitar
                        </button>
                      </div>
                    ))}
                  </div>
                )}

                <div className="pt-4 border-t border-[#0a0a0a]/5">
                  <label htmlFor="buscarProducto" className="block text-sm text-[#0a0a0a]/60 font-light mb-1">
                    Agregar producto
                  </label>
                  <input id="buscarProducto" type="text" value={busqueda}
                    onChange={(e) => setBusqueda(e.target.value)}
                    placeholder="Buscá por nombre..." className={inputClasses} />

                  {buscando && <p className="text-[11px] text-[#0a0a0a]/25 font-light mt-2">Buscando...</p>}

                  {resultados.length > 0 && (
                    <div className="flex flex-col gap-2 mt-3">
                      {resultados.map((p) => (
                        <button
                          key={p.id} type="button" onClick={() => agregarProducto(p)}
                          disabled={procesandoProducto === p.id}
                          className="flex items-center gap-3 border border-[#0a0a0a]/10 rounded-xl p-2.5 text-left hover:border-[#0a0a0a]/30 transition-colors cursor-pointer disabled:opacity-50"
                        >
                          <div className="w-12 h-12 shrink-0 rounded-lg overflow-hidden bg-[#F5F2EC]">
                            {p.foto ? (
                              <img src={p.foto} alt={p.nombre} className="w-full h-full object-cover" />
                            ) : (
                              <div className="w-full h-full flex items-center justify-center text-[9px] text-[#0a0a0a]/20">foto</div>
                            )}
                          </div>
                          <div className="flex-1 min-w-0">
                            <p className="m-0 text-sm font-medium text-[#0a0a0a] truncate">{p.nombre}</p>
                            <p className="m-0 text-[11px] text-[#0a0a0a]/30 font-light">
                              {p.vendedor_nombre}{p.vendedor_nombre ? ' · ' : ''}${formatearPrecio(p.precio)}
                            </p>
                          </div>
                          <span className="shrink-0 text-[11px] text-[#0a0a0a]/40 font-light">+ agregar</span>
                        </button>
                      ))}
                    </div>
                  )}

                  {!buscando && busqueda.trim() && resultados.length === 0 && (
                    <p className="text-[11px] text-[#0a0a0a]/25 font-light mt-2">Sin resultados.</p>
                  )}
                </div>
              </>
            )}
          </section>
        </div>
      </div>
    </>
  );
}
