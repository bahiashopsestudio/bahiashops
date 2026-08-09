'use client';
import { useState, useEffect } from 'react';
import { createClient } from '@/lib/supabase/client';
import imageCompression from 'browser-image-compression';
import {
  DndContext, closestCenter, PointerSensor, KeyboardSensor, useSensor, useSensors,
} from '@dnd-kit/core';
import {
  SortableContext, arrayMove, horizontalListSortingStrategy, useSortable, sortableKeyboardCoordinates,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { useRouter } from 'next/navigation';
import VistaProducto from '@/components/VistaProducto';
import { revisarPublicacion, ETIQUETAS_MODERACION } from '@/lib/moderacion';
import Navbar from '@/components/Navbar';
import MenuTakeover from '@/components/MenuTakeover';
import VolverAtras from '@/components/VolverAtras';

const MENU_CATEGORIAS = ['moda','belleza-y-bienestar','hogar-y-deco','artes-y-oficios','joyeria-y-accesorios','deporte','libros','vintage'];

const OPCIONES_GENERO = [
  { valor: 'mujer', label: 'Mujer' },
  { valor: 'hombre', label: 'Hombre' },
  { valor: 'ninos', label: 'Niños' },
  { valor: 'sin_genero', label: 'Sin género' },
];

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

export default function NuevoProductoPage() {
  const supabase = createClient();
  const router = useRouter();

  const [datos, setDatos] = useState({
    nombre: '', descripcion: '', marca: '',
    precio: '', precio_anterior: '', tiempo_preparacion: '',
  });

  // ── Categorías y subcategorías ──
  const [todasCategorias, setTodasCategorias] = useState([]);
  const [categoriaPrincipalId, setCategoriaPrincipalId] = useState('');
  const [subcategoriasPrincipal, setSubcategoriasPrincipal] = useState([]);
  const [subcategoriaPrincipalId, setSubcategoriaPrincipalId] = useState('');
  const [subcategoriaPersonalizada, setSubcategoriaPersonalizada] = useState('');

  const [categoriaSecundariaId, setCategoriaSecundariaId] = useState('');
  const [subcategoriasSecundaria, setSubcategoriasSecundaria] = useState([]);
  const [subcategoriaSecundariaId, setSubcategoriaSecundariaId] = useState('');
  const [subcategoriaSecundariaPersonalizada, setSubcategoriaSecundariaPersonalizada] = useState('');

  // ── Género ──
  const [genero, setGenero] = useState([]);

  // ── Sellos ──
  const [todosSellos, setTodosSellos] = useState([]);
  const [sellosSeleccionados, setSellosSeleccionados] = useState([]);

  // ── Vendedor ──
  const [vendedorId, setVendedorId] = useState(null);
  const [nombreNegocio, setNombreNegocio] = useState('');
  const [categoria, setCategoria] = useState(null);

  // ── Fotos ──
  const [fotos, setFotos] = useState([]);
  const [comprimiendo, setComprimiendo] = useState(false);

  // ── Variantes ──
  const [nombrePropiedad, setNombrePropiedad] = useState('');
  const [valores, setValores] = useState([]);
  const [valorNuevo, setValorNuevo] = useState('');

  // ── UI ──
  const [guardandoProducto, setGuardandoProducto] = useState(false);
  const [mostrarPrevia, setMostrarPrevia] = useState(false);
  const [bloqueoModeracion, setBloqueoModeracion] = useState(null);
  const [menuOpen, setMenuOpen] = useState(false);
  const [categorias, setCategorias] = useState([]);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  );

  // ── Cargar datos iniciales ──
  useEffect(() => {
    async function cargarDatosIniciales() {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      // Vendedor
      const { data: vendedor, error } = await supabase
        .from('vendedores')
        .select('id, categoria_id, nombre_negocio')
        .eq('usuario_id', user.id)
        .single();
      if (error) { console.error('Error cargando el vendedor:', error); return; }

      setVendedorId(vendedor.id);
      setNombreNegocio(vendedor.nombre_negocio || '');
      if (vendedor.categoria_id) setCategoriaPrincipalId(String(vendedor.categoria_id));

      // Categorías activas (para navegación)
      const { data: cats } = await supabase
        .from('categorias')
        .select('id, nombre, slug')
        .eq('activa', true)
        .order('orden');
      if (cats) setCategorias(cats);

      // Todas las categorías (para selectores de producto)
      const { data: todasCats } = await supabase
        .from('categorias')
        .select('id, nombre')
        .order('orden');
      if (todasCats) setTodasCategorias(todasCats);

      // Sellos disponibles
      const { data: sellos } = await supabase
        .from('sellos')
        .select('id, nombre')
        .eq('activa', true)
        .order('orden');
      if (sellos) setTodosSellos(sellos);

      // Sellos del vendedor (preseleccionados)
      const { data: sellosVendedor } = await supabase
        .from('vendedor_sellos')
        .select('sello_id')
        .eq('vendedor_id', vendedor.id);
      if (sellosVendedor) setSellosSeleccionados(sellosVendedor.map((s) => s.sello_id));
    }
    cargarDatosIniciales();
  }, []);

  // ── Cargar subcategorías cuando cambia la categoría principal ──
  useEffect(() => {
    if (!categoriaPrincipalId) { setSubcategoriasPrincipal([]); setSubcategoriaPrincipalId(''); return; }
    async function cargar() {
      const { data } = await supabase
        .from('subcategorias')
        .select('id, nombre')
        .eq('categoria_id', Number(categoriaPrincipalId))
        .eq('activa', true)
        .order('orden');
      if (data) setSubcategoriasPrincipal(data);
    }
    async function cargarCategoria() {
      const { data } = await supabase
        .from('categorias')
        .select('nombre, slug')
        .eq('id', Number(categoriaPrincipalId))
        .single();
      if (data) setCategoria(data);
    }
    cargar();
    cargarCategoria();
    setSubcategoriaPrincipalId('');
    setSubcategoriaPersonalizada('');
  }, [categoriaPrincipalId]);

  // ── Cargar subcategorías cuando cambia la categoría secundaria ──
  useEffect(() => {
    if (!categoriaSecundariaId) { setSubcategoriasSecundaria([]); setSubcategoriaSecundariaId(''); return; }
    async function cargar() {
      const { data } = await supabase
        .from('subcategorias')
        .select('id, nombre')
        .eq('categoria_id', Number(categoriaSecundariaId))
        .eq('activa', true)
        .order('orden');
      if (data) setSubcategoriasSecundaria(data);
    }
    cargar();
    setSubcategoriaSecundariaId('');
    setSubcategoriaSecundariaPersonalizada('');
  }, [categoriaSecundariaId]);

  // ── Moderación ──
  useEffect(() => {
    const timer = setTimeout(() => {
      const texto = `${datos.nombre} ${datos.descripcion} ${datos.marca}`;
      const resultado = revisarPublicacion(texto);
      setBloqueoModeracion(resultado.nivel === 'bloqueo' ? resultado : null);
    }, 1000);
    return () => clearTimeout(timer);
  }, [datos.nombre, datos.descripcion, datos.marca]);

  // ── Escape para cerrar previa ──
  useEffect(() => {
    if (!mostrarPrevia) return;
    function onKey(e) { if (e.key === 'Escape') setMostrarPrevia(false); }
    document.addEventListener('keydown', onKey);
    document.body.style.overflow = 'hidden';
    return () => { document.removeEventListener('keydown', onKey); document.body.style.overflow = ''; };
  }, [mostrarPrevia]);

  // ── Helpers ──
  const subcategoriaPrincipalEsOtra = subcategoriasPrincipal.find(
    (s) => s.id === Number(subcategoriaPrincipalId)
  )?.nombre === 'Otra';

  const subcategoriaSecundariaEsOtra = subcategoriasSecundaria.find(
    (s) => s.id === Number(subcategoriaSecundariaId)
  )?.nombre === 'Otra';

  const categoriasParaSecundaria = todasCategorias.filter(
    (c) => String(c.id) !== categoriaPrincipalId
  );

  function actualizarCampo(campo, valor) { setDatos({ ...datos, [campo]: valor }); }

  function toggleGenero(valor) {
    setGenero((prev) =>
      prev.includes(valor) ? prev.filter((g) => g !== valor) : [...prev, valor]
    );
  }

  function toggleSello(selloId) {
    setSellosSeleccionados((prev) =>
      prev.includes(selloId) ? prev.filter((id) => id !== selloId) : [...prev, selloId]
    );
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
        nuevas.push({ file: comprimida, preview: URL.createObjectURL(comprimida) });
      } catch (err) { console.error('Error comprimiendo imagen:', err); }
    }
    setFotos((prev) => [...prev, ...nuevas]);
    setComprimiendo(false);
    e.target.value = '';
  }

  function quitarFoto(index) {
    setFotos((prev) => { URL.revokeObjectURL(prev[index].preview); return prev.filter((_, i) => i !== index); });
  }

  function alSoltarFoto(event) {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    setFotos((prev) => {
      const desde = prev.findIndex((f) => f.preview === active.id);
      const hasta = prev.findIndex((f) => f.preview === over.id);
      return arrayMove(prev, desde, hasta);
    });
  }

  function agregarValor() {
    const limpio = valorNuevo.trim();
    if (!limpio || valores.some((v) => v.toLowerCase() === limpio.toLowerCase())) { setValorNuevo(''); return; }
    setValores((prev) => [...prev, limpio]);
    setValorNuevo('');
  }

  function quitarValor(index) { setValores((prev) => prev.filter((_, i) => i !== index)); }

  function abrirPrevia() {
    if (!datos.nombre.trim()) { alert('Cargá al menos el nombre del producto para previsualizar.'); return; }
    if (fotos.length === 0) { alert('Subí al menos una foto para previsualizar.'); return; }
    setMostrarPrevia(true);
  }

  // ── Guardar producto ──
  async function guardarProducto() {
    if (!datos.nombre.trim()) { alert('Poné un nombre al producto.'); return; }
    if (!datos.descripcion.trim()) { alert('Escribí una descripción.'); return; }
    if (!datos.precio) { alert('El precio es obligatorio.'); return; }
    if (fotos.length === 0) { alert('Subí al menos una foto.'); return; }
    if (!vendedorId) { alert('No se pudo identificar tu cuenta de vendedor. Recargá la página.'); return; }
    if (!categoriaPrincipalId) { alert('Elegí una categoría para el producto.'); return; }

    const tieneNombre = nombrePropiedad.trim() !== '';
    const tieneValores = valores.length > 0;
    if (tieneNombre !== tieneValores) { alert('Si cargás variantes, completá el nombre (ej: Talle) y al menos una opción.'); return; }
    if (datos.precio_anterior && Number(datos.precio_anterior) <= Number(datos.precio)) { alert('El precio anterior tiene que ser mayor al precio actual.'); return; }

    if (subcategoriaPrincipalEsOtra && !subcategoriaPersonalizada.trim()) {
      alert('Escribí qué subcategoría es (elegiste "Otra").'); return;
    }
    if (subcategoriaSecundariaEsOtra && !subcategoriaSecundariaPersonalizada.trim()) {
      alert('Escribí qué subcategoría secundaria es (elegiste "Otra").'); return;
    }

    const textoARevisar = `${datos.nombre} ${datos.descripcion} ${datos.marca}`;
    const moderacion = revisarPublicacion(textoARevisar);
    if (moderacion.nivel === 'bloqueo') { setBloqueoModeracion(moderacion); return; }

    setGuardandoProducto(true);
    try {
      // Subir fotos
      const urls = [];
      for (let i = 0; i < fotos.length; i++) {
        const foto = fotos[i];
        const nombreArchivo = `${vendedorId}/${Date.now()}-${i}.webp`;
        const { error: errorUpload } = await supabase.storage.from('productos').upload(nombreArchivo, foto.file);
        if (errorUpload) throw new Error('Error al subir una foto: ' + errorUpload.message);
        const { data: dataUrl } = supabase.storage.from('productos').getPublicUrl(nombreArchivo);
        urls.push(dataUrl.publicUrl);
      }

      // Insertar producto
      const { data: productoCreado, error: errorProducto } = await supabase
        .from('productos')
        .insert({
          vendedor_id: vendedorId,
          categoria_id: Number(categoriaPrincipalId),
          subcategoria_id: subcategoriaPrincipalId ? Number(subcategoriaPrincipalId) : null,
          subcategoria_personalizada: subcategoriaPrincipalEsOtra ? subcategoriaPersonalizada.trim() : null,
          categoria_secundaria_id: categoriaSecundariaId ? Number(categoriaSecundariaId) : null,
          subcategoria_secundaria_id: subcategoriaSecundariaId ? Number(subcategoriaSecundariaId) : null,
          subcategoria_secundaria_personalizada: subcategoriaSecundariaEsOtra ? subcategoriaSecundariaPersonalizada.trim() : null,
          genero: genero.length > 0 ? genero : null,
          nombre: datos.nombre.trim(),
          descripcion: datos.descripcion.trim(),
          marca: datos.marca.trim() || null,
          precio: Number(datos.precio),
          precio_anterior: datos.precio_anterior ? Number(datos.precio_anterior) : null,
          tiempo_preparacion: datos.tiempo_preparacion || null,
          estado: 'en_revision',
          tiene_variantes: tieneNombre && tieneValores,
          propiedad_1_nombre: tieneNombre ? nombrePropiedad.trim() : null,
          moderacion_avisos: moderacion.avisos,
        })
        .select()
        .single();
      if (errorProducto) throw new Error('Error al guardar el producto: ' + errorProducto.message);

      const productoId = productoCreado.id;

      // Guardar fotos
      const mediaItems = urls.map((url, index) => ({
        producto_id: productoId, url, tipo: 'foto', orden: index, es_principal: index === 0,
      }));
      const { error: errorMedia } = await supabase.from('producto_media').insert(mediaItems);
      if (errorMedia) throw new Error('El producto se guardó pero hubo un error con las fotos: ' + errorMedia.message);

      // Guardar variantes
      if (tieneNombre && tieneValores) {
        const variantesItems = valores.map((valor) => ({ producto_id: productoId, propiedad_1_valor: valor }));
        const { error: errorVariantes } = await supabase.from('producto_variantes').insert(variantesItems);
        if (errorVariantes) throw new Error('El producto se guardó pero hubo un error con las variantes: ' + errorVariantes.message);
      }

      // Guardar sellos del producto
      if (sellosSeleccionados.length > 0) {
        const filasSellos = sellosSeleccionados.map((selloId) => ({
          producto_id: productoId,
          sello_id: selloId,
        }));
        const { error: errorSellos } = await supabase.from('producto_sellos').insert(filasSellos);
        if (errorSellos) console.error('Error al guardar sellos del producto:', errorSellos.message);
      }

      // Activar categoría si estaba inactiva
      const catPrincipal = todasCategorias.find((c) => c.id === Number(categoriaPrincipalId));
      if (catPrincipal) {
        await supabase.from('categorias').update({ activa: true }).eq('id', catPrincipal.id);
      }
      if (categoriaSecundariaId) {
        await supabase.from('categorias').update({ activa: true }).eq('id', Number(categoriaSecundariaId));
      }

      alert('¡Producto guardado! Queda en revisión hasta que lo apruebes.');
      router.push('/vendedor/productos');
    } catch (err) {
      console.error(err);
      alert(err.message || 'Hubo un error al guardar. Probá de nuevo.');
    } finally {
      setGuardandoProducto(false);
    }
  }

  const menuCats = MENU_CATEGORIAS.map((s) => categorias.find((c) => c.slug === s)).filter(Boolean);
  const guardarDeshabilitado = guardandoProducto || bloqueoModeracion !== null;

  const productoParaPrevia = {
    nombre: datos.nombre, descripcion: datos.descripcion, precio: datos.precio,
    precio_anterior: datos.precio_anterior, marca: datos.marca,
    propiedad_1_nombre: nombrePropiedad.trim() || null,
    tiempo_preparacion: datos.tiempo_preparacion || null,
  };
  const fotosParaPrevia = fotos.map((f) => ({ url: f.preview }));
  const variantesParaPrevia = valores.map((v) => ({ propiedad_1_valor: v }));
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
            <h1 className="text-2xl md:text-3xl font-black text-[#0a0a0a] tracking-tight mb-1">Nuevo producto</h1>
            <p className="text-sm text-[#0a0a0a]/30 font-light mb-6">{nombreNegocio}</p>

            {/* ───── DATOS BÁSICOS ───── */}
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

              {/* ── Categoría principal ── */}
              <div className="mb-4">
                <label htmlFor="categoriaPrincipal" className="block text-sm text-[#0a0a0a]/60 font-light mb-1">
                  Categoría *
                </label>
                <span className="block text-[11px] text-[#0a0a0a]/25 font-light mb-1">
                  Prellenada con la de tu emprendimiento. Podés cambiarla si este producto va en otra.
                </span>
                <select id="categoriaPrincipal" value={categoriaPrincipalId}
                  onChange={(e) => setCategoriaPrincipalId(e.target.value)}
                  required className={selectClasses}>
                  <option value="">Elegí una categoría</option>
                  {todasCategorias.map((c) => <option key={c.id} value={c.id}>{c.nombre}</option>)}
                </select>
              </div>

              {/* ── Subcategoría principal ── */}
              {subcategoriasPrincipal.length > 0 && (
                <div className="mb-4">
                  <label htmlFor="subcategoriaPrincipal" className="block text-sm text-[#0a0a0a]/60 font-light mb-1">
                    Subcategoría
                  </label>
                  <select id="subcategoriaPrincipal" value={subcategoriaPrincipalId}
                    onChange={(e) => { setSubcategoriaPrincipalId(e.target.value); setSubcategoriaPersonalizada(''); }}
                    className={selectClasses}>
                    <option value="">Elegí una subcategoría (opcional)</option>
                    {subcategoriasPrincipal.map((sub) => (
                      <option key={sub.id} value={sub.id}>{sub.nombre}</option>
                    ))}
                  </select>
                </div>
              )}

              {/* ── Campo "Otra" para subcategoría principal ── */}
              {subcategoriaPrincipalEsOtra && (
                <div className="mb-4">
                  <label htmlFor="subcategoriaPersonalizada" className="block text-sm text-[#0a0a0a]/60 font-light mb-1">
                    ¿Cuál? *
                  </label>
                  <input id="subcategoriaPersonalizada" type="text" value={subcategoriaPersonalizada}
                    onChange={(e) => setSubcategoriaPersonalizada(e.target.value)}
                    placeholder="Escribí la subcategoría" className={inputClasses} />
                </div>
              )}

              {/* ── Categoría secundaria ── */}
              <div className="mb-4">
                <label htmlFor="categoriaSecundaria" className="block text-sm text-[#0a0a0a]/60 font-light mb-1">
                  Categoría secundaria <span className="text-[#0a0a0a]/25">(opcional)</span>
                </label>
                <span className="block text-[11px] text-[#0a0a0a]/25 font-light mb-1">
                  Si tu producto encaja en otra categoría además de la principal.
                </span>
                <select id="categoriaSecundaria" value={categoriaSecundariaId}
                  onChange={(e) => setCategoriaSecundariaId(e.target.value)}
                  className={selectClasses}>
                  <option value="">Sin categoría secundaria</option>
                  {categoriasParaSecundaria.map((c) => <option key={c.id} value={c.id}>{c.nombre}</option>)}
                </select>
              </div>

              {/* ── Subcategoría secundaria ── */}
              {subcategoriasSecundaria.length > 0 && (
                <div className="mb-4">
                  <label htmlFor="subcategoriaSecundaria" className="block text-sm text-[#0a0a0a]/60 font-light mb-1">
                    Subcategoría secundaria
                  </label>
                  <select id="subcategoriaSecundaria" value={subcategoriaSecundariaId}
                    onChange={(e) => { setSubcategoriaSecundariaId(e.target.value); setSubcategoriaSecundariaPersonalizada(''); }}
                    className={selectClasses}>
                    <option value="">Elegí una subcategoría (opcional)</option>
                    {subcategoriasSecundaria.map((sub) => (
                      <option key={sub.id} value={sub.id}>{sub.nombre}</option>
                    ))}
                  </select>
                </div>
              )}

              {/* ── Campo "Otra" para subcategoría secundaria ── */}
              {subcategoriaSecundariaEsOtra && (
                <div className="mb-4">
                  <label htmlFor="subcategoriaSecundariaPersonalizada" className="block text-sm text-[#0a0a0a]/60 font-light mb-1">
                    ¿Cuál? *
                  </label>
                  <input id="subcategoriaSecundariaPersonalizada" type="text" value={subcategoriaSecundariaPersonalizada}
                    onChange={(e) => setSubcategoriaSecundariaPersonalizada(e.target.value)}
                    placeholder="Escribí la subcategoría" className={inputClasses} />
                </div>
              )}

              {/* ── Género ── */}
              <div className="mb-4">
                <span className="block text-sm text-[#0a0a0a]/60 font-light mb-1">
                  Género <span className="text-[#0a0a0a]/25">(opcional)</span>
                </span>
                <span className="block text-[11px] text-[#0a0a0a]/25 font-light mb-2">
                  ¿A quién está dirigido este producto? Podés elegir más de uno.
                </span>
                <div className="flex flex-wrap gap-2">
                  {OPCIONES_GENERO.map((op) => {
                    const activo = genero.includes(op.valor);
                    return (
                      <button key={op.valor} type="button" onClick={() => toggleGenero(op.valor)}
                        className={`px-3 py-1.5 rounded-full text-sm transition-all cursor-pointer border ${
                          activo
                            ? 'bg-[#0a0a0a] text-white border-[#0a0a0a]'
                            : 'bg-white text-[#0a0a0a]/60 border-[#0a0a0a]/10 hover:border-[#0a0a0a]/30'
                        }`}>
                        {op.label}
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* ── Sellos ── */}
              <div className="mb-4">
                <span className="block text-sm text-[#0a0a0a]/60 font-light mb-1">
                  Sellos <span className="text-[#0a0a0a]/25">(opcional)</span>
                </span>
                <span className="block text-[11px] text-[#0a0a0a]/25 font-light mb-2">
                  Precargados con los de tu emprendimiento. Podés ajustarlos para este producto.
                </span>
                <div className="flex flex-wrap gap-2">
                  {todosSellos.map((s) => {
                    const activo = sellosSeleccionados.includes(s.id);
                    return (
                      <button key={s.id} type="button" onClick={() => toggleSello(s.id)}
                        className={`px-3 py-1.5 rounded-full text-sm transition-all cursor-pointer border ${
                          activo
                            ? 'bg-[#0a0a0a] text-white border-[#0a0a0a]'
                            : 'bg-white text-[#0a0a0a]/60 border-[#0a0a0a]/10 hover:border-[#0a0a0a]/30'
                        }`}>
                        {s.nombre}
                      </button>
                    );
                  })}
                </div>
              </div>

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
                <label htmlFor="precio_anterior" className="block text-sm text-[#0a0a0a]/60 font-light mb-1">Precio anterior (opcional, si está en oferta)</label>
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
                  <SortableContext items={fotos.map((f) => f.preview)} strategy={horizontalListSortingStrategy}>
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
                  Si tu producto viene en distintas opciones (talles, sabores, tamaños), cargalas acá. Si no, dejá esto en blanco.
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
              <button type="button" onClick={abrirPrevia} disabled={guardandoProducto}
                className="px-5 py-2.5 border border-[#0a0a0a]/10 rounded-full text-sm text-[#0a0a0a]/60 font-light cursor-pointer hover:border-[#0a0a0a]/30 hover:text-[#0a0a0a] transition-all">
                Previsualizar
              </button>
              <button type="button" onClick={guardarProducto} disabled={guardarDeshabilitado}
                className={`px-6 py-2.5 border-none rounded-full text-sm text-white font-medium transition-colors ${
                  guardarDeshabilitado ? 'bg-[#0a0a0a]/30 cursor-not-allowed' : 'bg-[#0a0a0a] cursor-pointer hover:bg-[#1a1a1a]'
                }`}>
                {guardandoProducto ? 'Guardando...' : 'Guardar producto'}
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
              <span className="text-[11px] text-[#0a0a0a]/20 font-light">Todavía no se guardó nada</span>
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
