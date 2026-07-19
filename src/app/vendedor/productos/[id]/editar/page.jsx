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
import VolverAtras from '@/components/VolverAtras';

// ── Miniatura arrastrable (igual que en nuevo) ──

function SortableFoto({ foto, index, onQuitar }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } =
    useSortable({ id: foto.preview });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    width: '90px', height: '90px', position: 'relative',
    opacity: isDragging ? 0.5 : 1, cursor: 'grab', touchAction: 'none',
  };

  return (
    <div ref={setNodeRef} style={style} {...attributes} {...listeners}>
      <img src={foto.preview} alt={`Foto ${index + 1}`} draggable={false}
        style={{ width: '100%', height: '100%', objectFit: 'cover', borderRadius: '6px', border: '1px solid #ddd' }} />
      {index === 0 && (
        <span style={{ position: 'absolute', bottom: '2px', left: '2px', background: 'rgba(0,0,0,0.7)', color: 'white', fontSize: '0.65rem', padding: '1px 5px', borderRadius: '4px' }}>
          Principal
        </span>
      )}
      <button type="button" onPointerDown={(e) => e.stopPropagation()} onClick={() => onQuitar(index)}
        style={{ position: 'absolute', top: '-8px', right: '-8px', width: '22px', height: '22px', borderRadius: '50%', border: 'none', background: '#e00', color: 'white', cursor: 'pointer', lineHeight: 1 }}>
        ×
      </button>
    </div>
  );
}

// ── Helper: extraer ruta de storage desde URL pública ──

function extraerRutaStorage(url, bucket) {
  const marker = `/${bucket}/`;
  const idx = url.indexOf(marker);
  if (idx === -1) return null;
  return url.substring(idx + marker.length).split('?')[0];
}

// ══════════════════════════════════════════════════════════
// PÁGINA DE EDICIÓN
// ══════════════════════════════════════════════════════════

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

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  );

  // ── Cargar producto existente ──

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
        producto_id: Number(id),
        url,
        tipo: 'foto',
        orden: index,
        es_principal: index === 0,
      }));

      const { error: errMedia } = await supabase.from('producto_media').insert(mediaItems);
      if (errMedia) throw new Error('Producto actualizado pero hubo un error con las fotos: ' + errMedia.message);

      await supabase.from('producto_variantes').delete().eq('producto_id', id);

      if (tieneNombre && tieneValores) {
        const variantesItems = valores.map(valor => ({
          producto_id: Number(id),
          propiedad_1_valor: valor,
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

  // ── Estados de carga y error ──

  if (cargandoPagina) {
    return <main style={{ padding: '2rem', textAlign: 'center' }}><p style={{ color: '#888' }}>Cargando producto...</p></main>;
  }

  if (errorPagina) {
    return (
      <main style={{ padding: '2rem', textAlign: 'center' }}>
        <p style={{ color: '#c00' }}>{errorPagina}</p>
        <button onClick={() => router.push('/vendedor/productos')}
          style={{ marginTop: '1rem', padding: '0.5rem 1rem', cursor: 'pointer' }}>
          Volver a mis productos
        </button>
      </main>
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

  // ══════════════════════════════════════════════════════
  // RENDER
  // ══════════════════════════════════════════════════════

  return (
    <main style={{ padding: '2rem', maxWidth: '800px', width: '100%', margin: '0 auto' }}>

      <VolverAtras href="/vendedor/productos" texto="Volver a Mis productos" />

      <h1>Editar producto</h1>

      <section style={{ marginTop: '2rem', padding: '1.5rem', border: '1px solid #ddd', borderRadius: '8px' }}>
        <h2>Datos básicos</h2>

        <div style={{ marginTop: '1rem' }}>
          <label htmlFor="nombre" style={{ display: 'block', marginBottom: '0.25rem' }}>Nombre del producto *</label>
          <input id="nombre" type="text" value={datos.nombre}
            onChange={(e) => actualizarCampo('nombre', e.target.value)}
            placeholder="Ej: Remera básica de algodón"
            style={{ width: '100%', padding: '0.5rem' }} />
        </div>

        <div style={{ marginTop: '1rem' }}>
          <label htmlFor="descripcion" style={{ display: 'block', marginBottom: '0.25rem' }}>Descripción *</label>
          <textarea id="descripcion" value={datos.descripcion}
            onChange={(e) => actualizarCampo('descripcion', e.target.value)}
            placeholder="Describí el producto: materiales, características, cuidados..."
            rows={4} style={{ width: '100%', padding: '0.5rem' }} />

          {bloqueoModeracion && (
            <div role="alert" style={{ marginTop: '0.75rem', padding: '0.85rem 1rem', background: '#fdecea', border: '1px solid #f5b1aa', borderRadius: '8px', color: '#7a1f17' }}>
              <p style={{ margin: 0, fontWeight: 600, fontSize: '0.92rem' }}>No vas a poder publicar con esto</p>
              <p style={{ margin: '0.35rem 0 0.6rem', fontSize: '0.85rem' }}>
                En Bahía Shops el contacto con el comprador se desbloquea recién después de la compra. Sacá esto de tu publicación:
              </p>
              <ul style={{ margin: 0, paddingLeft: '1.2rem', fontSize: '0.85rem' }}>
                {bloqueoModeracion.bloqueos.map((b, i) => (
                  <li key={i} style={{ marginBottom: '0.2rem' }}>
                    {ETIQUETAS_MODERACION[b.tipo] || b.tipo}
                    {b.tipo !== 'lenguaje_ofensivo' && <span style={{ color: '#a3392f' }}> — "{b.texto}"</span>}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>

        {subcategorias.length > 0 && (
          <div style={{ marginTop: '1rem' }}>
            <label htmlFor="subcategoria" style={{ display: 'block', marginBottom: '0.25rem' }}>Subcategoría</label>
            <select id="subcategoria" value={datos.subcategoria_id}
              onChange={(e) => actualizarCampo('subcategoria_id', e.target.value)}
              style={{ width: '100%', padding: '0.5rem' }}>
              <option value="">Elegí una subcategoría (opcional)</option>
              {subcategorias.map(sub => <option key={sub.id} value={sub.id}>{sub.nombre}</option>)}
            </select>
          </div>
        )}

        <div style={{ marginTop: '1rem' }}>
          <label htmlFor="marca" style={{ display: 'block', marginBottom: '0.25rem' }}>Marca (opcional)</label>
          <input id="marca" type="text" value={datos.marca}
            onChange={(e) => actualizarCampo('marca', e.target.value)}
            placeholder="Si aplica" style={{ width: '100%', padding: '0.5rem' }} />
        </div>

        <div style={{ marginTop: '1rem' }}>
          <label htmlFor="precio" style={{ display: 'block', marginBottom: '0.25rem' }}>Precio *</label>
          <div style={{ position: 'relative' }}>
            <span style={{ position: 'absolute', left: '0.6rem', top: '50%', transform: 'translateY(-50%)', color: '#666' }}>$</span>
            <input id="precio" type="text" inputMode="numeric"
              value={formatearPrecio(datos.precio)}
              onChange={(e) => actualizarCampo('precio', e.target.value.replace(/\D/g, ''))}
              placeholder="15.000" style={{ width: '100%', padding: '0.5rem', paddingLeft: '1.6rem' }} />
          </div>
        </div>

        <div style={{ marginTop: '1rem' }}>
          <label htmlFor="precio_anterior" style={{ display: 'block', marginBottom: '0.25rem' }}>Precio anterior (opcional)</label>
          <div style={{ position: 'relative' }}>
            <span style={{ position: 'absolute', left: '0.6rem', top: '50%', transform: 'translateY(-50%)', color: '#666' }}>$</span>
            <input id="precio_anterior" type="text" inputMode="numeric"
              value={formatearPrecio(datos.precio_anterior)}
              onChange={(e) => actualizarCampo('precio_anterior', e.target.value.replace(/\D/g, ''))}
              placeholder="Si lo completás, se mostrará tachado"
              style={{ width: '100%', padding: '0.5rem', paddingLeft: '1.6rem' }} />
          </div>
        </div>

        <div style={{ marginTop: '1rem' }}>
          <label htmlFor="tiempo_preparacion" style={{ display: 'block', marginBottom: '0.25rem' }}>Tiempo de preparación</label>
          <select id="tiempo_preparacion" value={datos.tiempo_preparacion}
            onChange={(e) => actualizarCampo('tiempo_preparacion', e.target.value)}
            style={{ width: '100%', padding: '0.5rem' }}>
            <option value="">Elegí una opción</option>
            <option value="inmediata">Entrega inmediata (lo tengo hecho, sale ya)</option>
            <option value="durante_el_dia">Durante el día</option>
            <option value="manana">Mañana</option>
            <option value="2_a_4_dias">2 a 4 días</option>
            <option value="1_a_2_semanas">1 a 2 semanas</option>
            <option value="mas_2_semanas">Más de 2 semanas / a coordinar</option>
          </select>
        </div>

        {/* FOTOS */}
        <div style={{ marginTop: '1rem' }}>
          <label style={{ display: 'block', marginBottom: '0.25rem' }}>
            Fotos * (hasta 5, arrastrá para ordenar — la primera es la principal)
          </label>

          <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={alSoltarFoto}>
            <SortableContext items={fotos.map(f => f.preview)} strategy={horizontalListSortingStrategy}>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.75rem', marginBottom: '0.75rem' }}>
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
          <p style={{ fontSize: '0.8rem', color: '#666', marginTop: '0.4rem' }}>
            {comprimiendo ? 'Procesando imágenes...' : `${fotos.length} de 5 fotos`}
          </p>
        </div>

        {/* VARIANTES */}
        <div style={{ marginTop: '1.5rem', paddingTop: '1rem', borderTop: '1px solid #eee' }}>
          <h3 style={{ margin: 0, fontSize: '1rem' }}>Variantes (opcional)</h3>
          <p style={{ fontSize: '0.85rem', color: '#666', marginTop: '0.25rem', marginBottom: '0.75rem' }}>
            Si tu producto viene en distintas opciones (talles, sabores, tamaños), cargalas acá.
          </p>

          <label htmlFor="nombrePropiedad" style={{ display: 'block', marginBottom: '0.25rem' }}>¿Qué varía?</label>
          <input id="nombrePropiedad" type="text" value={nombrePropiedad}
            onChange={(e) => setNombrePropiedad(e.target.value)}
            placeholder="Ej: Talle" style={{ width: '100%', padding: '0.5rem' }} />

          <label style={{ display: 'block', marginTop: '1rem', marginBottom: '0.25rem' }}>
            Opciones {nombrePropiedad && `de ${nombrePropiedad}`}
          </label>
          <div style={{ display: 'flex', gap: '0.5rem' }}>
            <input type="text" value={valorNuevo}
              onChange={(e) => setValorNuevo(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); agregarValor(); } }}
              placeholder="Ej: M (Enter para agregar)"
              style={{ flex: 1, padding: '0.5rem' }} />
            <button type="button" onClick={agregarValor} style={{ padding: '0.5rem 1rem', cursor: 'pointer' }}>
              Agregar
            </button>
          </div>

          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem', marginTop: '0.75rem' }}>
            {valores.map((valor, index) => (
              <span key={valor} style={{ display: 'inline-flex', alignItems: 'center', gap: '0.4rem', background: '#f0f0f0', padding: '0.3rem 0.6rem', borderRadius: '999px', fontSize: '0.9rem' }}>
                {valor}
                <button type="button" onClick={() => quitarValor(index)}
                  style={{ border: 'none', background: 'none', cursor: 'pointer', color: '#888', fontSize: '1rem', lineHeight: 1, padding: 0 }}>
                  ×
                </button>
              </span>
            ))}
          </div>
        </div>
      </section>

      {/* Botones */}
      <div style={{ marginTop: '1.5rem', display: 'flex', gap: '0.75rem', flexWrap: 'wrap' }}>
        <button type="button" onClick={() => router.push('/vendedor/productos')}
          style={{ padding: '0.75rem 1.5rem', fontSize: '1rem', cursor: 'pointer', background: 'white', color: '#888', border: '1px solid #ccc', borderRadius: '8px' }}>
          Cancelar
        </button>
        <button type="button" onClick={abrirPrevia} disabled={guardando}
          style={{ padding: '0.75rem 1.5rem', fontSize: '1rem', cursor: 'pointer', background: 'white', color: '#222', border: '1px solid #222', borderRadius: '8px' }}>
          Previsualizar
        </button>
        <button type="button" onClick={guardarCambios} disabled={guardarDeshabilitado}
          style={{ padding: '0.75rem 1.5rem', fontSize: '1rem', cursor: guardarDeshabilitado ? 'not-allowed' : 'pointer', background: guardarDeshabilitado ? '#999' : '#222', color: 'white', border: 'none', borderRadius: '8px' }}>
          {guardando ? 'Guardando...' : 'Guardar cambios'}
        </button>
      </div>

      {/* MODAL DE PREVISUALIZACIÓN */}
      {mostrarPrevia && (
        <div onClick={() => setMostrarPrevia(false)}
          style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'flex-start', justifyContent: 'center', padding: '2rem 1rem', overflowY: 'auto', zIndex: 1000 }}>
          <div onClick={(e) => e.stopPropagation()}
            style={{ background: 'white', borderRadius: '12px', maxWidth: '760px', width: '100%', margin: 'auto', overflow: 'hidden' }}>
            <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', padding: '1rem 1.5rem', borderBottom: '1px solid #eee' }}>
              <div>
                <p style={{ fontWeight: 600, margin: 0 }}>Previsualización</p>
                <p style={{ fontSize: '0.85rem', color: '#666', margin: '2px 0 0' }}>Así lo va a ver el comprador</p>
              </div>
              <button type="button" onClick={() => setMostrarPrevia(false)} aria-label="Cerrar"
                style={{ width: '32px', height: '32px', border: '1px solid #ddd', borderRadius: '8px', background: 'white', cursor: 'pointer', fontSize: '1.2rem', lineHeight: 1 }}>
                ×
              </button>
            </div>
            <div style={{ padding: '1.5rem' }}>
              <VistaProducto producto={productoParaPrevia} fotos={fotosParaPrevia}
                variantes={variantesParaPrevia} vendedor={vendedorParaPrevia}
                categoria={categoria} modoPrevia />
            </div>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '1rem', padding: '1rem 1.5rem', borderTop: '1px solid #eee', background: '#fafafa' }}>
              <span style={{ fontSize: '0.8rem', color: '#888' }}>Los cambios no se guardaron todavía</span>
              <button type="button" onClick={() => setMostrarPrevia(false)}
                style={{ padding: '0.5rem 1rem', border: '1px solid #ccc', borderRadius: '8px', background: 'white', cursor: 'pointer' }}>
                Cerrar y seguir editando
              </button>
            </div>
          </div>
        </div>
      )}
    </main>
  );
}
