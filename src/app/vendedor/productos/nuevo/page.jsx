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
  const [fotos, setFotos] = useState([]);
  const [comprimiendo, setComprimiendo] = useState(false);
  const [nombrePropiedad, setNombrePropiedad] = useState('');
  const [valores, setValores] = useState([]);
  const [valorNuevo, setValorNuevo] = useState('');

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  );

  useEffect(() => {
    async function cargarCategoriaVendedor() {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;
      const { data, error } = await supabase
        .from('vendedores')
        .select('categoria_id')
        .eq('usuario_id', user.id)
        .single();
      if (error) {
        console.error('Error cargando categoría del vendedor:', error);
      } else {
        setCategoriaVendedor(data.categoria_id);
      }
    }
    cargarCategoriaVendedor();
  }, []);

  useEffect(() => {
    if (!categoriaVendedor) {
      setSubcategorias([]);
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
    cargarSubcategorias();
  }, [categoriaVendedor]);

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

  function guardarProducto() {
    if (!datos.nombre.trim()) {
      alert('Poné un nombre al producto.');
      return;
    }
    if (!datos.descripcion.trim()) {
      alert('Escribí una descripción.');
      return;
    }
    if (!datos.precio) {
      alert('El precio es obligatorio.');
      return;
    }
    if (fotos.length === 0) {
      alert('Subí al menos una foto.');
      return;
    }
    const tieneNombre = nombrePropiedad.trim() !== '';
    const tieneValores = valores.length > 0;
    if (tieneNombre !== tieneValores) {
      alert('Si cargás variantes, completá el nombre (ej: Talle) y al menos una opción.');
      return;
    }

    const producto = {
      nombre: datos.nombre.trim(),
      descripcion: datos.descripcion.trim(),
      subcategoria_id: datos.subcategoria_id || null,
      marca: datos.marca.trim() || null,
      precio: Number(datos.precio),
      precio_anterior: datos.precio_anterior ? Number(datos.precio_anterior) : null,
      tiempo_preparacion: datos.tiempo_preparacion || null,
      categoria_id: categoriaVendedor,
      tiene_variantes: tieneNombre && tieneValores,
      propiedad_1_nombre: tieneNombre ? nombrePropiedad.trim() : null,
      variantes: tieneValores ? valores : [],
      cantidad_fotos: fotos.length,
    };

    console.log('Producto a guardar:', producto);
    alert('Datos validados correctamente. Mirá la consola (F12) para ver el paquete.');
  }

  return (
    <main style={{ padding: '2rem', maxWidth: '800px', width: '100%', margin: '0 auto' }}>
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

      <button
        type="button"
        onClick={guardarProducto}
        style={{ marginTop: '1.5rem', padding: '0.75rem 1.5rem', fontSize: '1rem', cursor: 'pointer', background: '#222', color: 'white', border: 'none', borderRadius: '8px' }}
      >
        Guardar producto
      </button>
    </main>
  );
}
