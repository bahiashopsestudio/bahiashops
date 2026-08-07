'use client';

import { useState, useEffect, useCallback } from 'react';
import { createClient } from '@/lib/supabase/client';
import imageCompression from 'browser-image-compression';
import {
  DndContext, closestCenter, PointerSensor, KeyboardSensor, useSensor, useSensors,
} from '@dnd-kit/core';
import {
  SortableContext, arrayMove, horizontalListSortingStrategy, useSortable, sortableKeyboardCoordinates,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { useRouter, useParams } from 'next/navigation';
import VistaProducto from '@/components/VistaProducto';
import { revisarPublicacion, ETIQUETAS_MODERACION } from '@/lib/moderacion';
import Navbar from '@/components/Navbar';
import MenuTakeover from '@/components/MenuTakeover';
import VolverAtras from '@/components/VolverAtras';

const MENU_CATEGORIAS = ['moda','belleza-y-cuidado-personal','gastronomia','hogar-deco-y-jardin','diseno-y-artesanias','tecnologia','salud-y-bienestar','arte-e-ilustracion'];

const inputClasses =
  'w-full px-3 py-2 border border-gray-300 rounded-lg outline-none focus:border-[#0a0a0a] focus:ring-1 focus:ring-[#0a0a0a]/20 transition-colors';
const selectClasses = `${inputClasses} bg-white`;

function SortableFoto({ foto, index, onQuitar }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } =
    useSortable({ id: foto.preview });

  return (
    <div
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition }}
      className={`w-[90px] h-[90px] relative cursor-grab touch-none ${isDragging ? 'opacity-50' : ''}`}
      {...attributes} {...listeners}
    >
      <img src={foto.preview} alt={`Foto ${index + 1}`} draggable={false}
        className="w-full h-full object-cover rounded-md border border-gray-200" />
      {index === 0 && (
        <span className="absolute bottom-0.5 left-0.5 bg-black/70 text-white text-[0.65rem] px-1.5 py-px rounded">
          Principal
        </span>
      )}
      <button type="button" onPointerDown={(e) => e.stopPropagation()} onClick={() => onQuitar(index)}
        className="absolute -top-2 -right-2 w-[22px] h-[22px] rounded-full border-none bg-[#dc2626] text-white cursor-pointer leading-none text-sm">
        ×
      </button>
    </div>
  );
}

function extraerRutaStorage(url, bucket) {
  const marker = `/${bucket}/`;
  const idx = url.indexOf(marker);
  if (idx === -1) return null;
  return url.substring(idx + marker.length).split('?')[0];
}

export default function EditarProductoPage() {
  const supabase = createClient();
  const router = useRouter();
  const { id } = useParams();

  const [cargandoPagina, setCargandoPagina] = useState(true);
  const [errorPagina, setErrorPagina] = useState(null);

  const [datos, setDatos] = useState({
    nombre: '', descripcion: '', subcategoria_id: '', marca: '',
    precio: '', precio_anterior: '', tiempo_preparacion: '',
  });

  const [subcategorias, setSubcategorias] = useState([]);
  const [categoriaVendedor, setCategoriaVendedor] = useState(null);
  const [categoria, setCategoria] = useState(null);
  const [nombreNegocio, setNombreNegocio] = useState('');
  const [vendedorId, setVendedorId] = useState(null);

  const [fotos, setFotos] = useState([]);
  const [fotosAEliminar, setFotosAEliminar] = useState([]);
  const [comprimiendo, setComprimiendo] = useState(false);

  const [nombrePropiedad, setNombrePropiedad] = useState('');
  const [valores, setValores] = useState([]);
  const [valorNuevo, setValorNuevo] = useState('');

  const [guardando, setGuardando] = useState(false);
  const [mostrarPrevia, setMostrarPrevia] = useState(false);
  const [bloqueoModeracion, setBloqueoModeracion] = useState(null);

  const [menuOpen, setMenuOpen] = useState(false);
  const [categorias, setCategorias] = useState([]);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  );

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
    async function cargar() {
      try {
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) { setErrorPagina('No hay sesión iniciada.'); setCargandoPagina(false); return; }

        const { data: vendedor } = await supabase
          .from('vendedores')
          .select('id, categoria_id, nombre_negocio')
          .eq('usuario_id', user.id)
          .single();

        if (!vendedor) { setErrorPagina('No se encontró tu cuenta de vendedor.'); setCargandoPagina(false); return; }

        setVendedorId(vendedor.id);
        setCategoriaVendedor(vendedor.categoria_id);
        setNombreNegocio(vendedor.nombre_negocio || '');

        const { data: prod, error: errProd } = await supabase
          .from('productos')
          .select('*')
          .eq('id', id)
          .single();

        if (errProd || !prod) { setErrorPagina('No se encontró el producto.'); setCargandoPagina(false); return; }

        if (prod.vendedor_id !== vendedor.id) {
          setErrorPagina('No tenés permiso para editar este producto.');
          setCargandoPagina(false);
          return;
        }

        setDatos({
          nombre: prod.nombre || '',
          descripcion: prod.descripcion || '',
          subcategoria_id: prod.subcategoria_id ? String(prod.subcategoria_id) : '',
          marca: prod.marca || '',
          precio: prod.precio ? String(prod.precio) : '',
          precio_anterior: prod.precio_anterior ? String(prod.precio_anterior) : '',
          tiempo_preparacion: prod.tiempo_preparacion || '',
        });

        const { data: medias } = await supabase
          .from('producto_media')
          .select('id, url, es_principal, orden')
          .eq('producto_id', prod.id)
          .eq('tipo', 'foto')
          .order('orden');

        if (medias && medias.length > 0) {
          setFotos(medias.map(m => ({
            id: m.id, url: m.url, preview: m.url, existente: true,
          })));
        }

        if (prod.tiene_variantes && prod.propiedad_1_nombre) {
          setNombrePropiedad(prod.propiedad_1_nombre);
          const { data: vars } = await supabase
            .from('producto_variantes')
            .select('propiedad_1_valor')
            .eq('producto_id', prod.id);
          if (vars) setValores(vars.map(v => v.propiedad_1_valor));
        }

        if (vendedor.categoria_id) {
          const { data: subs } = await supabase
            .from('subcategorias')
            .select('id, nombre')
            .eq('categoria_id', vendedor.categoria_id)
            .eq('activa', true)
            .order('orden');
          if (subs) setSubcategorias(subs);

          const { data: cat } = await supabase
            .from('categorias')
            .select('nombre, slug')
            .eq('id', vendedor.categoria_id)
            .single();
          if (cat) setCategoria(cat);
        }

        setCargandoPagina(false);
      } catch (err) {
        console.error(err);
        setErrorPagina('Hubo un error al cargar el producto.');
        setCargandoPagina(false);
      }
    }
    cargar();
  }, [id]);

  useEffect(() => {
    const timer = setTimeout(() => {
      const texto = `${datos.nombre} ${datos.descripcion} ${datos.marca}`;
      const resultado = revisarPublicacion(texto);
      setBloqueoModeracion(resultado.nivel === 'bloqueo' ? resultado : null);
    }, 1000);
    return () => clearTimeout(timer);
  }, [datos.nombre, datos.descripcion, datos.marca]);

  useEffect(() => {
    if (!mostrarPrevia) return;
    function onKey(e) { if (e.key === 'Escape') setMostrarPrevia(false); }
    document.addEventListener('keydown', onKey);
    document.body.style.overflow = 'hidden';
    return () => { document.removeEventListener('keydown', onKey); document.body.style.overflow = ''; };
  }, [mostrarPrevia]);

  function actualizarCampo(campo, valor) {
    setDatos(prev => ({ ...prev, [campo]: valor }));
  }

  function formatearPrecio(valor) {
    if (!valor) return '';
    return Number(valor).toLocaleString('es-AR');
  }

  async function agregarFotos(e) {
    const archivos = Array.from(e.target.files);
    if (archivos.length === 0) return;
    const espacioDisponible = 5 - fotos.length;
    if (espacioDisponible <= 0) return;
    const aProcesar = archivos.slice(0, espacioDisponible);
    setComprimiendo(true);
    const opciones = { maxSizeMB: 0.2, maxWidthOrHeight: 1200, useWebWorker: true };
    const nuevas = [];
    for (const archivo of aProcesar) {
      try {
        const comprimida = await imageCompression(archivo, opciones);
        nuevas.push({ file: comprimida, preview: URL.createObjectURL(comprimida), existente: false });
      } catch (err) {
        console.error('Error comprimiendo imagen:', err);
      }
    }
    setFotos(prev => [...prev, ...nuevas]);
    setComprimiendo(false);
    e.target.value = '';
  }

  function quitarFoto(index) {
    setFotos(prev => {
      const foto = prev[index];
      if (foto.existente) {
        setFotosAEliminar(old => [...old, foto.url]);
      } else {
        URL.revokeObjectURL(foto.preview);
      }
      return prev.filter((_, i) => i !== index);
    });
  }

  function alSoltarFoto(event) {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    setFotos(prev => {
      const desde = prev.findIndex(f => f.preview === active.id);
      const hasta = prev.findIndex(f => f.preview === over.id);
      return arrayMove(prev, desde, hasta);
    });
  }

  function agregarValor() {
    const limpio = valorNuevo.trim();
    if (!limpio || valores.some(v => v.toLowerCase() === limpio.toLowerCase())) {
      setValorNuevo('');
      return;
    }
    setValores(prev => [...prev, limpio]);
    setValorNuevo('');
  }

  function quitarValor(index) {
    setValores(prev => prev.filter((_, i) => i !== index));
  }

  function abrirPrevia() {
    if (!datos.nombre.trim()) { alert('Cargá al menos el nombre del producto para previsualizar.'); return; }
    if (fotos.length === 0) { alert('Subí al menos una foto para previsualizar.'); return; }
    setMostrarPrevia(true);
  }

  async function guardarCambios() {
    if (!datos.nombre.trim()) { alert('Poné un nombre al producto.'); return; }
    if (!datos.descripcion.trim()) { alert('Escribí una descripción.'); return; }
    if (!datos.precio) { alert('El precio es obligatorio.'); return; }
    if (fotos.length === 0) { alert('Subí al menos una foto.'); return; }
    if (!vendedorId) { alert('No se pudo identificar tu cuenta de vendedor.'); return; }

    const tieneNombre = nombrePropiedad.trim() !== '';
    const tieneValores = valores.length > 0;
    if (tieneNombre !== tieneValores) {
      alert('Si cargás variantes, completá el nombre y al menos una opción.');
      return;
    }
    if (datos.precio_anterior && Number(datos.precio_anterior) <= Number(datos.precio)) {
      alert('El precio anterior tiene que ser mayor al precio actual.');
      return;
    }

    const textoARevisar = `${datos.nombre} ${datos.descripcion} ${datos.marca}`;
    const moderacion = revisarPublicacion(textoARevisar);
    if (moderacion.nivel === 'bloqueo') { setBloqueoModeracion(moderacion); return; }

    setGuardando(true);

    try {
      if (fotosAEliminar.length > 0) {
        const rutas = fotosAEliminar.map(url => extraerRutaStorage(url, 'productos')).filter(Boolean);
        if (rutas.length > 0) {
          await supabase.storage.from('productos').remove(rutas);
        }
      }

      const urlsFinales = [];

      for (const foto of fotos) {
        if (foto.existente) {
          urlsFinales.push(foto.url);
        } else {
          const nombreArchivo = `${vendedorId}/${Date.now()}-${urlsFinales.length}.webp`;
          const { error: errUpload } = await supabase.storage
            .from('productos')
            .upload(nombreArchivo, foto.file);
          if (errUpload) throw new Error('Error al subir una foto: ' + errUpload.message);
          const { data: dataUrl } = supabase.storage.from('productos').getPublicUrl(nombreArchivo);
          urlsFinales.push(dataUrl.publicUrl);
        }
      }

      const { error: errUpdate } = await supabase
        .from('productos')
        .update({
          nombre: datos.nombre.trim(),
          descripcion: datos.descripcion.trim(),
          marca: datos.marca.trim() || null,
          subcategoria_id: datos.subcategoria_id ? Number(datos.subcategoria_id) : null,
          precio: Number(datos.precio),
          precio_anterior: datos.precio_anterior ? Number(datos.precio_anterior) : null,
          tiempo_preparacion: datos.tiempo_preparacion || null,
          tiene_variantes: tieneNombre && tieneValores,
          propiedad_1_nombre: tieneNombre ? nombrePropiedad.trim() : null,
          estado: 'en_revision',
          moderacion_avisos: moderacion.avisos,
        })
        .eq('id', id);

      if (errUpdate) throw new Error('Error al actualizar: ' + errUpdate.message);

      await supabase.from('producto_media').delete().eq('producto_id', id);

      const mediaItems = urlsFinales.map((url, index) => ({
        producto_id: Number(id), url, tipo: 'foto', orden: index, es_principal: index === 0,
      }));

      const { error: errMedia } = await supabase.from('producto_media').insert(mediaItems);
      if (errMedia) throw new Error('Producto actualizado pero hubo un error con las fotos: ' + errMedia.message);

      await supabase.from('producto_variantes').delete().eq('producto_id', id);

      if (tieneNombre && tieneValores) {
        const variantesItems = valores.map(valor => ({
          producto_id: Number(id), propiedad_1_valor: valor,
        }));
        const { error: errVar } = await supabase.from('producto_variantes').insert(variantesItems);
        if (errVar) throw new Error('Producto actualizado pero hubo un error con las variantes: ' + errVar.message);
      }

      alert('¡Producto actualizado! Queda en revisión hasta que lo apruebes.');
      router.push('/vendedor/productos');

    } catch (err) {
      console.error(err);
      alert(err.message || 'Hubo un error al guardar. Probá de nuevo.');
    } finally {
      setGuardando(false);
    }
  }

  const menuCats = MENU_CATEGORIAS.map(s => categorias.find(c => c.slug === s)).filter(Boolean);

  if (cargandoPagina) {
    return (
      <>
        <link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Inter:wght@200;300;400;500;600;700;800;900&display=swap" />
        <div className="min-h-screen bg-white flex items-center justify-center" style={{ fontFamily: "'Inter', sans-serif" }}>
          <span className="text-[#0a0a0a]/30 text-sm font-light">Cargando producto...</span>
        </div>
      </>
    );
  }

  if (errorPagina) {
    return (
      <>
        <link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Inter:wght@200;300;400;500;600;700;800;900&display=swap" />
        <div className="min-h-screen bg-white flex flex-col items-center justify-center gap-4" style={{ fontFamily: "'Inter', sans-serif" }}>
          <span className="text-red-700 text-sm">{errorPagina}</span>
          <button onClick={() => router.push('/vendedor/productos')}
            className="px-5 py-2.5 border border-[#0a0a0a]/10 rounded-full text-sm text-[#0a0a0a]/60 font-light cursor-pointer hover:border-[#0a0a0a]/30 transition-all">
            Volver a mis productos
          </button>
        </div>
      </>
    );
  }

  const guardarDeshabilitado = guardando || bloqueoModeracion !== null;

  const productoParaPrevia = {
    nombre: datos.nombre, descripcion: datos.descripcion, precio: datos.precio,
    precio_anterior: datos.precio_anterior, marca: datos.marca,
    propiedad_1_nombre: nombrePropiedad.trim() || null,
    tiempo_preparacion: datos.tiempo_preparacion || null,
  };
  const fotosParaPrevia = fotos.map(f => ({ url: f.preview }));
  const variantesParaPrevia = valores.map(v => ({ propiedad_1_valor: v }));
  const vendedorParaPrevia = nombreNegocio ? { nombre_negocio: nombreNegocio } : null;

  return (
    <>
      <link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Inter:wght@200;300;400;500;600;700;800;900&display=swap" />

      <div className="min-h-screen bg-white" style={{ fontFamily: "'Inter', sans-serif" }}>
        {menuOpen && <MenuTakeover categorias={menuCats} onClose={() => setMenuOpen(false)} />}
        <Navbar onToggleMenu={() => setMenuOpen(!menuOpen)} variant="solid" />

        <div className="pt-20 pb-24 px-4 md:px-8">
          <div className="max-w-xl mx-auto">
            <VolverAtras href="/vendedor/productos" texto="Volver a Mis productos" />
            <h1 className="text-2xl md:text-3xl font-black text-[#0a0a0a] tracking-tight mb-1">Editar producto</h1>
            <p className="text-sm text-[#0a0a0a]/30 font-light mb-6">{nombreNegocio}</p>

            <section className="rounded-2xl border border-[#0a0a0a]/5 p-5">
              <h2 className="text-lg font-black text-[#0a0a0a] tracking-tight mb-4">Datos básicos</h2>

              <div className="mb-4">
                <label htmlFor="nombre" className="block text-sm text-[#0a0a0a]/60 font-light mb-1">Nombre del producto *</label>
                <input id="nombre" type="text" value={datos.nombre}
                  onChange={(e) => actualizarCampo('nombre', e.target.value)}
                  placeholder="Ej: Remera básica de algodón" className={inputClasses} />
              </div>

              <div className="mb-4">
                <label htmlFor="descripcion" className="block text-sm text-[#0a0a0a]/60 font-light mb-1">Descripción *</label>
                <textarea id="descripcion" value={datos.descripcion}
                  onChange={(e) => actualizarCampo('descripcion', e.target.value)}
                  placeholder="Describí el producto: materiales, características, cuidados..."
                  rows={4} className={`${inputClasses} font-[inherit]`} />

                {bloqueoModeracion && (
                  <div role="alert" className="mt-3 p-3.5 bg-red-50 border border-red-200 rounded-lg text-red-800">
                    <p className="m-0 font-semibold text-[0.92rem]">No vas a poder publicar con esto</p>
                    <p className="mt-1 mb-2.5 text-sm">
                      En Bahía Shops el contacto con el comprador se desbloquea recién después de la compra. Sacá esto de tu publicación:
                    </p>
                    <ul className="m-0 pl-5 text-sm">
                      {bloqueoModeracion.bloqueos.map((b, i) => (
                        <li key={i} className="mb-0.5">
                          {ETIQUETAS_MODERACION[b.tipo] || b.tipo}
                          {b.tipo !== 'lenguaje_ofensivo' && <span className="text-red-700"> — &quot;{b.texto}&quot;</span>}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>

              {subcategorias.length > 0 && (
                <div className="mb-4">
                  <label htmlFor="subcategoria" className="block text-sm text-[#0a0a0a]/60 font-light mb-1">Subcategoría</label>
                  <select id="subcategoria" value={datos.subcategoria_id}
                    onChange={(e) => actualizarCampo('subcategoria_id', e.target.value)} className={selectClasses}>
                    <option value="">Elegí una subcategoría (opcional)</option>
                    {subcategorias.map(sub => <option key={sub.id} value={sub.id}>{sub.nombre}</option>)}
                  </select>
                </div>
              )}

              <div className="mb-4">
                <label htmlFor="marca" className="block text-sm text-[#0a0a0a]/60 font-light mb-1">Marca (opcional)</label>
                <input id="marca" type="text" value={datos.marca}
                  onChange={(e) => actualizarCampo('marca', e.target.value)}
                  placeholder="Si aplica" className={inputClasses} />
              </div>

              <div className="mb-4">
                <label htmlFor="precio" className="block text-sm text-[#0a0a0a]/60 font-light mb-1">Precio *</label>
                <div className="relative">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-[#0a0a0a]/30">$</span>
                  <input id="precio" type="text" inputMode="numeric"
                    value={formatearPrecio(datos.precio)}
                    onChange={(e) => actualizarCampo('precio', e.target.value.replace(/\D/g, ''))}
                    placeholder="15.000" className={`${inputClasses} pl-7`} />
                </div>
              </div>

              <div className="mb-4">
                <label htmlFor="precio_anterior" className="block text-sm text-[#0a0a0a]/60 font-light mb-1">Precio anterior (opcional)</label>
                <div className="relative">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-[#0a0a0a]/30">$</span>
                  <input id="precio_anterior" type="text" inputMode="numeric"
                    value={formatearPrecio(datos.precio_anterior)}
                    onChange={(e) => actualizarCampo('precio_anterior', e.target.value.replace(/\D/g, ''))}
                    placeholder="Si lo completás, se mostrará tachado" className={`${inputClasses} pl-7`} />
                </div>
              </div>

              <div className="mb-4">
                <label htmlFor="tiempo_preparacion" className="block text-sm text-[#0a0a0a]/60 font-light mb-1">Tiempo de preparación</label>
                <select id="tiempo_preparacion" value={datos.tiempo_preparacion}
                  onChange={(e) => actualizarCampo('tiempo_preparacion', e.target.value)} className={selectClasses}>
                  <option value="">Elegí una opción</option>
                  <option value="inmediata">Entrega inmediata (lo tengo hecho, sale ya)</option>
                  <option value="durante_el_dia">Durante el día</option>
                  <option value="manana">Mañana</option>
                  <option value="2_a_4_dias">2 a 4 días</option>
                  <option value="1_a_2_semanas">1 a 2 semanas</option>
                  <option value="mas_2_semanas">Más de 2 semanas / a coordinar</option>
                </select>
              </div>

              <div className="mb-4">
                <label className="block text-sm text-[#0a0a0a]/60 font-light mb-1">
                  Fotos * (hasta 5, arrastrá para ordenar — la primera es la principal)
                </label>
                <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={alSoltarFoto}>
                  <SortableContext items={fotos.map(f => f.preview)} strategy={horizontalListSortingStrategy}>
                    <div className="flex flex-wrap gap-3 mb-3">
                      {fotos.map((foto, index) => (
                        <SortableFoto key={foto.preview} foto={foto} index={index} onQuitar={quitarFoto} />
                      ))}
                    </div>
                  </SortableContext>
                </DndContext>
                {fotos.length < 5 && (
                  <input type="file" accept="image/jpeg,image/png,image/webp" multiple
                    onChange={agregarFotos} disabled={comprimiendo} />
                )}
                <p className="text-[11px] text-[#0a0a0a]/20 font-light mt-1">
                  {comprimiendo ? 'Procesando imágenes...' : `${fotos.length} de 5 fotos`}
                </p>
              </div>

              <div className="pt-4 border-t border-[#0a0a0a]/5">
                <h3 className="m-0 text-base font-black text-[#0a0a0a] tracking-tight">Variantes (opcional)</h3>
                <p className="text-sm text-[#0a0a0a]/30 font-light mt-1 mb-3">
                  Si tu producto viene en distintas opciones (talles, sabores, tamaños), cargalas acá.
                </p>

                <label htmlFor="nombrePropiedad" className="block text-sm text-[#0a0a0a]/60 font-light mb-1">¿Qué varía?</label>
                <input id="nombrePropiedad" type="text" value={nombrePropiedad}
                  onChange={(e) => setNombrePropiedad(e.target.value)}
                  placeholder="Ej: Talle" className={inputClasses} />

                <label className="block text-sm text-[#0a0a0a]/60 font-light mt-4 mb-1">
                  Opciones {nombrePropiedad && `de ${nombrePropiedad}`}
                </label>
                <div className="flex gap-2">
                  <input type="text" value={valorNuevo}
                    onChange={(e) => setValorNuevo(e.target.value)}
                    onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); agregarValor(); } }}
                    placeholder="Ej: M (Enter para agregar)"
                    className={`${inputClasses} flex-1`} />
                  <button type="button" onClick={agregarValor}
                    className="px-4 py-2 border border-[#0a0a0a]/10 rounded-full text-sm text-[#0a0a0a]/60 font-light cursor-pointer hover:border-[#0a0a0a]/30 transition-all">
                    Agregar
                  </button>
                </div>

                <div className="flex flex-wrap gap-2 mt-3">
                  {valores.map((valor, index) => (
                    <span key={valor} className="inline-flex items-center gap-1.5 bg-[#F5F2EC] px-2.5 py-1 rounded-full text-sm">
                      {valor}
                      <button type="button" onClick={() => quitarValor(index)}
                        className="border-none bg-transparent cursor-pointer text-[#0a0a0a]/30 text-base leading-none p-0 hover:text-[#0a0a0a]">
                        ×
                      </button>
                    </span>
                  ))}
                </div>
              </div>
            </section>

            <div className="mt-6 flex gap-3 flex-wrap">
              <button type="button" onClick={() => router.push('/vendedor/productos')}
                className="px-5 py-2.5 border border-[#0a0a0a]/10 rounded-full text-sm text-[#0a0a0a]/40 font-light cursor-pointer hover:border-[#0a0a0a]/30 transition-all">
                Cancelar
              </button>
              <button type="button" onClick={abrirPrevia} disabled={guardando}
                className="px-5 py-2.5 border border-[#0a0a0a]/10 rounded-full text-sm text-[#0a0a0a]/60 font-light cursor-pointer hover:border-[#0a0a0a]/30 hover:text-[#0a0a0a] transition-all">
                Previsualizar
              </button>
              <button type="button" onClick={guardarCambios} disabled={guardarDeshabilitado}
                className={`px-6 py-2.5 border-none rounded-full text-sm text-white font-medium transition-colors ${
                  guardarDeshabilitado ? 'bg-[#0a0a0a]/30 cursor-not-allowed' : 'bg-[#0a0a0a] cursor-pointer hover:bg-[#1a1a1a]'
                }`}>
                {guardando ? 'Guardando...' : 'Guardar cambios'}
              </button>
            </div>
          </div>
        </div>
      </div>

      {mostrarPrevia && (
        <div onClick={() => setMostrarPrevia(false)}
          className="fixed inset-0 bg-black/50 flex items-start justify-center p-8 overflow-y-auto z-[1000]">
          <div onClick={(e) => e.stopPropagation()}
            className="bg-white rounded-2xl max-w-[760px] w-full my-auto overflow-hidden">
            <div className="flex items-start justify-between px-6 py-4 border-b border-[#0a0a0a]/5">
              <div>
                <p className="font-black text-[#0a0a0a] tracking-tight m-0">Previsualización</p>
                <p className="text-sm text-[#0a0a0a]/30 font-light mt-0.5 mb-0">Así lo va a ver el comprador</p>
              </div>
              <button type="button" onClick={() => setMostrarPrevia(false)} aria-label="Cerrar"
                className="w-8 h-8 border border-[#0a0a0a]/10 rounded-full bg-white cursor-pointer text-lg leading-none hover:border-[#0a0a0a]/30 transition-all">
                ×
              </button>
            </div>
            <div className="p-6">
              <VistaProducto producto={productoParaPrevia} fotos={fotosParaPrevia}
                variantes={variantesParaPrevia} vendedor={vendedorParaPrevia}
                categoria={categoria} modoPrevia />
            </div>
            <div className="flex items-center justify-between gap-4 px-6 py-4 border-t border-[#0a0a0a]/5">
              <span className="text-[11px] text-[#0a0a0a]/20 font-light">Los cambios no se guardaron todavía</span>
              <button type="button" onClick={() => setMostrarPrevia(false)}
                className="px-5 py-2.5 border border-[#0a0a0a]/10 rounded-full text-sm text-[#0a0a0a]/60 font-light bg-white cursor-pointer hover:border-[#0a0a0a]/30 transition-all">
                Cerrar y seguir editando
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}