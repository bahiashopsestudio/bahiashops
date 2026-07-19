'use client';

import { useState, useEffect } from 'react';
import { createClient } from '@/lib/supabase/client';
import imageCompression from 'browser-image-compression';
import {
  DndContext,
  closestCenter,
  PointerSensor,
  KeyboardSensor,
  useSensor,
  useSensors,
} from '@dnd-kit/core';
import {
  SortableContext,
  arrayMove,
  horizontalListSortingStrategy,
  useSortable,
  sortableKeyboardCoordinates,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { useRouter } from 'next/navigation';
import VistaProducto from '@/components/VistaProducto';
import { revisarPublicacion, ETIQUETAS_MODERACION } from '@/lib/moderacion';
import VolverAtras from '@/components/VolverAtras';

// Una miniatura arrastrable
function SortableFoto({ foto, index, onQuitar }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } =
    useSortable({ id: foto.preview });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    width: '90px',
    height: '90px',
    position: 'relative',
    opacity: isDragging ? 0.5 : 1,
    cursor: 'grab',
    touchAction: 'none',
  };

  return (
    <div ref={setNodeRef} style={style} {...attributes} {...listeners}>
      <img
        src={foto.preview}
        alt={`Foto ${index + 1}`}
        draggable={false}
        style={{ width: '100%', height: '100%', objectFit: 'cover', borderRadius: '6px', border: '1px solid #ddd' }}
      />
      {index === 0 && (
        <span style={{ position: 'absolute', bottom: '2px', left: '2px', background: 'rgba(0,0,0,0.7)', color: 'white', fontSize: '0.65rem', padding: '1px 5px', borderRadius: '4px' }}>
          Principal
        </span>
      )}
      <button
        type="button"
        onPointerDown={(e) => e.stopPropagation()}
        onClick={() => onQuitar(index)}
        style={{ position: 'absolute', top: '-8px', right: '-8px', width: '22px', height: '22px', borderRadius: '50%', border: 'none', background: '#e00', color: 'white', cursor: 'pointer', lineHeight: 1 }}
      >
        ×
      </button>
    </div>
  );
}

export default function NuevoProductoPage() {
  const supabase = createClient();
  const router = useRouter();

  const [datos, setDatos] = useState({
    nombre: '',
    descripcion: '',
    subcategoria_id: '',
    marca: '',
    precio: '',
    precio_anterior: '',
    tiempo_preparacion: '',
  });

  const [subcategorias, setSubcategorias] = useState([]);
  const [categoriaVendedor, setCategoriaVendedor] = useState(null);
  const [categoria, setCategoria] = useState(null);
  const [nombreNegocio, setNombreNegocio] = useState('');
  const [vendedorId, setVendedorId] = useState(null);
  const [fotos, setFotos] = useState([]);
  const [comprimiendo, setComprimiendo] = useState(false);
  const [nombrePropiedad, setNombrePropiedad] = useState('');
  const [valores, setValores] = useState([]);
  const [valorNuevo, setValorNuevo] = useState('');
  const [guardandoProducto, setGuardandoProducto] = useState(false);
  const [mostrarPrevia, setMostrarPrevia] = useState(false);
  const [bloqueoModeracion, setBloqueoModeracion] = useState(null);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  );

  useEffect(() => {
    async function cargarVendedor() {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;
      const { data, error } = await supabase
        .from('vendedores')
        .select('id, categoria_id, nombre_negocio')
        .eq('usuario_id', user.id)
        .single();
      if (error) {
        console.error('Error cargando el vendedor:', error);
      } else {
        setVendedorId(data.id);
        setCategoriaVendedor(data.categoria_id);
        setNombreNegocio(data.nombre_negocio || '');
      }
    }
    cargarVendedor();
  }, []);

  useEffect(() => {
    if (!categoriaVendedor) {
      setSubcategorias([]);
      setCategoria(null);
      return;
    }
    async function cargarSubcategorias() {
      const { data, error } = await supabase
        .from('subcategorias')
        .select('id, nombre')
        .eq('categoria_id', categoriaVendedor)
        .eq('activa', true)
        .order('orden');
      if (error) {
        console.error('Error cargando subcategorías:', error);
      } else {
        setSubcategorias(data);
      }
    }
    async function cargarCategoria() {
      const { data } = await supabase
        .from('categorias')
        .select('nombre, slug')
        .eq('id', categoriaVendedor)
        .single();
      if (data) setCategoria(data);
    }
    cargarSubcategorias();
    cargarCategoria();
  }, [categoriaVendedor]);

  useEffect(() => {
    const id = setTimeout(() => {
      const texto = `${datos.nombre} ${datos.descripcion} ${datos.marca}`;
      const resultado = revisarPublicacion(texto);
      setBloqueoModeracion(resultado.nivel === 'bloqueo' ? resultado : null);
    }, 1000);
    return () => clearTimeout(id);
  }, [datos.nombre, datos.descripcion, datos.marca]);

  useEffect(() => {
    if (!mostrarPrevia) return;
    function alPresionarTecla(e) {
      if (e.key === 'Escape') setMostrarPrevia(false);
    }
    document.addEventListener('keydown', alPresionarTecla);
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', alPresionarTecla);
      document.body.style.overflow = '';
    };
  }, [mostrarPrevia]);

  function actualizarCampo(campo, valor) {
    setDatos({ ...datos, [campo]: valor });
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
      } catch (err) {
        console.error('Error comprimiendo imagen:', err);
      }
    }
    setFotos((prev) => [...prev, ...nuevas]);
    setComprimiendo(false);
    e.target.value = '';
  }

  function quitarFoto(index) {
    setFotos((prev) => {
      URL.revokeObjectURL(prev[index].preview);
      return prev.filter((_, i) => i !== index);
    });
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
    if (!limpio) return;
    if (valores.some((v) => v.toLowerCase() === limpio.toLowerCase())) {
      setValorNuevo('');
      return;
    }
    setValores((prev) => [...prev, limpio]);
    setValorNuevo('');
  }

  function quitarValor(index) {
    setValores((prev) => prev.filter((_, i) => i !== index));
  }

  function abrirPrevia() {
    if (!datos.nombre.trim()) {
      alert('Cargá al menos el nombre del producto para previsualizar.');
      return;
    }
    if (fotos.length === 0) {
      alert('Subí al menos una foto para previsualizar.');
      return;
    }
    setMostrarPrevia(true);
  }

  async function guardarProducto() {
    if (!datos.nombre.trim()) { alert('Poné un nombre al producto.'); return; }
    if (!datos.descripcion.trim()) { alert('Escribí una descripción.'); return; }
    if (!datos.precio) { alert('El precio es obligatorio.'); return; }
    if (fotos.length === 0) { alert('Subí al menos una foto.'); return; }
    if (!vendedorId) { alert('No se pudo identificar tu cuenta de vendedor. Recargá la página.'); return; }

    const tieneNombre = nombrePropiedad.trim() !== '';
    const tieneValores = valores.length > 0;
    if (tieneNombre !== tieneValores) {
      alert('Si cargás variantes, completá el nombre (ej: Talle) y al menos una opción.');
      return;
    }
    if (datos.precio_anterior && Number(datos.precio_anterior) <= Number(datos.precio)) {
      alert('El precio anterior tiene que ser mayor al precio actual (es el precio "de antes").');
      return;
    }

    const textoARevisar = `${datos.nombre} ${datos.descripcion} ${datos.marca}`;
    const moderacion = revisarPublicacion(textoARevisar);
    if (moderacion.nivel === 'bloqueo') {
      setBloqueoModeracion(moderacion);
      return;
    }

    setGuardandoProducto(true);

    try {
      const urls = [];
      for (let i = 0; i < fotos.length; i++) {
        const foto = fotos[i];
        const nombreArchivo = `${vendedorId}/${Date.now()}-${i}.webp`;
        const { error: errorUpload } = await supabase
          .storage
          .from('productos')
          .upload(nombreArchivo, foto.file);

        if (errorUpload) {
          throw new Error('Error al subir una foto: ' + errorUpload.message);
        }

        const { data: dataUrl } = supabase
          .storage
          .from('productos')
          .getPublicUrl(nombreArchivo);

        urls.push(dataUrl.publicUrl);
      }

      const { data: productoCreado, error: errorProducto } = await supabase
        .from('productos')
        .insert({
          vendedor_id: vendedorId,
          categoria_id: categoriaVendedor,
          subcategoria_id: datos.subcategoria_id ? Number(datos.subcategoria_id) : null,
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

      if (errorProducto) {
        throw new Error('Error al guardar el producto: ' + errorProducto.message);
      }

      const productoId = productoCreado.id;

      const mediaItems = urls.map((url, index) => ({
        producto_id: productoId,
        url: url,
        tipo: 'foto',
        orden: index,
        es_principal: index === 0,
      }));

      const { error: errorMedia } = await supabase
        .from('producto_media')
        .insert(mediaItems);

      if (errorMedia) {
        throw new Error('El producto se guardó pero hubo un error con las fotos: ' + errorMedia.message);
      }

      if (tieneNombre && tieneValores) {
        const variantesItems = valores.map((valor) => ({
          producto_id: productoId,
          propiedad_1_valor: valor,
        }));

        const { error: errorVariantes } = await supabase
          .from('producto_variantes')
          .insert(variantesItems);

        if (errorVariantes) {
          throw new Error('El producto se guardó pero hubo un error con las variantes: ' + errorVariantes.message);
        }
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

  const guardarDeshabilitado = guardandoProducto || bloqueoModeracion !== null;

  const productoParaPrevia = {
    nombre: datos.nombre,
    descripcion: datos.descripcion,
    precio: datos.precio,
    precio_anterior: datos.precio_anterior,
    marca: datos.marca,
    propiedad_1_nombre: nombrePropiedad.trim() || null,
    tiempo_preparacion: datos.tiempo_preparacion || null,
  };
  const fotosParaPrevia = fotos.map((f) => ({ url: f.preview }));
  const variantesParaPrevia = valores.map((v) => ({ propiedad_1_valor: v }));
  const vendedorParaPrevia = nombreNegocio ? { nombre_negocio: nombreNegocio } : null;

  return (
    <main style={{ padding: '2rem', maxWidth: '800px', width: '100%', margin: '0 auto' }}>

      <VolverAtras href="/vendedor/productos" texto="Volver a Mis productos" />

      <h1>Nuevo producto</h1>

      <section style={{ marginTop: '2rem', padding: '1.5rem', border: '1px solid #ddd', borderRadius: '8px' }}>
        <h2>Datos básicos</h2>

        <div style={{ marginTop: '1rem' }}>
          <label htmlFor="nombre" style={{ display: 'block', marginBottom: '0.25rem' }}>
            Nombre del producto *
          </label>
          <input
            id="nombre"
            type="text"
            value={datos.nombre}
            onChange={(e) => actualizarCampo('nombre', e.target.value)}
            placeholder="Ej: Remera básica de algodón"
            style={{ width: '100%', padding: '0.5rem' }}
          />
        </div>

        <div style={{ marginTop: '1rem' }}>
          <label htmlFor="descripcion" style={{ display: 'block', marginBottom: '0.25rem' }}>
            Descripción *
          </label>
          <textarea
            id="descripcion"
            value={datos.descripcion}
            onChange={(e) => actualizarCampo('descripcion', e.target.value)}
            placeholder="Describí el producto: materiales, características, cuidados..."
            rows={4}
            style={{ width: '100%', padding: '0.5rem' }}
          />

          {bloqueoModeracion && (
            <div
              role="alert"
              style={{ marginTop: '0.75rem', padding: '0.85rem 1rem', background: '#fdecea', border: '1px solid #f5b1aa', borderRadius: '8px', color: '#7a1f17' }}
            >
              <p style={{ margin: 0, fontWeight: 600, fontSize: '0.92rem' }}>No vas a poder publicar con esto</p>
              <p style={{ margin: '0.35rem 0 0.6rem', fontSize: '0.85rem' }}>
                En Bahía Shops el contacto con el comprador se desbloquea recién después de la compra.
                Sacá esto de tu publicación:
              </p>
              <ul style={{ margin: 0, paddingLeft: '1.2rem', fontSize: '0.85rem' }}>
                {bloqueoModeracion.bloqueos.map((b, i) => (
                  <li key={i} style={{ marginBottom: '0.2rem' }}>
                    {ETIQUETAS_MODERACION[b.tipo] || b.tipo}
                    {b.tipo !== 'lenguaje_ofensivo' && (
                      <span style={{ color: '#a3392f' }}> — "{b.texto}"</span>
                    )}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>

        {subcategorias.length > 0 && (
          <div style={{ marginTop: '1rem' }}>
            <label htmlFor="subcategoria" style={{ display: 'block', marginBottom: '0.25rem' }}>
              Subcategoría
            </label>
            <select
              id="subcategoria"
              value={datos.subcategoria_id}
              onChange={(e) => actualizarCampo('subcategoria_id', e.target.value)}
              style={{ width: '100%', padding: '0.5rem' }}
            >
              <option value="">Elegí una subcategoría (opcional)</option>
              {subcategorias.map((sub) => (
                <option key={sub.id} value={sub.id}>
                  {sub.nombre}
                </option>
              ))}
            </select>
          </div>
        )}

        <div style={{ marginTop: '1rem' }}>
          <label htmlFor="marca" style={{ display: 'block', marginBottom: '0.25rem' }}>
            Marca (opcional)
          </label>
          <input
            id="marca"
            type="text"
            value={datos.marca}
            onChange={(e) => actualizarCampo('marca', e.target.value)}
            placeholder="Si aplica"
            style={{ width: '100%', padding: '0.5rem' }}
          />
        </div>

        <div style={{ marginTop: '1rem' }}>
          <label htmlFor="precio" style={{ display: 'block', marginBottom: '0.25rem' }}>
            Precio *
          </label>
          <div style={{ position: 'relative' }}>
            <span style={{ position: 'absolute', left: '0.6rem', top: '50%', transform: 'translateY(-50%)', color: '#666' }}>
              $
            </span>
            <input
              id="precio"
              type="text"
              inputMode="numeric"
              value={formatearPrecio(datos.precio)}
              onChange={(e) => actualizarCampo('precio', e.target.value.replace(/\D/g, ''))}
              placeholder="15.000"
              style={{ width: '100%', padding: '0.5rem', paddingLeft: '1.6rem' }}
            />
          </div>
        </div>

        <div style={{ marginTop: '1rem' }}>
          <label htmlFor="precio_anterior" style={{ display: 'block', marginBottom: '0.25rem' }}>
            Precio anterior (opcional, si está en oferta)
          </label>
          <div style={{ position: 'relative' }}>
            <span style={{ position: 'absolute', left: '0.6rem', top: '50%', transform: 'translateY(-50%)', color: '#666' }}>
              $
            </span>
            <input
              id="precio_anterior"
              type="text"
              inputMode="numeric"
              value={formatearPrecio(datos.precio_anterior)}
              onChange={(e) => actualizarCampo('precio_anterior', e.target.value.replace(/\D/g, ''))}
              placeholder="Si lo completás, se mostrará tachado"
              style={{ width: '100%', padding: '0.5rem', paddingLeft: '1.6rem' }}
            />
          </div>
        </div>

        <div style={{ marginTop: '1rem' }}>
          <label htmlFor="tiempo_preparacion" style={{ display: 'block', marginBottom: '0.25rem' }}>
            Tiempo de preparación
          </label>
          <select
            id="tiempo_preparacion"
            value={datos.tiempo_preparacion}
            onChange={(e) => actualizarCampo('tiempo_preparacion', e.target.value)}
            style={{ width: '100%', padding: '0.5rem' }}
          >
            <option value="">Elegí una opción</option>
            <option value="inmediata">Entrega inmediata (lo tengo hecho, sale ya)</option>
            <option value="durante_el_dia">Durante el día</option>
            <option value="manana">Mañana</option>
            <option value="2_a_4_dias">2 a 4 días</option>
            <option value="1_a_2_semanas">1 a 2 semanas</option>
            <option value="mas_2_semanas">Más de 2 semanas / a coordinar</option>
          </select>
        </div>

        <div style={{ marginTop: '1rem' }}>
          <label style={{ display: 'block', marginBottom: '0.25rem' }}>
            Fotos * (hasta 5, arrastrá para ordenar — la primera es la principal)
          </label>

          <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={alSoltarFoto}>
            <SortableContext items={fotos.map((f) => f.preview)} strategy={horizontalListSortingStrategy}>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.75rem', marginBottom: '0.75rem' }}>
                {fotos.map((foto, index) => (
                  <SortableFoto key={foto.preview} foto={foto} index={index} onQuitar={quitarFoto} />
                ))}
              </div>
            </SortableContext>
          </DndContext>

          {fotos.length < 5 && (
            <input
              type="file"
              accept="image/jpeg,image/png,image/webp"
              multiple
              onChange={agregarFotos}
              disabled={comprimiendo}
            />
          )}
          <p style={{ fontSize: '0.8rem', color: '#666', marginTop: '0.4rem' }}>
            {comprimiendo ? 'Procesando imágenes...' : `${fotos.length} de 5 fotos`}
          </p>
        </div>

        {/* VARIANTES (opcional) */}
        <div style={{ marginTop: '1.5rem', paddingTop: '1rem', borderTop: '1px solid #eee' }}>
          <h3 style={{ margin: 0, fontSize: '1rem' }}>Variantes (opcional)</h3>
          <p style={{ fontSize: '0.85rem', color: '#666', marginTop: '0.25rem', marginBottom: '0.75rem' }}>
            Si tu producto viene en distintas opciones (talles, sabores, tamaños), cargalas acá. Si no, dejá esto en blanco.
          </p>

          <label htmlFor="nombrePropiedad" style={{ display: 'block', marginBottom: '0.25rem' }}>
            ¿Qué varía?
          </label>
          <input
            id="nombrePropiedad"
            type="text"
            value={nombrePropiedad}
            onChange={(e) => setNombrePropiedad(e.target.value)}
            placeholder="Ej: Talle"
            style={{ width: '100%', padding: '0.5rem' }}
          />

          <label style={{ display: 'block', marginTop: '1rem', marginBottom: '0.25rem' }}>
            Opciones {nombrePropiedad && `de ${nombrePropiedad}`}
          </label>
          <div style={{ display: 'flex', gap: '0.5rem' }}>
            <input
              type="text"
              value={valorNuevo}
              onChange={(e) => setValorNuevo(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault();
                  agregarValor();
                }
              }}
              placeholder="Ej: M (Enter para agregar)"
              style={{ flex: 1, padding: '0.5rem' }}
            />
            <button
              type="button"
              onClick={agregarValor}
              style={{ padding: '0.5rem 1rem', cursor: 'pointer' }}
            >
              Agregar
            </button>
          </div>

          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem', marginTop: '0.75rem' }}>
            {valores.map((valor, index) => (
              <span
                key={valor}
                style={{ display: 'inline-flex', alignItems: 'center', gap: '0.4rem', background: '#f0f0f0', padding: '0.3rem 0.6rem', borderRadius: '999px', fontSize: '0.9rem' }}
              >
                {valor}
                <button
                  type="button"
                  onClick={() => quitarValor(index)}
                  style={{ border: 'none', background: 'none', cursor: 'pointer', color: '#888', fontSize: '1rem', lineHeight: 1, padding: 0 }}
                >
                  ×
                </button>
              </span>
            ))}
          </div>
        </div>
      </section>

      {/* Botones: previsualizar y guardar */}
      <div style={{ marginTop: '1.5rem', display: 'flex', gap: '0.75rem', flexWrap: 'wrap' }}>
        <button
          type="button"
          onClick={abrirPrevia}
          disabled={guardandoProducto}
          style={{ padding: '0.75rem 1.5rem', fontSize: '1rem', cursor: 'pointer', background: 'white', color: '#222', border: '1px solid #222', borderRadius: '8px' }}
        >
          Previsualizar
        </button>
        <button
          type="button"
          onClick={guardarProducto}
          disabled={guardarDeshabilitado}
          style={{ padding: '0.75rem 1.5rem', fontSize: '1rem', cursor: guardarDeshabilitado ? 'not-allowed' : 'pointer', background: guardarDeshabilitado ? '#999' : '#222', color: 'white', border: 'none', borderRadius: '8px' }}
        >
          {guardandoProducto ? 'Guardando...' : 'Guardar producto'}
        </button>
      </div>

      {/* MODAL DE PREVISUALIZACIÓN */}
      {mostrarPrevia && (
        <div
          onClick={() => setMostrarPrevia(false)}
          style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'flex-start', justifyContent: 'center', padding: '2rem 1rem', overflowY: 'auto', zIndex: 1000 }}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            style={{ background: 'white', borderRadius: '12px', maxWidth: '760px', width: '100%', margin: 'auto', overflow: 'hidden' }}
          >
            <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', padding: '1rem 1.5rem', borderBottom: '1px solid #eee' }}>
              <div>
                <p style={{ fontWeight: 600, margin: 0 }}>Previsualización</p>
                <p style={{ fontSize: '0.85rem', color: '#666', margin: '2px 0 0' }}>Así lo va a ver el comprador</p>
              </div>
              <button
                type="button"
                onClick={() => setMostrarPrevia(false)}
                aria-label="Cerrar"
                style={{ width: '32px', height: '32px', border: '1px solid #ddd', borderRadius: '8px', background: 'white', cursor: 'pointer', fontSize: '1.2rem', lineHeight: 1 }}
              >
                ×
              </button>
            </div>

            <div style={{ padding: '1.5rem' }}>
              <VistaProducto
                producto={productoParaPrevia}
                fotos={fotosParaPrevia}
                variantes={variantesParaPrevia}
                vendedor={vendedorParaPrevia}
                categoria={categoria}
                modoPrevia
              />
            </div>

            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '1rem', padding: '1rem 1.5rem', borderTop: '1px solid #eee', background: '#fafafa' }}>
              <span style={{ fontSize: '0.8rem', color: '#888' }}>Todavía no se guardó nada</span>
              <button
                type="button"
                onClick={() => setMostrarPrevia(false)}
                style={{ padding: '0.5rem 1rem', border: '1px solid #ccc', borderRadius: '8px', background: 'white', cursor: 'pointer' }}
              >
                Cerrar y seguir editando
              </button>
            </div>
          </div>
        </div>
      )}
    </main>
  );
}
